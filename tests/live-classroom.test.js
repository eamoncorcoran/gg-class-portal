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

const { parseWebinar, classForLive, zoomEmailFor } = await import('../src/live/classes.js');
const { signZoomWith } = await import('../src/live/zoom.js');
const creds = { clientId: 'test-client', clientSecret: 'test-secret' };
const signZoom = (mn) => signZoomWith(creds, mn);
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
  const token = signZoom('842 1871 2491');
  const [h, b, sig] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(b, 'base64url'));
  assert.equal(claims.mn, '84218712491');
  assert.equal(claims.role, 0);
  assert.equal(claims.appKey, 'test-client');
  assert.equal(claims.exp - claims.iat, 3 * 60 * 60);
  assert.equal(claims.tokenExp, claims.exp);
  assert.equal(sig, crypto.createHmac('sha256', 'test-secret').update(`${h}.${b}`).digest('base64url'));
  assert.throws(() => signZoom('12'), /valid webinar/);
  assert.throws(() => signZoomWith({ clientId: 'x', clientSecret: '' }, '84218712491'), /not set up/);
  // The role is not a parameter: there is no way to ask for a host signature.
  assert.equal(signZoomWith.length, 2);
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
  assert.match(student, /liveClassroom: await liveRoomEnabled\(\)/, 'the tab shows on the switch alone');
  assert.match(student, /liveReady: await liveRoomOn\(\)/, 'the doors only lead in once the keys are in place');
  assert.match(admin, /liveRoom: await liveRoomEnabled\(\)/, 'the console shows on the switch alone, so the teacher can finish setting up from it');
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

/* A 4K clip from a phone is the whole reason an upload can feel slow: it is
   not web-safe, so it needs a full software re-encode, and every extra pixel
   is time nobody on a CPU-only server gets back. Capping the longer side to
   1080p before that encode is the fix; these are the shapes it must get
   right without ever needing to spin up ffmpeg to check. */
const { scaleFilterFor } = await import('../src/live/lessons.js');

test('an ordinary clip is left alone: nothing added to the ffmpeg command', () => {
  assert.equal(scaleFilterFor(1280, 720), null);
  assert.equal(scaleFilterFor(1920, 1080), null, 'already exactly 1080p: no point scaling it to itself');
  assert.equal(scaleFilterFor(0, 0), null, 'a probe with nothing to go on must not force a filter');
});

test('a 4K clip is capped on its longer side, whichever way it is held', () => {
  assert.match(scaleFilterFor(3840, 2160), /min\(1920,iw\)/, 'landscape: width is the long side');
  assert.match(scaleFilterFor(2160, 3840), /min\(1920,ih\)/, 'portrait: height is the long side');
  // -2 rather than a fixed number on the short side, so the aspect ratio is
  // kept exactly and the result is always an even number of pixels.
  assert.match(scaleFilterFor(3840, 2160), /-2/);
});

/* room.html is the only /live page with an actual Zoom video tile in it, and
   the Meeting SDK's decoder needs SharedArrayBuffer for that, which only
   exists on a page the browser has made "cross-origin isolated" — the two
   response headers below. Their absence is exactly what a joined-but-black
   video tile looks like: everything else works, students report "I'm live
   but I see nothing". */
test('room.html is served cross-origin isolated for Zoom’s video decoder', () => {
  assert.match(server, /Cross-Origin-Opener-Policy', 'same-origin'/);
  assert.match(server, /Cross-Origin-Embedder-Policy', 'require-corp'/);
  /* The middleware is mounted with app.use('/live', ...), which is exactly
     the setup where Express rewrites req.path to be relative to the mount
     point — a check against the full '/live/room.html' string against
     req.path would silently never match. req.originalUrl is never rewritten
     by mounting, so that is what the check must read. */
  assert.match(server, /req\.originalUrl\.split\('\?'\)\[0\] === '\/live\/room\.html'/,
    'must key off the unrewritten URL, not req.path, inside an app.use(\'/live\', ...) mount');
  // Scoped to that one page: the console, the studio and the practice player
  // carry no Zoom video and isolating them too only adds a way for some other
  // cross-origin resource on those pages to break for no benefit.
  for (const page of ['teacher', 'studio', 'lesson']) {
    const html = fs.readFileSync(new URL(`../public/live/${page}.html`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /crossorigin="anonymous"/, page);
  }
});

test('the bunny.net font survives cross-origin isolation on room.html', () => {
  // Under require-corp, a stylesheet fetched the plain way needs the server to
  // send a matching Cross-Origin-Resource-Policy header; bunny.net does not.
  // It does allow the fetch under CORS, and `crossorigin` is what asks the
  // browser to fetch it that way instead, which satisfies the isolation check.
  const room = fs.readFileSync(new URL('../public/live/room.html', import.meta.url), 'utf8');
  assert.match(room, /fonts\.bunny\.net[^>]*crossorigin="anonymous"/);
});

/* What the first real class taught. The host closed Zoom and the session
   stayed "live" on ninety students' tabs until the next day; a student whose
   webinar ended was left with a black stage and the last phrase over it. */
const { isLive, LIVE_MAX_MS } = await import('../src/live/room.js');

test('a session left running goes off by itself after a working day', () => {
  const now = Date.now();
  const link = 'https://us06web.zoom.us/j/83512243750';
  assert.equal(isLive({ startedAt: new Date(now - 60 * 60 * 1000), joinUrl: link }, now), true);
  assert.equal(isLive({ startedAt: new Date(now - LIVE_MAX_MS - 1), joinUrl: link }, now), false);
  assert.equal(isLive({ startedAt: new Date(now - 1000), joinUrl: '' }, now), false);
  assert.equal(isLive({ startedAt: null, joinUrl: link }, now), false);
  // A clock that is a little ahead of the database does not end a class early.
  assert.equal(isLive({ startedAt: new Date(now + 5000), joinUrl: link }, now), true);
});

test('the host ending the webinar reaches the student, and ends the session from the console', () => {
  const room = fs.readFileSync(new URL('../public/live/room.html', import.meta.url), 'utf8');
  const teacher = fs.readFileSync(new URL('../public/live/teacher.html', import.meta.url), 'utf8');
  assert.match(room, /client\.on\('connection-change'/);
  assert.match(room, /type: 'ended', byHost/);
  // An ended webinar cannot be joined again: no button is offered, only
  // when the teacher goes live afresh does the door open.
  assert.match(room, /btn\.hidden = true; \$\('#zoomOut'\)\.hidden = true;/);
  assert.match(room, /function watchLive\(endedStart\)/);
  assert.doesNotMatch(room, /textContent = 'Join again'/);
  assert.match(teacher, /e\.data\.type === 'ended'/);
  assert.match(teacher, /async function autoEnd/);
});

/* Zoom refused the first real student join with "Fail to join the meeting."
   because the test account's address carried a plus tag. */
test('a webinar attendee is given an address Zoom will take', () => {
  assert.equal(zoomEmailFor('sarah.dunning@gmail.com', 'u1'), 'sarah.dunning@gmail.com');
  assert.equal(zoomEmailFor('ecorcoran212+33@gmail.com', 'u1'), 'ecorcoran212@gmail.com');
  assert.equal(zoomEmailFor('  Someone@Example.co.uk ', 'u1'), 'Someone@Example.co.uk');
  assert.equal(zoomEmailFor('not an email', '9a2b8b76-1111'), 'student-9a2b8b761111@hub.gaeilgeoirguides.com');
  assert.equal(zoomEmailFor('', ''), 'student-guest@hub.gaeilgeoirguides.com');
  const room = fs.readFileSync(new URL('../public/live/room.html', import.meta.url), 'utf8');
  assert.match(room, /userEmail: me\.zoomEmail \|\| me\.email/);
  assert.match(routes, /zoomEmail: zoomEmailFor\(req\.user\.email, req\.user\.id\)/);
});

test('the live pages are never cached past a deploy', () => {
  // A student who loaded room.html before a fix went out kept the old one
  // for an hour: HTML is revalidated every time, assets keep their hour.
  assert.match(server, /filePath\.endsWith\('\.html'\)\) res\.setHeader\('Cache-Control', 'no-cache'\)/);
});

test('the framed live pages carry the asset version, so a deploy reaches them', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /new URL\(import\.meta\.url\)\.searchParams\.get\('v'\)/);
  assert.match(app, /liveUrl\('\/live\/room\.html\?embed=1&wait=1'\)/);
});

/* Eamon, 4 Oct 2026: "I just want them to land on the page, have to do nothing
   and it's streaming." Zoom's component view joins neither the meeting nor
   its audio by itself, so the page does both. */
test('a student lands on a live class and is in it, sound and all, without pressing anything', () => {
  const room = fs.readFileSync(new URL('../public/live/room.html', import.meta.url), 'utf8');
  // Joined on arrival when live, watched for otherwise; never the preview.
  assert.match(room, /if \(!preview && !demo && me\.live && me\.allowed\) \{\s*if \(me\.liveNow\) join\(\{ countdown: true \}\); else watchLive\(''\);/);
  // Audio is pressed for them once the video is in, and only for a real student.
  assert.match(room, /setTimeout\(fitStage, 2500\);\s*joinAudio\(\);/);
  assert.match(room, /async function joinAudio\(\)\{\s*if \(preview \|\| demo\) return;/);
  assert.match(room, /zoomButton\('Join Audio'\)/);
  // A browser that will not play sound untapped gets one button, nothing more.
  assert.match(room, /id="hearBtn">Tap to hear the class</);
  assert.match(room, /function soundAllowed\(\)/);
  // A host still in the practice session is retried quietly, and logged once.
  assert.match(room, /if \(notStarted\) setTimeout\(\(\) => \{ if \(!joined\) join\(\); \}, 15000\);/);
  assert.match(room, /if \(!reported\.has\(reason\)\) \{ reported\.add\(reason\);/);
});

test('the student room frame is there before the tap that brings sound', () => {
  // Made once at boot, hidden, outside the shell; shown and told so on the Live class view.
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const room = fs.readFileSync(new URL('../public/live/room.html', import.meta.url), 'utf8');
  assert.match(app, /mountLiveFrame\(\);/);
  assert.match(app, /liveUrl\('\/live\/room\.html\?embed=1&wait=1'\)/);
  assert.match(app, /postMessage\(\{ source: 'gg-portal', type: 'show' \}, location\.origin\)/);
  assert.match(app, /class="live-embed slot" id="live-slot"/);
  assert.doesNotMatch(app, /live-embed"><iframe src="\$\{liveUrl\('\/live\/room\.html\?embed=1'\)/);
  // The room does nothing until shown, then boots exactly once.
  assert.match(room, /const waitForShow = qs\.get\('wait'\) === '1';/);
  assert.match(room, /if \(waitForShow\) window\.addEventListener\('message'.*type === 'show'\) boot\(\); \}\);\s*else boot\(\);/);
});

test('a student who has just arrived sees ten seconds counting down on the door', () => {
  const room = fs.readFileSync(new URL('../public/live/room.html', import.meta.url), 'utf8');
  assert.match(room, /function startCountdown\(seconds = 10\)/);
  assert.match(room, /id="countdown" hidden/);
  // The door opens when the count is done and the video is in, whichever is later.
  assert.match(room, /joinAudio\(\);\s*await countdownDone;\s*endCountdown\(\);\s*\$\('#gate'\)\.style\.display = 'none';/);
  // Past zero without the video, it says so rather than inventing a number.
  assert.match(room, /num\.textContent = 'almost there'/);
  // Retries while the host is in the practice session do not count down again.
  assert.match(room, /if \(notStarted\) setTimeout\(\(\) => \{ if \(!joined\) join\(\); \}, 15000\);/);
});
