import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfigV2 } from '../bin/skillsdock-core.mjs';

test('normalizeConfigV2 migrates legacy v1 keys and preserves custom entries', () => {
  const input = {
    version: 1,
    sources: [
      { name: 'codex', path: '/custom/codex/skills' },
      { name: 'agents', path: '/legacy/agents/skills' },
      { name: 'custom-source', path: '/my/skills', format: 'skill-md' }
    ],
    targets: {
      codex: {
        path: '/custom/codex/skills',
        layout: 'nested',
        filename: 'SKILL.md'
      },
      'custom-target': {
        path: '/my/target',
        layout: 'flat',
        extension: '.md'
      }
    },
    scan: {
      maxDepth: 4,
      ignoreDirs: ['node_modules', '.git']
    }
  };

  const config = normalizeConfigV2(input, '/tmp/project');

  assert.equal(config.version, 2);

  const sourceByName = new Map(config.sources.map((entry) => [entry.name, entry]));
  assert.equal(sourceByName.has('codex-user'), true);
  assert.equal(sourceByName.has('codex'), false);
  assert.equal(sourceByName.get('codex-user').path, '/custom/codex/skills');
  assert.equal(sourceByName.has('agents'), true);
  assert.equal(sourceByName.get('agents').path, '/legacy/agents/skills');
  assert.equal(sourceByName.has('custom-source'), true);

  assert.equal(typeof config.targets['codex-user'], 'object');
  assert.equal(config.targets['codex-user'].path, '/custom/codex/skills');
  assert.equal(typeof config.targets['custom-target'], 'object');
  assert.equal(config.targets['custom-target'].path, '/my/target');

  assert.equal(typeof config.targets['openclaw-user'], 'object');
  assert.equal(typeof config.targets['openclaw-project'], 'object');
});
