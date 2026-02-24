import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'skillsdock';
const APP_VERSION = '0.1.1';

const HOME = os.homedir();
const APP_DIR = path.join(HOME, '.skillsdock');
const DEFAULT_CONFIG_PATH = path.join(APP_DIR, 'config.json');
const DEFAULT_REGISTRY_PATH = path.join(APP_DIR, 'registry.json');

const CORE_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENT_REGISTRY_PATH = path.join(CORE_DIR, 'agent-registry.json');
const AGENT_REGISTRY = loadAgentRegistry();

const VALID_SCOPE_SET = new Set(['user', 'project']);
const VALID_FORMAT_SET = new Set(['skill-md', 'mdc', 'openclaw-md', 'opencode-md']);
const VALID_SYNC_MODE_SET = new Set(['symlink', 'copy']);
const VALID_FALLBACK_SET = new Set(['copy', 'fail']);

const DEFAULT_SCAN = {
  maxDepth: 8,
  ignoreDirs: ['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache']
};

const DEFAULT_REGISTRY = {
  version: 1,
  lastScanAt: null,
  updatedAt: null,
  items: {}
};

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

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ''));
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
  if (!content.startsWith('---\n')) {
    return { metadata: {}, body: content.trim() };
  }

  const end = content.indexOf('\n---\n', 4);
  if (end < 0) {
    return { metadata: {}, body: content.trim() };
  }

  const metaBlock = content.slice(4, end);
  const body = content.slice(end + 5).trim();
  const metadata = {};

  for (const line of metaBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }

  return { metadata, body };
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

  await walk(fullRoot, 0);
  return files;
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

function parseContentForFormat(format, raw, filePath) {
  const sourceFormat = normalizeSourceFormat(format, filePath);

  if (sourceFormat === 'skill-md') {
    const { metadata, body } = parseFrontmatter(raw);
    const normalized = {
      name: String(metadata.name || inferNameFromPath(filePath)),
      description: String(metadata.description || firstBodyLine(body)),
      body: normalizeBody(body)
    };
    return { metadata, normalized };
  }

  if (sourceFormat === 'mdc' || sourceFormat === 'openclaw-md' || sourceFormat === 'opencode-md') {
    const { metadata, body } = parseFrontmatter(raw);
    const normalized = {
      name: String(metadata.name || inferNameFromPath(filePath)),
      description: String(metadata.description || firstBodyLine(body || raw)),
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

function buildDefaultConfig(projectRoot = detectProjectRoot(process.cwd())) {
  const sources = [];
  const targets = {};

  for (const agent of AGENT_REGISTRY.agents) {
    for (const scope of ['user', 'project']) {
      const scopeConfig = agent.scopes?.[scope];
      if (!scopeConfig) continue;

      const source = makeSourceEntry(agent, scope, scopeConfig.source);
      const target = makeTargetEntry(agent, scope, scopeConfig.target);

      sources.push(source);
      targets[target.name] = target;
    }
  }

  return {
    version: 2,
    meta: {
      projectRoot
    },
    sources,
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

function normalizeRegistry(input) {
  const data = input && typeof input === 'object' ? input : {};
  return {
    version: 1,
    lastScanAt: data.lastScanAt || null,
    updatedAt: data.updatedAt || null,
    items: data.items && typeof data.items === 'object' ? data.items : {}
  };
}

function printHelp() {
  console.log(`
${APP_NAME} v${APP_VERSION}

Usage:
  skillsdock init [--config <path>] [--registry <path>]
  skillsdock scan [paths...] [--config <path>] [--registry <path>]
  skillsdock list [--config <path>] [--registry <path>] [--source <name>] [--changed] [--all] [--json]
  skillsdock inspect <id|key> [--registry <path>] [--json]
  skillsdock sync --to <agent|target> --scope <user|project> [--registry <path>] [--config <path>] [--mode <symlink|copy>] [--fallback <copy|fail>] [--dry-run] [--all]
  skillsdock doctor [--config <path>] [--registry <path>] [--agents]
  skillsdock version

Examples:
  skillsdock init
  skillsdock scan ~/Coding ~/Work
  skillsdock list --changed
  skillsdock sync --to openclaw --scope user --dry-run
`);
}

function padCell(value, width) {
  const text = String(value ?? '');
  if (text.length >= width) return text.slice(0, Math.max(width - 1, 1)).concat('…');
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

async function cmdInit(flags, context) {
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

async function parseSkillRecord(filePath, sourceName, sourceRoot, sourceFormat) {
  const ext = path.extname(filePath).toLowerCase();
  let raw;

  if (sourceFormat === 'skill-md' && ext === '.skill') {
    raw = await extractSkillMarkdownFromPackage(filePath);
  } else {
    raw = await fs.readFile(filePath, 'utf8');
  }

  const { metadata, normalized } = parseContentForFormat(sourceFormat, raw, filePath);
  const stat = await fs.stat(filePath);
  const gitMeta = tryGetGitMetadata(filePath);

  const id = slugify(normalized.name || inferNameFromPath(filePath));
  const description = String(normalized.description || firstBodyLine(normalized.body));

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
    normalized,
    content: raw,
    body: normalized.body,
    hash: sha256(raw),
    sourceName,
    sourceRoot: resolvedSourceRoot,
    sourcePath: path.resolve(filePath),
    relativePath,
    sourceFormat,
    format: sourceFormat,
    createdAt: gitMeta?.createdAt || toIso(stat.birthtime) || toIso(stat.ctime),
    updatedAt: gitMeta?.updatedAt || toIso(stat.mtime),
    originRepo: gitMeta?.originRepo || null
  };
}

async function cmdScan(flags, positionalArgs, context) {
  const projectRoot = context.projectRoot;
  const { config } = await loadConfig(flags.config, projectRoot);
  const { registryPath, registry } = await loadRegistry(flags.registry);

  const now = new Date().toISOString();
  const sourceInputs =
    positionalArgs.length > 0
      ? positionalArgs.map((inputPath, index) => ({
          name: `arg-${index + 1}`,
          path: inputPath,
          format: inferSourceFormatFromPath(inputPath),
          optional: false
        }))
      : config.sources;

  if (!Array.isArray(sourceInputs) || sourceInputs.length === 0) {
    throw new Error('No scan sources configured. Run "skillsdock init" and update config.');
  }

  const seenKeys = new Set();
  const sourceNames = [];
  let discovered = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let parseErrors = 0;

  for (const source of sourceInputs) {
    const sourceName = source.name || slugify(source.path || 'source');
    const sourcePathInput = source.path;
    if (!sourcePathInput) continue;

    const sourcePath = resolveTemplatePath(sourcePathInput, { projectRoot });
    const sourceFormat = normalizeSourceFormat(source.format, sourcePathInput);

    sourceNames.push(sourceName);

    const skillFiles = await collectSkillFiles(
      sourcePath,
      sourceFormat,
      config.scan.maxDepth,
      config.scan.ignoreDirs
    );
    discovered += skillFiles.length;

    for (const filePath of skillFiles) {
      let parsed;
      try {
        parsed = await parseSkillRecord(filePath, sourceName, sourcePath, sourceFormat);
      } catch {
        parseErrors += 1;
        continue;
      }

      const key = `${sourceName}:${parsed.sourcePath}`;
      seenKeys.add(key);
      const existing = registry.items[key];
      const changed = !existing || existing.hash !== parsed.hash;

      if (!existing) created += 1;
      else if (changed) updated += 1;
      else unchanged += 1;

      registry.items[key] = {
        ...existing,
        ...parsed,
        key,
        state: 'active',
        firstSeenAt: existing?.firstSeenAt || now,
        lastSeenAt: now,
        changedAt: changed ? now : existing?.changedAt || existing?.firstSeenAt || now
      };
    }
  }

  let missing = 0;
  const scannedSourceSet = new Set(sourceNames);
  for (const [key, item] of Object.entries(registry.items)) {
    if (!scannedSourceSet.has(item.sourceName)) continue;
    if (seenKeys.has(key)) continue;
    if (item.state !== 'missing') missing += 1;
    registry.items[key] = {
      ...item,
      state: 'missing'
    };
  }

  const sourceOrder = new Map(sourceNames.map((name, index) => [name, index]));
  const byId = new Map();
  for (const item of Object.values(registry.items)) {
    if (item.state !== 'active') continue;
    if (!byId.has(item.id)) byId.set(item.id, []);
    byId.get(item.id).push(item);
  }
  for (const items of byId.values()) {
    items.sort((a, b) => {
      const sourceDiff = (sourceOrder.get(a.sourceName) ?? 9999) - (sourceOrder.get(b.sourceName) ?? 9999);
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
  await writeJson(registryPath, registry);

  console.log(`Scanned ${sourceNames.length} source(s)`);
  console.log(`Found files: ${discovered}`);
  console.log(`New: ${created} | Updated: ${updated} | Unchanged: ${unchanged} | Missing: ${missing}`);
  if (parseErrors > 0) console.log(`Parse errors: ${parseErrors}`);
  console.log(`Registry: ${registryPath}`);
}

function filterListItems(items, flags, registry) {
  let list = items.filter((item) => (flags.all ? true : item.state === 'active'));

  if (flags.source) {
    list = list.filter((item) => item.sourceName === flags.source);
  }

  if (flags.changed) {
    const changedIds = new Set(
      items
        .filter((item) => item.state === 'active' && item.changedAt === registry.lastScanAt)
        .map((item) => item.id)
    );
    list = list.filter((item) => changedIds.has(item.id));
  }

  if (!flags.all) {
    list = list.filter((item) => item.isPrimary);
  }

  return list;
}

async function cmdList(flags) {
  const { registry } = await loadRegistry(flags.registry);
  const items = Object.values(registry.items || {});
  const list = filterListItems(items, flags, registry).sort((a, b) => a.id.localeCompare(b.id));

  if (flags.json) {
    console.log(JSON.stringify({ count: list.length, items: list }, null, 2));
    return;
  }

  if (list.length === 0) {
    console.log('No skills found in registry.');
    return;
  }

  printTable(list, [
    { label: 'ID', get: (row) => row.id, min: 12, max: 34 },
    { label: 'Source', get: (row) => row.sourceName, min: 8, max: 22 },
    { label: 'Format', get: (row) => row.sourceFormat, min: 8, max: 12 },
    { label: 'State', get: (row) => row.state, min: 8, max: 10 },
    { label: 'Updated', get: (row) => (row.updatedAt || '').slice(0, 19), min: 19, max: 19 },
    { label: 'Path', get: (row) => row.sourcePath, min: 20, max: 80 }
  ]);

  console.log(`\nTotal: ${list.length}`);
}

async function cmdInspect(flags, positionalArgs) {
  const query = positionalArgs[0];
  if (!query) {
    throw new Error('Usage: skillsdock inspect <id|key>');
  }

  const { registry } = await loadRegistry(flags.registry);
  const items = Object.values(registry.items || {});

  let matched = items.find((item) => item.key === query);
  if (!matched) {
    const candidates = items.filter((item) => item.id === query && item.state === 'active');
    matched = candidates.find((item) => item.isPrimary) || candidates[0];
  }
  if (!matched) {
    throw new Error(`Skill not found: ${query}`);
  }

  const siblings = items
    .filter((item) => item.id === matched.id)
    .map((item) => ({
      key: item.key,
      sourceName: item.sourceName,
      sourcePath: item.sourcePath,
      sourceFormat: item.sourceFormat,
      state: item.state,
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
  console.log(`Source: ${matched.sourceName}`);
  console.log(`Format: ${matched.sourceFormat}`);
  console.log(`Path: ${matched.sourcePath}`);
  console.log(`State: ${matched.state}`);
  console.log(`Primary: ${matched.isPrimary ? 'yes' : 'no'}`);
  console.log(`Hash: ${matched.hash}`);
  console.log(`Created: ${matched.createdAt || '-'}`);
  console.log(`Updated: ${matched.updatedAt || '-'}`);
  console.log(`First Seen: ${matched.firstSeenAt || '-'}`);
  console.log(`Last Seen: ${matched.lastSeenAt || '-'}`);
  if (matched.originRepo) console.log(`Git Origin: ${matched.originRepo}`);
  console.log(`\nCopies: ${siblings.length}`);
  for (const sibling of siblings) {
    console.log(
      `- ${sibling.isPrimary ? '[primary] ' : ''}${sibling.sourceName} (${sibling.sourceFormat}): ${sibling.sourcePath}`
    );
  }
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
      } catch {}
    }
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw renameError;
  }
}

async function createSymlink(filePath, sourcePath) {
  await ensureParentDir(filePath);
  await removeFileOrSymlinkIfExists(filePath);
  await fs.symlink(sourcePath, filePath);
}

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
  const items = Object.values(registry.items || {})
    .filter((item) => item.state === 'active')
    .filter((item) => (flags.all ? true : item.isPrimary))
    .sort((a, b) => a.id.localeCompare(b.id));

  const basePath = resolveTemplatePath(targetCfg.path, { projectRoot });
  const targetFormat = normalizeTargetFormat(targetCfg.format, targetCfg.path);

  const counters = {
    symlinked: 0,
    copied: 0,
    fallbackCopied: 0,
    failed: 0
  };
  const previews = [];

  for (const item of items) {
    const dest = getTargetFilePath(basePath, targetCfg, item);
    const payload = convertContentToFormat(item, targetFormat);
    const plan = planSyncWriteMode({
      requestedMode: mode,
      fallbackMode: fallback,
      requiresConversion: payload.requiresConversion
    });

    previews.push({
      id: item.id,
      format: `${item.sourceFormat} -> ${targetFormat}`,
      action: plan.effectiveMode,
      reason: plan.reason,
      to: dest
    });

    if (dryRun) {
      if (plan.effectiveMode === 'symlink') counters.symlinked += 1;
      else if (plan.fallbackUsed) counters.fallbackCopied += 1;
      else counters.copied += 1;
      continue;
    }

    if (plan.fallbackUsed && plan.reason === 'conversion' && mode === 'symlink') {
      console.log(`WARN: conversion required; copied ${item.id} -> ${dest} instead of symlink`);
    }

    if (plan.effectiveMode === 'symlink') {
      try {
        await createSymlink(dest, item.sourcePath);
        counters.symlinked += 1;
        continue;
      } catch (error) {
        if (plan.fallbackMode !== 'copy') {
          counters.failed += 1;
          console.log(`WARN: failed symlink for ${item.id} -> ${dest}: ${error.message}`);
          continue;
        }
        try {
          await writeFileAtomic(dest, payload.content);
          counters.fallbackCopied += 1;
          console.log(`WARN: symlink failed; fallback copied ${item.id} -> ${dest}`);
          continue;
        } catch (copyError) {
          counters.failed += 1;
          console.log(`WARN: fallback copy failed for ${item.id} -> ${dest}: ${copyError.message}`);
          continue;
        }
      }
    }

    try {
      await writeFileAtomic(dest, payload.content);
      if (plan.fallbackUsed) counters.fallbackCopied += 1;
      else counters.copied += 1;
    } catch (error) {
      counters.failed += 1;
      console.log(`WARN: failed to write ${item.id} -> ${dest}: ${error.message}`);
    }
  }

  if (dryRun) {
    console.log(`Dry run: ${previews.length} file(s) would be synced to ${targetKey} -> ${basePath}`);
    printTable(previews.slice(0, 20), [
      { label: 'ID', get: (row) => row.id, min: 12, max: 30 },
      { label: 'Format', get: (row) => row.format, min: 16, max: 30 },
      { label: 'Action', get: (row) => row.action, min: 8, max: 10 },
      { label: 'Reason', get: (row) => row.reason, min: 10, max: 18 },
      { label: 'Destination', get: (row) => row.to, min: 20, max: 90 }
    ]);
    if (previews.length > 20) console.log(`...and ${previews.length - 20} more`);
    console.log(
      `Result: symlinked=${counters.symlinked} copied=${counters.copied} fallbackCopied=${counters.fallbackCopied} failed=${counters.failed}`
    );
    return;
  }

  console.log(`Synced ${items.length} skill file(s) to ${targetKey} -> ${basePath}`);
  console.log(
    `Result: symlinked=${counters.symlinked} copied=${counters.copied} fallbackCopied=${counters.fallbackCopied} failed=${counters.failed}`
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
      if (stat.isDirectory()) {
        await fs.access(current, fsSync.constants.W_OK);
        return { ready: true, path: current };
      }
    } catch {
      // keep walking up
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return { ready: false, path: current };
    }
    current = parent;
  }
}

async function cmdDoctorAgents(config, context) {
  const projectRoot = context.projectRoot;
  const sourceMap = new Map((config.sources || []).map((source) => [source.name, source]));
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
      const sourcePath = resolveTemplatePath(sourceCfg.path, { projectRoot });
      const sourceExists = fsSync.existsSync(sourcePath);

      const targetKey = `${agent.id}-${scope}`;
      const targetCfg = targetMap.get(targetKey) || {
        ...scopeConfig.target,
        name: targetKey,
        format: scopeConfig.target.format,
        layout: scopeConfig.target.layout
      };
      const targetPath = resolveTemplatePath(targetCfg.path, { projectRoot });
      const writable = await getNearestWritableAncestor(path.dirname(targetPath));

      rows.push({
        agent: agent.id,
        scope,
        format: `${sourceCfg.format} -> ${targetCfg.format}`,
        sourceExists: sourceExists ? 'yes' : 'no',
        targetReady: writable.ready ? 'yes' : 'no',
        sourcePath,
        targetPath
      });
    }
  }

  console.log('\nAgent Matrix:');
  printTable(rows, [
    { label: 'Agent', get: (row) => row.agent, min: 8, max: 12 },
    { label: 'Scope', get: (row) => row.scope, min: 7, max: 7 },
    { label: 'Format', get: (row) => row.format, min: 18, max: 24 },
    { label: 'Source', get: (row) => row.sourceExists, min: 6, max: 6 },
    { label: 'Target', get: (row) => row.targetReady, min: 6, max: 6 },
    { label: 'Source Path', get: (row) => row.sourcePath, min: 20, max: 55 },
    { label: 'Target Path', get: (row) => row.targetPath, min: 20, max: 55 }
  ]);
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
  }

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

  if (issues.length === 0) {
    console.log('\nDoctor result: healthy');
  } else {
    console.log(`\nDoctor result: ${issues.length} warning(s)`);
    process.exitCode = 1;
  }
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
    await cmdInit(flags, context);
    return;
  }
  if (command === 'scan') {
    await cmdScan(flags, args, context);
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
  convertContentToFormat,
  detectProjectRoot,
  normalizeConfigV2,
  parseContentForFormat,
  planSyncWriteMode,
  resolveSyncTarget,
  resolveTemplatePath
};
