import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/routes/settings.js', import.meta.url), 'utf8');
const start = source.indexOf('function apiKeyProblem');
const apiKeyProblem = new Function(`${source.slice(start, source.indexOf("router.put('/anthropic'"))}; return apiKeyProblem;`)();

test('an Admin key is named as an Admin key, not called wrong', () => {
  const problem = apiKeyProblem('sk-ant-admin01-abc123');
  assert.match(problem, /Admin key/);
  assert.match(problem, /sk-ant-api/, 'it must say what the right one looks like');
  assert.match(problem, /console\.anthropic\.com/, 'and where to get it');
});

test('a standard key passes', () => {
  assert.equal(apiKeyProblem('sk-ant-api03-abc123def456'), null);
});

test('blank means keep the existing key, not an error', () => {
  assert.equal(apiKeyProblem(''), null);
  assert.equal(apiKeyProblem(undefined), null);
  assert.equal(apiKeyProblem('   '), null);
});

test('something that is not an Anthropic key at all is refused', () => {
  // An OpenAI key in the Claude box is the other easy mistake, now there are two.
  assert.match(apiKeyProblem('sk-proj-abc123'), /does not look like an Anthropic API key/);
  assert.match(apiKeyProblem('hello'), /does not look like an Anthropic API key/);
});
