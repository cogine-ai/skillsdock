import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  readProjectLockfile,
  writeProjectLockfile,
  computeSkillFolderHash,
  updateLockfileEntry,
  removeLockfileEntry
} from '../bin/skillsdock-core.mjs';

async function makeTmpDir() {
  return mkdtemp(path.join(tmpdir(), 'skillsdock-lock-test-'));
}

// ── readProjectLockfile ────────────────────────────────────────────────

test('readProjectLockfile: returns empty structure when file does not exist', async () => {
  const dir = await makeTmpDir();
  const data = await readProjectLockfile(dir);
  assert.deepStrictEqual(data, { version: 1, skills: {} });
  await rm(dir, { recursive: true });
});

test('readProjectLockfile: reads valid lockfile', async () => {
  const dir = await makeTmpDir();
  const lock = {
    version: 1,
    skills: {
      'my-skill': {
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo',
        computedHash: 'abc123',
        skillPath: 'skills/my-skill'
      }
    }
  };
  await writeFile(path.join(dir, 'skills-lock.json'), JSON.stringify(lock), 'utf8');
  const data = await readProjectLockfile(dir);
  assert.deepStrictEqual(data, lock);
  await rm(dir, { recursive: true });
});

test('readProjectLockfile: returns empty on invalid JSON', async () => {
  const dir = await makeTmpDir();
  await writeFile(path.join(dir, 'skills-lock.json'), '{ bad json !!!', 'utf8');
  const data = await readProjectLockfile(dir);
  assert.deepStrictEqual(data, { version: 1, skills: {} });
  await rm(dir, { recursive: true });
});

test('readProjectLockfile: returns empty on merge-conflict markers', async () => {
  const dir = await makeTmpDir();
  const conflicted = `{
  "version": 1,
  "skills": {
<<<<<<< HEAD
    "skill-a": { "source": "a/b" }
=======
    "skill-b": { "source": "c/d" }
>>>>>>> feature
  }
}`;
  await writeFile(path.join(dir, 'skills-lock.json'), conflicted, 'utf8');
  const data = await readProjectLockfile(dir);
  assert.deepStrictEqual(data, { version: 1, skills: {} });
  await rm(dir, { recursive: true });
});

test('readProjectLockfile: handles missing skills key', async () => {
  const dir = await makeTmpDir();
  await writeFile(path.join(dir, 'skills-lock.json'), '{"version":1}', 'utf8');
  const data = await readProjectLockfile(dir);
  assert.deepStrictEqual(data, { version: 1, skills: {} });
  await rm(dir, { recursive: true });
});

// ── writeProjectLockfile ───────────────────────────────────────────────

test('writeProjectLockfile: writes sorted, deterministic JSON with trailing newline', async () => {
  const dir = await makeTmpDir();
  const lockData = {
    version: 1,
    skills: {
      'zebra-skill': { source: 'z/repo', sourceType: 'github' },
      'alpha-skill': { source: 'a/repo', sourceType: 'github' },
      'middle-skill': { source: 'm/repo', sourceType: 'github' }
    }
  };
  await writeProjectLockfile(dir, lockData);
  const raw = await readFile(path.join(dir, 'skills-lock.json'), 'utf8');

  assert.ok(raw.endsWith('\n'), 'should end with newline');
  const parsed = JSON.parse(raw);
  const keys = Object.keys(parsed.skills);
  assert.deepStrictEqual(keys, ['alpha-skill', 'middle-skill', 'zebra-skill']);
  await rm(dir, { recursive: true });
});

test('writeProjectLockfile: deterministic output (same input → same output)', async () => {
  const dir = await makeTmpDir();
  const lockData = {
    version: 1,
    skills: {
      b: { source: 'x/y' },
      a: { source: 'w/z' }
    }
  };
  await writeProjectLockfile(dir, lockData);
  const raw1 = await readFile(path.join(dir, 'skills-lock.json'), 'utf8');
  await writeProjectLockfile(dir, lockData);
  const raw2 = await readFile(path.join(dir, 'skills-lock.json'), 'utf8');
  assert.strictEqual(raw1, raw2);
  await rm(dir, { recursive: true });
});

test('writeProjectLockfile: uses 2-space indent', async () => {
  const dir = await makeTmpDir();
  await writeProjectLockfile(dir, { version: 1, skills: { s: { v: 1 } } });
  const raw = await readFile(path.join(dir, 'skills-lock.json'), 'utf8');
  assert.ok(raw.includes('  "version"'), 'should use 2-space indent');
  await rm(dir, { recursive: true });
});

// ── read / write round-trip ────────────────────────────────────────────

test('round-trip: write then read preserves data', async () => {
  const dir = await makeTmpDir();
  const original = {
    version: 1,
    skills: {
      'skill-one': {
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo',
        computedHash: 'deadbeef',
        skillPath: 'skills/skill-one'
      }
    }
  };
  await writeProjectLockfile(dir, original);
  const readBack = await readProjectLockfile(dir);
  assert.deepStrictEqual(readBack, original);
  await rm(dir, { recursive: true });
});

// ── computeSkillFolderHash ─────────────────────────────────────────────

test('computeSkillFolderHash: produces deterministic hash', async () => {
  const dir = await makeTmpDir();
  const skillDir = path.join(dir, 'my-skill');
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill\n');
  await writeFile(path.join(skillDir, 'index.js'), 'console.log("hi");\n');

  const hash1 = await computeSkillFolderHash(skillDir);
  const hash2 = await computeSkillFolderHash(skillDir);
  assert.strictEqual(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
  await rm(dir, { recursive: true });
});

test('computeSkillFolderHash: different content produces different hash', async () => {
  const dir = await makeTmpDir();
  const skillA = path.join(dir, 'skill-a');
  const skillB = path.join(dir, 'skill-b');
  await mkdir(skillA, { recursive: true });
  await mkdir(skillB, { recursive: true });
  await writeFile(path.join(skillA, 'file.txt'), 'content-a');
  await writeFile(path.join(skillB, 'file.txt'), 'content-b');

  const hashA = await computeSkillFolderHash(skillA);
  const hashB = await computeSkillFolderHash(skillB);
  assert.notStrictEqual(hashA, hashB);
  await rm(dir, { recursive: true });
});

test('computeSkillFolderHash: skips .git and node_modules', async () => {
  const dir = await makeTmpDir();
  const skillDir = path.join(dir, 'my-skill');
  await mkdir(path.join(skillDir, '.git'), { recursive: true });
  await mkdir(path.join(skillDir, 'node_modules'), { recursive: true });
  await writeFile(path.join(skillDir, '.git', 'HEAD'), 'ref: refs/heads/main');
  await writeFile(path.join(skillDir, 'node_modules', 'pkg.js'), 'module.exports = {}');
  await writeFile(path.join(skillDir, 'SKILL.md'), '# Skill');

  const hashWith = await computeSkillFolderHash(skillDir);

  const skillDir2 = path.join(dir, 'my-skill-clean');
  await mkdir(skillDir2, { recursive: true });
  await writeFile(path.join(skillDir2, 'SKILL.md'), '# Skill');

  const hashWithout = await computeSkillFolderHash(skillDir2);
  assert.strictEqual(hashWith, hashWithout);
  await rm(dir, { recursive: true });
});

test('computeSkillFolderHash: is path-aware (rename detection)', async () => {
  const dir = await makeTmpDir();
  const skillA = path.join(dir, 'skill-a');
  const skillB = path.join(dir, 'skill-b');
  await mkdir(skillA, { recursive: true });
  await mkdir(skillB, { recursive: true });
  await writeFile(path.join(skillA, 'foo.txt'), 'same-content');
  await writeFile(path.join(skillB, 'bar.txt'), 'same-content');

  const hashA = await computeSkillFolderHash(skillA);
  const hashB = await computeSkillFolderHash(skillB);
  assert.notStrictEqual(hashA, hashB, 'different filenames → different hash');
  await rm(dir, { recursive: true });
});

test('computeSkillFolderHash: recurses into subdirectories', async () => {
  const dir = await makeTmpDir();
  const skillDir = path.join(dir, 'my-skill');
  await mkdir(path.join(skillDir, 'sub', 'deep'), { recursive: true });
  await writeFile(path.join(skillDir, 'top.txt'), 'top');
  await writeFile(path.join(skillDir, 'sub', 'mid.txt'), 'mid');
  await writeFile(path.join(skillDir, 'sub', 'deep', 'leaf.txt'), 'leaf');

  const hash = await computeSkillFolderHash(skillDir);
  assert.match(hash, /^[0-9a-f]{64}$/);
  await rm(dir, { recursive: true });
});

test('computeSkillFolderHash: empty directory returns valid hash', async () => {
  const dir = await makeTmpDir();
  const skillDir = path.join(dir, 'empty-skill');
  await mkdir(skillDir, { recursive: true });

  const hash = await computeSkillFolderHash(skillDir);
  assert.match(hash, /^[0-9a-f]{64}$/);
  await rm(dir, { recursive: true });
});

// ── updateLockfileEntry ────────────────────────────────────────────────

test('updateLockfileEntry: adds entry to empty lockfile', async () => {
  const dir = await makeTmpDir();
  await updateLockfileEntry(dir, 'new-skill', {
    source: 'owner/repo',
    sourceType: 'github',
    computedHash: 'abc'
  });
  const data = await readProjectLockfile(dir);
  assert.ok(data.skills['new-skill']);
  assert.strictEqual(data.skills['new-skill'].source, 'owner/repo');
  await rm(dir, { recursive: true });
});

test('updateLockfileEntry: updates existing entry', async () => {
  const dir = await makeTmpDir();
  await updateLockfileEntry(dir, 'my-skill', { source: 'a/b', computedHash: '111' });
  await updateLockfileEntry(dir, 'my-skill', { source: 'a/b', computedHash: '222' });
  const data = await readProjectLockfile(dir);
  assert.strictEqual(data.skills['my-skill'].computedHash, '222');
  await rm(dir, { recursive: true });
});

test('updateLockfileEntry: preserves other entries', async () => {
  const dir = await makeTmpDir();
  await updateLockfileEntry(dir, 'skill-a', { source: 'a/a' });
  await updateLockfileEntry(dir, 'skill-b', { source: 'b/b' });
  const data = await readProjectLockfile(dir);
  assert.ok(data.skills['skill-a']);
  assert.ok(data.skills['skill-b']);
  await rm(dir, { recursive: true });
});

// ── removeLockfileEntry ────────────────────────────────────────────────

test('removeLockfileEntry: removes entry', async () => {
  const dir = await makeTmpDir();
  await updateLockfileEntry(dir, 'skill-a', { source: 'a/a' });
  await updateLockfileEntry(dir, 'skill-b', { source: 'b/b' });
  await removeLockfileEntry(dir, 'skill-a');
  const data = await readProjectLockfile(dir);
  assert.strictEqual(data.skills['skill-a'], undefined);
  assert.ok(data.skills['skill-b']);
  await rm(dir, { recursive: true });
});

test('removeLockfileEntry: no-op when entry does not exist', async () => {
  const dir = await makeTmpDir();
  await writeProjectLockfile(dir, { version: 1, skills: { x: { source: 'x/x' } } });
  await removeLockfileEntry(dir, 'nonexistent');
  const data = await readProjectLockfile(dir);
  assert.ok(data.skills.x);
  await rm(dir, { recursive: true });
});

test('removeLockfileEntry: leaves empty skills object when last entry removed', async () => {
  const dir = await makeTmpDir();
  await updateLockfileEntry(dir, 'only', { source: 'o/o' });
  await removeLockfileEntry(dir, 'only');
  const data = await readProjectLockfile(dir);
  assert.deepStrictEqual(data.skills, {});
  assert.strictEqual(data.version, 1);
  await rm(dir, { recursive: true });
});
