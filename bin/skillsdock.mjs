#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const APP_NAME = 'skillsdock';
const APP_VERSION = '0.1.0';

const HOME = os.homedir();
const APP_DIR = path.join(HOME, '.skillsdock');
const DEFAULT_CONFIG_PATH = path.join(APP_DIR, 'config.json');
const DEFAULT_REGISTRY_PATH = path.join(APP_DIR, 'registry.json');

const DEFAULT_CONFIG = {
  version: 1,
  sources: [
    { name: 'codex', path: '~/.codex/skills' },
    { name: 'claude', path: '~/.claude/skills' },
    { name: 'agents', path: '~/.agents/skills' }
  ],
  targets: {
    codex: {
      path: '~/.codex/skills',
      layout: 'nested',
      filename: 'SKILL.md'
    },
    claude: {
      path: '~/.claude/skills',
      layout: 'nested',
      filename: 'SKILL.md'
    },
    cursor: {
      path: '~/.cursor/rules',
      layout: 'flat',
      extension: '.mdc'
    }
  },
  scan: {
    maxDepth: 8,
    ignoreDirs: ['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache']
  }
};

const DEFAULT_REGISTRY = {
  version: 1,
  lastScanAt: null,
  updatedAt: null,
  items: {}
};

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

function expandPath(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return HOME;
  if (inputPath.startsWith('~/')) return path.join(HOME, inputPath.slice(2));
  return inputPath;
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

function parseFrontmatter(raw) {
  const content = raw.replace(/\r\n/g, '\n');
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
  if (base === 'skill.md') {
    return path.basename(path.dirname(filePath));
  }
  return path.basename(filePath, path.extname(filePath));
}

function isSkillFileName(name) {
  const lower = name.toLowerCase();
  return lower === 'skill.md' || lower.endsWith('.skill');
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

async function collectSkillFiles(rootPath, maxDepth, ignoreDirs) {
  const fullRoot = path.resolve(expandPath(rootPath));
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
      if (entry.isFile() && isSkillFileName(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  if (!(await pathExists(fullRoot))) return [];
  const stat = await fs.stat(fullRoot);
  if (stat.isFile()) return isSkillFileName(path.basename(fullRoot)) ? [fullRoot] : [];

  await walk(fullRoot, 0);
  return files;
}

async function parseSkillRecord(filePath, sourceName, sourceRoot) {
  const ext = path.extname(filePath).toLowerCase();
  let raw;

  if (ext === '.skill') {
    raw = await extractSkillMarkdownFromPackage(filePath);
  } else {
    raw = await fs.readFile(filePath, 'utf8');
  }

  const { metadata, body } = parseFrontmatter(raw);
  const stat = await fs.stat(filePath);
  const gitMeta = tryGetGitMetadata(filePath);

  const name = String(metadata.name || inferNameFromPath(filePath));
  const id = slugify(metadata.name || inferNameFromPath(filePath));
  const description = String(
    metadata.description || body.split('\n').find((line) => line.trim().length > 0) || ''
  );

  return {
    id,
    name,
    description,
    metadata,
    content: raw,
    body,
    hash: sha256(raw),
    sourceName,
    sourceRoot,
    sourcePath: path.resolve(filePath),
    relativePath: path.relative(path.resolve(sourceRoot), path.resolve(filePath)),
    format: ext === '.skill' ? 'skill' : 'markdown',
    createdAt: gitMeta?.createdAt || toIso(stat.birthtime) || toIso(stat.ctime),
    updatedAt: gitMeta?.updatedAt || toIso(stat.mtime),
    originRepo: gitMeta?.originRepo || null
  };
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

function normalizeConfig(input) {
  const cfg = input && typeof input === 'object' ? input : {};
  const scanCfg = cfg.scan && typeof cfg.scan === 'object' ? cfg.scan : {};

  return {
    version: 1,
    sources: Array.isArray(cfg.sources) ? cfg.sources : DEFAULT_CONFIG.sources,
    targets: cfg.targets && typeof cfg.targets === 'object' ? cfg.targets : DEFAULT_CONFIG.targets,
    scan: {
      maxDepth: Number.isInteger(scanCfg.maxDepth) ? scanCfg.maxDepth : DEFAULT_CONFIG.scan.maxDepth,
      ignoreDirs: Array.isArray(scanCfg.ignoreDirs) ? scanCfg.ignoreDirs : DEFAULT_CONFIG.scan.ignoreDirs
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
  skillsdock sync --to <target> [--registry <path>] [--config <path>] [--dry-run] [--all]
  skillsdock doctor [--config <path>] [--registry <path>]
  skillsdock version

Examples:
  skillsdock init
  skillsdock scan ~/Coding ~/Work
  skillsdock list --changed
  skillsdock sync --to claude --dry-run
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
    return Math.min(Math.max(maxCell, col.min || 8), col.max || 60);
  });

  const header = columns
    .map((col, i) => padCell(col.label, widths[i]))
    .join('  ');
  const divider = widths.map((w) => '-'.repeat(w)).join('  ');

  console.log(header);
  console.log(divider);
  for (const row of rows) {
    console.log(
      columns
        .map((col, i) => padCell(col.get(row), widths[i]))
        .join('  ')
    );
  }
}

async function loadConfig(configPath) {
  const normalizedPath = path.resolve(expandPath(configPath || DEFAULT_CONFIG_PATH));
  const config = normalizeConfig(await readJson(normalizedPath, DEFAULT_CONFIG));
  return { configPath: normalizedPath, config };
}

async function loadRegistry(registryPath) {
  const normalizedPath = path.resolve(expandPath(registryPath || DEFAULT_REGISTRY_PATH));
  const registry = normalizeRegistry(await readJson(normalizedPath, DEFAULT_REGISTRY));
  return { registryPath: normalizedPath, registry };
}

async function cmdInit(flags) {
  const configPath = path.resolve(expandPath(flags.config || DEFAULT_CONFIG_PATH));
  const registryPath = path.resolve(expandPath(flags.registry || DEFAULT_REGISTRY_PATH));

  if (!(await pathExists(configPath))) {
    await writeJson(configPath, DEFAULT_CONFIG);
    console.log(`Created config: ${configPath}`);
  } else {
    console.log(`Config exists: ${configPath}`);
  }

  if (!(await pathExists(registryPath))) {
    await writeJson(registryPath, DEFAULT_REGISTRY);
    console.log(`Created registry: ${registryPath}`);
  } else {
    console.log(`Registry exists: ${registryPath}`);
  }

  console.log('\nNext step: skillsdock scan');
}

async function cmdScan(flags, positionalArgs) {
  const { config } = await loadConfig(flags.config);
  const { registryPath, registry } = await loadRegistry(flags.registry);

  const now = new Date().toISOString();
  const sourceInputs = positionalArgs.length > 0
    ? positionalArgs.map((p, index) => ({ name: `arg-${index + 1}`, path: p }))
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
    const sourcePath = source.path;
    if (!sourcePath) continue;
    sourceNames.push(sourceName);

    const skillFiles = await collectSkillFiles(
      sourcePath,
      config.scan.maxDepth,
      config.scan.ignoreDirs
    );
    discovered += skillFiles.length;

    for (const filePath of skillFiles) {
      let parsed;
      try {
        parsed = await parseSkillRecord(filePath, sourceName, sourcePath);
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

  // Mark one primary record per skill id based on source order.
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
  let list = items.filter((item) => flags.all ? true : item.state === 'active');

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
    { label: 'Source', get: (row) => row.sourceName, min: 8, max: 14 },
    { label: 'State', get: (row) => row.state, min: 8, max: 10 },
    { label: 'Updated', get: (row) => (row.updatedAt || '').slice(0, 19), min: 19, max: 19 },
    { label: 'Path', get: (row) => row.sourcePath, min: 20, max: 70 }
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
    console.log(`- ${sibling.isPrimary ? '[primary] ' : ''}${sibling.sourceName}: ${sibling.sourcePath}`);
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

async function cmdSync(flags) {
  const targetName = flags.to || flags.target;
  if (!targetName || typeof targetName !== 'string') {
    throw new Error('Usage: skillsdock sync --to <target>');
  }

  const { config } = await loadConfig(flags.config);
  const { registry } = await loadRegistry(flags.registry);
  const targetCfg = config.targets?.[targetName];

  if (!targetCfg) {
    throw new Error(`Unknown target "${targetName}". Check your config targets.`);
  }

  const dryRun = Boolean(flags['dry-run'] || flags.dryRun);
  const items = Object.values(registry.items || {})
    .filter((item) => item.state === 'active')
    .filter((item) => (flags.all ? true : item.isPrimary))
    .sort((a, b) => a.id.localeCompare(b.id));

  const basePath = path.resolve(expandPath(targetCfg.path));
  let written = 0;
  const previews = [];

  for (const item of items) {
    const dest = getTargetFilePath(basePath, targetCfg, item);
    previews.push({ id: item.id, from: item.sourcePath, to: dest });
    if (dryRun) continue;

    await ensureParentDir(dest);
    await fs.writeFile(dest, item.content, 'utf8');
    written += 1;
  }

  if (dryRun) {
    console.log(`Dry run: ${previews.length} file(s) would be synced to ${targetName} -> ${basePath}`);
    printTable(previews.slice(0, 20), [
      { label: 'ID', get: (row) => row.id, min: 12, max: 34 },
      { label: 'Destination', get: (row) => row.to, min: 20, max: 90 }
    ]);
    if (previews.length > 20) console.log(`...and ${previews.length - 20} more`);
    return;
  }

  console.log(`Synced ${written} skill file(s) to ${targetName} -> ${basePath}`);
}

async function cmdDoctor(flags) {
  const { configPath, config } = await loadConfig(flags.config);
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
    const sourcePath = path.resolve(expandPath(source.path));
    if (!fsSync.existsSync(sourcePath)) {
      issues.push(`Missing source path (${source.name}): ${sourcePath}`);
    } else {
      notes.push(`Source OK (${source.name}): ${sourcePath}`);
    }
  }

  for (const [name, target] of Object.entries(config.targets || {})) {
    const targetPath = path.resolve(expandPath(target.path));
    const parent = path.dirname(targetPath);
    if (!fsSync.existsSync(parent)) {
      issues.push(`Target parent missing (${name}): ${parent}`);
    } else {
      notes.push(`Target configured (${name}): ${targetPath}`);
    }
  }

  for (const line of notes) console.log(`OK: ${line}`);
  for (const line of issues) console.log(`WARN: ${line}`);

  if (issues.length === 0) {
    console.log('\nDoctor result: healthy');
  } else {
    console.log(`\nDoctor result: ${issues.length} warning(s)`);
    process.exitCode = 1;
  }
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  const args = positional.slice(1);

  if (!command || flags.help || flags.h) {
    printHelp();
    return;
  }
  if (command === 'version' || flags.version || flags.v) {
    console.log(APP_VERSION);
    return;
  }

  if (command === 'init') {
    await cmdInit(flags);
    return;
  }
  if (command === 'scan') {
    await cmdScan(flags, args);
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
    await cmdSync(flags);
    return;
  }
  if (command === 'doctor') {
    await cmdDoctor(flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
