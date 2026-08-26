import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_URL = 'https://hub.gaeilgeoirguides.com';
process.env.RENDER_EXTERNAL_URL = 'https://gg-class-portal.onrender.com';
const { sameOrigin } = await import('../src/middleware.js');

const run = (method, origin) => {
  let status = null; let body = null; let passed = false;
  sameOrigin(
    { method, get: () => origin },
    { status(code) { status = code; return this; }, json(payload) { body = payload; } },
    () => { passed = true; },
  );
  return { passed, status, body };
};

test('the custom domain is allowed', () => {
  assert.equal(run('POST', 'https://hub.gaeilgeoirguides.com').passed, true);
});
test('the platform address is allowed, so the portal works before DNS exists', () => {
  assert.equal(run('POST', 'https://gg-class-portal.onrender.com').passed, true);
});
test('an attacker’s site is still blocked', () => {
  for (const bad of [
    'https://evil.com',
    'https://hub.gaeilgeoirguides.com.evil.com',
    'http://hub.gaeilgeoirguides.com',
    'https://gg-class-portal.onrender.com.evil.com',
    'https://evil-gg-class-portal.onrender.com',
  ]) {
    const result = run('POST', bad);
    assert.equal(result.passed, false, `${bad} was let through`);
    assert.equal(result.status, 403);
  }
});
test('reads are never blocked, and a missing origin still passes', () => {
  assert.equal(run('GET', 'https://evil.com').passed, true);
  assert.equal(run('POST', undefined).passed, true);
});
test('a malformed origin is refused rather than crashing', () => {
  const result = run('POST', 'not-a-url');
  assert.equal(result.passed, false);
  assert.equal(result.body.error, 'Invalid request origin.');
});
