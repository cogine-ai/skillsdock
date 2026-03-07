import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'skillsdock.mjs');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8'
  });
}

async function writeDemoSkill(sourceDir) {
  const skillDir = path.join(sourceDir, 'demo');
  const sourceFile = path.join(skillDir, 'SKILL.md');
  const content = `---\nname: "demo"\ndescription: "Demo skill for sync safety"\n---\n\n# Demo\nsafe sync`;

  await mkdir(skillDir, { recursive: true });
  await writeFile(sourceFile, content, 'utf8');

  return { sourceFile, content };
}

async function configureAndScan(base, sourceDir, targetPath) {
  const configPath = path.join(base, 'config.json');
  const registryPath = path.join(base, 'registry.json');

  let result = runCli(['init', '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const cfg = JSON.parse(await readFile(configPath, 'utf8'));
  cfg.sources = [
    {
      name: 'fixture-user',
      agent: 'fixture',
      scope: 'user',
      path: sourceDir,
      format: 'skill-md',
      optional: false
    }
  ];
  cfg.targets['fixture-user'] = {
    name: 'fixture-user',
    agent: 'fixture',
    scope: 'user',
    path: targetPath,
    format: 'skill-md',
    layout: 'nested',
    filename: 'SKILL.md'
  };
  await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  result = runCli(['scan', sourceDir, '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  return { configPath, registryPath };
}

async function expectedRelativeLink(linkPath, targetPath) {
  const realParentPath = await realpath(path.dirname(linkPath));
  return path.relative(realParentPath, targetPath) || path.basename(targetPath);
}

test('sync --mode symlink resolves parent symlinks before computing the link target', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-sync-parent-link-'));
  const sourceDir = path.join(base, 'source');
  const realTargetRoot = path.join(base, 'target-real');
  const aliasedTargetRoot = path.join(base, 'target-link');

  const { sourceFile } = await writeDemoSkill(sourceDir);
  await mkdir(realTargetRoot, { recursive: true });
  await symlink(realTargetRoot, aliasedTargetRoot);

  const { configPath, registryPath } = await configureAndScan(base, sourceDir, aliasedTargetRoot);
  const result = runCli(
    [
      'sync',
      '--to',
      'fixture',
      '--scope',
      'user',
      '--config',
      configPath,
      '--registry',
      registryPath,
      '--mode',
      'symlink',
      '--fallback',
      'fail'
    ],
    base
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const destPath = path.join(realTargetRoot, 'demo', 'SKILL.md');
  const sourceRealPath = await realpath(sourceFile);
  const destStat = await lstat(destPath);

  assert.equal(destStat.isSymbolicLink(), true);
  assert.equal(await realpath(destPath), sourceRealPath);
  assert.equal(await readlink(destPath), await expectedRelativeLink(destPath, sourceRealPath));
  assert.equal(path.isAbsolute(await readlink(destPath)), false);
});

test('sync short-circuits when source and destination already resolve to the same real path', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-sync-same-realpath-'));
  const sourceDir = path.join(base, 'source');
  const aliasedTargetRoot = path.join(base, 'target-link');

  const { sourceFile, content } = await writeDemoSkill(sourceDir);
  await symlink(sourceDir, aliasedTargetRoot);

  const { configPath, registryPath } = await configureAndScan(base, sourceDir, aliasedTargetRoot);
  const result = runCli(
    [
      'sync',
      '--to',
      'fixture',
      '--scope',
      'user',
      '--config',
      configPath,
      '--registry',
      registryPath,
      '--mode',
      'symlink',
      '--fallback',
      'fail'
    ],
    base
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const sourceStat = await lstat(sourceFile);
  assert.equal(sourceStat.isFile(), true);
  assert.equal(sourceStat.isSymbolicLink(), false);
  assert.equal(await readFile(sourceFile, 'utf8'), content);
});

test('sync replaces an existing ELOOP destination symlink with a valid symlink', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-sync-eloop-'));
  const sourceDir = path.join(base, 'source');
  const targetRoot = path.join(base, 'target');

  const { sourceFile } = await writeDemoSkill(sourceDir);
  await mkdir(targetRoot, { recursive: true });

  const { configPath, registryPath } = await configureAndScan(base, sourceDir, targetRoot);
  const destPath = path.join(targetRoot, 'demo', 'SKILL.md');
  await mkdir(path.dirname(destPath), { recursive: true });
  await symlink('SKILL.md', destPath);

  const result = runCli(
    [
      'sync',
      '--to',
      'fixture',
      '--scope',
      'user',
      '--config',
      configPath,
      '--registry',
      registryPath,
      '--mode',
      'symlink',
      '--fallback',
      'fail'
    ],
    base
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const sourceRealPath = await realpath(sourceFile);
  const destStat = await lstat(destPath);

  assert.equal(destStat.isSymbolicLink(), true);
  assert.equal(await realpath(destPath), sourceRealPath);
  assert.equal(await readlink(destPath), await expectedRelativeLink(destPath, sourceRealPath));
});
