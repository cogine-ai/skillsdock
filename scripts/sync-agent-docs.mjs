#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const registryPath = resolve(ROOT, 'bin/agent-registry.json');
const readmePath = resolve(ROOT, 'README.md');
const compatPath = resolve(ROOT, 'COMPATIBILITY.md');

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const agents = registry.agents;

function buildReadmeTable(agents) {
  const header = [
    '| Agent Name | ID | User Scope Path | Project Scope Path | Install Family |',
    '|---|---|---|---|---|',
  ];
  const rows = agents.map((a) => {
    const userPath = a.scopes?.user?.target?.path ?? '—';
    const projectPath = a.scopes?.project?.target?.path ?? '—';
    return `| ${a.displayName} | \`${a.id}\` | \`${userPath}\` | \`${projectPath}\` | ${a.installFamily} |`;
  });
  return [...header, ...rows].join('\n');
}

function buildCompatTable(agents) {
  const header = [
    '| Agent | Display Name | Family | Canonical Dir | User Scope Source/Target | Project Scope Source/Target | Target Format |',
    '|---|---|---|---|---|---|---|',
  ];
  const rows = agents.map((a) => {
    const userPath = a.scopes?.user?.target?.path ?? '—';
    const projectPath = a.scopes?.project?.target?.path ?? '—';
    const format = a.scopes?.user?.target?.format ?? a.scopes?.project?.target?.format ?? '—';
    const canonicalDir = a.canonicalDir ?? '—';
    return `| ${a.id} | ${a.displayName} | ${a.installFamily} | \`${canonicalDir}\` | \`${userPath}\` | \`${projectPath}\` | \`${format}\` |`;
  });
  return [...header, ...rows].join('\n');
}

function replaceSection(content, startMarker, endMarker, replacement) {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Markers not found: ${startMarker} / ${endMarker}`);
  }
  const before = content.slice(0, startIdx + startMarker.length);
  const after = content.slice(endIdx);
  return before + '\n' + replacement + '\n' + after;
}

const readmeTable = buildReadmeTable(agents);
const compatTable = buildCompatTable(agents);

let readme = readFileSync(readmePath, 'utf8');
let compat = readFileSync(compatPath, 'utf8');

const newReadme = replaceSection(
  readme,
  '<!-- AGENT-TABLE-START -->',
  '<!-- AGENT-TABLE-END -->',
  readmeTable
);

const newCompat = replaceSection(
  compat,
  '<!-- COMPAT-MATRIX-START -->',
  '<!-- COMPAT-MATRIX-END -->',
  compatTable
);

let changed = false;

if (newReadme !== readme) {
  writeFileSync(readmePath, newReadme, 'utf8');
  console.log('Updated README.md agent table.');
  changed = true;
} else {
  console.log('README.md agent table is up to date.');
}

if (newCompat !== compat) {
  writeFileSync(compatPath, newCompat, 'utf8');
  console.log('Updated COMPATIBILITY.md agent matrix.');
  changed = true;
} else {
  console.log('COMPATIBILITY.md agent matrix is up to date.');
}

if (!changed) {
  console.log('No changes needed — docs are in sync with registry.');
}
