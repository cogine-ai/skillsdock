import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const APP_NAME = 'skillsdock';
const APP_VERSION = '0.2.0';

const HOME = os.homedir();
const APP_DIR = path.join(HOME, '.skillsdock');
const DEFAULT_CONFIG_PATH = path.join(APP_DIR, 'config.json');
const DEFAULT_REGISTRY_PATH = path.join(APP_DIR, 'registry.json');

const CORE_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENT_REGISTRY_PATH = path.join(CORE_DIR, 'agent-registry.json');
const AGENT_REGISTRY = loadAgentRegistry();
const UNIVERSAL_CANONICAL_DIR = '.agents/skills';
const USER_CANONICAL_SKILLS_PATH = `~/${UNIVERSAL_CANONICAL_DIR}`;
const PROJECT_CANONICAL_SKILLS_PATH = `\${projectRoot}/${UNIVERSAL_CANONICAL_DIR}`;

const VALID_SCOPE_SET = new Set(['user', 'project']);
const VALID_FORMAT_SET = new Set(['skill-md', 'mdc', 'openclaw-md', 'opencode-md']);
const VALID_SYNC_MODE_SET = new Set(['symlink', 'copy']);
const VALID_FALLBACK_SET = new Set(['copy', 'fail']);
const VALID_TAG_SET = new Set(['regular', 'disabled', 'frozen', 'deleted']);

const TAG_PRIORITY = {
  frozen: 4,
  regular: 3,
  disabled: 2,
  deleted: 1
};

const MANIFEST_LIMITS = {
  maxFiles: 200,
  maxTotalBytes: 2 * 1024 * 1024
};

const DEFAULT_SCAN = {
  maxDepth: 8,
  ignoreDirs: ['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache']
};

const SKILL_DISCOVERY_PRIORITY_DIRS = [
  'skills',
  'skills/.curated',
  'skills/.experimental',
  'skills/.system',
  '.agent/skills',
  '.agents/skills',
  '.augment/skills',
  '.claude/skills',
  '.cline/skills',
  '.codebuddy/skills',
  '.codex/skills',
  '.commandcode/skills',
  '.continue/skills',
  '.cortex/skills',
  '.crush/skills',
  '.factory/skills',
  '.goose/skills',
  '.iflow/skills',
  '.junie/skills',
  '.kilocode/skills',
  '.kiro/skills',
  '.kode/skills',
  '.mcpjam/skills',
  '.mux/skills',
  '.neovate/skills',
  '.opencode/skills',
  '.openhands/skills',
  '.pi/skills',
  '.pochi/skills',
  '.qoder/skills',
  '.qwen/skills',
  '.roo/skills',
  '.trae/skills',
  '.vibe/skills',
  '.windsurf/skills',
  '.zencoder/skills',
  '.adal/skills'
];

const SKILL_NAME_SPEC_REGEX = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

const DEFAULT_REGISTRY = {
  version: 2,
  lastScanAt: null,
  updatedAt: null,
  items: {},
  index: {
    byCanonicalPath: {},
    byLegacyKey: {}
  },
  cleanupHistory: []
};

const EXTERNAL_SKILL_LOCK_FILE = '.skill-lock.json';
const EXTERNAL_SKILL_LOCK_VERSION = 3;

function makeCliError(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

function loadAgentRegistry() {
  try {
    const raw = fsSync.readFileSync(AGENT_REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.agents)) {
      throw new Error('agent-registry.json must contain an agents array');
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to load agent registry at ${AGENT_REGISTRY_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function findAgentRegistryEntry(agentId) {
  return AGENT_REGISTRY.agents.find((entry) => entry.id === agentId) || null;
}

function isUniversalAgent(agentId) {
  return findAgentRegistryEntry(agentId)?.installFamily === 'universal';
}

function isSkillMdFormat(format, filePath = '') {
  return normalizeTargetFormat(format, filePath) === 'skill-md';
}

function getCanonicalSkillsPathTemplate(scope) {
  return scope === 'project' ? PROJECT_CANONICAL_SKILLS_PATH : USER_CANONICAL_SKILLS_PATH;
}

function getCanonicalSkillAgentAliases(scope) {
  return AGENT_REGISTRY.agents
    .filter((agent) => agent.installFamily === 'universal')
    .filter((agent) => agent.canonicalDir === UNIVERSAL_CANONICAL_DIR)
    .filter((agent) => agent.scopes?.[scope])
    .filter((agent) =>
      isSkillMdFormat(
        agent.scopes?.[scope]?.source?.format || agent.scopes?.[scope]?.target?.format,
        agent.scopes?.[scope]?.source?.path || agent.scopes?.[scope]?.target?.path || ''
      )
    )
    .map((agent) => ({
      name: `${agent.id}-${scope}`,
      agent: agent.id,
      scope
    }));
}

function makeCanonicalSourceEntry(scope) {
  return {
    name: `agents-${scope}`,
    agent: null,
    scope,
    path: getCanonicalSkillsPathTemplate(scope),
    format: 'skill-md',
    optional: true,
    sourceAliases: uniqueSourceAliases([
      {
        name: `agents-${scope}`,
        agent: null,
        scope
      },
      ...getCanonicalSkillAgentAliases(scope)
    ])
  };
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const raw = token.slice(2);
      const eq = raw.indexOf('=');
      if (eq >= 0) {
        flags[raw.slice(0, eq)] = raw.slice(eq + 1);
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[raw] = next;
        i += 1;
      } else {
        flags[raw] = true;
      }
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      const chars = token.slice(1).split('');
      for (const c of chars) flags[c] = true;
      continue;
    }
    positional.push(token);
  }

  return { flags, positional };
}

function toIso(dateLike) {
  const value = new Date(dateLike);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function slugify(input) {
  const raw = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
  return raw || 'skill';
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizePath(inputPath) {
  return path.resolve(expandHomePath(String(inputPath || '')));
}

function makeCanonicalKey(canonicalPath) {
  return `path:${canonicalPath}`;
}

function extractLegacyPathFromKey(key) {
  const raw = String(key || '');
  const index = raw.indexOf(':');
  if (index < 0 || index === raw.length - 1) return null;
  return raw.slice(index + 1);
}

function hasTag(item, tag) {
  return String(item?.policy?.tag || 'regular') === tag;
}

function isDeleted(item) {
  return hasTag(item, 'deleted');
}

function isFrozen(item) {
  return hasTag(item, 'frozen');
}

function shouldIncludeByTag(item, flags = {}) {
  if (flags.all) return true;
  return !isDeleted(item);
}

function isSyncEligible(item) {
  const tag = String(item?.policy?.tag || 'regular');
  return tag === 'regular' || tag === 'frozen';
}

function shouldInstallInternalSkills() {
  const envValue = String(process.env.INSTALL_INTERNAL_SKILLS || '').toLowerCase();
  return envValue === '1' || envValue === 'true';
}

function isInternalSkillMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  const meta = metadata.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return meta.internal === true;
}

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ''));
}

function buildSkillTemplate(skillName) {
  const normalizedName = slugify(skillName);
  return `---
name: ${yamlQuote(normalizedName)}
description: ${yamlQuote(`Describe what ${normalizedName} does and when to use it.`)}
---

# ${normalizedName}

## Description

Describe the skill's purpose, inputs, and expected outcome.

## When To Use

Use this skill when:

- the task clearly matches this skill's specialty
- you need a repeatable workflow instead of ad-hoc instructions

## Instructions

1. State the goal this skill is helping with.
2. Follow the workflow or guardrails this skill defines.
3. Return the result in the format this skill expects.
`;
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function expandHomePath(inputPath, homeDir = HOME) {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return homeDir;
  if (inputPath.startsWith('~/')) return path.join(homeDir, inputPath.slice(2));
  return inputPath;
}

function detectProjectRoot(cwd = process.cwd()) {
  const probe = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8'
  });
  if (probe.status === 0) {
    const root = probe.stdout.trim();
    if (root.length > 0) return root;
  }
  return cwd;
}

function resolveTemplatePath(inputPath, options = {}) {
  const projectRoot = options.projectRoot || detectProjectRoot(process.cwd());
  const homeDir = options.homeDir || HOME;

  if (!inputPath) return inputPath;

  const withTemplate = String(inputPath).replaceAll('${projectRoot}', projectRoot);
  const expanded = expandHomePath(withTemplate, homeDir);

  return path.resolve(expanded);
}

function parseFrontmatter(raw) {
  const content = String(raw || '').replace(/\r\n/g, '\n');
  const hasFrontmatter = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/.test(content);
  try {
    const parsed = matter(content);
    return {
      metadata: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
      body: String(parsed.content || '').trim(),
      hasFrontmatter
    };
  } catch {
    return { metadata: {}, body: content.trim(), hasFrontmatter: false };
  }
}

function inferNameFromPath(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'skill.md') return path.basename(path.dirname(filePath));
  return path.basename(filePath, path.extname(filePath));
}

function firstBodyLine(body) {
  const lines = String(body || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const withoutHeading = line.replace(/^#+\s*/, '').trim();
    if (withoutHeading.length > 0) return withoutHeading;
  }
  return '';
}

function normalizeBody(body) {
  const text = String(body || '').replace(/\r\n/g, '\n').trim();
  return text;
}

function inferSourceFormatFromPath(inputPath = '') {
  const lower = String(inputPath).toLowerCase();
  if (lower.endsWith('.mdc') || lower.includes('/rules')) return 'mdc';
  if (lower.includes('openclaw')) return 'openclaw-md';
  if (lower.includes('opencode')) return 'opencode-md';
  return 'skill-md';
}

function inferTargetFormatFromPath(inputPath = '') {
  return inferSourceFormatFromPath(inputPath);
}

function normalizeSourceFormat(format, sourcePath) {
  const chosen = String(format || '').trim();
  if (VALID_FORMAT_SET.has(chosen)) return chosen;
  return inferSourceFormatFromPath(sourcePath);
}

function normalizeTargetFormat(format, targetPath) {
  const chosen = String(format || '').trim();
  if (VALID_FORMAT_SET.has(chosen)) return chosen;
  return inferTargetFormatFromPath(targetPath);
}

function isSkillFileNameForFormat(name, format) {
  const lower = String(name || '').toLowerCase();
  if (format === 'skill-md') {
    return lower === 'skill.md' || lower.endsWith('.skill');
  }
  if (format === 'mdc') {
    return lower.endsWith('.mdc');
  }
  if (format === 'openclaw-md' || format === 'opencode-md') {
    return lower.endsWith('.md');
  }
  return false;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function tryGetGitMetadata(filePath) {
  const dir = path.dirname(filePath);
  const rootProbe = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8'
  });
  if (rootProbe.status !== 0) return null;

  const root = rootProbe.stdout.trim();
  if (!root) return null;
  const rel = path.relative(root, filePath);

  const first = spawnSync(
    'git',
    ['-C', root, 'log', '--diff-filter=A', '--follow', '--format=%aI', '--', rel],
    { encoding: 'utf8' }
  );
  const last = spawnSync('git', ['-C', root, 'log', '-1', '--format=%aI', '--', rel], {
    encoding: 'utf8'
  });

  const createdLines = (first.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const updatedRaw = (last.stdout || '').trim();

  if (createdLines.length === 0 && !updatedRaw) return null;
  return {
    createdAt: createdLines.length > 0 ? createdLines[createdLines.length - 1] : null,
    updatedAt: updatedRaw || null,
    originRepo: root
  };
}

function isContainedIn(targetPath, basePath) {
  const normalizedBase = path.normalize(path.resolve(basePath));
  const normalizedTarget = path.normalize(path.resolve(targetPath));
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
}

function isValidRelativePluginPath(input) {
  return typeof input === 'string' && input.startsWith('./');
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pushUniqueWarning(warnings, message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function normalizePluginName(value) {
  const pluginName = String(value || '').trim();
  return pluginName.length > 0 ? pluginName : null;
}

function normalizeOptionalString(value) {
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

function normalizeExternalSkillMetadata(input) {
  const data = input && typeof input === 'object' ? input : {};
  return {
    externalSource: normalizeOptionalString(data.externalSource),
    externalSourceType: normalizeOptionalString(data.externalSourceType),
    externalSourceUrl: normalizeOptionalString(data.externalSourceUrl),
    externalSkillPath: normalizeOptionalString(data.externalSkillPath),
    externalHash: normalizeOptionalString(data.externalHash),
    externalPluginName: normalizePluginName(data.externalPluginName),
    externalInstalledAt: normalizeIsoOrNull(data.externalInstalledAt),
    externalUpdatedAt: normalizeIsoOrNull(data.externalUpdatedAt)
  };
}

function getExternalSkillInstallDir(homeDir = HOME) {
  return path.resolve(expandHomePath('~/.agents/skills', homeDir));
}

function getExternalSkillLockPath(homeDir = HOME) {
  const xdgStateHome = normalizeOptionalString(process.env.XDG_STATE_HOME);
  if (xdgStateHome) {
    return path.resolve(expandHomePath(path.join(xdgStateHome, 'skills', EXTERNAL_SKILL_LOCK_FILE), homeDir));
  }
  return path.resolve(path.join(expandHomePath('~/.agents', homeDir), EXTERNAL_SKILL_LOCK_FILE));
}

function mapExternalSkillLockEntry(skillName, entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    skillName: String(skillName || '').trim(),
    source: normalizeOptionalString(entry.source),
    sourceType: normalizeOptionalString(entry.sourceType),
    sourceUrl: normalizeOptionalString(entry.sourceUrl),
    skillPath: normalizeOptionalString(entry.skillPath),
    skillFolderHash: normalizeOptionalString(entry.skillFolderHash),
    installedAt: normalizeIsoOrNull(entry.installedAt),
    updatedAt: normalizeIsoOrNull(entry.updatedAt),
    pluginName: normalizePluginName(entry.pluginName)
  };
}

async function readExternalSkillLock(homeDir = HOME) {
  const lockPath = getExternalSkillLockPath(homeDir);
  const state = {
    path: lockPath,
    exists: false,
    healthy: true,
    version: null,
    count: 0,
    issues: [],
    entriesByName: new Map(),
    entriesByPath: new Map()
  };

  if (!(await pathExists(lockPath))) {
    return state;
  }

  state.exists = true;

  let parsed;
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    state.healthy = false;
    state.issues.push(
      `External lockfile is unreadable: ${lockPath} (${error instanceof Error ? error.message : String(error)})`
    );
    return state;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    state.healthy = false;
    state.issues.push(`External lockfile must be a JSON object: ${lockPath}`);
    return state;
  }

  state.version = Number.isInteger(parsed.version) ? parsed.version : null;
  if (state.version === null) {
    state.healthy = false;
    state.issues.push(`External lockfile is missing numeric version metadata: ${lockPath}`);
  } else if (state.version < EXTERNAL_SKILL_LOCK_VERSION) {
    state.healthy = false;
    state.issues.push(
      `External lockfile version ${state.version} is older than supported version ${EXTERNAL_SKILL_LOCK_VERSION}: ${lockPath}`
    );
  }

  const skills =
    parsed.skills && typeof parsed.skills === 'object' && !Array.isArray(parsed.skills) ? parsed.skills : null;
  if (!skills) {
    state.healthy = false;
    state.issues.push(`External lockfile is missing a skills map: ${lockPath}`);
    return state;
  }

  const installDir = getExternalSkillInstallDir(homeDir);
  for (const [skillName, entry] of Object.entries(skills)) {
    const normalizedEntry = mapExternalSkillLockEntry(skillName, entry);
    if (!normalizedEntry?.skillName) continue;
    state.entriesByName.set(normalizedEntry.skillName, normalizedEntry);
    state.entriesByPath.set(path.join(installDir, normalizedEntry.skillName, 'SKILL.md'), normalizedEntry);
  }
  state.count = state.entriesByName.size;
  return state;
}

function resolveExternalSkillMetadataForFile(filePath, skillId, lockState, homeDir = HOME) {
  if (!lockState || !lockState.healthy) return normalizeExternalSkillMetadata(null);

  const normalizedFilePath = path.resolve(filePath);
  const installDir = getExternalSkillInstallDir(homeDir);
  if (!isContainedIn(normalizedFilePath, installDir)) {
    return normalizeExternalSkillMetadata(null);
  }

  const folderName = path.basename(path.dirname(normalizedFilePath));
  const matchedEntry =
    lockState.entriesByPath.get(normalizedFilePath) ||
    lockState.entriesByName.get(String(skillId || '').trim()) ||
    lockState.entriesByName.get(folderName);

  if (!matchedEntry) return normalizeExternalSkillMetadata(null);

  return normalizeExternalSkillMetadata({
    externalSource: matchedEntry.source,
    externalSourceType: matchedEntry.sourceType,
    externalSourceUrl: matchedEntry.sourceUrl,
    externalSkillPath: matchedEntry.skillPath,
    externalHash: matchedEntry.skillFolderHash,
    externalPluginName: matchedEntry.pluginName,
    externalInstalledAt: matchedEntry.installedAt,
    externalUpdatedAt: matchedEntry.updatedAt
  });
}

async function getPluginSkillSearchResult(basePath) {
  const normalizedBasePath = path.resolve(basePath);
  const dirs = [];
  const seen = new Set();
  const warnings = [];
  const ownerships = [];
  const ownershipSeen = new Set();

  const pushDir = (candidate, label, pluginName = null) => {
    const resolved = path.resolve(candidate);
    if (!isContainedIn(resolved, normalizedBasePath)) {
      pushUniqueWarning(
        warnings,
        `Plugin manifest path escaped source root (${label}): ${resolved} is outside ${normalizedBasePath}`
      );
      return;
    }
    if (seen.has(resolved)) return;
    seen.add(resolved);
    dirs.push(resolved);
    const normalizedPluginName = normalizePluginName(pluginName);
    if (!normalizedPluginName) return;
    const ownershipKey = `${resolved}::${normalizedPluginName}`;
    if (ownershipSeen.has(ownershipKey)) return;
    ownershipSeen.add(ownershipKey);
    ownerships.push({
      dir: resolved,
      pluginName: normalizedPluginName
    });
  };

  const addPluginSkillDirs = (pluginBase, skills = [], label, pluginName = null) => {
    const resolvedPluginBase = path.resolve(pluginBase);
    if (!isContainedIn(resolvedPluginBase, normalizedBasePath)) {
      pushUniqueWarning(
        warnings,
        `Plugin base escaped source root (${label}): ${resolvedPluginBase} is outside ${normalizedBasePath}`
      );
      return;
    }

    if (Array.isArray(skills)) {
      for (const skillPath of skills) {
        if (!isValidRelativePluginPath(skillPath)) {
          pushUniqueWarning(
            warnings,
            `Plugin skill path must start with "./" (${label}): ${String(skillPath)}`
          );
          continue;
        }
        pushDir(path.dirname(path.join(resolvedPluginBase, skillPath)), `${label} skill path`, pluginName);
      }
    }

    pushDir(path.join(resolvedPluginBase, 'skills'), `${label} default skills dir`, pluginName);
  };

  const marketplacePath = path.join(normalizedBasePath, '.claude-plugin', 'marketplace.json');
  const marketplace = await readJsonIfExists(marketplacePath);
  if (marketplace && typeof marketplace === 'object' && !Array.isArray(marketplace)) {
    let pluginRoot = '';
    if (typeof marketplace.metadata?.pluginRoot === 'string') {
      if (isValidRelativePluginPath(marketplace.metadata.pluginRoot)) {
        pluginRoot = marketplace.metadata.pluginRoot;
      } else {
        pushUniqueWarning(
          warnings,
          `Invalid pluginRoot in marketplace.json: ${marketplace.metadata.pluginRoot} (must start with "./")`
        );
      }
    }
    const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
    for (const [index, plugin] of plugins.entries()) {
      if (!plugin || typeof plugin !== 'object') continue;
      const label = `marketplace plugin #${index + 1}`;

      if (plugin.source && typeof plugin.source !== 'string') {
        pushUniqueWarning(
          warnings,
          `${label} uses non-local source and was ignored (only local string source is supported)`
        );
        continue;
      }
      if (typeof plugin.source === 'string' && !isValidRelativePluginPath(plugin.source)) {
        pushUniqueWarning(
          warnings,
          `${label} source must start with "./": ${plugin.source}`
        );
        continue;
      }

      const pluginBase = path.join(normalizedBasePath, pluginRoot, plugin.source || '');
      const pluginName =
        normalizePluginName(plugin.name) ||
        normalizePluginName(plugin.id) ||
        normalizePluginName(path.basename(pluginBase));
      const skillPaths = Array.isArray(plugin.skills) ? plugin.skills : [];
      addPluginSkillDirs(pluginBase, skillPaths, label, pluginName);
    }
  } else if (marketplace !== null) {
    pushUniqueWarning(warnings, `Invalid marketplace.json format: expected JSON object`);
  }

  const pluginPath = path.join(normalizedBasePath, '.claude-plugin', 'plugin.json');
  const pluginManifest = await readJsonIfExists(pluginPath);
  if (pluginManifest && typeof pluginManifest === 'object' && !Array.isArray(pluginManifest)) {
    const skillPaths = Array.isArray(pluginManifest.skills) ? pluginManifest.skills : [];
    const pluginName =
      normalizePluginName(pluginManifest.name) ||
      normalizePluginName(pluginManifest.metadata?.name) ||
      normalizePluginName(path.basename(normalizedBasePath));
    addPluginSkillDirs(normalizedBasePath, skillPaths, 'plugin.json', pluginName);
  } else if (pluginManifest !== null) {
    pushUniqueWarning(warnings, `Invalid plugin.json format: expected JSON object`);
  }

  return {
    dirs,
    warnings,
    ownerships
  };
}

async function getPluginSkillSearchDirs(basePath) {
  const result = await getPluginSkillSearchResult(basePath);
  return result.dirs;
}

function resolvePluginNameForFile(filePath, ownerships = []) {
  const resolvedFilePath = path.resolve(filePath);
  const matches = ownerships
    .filter((entry) => entry && typeof entry === 'object')
    .filter((entry) => normalizePluginName(entry.pluginName))
    .filter((entry) => typeof entry.dir === 'string' && isContainedIn(resolvedFilePath, path.resolve(entry.dir)))
    .sort((left, right) => {
      if (right.dir.length !== left.dir.length) return right.dir.length - left.dir.length;
      return String(left.pluginName).localeCompare(String(right.pluginName));
    });

  return matches.length > 0 ? normalizePluginName(matches[0].pluginName) : null;
}

async function collectPrioritySkillMdFiles(rootPath) {
  const files = [];
  const seen = new Set();

  const addSkillFile = async (skillPath) => {
    const resolved = path.resolve(skillPath);
    if (seen.has(resolved)) return;
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) return;
      seen.add(resolved);
      files.push(resolved);
    } catch {}
  };

  await addSkillFile(path.join(rootPath, 'SKILL.md'));

  const priorityDirs = [rootPath, ...SKILL_DISCOVERY_PRIORITY_DIRS.map((dir) => path.join(rootPath, dir))];
  const pluginSkillDirs = await getPluginSkillSearchDirs(rootPath);
  priorityDirs.push(...pluginSkillDirs);

  for (const dir of priorityDirs) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await addSkillFile(path.join(dir, entry.name, 'SKILL.md'));
    }
  }

  return files;
}

async function collectSkillFiles(rootPath, format, maxDepth, ignoreDirs) {
  const fullRoot = path.resolve(rootPath);
  const ignoreSet = new Set(ignoreDirs || []);
  const files = [];

  async function walk(currentPath, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (ignoreSet.has(entry.name)) continue;
        await walk(fullPath, depth + 1);
        continue;
      }
      if (entry.isFile() && isSkillFileNameForFormat(entry.name, format)) {
        files.push(fullPath);
      }
    }
  }

  if (!(await pathExists(fullRoot))) return [];
  const stat = await fs.stat(fullRoot);
  if (stat.isFile()) {
    return isSkillFileNameForFormat(path.basename(fullRoot), format) ? [fullRoot] : [];
  }

  if (format === 'skill-md') {
    const priorityFiles = await collectPrioritySkillMdFiles(fullRoot);
    files.push(...priorityFiles);
  }

  await walk(fullRoot, 0);

  const unique = [];
  const seen = new Set();
  for (const filePath of files) {
    const resolved = path.resolve(filePath);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    unique.push(resolved);
  }
  return unique;
}

async function extractSkillMarkdownFromPackage(filePath) {
  const buffer = await fs.readFile(filePath);
  const jszipModule = await import('jszip');
  const JSZip = jszipModule.default;
  const zip = await JSZip.loadAsync(buffer);

  let skillEntry = zip.file('SKILL.md');
  if (!skillEntry) {
    const allEntries = Object.keys(zip.files);
    const match = allEntries.find((name) => name.toLowerCase().endsWith('/skill.md'));
    if (match) skillEntry = zip.file(match);
  }

  if (!skillEntry) {
    throw new Error(`No SKILL.md found inside package: ${filePath}`);
  }

  return skillEntry.async('string');
}

async function getSkillPackageManifest(filePath) {
  const parseWarnings = [];
  const buffer = await fs.readFile(filePath);
  const jszipModule = await import('jszip');
  const JSZip = jszipModule.default;
  const zip = await JSZip.loadAsync(buffer);

  const entries = Object.entries(zip.files)
    .filter(([, value]) => !value.dir)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));

  const fileHashes = {};
  const includedFiles = [];
  let totalBytes = 0;
  let truncated = false;
  let skillMarkdown = null;

  for (const name of entries) {
    if (includedFiles.length >= MANIFEST_LIMITS.maxFiles) {
      truncated = true;
      break;
    }
    const zipEntry = zip.file(name);
    if (!zipEntry) continue;
    const contentBuffer = await zipEntry.async('nodebuffer');
    totalBytes += contentBuffer.byteLength;
    if (totalBytes > MANIFEST_LIMITS.maxTotalBytes) {
      truncated = true;
      break;
    }
    includedFiles.push(name);
    fileHashes[name] = sha256Buffer(contentBuffer);

    if (!skillMarkdown && name.toLowerCase().endsWith('skill.md')) {
      skillMarkdown = contentBuffer.toString('utf8');
    }
  }

  if (!skillMarkdown) {
    throw new Error(`No SKILL.md found inside package: ${filePath}`);
  }
  if (truncated) {
    parseWarnings.push(
      `Manifest truncated at maxFiles=${MANIFEST_LIMITS.maxFiles} maxTotalBytes=${MANIFEST_LIMITS.maxTotalBytes}`
    );
  }

  const manifestHash = sha256(
    Object.entries(fileHashes)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([relPath, hash]) => `${relPath}:${hash}`)
      .join('\n')
  );

  return {
    raw: skillMarkdown,
    manifest: {
      entryFile: 'SKILL.md',
      rootDir: filePath,
      includedFiles,
      fileHashes,
      manifestHash,
      parseWarnings
    }
  };
}

async function buildDirectoryManifest(rootDir, entryPath, ignoreDirs = []) {
  const parseWarnings = [];
  const ignoreSet = new Set([...(ignoreDirs || []), '.git']);
  const fileHashes = {};
  const includedFiles = [];
  let totalBytes = 0;
  let truncated = false;

  async function walk(currentPath) {
    if (truncated) return;
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (truncated) return;
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (ignoreSet.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      if (includedFiles.length >= MANIFEST_LIMITS.maxFiles) {
        truncated = true;
        return;
      }

      const buffer = await fs.readFile(fullPath);
      totalBytes += buffer.byteLength;
      if (totalBytes > MANIFEST_LIMITS.maxTotalBytes) {
        truncated = true;
        return;
      }

      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      includedFiles.push(relativePath);
      fileHashes[relativePath] = sha256Buffer(buffer);
    }
  }

  await walk(rootDir);

  if (truncated) {
    parseWarnings.push(
      `Manifest truncated at maxFiles=${MANIFEST_LIMITS.maxFiles} maxTotalBytes=${MANIFEST_LIMITS.maxTotalBytes}`
    );
  }

  const manifestHash = sha256(
    Object.entries(fileHashes)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([relPath, hash]) => `${relPath}:${hash}`)
      .join('\n')
  );

  return {
    entryFile: path.basename(entryPath),
    rootDir,
    includedFiles,
    fileHashes,
    manifestHash,
    parseWarnings
  };
}

async function buildStructureManifest(filePath, sourceFormat, ignoreDirs = []) {
  const resolvedPath = path.resolve(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  if (sourceFormat === 'skill-md' && ext === '.skill') {
    const pkg = await getSkillPackageManifest(resolvedPath);
    return pkg.manifest;
  }

  if (sourceFormat === 'mdc') {
    const buffer = await fs.readFile(resolvedPath);
    const hash = sha256Buffer(buffer);
    return {
      entryFile: path.basename(resolvedPath),
      rootDir: path.dirname(resolvedPath),
      includedFiles: [path.basename(resolvedPath)],
      fileHashes: { [path.basename(resolvedPath)]: hash },
      manifestHash: hash,
      parseWarnings: []
    };
  }

  const rootDir = path.dirname(resolvedPath);
  const manifest = await buildDirectoryManifest(rootDir, resolvedPath, ignoreDirs);
  if (sourceFormat === 'openclaw-md' || sourceFormat === 'opencode-md' || sourceFormat === 'skill-md') {
    if (manifest.entryFile.toLowerCase() !== 'skill.md') {
      manifest.parseWarnings.push(
        `Entry file is ${manifest.entryFile}; expected SKILL.md for ${sourceFormat}`
      );
    }
  }
  return manifest;
}

function parseContentForFormat(format, raw, filePath) {
  const sourceFormat = normalizeSourceFormat(format, filePath);

  if (sourceFormat === 'skill-md') {
    const { metadata, body, hasFrontmatter } = parseFrontmatter(raw);
    const name = metadata?.name;
    const description = metadata?.description;
    if (!hasFrontmatter) {
      throw new Error(`Invalid SKILL.md at ${filePath}: missing YAML frontmatter`);
    }
    if (
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      name.trim().length === 0 ||
      description.trim().length === 0
    ) {
      throw new Error(
        `Invalid SKILL.md at ${filePath}: frontmatter must include string "name" and "description"`
      );
    }
    const normalized = {
      name: name.trim(),
      description: description.trim(),
      body: normalizeBody(body)
    };
    return { metadata, normalized };
  }

  if (sourceFormat === 'mdc' || sourceFormat === 'openclaw-md' || sourceFormat === 'opencode-md') {
    const { metadata, body } = parseFrontmatter(raw);
    const name =
      typeof metadata?.name === 'string' && metadata.name.trim().length > 0
        ? metadata.name.trim()
        : inferNameFromPath(filePath);
    const description =
      typeof metadata?.description === 'string' && metadata.description.trim().length > 0
        ? metadata.description.trim()
        : firstBodyLine(body || raw);
    const normalized = {
      name,
      description,
      body: normalizeBody(body || raw)
    };
    return { metadata, normalized };
  }

  throw new Error(`Unsupported source format: ${sourceFormat}`);
}

function renderSkillMarkdown(normalized) {
  const body = normalizeBody(normalized.body) || `# ${normalized.name}`;
  const description = normalized.description || firstBodyLine(body) || normalized.name;

  return [
    '---',
    `name: ${yamlQuote(normalized.name)}`,
    `description: ${yamlQuote(description)}`,
    '---',
    '',
    body
  ].join('\n').concat('\n');
}

function renderMarkdownBody(normalized) {
  const body = normalizeBody(normalized.body) || `# ${normalized.name}`;
  return `${body}\n`;
}

function convertContentToFormat(item, targetFormat) {
  const sourceFormat = normalizeSourceFormat(item.sourceFormat || item.format, item.sourcePath);
  const normalizedTargetFormat = normalizeTargetFormat(targetFormat, '');
  const sourceIsPackage = path.extname(item.sourcePath).toLowerCase() === '.skill';

  const requiresConversion = sourceFormat !== normalizedTargetFormat || sourceIsPackage;

  if (!requiresConversion) {
    return {
      content: item.content,
      requiresConversion: false,
      reason: 'same-format'
    };
  }

  if (normalizedTargetFormat === 'skill-md') {
    return {
      content: renderSkillMarkdown(item.normalized),
      requiresConversion: true,
      reason: sourceIsPackage ? 'skill-package' : 'format-conversion'
    };
  }

  if (
    normalizedTargetFormat === 'mdc' ||
    normalizedTargetFormat === 'openclaw-md' ||
    normalizedTargetFormat === 'opencode-md'
  ) {
    return {
      content: renderMarkdownBody(item.normalized),
      requiresConversion: true,
      reason: sourceIsPackage ? 'skill-package' : 'format-conversion'
    };
  }

  throw new Error(`Unsupported target format: ${normalizedTargetFormat}`);
}

function planSyncWriteMode({ requestedMode, fallbackMode, requiresConversion }) {
  const mode = VALID_SYNC_MODE_SET.has(requestedMode) ? requestedMode : 'symlink';
  const fallback = VALID_FALLBACK_SET.has(fallbackMode) ? fallbackMode : 'copy';

  if (mode === 'copy') {
    return {
      requestedMode: mode,
      effectiveMode: 'copy',
      fallbackMode: fallback,
      fallbackUsed: false,
      reason: requiresConversion ? 'conversion' : 'copy-requested'
    };
  }

  if (requiresConversion) {
    return {
      requestedMode: mode,
      effectiveMode: 'copy',
      fallbackMode: fallback,
      fallbackUsed: true,
      reason: 'conversion'
    };
  }

  return {
    requestedMode: mode,
    effectiveMode: 'symlink',
    fallbackMode: fallback,
    fallbackUsed: false,
    reason: 'symlink'
  };
}

function makeSourceEntry(agent, scope, sourceConfig) {
  return {
    name: `${agent.id}-${scope}`,
    agent: agent.id,
    scope,
    path: sourceConfig.path,
    format: sourceConfig.format,
    optional: Boolean(sourceConfig.optional)
  };
}

function makeTargetEntry(agent, scope, targetConfig) {
  return {
    name: `${agent.id}-${scope}`,
    agent: agent.id,
    scope,
    path: targetConfig.path,
    format: targetConfig.format,
    layout: targetConfig.layout || 'nested',
    filename: targetConfig.filename,
    extension: targetConfig.extension
  };
}

function addSourceGroup(sourceGroups, source) {
  const sourceGroupKey = `${source.path}::${source.format}`;
  const existingSource = sourceGroups.get(sourceGroupKey);
  if (existingSource) {
    existingSource.sourceAliases = uniqueSourceAliases([
      ...(existingSource.sourceAliases || []),
      ...(source.sourceAliases || []),
      {
        name: source.name,
        agent: source.agent,
        scope: source.scope
      }
    ]);
    return;
  }

  sourceGroups.set(sourceGroupKey, {
    ...source,
    sourceAliases: uniqueSourceAliases([
      ...(source.sourceAliases || []),
      {
        name: source.name,
        agent: source.agent,
        scope: source.scope
      }
    ])
  });
}

function getDetectInstalledPaths(scopeConfig) {
  const detectInstalled = scopeConfig?.detectInstalled;
  if (!detectInstalled || typeof detectInstalled !== 'object') return [];
  if (!Array.isArray(detectInstalled.paths)) return [];
  return detectInstalled.paths.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

async function detectScopeInstalled(scopeConfig, options = {}) {
  const projectRoot = options.projectRoot || detectProjectRoot(process.cwd());
  const homeDir = options.homeDir || HOME;
  const pathExistsFn = options.pathExists || fsSync.existsSync;
  const detectInstalled = scopeConfig?.detectInstalled;
  const detectPaths = getDetectInstalledPaths(scopeConfig);

  if (detectPaths.length === 0) return 'n/a';

  const resolvedPaths = detectPaths.map((entry) =>
    resolveTemplatePath(entry, {
      projectRoot,
      homeDir
    })
  );

  const mode = detectInstalled?.mode === 'all' ? 'all' : 'any';
  const resolvedResults = await Promise.all(
    resolvedPaths.map((entry) => Promise.resolve(pathExistsFn(entry)).then(Boolean))
  );
  const found = mode === 'all' ? resolvedResults.every(Boolean) : resolvedResults.some(Boolean);
  return found ? 'yes' : 'no';
}

function buildDefaultConfig(projectRoot = detectProjectRoot(process.cwd())) {
  const sourceGroups = new Map();
  const targets = {};

  for (const scope of ['user', 'project']) {
    addSourceGroup(sourceGroups, makeCanonicalSourceEntry(scope));
  }

  for (const agent of AGENT_REGISTRY.agents) {
    for (const scope of ['user', 'project']) {
      const scopeConfig = agent.scopes?.[scope];
      if (!scopeConfig) continue;

      const source = makeSourceEntry(agent, scope, scopeConfig.source);
      const target = makeTargetEntry(agent, scope, scopeConfig.target);
      addSourceGroup(sourceGroups, source);
      targets[target.name] = target;
    }
  }

  return {
    version: 2,
    meta: {
      projectRoot
    },
    sources: Array.from(sourceGroups.values()),
    targets,
    scan: {
      maxDepth: DEFAULT_SCAN.maxDepth,
      ignoreDirs: [...DEFAULT_SCAN.ignoreDirs]
    }
  };
}

function normalizeConfigV2(input, projectRoot = detectProjectRoot(process.cwd())) {
  const cfg = input && typeof input === 'object' ? input : {};
  const defaults = buildDefaultConfig(projectRoot);

  const existingSources = Array.isArray(cfg.sources)
    ? cfg.sources.filter((entry) => entry && typeof entry === 'object' && typeof entry.path === 'string')
    : [];
  const legacySourceMap = {
    codex: 'codex-user',
    claude: 'claude-user',
    cursor: 'cursor-user'
  };
  const migratedSources = [];
  const migratedSourceNames = new Set();
  for (const entry of existingSources) {
    const currentName = entry.name;
    const mappedName = legacySourceMap[currentName] || currentName;
    if (mappedName && migratedSourceNames.has(mappedName)) {
      continue;
    }
    if (mappedName && mappedName !== currentName) {
      migratedSources.push({
        ...entry,
        name: mappedName,
        agent: entry.agent || mappedName.replace(/-(user|project)$/, ''),
        scope: entry.scope || 'user'
      });
      migratedSourceNames.add(mappedName);
      continue;
    }
    migratedSources.push(entry);
    if (mappedName) migratedSourceNames.add(mappedName);
  }

  const mergedSources = [...migratedSources];
  const sourceNames = new Set(migratedSources.map((entry) => entry.name).filter(Boolean));

  for (const entry of defaults.sources) {
    if (!sourceNames.has(entry.name)) {
      mergedSources.push(entry);
    }
  }

  const normalizedSources = mergedSources.map((entry, index) => {
    const name = entry.name || `source-${index + 1}`;
    const scope = VALID_SCOPE_SET.has(entry.scope) ? entry.scope : undefined;
    const format = normalizeSourceFormat(entry.format, entry.path);
    return {
      ...entry,
      name,
      agent: entry.agent || name.replace(/-(user|project)$/, ''),
      scope,
      format,
      optional: Boolean(entry.optional)
    };
  });

  const existingTargets =
    cfg.targets && typeof cfg.targets === 'object' && !Array.isArray(cfg.targets) ? cfg.targets : {};
  const legacyTargetMap = {
    codex: 'codex-user',
    claude: 'claude-user',
    cursor: 'cursor-user'
  };
  const migratedTargets = { ...existingTargets };
  for (const [legacyKey, modernKey] of Object.entries(legacyTargetMap)) {
    if (legacyKey in migratedTargets && !(modernKey in migratedTargets)) {
      const value = migratedTargets[legacyKey];
      migratedTargets[modernKey] = {
        ...value,
        name: modernKey,
        agent: value?.agent || modernKey.replace(/-(user|project)$/, ''),
        scope: value?.scope || 'user'
      };
      delete migratedTargets[legacyKey];
    }
  }

  const mergedTargets = { ...migratedTargets };

  for (const [key, entry] of Object.entries(defaults.targets)) {
    if (!(key in mergedTargets)) {
      mergedTargets[key] = entry;
    }
  }

  const normalizedTargets = {};
  for (const [key, value] of Object.entries(mergedTargets)) {
    if (!value || typeof value !== 'object') continue;
    const format = normalizeTargetFormat(value.format, value.path || key);
    const scope = VALID_SCOPE_SET.has(value.scope) ? value.scope : undefined;
    normalizedTargets[key] = {
      ...value,
      name: value.name || key,
      agent: value.agent || key.replace(/-(user|project)$/, ''),
      scope,
      path: value.path,
      layout: value.layout || 'nested',
      filename: value.filename || (value.layout === 'flat' ? undefined : 'SKILL.md'),
      extension: value.extension || (value.layout === 'flat' ? '.md' : undefined),
      format
    };
  }

  const scanCfg = cfg.scan && typeof cfg.scan === 'object' ? cfg.scan : {};

  return {
    version: 2,
    meta: {
      ...(cfg.meta && typeof cfg.meta === 'object' ? cfg.meta : {}),
      projectRoot
    },
    sources: normalizedSources,
    targets: normalizedTargets,
    scan: {
      maxDepth: Number.isInteger(scanCfg.maxDepth) ? scanCfg.maxDepth : DEFAULT_SCAN.maxDepth,
      ignoreDirs: Array.isArray(scanCfg.ignoreDirs) ? scanCfg.ignoreDirs : DEFAULT_SCAN.ignoreDirs
    }
  };
}

function normalizeIsoOrNull(value) {
  return toIso(value) || null;
}

function normalizePolicy(inputPolicy, now = null) {
  const policy = inputPolicy && typeof inputPolicy === 'object' ? inputPolicy : {};
  const tag = VALID_TAG_SET.has(policy.tag) ? policy.tag : 'regular';
  return {
    tag,
    reason: String(policy.reason || ''),
    updatedAt: normalizeIsoOrNull(policy.updatedAt) || now
  };
}

function normalizeStructureManifest(manifest, canonicalPath, fileHash = null) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      entryFile: path.basename(canonicalPath),
      rootDir: path.dirname(canonicalPath),
      includedFiles: [path.basename(canonicalPath)],
      fileHashes: fileHash ? { [path.basename(canonicalPath)]: fileHash } : {},
      manifestHash: fileHash || null,
      parseWarnings: []
    };
  }

  const includedFiles = Array.isArray(manifest.includedFiles)
    ? manifest.includedFiles.filter((entry) => typeof entry === 'string')
    : [path.basename(canonicalPath)];

  const fileHashes =
    manifest.fileHashes && typeof manifest.fileHashes === 'object' && !Array.isArray(manifest.fileHashes)
      ? manifest.fileHashes
      : {};

  return {
    entryFile: String(manifest.entryFile || path.basename(canonicalPath)),
    rootDir: String(manifest.rootDir || path.dirname(canonicalPath)),
    includedFiles,
    fileHashes,
    manifestHash: String(manifest.manifestHash || manifest.hash || fileHash || ''),
    parseWarnings: Array.isArray(manifest.parseWarnings)
      ? manifest.parseWarnings.map((entry) => String(entry))
      : []
  };
}

function isCanonicalSkillPath(candidatePath, options = {}) {
  if (!candidatePath) return false;
  let currentPath = path.resolve(candidatePath);

  while (true) {
    const parentPath = path.dirname(currentPath);
    if (path.basename(currentPath) === 'skills' && path.basename(parentPath) === '.agents') {
      return true;
    }
    if (parentPath === currentPath) {
      return false;
    }
    currentPath = parentPath;
  }
}

function pickPreferredCanonicalPath(candidates, options = {}) {
  const unique = Array.from(
    new Set(
      candidates
        .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => path.resolve(entry))
    )
  );

  if (unique.length === 0) return null;

  unique.sort((left, right) => {
    const leftCanonical = isCanonicalSkillPath(left, options);
    const rightCanonical = isCanonicalSkillPath(right, options);
    if (leftCanonical !== rightCanonical) {
      return leftCanonical ? -1 : 1;
    }
    if (left.length !== right.length) {
      return left.length - right.length;
    }
    return left.localeCompare(right);
  });

  return unique[0];
}

function toTimestampForSort(value) {
  const iso = toIso(value);
  if (!iso) return 0;
  return Date.parse(iso) || 0;
}

function mergeNonEmptyStrings(primary, fallback) {
  const p = String(primary || '').trim();
  if (p.length > 0) return p;
  return String(fallback || '');
}

function normalizeSourceAlias(input) {
  if (!input || typeof input !== 'object') return null;
  const name = String(input.name || '').trim();
  if (!name) return null;
  const agent = String(input.agent || '').trim() || null;
  const scope = VALID_SCOPE_SET.has(input.scope) ? input.scope : null;
  return { name, agent, scope };
}

function uniqueSourceAliases(entries = []) {
  const aliases = [];
  const seen = new Set();

  for (const entry of entries) {
    const alias = normalizeSourceAlias(entry);
    if (!alias) continue;
    const key = `${alias.name}::${alias.agent || ''}::${alias.scope || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }

  return aliases;
}

function getItemSourceAliases(item) {
  if (!item || typeof item !== 'object') return [];
  const aliases = Array.isArray(item.sourceAliases) ? uniqueSourceAliases(item.sourceAliases) : [];
  if (aliases.length > 0) return aliases;
  return uniqueSourceAliases([
    {
      name: item.sourceName,
      agent: item.sourceAgent,
      scope: item.sourceScope
    }
  ]);
}

function getPrimarySourceAlias(item, fallback = null) {
  const aliases = getItemSourceAliases(item);
  if (aliases.length > 0) return aliases[0];
  return normalizeSourceAlias(fallback);
}

function setItemSourceAliases(item, aliases, fallback = null) {
  const normalizedAliases = uniqueSourceAliases(aliases);
  const primaryAlias = normalizedAliases[0] || normalizeSourceAlias(fallback);
  return {
    ...item,
    sourceAliases: normalizedAliases,
    sourceName: primaryAlias?.name || null,
    sourceAgent: primaryAlias?.agent || null,
    sourceScope: primaryAlias?.scope || null
  };
}

function itemMatchesSourceName(item, sourceName) {
  return getItemSourceAliases(item).some((alias) => alias.name === sourceName);
}

function itemMatchesSourceScope(item, sourceScope) {
  return getItemSourceAliases(item).some((alias) => alias.scope === sourceScope);
}

function mergeRegistryItems(existing, incoming) {
  if (!existing) return incoming;
  const existingTs = Math.max(
    toTimestampForSort(existing.updatedAt),
    toTimestampForSort(existing.lastSeenAt),
    toTimestampForSort(existing.changedAt)
  );
  const incomingTs = Math.max(
    toTimestampForSort(incoming.updatedAt),
    toTimestampForSort(incoming.lastSeenAt),
    toTimestampForSort(incoming.changedAt)
  );

  const latest = incomingTs >= existingTs ? incoming : existing;
  const older = latest === incoming ? existing : incoming;

  const merged = {
    ...older,
    ...latest
  };

  merged.legacyKeys = Array.from(new Set([...(existing.legacyKeys || []), ...(incoming.legacyKeys || [])]));
  const mergedAliases = uniqueSourceAliases([...getItemSourceAliases(existing), ...getItemSourceAliases(incoming)]);
  merged.policy = normalizePolicy(
    {
      ...(older.policy || {}),
      ...(latest.policy || {})
    },
    latest.policy?.updatedAt || older.policy?.updatedAt || null
  );
  merged.normalized = {
    name: mergeNonEmptyStrings(latest.normalized?.name, older.normalized?.name),
    description: mergeNonEmptyStrings(latest.normalized?.description, older.normalized?.description),
    body: mergeNonEmptyStrings(latest.normalized?.body, older.normalized?.body)
  };
  merged.name = mergeNonEmptyStrings(latest.name, older.name || merged.normalized.name);
  merged.description = mergeNonEmptyStrings(latest.description, older.description || merged.normalized.description);
  merged.content = mergeNonEmptyStrings(latest.content, older.content);
  merged.hash = mergeNonEmptyStrings(latest.hash, older.hash);
  merged.manifestHash = mergeNonEmptyStrings(latest.manifestHash, older.manifestHash || merged.hash);
  const latestExternal = normalizeExternalSkillMetadata(latest);
  const olderExternal = normalizeExternalSkillMetadata(older);
  merged.externalSource =
    Object.prototype.hasOwnProperty.call(latest, 'externalSource') ? latestExternal.externalSource : olderExternal.externalSource;
  merged.externalSourceType =
    Object.prototype.hasOwnProperty.call(latest, 'externalSourceType')
      ? latestExternal.externalSourceType
      : olderExternal.externalSourceType;
  merged.externalSourceUrl =
    Object.prototype.hasOwnProperty.call(latest, 'externalSourceUrl')
      ? latestExternal.externalSourceUrl
      : olderExternal.externalSourceUrl;
  merged.externalSkillPath =
    Object.prototype.hasOwnProperty.call(latest, 'externalSkillPath')
      ? latestExternal.externalSkillPath
      : olderExternal.externalSkillPath;
  merged.externalHash =
    Object.prototype.hasOwnProperty.call(latest, 'externalHash') ? latestExternal.externalHash : olderExternal.externalHash;
  merged.externalPluginName =
    Object.prototype.hasOwnProperty.call(latest, 'externalPluginName')
      ? latestExternal.externalPluginName
      : olderExternal.externalPluginName;
  merged.externalInstalledAt =
    Object.prototype.hasOwnProperty.call(latest, 'externalInstalledAt')
      ? latestExternal.externalInstalledAt
      : olderExternal.externalInstalledAt;
  merged.externalUpdatedAt =
    Object.prototype.hasOwnProperty.call(latest, 'externalUpdatedAt')
      ? latestExternal.externalUpdatedAt
      : olderExternal.externalUpdatedAt;
  merged.pluginName =
    normalizePluginName(latest.pluginName) ||
    normalizePluginName(older.pluginName) ||
    merged.externalPluginName;
  merged.structureManifest = normalizeStructureManifest(
    latest.structureManifest || older.structureManifest,
    merged.canonicalPath,
    merged.hash
  );
  merged.createdAt = normalizeIsoOrNull(latest.createdAt) || normalizeIsoOrNull(older.createdAt);
  merged.updatedAt = normalizeIsoOrNull(latest.updatedAt) || normalizeIsoOrNull(older.updatedAt);
  merged.firstSeenAt = normalizeIsoOrNull(older.firstSeenAt) || normalizeIsoOrNull(latest.firstSeenAt);
  merged.lastSeenAt = normalizeIsoOrNull(latest.lastSeenAt) || normalizeIsoOrNull(older.lastSeenAt);
  merged.changedAt = normalizeIsoOrNull(latest.changedAt) || normalizeIsoOrNull(older.changedAt);
  merged.state = latest.state || older.state || 'active';
  return setItemSourceAliases(merged, mergedAliases, {
    name: mergeNonEmptyStrings(latest.sourceName, older.sourceName),
    agent: mergeNonEmptyStrings(latest.sourceAgent, older.sourceAgent) || null,
    scope: VALID_SCOPE_SET.has(latest.sourceScope) ? latest.sourceScope : older.sourceScope
  });
}

function normalizeCleanupHistory(input) {
  if (!Array.isArray(input)) return [];
  const rows = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const actions = Array.isArray(entry.actions)
      ? entry.actions
          .filter((action) => action && typeof action === 'object' && typeof action.key === 'string')
          .map((action) => ({
            key: action.key,
            beforeTag: VALID_TAG_SET.has(action.beforeTag) ? action.beforeTag : 'regular',
            beforeReason: String(action.beforeReason || ''),
            afterTag: VALID_TAG_SET.has(action.afterTag) ? action.afterTag : 'regular',
            afterReason: String(action.afterReason || '')
          }))
      : [];
    rows.push({
      runId: String(entry.runId || ''),
      createdAt: normalizeIsoOrNull(entry.createdAt),
      actions
    });
  }
  return rows.filter((entry) => entry.runId.length > 0);
}

function rebuildRegistryIndexes(registry) {
  const byCanonicalPath = {};
  const byLegacyKey = {};
  for (const [key, item] of Object.entries(registry.items || {})) {
    if (!item || typeof item !== 'object') continue;
    const canonicalPath = String(item.canonicalPath || '');
    if (canonicalPath) {
      byCanonicalPath[canonicalPath] = key;
    }
    const legacyKeys = Array.isArray(item.legacyKeys) ? item.legacyKeys : [];
    for (const legacyKey of legacyKeys) {
      if (typeof legacyKey !== 'string' || legacyKey.length === 0) continue;
      byLegacyKey[legacyKey] = key;
    }
  }
  registry.index = {
    byCanonicalPath,
    byLegacyKey
  };
  return registry;
}

function makeRegistryItemFromUnknown(rawItem, legacyKey = '') {
  const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
  const sourcePath = item.canonicalPath || item.sourcePath || extractLegacyPathFromKey(legacyKey) || legacyKey;
  const canonicalPath = normalizePath(sourcePath);
  const realPath = normalizePath(item.realPath || canonicalPath);
  const key = makeCanonicalKey(realPath);
  const hash = String(item.hash || '');
  const normalized = {
    name: String(item.normalized?.name || item.name || inferNameFromPath(canonicalPath)),
    description: String(item.normalized?.description || item.description || ''),
    body: String(item.normalized?.body || item.body || '')
  };
  const manifestHash = String(item.manifestHash || hash);
  const sourceAliases = uniqueSourceAliases([
    ...getItemSourceAliases(item),
    {
      name: item.sourceName,
      agent: item.sourceAgent,
      scope: item.sourceScope
    }
  ]);
  const legacyKeys = Array.from(
    new Set(
      [legacyKey, ...(Array.isArray(item.legacyKeys) ? item.legacyKeys : [])].filter(
        (entry) => typeof entry === 'string' && entry.length > 0 && entry !== key
      )
    )
  );

  return setItemSourceAliases({
    ...item,
    key,
    canonicalPath,
    realPath,
    sourcePath: canonicalPath,
    legacyKeys,
    id: String(item.id || slugify(normalized.name || inferNameFromPath(canonicalPath))),
    name: String(item.name || normalized.name),
    description: String(item.description || normalized.description || firstBodyLine(normalized.body)),
    normalized,
    isInternal: Boolean(item.isInternal) || isInternalSkillMetadata(item.metadata),
    hash,
    manifestHash,
    pluginName: normalizePluginName(item.pluginName),
    ...normalizeExternalSkillMetadata(item),
    policy: normalizePolicy(item.policy),
    structureManifest: normalizeStructureManifest(item.structureManifest, canonicalPath, hash),
    state: String(item.state || 'active'),
    createdAt: normalizeIsoOrNull(item.createdAt),
    updatedAt: normalizeIsoOrNull(item.updatedAt),
    firstSeenAt: normalizeIsoOrNull(item.firstSeenAt),
    lastSeenAt: normalizeIsoOrNull(item.lastSeenAt),
    changedAt: normalizeIsoOrNull(item.changedAt)
  }, sourceAliases, {
    name: item.sourceName,
    agent: item.sourceAgent,
    scope: item.sourceScope
  });
}

function normalizeRegistry(input) {
  const data = input && typeof input === 'object' ? input : {};
  const sourceItems = data.items && typeof data.items === 'object' ? data.items : {};
  const normalized = {
    version: 2,
    lastScanAt: normalizeIsoOrNull(data.lastScanAt),
    updatedAt: normalizeIsoOrNull(data.updatedAt),
    items: {},
    index: {
      byCanonicalPath: {},
      byLegacyKey: {}
    },
    cleanupHistory: normalizeCleanupHistory(data.cleanupHistory)
  };

  for (const [legacyKey, rawItem] of Object.entries(sourceItems)) {
    const candidate = makeRegistryItemFromUnknown(rawItem, legacyKey);
    const canonicalKey = candidate.key;
    const existing = normalized.items[canonicalKey];
    normalized.items[canonicalKey] = mergeRegistryItems(existing, candidate);
  }

  return rebuildRegistryIndexes(normalized);
}

function printHelp() {
  console.log(`
${APP_NAME} v${APP_VERSION}

Usage:
  skillsdock init [--config <path>] [--registry <path>]
  skillsdock init skill [name]
  skillsdock scan [paths...] [--config <path>] [--registry <path>]
  skillsdock all-local-skills [--config <path>] [--registry <path>] [--source <name>] [--scope <user|project>] [--tag <tag>] [--all] [--json]
  skillsdock skill-detail <selector> [--registry <path>] [--all-copies] [--json]
  skillsdock tag set <selector> --tag <regular|disabled|frozen|deleted> [--reason <text>] [--all-copies] [--registry <path>]
  skillsdock tag list [--registry <path>] [--source <name>] [--scope <user|project>] [--tag <tag>] [--all] [--json]
  skillsdock cleanup --plan|--apply [--registry <path>] [--source <name>] [--scope <user|project>] [--all] [--json]
  skillsdock cleanup --rollback <runId> [--registry <path>]
  skillsdock list [--config <path>] [--registry <path>] [--source <name>] [--changed] [--all] [--json]
  skillsdock inspect <id|key|path> [--registry <path>] [--json]
  skillsdock sync --to <agent|target> --scope <user|project> [--registry <path>] [--config <path>] [--mode <symlink|copy>] [--fallback <copy|fail>] [--dry-run] [--all]
  skillsdock doctor [--config <path>] [--registry <path>] [--agents] [--skills-spec]
  skillsdock version

Examples:
  skillsdock init
  skillsdock init skill my-skill
  skillsdock scan ~/Coding ~/Work
  skillsdock all-local-skills
  skillsdock tag set lint-check --tag frozen --reason "manual lock"
  skillsdock cleanup --plan
  skillsdock list --changed
  skillsdock sync --to openclaw --scope user --dry-run
`);
}

function padCell(value, width) {
  const text = String(value ?? '');
  if (text.length > width) return text.slice(0, Math.max(width - 1, 1)).concat('…');
  return text.padEnd(width, ' ');
}

function printTable(rows, columns) {
  const widths = columns.map((col) => {
    const maxCell = Math.max(col.label.length, ...rows.map((row) => String(col.get(row) ?? '').length));
    return Math.min(Math.max(maxCell, col.min || 8), col.max || 80);
  });

  const header = columns.map((col, i) => padCell(col.label, widths[i])).join('  ');
  const divider = widths.map((w) => '-'.repeat(w)).join('  ');

  console.log(header);
  console.log(divider);
  for (const row of rows) {
    console.log(columns.map((col, i) => padCell(col.get(row), widths[i])).join('  '));
  }
}

async function loadConfig(configPath, projectRoot) {
  const normalizedPath = path.resolve(expandHomePath(configPath || DEFAULT_CONFIG_PATH));
  const raw = await readJson(normalizedPath, {});
  const config = normalizeConfigV2(raw, projectRoot);
  return { configPath: normalizedPath, config, rawConfig: raw };
}

async function loadRegistry(registryPath) {
  const normalizedPath = path.resolve(expandHomePath(registryPath || DEFAULT_REGISTRY_PATH));
  const registry = normalizeRegistry(await readJson(normalizedPath, DEFAULT_REGISTRY));
  return { registryPath: normalizedPath, registry };
}

async function cmdInitSkill(args, context) {
  const requestedName = typeof args[0] === 'string' ? args[0].trim() : '';
  const targetDir = requestedName ? path.resolve(context.cwd, requestedName) : context.cwd;
  const defaultName = path.basename(targetDir);
  const skillName = slugify(requestedName || defaultName);
  const skillPath = path.join(targetDir, 'SKILL.md');

  if (await pathExists(skillPath)) {
    throw makeCliError(`SKILL.md already exists: ${skillPath}`, 1);
  }

  await ensureParentDir(skillPath);
  await fs.writeFile(skillPath, buildSkillTemplate(skillName), 'utf8');
  console.log(`Created skill template: ${skillPath}`);
}

async function cmdInit(flags, args, context) {
  if (args[0] === 'skill') {
    await cmdInitSkill(args.slice(1), context);
    return;
  }

  const projectRoot = context.projectRoot;
  const configPath = path.resolve(expandHomePath(flags.config || DEFAULT_CONFIG_PATH));
  const registryPath = path.resolve(expandHomePath(flags.registry || DEFAULT_REGISTRY_PATH));

  const configExists = await pathExists(configPath);
  const current = await readJson(configPath, {});
  const normalized = normalizeConfigV2(current, projectRoot);
  await writeJson(configPath, normalized);

  if (configExists) {
    console.log(`Updated config: ${configPath}`);
  } else {
    console.log(`Created config: ${configPath}`);
  }

  if (!(await pathExists(registryPath))) {
    await writeJson(registryPath, DEFAULT_REGISTRY);
    console.log(`Created registry: ${registryPath}`);
  } else {
    console.log(`Registry exists: ${registryPath}`);
  }

  console.log('\nNext step: skillsdock scan');
}

async function parseSkillRecord(filePath, source, sourceRoot, sourceFormat, scanConfig = DEFAULT_SCAN, options = {}) {
  const sourceName = source.name;
  const ext = path.extname(filePath).toLowerCase();
  let raw;
  let manifest;

  if (sourceFormat === 'skill-md' && ext === '.skill') {
    const pkg = await getSkillPackageManifest(filePath);
    raw = pkg.raw;
    manifest = pkg.manifest;
  } else {
    raw = await fs.readFile(filePath, 'utf8');
    manifest = await buildStructureManifest(filePath, sourceFormat, scanConfig.ignoreDirs);
  }

  const { metadata, normalized } = parseContentForFormat(sourceFormat, raw, filePath);
  const stat = await fs.stat(filePath);
  const gitMeta = tryGetGitMetadata(filePath);

  const id = slugify(normalized.name || inferNameFromPath(filePath));
  const description = String(normalized.description || firstBodyLine(normalized.body));
  const isInternal = isInternalSkillMetadata(metadata);
  const pluginName = normalizePluginName(options.pluginName);

  const resolvedSourceRoot = path.resolve(sourceRoot);
  let relativePath = path.basename(filePath);
  try {
    relativePath = path.relative(resolvedSourceRoot, path.resolve(filePath));
  } catch {
    relativePath = path.basename(filePath);
  }

  return {
    id,
    name: normalized.name,
    description,
    metadata,
    isInternal,
    normalized,
    content: raw,
    body: normalized.body,
    hash: sha256(raw),
    sourceName,
    sourceAgent: source.agent || null,
    sourceScope: source.scope || null,
    sourceRoot: resolvedSourceRoot,
    sourcePath: path.resolve(filePath),
    relativePath,
    sourceFormat,
    format: sourceFormat,
    pluginName,
    createdAt: gitMeta?.createdAt || toIso(stat.birthtime) || toIso(stat.ctime),
    updatedAt: gitMeta?.updatedAt || toIso(stat.mtime),
    originRepo: gitMeta?.originRepo || null,
    structureManifest: normalizeStructureManifest(manifest, path.resolve(filePath), sha256(raw)),
    manifestHash: manifest?.manifestHash || sha256(raw)
  };
}

async function cmdScan(flags, positionalArgs, context) {
  const projectRoot = context.projectRoot;
  const { config } = await loadConfig(flags.config, projectRoot);
  const { registryPath, registry } = await loadRegistry(flags.registry);
  const externalLock = await readExternalSkillLock();

  const now = new Date().toISOString();
  const sourceInputs =
    positionalArgs.length > 0
      ? positionalArgs.map((inputPath, index) => ({
          name: `arg-${index + 1}`,
          path: inputPath,
          format: inferSourceFormatFromPath(inputPath),
          optional: false,
          agent: null,
          scope: null
        }))
      : config.sources;

  if (!Array.isArray(sourceInputs) || sourceInputs.length === 0) {
    throw new Error('No scan sources configured. Run "skillsdock init" and update config.');
  }

  const normalizedSourceInputs = [];
  const scannedSourceNames = [];
  const sourceGroupIndex = new Map();

  for (const sourceRaw of sourceInputs) {
    const sourceName = sourceRaw.name || slugify(sourceRaw.path || 'source');
    const sourcePathInput = sourceRaw.path;
    if (!sourcePathInput) continue;

    const sourcePath = resolveTemplatePath(sourcePathInput, { projectRoot });
    const sourceFormat = normalizeSourceFormat(sourceRaw.format, sourcePathInput);
    const sourceAliases = uniqueSourceAliases([
      ...(Array.isArray(sourceRaw.sourceAliases) ? sourceRaw.sourceAliases : []),
      {
        name: sourceName,
        agent: sourceRaw.agent || null,
        scope: sourceRaw.scope || null
      }
    ]);
    const source = {
      ...sourceRaw,
      name: sourceName,
      agent: sourceRaw.agent || null,
      scope: sourceRaw.scope || null,
      format: sourceFormat,
      sourceAliases
    };
    for (const alias of sourceAliases) {
      scannedSourceNames.push(alias.name);
    }

    const sourceGroupKey = `${normalizePath(sourcePath)}::${sourceFormat}`;
    const existingIndex = sourceGroupIndex.get(sourceGroupKey);
    if (existingIndex !== undefined) {
      const existingGroup = normalizedSourceInputs[existingIndex];
      existingGroup.sourceAliases = uniqueSourceAliases([...(existingGroup.sourceAliases || []), ...sourceAliases]);
      continue;
    }

    sourceGroupIndex.set(sourceGroupKey, normalizedSourceInputs.length);
    normalizedSourceInputs.push({
      ...source,
      sourcePath,
      sourceAliases
    });
  }

  const seenRegistryKeys = new Set();
  const includeInternal = shouldInstallInternalSkills();
  let discovered = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let parseErrors = 0;
  let skippedInternal = 0;

  for (const source of normalizedSourceInputs) {
    const sourceFormat = source.format;
    const sourcePath = source.sourcePath;
    const pluginDiscovery =
      sourceFormat === 'skill-md' ? await getPluginSkillSearchResult(sourcePath) : { ownerships: [] };
    const pluginOwnerships = Array.isArray(pluginDiscovery.ownerships) ? pluginDiscovery.ownerships : [];
    const skillFiles = await collectSkillFiles(
      sourcePath,
      sourceFormat,
      config.scan.maxDepth,
      config.scan.ignoreDirs
    );
    discovered += skillFiles.length;

    for (const filePath of skillFiles) {
      const normalizedPath = normalizePath(filePath);
      const realPath = (await getRealpathOrNull(normalizedPath)) || normalizedPath;
      const realKey = makeCanonicalKey(realPath);
      const pathKey = makeCanonicalKey(normalizedPath);
      const existing = registry.items[realKey] || registry.items[pathKey];
      const existingExternalMetadata = resolveExternalSkillMetadataForFile(filePath, existing?.id, externalLock);
      const canonicalPath = pickPreferredCanonicalPath(
        [existing?.canonicalPath, normalizedPath, realPath],
        context
      );
      seenRegistryKeys.add(realKey);
      const sourceAliases = uniqueSourceAliases([...(source.sourceAliases || []), ...getItemSourceAliases(existing)]);
      const primaryAlias = sourceAliases[0] || normalizeSourceAlias(source);
      const legacyKeys = Array.from(
        new Set([
          ...(existing?.legacyKeys || []),
          normalizedPath,
          pathKey !== realKey ? pathKey : null,
          ...sourceAliases.map((alias) => `${alias.name}:${normalizedPath}`)
        ].filter(Boolean))
      );

      if (existing && isFrozen(existing)) {
        registry.items[realKey] = setItemSourceAliases({
          ...existing,
          ...existingExternalMetadata,
          key: realKey,
          canonicalPath,
          realPath,
          sourcePath: canonicalPath,
          sourceFormat: existing.sourceFormat || sourceFormat,
          pluginName:
            normalizePluginName(existing.pluginName) ||
            resolvePluginNameForFile(filePath, pluginOwnerships) ||
            existingExternalMetadata.externalPluginName,
          legacyKeys: Array.from(new Set(legacyKeys)),
          state: 'active',
          firstSeenAt: existing.firstSeenAt || now,
          lastSeenAt: now
        }, sourceAliases, primaryAlias);
        if (pathKey !== realKey) delete registry.items[pathKey];
        unchanged += 1;
        continue;
      }

      let parsed;
      try {
        parsed = await parseSkillRecord(filePath, source, sourcePath, sourceFormat, config.scan, {
          pluginName: resolvePluginNameForFile(filePath, pluginOwnerships)
        });
      } catch {
        parseErrors += 1;
        continue;
      }

      if (parsed.isInternal && !includeInternal) {
        skippedInternal += 1;
        continue;
      }

      const externalMetadata = resolveExternalSkillMetadataForFile(filePath, parsed.id, externalLock);

      const changed =
        !existing || existing.hash !== parsed.hash || (existing.manifestHash || '') !== parsed.manifestHash;

      if (!existing) created += 1;
      else if (changed) updated += 1;
      else unchanged += 1;

      registry.items[realKey] = setItemSourceAliases({
        ...existing,
        ...parsed,
        ...externalMetadata,
        key: realKey,
        canonicalPath,
        realPath,
        sourcePath: canonicalPath,
        legacyKeys: Array.from(new Set(legacyKeys)),
        pluginName: parsed.pluginName || externalMetadata.externalPluginName,
        policy: normalizePolicy(existing?.policy, existing?.policy?.updatedAt || now),
        state: 'active',
        firstSeenAt: existing?.firstSeenAt || now,
        lastSeenAt: now,
        changedAt: changed ? now : existing?.changedAt || existing?.firstSeenAt || now
      }, sourceAliases, primaryAlias);
      if (pathKey !== realKey) delete registry.items[pathKey];
    }
  }

  let missing = 0;
  const scannedSourceSet = new Set(scannedSourceNames);
  for (const [key, item] of Object.entries(registry.items || {})) {
    if (![...scannedSourceSet].some((sourceName) => itemMatchesSourceName(item, sourceName))) continue;
    if (seenRegistryKeys.has(key)) continue;
    if (item.state !== 'missing') missing += 1;
    registry.items[key] = {
      ...item,
      state: 'missing'
    };
  }

  const sourceOrder = new Map(scannedSourceNames.map((name, index) => [name, index]));
  const byId = new Map();
  for (const item of Object.values(registry.items || {})) {
    if (item.state !== 'active') continue;
    if (isDeleted(item)) continue;
    if (!byId.has(item.id)) byId.set(item.id, []);
    byId.get(item.id).push(item);
  }
  for (const items of byId.values()) {
    items.sort((a, b) => {
      const aAlias = getPrimarySourceAlias(a);
      const bAlias = getPrimarySourceAlias(b);
      const sourceDiff = (sourceOrder.get(aAlias?.name) ?? 9999) - (sourceOrder.get(bAlias?.name) ?? 9999);
      if (sourceDiff !== 0) return sourceDiff;
      return a.sourcePath.localeCompare(b.sourcePath);
    });
    items.forEach((item, index) => {
      const key = item.key;
      registry.items[key] = {
        ...registry.items[key],
        isPrimary: index === 0
      };
    });
  }

  registry.lastScanAt = now;
  registry.updatedAt = now;
  rebuildRegistryIndexes(registry);
  await writeJson(registryPath, registry);

  console.log(`Scanned ${normalizedSourceInputs.length} source(s)`);
  console.log(`Found files: ${discovered}`);
  console.log(`New: ${created} | Updated: ${updated} | Unchanged: ${unchanged} | Missing: ${missing}`);
  if (skippedInternal > 0) {
    console.log(`Skipped internal skills: ${skippedInternal} (set INSTALL_INTERNAL_SKILLS=1 to include)`);
  }
  if (parseErrors > 0) console.log(`Parse errors: ${parseErrors}`);
  console.log(`Registry: ${registryPath}`);
}

function toArrayUnique(values) {
  return Array.from(new Set(values));
}

function getRegistryItems(registry) {
  return Object.values(registry.items || {}).filter((item) => item && typeof item === 'object');
}

function normalizeSelectorToCanonicalPath(selector) {
  try {
    return normalizePath(selector);
  } catch {
    return null;
  }
}

function resolveSelectorMatches(registry, selector, options = {}) {
  const allowAllCopies = Boolean(options.allCopies);
  const includeDeleted = Boolean(options.includeDeleted);
  const items = getRegistryItems(registry);
  const byCanonicalPath = registry.index?.byCanonicalPath || {};
  const byLegacyKey = registry.index?.byLegacyKey || {};

  const canonicalPathCandidate = normalizeSelectorToCanonicalPath(selector);
  if (canonicalPathCandidate && byCanonicalPath[canonicalPathCandidate]) {
    const key = byCanonicalPath[canonicalPathCandidate];
    const item = registry.items[key];
    if (!item) return [];
    if (!includeDeleted && isDeleted(item)) return [];
    return [item];
  }

  if (registry.items[selector]) {
    const item = registry.items[selector];
    if (!includeDeleted && isDeleted(item)) return [];
    return [item];
  }

  if (byLegacyKey[selector]) {
    const item = registry.items[byLegacyKey[selector]];
    if (!item) return [];
    if (!includeDeleted && isDeleted(item)) return [];
    return [item];
  }

  const idMatches = items.filter((item) => item.id === selector);
  const visibleMatches = includeDeleted ? idMatches : idMatches.filter((item) => !isDeleted(item));
  if (visibleMatches.length <= 1 || allowAllCopies) {
    return visibleMatches;
  }

  throw makeCliError(
    `Selector "${selector}" matched ${visibleMatches.length} skills by id. Use --all-copies or provide key/path.`,
    2
  );
}

function filterBySharedFlags(items, flags = {}) {
  let list = [...items];

  if (flags.source) {
    list = list.filter((item) => itemMatchesSourceName(item, String(flags.source)));
  }

  if (flags.scope) {
    list = list.filter((item) => itemMatchesSourceScope(item, String(flags.scope)));
  }

  if (flags.tag) {
    list = list.filter((item) => String(item.policy?.tag || 'regular') === String(flags.tag));
  }

  if (!flags.all) {
    list = list.filter((item) => !isDeleted(item));
  }

  return list;
}

function formatTagForDisplay(tag) {
  return String(tag || 'regular');
}

function getRowPluginNames(row) {
  if (Array.isArray(row.pluginNames)) {
    return toArrayUnique(row.pluginNames.map((entry) => normalizePluginName(entry)).filter(Boolean)).sort((a, b) =>
      a.localeCompare(b)
    );
  }
  const pluginName = normalizePluginName(row?.pluginName);
  return pluginName ? [pluginName] : [];
}

function buildPluginGroupedSections(rows) {
  const ungrouped = [];
  const mixed = [];
  const grouped = new Map();

  for (const row of rows) {
    const pluginNames = getRowPluginNames(row);
    if (pluginNames.length === 0) {
      ungrouped.push(row);
      continue;
    }
    if (pluginNames.length > 1) {
      mixed.push(row);
      continue;
    }
    const pluginName = pluginNames[0];
    if (!grouped.has(pluginName)) grouped.set(pluginName, []);
    grouped.get(pluginName).push(row);
  }

  const sections = [];
  if (ungrouped.length > 0) {
    sections.push({ label: `Ungrouped (${ungrouped.length})`, rows: ungrouped });
  }

  for (const pluginName of Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))) {
    sections.push({
      label: `Plugin: ${pluginName} (${grouped.get(pluginName).length})`,
      rows: grouped.get(pluginName)
    });
  }

  if (mixed.length > 0) {
    sections.push({ label: `Mixed Plugin Ownership (${mixed.length})`, rows: mixed });
  }

  return sections;
}

function printGroupedTable(rows, columns) {
  const sections = buildPluginGroupedSections(rows);
  for (const [index, section] of sections.entries()) {
    if (index > 0) console.log('');
    console.log(section.label);
    printTable(section.rows, columns);
  }
}

function filterListItems(items, flags, registry) {
  let list = items.filter((item) => (flags.all ? true : item.state === 'active'));
  list = filterBySharedFlags(list, flags);

  if (!flags.all) list = list.filter((item) => item.state === 'active');

  if (flags.changed) {
    const changedIds = new Set(
      items
        .filter(
          (item) =>
            item.state === 'active' &&
            item.changedAt === registry.lastScanAt &&
            (flags.all ? true : !isDeleted(item))
        )
        .map((item) => item.id)
    );
    list = list.filter((item) => changedIds.has(item.id));
  }

  if (!flags.all) {
    list = list.filter((item) => item.isPrimary);
    const deduped = new Map();
    for (const item of list) {
      const identityKey = String(item.realPath || item.canonicalPath || item.sourcePath || item.key);
      const existing = deduped.get(identityKey);
      if (!existing) {
        deduped.set(identityKey, item);
        continue;
      }
      const preferred = pickPreferredCanonicalPath(
        [existing.canonicalPath, item.canonicalPath]
      );
      deduped.set(identityKey, preferred === item.canonicalPath ? item : existing);
    }
    list = Array.from(deduped.values());
  }

  return list;
}

async function cmdList(flags) {
  const { registry } = await loadRegistry(flags.registry);
  const items = getRegistryItems(registry);
  const list = filterListItems(items, flags, registry).sort((a, b) => a.id.localeCompare(b.id));

  if (flags.json) {
    console.log(JSON.stringify({ count: list.length, items: list }, null, 2));
    return;
  }

  if (list.length === 0) {
    console.log('No skills found in registry.');
    return;
  }

  printGroupedTable(list, [
    { label: 'ID', get: (row) => row.id, min: 12, max: 34 },
    { label: 'Plugin', get: (row) => row.pluginName || '-', min: 8, max: 24 },
    { label: 'Source', get: (row) => row.sourceName, min: 8, max: 22 },
    { label: 'Format', get: (row) => row.sourceFormat, min: 8, max: 12 },
    { label: 'Tag', get: (row) => formatTagForDisplay(row.policy?.tag), min: 8, max: 10 },
    { label: 'State', get: (row) => row.state, min: 8, max: 10 },
    { label: 'Updated', get: (row) => (row.updatedAt || '').slice(0, 19), min: 19, max: 19 },
    { label: 'Path', get: (row) => row.sourcePath, min: 20, max: 80 }
  ]);

  console.log(`\nTotal: ${list.length}`);
}

async function cmdInspect(flags, positionalArgs) {
  const query = positionalArgs[0];
  if (!query) {
    throw makeCliError('Usage: skillsdock inspect <id|key|path>', 2);
  }

  const { registry } = await loadRegistry(flags.registry);
  const allCopies = Boolean(flags['all-copies'] || flags.allCopies);
  const matches = resolveSelectorMatches(registry, query, {
    allCopies: true,
    includeDeleted: true
  });
  if (matches.length === 0) {
    throw makeCliError(`Skill not found: ${query}`, 2);
  }
  const matched = matches.find((item) => item.isPrimary) || matches[0];

  const items = getRegistryItems(registry);
  const siblings = items
    .filter((item) => item.id === matched.id)
    .map((item) => ({
      key: item.key,
      canonicalPath: item.canonicalPath,
      pluginName: item.pluginName || null,
      sourceName: item.sourceName,
      sourcePath: item.sourcePath,
      sourceFormat: item.sourceFormat,
      state: item.state,
      tag: item.policy?.tag || 'regular',
      isPrimary: Boolean(item.isPrimary)
    }));

  const payload = {
    ...matched,
    copies: siblings
  };

  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`ID: ${matched.id}`);
  console.log(`Name: ${matched.name}`);
  console.log(`Description: ${matched.description}`);
  console.log(`Plugin: ${matched.pluginName || '-'}`);
  console.log(`Source: ${matched.sourceName}`);
  console.log(`Format: ${matched.sourceFormat}`);
  console.log(`Path: ${matched.canonicalPath || matched.sourcePath}`);
  console.log(`State: ${matched.state}`);
  console.log(`Tag: ${formatTagForDisplay(matched.policy?.tag)}`);
  console.log(`Primary: ${matched.isPrimary ? 'yes' : 'no'}`);
  console.log(`Hash: ${matched.hash}`);
  console.log(`Manifest Hash: ${matched.manifestHash || '-'}`);
  if (matched.externalSourceUrl || matched.externalHash || matched.externalPluginName) {
    console.log(`External Source URL: ${matched.externalSourceUrl || '-'}`);
    console.log(`External Source Type: ${matched.externalSourceType || '-'}`);
    console.log(`External Hash: ${matched.externalHash || '-'}`);
    console.log(`External Plugin: ${matched.externalPluginName || '-'}`);
  }
  console.log(`Created: ${matched.createdAt || '-'}`);
  console.log(`Updated: ${matched.updatedAt || '-'}`);
  console.log(`First Seen: ${matched.firstSeenAt || '-'}`);
  console.log(`Last Seen: ${matched.lastSeenAt || '-'}`);
  if (matched.originRepo) console.log(`Git Origin: ${matched.originRepo}`);
  console.log(`\nCopies: ${siblings.length}`);
  for (const sibling of siblings) {
    console.log(
      `- ${sibling.isPrimary ? '[primary] ' : ''}${sibling.sourceName} (${sibling.pluginName || '-'}, ${sibling.sourceFormat}, ${sibling.tag}): ${
        sibling.canonicalPath || sibling.sourcePath
      }`
    );
  }
}

function deriveAgentNames(item) {
  const aliases = getItemSourceAliases(item);
  if (aliases.length > 0) {
    return toArrayUnique(
      aliases.map((alias) => {
        if (alias.agent) return alias.agent;
        if (alias.name.includes('-')) return alias.name.split('-')[0];
        return 'unknown';
      })
    );
  }
  if (item.sourceAgent) return [item.sourceAgent];
  if (typeof item.sourceName === 'string' && item.sourceName.includes('-')) {
    return [item.sourceName.split('-')[0]];
  }
  return ['unknown'];
}

function computeSkillType(entries) {
  const scopes = new Set(
    entries.flatMap((entry) => getItemSourceAliases(entry).map((alias) => alias.scope).filter(Boolean))
  );
  if (scopes.size === 1 && scopes.has('user')) return 'global';
  if (scopes.size === 1 && scopes.has('project')) return 'project';
  return 'mixed';
}

function aggregateAllLocalSkills(items) {
  const groups = new Map();
  for (const item of items) {
    const identityKey = String(item.realPath || item.canonicalPath || item.sourcePath || item.key);
    const groupKey = String(item.normalized?.name || item.id || item.name || '').trim().toLowerCase();
    const key = groupKey || identityKey;
    if (!groups.has(key)) {
      groups.set(key, new Map());
    }
    const groupItems = groups.get(key);
    const existing = groupItems.get(identityKey);
    if (!existing) {
      groupItems.set(identityKey, item);
      continue;
    }
    const preferred = pickPreferredCanonicalPath(
      [existing.canonicalPath, item.canonicalPath]
    );
    groupItems.set(identityKey, preferred === item.canonicalPath ? item : existing);
  }

  const rows = [];
  for (const entriesMap of groups.values()) {
    const entries = Array.from(entriesMap.values());
    const tags = toArrayUnique(entries.map((entry) => entry.policy?.tag || 'regular')).sort((a, b) =>
      a.localeCompare(b)
    );
    const pluginNames = toArrayUnique(entries.map((entry) => normalizePluginName(entry.pluginName)).filter(Boolean)).sort(
      (a, b) => a.localeCompare(b)
    );
    const latestUpdatedAt = entries.reduce((acc, entry) => {
      if (!entry.updatedAt) return acc;
      if (!acc) return entry.updatedAt;
      return toTimestampForSort(entry.updatedAt) > toTimestampForSort(acc) ? entry.updatedAt : acc;
    }, null);
    rows.push({
      name: entries[0].normalized?.name || entries[0].name || entries[0].id,
      type: computeSkillType(entries),
      agents: toArrayUnique(entries.flatMap((entry) => deriveAgentNames(entry))).sort((a, b) =>
        a.localeCompare(b)
      ),
      formats: toArrayUnique(entries.map((entry) => entry.sourceFormat).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b)
      ),
      pluginName: pluginNames.length === 1 ? pluginNames[0] : null,
      pluginNames,
      copies: entries.length,
      tag: tags.length === 1 ? tags[0] : 'mixed',
      updatedAt: latestUpdatedAt,
      items: entries
    });
  }

  rows.sort((a, b) => {
    const aTime = toTimestampForSort(a.updatedAt);
    const bTime = toTimestampForSort(b.updatedAt);
    if (aTime !== bTime) return bTime - aTime;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

async function cmdAllLocalSkills(flags) {
  const { registry } = await loadRegistry(flags.registry);
  const list = filterBySharedFlags(
    getRegistryItems(registry).filter((item) => item.state === 'active'),
    flags
  );
  const rows = aggregateAllLocalSkills(list);

  if (flags.json) {
    console.log(JSON.stringify({ count: rows.length, items: rows }, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log('No local skills found.');
    return;
  }

  printGroupedTable(rows, [
    { label: 'NAME', get: (row) => row.name, min: 12, max: 34 },
    { label: 'PLUGIN', get: (row) => row.pluginName || (row.pluginNames?.length > 1 ? 'mixed' : '-'), min: 8, max: 24 },
    { label: 'TYPE', get: (row) => row.type, min: 7, max: 9 },
    { label: 'AGENTS', get: (row) => row.agents.join(','), min: 10, max: 30 },
    { label: 'FORMATS', get: (row) => row.formats.join(','), min: 10, max: 24 },
    { label: 'COPIES', get: (row) => row.copies, min: 6, max: 6 },
    { label: 'TAG', get: (row) => formatTagForDisplay(row.tag), min: 8, max: 10 },
    { label: 'UPDATED', get: (row) => String(row.updatedAt || '').slice(0, 19), min: 19, max: 19 }
  ]);
  console.log(`\nTotal: ${rows.length}`);
}

function createSkillDetailPayload(registry, item) {
  const siblings = getRegistryItems(registry)
    .filter((entry) => entry.id === item.id)
    .map((entry) => ({
      key: entry.key,
      canonicalPath: entry.canonicalPath,
      pluginName: entry.pluginName || null,
      sourceName: entry.sourceName,
      sourceScope: entry.sourceScope,
      sourceAgent: entry.sourceAgent,
      sourceFormat: entry.sourceFormat,
      state: entry.state,
      tag: entry.policy?.tag || 'regular',
      isPrimary: Boolean(entry.isPrimary)
    }));

  return {
    ...item,
    copies: siblings
  };
}

async function cmdSkillDetail(flags, positionalArgs) {
  const selector = positionalArgs[0];
  if (!selector) {
    throw makeCliError('Usage: skillsdock skill-detail <selector>', 2);
  }

  const { registry } = await loadRegistry(flags.registry);
  const matches = resolveSelectorMatches(registry, selector, {
    allCopies: Boolean(flags['all-copies'] || flags.allCopies),
    includeDeleted: true
  });
  if (matches.length === 0) {
    throw makeCliError(`Skill not found: ${selector}`, 2);
  }

  const payload = matches.map((entry) => createSkillDetailPayload(registry, entry));
  if (flags.json) {
    console.log(JSON.stringify({ count: payload.length, items: payload }, null, 2));
    return;
  }

  for (const [index, detail] of payload.entries()) {
    if (index > 0) {
      console.log('\n---');
    }
    console.log(`ID: ${detail.id}`);
    console.log(`Name: ${detail.name}`);
    console.log(`Plugin: ${detail.pluginName || '-'}`);
    console.log(`Tag: ${formatTagForDisplay(detail.policy?.tag)}`);
    console.log(`State: ${detail.state}`);
    console.log(`Path: ${detail.canonicalPath}`);
    console.log(`Source: ${detail.sourceName}`);
    console.log(`Scope: ${detail.sourceScope || '-'}`);
    console.log(`Agent: ${detail.sourceAgent || '-'}`);
    console.log(`Format: ${detail.sourceFormat}`);
    console.log(`Hash: ${detail.hash || '-'}`);
    console.log(`Manifest Hash: ${detail.manifestHash || '-'}`);
    if (detail.externalSourceUrl || detail.externalHash || detail.externalPluginName) {
      console.log(`External Source URL: ${detail.externalSourceUrl || '-'}`);
      console.log(`External Source Type: ${detail.externalSourceType || '-'}`);
      console.log(`External Hash: ${detail.externalHash || '-'}`);
      console.log(`External Plugin: ${detail.externalPluginName || '-'}`);
    }
    console.log(`Included Files: ${detail.structureManifest?.includedFiles?.length || 0}`);
    if (Array.isArray(detail.structureManifest?.parseWarnings) && detail.structureManifest.parseWarnings.length > 0) {
      for (const warning of detail.structureManifest.parseWarnings) {
        console.log(`WARN: ${warning}`);
      }
    }
    console.log(`Copies: ${detail.copies.length}`);
  }
}

function ensureValidTag(tag) {
  const normalizedTag = String(tag || '');
  if (!VALID_TAG_SET.has(normalizedTag)) {
    throw makeCliError(`Invalid tag "${normalizedTag}". Use regular|disabled|frozen|deleted.`, 2);
  }
  return normalizedTag;
}

async function cmdTag(flags, positionalArgs) {
  const action = positionalArgs[0];
  if (!action) {
    throw makeCliError('Usage: skillsdock tag <set|list> ...', 2);
  }

  if (action === 'set') {
    const selector = positionalArgs[1];
    if (!selector) {
      throw makeCliError('Usage: skillsdock tag set <selector> --tag <regular|disabled|frozen|deleted>', 2);
    }
    const tag = ensureValidTag(flags.tag);
    const reason = String(flags.reason || '');
    const allowAllCopies = Boolean(flags['all-copies'] || flags.allCopies);
    const { registryPath, registry } = await loadRegistry(flags.registry);
    const matches = resolveSelectorMatches(registry, selector, {
      allCopies: allowAllCopies,
      includeDeleted: true
    });
    if (matches.length === 0) {
      throw makeCliError(`Skill not found: ${selector}`, 2);
    }

    const now = new Date().toISOString();
    for (const match of matches) {
      const key = match.key;
      registry.items[key] = {
        ...registry.items[key],
        policy: {
          tag,
          reason,
          updatedAt: now
        }
      };
    }
    registry.updatedAt = now;
    rebuildRegistryIndexes(registry);
    await writeJson(registryPath, registry);
    console.log(`Updated tag for ${matches.length} skill(s) to ${tag}`);
    return;
  }

  if (action === 'list') {
    const { registry } = await loadRegistry(flags.registry);
    const list = filterBySharedFlags(getRegistryItems(registry), flags).sort((a, b) =>
      (a.id || '').localeCompare(b.id || '')
    );

    if (flags.json) {
      console.log(JSON.stringify({ count: list.length, items: list }, null, 2));
      return;
    }
    if (list.length === 0) {
      console.log('No tagged skills found.');
      return;
    }
    printTable(list, [
      { label: 'ID', get: (row) => row.id, min: 12, max: 34 },
      { label: 'TAG', get: (row) => formatTagForDisplay(row.policy?.tag), min: 8, max: 10 },
      { label: 'SOURCE', get: (row) => row.sourceName, min: 8, max: 22 },
      { label: 'SCOPE', get: (row) => row.sourceScope || '-', min: 7, max: 7 },
      { label: 'UPDATED', get: (row) => String(row.policy?.updatedAt || '').slice(0, 19), min: 19, max: 19 }
    ]);
    console.log(`\nTotal: ${list.length}`);
    return;
  }

  throw makeCliError(`Unknown tag action: ${action}. Use set|list.`, 2);
}

function compareCleanupKeeper(a, b) {
  const tagDiff = (TAG_PRIORITY[b.policy?.tag || 'regular'] || 0) - (TAG_PRIORITY[a.policy?.tag || 'regular'] || 0);
  if (tagDiff !== 0) return tagDiff;

  const scopeOrder = { project: 3, user: 2 };
  const scopeDiff = (scopeOrder[b.sourceScope] || 1) - (scopeOrder[a.sourceScope] || 1);
  if (scopeDiff !== 0) return scopeDiff;

  if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) {
    return a.isPrimary ? -1 : 1;
  }

  const updatedDiff = toTimestampForSort(b.updatedAt) - toTimestampForSort(a.updatedAt);
  if (updatedDiff !== 0) return updatedDiff;

  return String(a.canonicalPath || '').localeCompare(String(b.canonicalPath || ''));
}

function buildCleanupPlan(registry, flags) {
  const baseItems = filterBySharedFlags(getRegistryItems(registry), flags);
  const items = baseItems.filter((item) => (flags.all ? true : !isDeleted(item)));
  const issues = [];
  const actions = [];

  const orphaned = items.filter((item) => !fsSync.existsSync(item.canonicalPath || item.sourcePath || ''));
  for (const item of orphaned) {
    issues.push({
      type: 'orphaned_record',
      key: item.key,
      id: item.id,
      canonicalPath: item.canonicalPath
    });
    if (!isFrozen(item) && !isDeleted(item)) {
      actions.push({
        key: item.key,
        toTag: 'deleted',
        reason: `cleanup:orphaned:${item.canonicalPath}`
      });
    }
  }

  const byManifestHash = new Map();
  for (const item of items) {
    const manifestHash = item.manifestHash || item.hash;
    if (!manifestHash) continue;
    if (!byManifestHash.has(manifestHash)) byManifestHash.set(manifestHash, []);
    byManifestHash.get(manifestHash).push(item);
  }
  for (const [manifestHash, group] of byManifestHash.entries()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(compareCleanupKeeper);
    const keeper = sorted[0];
    issues.push({
      type: 'exact_duplicate',
      manifestHash,
      keeperKey: keeper.key,
      keys: sorted.map((entry) => entry.key)
    });
    for (const entry of sorted.slice(1)) {
      if (isFrozen(entry)) continue;
      if (hasTag(entry, 'disabled')) continue;
      actions.push({
        key: entry.key,
        toTag: 'disabled',
        reason: `cleanup:duplicate-of:${keeper.key}`
      });
    }
  }

  const byGroup = new Map();
  for (const item of items) {
    const groupKey = String(item.normalized?.name || item.id || '').trim().toLowerCase();
    if (!groupKey) continue;
    if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
    byGroup.get(groupKey).push(item);
  }
  for (const [groupKey, group] of byGroup.entries()) {
    const uniqueHashes = toArrayUnique(group.map((entry) => entry.manifestHash || entry.hash).filter(Boolean));
    if (uniqueHashes.length <= 1) continue;
    issues.push({
      type: 'name_collision',
      groupKey,
      hashes: uniqueHashes,
      keys: group.map((entry) => entry.key)
    });
  }

  const byId = new Map();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, []);
    byId.get(item.id).push(item);
  }
  for (const [id, group] of byId.entries()) {
    const scopes = new Set(group.map((entry) => entry.sourceScope).filter(Boolean));
    if (!(scopes.has('user') && scopes.has('project'))) continue;
    const uniqueHashes = toArrayUnique(group.map((entry) => entry.manifestHash || entry.hash).filter(Boolean));
    if (uniqueHashes.length <= 1) continue;
    issues.push({
      type: 'shadowing_conflict',
      id,
      keys: group.map((entry) => entry.key),
      hashes: uniqueHashes
    });
  }

  const actionMap = new Map();
  for (const action of actions) {
    if (!actionMap.has(action.key)) {
      actionMap.set(action.key, action);
    }
  }

  return {
    items,
    issues,
    actions: [...actionMap.values()]
  };
}

function createCleanupRunId() {
  return `cln-${new Date().toISOString().replace(/[:.]/g, '').replace(/-/g, '')}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

async function cmdCleanup(flags) {
  const { registryPath, registry } = await loadRegistry(flags.registry);
  const rollbackRunId = typeof flags.rollback === 'string' ? flags.rollback : null;

  if (rollbackRunId) {
    const entry = (registry.cleanupHistory || []).find((row) => row.runId === rollbackRunId);
    if (!entry) {
      throw makeCliError(`Cleanup run not found: ${rollbackRunId}`, 2);
    }
    let restored = 0;
    let failed = 0;
    for (const action of entry.actions || []) {
      const item = registry.items[action.key];
      if (!item) {
        failed += 1;
        continue;
      }
      registry.items[action.key] = {
        ...item,
        policy: {
          tag: action.beforeTag,
          reason: action.beforeReason || '',
          updatedAt: new Date().toISOString()
        }
      };
      restored += 1;
    }
    registry.updatedAt = new Date().toISOString();
    rebuildRegistryIndexes(registry);
    await writeJson(registryPath, registry);
    console.log(`Rollback ${rollbackRunId}: restored=${restored} failed=${failed}`);
    if (failed > 0) process.exitCode = 1;
    return;
  }

  const modePlan = Boolean(flags.plan);
  const modeApply = Boolean(flags.apply);
  if (modePlan === modeApply) {
    throw makeCliError('Usage: skillsdock cleanup --plan|--apply', 2);
  }

  const plan = buildCleanupPlan(registry, flags);
  if (modePlan) {
    if (flags.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    console.log(`Cleanup plan: issues=${plan.issues.length} actions=${plan.actions.length}`);
    if (plan.actions.length > 0) {
      printTable(plan.actions, [
        { label: 'KEY', get: (row) => row.key, min: 18, max: 42 },
        { label: 'TAG', get: (row) => row.toTag, min: 8, max: 10 },
        { label: 'REASON', get: (row) => row.reason, min: 16, max: 70 }
      ]);
    }
    return;
  }

  const runId = createCleanupRunId();
  const now = new Date().toISOString();
  const historyActions = [];
  let applied = 0;
  let failed = 0;
  for (const action of plan.actions) {
    const item = registry.items[action.key];
    if (!item) {
      failed += 1;
      continue;
    }
    if (isFrozen(item)) {
      continue;
    }
    const beforeTag = item.policy?.tag || 'regular';
    const beforeReason = item.policy?.reason || '';
    registry.items[action.key] = {
      ...item,
      policy: {
        tag: action.toTag,
        reason: action.reason,
        updatedAt: now
      }
    };
    historyActions.push({
      key: action.key,
      beforeTag,
      beforeReason,
      afterTag: action.toTag,
      afterReason: action.reason
    });
    applied += 1;
  }

  if (!Array.isArray(registry.cleanupHistory)) {
    registry.cleanupHistory = [];
  }
  registry.cleanupHistory.push({
    runId,
    createdAt: now,
    actions: historyActions
  });
  registry.updatedAt = now;
  rebuildRegistryIndexes(registry);
  await writeJson(registryPath, registry);

  console.log(`Cleanup apply: runId=${runId} applied=${applied} failed=${failed} issues=${plan.issues.length}`);
  if (failed > 0) process.exitCode = 1;
}

function getTargetFilePath(basePath, targetConfig, item) {
  const layout = targetConfig.layout || 'nested';
  if (layout === 'flat') {
    const ext = targetConfig.extension || '.md';
    return path.join(basePath, `${item.id}${ext}`);
  }
  const filename = targetConfig.filename || 'SKILL.md';
  return path.join(basePath, item.id, filename);
}

function resolveSyncTarget(config, targetInput, scope) {
  const targets = config.targets || {};

  if (targets[targetInput]) {
    const target = targets[targetInput];
    if (target.scope && scope && target.scope !== scope) {
      throw new Error(`Target ${targetInput} is scope=${target.scope}, but --scope ${scope} was provided.`);
    }
    return { key: targetInput, target };
  }

  if (scope && !VALID_SCOPE_SET.has(scope)) {
    throw new Error(`Invalid --scope value "${scope}". Use --scope user|project.`);
  }

  const userKey = `${targetInput}-user`;
  const projectKey = `${targetInput}-project`;
  const hasUser = Boolean(targets[userKey]);
  const hasProject = Boolean(targets[projectKey]);

  if (scope) {
    const scopedKey = `${targetInput}-${scope}`;
    if (!targets[scopedKey]) {
      throw new Error(`Unknown scoped target "${scopedKey}". Check your config targets.`);
    }
    return { key: scopedKey, target: targets[scopedKey] };
  }

  if (hasUser && hasProject) {
    throw new Error(
      `Target "${targetInput}" supports both user/project scopes. Please pass --scope user|project.`
    );
  }

  if (hasUser) return { key: userKey, target: targets[userKey] };
  if (hasProject) return { key: projectKey, target: targets[projectKey] };

  throw new Error(`Unknown target "${targetInput}". Check your config targets.`);
}

async function removeFileOrSymlinkIfExists(filePath) {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isDirectory()) {
      throw new Error(`Destination is a directory: ${filePath}`);
    }
    await fs.unlink(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function executePlannedSyncWrite(item, dest, targetFormat, mode, fallback, dryRun) {
  const payload = convertContentToFormat(item, targetFormat);
  const plan = planSyncWriteMode({
    requestedMode: mode,
    fallbackMode: fallback,
    requiresConversion: payload.requiresConversion
  });

  let sameLocation = false;
  let reason = plan.reason;
  try {
    sameLocation = await pathsResolveSameLocation(item.sourcePath, dest);
    if (sameLocation) reason = 'same-realpath';
  } catch {
    reason = 'unknown-realpath';
  }

  if (sameLocation) {
    return {
      status: 'skipped',
      preview: {
        id: item.id,
        format: `${item.sourceFormat} -> ${targetFormat}`,
        action: 'skipped',
        reason,
        to: dest
      }
    };
  }

  const preview = {
    id: item.id,
    format: `${item.sourceFormat} -> ${targetFormat}`,
    action: plan.effectiveMode,
    reason,
    to: dest
  };

  if (dryRun) {
    return {
      status: plan.effectiveMode === 'symlink' ? 'symlinked' : plan.fallbackUsed ? 'fallbackCopied' : 'copied',
      preview
    };
  }

  if (plan.effectiveMode === 'symlink') {
    try {
      await createSymlink(dest, item.sourcePath);
      return { status: 'symlinked', preview };
    } catch (error) {
      if (plan.fallbackMode !== 'copy') {
        return {
          status: 'failed',
          preview,
          warning: `WARN: failed symlink for ${item.id} -> ${dest}: ${error.message}`
        };
      }
      try {
        await writeFileAtomic(dest, payload.content);
        return {
          status: 'fallbackCopied',
          preview,
          warning: `WARN: symlink failed; fallback copied ${item.id} -> ${dest}`
        };
      } catch (copyError) {
        return {
          status: 'failed',
          preview,
          warning: `WARN: fallback copy failed for ${item.id} -> ${dest}: ${copyError.message}`
        };
      }
    }
  }

  try {
    await writeFileAtomic(dest, payload.content);
    return {
      status: plan.fallbackUsed ? 'fallbackCopied' : 'copied',
      preview,
      warning:
        plan.fallbackUsed && plan.reason === 'conversion' && mode === 'symlink'
          ? `WARN: conversion required; copied ${item.id} -> ${dest} instead of symlink`
          : null
    };
  } catch (error) {
    return {
      status: 'failed',
      preview,
      warning: `WARN: failed to write ${item.id} -> ${dest}: ${error.message}`
    };
  }
}

async function executeMirrorSymlink(item, sourcePath, destPath, dryRun) {
  let sameLocation = false;
  try {
    sameLocation = await pathsResolveSameLocation(sourcePath, destPath);
  } catch {}

  const preview = {
    id: item.id,
    format: `${item.sourceFormat} -> mirror`,
    action: 'symlink',
    reason: 'mirror',
    to: destPath
  };

  if (sameLocation) {
    return {
      status: 'skipped',
      preview: {
        ...preview,
        action: 'skipped',
        reason: 'same-realpath'
      }
    };
  }
  if (dryRun) {
    return { status: 'symlinked', preview };
  }

  try {
    await createSymlink(destPath, sourcePath);
    return { status: 'symlinked', preview };
  } catch (error) {
    return {
      status: 'failed',
      preview: {
        ...preview,
        action: 'failed',
        reason: 'mirror-failed'
      },
      warning: `WARN: failed to mirror canonical symlink ${destPath} -> ${sourcePath}: ${error.message}`
    };
  }
}

function combineSyncStatuses(primaryStatus, mirrorStatus = null) {
  if (!mirrorStatus || mirrorStatus === 'skipped') {
    return primaryStatus;
  }
  if (mirrorStatus === 'failed') {
    return 'failed';
  }
  return mirrorStatus;
}

function incrementSyncCounter(counters, status) {
  if (status === 'skipped') counters.skipped += 1;
  else if (status === 'symlinked') counters.symlinked += 1;
  else if (status === 'copied') counters.copied += 1;
  else if (status === 'fallbackCopied') counters.fallbackCopied += 1;
  else counters.failed += 1;
}

/**
 * 以原子方式将内容写入指定文件路径，确保在写入过程中不会留下部分写入的目标文件。
 *
 * 在写入临时文件并重命名到目标路径失败时，会尝试移除目标并重试重命名；临时文件在失败后会尝试清理。
 *
 * @param {string} filePath - 目标文件的完整路径。
 * @param {string|Buffer} content - 要写入的内容（通常为字符串，函数以 UTF-8 编码写入）。
 */
async function writeFileAtomic(filePath, content) {
  await ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await fs.writeFile(tmpPath, content, 'utf8');

  try {
    await fs.rename(tmpPath, filePath);
  } catch (renameError) {
    const code = renameError && typeof renameError === 'object' ? renameError.code : undefined;
    if (code === 'EXDEV' || code === 'EPERM' || code === 'EEXIST') {
      try {
        await removeFileOrSymlinkIfExists(filePath);
        await fs.rename(tmpPath, filePath);
        return;
      } catch {
        // Intentional no-op: swallow fallback error; will rethrow original renameError.
      }
    }
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw renameError;
  }
}

/**
 * 尝试解析给定路径的真实（规范化）路径；在目标不存在或遇到符号链接循环时返回 null。
 * @param {string} filePath - 要解析的文件或路径，可为相对或绝对路径。
 * @returns {string|null} 解析后的真实路径字符串；如果路径不存在（ENOENT）或遇到符号链接环（ELOOP），返回 `null`。
 * @throws {Error} 当发生除 ENOENT 或 ELOOP 以外的文件系统错误时抛出原始错误。
 */
async function getRealpathOrNull(filePath) {
  try {
    return await fs.realpath(filePath);
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    if (code === 'ENOENT' || code === 'ELOOP') {
      return null;
    }
    throw error;
  }
}

/**
 * 生成包含给定路径及其（若存在）真实路径的规范化绝对路径集合。
 *
 * @param {string} filePath - 要比较的原始路径（可能为相对路径）。
 * @param {string|null|undefined} realPath - 可选的真实路径（例如来自 fs.realpath），若提供将一并加入集合。
 * @returns {Set<string>} 包含规范化并解析为绝对路径的字符串集合，至少包含传入的 filePath，对 realPath 则在存在时也包含一项。
 */
function buildComparablePathSet(filePath, realPath) {
  const candidates = new Set([path.resolve(filePath)]);
  if (realPath) candidates.add(path.resolve(realPath));
  return candidates;
}

/**
 * 判断两个文件路径是否引用同一文件系统位置。
 *
 * 同时尝试解析两侧的真实路径（符号链接解析），并将原始路径与解析后的候选路径集合进行比较以决定是否等同。
 *
 * @param {string} leftPath - 左侧文件或路径。
 * @param {string} rightPath - 右侧文件或路径。
 * @returns {boolean} `true` 如果两者引用相同位置，`false` 否则。
 */
async function pathsResolveSameLocation(leftPath, rightPath) {
  const [leftRealPath, rightRealPath] = await Promise.all([
    getRealpathOrNull(leftPath),
    getRealpathOrNull(rightPath)
  ]);

  const leftCandidates = buildComparablePathSet(leftPath, leftRealPath);
  const rightCandidates = buildComparablePathSet(rightPath, rightRealPath);

  for (const candidate of leftCandidates) {
    if (rightCandidates.has(candidate)) return true;
  }
  return false;
}

/**
 * 计算在给定父目录下创建符号链接时应使用的目标路径表示。
 *
 * @param {string} parentPath - 用作符号链接所在目录的父路径。
 * @param {string} targetPath - 要指向的目标文件或目录路径（绝对或相对均可）。
 * @returns {string} 在 parentPath 中用于创建符号链接的路径：当目标与父目录相同时返回目标的基本名；若计算得到的表示为绝对路径则返回原始 targetPath；否则返回相对于 parentPath 的相对路径。
 */
function getRelativeSymlinkTarget(parentPath, targetPath) {
  const relativeTarget = path.relative(parentPath, targetPath);
  if (!relativeTarget) return path.basename(targetPath);
  if (path.isAbsolute(relativeTarget)) return targetPath;
  return relativeTarget;
}

/**
 * 在目标位置创建指向源路径的符号链接，确保父目录存在并安全替换已存在的文件或链接。
 *
 * 在创建链接前会解析相关路径并计算合适的相对链接目标，以便在可能的情况下使用相对引用并避免不必要的重复操作。
 *
 * @param {string} filePath - 将要创建的符号链接的完整目标路径（即链接文件的位置）。
 * @param {string} sourcePath - 符号链接应指向的源路径（可以是文件或目录；支持相对或绝对路径）。
 */
async function createSymlink(filePath, sourcePath) {
  await ensureParentDir(filePath);
  const realParentPath = await fs.realpath(path.dirname(filePath));
  const realTargetPath = (await getRealpathOrNull(sourcePath)) || path.resolve(sourcePath);
  const resolvedLinkPath = path.join(realParentPath, path.basename(filePath));
  const relativeTarget = getRelativeSymlinkTarget(realParentPath, realTargetPath);

  await removeFileOrSymlinkIfExists(resolvedLinkPath);
  await fs.symlink(relativeTarget, resolvedLinkPath);
}

/**
 * 将已注册的技能文件同步到指定目标（创建符号链接或写入文件），并在需要时执行格式转换或回退复制。
 *
 * 逐个评估注册表中可同步的技能，基于命令行选项和目标配置决定对每个项目的实际写入策略（symlink 或 copy），可先进行 dry-run 预览；在非 dry-run 模式下会在目标位置创建符号链接或以原子方式写入文件，统计并输出同步结果。
 *
 * @param {Object} flags - 命令行标志与选项（例如：to/target、scope、mode、fallback、dry-run、config、registry、all）。
 * @param {Object} context - 运行上下文，至少包含 projectRoot，用于解析模板路径等。
 * @throws {Error} 当未指定有效目标（--to/--target）或目标解析失败时抛出。
 * @throws {Error} 当提供了无效的 --mode 或 --fallback 值时抛出。
 */
async function cmdSync(flags, context) {
  const targetInput = flags.to || flags.target;
  if (!targetInput || typeof targetInput !== 'string') {
    throw new Error('Usage: skillsdock sync --to <agent|target> --scope <user|project>');
  }

  const projectRoot = context.projectRoot;
  const { config } = await loadConfig(flags.config, projectRoot);
  const { registry } = await loadRegistry(flags.registry);

  const scope = typeof flags.scope === 'string' ? flags.scope : undefined;
  const { key: targetKey, target: targetCfg } = resolveSyncTarget(config, targetInput, scope);

  const mode = String(flags.mode || 'symlink');
  const fallback = String(flags.fallback || 'copy');
  if (!VALID_SYNC_MODE_SET.has(mode)) {
    throw new Error(`Invalid --mode "${mode}". Use --mode symlink|copy.`);
  }
  if (!VALID_FALLBACK_SET.has(fallback)) {
    throw new Error(`Invalid --fallback "${fallback}". Use --fallback copy|fail.`);
  }

  const dryRun = Boolean(flags['dry-run'] || flags.dryRun);
  const items = getRegistryItems(registry)
    .filter((item) => item.state === 'active')
    .filter((item) => isSyncEligible(item))
    .filter((item) => (flags.all ? true : item.isPrimary))
    .sort((a, b) => a.id.localeCompare(b.id));

  const basePath = resolveTemplatePath(targetCfg.path, { projectRoot });
  const targetFormat = normalizeTargetFormat(targetCfg.format, targetCfg.path);
  const targetAgentId = targetCfg.agent || String(targetKey).replace(/-(user|project)$/, '');
  const registryAgent = findAgentRegistryEntry(targetAgentId);
  const scopeValue = targetCfg.scope || scope || 'user';
  const useCanonicalSkillTarget = Boolean(registryAgent) && isSkillMdFormat(targetFormat, targetCfg.path);
  const isUniversalSkillTarget = useCanonicalSkillTarget && isUniversalAgent(targetAgentId);
  const canonicalBasePath = useCanonicalSkillTarget
    ? resolveTemplatePath(getCanonicalSkillsPathTemplate(scopeValue), { projectRoot })
    : null;
  const canonicalTargetCfg = useCanonicalSkillTarget
    ? {
        path: getCanonicalSkillsPathTemplate(scopeValue),
        format: 'skill-md',
        layout: 'nested',
        filename: 'SKILL.md'
      }
    : null;

  const counters = {
    symlinked: 0,
    copied: 0,
    fallbackCopied: 0,
    skipped: 0,
    failed: 0
  };
  const previews = [];

  for (const item of items) {
    const primaryDest = useCanonicalSkillTarget
      ? getTargetFilePath(canonicalBasePath, canonicalTargetCfg, item)
      : getTargetFilePath(basePath, targetCfg, item);
    const primaryFormat = useCanonicalSkillTarget ? 'skill-md' : targetFormat;
    const primaryResult = await executePlannedSyncWrite(
      item,
      primaryDest,
      primaryFormat,
      mode,
      fallback,
      dryRun
    );

    previews.push(primaryResult.preview);
    if (primaryResult.warning) {
      console.log(primaryResult.warning);
    }
    let finalStatus = primaryResult.status;

    if (useCanonicalSkillTarget && !isUniversalSkillTarget) {
      const mirrorDest = getTargetFilePath(basePath, targetCfg, item);
      if (primaryResult.status === 'failed') {
        previews.push({
          id: item.id,
          format: `${item.sourceFormat} -> mirror`,
          action: 'skipped',
          reason: 'primary-failed',
          to: mirrorDest
        });
      } else {
        const mirrorResult = await executeMirrorSymlink(item, primaryDest, mirrorDest, dryRun);
        previews.push(mirrorResult.preview);
        if (mirrorResult.warning) {
          console.log(mirrorResult.warning);
        }
        finalStatus = combineSyncStatuses(primaryResult.status, mirrorResult.status);
      }
    }

    incrementSyncCounter(counters, finalStatus);
  }

  if (dryRun) {
    console.log(
      `Dry run: ${items.length - counters.skipped} file(s) would be synced to ${targetKey} -> ${
        useCanonicalSkillTarget ? canonicalBasePath : basePath
      } (skipped=${counters.skipped})`
    );
    printTable(previews.slice(0, 20), [
      { label: 'ID', get: (row) => row.id, min: 12, max: 30 },
      { label: 'Format', get: (row) => row.format, min: 16, max: 30 },
      { label: 'Action', get: (row) => row.action, min: 8, max: 10 },
      { label: 'Reason', get: (row) => row.reason, min: 10, max: 18 },
      { label: 'Destination', get: (row) => row.to, min: 20, max: 90 }
    ]);
    if (previews.length > 20) console.log(`...and ${previews.length - 20} more`);
    console.log(
      `Result: symlinked=${counters.symlinked} copied=${counters.copied} fallbackCopied=${counters.fallbackCopied} skipped=${counters.skipped} failed=${counters.failed}`
    );
    return;
  }

  const successCount = counters.symlinked + counters.copied + counters.fallbackCopied;
  console.log(
    `Synced ${successCount} skill file(s) to ${targetKey} -> ${
      useCanonicalSkillTarget ? canonicalBasePath : basePath
    } (skipped=${counters.skipped})`
  );
  console.log(
    `Result: symlinked=${counters.symlinked} copied=${counters.copied} fallbackCopied=${counters.fallbackCopied} skipped=${counters.skipped} failed=${counters.failed}`
  );

  if (counters.failed > 0) {
    process.exitCode = 1;
  }
}

async function getNearestWritableAncestor(targetPath) {
  let current = path.resolve(targetPath);

  while (true) {
    try {
      const stat = await fs.stat(current);
      await fs.access(current, fsSync.constants.W_OK);
      return { ready: true, path: current };
    } catch (error) {
      if (error?.code && error.code !== 'ENOENT') {
        return { ready: false, path: current };
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return { ready: false, path: current };
    }
    current = parent;
  }
}

async function buildDoctorAgentMatrixRows(config, context, options = {}) {
  const projectRoot = context.projectRoot;
  const homeDir = options.homeDir || HOME;
  const pathExistsFn = options.pathExists || fsSync.existsSync;
  const resolveWritable = options.resolveWritable || getNearestWritableAncestor;
  const sourceMap = new Map();
  for (const source of config.sources || []) {
    if (!source || typeof source !== 'object') continue;
    const aliases = uniqueSourceAliases([
      ...(Array.isArray(source.sourceAliases) ? source.sourceAliases : []),
      {
        name: source.name,
        agent: source.agent,
        scope: source.scope
      }
    ]);
    for (const alias of aliases) {
      if (!sourceMap.has(alias.name)) {
        sourceMap.set(alias.name, source);
      }
    }
  }
  const targetMap = new Map(Object.entries(config.targets || {}));
  const rows = [];

  for (const agent of AGENT_REGISTRY.agents) {
    for (const scope of ['user', 'project']) {
      const scopeConfig = agent.scopes?.[scope];
      if (!scopeConfig) continue;

      const sourceName = `${agent.id}-${scope}`;
      const sourceCfg = sourceMap.get(sourceName) || {
        ...scopeConfig.source,
        name: sourceName,
        format: scopeConfig.source.format,
        optional: true
      };
      const sourcePath = resolveTemplatePath(sourceCfg.path, { projectRoot, homeDir });
      const sourceExists = await Promise.resolve(pathExistsFn(sourcePath)).then(Boolean);

      const targetKey = `${agent.id}-${scope}`;
      const targetCfg = targetMap.get(targetKey) || {
        ...scopeConfig.target,
        name: targetKey,
        format: scopeConfig.target.format,
        layout: scopeConfig.target.layout
      };
      const targetPath = resolveTemplatePath(targetCfg.path, { projectRoot, homeDir });
      const writable = await resolveWritable(targetPath);

      rows.push({
        agent: agent.id,
        displayName: agent.displayName || agent.id,
        referenceId: agent.referenceId || agent.id,
        scope,
        installFamily: agent.installFamily || 'dedicated',
        canonicalDir: agent.canonicalDir || '',
        format: `${sourceCfg.format} -> ${targetCfg.format}`,
        installed: await detectScopeInstalled(scopeConfig, {
          projectRoot,
          homeDir,
          pathExists: pathExistsFn
        }),
        sourceExists: sourceExists ? 'yes' : 'no',
        targetReady: writable.ready ? 'yes' : 'no',
        sourcePath,
        targetPath
      });
    }
  }

  return rows;
}

async function cmdDoctorAgents(config, context) {
  const rows = await buildDoctorAgentMatrixRows(config, context);

  console.log('\nAgent Matrix:');
  printTable(rows, [
    { label: 'Agent', get: (row) => row.agent, min: 8, max: 12 },
    { label: 'Scope', get: (row) => row.scope, min: 7, max: 7 },
    { label: 'Family', get: (row) => row.installFamily, min: 9, max: 10 },
    { label: 'Canonical', get: (row) => row.canonicalDir, min: 12, max: 20 },
    { label: 'Format', get: (row) => row.format, min: 18, max: 24 },
    { label: 'Installed', get: (row) => row.installed, min: 9, max: 11 },
    { label: 'Source', get: (row) => row.sourceExists, min: 6, max: 6 },
    { label: 'Target', get: (row) => row.targetReady, min: 6, max: 6 },
    { label: 'Source Path', get: (row) => row.sourcePath, min: 20, max: 40 },
    { label: 'Target Path', get: (row) => row.targetPath, min: 20, max: 40 }
  ]);
}

function validateSkillNameAgainstSpec(name) {
  if (typeof name !== 'string') {
    return 'frontmatter name must be a string';
  }
  const normalized = name.trim();
  if (!normalized) {
    return 'frontmatter name must be non-empty';
  }
  if (normalized.length > 64) {
    return `frontmatter name exceeds 64 chars: ${normalized.length}`;
  }
  if (!SKILL_NAME_SPEC_REGEX.test(normalized)) {
    return `frontmatter name should match ${SKILL_NAME_SPEC_REGEX} (recommended lowercase + hyphen style)`;
  }
  return null;
}

async function collectSkillsSpecDiagnostics(config, context) {
  const issues = [];
  const notes = [];
  const projectRoot = context.projectRoot;
  let checkedCount = 0;

  for (const source of config.sources || []) {
    const sourcePath = resolveTemplatePath(source.path, { projectRoot });
    if (!fsSync.existsSync(sourcePath)) continue;

    const sourceFormat = normalizeSourceFormat(source.format, source.path);
    if (sourceFormat !== 'skill-md') continue;

    const pluginDiscovery = await getPluginSkillSearchResult(sourcePath);
    for (const warning of pluginDiscovery.warnings) {
      issues.push(`skills-spec (${source.name}): ${warning}`);
    }

    const skillFiles = await collectSkillFiles(
      sourcePath,
      sourceFormat,
      config.scan.maxDepth,
      config.scan.ignoreDirs
    );

    for (const filePath of skillFiles) {
      let parsed;
      try {
        parsed = await parseSkillRecord(filePath, source, sourcePath, sourceFormat, config.scan);
      } catch (error) {
        issues.push(
          `skills-spec (${source.name}): failed to parse ${filePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        continue;
      }

      checkedCount += 1;
      const nameIssue = validateSkillNameAgainstSpec(parsed.metadata?.name);
      if (nameIssue) {
        issues.push(`skills-spec (${source.name}): ${filePath}: ${nameIssue}`);
      }
    }
  }

  notes.push(`Skills spec checked files: ${checkedCount}`);
  return { issues, notes };
}

async function collectExternalLockDiagnostics(registry) {
  const lockState = await readExternalSkillLock();
  const issues = [];
  const notes = [];

  if (!lockState.exists) {
    notes.push(`External lockfile optional and missing: ${lockState.path}`);
    return { issues, notes };
  }

  notes.push(`External lockfile: ${lockState.path}`);

  if (!lockState.healthy) {
    issues.push(...lockState.issues);
    return { issues, notes };
  }

  notes.push(`Lockfile version: ${lockState.version}`);
  notes.push(`Lockfile entries: ${lockState.count}`);

  const registryItems = getRegistryItems(registry);
  for (const [skillName] of lockState.entriesByName) {
    const expectedPath = path.join(getExternalSkillInstallDir(), skillName, 'SKILL.md');
    if (!(await pathExists(expectedPath))) {
      issues.push(`External lockfile entry missing local skill file: ${skillName} -> ${expectedPath}`);
      continue;
    }

    const matched = registryItems.find(
      (item) =>
        item.id === skillName ||
        item.canonicalPath === expectedPath ||
        item.realPath === expectedPath ||
        item.sourcePath === expectedPath
    );
    if (!matched) {
      issues.push(`External lockfile entry is not present in registry: ${skillName} -> ${expectedPath}`);
    }
  }

  return { issues, notes };
}

async function cmdDoctor(flags, context) {
  const projectRoot = context.projectRoot;
  const { configPath, config } = await loadConfig(flags.config, projectRoot);
  const { registryPath, registry } = await loadRegistry(flags.registry);

  const issues = [];
  const notes = [];

  if (!(await pathExists(configPath))) {
    issues.push(`Config not found: ${configPath}`);
  } else {
    notes.push(`Config: ${configPath}`);
  }

  if (!(await pathExists(registryPath))) {
    issues.push(`Registry not found: ${registryPath}`);
  } else {
    notes.push(`Registry: ${registryPath}`);
    notes.push(`Last scan: ${registry.lastScanAt || 'never'}`);
    notes.push(`Items: ${Object.keys(registry.items || {}).length}`);

    const byCanonicalPath = registry.index?.byCanonicalPath || {};
    for (const [canonicalPath, key] of Object.entries(byCanonicalPath)) {
      const item = registry.items?.[key];
      if (!item) {
        issues.push(`Registry index mismatch: missing item for canonical path ${canonicalPath}`);
        continue;
      }
      if (item.canonicalPath !== canonicalPath) {
        issues.push(`Registry index mismatch: key ${key} points to unexpected canonical path`);
      }
    }
  }

  const externalLock = await collectExternalLockDiagnostics(registry);
  notes.push(...externalLock.notes);
  issues.push(...externalLock.issues);

  for (const source of config.sources || []) {
    const sourcePath = resolveTemplatePath(source.path, { projectRoot });
    if (!fsSync.existsSync(sourcePath)) {
      if (source.optional) notes.push(`Source optional and missing (${source.name}): ${sourcePath}`);
      else issues.push(`Missing source path (${source.name}): ${sourcePath}`);
    } else {
      notes.push(`Source OK (${source.name}): ${sourcePath}`);
    }
  }

  for (const [name, target] of Object.entries(config.targets || {})) {
    const targetPath = resolveTemplatePath(target.path, { projectRoot });
    const readiness = await getNearestWritableAncestor(path.dirname(targetPath));
    if (!readiness.ready) {
      issues.push(`Target not writable (${name}): ${targetPath}`);
    } else {
      notes.push(`Target configured (${name}): ${targetPath}`);
    }
  }

  for (const line of notes) console.log(`OK: ${line}`);
  for (const line of issues) console.log(`WARN: ${line}`);

  if (flags.agents) {
    await cmdDoctorAgents(config, context);
  }
  if (flags['skills-spec'] || flags.skillsSpec) {
    const skillsSpec = await collectSkillsSpecDiagnostics(config, context);
    for (const line of skillsSpec.notes) console.log(`OK: ${line}`);
    for (const line of skillsSpec.issues) console.log(`WARN: ${line}`);
    issues.push(...skillsSpec.issues);
  }

  if (issues.length === 0) {
    console.log('\nDoctor result: healthy');
  } else {
    console.log(`\nDoctor result: ${issues.length} warning(s)`);
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------ */
/*  Source Parser – classify & parse skill sources (add-command prep)  */
/* ------------------------------------------------------------------ */

function _parseGitHubUrlPath(pathname, base) {
  const parts = pathname.split('/');
  if (parts.length < 2) return { ...base, type: 'github' };

  const owner = parts[0];
  const repo = parts[1];
  let branch = null;
  let subpath = null;

  if (parts.length > 3 && parts[2] === 'tree') {
    branch = parts[3];
    if (parts.length > 4) {
      subpath = sanitizeSubpath(parts.slice(4).join('/'));
    }
  }

  return { ...base, type: 'github', owner, repo, branch, subpath };
}

function _parseGitLabUrlPath(pathname, base) {
  const parts = pathname.split('/');

  let pathParts, branch = null, subpath = null;

  const dashIdx = parts.indexOf('-');
  if (dashIdx !== -1 && parts[dashIdx + 1] === 'tree') {
    pathParts = parts.slice(0, dashIdx);
    if (parts.length > dashIdx + 2) branch = parts[dashIdx + 2];
    if (parts.length > dashIdx + 3) {
      subpath = sanitizeSubpath(parts.slice(dashIdx + 3).join('/'));
    }
  } else {
    const treeIdx = parts.indexOf('tree');
    if (treeIdx !== -1) {
      pathParts = parts.slice(0, treeIdx);
      if (parts.length > treeIdx + 1) branch = parts[treeIdx + 1];
      if (parts.length > treeIdx + 2) {
        subpath = sanitizeSubpath(parts.slice(treeIdx + 2).join('/'));
      }
    } else {
      pathParts = parts;
    }
  }

  if (pathParts.length < 2) return { ...base, type: 'gitlab' };

  const owner = pathParts.slice(0, -1).join('/');
  const repo = pathParts[pathParts.length - 1];

  return { ...base, type: 'gitlab', owner, repo, branch, subpath };
}

function _parseShorthand(input, base, type) {
  let skillFilter = null;
  let ownerRepo = input;

  const atIdx = input.indexOf('@');
  if (atIdx !== -1) {
    skillFilter = input.slice(atIdx + 1) || null;
    ownerRepo = input.slice(0, atIdx);
  }

  ownerRepo = ownerRepo.replace(/\/$/, '').replace(/\.git$/, '');

  const parts = ownerRepo.split('/');
  if (parts.length < 2) {
    return { ...base, type, owner: parts[0] || null, repo: null, skillFilter };
  }

  const owner = type === 'gitlab' ? parts.slice(0, -1).join('/') : parts[0];
  const repo = parts[parts.length - 1];

  return { ...base, type, owner, repo, skillFilter };
}

function sanitizeSubpath(subpath) {
  if (subpath == null) return subpath;
  const normalized = subpath.replace(/\\/g, '/');
  for (const seg of normalized.split('/')) {
    if (seg === '..') {
      throw new Error(`Path traversal detected in subpath: "${subpath}"`);
    }
  }
  return normalized;
}

function parseSource(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Source argument is required and must be a non-empty string');
  }

  const trimmed = raw.trim();
  const base = {
    type: null,
    owner: null,
    repo: null,
    branch: null,
    subpath: null,
    skillFilter: null,
    raw: trimmed,
  };

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') || trimmed.startsWith('.\\') ||
    trimmed.startsWith('../') || trimmed.startsWith('..\\') ||
    trimmed === '.' || trimmed === '..' ||
    /^[A-Za-z]:[\\\/]/.test(trimmed)
  ) {
    return { ...base, type: 'local' };
  }

  const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?\/?$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const pathPart = sshMatch[2];
    const segments = pathPart.split('/');
    const type = host.includes('gitlab') ? 'gitlab'
      : host.includes('github') ? 'github'
        : 'git-ssh';
    if (segments.length >= 2) {
      const owner = segments.slice(0, -1).join('/');
      const repo = segments[segments.length - 1];
      return { ...base, type, owner, repo };
    }
    return { ...base, type: 'git-ssh' };
  }

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const url = new URL(trimmed);
      const hostname = url.hostname;
      let pathname = url.pathname
        .replace(/^\//, '')
        .replace(/\/$/, '')
        .replace(/\.git$/, '');

      if (hostname.includes('github.com')) {
        return _parseGitHubUrlPath(pathname, base);
      }
      if (hostname.includes('gitlab.com')) {
        return _parseGitLabUrlPath(pathname, base);
      }

      const parts = pathname.split('/');
      if (parts.length >= 2) {
        return { ...base, type: 'git-ssh', owner: parts[0], repo: parts[1] };
      }
      return { ...base, type: 'git-ssh' };
    } catch {
      // malformed URL – fall through
    }
  }

  const prefixMatch = trimmed.match(/^(github|gitlab):(.+)$/);
  if (prefixMatch) {
    return _parseShorthand(prefixMatch[2], base, prefixMatch[1]);
  }

  if (/^[^\s\/]+\/[^\s\/]+(@[^\s\/]+)?$/.test(trimmed)) {
    return _parseShorthand(trimmed, base, 'github');
  }

  return { ...base, type: 'local' };
}

function getOwnerRepo(parsed) {
  if (!parsed || !parsed.owner || !parsed.repo) return null;
  return `${parsed.owner}/${parsed.repo}`;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const { flags, positional } = parseArgs(argv);
  const command = positional[0];
  const args = positional.slice(1);
  const cwd = options.cwd || process.cwd();
  const context = {
    cwd,
    projectRoot: detectProjectRoot(cwd)
  };

  if (!command || flags.help || flags.h) {
    printHelp();
    return;
  }
  if (command === 'version' || flags.version || flags.v) {
    console.log(APP_VERSION);
    return;
  }

  if (command === 'init') {
    await cmdInit(flags, args, context);
    return;
  }
  if (command === 'scan') {
    await cmdScan(flags, args, context);
    return;
  }
  if (command === 'all-local-skills') {
    await cmdAllLocalSkills(flags);
    return;
  }
  if (command === 'skill-detail') {
    await cmdSkillDetail(flags, args);
    return;
  }
  if (command === 'tag') {
    await cmdTag(flags, args);
    return;
  }
  if (command === 'cleanup') {
    await cmdCleanup(flags);
    return;
  }
  if (command === 'list') {
    await cmdList(flags);
    return;
  }
  if (command === 'inspect') {
    await cmdInspect(flags, args);
    return;
  }
  if (command === 'sync') {
    await cmdSync(flags, context);
    return;
  }
  if (command === 'doctor') {
    await cmdDoctor(flags, context);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

export {
  AGENT_REGISTRY,
  APP_VERSION,
  buildDefaultConfig,
  buildDoctorAgentMatrixRows,
  buildCleanupPlan,
  convertContentToFormat,
  detectProjectRoot,
  getOwnerRepo,
  normalizeRegistry,
  normalizeConfigV2,
  parseContentForFormat,
  parseSource,
  planSyncWriteMode,
  resolveSelectorMatches,
  resolveSyncTarget,
  resolveTemplatePath,
  pickPreferredCanonicalPath,
  sanitizeSubpath
};
