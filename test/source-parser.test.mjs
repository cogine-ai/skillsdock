import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSource, getOwnerRepo, sanitizeSubpath } from '../bin/skillsdock-core.mjs';

/* ========== parseSource – local paths ========== */

test('parseSource: absolute path', () => {
  const r = parseSource('/home/user/skills');
  assert.equal(r.type, 'local');
  assert.equal(r.raw, '/home/user/skills');
});

test('parseSource: relative path with ./', () => {
  const r = parseSource('./my-skills');
  assert.equal(r.type, 'local');
});

test('parseSource: relative path with ../', () => {
  const r = parseSource('../skills');
  assert.equal(r.type, 'local');
});

test('parseSource: bare dot (.)', () => {
  const r = parseSource('.');
  assert.equal(r.type, 'local');
});

test('parseSource: bare dot-dot (..)', () => {
  const r = parseSource('..');
  assert.equal(r.type, 'local');
});

test('parseSource: Windows-style absolute path', () => {
  const r = parseSource('C:\\Users\\me\\skills');
  assert.equal(r.type, 'local');
});

test('parseSource: Windows drive with forward slash', () => {
  const r = parseSource('D:/projects/skill');
  assert.equal(r.type, 'local');
});

test('parseSource: relative path with backslash', () => {
  const r = parseSource('.\\my-skills');
  assert.equal(r.type, 'local');
});

test('parseSource: parent relative with backslash', () => {
  const r = parseSource('..\\skills');
  assert.equal(r.type, 'local');
});

/* ========== parseSource – GitHub URLs ========== */

test('parseSource: GitHub HTTPS URL', () => {
  const r = parseSource('https://github.com/owner/repo');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
  assert.equal(r.branch, null);
  assert.equal(r.subpath, null);
});

test('parseSource: GitHub URL with tree/branch', () => {
  const r = parseSource('https://github.com/owner/repo/tree/main');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
  assert.equal(r.branch, 'main');
  assert.equal(r.subpath, null);
});

test('parseSource: GitHub URL with tree/branch/path', () => {
  const r = parseSource('https://github.com/owner/repo/tree/develop/src/skills');
  assert.equal(r.type, 'github');
  assert.equal(r.branch, 'develop');
  assert.equal(r.subpath, 'src/skills');
});

test('parseSource: GitHub URL with trailing slash', () => {
  const r = parseSource('https://github.com/owner/repo/');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

test('parseSource: GitHub URL with .git suffix', () => {
  const r = parseSource('https://github.com/owner/repo.git');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

/* ========== parseSource – GitLab URLs ========== */

test('parseSource: GitLab HTTPS URL', () => {
  const r = parseSource('https://gitlab.com/group/repo');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group');
  assert.equal(r.repo, 'repo');
});

test('parseSource: GitLab URL with subgroup', () => {
  const r = parseSource('https://gitlab.com/group/subgroup/repo');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group/subgroup');
  assert.equal(r.repo, 'repo');
});

test('parseSource: GitLab URL with deeply nested subgroups', () => {
  const r = parseSource('https://gitlab.com/a/b/c/repo');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'a/b/c');
  assert.equal(r.repo, 'repo');
});

test('parseSource: GitLab URL with tree/branch via dash syntax', () => {
  const r = parseSource('https://gitlab.com/group/repo/-/tree/main/skills');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group');
  assert.equal(r.repo, 'repo');
  assert.equal(r.branch, 'main');
  assert.equal(r.subpath, 'skills');
});

test('parseSource: GitLab URL with .git suffix', () => {
  const r = parseSource('https://gitlab.com/group/repo.git');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.repo, 'repo');
});

test('parseSource: GitLab URL with trailing slash', () => {
  const r = parseSource('https://gitlab.com/group/repo/');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group');
  assert.equal(r.repo, 'repo');
});

/* ========== parseSource – shorthand (owner/repo) ========== */

test('parseSource: GitHub shorthand owner/repo', () => {
  const r = parseSource('owner/repo');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

test('parseSource: GitHub shorthand owner/repo@skill', () => {
  const r = parseSource('owner/repo@my-skill');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
  assert.equal(r.skillFilter, 'my-skill');
});

/* ========== parseSource – prefix shorthand ========== */

test('parseSource: github: prefix shorthand', () => {
  const r = parseSource('github:owner/repo');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

test('parseSource: gitlab: prefix shorthand', () => {
  const r = parseSource('gitlab:group/repo');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group');
  assert.equal(r.repo, 'repo');
});

test('parseSource: gitlab: prefix with subgroup', () => {
  const r = parseSource('gitlab:group/sub/repo');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group/sub');
  assert.equal(r.repo, 'repo');
});

test('parseSource: github: prefix with @skill filter', () => {
  const r = parseSource('github:owner/repo@my-skill');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
  assert.equal(r.skillFilter, 'my-skill');
});

/* ========== parseSource – SSH URLs ========== */

test('parseSource: SSH git@github.com URL', () => {
  const r = parseSource('git@github.com:owner/repo.git');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

test('parseSource: SSH git@github.com without .git', () => {
  const r = parseSource('git@github.com:owner/repo');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

test('parseSource: SSH git@gitlab.com URL', () => {
  const r = parseSource('git@gitlab.com:group/repo.git');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group');
  assert.equal(r.repo, 'repo');
});

test('parseSource: SSH git@unknown-host.com falls back to git-ssh', () => {
  const r = parseSource('git@bitbucket.org:owner/repo.git');
  assert.equal(r.type, 'git-ssh');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

test('parseSource: SSH with trailing slash', () => {
  const r = parseSource('git@github.com:owner/repo/');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

/* ========== parseSource – edge cases ========== */

test('parseSource: trims whitespace', () => {
  const r = parseSource('  owner/repo  ');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
  assert.equal(r.raw, 'owner/repo');
});

test('parseSource: throws on empty string', () => {
  assert.throws(() => parseSource(''), /Source argument is required/);
});

test('parseSource: throws on whitespace-only string', () => {
  assert.throws(() => parseSource('   '), /Source argument is required/);
});

test('parseSource: throws on null', () => {
  assert.throws(() => parseSource(null), /Source argument is required/);
});

test('parseSource: throws on undefined', () => {
  assert.throws(() => parseSource(undefined), /Source argument is required/);
});

test('parseSource: unknown single word falls back to local', () => {
  const r = parseSource('just-a-word');
  assert.equal(r.type, 'local');
});

test('parseSource: raw always preserves trimmed input', () => {
  const r = parseSource('https://github.com/owner/repo/tree/main/skills');
  assert.equal(r.raw, 'https://github.com/owner/repo/tree/main/skills');
});

/* ========== getOwnerRepo ========== */

test('getOwnerRepo: returns owner/repo string', () => {
  const parsed = parseSource('owner/repo');
  assert.equal(getOwnerRepo(parsed), 'owner/repo');
});

test('getOwnerRepo: works for GitLab with subgroups', () => {
  const parsed = parseSource('https://gitlab.com/group/sub/repo');
  assert.equal(getOwnerRepo(parsed), 'group/sub/repo');
});

test('getOwnerRepo: returns null when owner is missing', () => {
  assert.equal(getOwnerRepo({ owner: null, repo: 'repo' }), null);
});

test('getOwnerRepo: returns null when repo is missing', () => {
  assert.equal(getOwnerRepo({ owner: 'owner', repo: null }), null);
});

test('getOwnerRepo: returns null for null input', () => {
  assert.equal(getOwnerRepo(null), null);
});

/* ========== sanitizeSubpath ========== */

test('sanitizeSubpath: allows normal path', () => {
  assert.equal(sanitizeSubpath('src/skills'), 'src/skills');
});

test('sanitizeSubpath: normalizes backslashes', () => {
  assert.equal(sanitizeSubpath('src\\skills\\more'), 'src/skills/more');
});

test('sanitizeSubpath: returns null for null input', () => {
  assert.equal(sanitizeSubpath(null), null);
});

test('sanitizeSubpath: throws on ../ traversal', () => {
  assert.throws(() => sanitizeSubpath('../secret'), /Path traversal detected/);
});

test('sanitizeSubpath: throws on middle ../ traversal', () => {
  assert.throws(() => sanitizeSubpath('skills/../../../etc/passwd'), /Path traversal detected/);
});

test('sanitizeSubpath: throws on backslash traversal', () => {
  assert.throws(() => sanitizeSubpath('skills\\..\\secret'), /Path traversal detected/);
});

test('sanitizeSubpath: allows dots in directory names', () => {
  assert.equal(sanitizeSubpath('my.skills/v2.0'), 'my.skills/v2.0');
});

test('sanitizeSubpath: allows single dot segments', () => {
  assert.equal(sanitizeSubpath('./skills'), './skills');
});

test('sanitizeSubpath: rejects absolute POSIX path', () => {
  assert.throws(() => sanitizeSubpath('/etc/passwd'), /Absolute path detected/);
});

test('sanitizeSubpath: rejects absolute Windows path', () => {
  assert.throws(() => sanitizeSubpath('C:/Windows/system32'), /Absolute path detected/);
});

test('sanitizeSubpath: rejects UNC-style path', () => {
  assert.throws(() => sanitizeSubpath('//server/share'), /Absolute path detected/);
});

/* ========== Regression: GitLab repo named "tree" (fix1) ========== */

test('parseSource: GitLab URL where repo is named "tree"', () => {
  const r = parseSource('https://gitlab.com/group/tree');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group');
  assert.equal(r.repo, 'tree');
});

test('parseSource: GitLab URL where subgroup is named "tree"', () => {
  const r = parseSource('https://gitlab.com/group/tree/repo');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group/tree');
  assert.equal(r.repo, 'repo');
});

/* ========== Regression: disambiguation of shorthand vs local (fix3) ========== */

test('parseSource: bare "owner/repo" matching GitHub username rules is shorthand', () => {
  const r = parseSource('my-org/my-repo');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'my-org');
  assert.equal(r.repo, 'my-repo');
});

test('parseSource: path with spaces treated as local', () => {
  const r = parseSource('my skills/foo');
  assert.equal(r.type, 'local');
});

test('parseSource: path with leading hyphen in owner treated as local', () => {
  const r = parseSource('-invalid/repo');
  assert.equal(r.type, 'local');
});

test('parseSource: multi-segment path falls back to local', () => {
  const r = parseSource('a/b/c');
  assert.equal(r.type, 'local');
});

/* ========== Regression: ssh:// protocol (fix4) ========== */

test('parseSource: ssh:// protocol GitHub URL', () => {
  const r = parseSource('ssh://git@github.com/owner/repo.git');
  assert.equal(r.type, 'github');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

test('parseSource: ssh:// protocol GitLab URL', () => {
  const r = parseSource('ssh://git@gitlab.com/group/repo.git');
  assert.equal(r.type, 'gitlab');
  assert.equal(r.owner, 'group');
  assert.equal(r.repo, 'repo');
});

test('parseSource: ssh:// protocol unknown host', () => {
  const r = parseSource('ssh://git@bitbucket.org/owner/repo.git');
  assert.equal(r.type, 'git-ssh');
  assert.equal(r.owner, 'owner');
  assert.equal(r.repo, 'repo');
});

/* ========== Regression: host spoofing prevention (fix4) ========== */

test('parseSource: evil host notgithub.com is not classified as github', () => {
  const r = parseSource('https://notgithub.com/owner/repo');
  assert.equal(r.type, 'git-ssh');
});

test('parseSource: evil host github.com.evil.example is not classified as github', () => {
  const r = parseSource('https://github.com.evil.example/owner/repo');
  assert.equal(r.type, 'git-ssh');
});
