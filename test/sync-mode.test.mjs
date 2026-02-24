import test from 'node:test';
import assert from 'node:assert/strict';

import { planSyncWriteMode, resolveSyncTarget } from '../bin/skillsdock-core.mjs';

test('planSyncWriteMode keeps symlink when no conversion required', () => {
  const plan = planSyncWriteMode({
    requestedMode: 'symlink',
    fallbackMode: 'copy',
    requiresConversion: false
  });

  assert.equal(plan.effectiveMode, 'symlink');
  assert.equal(plan.fallbackUsed, false);
});

test('planSyncWriteMode forces copy for conversion', () => {
  const plan = planSyncWriteMode({
    requestedMode: 'symlink',
    fallbackMode: 'copy',
    requiresConversion: true
  });

  assert.equal(plan.effectiveMode, 'copy');
  assert.equal(plan.fallbackUsed, true);
  assert.equal(plan.reason, 'conversion');
});

test('resolveSyncTarget requires scope when user and project targets both exist', () => {
  const config = {
    targets: {
      'openclaw-user': { path: '/tmp/u', scope: 'user' },
      'openclaw-project': { path: '/tmp/p', scope: 'project' }
    }
  };

  assert.throws(() => resolveSyncTarget(config, 'openclaw'), /Please pass --scope user\|project/);

  const scoped = resolveSyncTarget(config, 'openclaw', 'user');
  assert.equal(scoped.key, 'openclaw-user');
});
