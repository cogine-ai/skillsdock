import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'skillsdock.mjs');

function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8'
  });
  return result;
}

test('smoke: init -> scan -> all-local-skills -> skill-detail -> tag set -> cleanup plan -> sync dry-run -> doctor --agents', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-smoke-'));
  const sourceDir = path.join(base, 'source-skills');
  const targetUserDir = path.join(base, 'target-user');
  const targetProjectDir = path.join(base, 'target-project');

  await mkdir(path.join(sourceDir, 'demo'), { recursive: true });
  await writeFile(
    path.join(sourceDir, 'demo', 'SKILL.md'),
    `---\nname: "Demo Skill"\ndescription: "Demo skill for smoke"\n---\n\n# Demo\nhello`,
    'utf8'
  );

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
    path: targetUserDir,
    format: 'skill-md',
    layout: 'nested',
    filename: 'SKILL.md'
  };
  cfg.targets['fixture-project'] = {
    name: 'fixture-project',
    agent: 'fixture',
    scope: 'project',
    path: targetProjectDir,
    format: 'skill-md',
    layout: 'nested',
    filename: 'SKILL.md'
  };
  await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  result = runCli(['scan', sourceDir, '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['all-local-skills', '--config', configPath, '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const allLocalPayload = JSON.parse(result.stdout);
  assert.equal(allLocalPayload.count > 0, true);

  const firstId = allLocalPayload.items[0].items[0].id;
  result = runCli(['skill-detail', firstId, '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['tag', 'set', firstId, '--tag', 'frozen', '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['cleanup', '--plan', '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(
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
      '--dry-run'
    ],
    base
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dry run:/);

  result = runCli(['doctor', '--agents', '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Agent Matrix:/);
});
