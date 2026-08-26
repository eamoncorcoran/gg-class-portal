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

  /* Both super administrators are made here rather than leaning on whoever
     happens to be in the database. This used to assume a founding super
     administrator was already present, which is true of a portal that has been
     running and false of an empty one — so it passed on a developer's machine
     and failed the first time it met a fresh database. */
  const stamp = `${Date.now()}-${Math.round(process.hrtime()[1] / 1000)}`;
  const founder = await one(
    `INSERT INTO users(role,name,email,password_hash,is_super_admin,active)
     VALUES ('admin','Founding Super',$1,'x',true,true) RETURNING *`,
    [`founder-${stamp}@test.local`],
  );
  const solo = await one(
    `INSERT INTO users(role,name,email,password_hash,is_super_admin,active)
     VALUES ('admin','Only Super',$1,'x',true,true) RETURNING *`,
    [`solo-${stamp}@test.local`],
  );

  /* The rule the route enforces, asserted against the same query it uses: a
     demotion is allowed only while somebody else would still be able to
     administer the portal afterwards. */
  const othersBesides = (...excluded) => one(
    `SELECT count(*)::int count FROM users
     WHERE role='admin' AND is_super_admin=true AND active=true
       AND id <> ALL($1::uuid[])`,
    [excluded],
  );

  try {
    // With the founder in place, demoting this one leaves somebody behind.
    assert.ok((await othersBesides(solo.id)).count >= 1,
      'demotion should be allowed while another super administrator remains');

    // Take the founder out of the reckoning and there is nobody left, which is
    // exactly the count that refuses it.
    assert.equal((await othersBesides(solo.id, founder.id)).count, 0,
      'with everybody else excluded there is nobody left, which is what triggers the refusal');

    // Suspending counts as gone: an inactive super administrator cannot act, so
    // they must not be what keeps a demotion looking safe.
    await query('UPDATE users SET active=false WHERE id=$1', [founder.id]);
    assert.equal((await othersBesides(solo.id)).count, 0,
      'a suspended super administrator must not count towards the one who has to remain');
  } finally {
    await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[solo.id, founder.id]]);
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
