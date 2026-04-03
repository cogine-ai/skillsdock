#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const registryPath = resolve(ROOT, 'bin/agent-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const agents = registry.agents;

const errors = [];

const REQUIRED_FIELDS = ['id', 'installFamily', 'scopes'];

const seenIds = new Set();

for (let i = 0; i < agents.length; i++) {
  const agent = agents[i];
  const label = agent.id ?? `agents[${i}]`;

  for (const field of REQUIRED_FIELDS) {
    if (agent[field] == null || agent[field] === '') {
      errors.push(`[${label}] Missing required field: ${field}`);
    }
  }

  if (agent.id != null) {
    if (seenIds.has(agent.id)) {
      errors.push(`[${label}] Duplicate id: "${agent.id}"`);
    }
    seenIds.add(agent.id);
  }

  if (agent.scopes && typeof agent.scopes === 'object') {
    for (const [scopeName, scope] of Object.entries(agent.scopes)) {
      if (!scope.source) {
        errors.push(`[${label}] scope "${scopeName}" missing "source"`);
      }
      if (!scope.target) {
        errors.push(`[${label}] scope "${scopeName}" missing "target"`);
      }

      for (const part of ['source', 'target']) {
        const pathVal = scope?.[part]?.path;
        if (pathVal != null && typeof pathVal === 'string') {
          if (!pathVal.startsWith('~') && !pathVal.startsWith('.') && !pathVal.startsWith('${projectRoot}')) {
            errors.push(`[${label}] scope "${scopeName}" ${part}.path "${pathVal}" does not start with "~", ".", or "\${projectRoot}"`);
          }
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`Agent registry validation failed with ${errors.length} error(s):\n`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log(`Agent registry validation passed. ${agents.length} agents checked.`);
}
