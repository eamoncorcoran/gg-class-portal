import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStrongPassword, passwordProblems, hashPassword, verifyPassword, hashToken, safeEqual } from '../src/security.js';

test('generated temporary passwords meet the policy', () => {
  for (let i = 0; i < 25; i += 1) {
    const password = generateStrongPassword();
    assert.equal(passwordProblems(password).length, 0);
    assert.ok(password.length >= 16);
  }
});

test('tokens hash deterministically and safe comparison works', () => {
  assert.equal(hashToken('same'), hashToken('same'));
  assert.notEqual(hashToken('same'), hashToken('different'));
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
});

test('password hashes verify and reject incorrect passwords', async () => {
  const hash = await hashPassword('StrongPassword!123');
  assert.equal(await verifyPassword(hash, 'StrongPassword!123'), true);
  assert.equal(await verifyPassword(hash, 'wrong-password'), false);
});
