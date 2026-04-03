import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeRegistry,
  readProjectLockfile,
  writeProjectLockfile,
  removeLockfileEntry,
  cmdRemove
} from '../bin/skillsdock-core.mjs';

async function makeTmpDir() {
  return mkdtemp(path.join(tmpdir(), 'skillsdock-remove-test-'));
}

async function withTmpDir(fn) {
  const dir = await makeTmpDir();
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true });
  }
}

async function pathExists(p) {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

function buildRegistry(items = {}) {
  return normalizeRegistry({ version: 2, items });
}

function makeSkillItem(id, canonicalPath, opts = {}) {
  return {
    id,
    canonicalPath,
    realPath: opts.realPath || canonicalPath,
    sourcePath: canonicalPath,
    name: opts.name || id,
    description: opts.description || '',
    normalized: { name: opts.name || id, description: '', body: '' },
    hash: opts.hash || 'abc123',
    policy: opts.policy || { tag: 'regular', reason: '', updatedAt: null },
    state: opts.state || 'active',
    sourceAliases: opts.sourceAliases || [{ name: 'test-source', agent: null, scope: opts.scope || 'user' }],
    sourceName: 'test-source',
    sourceAgent: null,
    sourceScope: opts.scope || 'user'
  };
}

async function setupSkillDir(base, skillId) {
  const skillDir = path.join(base, '.agents', 'skills', skillId);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: "${skillId}"\n---\n# ${skillId}`, 'utf8');
  return skillDir;
}

async function writeRegistry(registryPath, registry) {
  await writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

async function readRegistry(registryPath) {
  const raw = await readFile(registryPath, 'utf8');
  return JSON.parse(raw);
}

// ── Basic remove ─────────────────────────────────────────────────────────

test('remove: deletes skill directory and updates registry tag to deleted', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const skillDir = await setupSkillDir(homeDir, 'my-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'my-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('my-skill', canonicalPath, { scope: 'user' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, scope: 'user' };
    const args = ['my-skill'];

    await cmdRemove(flags, args, context);

    assert.equal(await pathExists(skillDir), false, 'skill directory should be removed');

    const updatedReg = await readRegistry(registryPath);
    const key = `path:${canonicalPath}`;
    assert.equal(updatedReg.items[key].policy.tag, 'deleted');
    assert.equal(updatedReg.items[key].policy.reason, 'removed by skillsdock remove');
  });
});

test('remove: also deletes symlinks from non-universal agent directories', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const skillDir = await setupSkillDir(homeDir, 'link-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'link-skill', 'SKILL.md');

    const claudeSkillDir = path.join(homeDir, '.claude', 'skills', 'link-skill');
    await mkdir(claudeSkillDir, { recursive: true });
    const symlinkTarget = path.join(claudeSkillDir, 'SKILL.md');
    const relTarget = path.relative(claudeSkillDir, path.join(skillDir, 'SKILL.md'));
    await symlink(relTarget, symlinkTarget);

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('link-skill', canonicalPath, { scope: 'user' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, scope: 'user' };
    const args = ['link-skill'];

    await cmdRemove(flags, args, context);

    assert.equal(await pathExists(skillDir), false, 'skill directory should be removed');
    assert.equal(await pathExists(symlinkTarget), false, 'symlink in claude dir should be removed');
  });
});

// ── Frozen protection ────────────────────────────────────────────────────

test('remove: refuses to delete frozen skill without --force', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const skillDir = await setupSkillDir(homeDir, 'frozen-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'frozen-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('frozen-skill', canonicalPath, {
        scope: 'user',
        policy: { tag: 'frozen', reason: 'locked', updatedAt: '2026-01-01T00:00:00.000Z' }
      })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, scope: 'user' };
    const args = ['frozen-skill'];

    await cmdRemove(flags, args, context);

    assert.equal(await pathExists(skillDir), true, 'frozen skill directory should NOT be removed');
    const updatedReg = await readRegistry(registryPath);
    const key = `path:${canonicalPath}`;
    assert.equal(updatedReg.items[key].policy.tag, 'frozen', 'tag should remain frozen');
  });
});

test('remove: --force deletes frozen skill', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const skillDir = await setupSkillDir(homeDir, 'frozen-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'frozen-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('frozen-skill', canonicalPath, {
        scope: 'user',
        policy: { tag: 'frozen', reason: 'locked', updatedAt: '2026-01-01T00:00:00.000Z' }
      })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, scope: 'user', force: true };
    const args = ['frozen-skill'];

    await cmdRemove(flags, args, context);

    assert.equal(await pathExists(skillDir), false, 'frozen skill directory should be removed with --force');
    const updatedReg = await readRegistry(registryPath);
    const key = `path:${canonicalPath}`;
    assert.equal(updatedReg.items[key].policy.tag, 'deleted');
  });
});

// ── Dry run ──────────────────────────────────────────────────────────────

test('remove: --dry-run does not modify files or registry', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const skillDir = await setupSkillDir(homeDir, 'dry-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'dry-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('dry-skill', canonicalPath, { scope: 'user' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, scope: 'user', 'dry-run': true };
    const args = ['dry-skill'];

    await cmdRemove(flags, args, context);

    assert.equal(await pathExists(skillDir), true, 'skill directory should still exist after dry run');
    const updatedReg = await readRegistry(registryPath);
    const key = `path:${canonicalPath}`;
    assert.equal(updatedReg.items[key].policy.tag, 'regular', 'tag should remain regular after dry run');
  });
});

// ── --all mode ───────────────────────────────────────────────────────────

test('remove: --all requires --scope', async () => {
  await withTmpDir(async (base) => {
    const registryPath = path.join(base, 'registry.json');
    await writeRegistry(registryPath, buildRegistry({}));
    const context = { cwd: base, projectRoot: base, homeDir: base };

    await assert.rejects(
      () => cmdRemove({ registry: registryPath, all: true }, [], context),
      (err) => {
        assert.match(err.message, /--all requires --scope/);
        assert.equal(err.exitCode, 2);
        return true;
      }
    );
  });
});

test('remove: --all removes all skills in scope', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');

    const skillDir1 = await setupSkillDir(homeDir, 'skill-a');
    const skillDir2 = await setupSkillDir(homeDir, 'skill-b');
    const registryPath = path.join(base, 'registry.json');

    const cp1 = path.join(skillsBase, 'skill-a', 'SKILL.md');
    const cp2 = path.join(skillsBase, 'skill-b', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${cp1}`]: makeSkillItem('skill-a', cp1, { scope: 'user' }),
      [`path:${cp2}`]: makeSkillItem('skill-b', cp2, { scope: 'user' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, all: true, scope: 'user' };

    await cmdRemove(flags, [], context);

    assert.equal(await pathExists(skillDir1), false, 'skill-a should be removed');
    assert.equal(await pathExists(skillDir2), false, 'skill-b should be removed');

    const updatedReg = await readRegistry(registryPath);
    assert.equal(updatedReg.items[`path:${cp1}`].policy.tag, 'deleted');
    assert.equal(updatedReg.items[`path:${cp2}`].policy.tag, 'deleted');
  });
});

// ── Lockfile update ──────────────────────────────────────────────────────

test('remove: updates lockfile by removing skill entry', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    await setupSkillDir(homeDir, 'lock-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'lock-skill', 'SKILL.md');

    const lockData = {
      version: 1,
      skills: {
        'lock-skill': { source: 'owner/repo', sourceType: 'github', computedHash: 'abc' },
        'other-skill': { source: 'owner/repo2', sourceType: 'github', computedHash: 'def' }
      }
    };
    await writeFile(path.join(base, 'skills-lock.json'), JSON.stringify(lockData, null, 2) + '\n', 'utf8');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('lock-skill', canonicalPath, { scope: 'user' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, scope: 'user' };
    const args = ['lock-skill'];

    await cmdRemove(flags, args, context);

    const updatedLock = await readProjectLockfile(base);
    assert.equal(updatedLock.skills['lock-skill'], undefined, 'lock-skill should be removed from lockfile');
    assert.ok(updatedLock.skills['other-skill'], 'other-skill should remain in lockfile');
  });
});

// ── Error cases ──────────────────────────────────────────────────────────

test('remove: throws when no selector and no --all', async () => {
  await withTmpDir(async (base) => {
    const registryPath = path.join(base, 'registry.json');
    await writeRegistry(registryPath, buildRegistry({}));
    const context = { cwd: base, projectRoot: base, homeDir: base };

    await assert.rejects(
      () => cmdRemove({ registry: registryPath }, [], context),
      (err) => {
        assert.match(err.message, /Usage/);
        assert.equal(err.exitCode, 2);
        return true;
      }
    );
  });
});

test('remove: throws when skill not found', async () => {
  await withTmpDir(async (base) => {
    const registryPath = path.join(base, 'registry.json');
    await writeRegistry(registryPath, buildRegistry({}));
    const context = { cwd: base, projectRoot: base, homeDir: base };

    await assert.rejects(
      () => cmdRemove({ registry: registryPath }, ['nonexistent'], context),
      (err) => {
        assert.match(err.message, /Skill not found/);
        assert.equal(err.exitCode, 2);
        return true;
      }
    );
  });
});

test('remove: throws for invalid --scope', async () => {
  await withTmpDir(async (base) => {
    const registryPath = path.join(base, 'registry.json');
    await writeRegistry(registryPath, buildRegistry({}));
    const context = { cwd: base, projectRoot: base, homeDir: base };

    await assert.rejects(
      () => cmdRemove({ registry: registryPath, scope: 'invalid' }, ['some-skill'], context),
      (err) => {
        assert.match(err.message, /Invalid --scope/);
        assert.equal(err.exitCode, 2);
        return true;
      }
    );
  });
});

// ── Project scope ────────────────────────────────────────────────────────

test('remove: works with project scope', async () => {
  await withTmpDir(async (base) => {
    const projectRoot = path.join(base, 'project');
    const skillsBase = path.join(projectRoot, '.agents', 'skills');
    const skillDir = path.join(skillsBase, 'proj-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: "proj-skill"\n---\n# proj`, 'utf8');

    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'proj-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('proj-skill', canonicalPath, { scope: 'project' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: projectRoot, projectRoot, homeDir: path.join(base, 'home') };
    const flags = { registry: registryPath, scope: 'project' };
    const args = ['proj-skill'];

    await cmdRemove(flags, args, context);

    assert.equal(await pathExists(skillDir), false, 'project skill directory should be removed');
  });
});

// ── --all with --dry-run ─────────────────────────────────────────────────

test('remove: --all with --dry-run does not delete anything', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const skillDir = await setupSkillDir(homeDir, 'dry-all-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'dry-all-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('dry-all-skill', canonicalPath, { scope: 'user' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    const flags = { registry: registryPath, all: true, scope: 'user', 'dry-run': true };

    await cmdRemove(flags, [], context);

    assert.equal(await pathExists(skillDir), true, 'dry run with --all should not remove skill');
    const updatedReg = await readRegistry(registryPath);
    assert.equal(updatedReg.items[`path:${canonicalPath}`].policy.tag, 'regular');
  });
});

// ── Registry tag update ──────────────────────────────────────────────────

test('remove: registry updatedAt is bumped after remove', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    await setupSkillDir(homeDir, 'ts-skill');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'ts-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('ts-skill', canonicalPath, { scope: 'user' })
    });
    registry.updatedAt = '2026-01-01T00:00:00.000Z';
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    await cmdRemove({ registry: registryPath, scope: 'user' }, ['ts-skill'], context);

    const updatedReg = await readRegistry(registryPath);
    assert.notEqual(updatedReg.updatedAt, '2026-01-01T00:00:00.000Z', 'updatedAt should be bumped');
  });
});

// ── Frozen + --all: mixed behavior ───────────────────────────────────────

test('remove: --all skips frozen skills, removes others', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const regularDir = await setupSkillDir(homeDir, 'regular-skill');
    const frozenDir = await setupSkillDir(homeDir, 'frozen-skill');
    const registryPath = path.join(base, 'registry.json');

    const cpRegular = path.join(skillsBase, 'regular-skill', 'SKILL.md');
    const cpFrozen = path.join(skillsBase, 'frozen-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${cpRegular}`]: makeSkillItem('regular-skill', cpRegular, { scope: 'user' }),
      [`path:${cpFrozen}`]: makeSkillItem('frozen-skill', cpFrozen, {
        scope: 'user',
        policy: { tag: 'frozen', reason: 'locked', updatedAt: '2026-01-01T00:00:00.000Z' }
      })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    await cmdRemove({ registry: registryPath, all: true, scope: 'user' }, [], context);

    assert.equal(await pathExists(regularDir), false, 'regular skill should be removed');
    assert.equal(await pathExists(frozenDir), true, 'frozen skill should remain');

    const updatedReg = await readRegistry(registryPath);
    assert.equal(updatedReg.items[`path:${cpRegular}`].policy.tag, 'deleted');
    assert.equal(updatedReg.items[`path:${cpFrozen}`].policy.tag, 'frozen');
  });
});

// ── Already deleted skill ────────────────────────────────────────────────

test('remove: ignores already-deleted skills in non-all mode', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const registryPath = path.join(base, 'registry.json');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const canonicalPath = path.join(skillsBase, 'gone-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('gone-skill', canonicalPath, {
        scope: 'user',
        policy: { tag: 'deleted', reason: 'already removed', updatedAt: '2026-01-01T00:00:00.000Z' }
      })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };

    await assert.rejects(
      () => cmdRemove({ registry: registryPath, scope: 'user' }, ['gone-skill'], context),
      (err) => {
        assert.match(err.message, /Skill not found/);
        return true;
      }
    );
  });
});

// ── Skill not on disk but in registry ────────────────────────────────────

test('remove: updates registry even when skill dir does not exist on disk', async () => {
  await withTmpDir(async (base) => {
    const homeDir = path.join(base, 'home');
    const skillsBase = path.join(homeDir, '.agents', 'skills');
    const registryPath = path.join(base, 'registry.json');
    const canonicalPath = path.join(skillsBase, 'phantom-skill', 'SKILL.md');

    const registry = buildRegistry({
      [`path:${canonicalPath}`]: makeSkillItem('phantom-skill', canonicalPath, { scope: 'user' })
    });
    await writeRegistry(registryPath, registry);

    const context = { cwd: base, projectRoot: base, homeDir };
    await cmdRemove({ registry: registryPath, scope: 'user' }, ['phantom-skill'], context);

    const updatedReg = await readRegistry(registryPath);
    assert.equal(updatedReg.items[`path:${canonicalPath}`].policy.tag, 'deleted');
  });
});
