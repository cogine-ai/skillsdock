import test from 'node:test';
import assert from 'node:assert/strict';

import { convertContentToFormat, parseContentForFormat } from '../bin/skillsdock-core.mjs';

test('parseContentForFormat parses skill markdown frontmatter', () => {
  const raw = `---\nname: "My Skill"\ndescription: "Do something"\n---\n\n# Body\nRun steps.`;
  const parsed = parseContentForFormat('skill-md', raw, '/tmp/MySkill/SKILL.md');

  assert.equal(parsed.normalized.name, 'My Skill');
  assert.equal(parsed.normalized.description, 'Do something');
  assert.match(parsed.normalized.body, /Run steps\./);
});

test('parseContentForFormat rejects skill-md without required frontmatter', () => {
  assert.throws(
    () => parseContentForFormat('skill-md', '# Missing frontmatter', '/tmp/invalid/SKILL.md'),
    /missing YAML frontmatter/
  );
});

test('parseContentForFormat rejects skill-md with non-string name/description', () => {
  const raw = `---\nname: 123\ndescription: true\n---\n\n# Invalid`;
  assert.throws(
    () => parseContentForFormat('skill-md', raw, '/tmp/invalid/SKILL.md'),
    /must include string "name" and "description"/
  );
});

test('convertContentToFormat converts mdc to skill-md', () => {
  const item = {
    sourceFormat: 'mdc',
    sourcePath: '/tmp/rules/my-rule.mdc',
    content: '# Rule\nUse this.',
    normalized: {
      name: 'my-rule',
      description: 'Rule for tests',
      body: '# Rule\nUse this.'
    }
  };

  const converted = convertContentToFormat(item, 'skill-md');

  assert.equal(converted.requiresConversion, true);
  assert.match(converted.content, /^---/);
  assert.match(converted.content, /name: "my-rule"/);
  assert.match(converted.content, /description: "Rule for tests"/);
});

test('convertContentToFormat converts skill-md to mdc body', () => {
  const item = {
    sourceFormat: 'skill-md',
    sourcePath: '/tmp/foo/SKILL.md',
    content: '---\nname: "foo"\ndescription: "bar"\n---\n\n# hello',
    normalized: {
      name: 'foo',
      description: 'bar',
      body: '# hello\nbody text'
    }
  };

  const converted = convertContentToFormat(item, 'mdc');

  assert.equal(converted.requiresConversion, true);
  assert.equal(converted.content, '# hello\nbody text\n');
});
