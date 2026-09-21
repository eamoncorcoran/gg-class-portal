import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

/* The live classroom, inside the portal.
   ------------------------------------------------------------------
   The room, the console and the studio are pages of this site behind the
   portal's own session. What is guarded here is the shape of the things that
   matter: the webinar read out of a class's Zoom link, a Zoom signature that
   is only ever an attendee's, the router being session-only, and a studio
   lesson filed as a course lesson. */

process.env.ZOOM_CLIENT_ID = 'test-client';
process.env.ZOOM_CLIENT_SECRET = 'test-secret';
const { parseWebinar, classForLive } = await import('../src/live/classes.js');
const { signZoom, zoomConfigured } = await import('../src/live/zoom.js');
const routes = fs.readFileSync(new URL('../src/routes/live.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');

test('the webinar is read out of the class link, whichever way Zoom wrote it', () => {
  assert.deepEqual(parseWebinar('https://us02web.zoom.us/w/84218712491?pwd=abc123'), { webinarId: '84218712491', webinarPwd: 'abc123' });
  assert.deepEqual(parseWebinar('https://zoom.us/j/842 1871 2491'), { webinarId: '84218712491', webinarPwd: '' });
  // The passcode is often in the note students are shown, not the link.
  assert.deepEqual(parseWebinar('https://zoom.us/w/84218712491', '7pm Irish · Passcode: 975967'), { webinarId: '84218712491', webinarPwd: '975967' });
  // The link wins over the note when both carry one.
  assert.equal(parseWebinar('https://zoom.us/w/84218712491?pwd=fromlink', 'Passcode: fromnote').webinarPwd, 'fromlink');
  assert.deepEqual(parseWebinar(null), { webinarId: null, webinarPwd: '' });
  assert.deepEqual(parseWebinar('https://example.com/not-zoom'), { webinarId: null, webinarPwd: '' });
  assert.equal(classForLive(null), null);
  assert.equal(classForLive({ id: 'c', programme_name: 'Irish', day_of_week: 4, start_time: '19:00:00', join_url: 'https://zoom.us/w/84218712491' }).label, 'Irish | Thursday | 19:00');
});

test('a Zoom signature is HS256, for that webinar, and never anything but attendee role 0', () => {
  assert.ok(zoomConfigured());
  const token = signZoom('842 1871 2491');
  const [h, b, sig] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(b, 'base64url'));
  assert.equal(claims.mn, '84218712491');
  assert.equal(claims.role, 0);
  assert.equal(claims.appKey, 'test-client');
  assert.equal(claims.sdkKey, 'test-client');
  assert.equal(claims.exp - claims.iat, 3 * 60 * 60);
  assert.equal(claims.tokenExp, claims.exp);
  assert.equal(sig, crypto.createHmac('sha256', 'test-secret').update(`${h}.${b}`).digest('base64url'));
  assert.throws(() => signZoom('12'), /valid webinar/);
  // The role is not a parameter: there is no way to ask for a host signature.
  assert.equal(signZoom.length, 1);
});

test('the live router is behind the portal session, teacher routes behind the admin role', () => {
  assert.match(server, /app\.use\('\/api\/live', liveRoutes\);/);
  assert.match(routes, /^router\.use\(requireAuth\);/m);
  for (const path of ['/phrase', '/status', '/chat/reply', '/chat/read', '/chat/broadcast', '/chat/highlight', '/session', '/classes', '/courses', '/lessons', '/lessons/video']) {
    assert.match(routes, new RegExp(`router\\.(get|post|delete)\\('${path.replace(/\//g, '\\/')}', requireAdmin`), path);
  }
  assert.match(routes, /router\.delete\('\/lessons\/:id', requireAdmin/);
  /* What a student may do is also what the session gate says: the gate is one
     function, and every student surface asks it. */
  for (const path of ['/signature', '/phrase-stream', '/phrase-result', '/chat-stream', '/chat']) {
    const at = routes.indexOf(`'${path}'`);
    assert.ok(at > 0, path);
    assert.match(routes.slice(at, at + 400), /room\.studentGate\(req\.user\)/, `${path} is not gated`);
  }
  assert.doesNotMatch(routes, /x-teacher-key|handoff|jsonwebtoken/, 'no shared key, no hand-off: the session is the identity');
});

test('the live classroom pages are on this site and get their own policy', () => {
  for (const page of ['room', 'teacher', 'studio', 'lesson']) {
    const html = fs.readFileSync(new URL(`../public/live/${page}.html`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /x-teacher-key|gglive_token|\/api\/session\/join|portal\.css|fonts\.googleapis/, page);
    assert.match(html, /\/api\/live\//, page);
  }
  const practice = fs.readFileSync(new URL('../public/live/practice.js', import.meta.url), 'utf8');
  assert.match(practice, /\/api\/live\/speech/);
  assert.match(practice, /\/live\/scoring\.js/);
  // Zoom's SDK, and only for /live: the portal's own policy stays as tight as it was.
  assert.match(server, /app\.use\('\/live', \(req, res, next\) => \{/);
  assert.match(server, /https:\/\/source\.zoom\.us/);
  assert.match(server, /"frame-ancestors 'self'"/, 'the practice player is framed by the course page');
  assert.doesNotMatch(server, /LIVE_URL/);
});

test('the practice player is same-origin and the portal asks its own session', () => {
  assert.match(student, /url: `\/live\/lesson\.html\?id=\$\{encodeURIComponent\(lesson\.video_ref\)\}&embed=1`/);
  assert.match(admin, /url: `\/live\/lesson\.html\?id=\$\{encodeURIComponent\(lesson\.video_ref\)\}&embed=1`/);
  assert.match(student, /liveClassroom: zoomConfigured\(\) && liveRoomEnabled\(\)/, 'the room is a switch, apart from the studio');
  assert.match(admin, /liveRoom: liveZoomConfigured\(\) && liveRoomEnabled\(\)/);
  assert.match(admin, /listLiveLessons\(\)/);
  assert.doesNotMatch(student + admin, /signHandoff|liveFetch|practiceUrl/);
});

test('the speech socket is the only upgrade taken, and only with a session', () => {
  const speech = fs.readFileSync(new URL('../src/live/speech.js', import.meta.url), 'utf8');
  assert.match(speech, /if \(pathname !== SPEECH_PATH\) \{ socket\.destroy\(\); return; \}/);
  assert.match(speech, /if \(!user\) \{ socket\.write\('HTTP\/1\.1 401 Unauthorized/);
  assert.match(speech, /sessionTokenFromCookieHeader\(req\.headers\.cookie\)/);
});

test('a lesson id is short hex, phrases are cleaned and ordered', async () => {
  const { cleanPhrases } = await import('../src/live/lessons.js');
  const cleaned = cleanPhrases([{ at: 9, irish: ' Slán ' }, { at: 2, irish: 'Dia duit', english: 'Hello' }, { at: 1, irish: '' }, { at: -4, irish: 'x'.repeat(300) }]);
  assert.deepEqual(cleaned.map((p) => p.irish), ['x'.repeat(200), 'Dia duit', 'Slán']);
  assert.deepEqual(cleaned.map((p) => p.at), [0, 2, 9]);
  assert.ok(cleaned.every((p) => p.id));
});

/* Practice lessons: a studio lesson shown as a course lesson. */
const { detectVideoProvider, parseVideoSource, videoSource, VIDEO_PROVIDERS } = await import('../src/lessonvideo.js');

test('a studio player link is read as a practice lesson', () => {
  assert.equal(detectVideoProvider('http://localhost:3111/live/lesson.html?id=c96313c8a944'), 'practice');
  assert.equal(detectVideoProvider('https://hub.gaeilgeoirguides.com/live/lesson.html?id=C96313C8A944&embed=1'), 'practice');
  assert.equal(detectVideoProvider('https://hub.gaeilgeoirguides.com/live/lesson.html'), null);
  assert.equal(detectVideoProvider('https://zoom.us/rec/share/abc'), 'zoom');
});

test('a practice ref is the studio lesson id, from a link or bare', () => {
  assert.deepEqual(parseVideoSource('practice', 'http://localhost:3111/live/lesson.html?id=c96313c8a944'), { provider: 'practice', ref: 'c96313c8a944' });
  assert.deepEqual(parseVideoSource('practice', 'C96313C8A944'), { provider: 'practice', ref: 'c96313c8a944' });
  assert.equal(parseVideoSource('practice', 'not a lesson'), null);
  assert.equal(parseVideoSource('practice', 'http://localhost:3111/live/lesson.html'), null);
});

test('a practice lesson is a player the page has to ask for, not a URL', () => {
  assert.deepEqual(videoSource({ video_provider: 'practice', video_ref: 'c96313c8a944' }), { type: 'practice', provider: 'practice', ref: 'c96313c8a944' });
  assert.ok(VIDEO_PROVIDERS.includes('practice'));
});

test('the migrations and the code agree on the list of hosts', () => {
  const sql = fs.readFileSync(new URL('../migrations/048_practice_lessons.sql', import.meta.url), 'utf8');
  for (const provider of VIDEO_PROVIDERS) assert.ok(sql.includes(`'${provider}'`), provider);
  const live = fs.readFileSync(new URL('../migrations/049_live_classroom.sql', import.meta.url), 'utf8');
  assert.match(live, /CREATE TABLE IF NOT EXISTS live_lessons/);
  assert.match(live, /CREATE TABLE IF NOT EXISTS live_access/);
});
