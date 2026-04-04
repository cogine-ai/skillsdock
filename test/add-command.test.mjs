import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, lstat, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSource } from '../bin/skillsdock-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'skillsdock.mjs');

function runCliProcess(args, cwd, envOverrides = {}) {
  const { XDG_STATE_HOME, ...cleanEnv } = process.env;
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...cleanEnv,
      ...envOverrides
    }
  });
  return result;
}

const DEMO_SKILL_MD = `---
name: "demo-skill"
description: "A demo skill for testing"
---

# Demo Skill

This is a demo skill for testing the add command.
`;

const ANOTHER_SKILL_MD = `---
name: "another-skill"
description: "Another test skill"
---

# Another Skill

This is another skill for testing.
`;

// --- parseSource unit tests ---

test('parseSource: parses owner/repo shorthand', () => {
  const result = parseSource('acme/skills-repo');
  assert.equal(result.type, 'github');
  assert.equal(result.owner, 'acme');
  assert.equal(result.repo, 'skills-repo');
  assert.equal(result.branch, null);
  assert.equal(result.skillFilter, null);
});

test('parseSource: parses owner/repo@skill-name', () => {
  const result = parseSource('acme/skills-repo@my-skill');
  assert.equal(result.type, 'github');
  assert.equal(result.owner, 'acme');
  assert.equal(result.repo, 'skills-repo');
  assert.equal(result.skillFilter, 'my-skill');
});

test('parseSource: parses GitHub URL', () => {
  const result = parseSource('https://github.com/acme/skills-repo/tree/main/skills');
  assert.equal(result.type, 'github');
  assert.equal(result.owner, 'acme');
  assert.equal(result.repo, 'skills-repo');
  assert.equal(result.branch, 'main');
  assert.equal(result.subpath, 'skills');
});

test('parseSource: parses GitHub URL without tree', () => {
  const result = parseSource('https://github.com/acme/skills-repo');
  assert.equal(result.type, 'github');
  assert.equal(result.owner, 'acme');
  assert.equal(result.repo, 'skills-repo');
  assert.equal(result.branch, null);
  assert.equal(result.subpath, null);
});

test('parseSource: parses GitLab URL', () => {
  const result = parseSource('https://gitlab.com/acme/skills-repo/-/tree/main/skills');
  assert.equal(result.type, 'gitlab');
  assert.equal(result.owner, 'acme');
  assert.equal(result.repo, 'skills-repo');
  assert.equal(result.branch, 'main');
  assert.equal(result.subpath, 'skills');
});

test('parseSource: parses local path with ./', () => {
  const result = parseSource('./my/skills');
  assert.equal(result.type, 'local');
});

test('parseSource: parses absolute local path', () => {
  const result = parseSource('/tmp/my-skills');
  assert.equal(result.type, 'local');
});

test('parseSource: throws on empty input', () => {
  assert.throws(() => parseSource(''), /required/i);
  assert.throws(() => parseSource(null), /required/i);
});

// --- Local path add tests ---

test('add: installs skills from local path (user scope)', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-local-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);
  assert.ok(result.stdout.includes('demo-skill'), `Should mention installed skill: ${result.stdout}`);

  const installedSkillMd = path.join(homeDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
  const content = await readFile(installedSkillMd, 'utf8');
  assert.ok(content.includes('demo-skill'), 'Installed SKILL.md should contain skill name');
});

test('add: installs multiple skills from local path', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-multi-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(path.join(sourceDir, 'another-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'another-skill', 'SKILL.md'), ANOTHER_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const skillsDir = path.join(homeDir, '.agents', 'skills');
  const entries = await readdir(skillsDir);
  assert.ok(entries.includes('demo-skill'), 'Should contain demo-skill');
  assert.ok(entries.includes('another-skill'), 'Should contain another-skill');
});

test('add: --dry-run does not write files', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-dryrun-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--dry-run', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);
  assert.ok(result.stdout.includes('dry-run') || result.stdout.includes('Dry run'), `Should mention dry-run: ${result.stdout}`);

  const skillsDir = path.join(homeDir, '.agents', 'skills');
  let exists = false;
  try {
    await readdir(skillsDir);
    exists = true;
  } catch {
    exists = false;
  }
  assert.equal(exists, false, 'Skills directory should not exist after dry run');
});

test('add: --scope project installs to project .agents/skills', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-project-'));
  const homeDir = path.join(base, 'home');
  const projectDir = path.join(base, 'project');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  // Initialize a git repo so detectProjectRoot works
  spawnSync('git', ['init'], { cwd: projectDir, encoding: 'utf8' });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'project', '--registry', registryPath],
    projectDir,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const installedSkillMd = path.join(projectDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
  const content = await readFile(installedSkillMd, 'utf8');
  assert.ok(content.includes('demo-skill'), 'Installed SKILL.md should contain skill name');
});

test('add: --scope project updates lockfile', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-projlock-'));
  const homeDir = path.join(base, 'home');
  const projectDir = path.join(base, 'project');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  spawnSync('git', ['init'], { cwd: projectDir, encoding: 'utf8' });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'project', '--registry', registryPath],
    projectDir,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const lockPath = path.join(projectDir, 'skills-lock.json');
  const lockRaw = await readFile(lockPath, 'utf8');
  const lock = JSON.parse(lockRaw);

  assert.equal(lock.version, 1);
  assert.ok(lock.skills['demo-skill'], 'Lockfile should contain demo-skill entry');
  assert.ok(lock.skills['demo-skill'].computedHash, 'Lockfile entry should have a computed hash');
  assert.equal(lock.skills['demo-skill'].sourceType, 'local');
});

test('add: fails when no SKILL.md found in source', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-noskill-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'empty-source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, 'README.md'), '# No skills here', 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.notEqual(result.status, 0, 'Should fail when no SKILL.md found');
  assert.ok(
    result.stderr.includes('No SKILL.md') || result.stdout.includes('No SKILL.md'),
    `Should report no SKILL.md: ${result.stderr}\n${result.stdout}`
  );
});

test('add: fails when local path does not exist', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-nopath-'));
  const homeDir = path.join(base, 'home');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', '/tmp/nonexistent-skillsdock-path-xyz', '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.notEqual(result.status, 0, 'Should fail when path does not exist');
  assert.ok(
    result.stderr.includes('does not exist'),
    `Should report path does not exist: ${result.stderr}`
  );
});

test('add: discovers skills in nested skills/ directory', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-nested-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'skills', 'nested-skill'), { recursive: true });
  await writeFile(
    path.join(sourceDir, 'skills', 'nested-skill', 'SKILL.md'),
    DEMO_SKILL_MD.replace(/demo-skill/g, 'nested-skill'),
    'utf8'
  );
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const installedSkillMd = path.join(homeDir, '.agents', 'skills', 'nested-skill', 'SKILL.md');
  const content = await readFile(installedSkillMd, 'utf8');
  assert.ok(content.includes('nested-skill'), 'Should install nested skill');
});

test('add: discovers skills in .agents/skills/ directory', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-agents-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, '.agents', 'skills', 'agents-skill'), { recursive: true });
  await writeFile(
    path.join(sourceDir, '.agents', 'skills', 'agents-skill', 'SKILL.md'),
    DEMO_SKILL_MD.replace(/demo-skill/g, 'agents-skill'),
    'utf8'
  );
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const installedSkillMd = path.join(homeDir, '.agents', 'skills', 'agents-skill', 'SKILL.md');
  const content = await readFile(installedSkillMd, 'utf8');
  assert.ok(content.includes('agents-skill'), 'Should install skill from .agents/skills/');
});

test('add: updates registry with installed skills', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-registry-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  assert.equal(registry.version, 2);
  const items = Object.values(registry.items);
  assert.ok(items.length > 0, 'Registry should have items');
  const demoItem = items.find((item) => item.id === 'demo-skill');
  assert.ok(demoItem, 'Registry should contain demo-skill');
  assert.equal(demoItem.state, 'active');
});

test('add: --scope user updates user lockfile', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-userlock-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const lockPath = path.join(homeDir, '.agents', '.skill-lock.json');
  const lockRaw = await readFile(lockPath, 'utf8');
  const lock = JSON.parse(lockRaw);

  assert.equal(lock.version, 3);
  assert.ok(lock.skills['demo-skill'], 'User lockfile should contain demo-skill');
  assert.ok(lock.skills['demo-skill'].skillFolderHash, 'Entry should have folder hash');
  assert.equal(lock.skills['demo-skill'].sourceType, 'local');
});

test('add: fails without source argument', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-nosrc-'));
  const homeDir = path.join(base, 'home');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(['add'], base, { HOME: homeDir });

  assert.notEqual(result.status, 0, 'Should fail without source argument');
  assert.ok(
    result.stderr.includes('Usage') || result.stderr.includes('source'),
    `Should show usage: ${result.stderr}`
  );
});

test('add: --copy flag suppresses agent symlinks', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-copy-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--copy', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const canonicalSkillMd = path.join(homeDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
  const content = await readFile(canonicalSkillMd, 'utf8');
  assert.ok(content.includes('demo-skill'), 'File should be copied to canonical dir');

  const canonicalStats = await lstat(canonicalSkillMd);
  assert.ok(!canonicalStats.isSymbolicLink(), 'Canonical install should be a regular file');

  const agentSkillDir = path.join(homeDir, '.claude', 'skills', 'demo-skill');
  let agentExists = false;
  try {
    await lstat(agentSkillDir);
    agentExists = true;
  } catch {}
  assert.equal(agentExists, false, 'Agent symlink should NOT be created in --copy mode');
});

test('add: without --copy creates agent symlinks', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-symlink-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const canonicalSkillMd = path.join(homeDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
  const content = await readFile(canonicalSkillMd, 'utf8');
  assert.ok(content.includes('demo-skill'), 'File should be copied to canonical dir');

  const agentSkillDir = path.join(homeDir, '.claude', 'skills', 'demo-skill');
  const agentStats = await lstat(agentSkillDir);
  assert.ok(agentStats.isSymbolicLink(), 'Agent path should be a symlink without --copy');
});

test('add: skips SKILL.md files with invalid frontmatter', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-invalid-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'bad-skill'), { recursive: true });
  await writeFile(
    path.join(sourceDir, 'bad-skill', 'SKILL.md'),
    '# No frontmatter here\nJust plain content.',
    'utf8'
  );
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.ok(
    result.stdout.includes('WARN') || result.stdout.includes('No skills were installed'),
    `Should warn about invalid SKILL.md or report no installs: ${result.stdout}`
  );
});

test('add: installs skill with extra files alongside SKILL.md', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'skillsdock-add-extra-'));
  const homeDir = path.join(base, 'home');
  const sourceDir = path.join(base, 'source');
  const registryPath = path.join(base, 'registry.json');

  await mkdir(path.join(sourceDir, 'demo-skill'), { recursive: true });
  await writeFile(path.join(sourceDir, 'demo-skill', 'SKILL.md'), DEMO_SKILL_MD, 'utf8');
  await writeFile(path.join(sourceDir, 'demo-skill', 'helpers.md'), '# Helpers', 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = runCliProcess(
    ['add', sourceDir, '--scope', 'user', '--registry', registryPath],
    base,
    { HOME: homeDir }
  );

  assert.equal(result.status, 0, `Expected exit 0: ${result.stderr}\n${result.stdout}`);

  const destDir = path.join(homeDir, '.agents', 'skills', 'demo-skill');
  const files = await readdir(destDir);
  assert.ok(files.includes('SKILL.md'), 'Should have SKILL.md');
  assert.ok(files.includes('helpers.md'), 'Should have extra helpers.md');
});
