import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  discoverNodeModuleSkills,
  readProjectLockfile,
  writeProjectLockfile,
  computeSkillFolderHash,
  runCli
} from '../bin/skillsdock-core.mjs';

async function makeTmpDir() {
  return mkdtemp(path.join(tmpdir(), 'skillsdock-nm-test-'));
}

async function withTmpDir(fn) {
  const dir = await makeTmpDir();
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true });
  }
}

async function createSkillMd(dirPath, skillName, extra = '') {
  const content = `---
name: ${skillName}
description: Test skill ${skillName}
---

# ${skillName}

Test skill content.
${extra}`;
  await writeFile(path.join(dirPath, 'SKILL.md'), content, 'utf8');
}

async function scaffoldPackageWithSkill(nodeModulesDir, packageName, options = {}) {
  const { location = '', skillName = null, extraFiles = {} } = options;
  const pkgDir = path.join(nodeModulesDir, packageName);
  const skillDir = location ? path.join(pkgDir, location) : pkgDir;
  await mkdir(skillDir, { recursive: true });

  const name = skillName || packageName.replace(/^@[^/]+\//, '');
  await createSkillMd(skillDir, name);

  for (const [fileName, content] of Object.entries(extraFiles)) {
    await writeFile(path.join(skillDir, fileName), content, 'utf8');
  }

  return { pkgDir, skillDir, skillName: name };
}

// ── discoverNodeModuleSkills ────────────────────────────────────────────

test('discoverNodeModuleSkills: returns empty when node_modules does not exist', async () => {
  await withTmpDir(async (dir) => {
    const results = await discoverNodeModuleSkills(dir);
    assert.deepStrictEqual(results, []);
  });
});

test('discoverNodeModuleSkills: finds SKILL.md at package root', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'my-cool-skill');

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].packageName, 'my-cool-skill');
    assert.equal(results[0].skillName, 'my-cool-skill');
    assert.ok(results[0].files.includes('SKILL.md'));
  });
});

test('discoverNodeModuleSkills: finds SKILL.md in skills/ subdirectory', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'pkg-with-skills-dir', { location: 'skills' });

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].packageName, 'pkg-with-skills-dir');
  });
});

test('discoverNodeModuleSkills: finds SKILL.md in .agents/skills/ subdirectory', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'pkg-with-agents-dir', { location: '.agents/skills' });

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].packageName, 'pkg-with-agents-dir');
  });
});

test('discoverNodeModuleSkills: supports scoped packages', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, '@myorg/my-skill');

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].packageName, '@myorg/my-skill');
    assert.equal(results[0].skillName, 'my-skill');
  });
});

test('discoverNodeModuleSkills: skips .bin and .cache directories', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await mkdir(path.join(nmDir, '.bin'), { recursive: true });
    await mkdir(path.join(nmDir, '.cache'), { recursive: true });
    await scaffoldPackageWithSkill(nmDir, 'real-skill');

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].packageName, 'real-skill');
  });
});

test('discoverNodeModuleSkills: ignores packages without SKILL.md', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    const pkgDir = path.join(nmDir, 'no-skill-pkg');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(pkgDir, 'package.json'), '{}', 'utf8');

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 0);
  });
});

test('discoverNodeModuleSkills: discovers multiple skills from different packages', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'skill-a');
    await scaffoldPackageWithSkill(nmDir, 'skill-b');
    await scaffoldPackageWithSkill(nmDir, '@org/skill-c');

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 3);
    const names = results.map((r) => r.packageName).sort();
    assert.deepStrictEqual(names, ['@org/skill-c', 'skill-a', 'skill-b']);
  });
});

test('discoverNodeModuleSkills: lists all files in skill directory', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'multi-file-skill', {
      extraFiles: { 'helper.md': '# Helper', 'data.json': '{}' }
    });

    const results = await discoverNodeModuleSkills(dir);
    assert.equal(results.length, 1);
    const files = results[0].files.sort();
    assert.ok(files.includes('SKILL.md'));
    assert.ok(files.includes('helper.md'));
    assert.ok(files.includes('data.json'));
  });
});

// ── Incremental sync (hash comparison) ──────────────────────────────────

test('sync --from node_modules: incremental skip when hash unchanged', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'stable-skill');

    const agentsSkillsDir = path.join(dir, '.agents', 'skills', 'stable-skill');
    await mkdir(agentsSkillsDir, { recursive: true });
    await writeFile(path.join(agentsSkillsDir, 'SKILL.md'), 'old content', 'utf8');

    const hash = await computeSkillFolderHash(path.join(nmDir, 'stable-skill'));
    await writeProjectLockfile(dir, {
      version: 1,
      skills: {
        'stable-skill': {
          source: 'stable-skill',
          sourceType: 'node_modules',
          computedHash: hash,
          skillPath: '.agents/skills/stable-skill'
        }
      }
    });

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runCli(['sync', '--from', 'node_modules', '--scope', 'project'], { cwd: dir });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    assert.ok(output.includes('skipped=1'), `Expected skipped=1 in output: ${output}`);
    assert.ok(output.includes('up to date'), `Expected "up to date" in output: ${output}`);
  });
});

test('sync --from node_modules: installs new skill', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'new-skill');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runCli(['sync', '--from', 'node_modules', '--scope', 'project'], { cwd: dir });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    assert.ok(output.includes('installed=1'), `Expected installed=1 in output: ${output}`);

    const destSkill = path.join(dir, '.agents', 'skills', 'new-skill', 'SKILL.md');
    const content = await readFile(destSkill, 'utf8');
    assert.ok(content.includes('new-skill'));

    const lock = await readProjectLockfile(dir);
    assert.ok(lock.skills['new-skill']);
    assert.equal(lock.skills['new-skill'].source, 'new-skill');
    assert.equal(lock.skills['new-skill'].sourceType, 'node_modules');
    assert.ok(lock.skills['new-skill'].computedHash);
  });
});

test('sync --from node_modules: updates skill when hash changes', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'changed-skill');

    await writeProjectLockfile(dir, {
      version: 1,
      skills: {
        'changed-skill': {
          source: 'changed-skill',
          sourceType: 'node_modules',
          computedHash: 'old-hash-that-no-longer-matches',
          skillPath: '.agents/skills/changed-skill'
        }
      }
    });

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runCli(['sync', '--from', 'node_modules', '--scope', 'project'], { cwd: dir });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    assert.ok(output.includes('updated=1'), `Expected updated=1 in output: ${output}`);

    const lock = await readProjectLockfile(dir);
    assert.notEqual(lock.skills['changed-skill'].computedHash, 'old-hash-that-no-longer-matches');
  });
});

// ── --dry-run ───────────────────────────────────────────────────────────

test('sync --from node_modules --dry-run: does not write files', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'dry-skill');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runCli(['sync', '--from', 'node_modules', '--scope', 'project', '--dry-run'], { cwd: dir });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    assert.ok(output.includes('Dry run'), `Expected "Dry run" in output: ${output}`);
    assert.ok(output.includes('would install'), `Expected "would install" in output: ${output}`);

    const destDir = path.join(dir, '.agents', 'skills', 'dry-skill');
    let exists = false;
    try {
      await readdir(destDir);
      exists = true;
    } catch {}
    assert.equal(exists, false, 'dry-run should not create destination directory');

    const lock = await readProjectLockfile(dir);
    assert.deepStrictEqual(lock.skills, {});
  });
});

// ── lockfile update ─────────────────────────────────────────────────────

test('sync --from node_modules: lockfile records correct sourceType', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, '@myorg/tracked-skill');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runCli(['sync', '--from', 'node_modules', '--scope', 'project'], { cwd: dir });
    } finally {
      console.log = origLog;
    }

    const lock = await readProjectLockfile(dir);
    const entry = lock.skills['tracked-skill'];
    assert.ok(entry, 'lockfile should contain the skill');
    assert.equal(entry.source, '@myorg/tracked-skill');
    assert.equal(entry.sourceType, 'node_modules');
    assert.ok(entry.computedHash);
    assert.ok(entry.skillPath);
  });
});

test('sync --from node_modules: user scope installs to ~/.agents/skills', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'user-scope-skill');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runCli(['sync', '--from', 'node_modules', '--scope', 'user'], { cwd: dir });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    assert.ok(output.includes('installed=1'), `Expected installed=1 in output: ${output}`);
  });
});

// ── multiple skills at once ─────────────────────────────────────────────

test('sync --from node_modules: handles mixed new, updated, and unchanged skills', async () => {
  await withTmpDir(async (dir) => {
    const nmDir = path.join(dir, 'node_modules');
    await scaffoldPackageWithSkill(nmDir, 'new-one');
    await scaffoldPackageWithSkill(nmDir, 'up-to-date');
    await scaffoldPackageWithSkill(nmDir, 'changed-one');

    const upToDateHash = await computeSkillFolderHash(path.join(nmDir, 'up-to-date'));

    await writeProjectLockfile(dir, {
      version: 1,
      skills: {
        'up-to-date': {
          source: 'up-to-date',
          sourceType: 'node_modules',
          computedHash: upToDateHash,
          skillPath: '.agents/skills/up-to-date'
        },
        'changed-one': {
          source: 'changed-one',
          sourceType: 'node_modules',
          computedHash: 'stale-hash-value',
          skillPath: '.agents/skills/changed-one'
        }
      }
    });

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await runCli(['sync', '--from', 'node_modules', '--scope', 'project'], { cwd: dir });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    assert.ok(output.includes('discovered=3'), `Expected discovered=3 in: ${output}`);
    assert.ok(output.includes('skipped=1'), `Expected skipped=1 in: ${output}`);
    assert.ok(output.includes('installed=1'), `Expected installed=1 in: ${output}`);
    assert.ok(output.includes('updated=1'), `Expected updated=1 in: ${output}`);
  });
});
