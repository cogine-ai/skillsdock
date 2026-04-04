import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cmdFind, searchSkills } from '../bin/skillsdock-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'skillsdock.mjs');

function runCliProcess(args, envOverrides = {}) {
  const { XDG_STATE_HOME, ...cleanEnv } = process.env;
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...cleanEnv,
      ...envOverrides
    }
  });
  return result;
}

function makeMockFetch(responseBody, options = {}) {
  const { status = 200, shouldThrow = false, throwError = null } = options;
  return async (_url, _opts) => {
    if (shouldThrow) {
      throw throwError || new Error('Network error');
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => responseBody
    };
  };
}

function makeTimeoutFetch() {
  return async (_url, opts) => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  };
}

const MOCK_RESULTS = [
  { name: 'typescript', source: 'vercel-labs/skills', description: 'TypeScript best practices' },
  { name: 'ts-strict', source: 'someuser/skills', description: 'Strict TypeScript config' },
  { name: 'ts-node', source: 'anotheruser/repo', description: 'TypeScript Node.js setup' }
];

// ── searchSkills unit tests ──

test('searchSkills: parses array response', async () => {
  const mockFetch = makeMockFetch(MOCK_RESULTS);
  const results = await searchSkills('typescript', { fetch: mockFetch });
  assert.equal(results.length, 3);
  assert.equal(results[0].name, 'typescript');
  assert.equal(results[0].source, 'vercel-labs/skills');
  assert.equal(results[0].description, 'TypeScript best practices');
});

test('searchSkills: parses { results: [...] } response', async () => {
  const mockFetch = makeMockFetch({ results: MOCK_RESULTS });
  const results = await searchSkills('typescript', { fetch: mockFetch });
  assert.equal(results.length, 3);
  assert.equal(results[1].name, 'ts-strict');
});

test('searchSkills: parses { skills: [...] } response', async () => {
  const mockFetch = makeMockFetch({ skills: MOCK_RESULTS.slice(0, 1) });
  const results = await searchSkills('typescript', { fetch: mockFetch });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'typescript');
});

test('searchSkills: returns empty array for unexpected format', async () => {
  const mockFetch = makeMockFetch({ something: 'unexpected' });
  const results = await searchSkills('test', { fetch: mockFetch });
  assert.deepEqual(results, []);
});

test('searchSkills: tolerates missing fields with defaults', async () => {
  const mockFetch = makeMockFetch([{ name: 'partial' }, {}, { description: 'only desc' }]);
  const results = await searchSkills('test', { fetch: mockFetch });
  assert.equal(results.length, 3);
  assert.equal(results[0].name, 'partial');
  assert.equal(results[0].source, '-');
  assert.equal(results[0].description, '-');
  assert.equal(results[1].name, '-');
  assert.equal(results[2].description, 'only desc');
});

test('searchSkills: network error throws CliError', async () => {
  const mockFetch = makeMockFetch(null, { shouldThrow: true });
  await assert.rejects(
    () => searchSkills('test', { fetch: mockFetch }),
    (err) => {
      assert.ok(err.message.includes('Unable to reach skills.sh'));
      return true;
    }
  );
});

test('searchSkills: timeout error throws CliError', async () => {
  const mockFetch = makeTimeoutFetch();
  await assert.rejects(
    () => searchSkills('test', { fetch: mockFetch }),
    (err) => {
      assert.ok(err.message.includes('Search timed out'));
      return true;
    }
  );
});

test('searchSkills: non-200 status throws CliError', async () => {
  const mockFetch = makeMockFetch(null, { status: 503 });
  await assert.rejects(
    () => searchSkills('test', { fetch: mockFetch }),
    (err) => {
      assert.ok(err.message.includes('Search failed: HTTP 503'));
      return true;
    }
  );
});

test('searchSkills: empty array result', async () => {
  const mockFetch = makeMockFetch([]);
  const results = await searchSkills('nonexistent', { fetch: mockFetch });
  assert.deepEqual(results, []);
});

// ── cmdFind unit tests ──

test('cmdFind: prints formatted table for normal results', async () => {
  const mockFetch = makeMockFetch(MOCK_RESULTS);
  const output = [];
  const origLog = console.log;
  console.log = (...a) => output.push(a.join(' '));
  try {
    await cmdFind({}, ['typescript'], { fetch: mockFetch });
  } finally {
    console.log = origLog;
  }
  const text = output.join('\n');
  assert.ok(text.includes('Found 3 skills matching "typescript"'));
  assert.ok(text.includes('NAME'));
  assert.ok(text.includes('SOURCE'));
  assert.ok(text.includes('DESCRIPTION'));
  assert.ok(text.includes('typescript'));
  assert.ok(text.includes('vercel-labs/skills'));
  assert.ok(text.includes('Install with: skillsdock add <source>'));
});

test('cmdFind: prints "no skills found" for empty results', async () => {
  const mockFetch = makeMockFetch([]);
  const output = [];
  const origLog = console.log;
  console.log = (...a) => output.push(a.join(' '));
  try {
    await cmdFind({}, ['nonexistent'], { fetch: mockFetch });
  } finally {
    console.log = origLog;
  }
  const text = output.join('\n');
  assert.ok(text.includes('No skills found matching "nonexistent"'));
  assert.ok(text.includes('Try a different search term'));
});

test('cmdFind: --json outputs pure JSON array', async () => {
  const mockFetch = makeMockFetch(MOCK_RESULTS);
  const output = [];
  const origLog = console.log;
  console.log = (...a) => output.push(a.join(' '));
  try {
    await cmdFind({ json: true }, ['typescript'], { fetch: mockFetch });
  } finally {
    console.log = origLog;
  }
  const text = output.join('\n');
  const parsed = JSON.parse(text);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, 'typescript');
});

test('cmdFind: --json outputs empty array for no results', async () => {
  const mockFetch = makeMockFetch([]);
  const output = [];
  const origLog = console.log;
  console.log = (...a) => output.push(a.join(' '));
  try {
    await cmdFind({ json: true }, ['nonexistent'], { fetch: mockFetch });
  } finally {
    console.log = origLog;
  }
  const text = output.join('\n');
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed, []);
});

test('cmdFind: no query in non-TTY shows usage', async () => {
  const output = [];
  const origLog = console.log;
  console.log = (...a) => output.push(a.join(' '));
  try {
    await cmdFind({}, [], {});
  } finally {
    console.log = origLog;
  }
  const text = output.join('\n');
  assert.ok(text.includes('Usage: skillsdock find'));
  assert.ok(text.includes('Search for skills'));
});

test('cmdFind: network error propagates', async () => {
  const mockFetch = makeMockFetch(null, { shouldThrow: true });
  await assert.rejects(
    () => cmdFind({}, ['test'], { fetch: mockFetch }),
    (err) => {
      assert.ok(err.message.includes('Unable to reach skills.sh'));
      return true;
    }
  );
});

test('cmdFind: timeout error propagates', async () => {
  const mockFetch = makeTimeoutFetch();
  await assert.rejects(
    () => cmdFind({}, ['test'], { fetch: mockFetch }),
    (err) => {
      assert.ok(err.message.includes('Search timed out'));
      return true;
    }
  );
});

test('cmdFind: HTTP error propagates', async () => {
  const mockFetch = makeMockFetch(null, { status: 500 });
  await assert.rejects(
    () => cmdFind({}, ['test'], { fetch: mockFetch }),
    (err) => {
      assert.ok(err.message.includes('Search failed: HTTP 500'));
      return true;
    }
  );
});

// ── CLI integration tests (via spawnSync) ──

test('cli: find --help shows find in help text', () => {
  const result = runCliProcess(['--help']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('find'));
});

test('cli: find with no query in non-TTY shows usage', () => {
  const result = runCliProcess(['find']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage: skillsdock find'));
});

test('cmdFind: defensive response format — invalid JSON body', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError('Unexpected token'); }
  });
  await assert.rejects(
    () => cmdFind({}, ['test'], { fetch: mockFetch }),
    (err) => {
      assert.ok(err.message.includes('invalid response'));
      return true;
    }
  );
});

test('searchSkills: passes query and limit in URL', async () => {
  let capturedUrl;
  const mockFetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => []
    };
  };
  await searchSkills('my query', { fetch: mockFetch, limit: 5 });
  assert.ok(capturedUrl.includes('q=my%20query'));
  assert.ok(capturedUrl.includes('limit=5'));
});
