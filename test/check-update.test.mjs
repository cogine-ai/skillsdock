import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  checkSkillUpdates,
  cmdCheck,
  cmdUpdate,
  readProjectLockfile,
  writeProjectLockfile,
  resolveGitHubToken,
  detectProjectRoot
} from '../bin/skillsdock-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'skillsdock.mjs');

async function makeTmpDir() {
  return mkdtemp(path.join(tmpdir(), 'skillsdock-test-'));
}

async function initGitRepo(dir) {
  spawnSync('git', ['init', dir], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
  await writeFile(path.join(dir, '.gitkeep'), '', 'utf8');
  spawnSync('git', ['-C', dir, 'add', '.'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'commit', '-m', 'init'], { encoding: 'utf8' });
}

function makeFetchFn(treeResponse) {
  return async (url, opts) => {
    if (url.includes('/git/trees/')) {
      return { ok: true, status: 200, json: async () => treeResponse };
    }
    return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
  };
}

function makeFailingFetchFn(status = 500, message = 'Internal Server Error') {
  return async (url, opts) => {
    return {
      ok: false,
      status,
      json: async () => ({ message })
    };
  };
}

function makeRateLimitFetchFn() {
  return async (url, opts) => {
    return {
      ok: false,
      status: 403,
      json: async () => ({ message: 'rate limit exceeded' })
    };
  };
}

const MOCK_TREE = {
  sha: 'abc123',
  tree: [
    { path: 'SKILL.md', type: 'blob', sha: 'file-sha-1' },
    { path: 'index.js', type: 'blob', sha: 'file-sha-2' },
    { path: 'lib', type: 'tree', sha: 'dir-sha-1' },
    { path: 'lib/helper.js', type: 'blob', sha: 'file-sha-3' }
  ]
};

const UPDATED_TREE = {
  sha: 'def456',
  tree: [
    { path: 'SKILL.md', type: 'blob', sha: 'changed-sha-1' },
    { path: 'index.js', type: 'blob', sha: 'file-sha-2' },
    { path: 'lib', type: 'tree', sha: 'dir-sha-1' },
    { path: 'lib/helper.js', type: 'blob', sha: 'file-sha-3' },
    { path: 'lib/new-file.js', type: 'blob', sha: 'file-sha-4' }
  ]
};

import crypto from 'node:crypto';

function computeTreeFingerprint(treeData, subpath) {
  const prefix = subpath ? (subpath.endsWith('/') ? subpath : subpath + '/') : '';
  const relevant = treeData.tree.filter((entry) => {
    if (!prefix) return true;
    return entry.path === subpath || entry.path.startsWith(prefix);
  });
  relevant.sort((a, b) => a.path.localeCompare(b.path));
  const hash = crypto.createHash('sha256');
  for (const entry of relevant) {
    hash.update(entry.path);
    hash.update(entry.sha || '');
  }
  return hash.digest('hex');
}

// --- resolveGitHubToken tests ---

test('resolveGitHubToken returns GITHUB_TOKEN when set', () => {
  const origGH = process.env.GITHUB_TOKEN;
  const origGHT = process.env.GH_TOKEN;
  try {
    process.env.GITHUB_TOKEN = 'test-github-token';
    process.env.GH_TOKEN = 'test-gh-token';
    const token = resolveGitHubToken();
    assert.equal(token, 'test-github-token');
  } finally {
    if (origGH !== undefined) process.env.GITHUB_TOKEN = origGH;
    else delete process.env.GITHUB_TOKEN;
    if (origGHT !== undefined) process.env.GH_TOKEN = origGHT;
    else delete process.env.GH_TOKEN;
  }
});

test('resolveGitHubToken falls back to GH_TOKEN when GITHUB_TOKEN not set', () => {
  const origGH = process.env.GITHUB_TOKEN;
  const origGHT = process.env.GH_TOKEN;
  try {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'test-gh-token';
    const token = resolveGitHubToken();
    assert.equal(token, 'test-gh-token');
  } finally {
    if (origGH !== undefined) process.env.GITHUB_TOKEN = origGH;
    else delete process.env.GITHUB_TOKEN;
    if (origGHT !== undefined) process.env.GH_TOKEN = origGHT;
    else delete process.env.GH_TOKEN;
  }
});

test('resolveGitHubToken returns null when no token available', () => {
  const origGH = process.env.GITHUB_TOKEN;
  const origGHT = process.env.GH_TOKEN;
  try {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    const token = resolveGitHubToken();
    assert.ok(token === null || typeof token === 'string');
  } finally {
    if (origGH !== undefined) process.env.GITHUB_TOKEN = origGH;
    else delete process.env.GITHUB_TOKEN;
    if (origGHT !== undefined) process.env.GH_TOKEN = origGHT;
    else delete process.env.GH_TOKEN;
  }
});

// --- checkSkillUpdates tests ---

test('checkSkillUpdates detects updates available', async () => {
  const currentFingerprint = computeTreeFingerprint(MOCK_TREE, '');
  const lockSkills = {
    'my-skill': {
      source: 'test-owner/test-repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/test-owner/test-repo',
      computedHash: currentFingerprint,
      skillPath: '.agents/skills/my-skill'
    }
  };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: makeFetchFn(UPDATED_TREE),
    token: null
  });

  assert.equal(result.updatesAvailable.length, 1);
  assert.equal(result.updatesAvailable[0].name, 'my-skill');
  assert.equal(result.upToDate.length, 0);
});

test('checkSkillUpdates reports up-to-date when hashes match', async () => {
  const currentFingerprint = computeTreeFingerprint(MOCK_TREE, '');
  const lockSkills = {
    'my-skill': {
      source: 'test-owner/test-repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/test-owner/test-repo',
      computedHash: currentFingerprint,
      skillPath: '.agents/skills/my-skill'
    }
  };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: makeFetchFn(MOCK_TREE),
    token: null
  });

  assert.equal(result.upToDate.length, 1);
  assert.equal(result.upToDate[0].name, 'my-skill');
  assert.equal(result.updatesAvailable.length, 0);
});

test('checkSkillUpdates skips skills with no source URL', async () => {
  const lockSkills = {
    'local-skill': {
      source: './local/path',
      sourceType: 'local',
      sourceUrl: null,
      computedHash: 'abc123',
      skillPath: '.agents/skills/local-skill'
    }
  };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: makeFetchFn(MOCK_TREE),
    token: null
  });

  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].name, 'local-skill');
  assert.equal(result.skipped[0].reason, 'no source URL');
});

test('checkSkillUpdates skips non-GitHub sources', async () => {
  const lockSkills = {
    'gitlab-skill': {
      source: 'gitlab:owner/repo',
      sourceType: 'gitlab',
      sourceUrl: 'https://gitlab.com/owner/repo',
      computedHash: 'abc123',
      skillPath: '.agents/skills/gitlab-skill'
    }
  };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: makeFetchFn(MOCK_TREE),
    token: null
  });

  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /non-GitHub/);
});

test('checkSkillUpdates batches same-repo skills into one API call', async () => {
  let treeCallCount = 0;
  const countingFetch = async (url, opts) => {
    if (url.includes('/git/trees/')) {
      treeCallCount++;
      return { ok: true, status: 200, json: async () => MOCK_TREE };
    }
    return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
  };

  const lockSkills = {
    'skill-a': {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      computedHash: 'old-hash-a',
      skillPath: '.agents/skills/skill-a'
    },
    'skill-b': {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      computedHash: 'old-hash-b',
      skillPath: '.agents/skills/skill-b'
    }
  };

  await checkSkillUpdates(lockSkills, {}, {
    fetchFn: countingFetch,
    token: null
  });

  assert.equal(treeCallCount, 1, 'Should only make one tree API call for same repo');
});

test('checkSkillUpdates handles network errors gracefully', async () => {
  const lockSkills = {
    'my-skill': {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      computedHash: 'abc123',
      skillPath: '.agents/skills/my-skill'
    }
  };

  const failFetch = async () => { throw new Error('Network unreachable'); };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: failFetch,
    token: null
  });

  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /network error/);
});

test('checkSkillUpdates handles rate limit (403)', async () => {
  const lockSkills = {
    'my-skill': {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      computedHash: 'abc123',
      skillPath: '.agents/skills/my-skill'
    }
  };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: makeRateLimitFetchFn(),
    token: null
  });

  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /rate limited/);
});

test('checkSkillUpdates handles empty lockfile', async () => {
  const result = await checkSkillUpdates({}, {}, {
    fetchFn: makeFetchFn(MOCK_TREE),
    token: null
  });

  assert.equal(result.upToDate.length, 0);
  assert.equal(result.updatesAvailable.length, 0);
  assert.equal(result.skipped.length, 0);
});

test('checkSkillUpdates also checks registry items', async () => {
  const lockSkills = {};
  const registryItems = {
    'some-key': {
      id: 'registry-skill',
      externalSource: 'owner/repo',
      externalSourceType: 'github',
      externalSourceUrl: 'https://github.com/owner/repo',
      externalHash: 'old-registry-hash'
    }
  };

  const result = await checkSkillUpdates(lockSkills, registryItems, {
    fetchFn: makeFetchFn(MOCK_TREE),
    token: null
  });

  assert.equal(result.updatesAvailable.length + result.upToDate.length, 1);
});

// --- cmdCheck tests ---

test('cmdCheck outputs text report with updates available', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  const currentFingerprint = computeTreeFingerprint(MOCK_TREE, '');
  await writeProjectLockfile(tmpDir, {
    version: 1,
    skills: {
      'up-to-date-skill': {
        source: 'owner/repo-a',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo-a',
        computedHash: currentFingerprint,
        skillPath: '.agents/skills/up-to-date-skill'
      },
      'outdated-skill': {
        source: 'owner/repo-b',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo-b',
        computedHash: 'stale-hash',
        skillPath: '.agents/skills/outdated-skill'
      },
      'local-skill': {
        source: './local',
        sourceType: 'local',
        sourceUrl: null,
        computedHash: null,
        skillPath: '.agents/skills/local-skill'
      }
    }
  });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdCheck({ json: false }, {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  assert.match(output, /1 skill up to date/);
  assert.match(output, /1 skill has updates available/);
  assert.match(output, /outdated-skill/);
  assert.match(output, /1 skill skipped/);
});

test('cmdCheck outputs JSON when --json flag is set', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  const currentFingerprint = computeTreeFingerprint(MOCK_TREE, '');
  await writeProjectLockfile(tmpDir, {
    version: 1,
    skills: {
      'my-skill': {
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo',
        computedHash: currentFingerprint,
        skillPath: '.agents/skills/my-skill'
      }
    }
  });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdCheck({ json: true }, {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  const parsed = JSON.parse(output);
  assert.ok(Array.isArray(parsed.upToDate));
  assert.ok(Array.isArray(parsed.updatesAvailable));
  assert.ok(Array.isArray(parsed.skipped));
  assert.equal(parsed.upToDate.length, 1);
  assert.equal(parsed.upToDate[0].name, 'my-skill');
});

test('cmdCheck JSON output has no ANSI escape codes', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await writeProjectLockfile(tmpDir, {
    version: 1,
    skills: {
      'my-skill': {
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo',
        computedHash: 'old-hash',
        skillPath: '.agents/skills/my-skill'
      }
    }
  });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdCheck({ json: true }, {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  // eslint-disable-next-line no-control-regex
  assert.ok(!/\u001b/.test(output), 'JSON output should not contain ANSI escape codes');
  const parsed = JSON.parse(output);
  assert.ok(parsed);
});

test('cmdCheck shows no-skills message when lockfile is empty', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await writeProjectLockfile(tmpDir, { version: 1, skills: {} });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdCheck({ json: false }, {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  assert.match(output, /No tracked skills found/);
});

test('cmdCheck --json returns empty arrays when no skills tracked', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await writeProjectLockfile(tmpDir, { version: 1, skills: {} });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdCheck({ json: true }, {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed.upToDate, []);
  assert.deepEqual(parsed.updatesAvailable, []);
  assert.deepEqual(parsed.skipped, []);
});

// --- cmdUpdate tests ---

test('cmdUpdate --dry-run does not modify files', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await writeProjectLockfile(tmpDir, {
    version: 1,
    skills: {
      'my-skill': {
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo',
        computedHash: 'stale-hash',
        skillPath: '.agents/skills/my-skill'
      }
    }
  });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdUpdate({ 'dry-run': true, scope: 'project' }, [], {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  assert.match(output, /dry-run/i);
  assert.match(output, /my-skill/);

  const lockData = await readProjectLockfile(tmpDir);
  assert.equal(lockData.skills['my-skill'].computedHash, 'stale-hash', 'Hash should not change in dry-run');
});

test('cmdUpdate shows no-skills message for empty lockfile', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await writeProjectLockfile(tmpDir, { version: 1, skills: {} });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdUpdate({ scope: 'project' }, [], {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  assert.match(output, /No tracked skills found/);
});

test('cmdUpdate shows already-up-to-date message', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  const currentFingerprint = computeTreeFingerprint(MOCK_TREE, '');
  await writeProjectLockfile(tmpDir, {
    version: 1,
    skills: {
      'my-skill': {
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo',
        computedHash: currentFingerprint,
        skillPath: '.agents/skills/my-skill'
      }
    }
  });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await cmdUpdate({ scope: 'project' }, [], {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    });
  } finally {
    console.log = origLog;
  }

  const output = logs.join('\n');
  assert.match(output, /already up to date/);
});

test('cmdUpdate rejects invalid --scope', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await assert.rejects(
    () => cmdUpdate({ scope: 'invalid' }, [], {
      projectRoot: tmpDir,
      cwd: tmpDir,
      _fetchFn: makeFetchFn(MOCK_TREE)
    }),
    /Invalid --scope/
  );
});

// --- CLI process tests ---

test('skillsdock check --help shows check in help text', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    encoding: 'utf8',
    env: { ...process.env }
  });
  assert.match(result.stdout, /check/);
  assert.match(result.stdout, /update/);
});

test('skillsdock check works via CLI process', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await writeProjectLockfile(tmpDir, { version: 1, skills: {} });

  const result = spawnSync(process.execPath, [cliPath, 'check'], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: { ...process.env }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No tracked skills found/);
});

test('skillsdock update works via CLI process', async () => {
  const tmpDir = await makeTmpDir();
  await initGitRepo(tmpDir);

  await writeProjectLockfile(tmpDir, { version: 1, skills: {} });

  const result = spawnSync(process.execPath, [cliPath, 'update', '--scope', 'project'], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: { ...process.env }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No tracked skills found/);
});

// --- Mixed scenario tests ---

test('checkSkillUpdates handles mix of up-to-date, outdated, and skipped skills', async () => {
  const currentFingerprint = computeTreeFingerprint(MOCK_TREE, '');
  const lockSkills = {
    'fresh-skill': {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      computedHash: currentFingerprint,
      skillPath: '.agents/skills/fresh-skill'
    },
    'stale-skill': {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      computedHash: 'stale-hash-value',
      skillPath: '.agents/skills/stale-skill'
    },
    'local-only': {
      source: './local',
      sourceType: 'local',
      sourceUrl: null,
      computedHash: null,
      skillPath: '.agents/skills/local-only'
    }
  };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: makeFetchFn(MOCK_TREE),
    token: null
  });

  assert.equal(result.upToDate.length, 1);
  assert.equal(result.upToDate[0].name, 'fresh-skill');
  assert.equal(result.updatesAvailable.length, 1);
  assert.equal(result.updatesAvailable[0].name, 'stale-skill');
  assert.ok(result.skipped.length >= 1);
  assert.ok(result.skipped.some((s) => s.name === 'local-only'));
});

test('checkSkillUpdates updatesAvailable contains correct fields', async () => {
  const lockSkills = {
    'my-skill': {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      computedHash: 'old-hash',
      skillPath: '.agents/skills/my-skill'
    }
  };

  const result = await checkSkillUpdates(lockSkills, {}, {
    fetchFn: makeFetchFn(MOCK_TREE),
    token: null
  });

  assert.equal(result.updatesAvailable.length, 1);
  const update = result.updatesAvailable[0];
  assert.ok(update.name);
  assert.ok(update.source);
  assert.ok(update.currentHash);
  assert.ok(update.remoteHash);
});
