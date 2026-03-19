import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'skillsdock.mjs');

function runCli(args, cwd, envOverrides = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...envOverrides
    }
  });
}

async function writeDemoSkill(rootDir, name = 'demo', description = 'Canonical test skill') {
  const skillDir = path.join(rootDir, name);
  const sourceFile = path.join(skillDir, 'SKILL.md');
  const content = `---\nname: "${name}"\ndescription: "${description}"\n---\n\n# ${name}\nhello`;

  await mkdir(skillDir, { recursive: true });
  await writeFile(sourceFile, content, 'utf8');

  return { skillDir, sourceFile, content };
}

async function initConfig(baseDir, projectRoot, homeDir) {
  const configPath = path.join(baseDir, 'config.json');
  const registryPath = path.join(baseDir, 'registry.json');
  const result = runCli(['init', '--config', configPath, '--registry', registryPath], projectRoot, {
    HOME: homeDir
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { configPath, registryPath };
}

test('scan discovers canonical user and project .agents/skills directories by default', async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'skillsdock-canonical-scan-'));
  const homeDir = path.join(baseDir, 'home');
  const projectRoot = path.join(baseDir, 'project');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  await writeDemoSkill(path.join(homeDir, '.agents', 'skills'), 'user-canonical');
  await writeDemoSkill(path.join(projectRoot, '.agents', 'skills'), 'project-canonical');

  const { configPath, registryPath } = await initConfig(baseDir, projectRoot, homeDir);
  const scanResult = runCli(['scan', '--config', configPath, '--registry', registryPath], projectRoot, {
    HOME: homeDir
  });
  assert.equal(scanResult.status, 0, scanResult.stderr || scanResult.stdout);

  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const paths = Object.values(registry.items || {}).map((item) => item.canonicalPath);

  assert.equal(
    paths.some((entry) => entry.endsWith(path.join('.agents', 'skills', 'user-canonical', 'SKILL.md'))),
    true
  );
  assert.equal(
    paths.some((entry) => entry.endsWith(path.join('.agents', 'skills', 'project-canonical', 'SKILL.md'))),
    true
  );
});

test('sync to a universal agent writes canonical .agents/skills output without redundant native symlink', async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'skillsdock-canonical-sync-'));
  const homeDir = path.join(baseDir, 'home');
  const projectRoot = path.join(baseDir, 'project');
  const sourceDir = path.join(baseDir, 'source');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  await writeDemoSkill(sourceDir, 'demo');

  const { configPath, registryPath } = await initConfig(baseDir, projectRoot, homeDir);
  const scanResult = runCli(
    ['scan', sourceDir, '--config', configPath, '--registry', registryPath],
    projectRoot,
    {
      HOME: homeDir
    }
  );
  assert.equal(scanResult.status, 0, scanResult.stderr || scanResult.stdout);

  const syncResult = runCli(
    [
      'sync',
      '--to',
      'codex',
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
    projectRoot,
    {
      HOME: homeDir
    }
  );
  assert.equal(syncResult.status, 0, syncResult.stderr || syncResult.stdout);

  const canonicalPath = path.join(homeDir, '.agents', 'skills', 'demo', 'SKILL.md');
  const nativePath = path.join(homeDir, '.codex', 'skills', 'demo', 'SKILL.md');

  const canonicalStat = await lstat(canonicalPath);
  assert.equal(canonicalStat.isSymbolicLink(), true);
  assert.equal(syncResult.stdout.includes(path.join(homeDir, '.agents', 'skills')), true);

  await assert.rejects(() => lstat(nativePath), /ENOENT/);
});

test('canonical list views prefer .agents/skills and dedupe same-realpath copies', async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'skillsdock-canonical-list-'));
  const homeDir = path.join(baseDir, 'home');
  const projectRoot = path.join(baseDir, 'project');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  const canonicalRoot = path.join(homeDir, '.agents', 'skills');
  const nativeRoot = path.join(homeDir, '.codex', 'skills');
  const { sourceFile } = await writeDemoSkill(canonicalRoot, 'demo');
  const nativeDir = path.join(nativeRoot, 'demo');
  await mkdir(nativeDir, { recursive: true });
  await symlink(sourceFile, path.join(nativeDir, 'SKILL.md'));

  const { configPath, registryPath } = await initConfig(baseDir, projectRoot, homeDir);
  const scanResult = runCli(['scan', '--config', configPath, '--registry', registryPath], projectRoot, {
    HOME: homeDir
  });
  assert.equal(scanResult.status, 0, scanResult.stderr || scanResult.stdout);

  const listResult = runCli(['list', '--registry', registryPath, '--json'], projectRoot, {
    HOME: homeDir
  });
  assert.equal(listResult.status, 0, listResult.stderr || listResult.stdout);
  const listPayload = JSON.parse(listResult.stdout);
  assert.equal(listPayload.count, 1);
  assert.equal(listPayload.items[0].canonicalPath, path.join(canonicalRoot, 'demo', 'SKILL.md'));

  const allLocalResult = runCli(
    ['all-local-skills', '--config', configPath, '--registry', registryPath, '--json'],
    projectRoot,
    {
      HOME: homeDir
    }
  );
  assert.equal(allLocalResult.status, 0, allLocalResult.stderr || allLocalResult.stdout);
  const allLocalPayload = JSON.parse(allLocalResult.stdout);
  assert.equal(allLocalPayload.count, 1);
  assert.equal(allLocalPayload.items[0].copies, 1);
  assert.equal(allLocalPayload.items[0].items.length, 1);
  assert.equal(allLocalPayload.items[0].items[0].canonicalPath, path.join(canonicalRoot, 'demo', 'SKILL.md'));
});

test('dry-run sync counts a canonical-skip plus mirror symlink as a successful symlink', async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'skillsdock-canonical-mirror-dry-run-'));
  const homeDir = path.join(baseDir, 'home');
  const projectRoot = path.join(baseDir, 'project');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  await writeDemoSkill(path.join(homeDir, '.agents', 'skills'), 'demo');

  const { configPath, registryPath } = await initConfig(baseDir, projectRoot, homeDir);
  const scanResult = runCli(['scan', '--config', configPath, '--registry', registryPath], projectRoot, {
    HOME: homeDir
  });
  assert.equal(scanResult.status, 0, scanResult.stderr || scanResult.stdout);

  const syncResult = runCli(
    [
      'sync',
      '--to',
      'claude',
      '--scope',
      'user',
      '--config',
      configPath,
      '--registry',
      registryPath,
      '--mode',
      'symlink',
      '--fallback',
      'fail',
      '--dry-run'
    ],
    projectRoot,
    {
      HOME: homeDir
    }
  );
  assert.equal(syncResult.status, 0, syncResult.stderr || syncResult.stdout);
  assert.match(syncResult.stdout, /Dry run: 1 file\(s\) would be synced .*skipped=0/);
  assert.match(syncResult.stdout, /skill-md -> mirror/);
  assert.match(syncResult.stdout, /Result: symlinked=1 .* skipped=0 failed=0/);
});

test('sync counts mirror failures as failed outcomes for non-universal skill-md targets', async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'skillsdock-canonical-mirror-fail-'));
  const homeDir = path.join(baseDir, 'home');
  const projectRoot = path.join(baseDir, 'project');
  const sourceDir = path.join(baseDir, 'source');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  await writeDemoSkill(sourceDir, 'demo');
  await mkdir(path.join(homeDir, '.claude', 'skills', 'demo', 'SKILL.md'), { recursive: true });

  const { configPath, registryPath } = await initConfig(baseDir, projectRoot, homeDir);
  const scanResult = runCli(
    ['scan', sourceDir, '--config', configPath, '--registry', registryPath],
    projectRoot,
    {
      HOME: homeDir
    }
  );
  assert.equal(scanResult.status, 0, scanResult.stderr || scanResult.stdout);

  const syncResult = runCli(
    [
      'sync',
      '--to',
      'claude',
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
    projectRoot,
    {
      HOME: homeDir
    }
  );
  assert.equal(syncResult.status, 1, syncResult.stderr || syncResult.stdout);
  assert.match(syncResult.stdout, /Result: symlinked=0 copied=0 fallbackCopied=0 skipped=0 failed=1/);
});

test('native path selectors still resolve to canonical records after realpath dedupe', async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'skillsdock-canonical-selector-'));
  const homeDir = path.join(baseDir, 'home');
  const projectRoot = path.join(baseDir, 'project');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  const canonicalRoot = path.join(homeDir, '.agents', 'skills');
  const nativeRoot = path.join(homeDir, '.claude', 'skills');
  const { sourceFile } = await writeDemoSkill(canonicalRoot, 'demo');
  const nativeDir = path.join(nativeRoot, 'demo');
  const nativePath = path.join(nativeDir, 'SKILL.md');
  await mkdir(nativeDir, { recursive: true });
  await symlink(sourceFile, nativePath);

  const { configPath, registryPath } = await initConfig(baseDir, projectRoot, homeDir);
  const scanResult = runCli(['scan', '--config', configPath, '--registry', registryPath], projectRoot, {
    HOME: homeDir
  });
  assert.equal(scanResult.status, 0, scanResult.stderr || scanResult.stdout);

  const detailResult = runCli(['skill-detail', nativePath, '--registry', registryPath, '--json'], projectRoot, {
    HOME: homeDir
  });
  assert.equal(detailResult.status, 0, detailResult.stderr || detailResult.stdout);
  const detailPayload = JSON.parse(detailResult.stdout);
  assert.equal(detailPayload.count, 1);
  assert.equal(detailPayload.items[0].canonicalPath, path.join(canonicalRoot, 'demo', 'SKILL.md'));

  const tagResult = runCli(
    ['tag', 'set', nativePath, '--tag', 'deleted', '--registry', registryPath],
    projectRoot,
    {
      HOME: homeDir
    }
  );
  assert.equal(tagResult.status, 0, tagResult.stderr || tagResult.stdout);

  const taggedDetail = runCli(['skill-detail', nativePath, '--registry', registryPath, '--json', '--all'], projectRoot, {
    HOME: homeDir
  });
  assert.equal(taggedDetail.status, 0, taggedDetail.stderr || taggedDetail.stdout);
  const taggedPayload = JSON.parse(taggedDetail.stdout);
  assert.equal(taggedPayload.items[0].policy?.tag, 'deleted');
});
