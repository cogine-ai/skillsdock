import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeRegistry } from '../bin/skillsdock-core.mjs';

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

test('normalizeRegistry migrates v1 items to canonical path keys and legacy index', () => {
  const input = {
    version: 1,
    items: {
      'source-a:/tmp/skills/a/SKILL.md': {
        id: 'a',
        sourcePath: '/tmp/skills/a/SKILL.md',
        hash: 'h1',
        normalized: { name: 'A', description: '', body: '# A' },
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      'source-b:/tmp/skills/a/SKILL.md': {
        id: 'a',
        sourcePath: '/tmp/skills/a/SKILL.md',
        hash: 'h2',
        normalized: { name: 'A', description: '', body: '# A2' },
        updatedAt: '2026-01-02T00:00:00.000Z'
      }
    }
  };

  const registry = normalizeRegistry(input);
  const canonicalKey = 'path:/tmp/skills/a/SKILL.md';

  assert.equal(registry.version, 2);
  assert.equal(typeof registry.items[canonicalKey], 'object');
  assert.equal(registry.index.byCanonicalPath['/tmp/skills/a/SKILL.md'], canonicalKey);
  assert.equal(
    registry.index.byLegacyKey['source-a:/tmp/skills/a/SKILL.md'],
    canonicalKey
  );
  assert.equal(
    registry.index.byLegacyKey['source-b:/tmp/skills/a/SKILL.md'],
    canonicalKey
  );
});

test('governance commands: all-local-skills, tag, cleanup, rollback, sync gating', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-governance-'));
  const sourceA = path.join(base, 'source-a');
  const sourceB = path.join(base, 'source-b');
  const targetUserDir = path.join(base, 'target-user');
  const targetProjectDir = path.join(base, 'target-project');
  const configPath = path.join(base, 'config.json');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceA, 'dup-skill', 'assets'), { recursive: true });
  await mkdir(path.join(sourceB, 'dup-skill', 'assets'), { recursive: true });

  const skillBody = `---\nname: "Dup Skill"\ndescription: "dup"\n---\n\n# Dup\nhello`;
  await writeFile(path.join(sourceA, 'dup-skill', 'SKILL.md'), skillBody, 'utf8');
  await writeFile(path.join(sourceA, 'dup-skill', 'assets', 'extra.md'), 'extra-a', 'utf8');
  await writeFile(path.join(sourceB, 'dup-skill', 'SKILL.md'), skillBody, 'utf8');
  await writeFile(path.join(sourceB, 'dup-skill', 'assets', 'extra.md'), 'extra-a', 'utf8');

  let result = runCli(['init', '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const cfg = JSON.parse(await readFile(configPath, 'utf8'));
  cfg.sources = [
    {
      name: 'fixture-user-a',
      agent: 'fixture',
      scope: 'user',
      path: sourceA,
      format: 'skill-md',
      optional: false
    },
    {
      name: 'fixture-project-b',
      agent: 'fixture',
      scope: 'project',
      path: sourceB,
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

  result = runCli(['scan', sourceA, sourceB, '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['all-local-skills', '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const allSkills = JSON.parse(result.stdout);
  assert.equal(allSkills.count > 0, true);
  assert.equal(allSkills.items[0].copies >= 2, true);

  result = runCli(['skill-detail', 'dup-skill', '--registry', registryPath], base);
  assert.equal(result.status, 2, result.stderr || result.stdout);

  result = runCli(['skill-detail', 'dup-skill', '--all-copies', '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const details = JSON.parse(result.stdout);
  assert.equal(details.count >= 2, true);
  assert.equal(details.items.some((item) => (item.structureManifest?.includedFiles?.length || 0) > 1), true);

  result = runCli(
    ['tag', 'set', 'dup-skill', '--tag', 'deleted', '--all-copies', '--registry', registryPath],
    base
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(
    ['sync', '--to', 'fixture', '--scope', 'user', '--config', configPath, '--registry', registryPath, '--dry-run'],
    base
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dry run: 0 file\(s\)/);

  result = runCli(
    ['tag', 'set', 'dup-skill', '--tag', 'regular', '--all-copies', '--registry', registryPath],
    base
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['cleanup', '--plan', '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const cleanupPlan = JSON.parse(result.stdout);
  assert.equal(Array.isArray(cleanupPlan.issues), true);
  assert.equal(Array.isArray(cleanupPlan.actions), true);
  assert.equal(cleanupPlan.issues.some((issue) => issue.type === 'exact_duplicate'), true);

  result = runCli(['cleanup', '--apply', '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const runIdMatch = result.stdout.match(/runId=([^\s]+)/);
  assert.equal(Boolean(runIdMatch), true);
  const runId = runIdMatch[1];

  result = runCli(['tag', 'list', '--registry', registryPath, '--json', '--all'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const tagsAfterApply = JSON.parse(result.stdout);
  assert.equal(tagsAfterApply.items.some((item) => item.policy?.tag === 'disabled'), true);

  result = runCli(['cleanup', '--rollback', runId, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['tag', 'list', '--registry', registryPath, '--json', '--all'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const tagsAfterRollback = JSON.parse(result.stdout);
  assert.equal(tagsAfterRollback.items.some((item) => item.policy?.tag === 'disabled'), false);
});

test('scan enforces skill-md frontmatter and skips internal skills by default', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-parse-align-'));
  const sourceDir = path.join(base, 'source');
  const configPath = path.join(base, 'config.json');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'public-skill'), { recursive: true });
  await mkdir(path.join(sourceDir, 'internal-skill'), { recursive: true });
  await mkdir(path.join(sourceDir, 'invalid-skill'), { recursive: true });

  await writeFile(
    path.join(sourceDir, 'public-skill', 'SKILL.md'),
    `---\nname: public-skill\ndescription: Public skill\n---\n\n# Public`,
    'utf8'
  );
  await writeFile(
    path.join(sourceDir, 'internal-skill', 'SKILL.md'),
    `---\nname: internal-skill\ndescription: Internal skill\nmetadata:\n  internal: true\n---\n\n# Internal`,
    'utf8'
  );
  await writeFile(path.join(sourceDir, 'invalid-skill', 'SKILL.md'), `# Missing frontmatter`, 'utf8');

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
  await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  result = runCli(['scan', sourceDir, '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Skipped internal skills: 1/);
  assert.match(result.stdout, /Parse errors: 1/);

  result = runCli(['all-local-skills', '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  let payload = JSON.parse(result.stdout);
  assert.equal(payload.count, 1);
  assert.equal(payload.items[0].name, 'public-skill');

  result = runCli(
    ['scan', sourceDir, '--config', configPath, '--registry', registryPath],
    base,
    { INSTALL_INTERNAL_SKILLS: '1' }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['all-local-skills', '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.count, 2);
  const names = payload.items.map((item) => item.name).sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, ['internal-skill', 'public-skill']);
});

test('scan discovers deep skills declared in .claude-plugin marketplace manifest', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-plugin-discovery-'));
  const sourceDir = path.join(base, 'source');
  const configPath = path.join(base, 'config.json');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, '.claude-plugin'), { recursive: true });
  await mkdir(path.join(sourceDir, 'plugins', 'my-plugin', 'skills', 'review'), { recursive: true });

  await writeFile(
    path.join(sourceDir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(
      {
        metadata: {
          pluginRoot: './plugins'
        },
        plugins: [
          {
            name: 'my-plugin',
            source: './my-plugin',
            skills: ['./skills/review']
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  );

  await writeFile(
    path.join(sourceDir, 'plugins', 'my-plugin', 'skills', 'review', 'SKILL.md'),
    `---\nname: plugin-review\ndescription: plugin-discovered\n---\n\n# Plugin skill`,
    'utf8'
  );

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
  cfg.scan.maxDepth = 1;
  await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  result = runCli(['scan', sourceDir, '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(['all-local-skills', '--registry', registryPath, '--json'], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.count, 1);
  assert.equal(payload.items[0].name, 'plugin-review');
});

test('doctor --skills-spec flags non-spec skill names', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-doctor-spec-'));
  const sourceDir = path.join(base, 'source');
  const configPath = path.join(base, 'config.json');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'bad-name'), { recursive: true });
  await writeFile(
    path.join(sourceDir, 'bad-name', 'SKILL.md'),
    `---\nname: "Bad Name"\ndescription: "Still parseable"\n---\n\n# Bad`,
    'utf8'
  );

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
  await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  result = runCli(['scan', sourceDir, '--config', configPath, '--registry', registryPath], base);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = runCli(
    ['doctor', '--skills-spec', '--config', configPath, '--registry', registryPath],
    base
  );
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /skills-spec/);
  assert.match(result.stdout, /frontmatter name should match/);
});

test('doctor --skills-spec validates plugin manifest path safety', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-doctor-plugin-'));
  const sourceDir = path.join(base, 'source');
  const configPath = path.join(base, 'config.json');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, '.claude-plugin'), { recursive: true });
  await mkdir(path.join(sourceDir, 'skills', 'ok-skill'), { recursive: true });
  await writeFile(
    path.join(sourceDir, 'skills', 'ok-skill', 'SKILL.md'),
    `---\nname: ok-skill\ndescription: ok\n---\n\n# ok`,
    'utf8'
  );

  await writeFile(
    path.join(sourceDir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(
      {
        metadata: {
          pluginRoot: '../plugins'
        },
        plugins: [
          {
            name: 'bad-plugin',
            source: './bad',
            skills: ['skills/review']
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  );

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
  await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  result = runCli(
    ['doctor', '--skills-spec', '--config', configPath, '--registry', registryPath],
    base
  );
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /Invalid pluginRoot/);
  assert.match(result.stdout, /must start with "\.\/"/);
});
