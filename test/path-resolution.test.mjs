import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_REGISTRY,
  buildDefaultConfig,
  buildDoctorAgentMatrixRows,
  resolveTemplatePath
} from '../bin/skillsdock-core.mjs';

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

test('buildDefaultConfig expands built-in presets to 40+ agents with metadata', () => {
  const config = buildDefaultConfig('/tmp/proj');

  const sourceNames = new Set(config.sources.map((entry) => entry.name));
  const codex = AGENT_REGISTRY.agents.find((entry) => entry.id === 'codex');
  const githubCopilot = AGENT_REGISTRY.agents.find((entry) => entry.id === 'github-copilot');

  assert.equal(config.version, 2);
  assert.equal(AGENT_REGISTRY.meta.version, 2);
  assert.equal(AGENT_REGISTRY.agents.length >= 40, true);
  assert.equal(config.sources.length >= 80, true);
  assert.equal(sourceNames.has('openclaw-user'), true);
  assert.equal(sourceNames.has('openclaw-project'), true);
  assert.equal(sourceNames.has('codex-user'), true);
  assert.equal(sourceNames.has('codex-project'), true);
  assert.equal(sourceNames.has('github-copilot-user'), true);
  assert.equal(sourceNames.has('gemini-cli-project'), true);
  assert.equal(sourceNames.has('windsurf-user'), true);
  assert.equal(sourceNames.has('adal-project'), true);
  assert.equal(sourceNames.has('agents'), false);

  assert.equal(typeof config.targets['openclaw-user'], 'object');
  assert.equal(typeof config.targets['openclaw-project'], 'object');
  assert.equal(typeof config.targets['github-copilot-user'], 'object');
  assert.equal(codex?.installFamily, 'universal');
  assert.equal(codex?.canonicalDir, '.agents/skills');
  assert.deepEqual(codex?.scopes.user.detectInstalled.paths, ['~/.codex', '/etc/codex']);
  assert.equal(githubCopilot?.referenceId, 'github-copilot');
});

test('buildDoctorAgentMatrixRows reports installed state from registry detection metadata', async () => {
  const rows = await buildDoctorAgentMatrixRows(
    buildDefaultConfig('/tmp/proj'),
    { projectRoot: '/tmp/proj' },
    {
      homeDir: '/tmp/home',
      pathExists: (candidate) =>
        candidate === '/tmp/home/.codex' ||
        candidate === '/etc/codex' ||
        candidate === '/tmp/proj/.windsurf' ||
        candidate === '/tmp/home/.copilot',
      resolveWritable: async () => ({ ready: true, path: '/tmp' })
    }
  );

  const codexUser = rows.find((row) => row.agent === 'codex' && row.scope === 'user');
  const windsurfProject = rows.find((row) => row.agent === 'windsurf' && row.scope === 'project');
  const githubCopilotUser = rows.find((row) => row.agent === 'github-copilot' && row.scope === 'user');
  const openclawUser = rows.find((row) => row.agent === 'openclaw' && row.scope === 'user');

  assert.equal(codexUser?.installed, 'yes');
  assert.equal(codexUser?.canonicalDir, '.agents/skills');
  assert.equal(codexUser?.installFamily, 'universal');
  assert.equal(windsurfProject?.installed, 'yes');
  assert.equal(githubCopilotUser?.installed, 'yes');
  assert.equal(openclawUser?.installed, 'no');
});
