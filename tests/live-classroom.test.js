import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

/* The live classroom, from the portal's side.
   ------------------------------------------------------------------
   The live room is its own service. Three things cross the gap: a signed
   hand-off saying who a person is and which class, an entitlements lookup
   answered in class ids, and the webinar read out of each class's Zoom link.
   What is guarded here is that each of those is exactly as tight as it looks. */

process.env.LIVE_URL = 'http://live.test';
process.env.LIVE_HANDOFF_SECRET = 'test-secret';
process.env.LIVE_ENTITLEMENTS_TOKEN = 'test-bearer';
const live = await import('../src/live.js');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/routes/live.js', import.meta.url), 'utf8');

test('the webinar is read out of the class link, whichever way Zoom wrote it', () => {
  assert.deepEqual(live.parseWebinar('https://us02web.zoom.us/w/84218712491?pwd=abc123'), { webinarId: '84218712491', webinarPwd: 'abc123' });
  assert.deepEqual(live.parseWebinar('https://zoom.us/j/842 1871 2491'), { webinarId: '84218712491', webinarPwd: '' });
  // The passcode is often in the note students are shown, not the link.
  assert.deepEqual(live.parseWebinar('https://zoom.us/w/84218712491', '7pm Irish · Passcode: 975967'), { webinarId: '84218712491', webinarPwd: '975967' });
  // The link wins over the note when both carry one.
  assert.equal(live.parseWebinar('https://zoom.us/w/84218712491?pwd=fromlink', 'Passcode: fromnote').webinarPwd, 'fromlink');
  assert.deepEqual(live.parseWebinar(null), { webinarId: null, webinarPwd: '' });
  assert.deepEqual(live.parseWebinar('https://example.com/not-zoom'), { webinarId: null, webinarPwd: '' });
});

test('a hand-off is a short HS256 JWT the live room can verify', () => {
  const token = live.signHandoff({ sub: 'a@b.ie', name: 'Aoife', cid: 'u1', classId: 'c1', role: 'student' });
  const [h, b, sig] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(b, 'base64url'));
  assert.equal(claims.iss, 'gg-portal');
  assert.equal(claims.exp - claims.iat, 300, 'a doorway, not a session: five minutes');
  assert.equal(claims.role, 'student');
  // The same signature jsonwebtoken would compute with the shared secret.
  const expected = crypto.createHmac('sha256', 'test-secret').update(`${h}.${b}`).digest('base64url');
  assert.equal(sig, expected);
  assert.equal(live.signHandoff({ sub: 'x' }, { minutes: 30 }).split('.').length, 3);
});

test('the bearer check is exact, constant-time, and off when unset', () => {
  const req = (v) => ({ get: () => v });
  assert.equal(live.entitlementsBearerOk(req('Bearer test-bearer')), true);
  assert.equal(live.entitlementsBearerOk(req('Bearer test-bearer2')), false);
  assert.equal(live.entitlementsBearerOk(req('Bearer test-beare')), false);
  assert.equal(live.entitlementsBearerOk(req('')), false);
  assert.match(fs.readFileSync(new URL('../src/live.js', import.meta.url), 'utf8'), /crypto\.timingSafeEqual/);
  // No token configured means nobody gets in, not everybody.
  assert.match(fs.readFileSync(new URL('../src/live.js', import.meta.url), 'utf8'), /if \(!liveConfig\.entitlementsToken \|\| !given\) return false;/);
});

test('the live routes are bearer-only, mounted, and read-only', () => {
  assert.match(server, /app\.use\('\/api\/live', liveRoutes\);/);
  assert.match(routes, /if \(!entitlementsBearerOk\(req\)\) return res\.status\(401\)/);
  assert.doesNotMatch(routes, /INSERT|UPDATE|DELETE/, 'nothing the live room asks may write');
  /* Entitlement is enrolment in an active class by an active, non-withdrawn
     student. Ids go under `courses` because that is the live room's contract. */
  assert.match(routes, /cs\.active=true AND c\.active=true/);
  assert.match(routes, /u\.withdrawn_at IS NULL/);
  assert.match(routes, /courses: classes\.map\(\(item\) => item\.id\)/);
});

test('each side gets a hand-off for its own role only', () => {
  assert.match(student, /router\.get\('\/live\/handoff'/);
  assert.match(student, /role: 'student'/);
  assert.match(student, /refuseIfWithdrawn\(req, res\)/, 'a withdrawn student gets no doorway');
  assert.match(admin, /router\.get\('\/live\/handoff'/);
  assert.match(admin, /role: 'admin'/);
  assert.match(admin, /\{ minutes: 30 \}/);
  // And the student banner only offers the room when the portal has one.
  assert.match(student, /liveClassroom: liveConfigured\(\)/);
});
