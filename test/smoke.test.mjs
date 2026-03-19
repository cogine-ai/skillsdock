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

function runCli(args, cwd, envOverrides = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...envOverrides
    }
  });
  return result;
}

test('smoke: init -> scan -> list -> all-local-skills -> skill-detail -> tag set -> cleanup plan -> sync dry-run -> doctor --agents', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-smoke-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(homeDir, '.agents', 'skills');
  const agentsDir = path.join(homeDir, '.agents');
  const targetUserDir = path.join(base, 'target-user');
  const targetProjectDir = path.join(base, 'target-project');

  await mkdir(homeDir, { recursive: true });
  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(
    path.join(sourceDir, 'demo-skill', 'SKILL.md'),
    `---\nname: "Demo Skill"\ndescription: "Demo skill for smoke"\n---\n\n# Demo\nhello`,
    'utf8'
  );
  await writeFile(
    path.join(agentsDir, '.skill-lock.json'),
    `${JSON.stringify(
      {
        version: 3,
        skills: {
          'demo-skill': {
            source: 'vercel-labs/agent-skills',
            sourceType: 'github',
            sourceUrl: 'https://github.com/vercel-labs/agent-skills/tree/main/skills/demo-skill',
            skillPath: 'skills/demo-skill/SKILL.md',
            skillFolderHash: 'demo-folder-hash',
            installedAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-02T00:00:00.000Z',
            pluginName: 'demo-plugin'
          }
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const configPath = path.join(base, 'config.json');
  const registryPath = path.join(base, 'registry.json');

  let result = runCli(['init', '--config', configPath, '--registry', registryPath], base, {
    HOME: homeDir
  });
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

  result = runCli(['scan', sourceDir, '--config', configPath, '--registry', registryPath], base, {
    HOME: homeDir
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['list', '--config', configPath, '--registry', registryPath, '--json'], base, {
    HOME: homeDir
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const listPayload = JSON.parse(result.stdout);
  assert.equal(listPayload.count, 1);
  assert.equal(Array.isArray(listPayload.items), true);
  assert.equal(listPayload.items[0].pluginName, 'demo-plugin');
  assert.equal(listPayload.items[0].externalSourceUrl, 'https://github.com/vercel-labs/agent-skills/tree/main/skills/demo-skill');
  assert.equal(listPayload.items[0].externalHash, 'demo-folder-hash');

  result = runCli(['all-local-skills', '--config', configPath, '--registry', registryPath, '--json'], base, {
    HOME: homeDir
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const allLocalPayload = JSON.parse(result.stdout);
  assert.equal(allLocalPayload.count > 0, true);
  assert.equal(allLocalPayload.items[0].pluginName, 'demo-plugin');

  const firstId = allLocalPayload.items[0].items[0].id;
  result = runCli(['skill-detail', firstId, '--registry', registryPath, '--json'], base, {
    HOME: homeDir
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['tag', 'set', firstId, '--tag', 'frozen', '--registry', registryPath], base, {
    HOME: homeDir
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['cleanup', '--plan', '--registry', registryPath], base, {
    HOME: homeDir
  });
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
    base,
    {
      HOME: homeDir
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dry run:/);

  result = runCli(['doctor', '--agents', '--config', configPath, '--registry', registryPath], base, {
    HOME: homeDir
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Agent Matrix:/);
  assert.match(result.stdout, /Installed/);
  assert.match(result.stdout, /Canonical/);
});
