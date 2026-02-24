import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDefaultConfig, resolveTemplatePath } from '../bin/skillsdock-core.mjs';

test('resolveTemplatePath supports ~ and ${projectRoot}', () => {
  const projectRoot = '/tmp/skillsdock-project';
  const homeDir = '/home/tester';

  assert.equal(
    resolveTemplatePath('~/.openclaw/skills', { projectRoot, homeDir }),
    '/home/tester/.openclaw/skills'
  );

  assert.equal(
    resolveTemplatePath('${projectRoot}/.codex/skills', { projectRoot, homeDir }),
    '/tmp/skillsdock-project/.codex/skills'
  );
});

test('buildDefaultConfig includes OpenClaw + Core presets and no legacy agents default', () => {
  const config = buildDefaultConfig('/tmp/proj');

  const sourceNames = new Set(config.sources.map((entry) => entry.name));
  assert.equal(config.version, 2);
  assert.equal(sourceNames.has('openclaw-user'), true);
  assert.equal(sourceNames.has('openclaw-project'), true);
  assert.equal(sourceNames.has('codex-user'), true);
  assert.equal(sourceNames.has('codex-project'), true);
  assert.equal(sourceNames.has('agents'), false);

  assert.equal(typeof config.targets['openclaw-user'], 'object');
  assert.equal(typeof config.targets['openclaw-project'], 'object');
});
