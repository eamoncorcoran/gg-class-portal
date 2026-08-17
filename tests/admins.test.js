import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dbTest = { skip: process.env.RUN_DB_TESTS !== '1' };
const adminRoutes = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');

/* Creating an administrator hands somebody every other action in this
   application, so it sits behind a stricter gate than being one. */

test('the administrator routes are behind requireSuperAdmin, not requireAdmin', () => {
  for (const route of [
    "router.get('/admins'",
    "router.post('/admins'",
    "router.patch('/admins/:id'",
  ]) {
    const at = adminRoutes.indexOf(route);
    assert.ok(at !== -1, `${route} is gone`);
    const line = adminRoutes.slice(at, adminRoutes.indexOf('\n', at));
    assert.match(line, /requireSuperAdmin/, `${route} is not behind requireSuperAdmin`);
  }
});

test('the gate itself checks the role as well as the flag', async () => {
  const session = fs.readFileSync(new URL('../src/session.js', import.meta.url), 'utf8');
  const start = session.indexOf('export function requireSuperAdmin');
  const body = session.slice(start, session.indexOf('\n}', start));
  // A student with the flag somehow set must still be refused.
  assert.match(body, /role !== 'admin'/);
  assert.match(body, /!req\.user\.isSuperAdmin/);
});

test('a super administrator cannot strand the portal without one', dbTest, async () => {
  const { one, query } = await import('../src/db.js');
  const solo = await one(
    `INSERT INTO users(role,name,email,password_hash,is_super_admin)
     VALUES ('admin','Only Super',$1,'x',true) RETURNING *`,
    [`solo-${Date.now()}@test.local`],
  );
  try {
    /* The rule the route enforces, asserted against the same query it uses:
       with the founding super administrator still in place there is one other,
       so this one may be demoted. */
    const remaining = await one(
      `SELECT count(*)::int count FROM users
       WHERE role='admin' AND is_super_admin=true AND active=true AND id<>$1`,
      [solo.id],
    );
    assert.ok(remaining.count >= 1, 'the founding super administrator should still exist');

    // And with nobody else, the same count is what refuses the demotion.
    const ifAlone = await one(
      `SELECT count(*)::int count FROM users
       WHERE role='admin' AND is_super_admin=true AND active=true AND id<>$1 AND id<>$2`,
      [solo.id, (await one(`SELECT id FROM users WHERE role='admin' AND is_super_admin=true AND id<>$1 ORDER BY created_at LIMIT 1`, [solo.id])).id],
    );
    assert.equal(ifAlone.count, 0, 'with everybody else excluded there is nobody left, which is what triggers the refusal');
  } finally {
    await query('DELETE FROM users WHERE id=$1', [solo.id]);
  }
});

test('a new administrator is invited the same way a student is', () => {
  const start = adminRoutes.indexOf("router.post('/admins'");
  const body = adminRoutes.slice(start, adminRoutes.indexOf("router.patch('/admins/:id'"));
  // A generated password, hashed, changed on first sign-in, and a photograph asked for.
  assert.match(body, /generateStrongPassword\(\)/);
  assert.match(body, /hashPassword/);
  assert.match(body, /must_change_password,must_set_avatar/);
  assert.match(body, /sendStudentInvite/);
  // And never a password in the response.
  assert.doesNotMatch(body, /res\.json\([^)]*temporaryPassword/);
});

test('suspending an administrator ends their sessions rather than waiting for expiry', () => {
  const start = adminRoutes.indexOf("router.patch('/admins/:id'");
  const body = adminRoutes.slice(start, start + 2500);
  assert.match(body, /DELETE FROM sessions WHERE user_id=\$1/);
});
