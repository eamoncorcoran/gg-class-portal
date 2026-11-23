import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Only the people the teacher has added may see anything.
   ------------------------------------------------------------------
   On 17 November 2026 a visitor who was not signed in could read the hub's
   export (class dates, the course list and the links to the Zoom recordings),
   every past question and note, anything in the uploads folder, and a baked
   copy of the class board that shipped with the app at /hub/hub.json. The
   past-questions service was also open at its own address. None of that was a
   decision; each had simply never been closed. The wall closes all of it by
   default, and these tests are the list of what stays open and why. */

const { openToAll, ROBOTS_HEADER, ROBOTS_TXT } = await import('../src/wall.js');
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const ask = (path, method = 'GET') => openToAll({ path, method });

test('signed out, the doors that are meant to be open are open', () => {
  for (const path of [
    '/', '/signin', '/forgot', '/reset', '/tracker', '/t/aural-fogra-announcement', '/legacy',
    '/api/health', '/api/auth/login', '/api/auth/me', '/api/auth/forgot-password', '/api/auth/reset-password',
    '/api/zoom/webhook', '/api/mock-oral/public', '/api/mock-oral/public/book', '/mock-oral', '/mock-oral.js',
    '/calendar/abc123.ics', '/robots.txt', '/logo.webp', '/styles.css', '/app.js', '/assets/index-abc.js', '/icons/x.svg',
  ]) assert.equal(ask(path), true, `${path} should be open`);
  assert.equal(ask('/api/auth/login', 'POST'), true);
  assert.equal(ask('/api/mock-oral/public/book', 'POST'), true);
});

test('signed out, nothing that holds content is answered', () => {
  for (const path of [
    '/data.json', '/keys.json', '/oral.json', '/lessons.json', '/grammar.json', '/papers.json', '/subjects.json',
    '/crops/a/b.png', '/aud/2026_A.mp3', '/papers/2026.pdf', '/subjects/biology/higher/data.json',
    '/api/check', '/api/tutor', '/api/speak', '/api/grade',
    '/api/hub/export', '/api/student/bootstrap', '/api/admin/classes', '/api/media/avatar/x', '/api/sraith', '/api/live/status',
    '/api/mock-oral', '/api/mock-oral/admin',
    '/uploads/abc.pdf', '/uploads/abc', '/hub/hub.json', '/live/room.html', '/live/console.html', '/icons8/book.png', '/sounds/a.mp3',
  ]) assert.equal(ask(path), false, `${path} should need a sign-in`);
  // A page address is only a page when it is read, never when it is written to.
  assert.equal(ask('/tracker', 'POST'), false);
  assert.equal(ask('/api/check', 'POST'), false);
});

test('an open prefix cannot be borrowed with dots, doubled slashes or backslashes', () => {
  for (const path of ['/assets/../data.json', '/assets/%2e%2e/data.json', '/assets//x', '/icons/..%2fuploads/x.pdf', '/assets/..\\data.json', '/calendar/../api/hub/export', '/%E0%A4%A']) {
    assert.equal(ask(path), false, `${path} should be refused`);
  }
});

test('the wall stands in front of everything that hands out content', () => {
  const server = read('../server.js');
  const at = (text) => {
    const index = server.indexOf(text);
    assert.ok(index > -1, `server.js no longer has: ${text}`);
    return index;
  };
  const wallAt = at('app.use(wall);');
  assert.ok(at('app.use(cookieParser());') < wallAt, 'the wall needs the cookie');
  assert.ok(wallAt < at('app.use(pastQuestionsProxy());'), 'past questions are behind the wall');
  assert.ok(wallAt < at("app.use('/uploads'"), 'uploads are behind the wall');
  assert.ok(wallAt < at("app.use('/api/hub', hubRoutes);"), 'the API is behind the wall');
  assert.ok(wallAt < at('app.use(express.static(publicDir'), 'static files are behind the wall');
  assert.equal(server.match(/app\.use\(cookieParser\(\)\);/g).length, 1);
});

test('nobody can register: an account exists only because a teacher made it', () => {
  const auth = read('../src/routes/auth.js');
  assert.ok(!/router\.post\('\/(register|signup|sign-up|join)'/.test(auth));
  const signin = read('../web/src/pages/signin-page.tsx');
  assert.ok(!/create (an )?account|sign up|register/i.test(signin));
});

test('the hub export is for somebody signed in, and no copy of it ships with the app', () => {
  assert.match(read('../src/routes/hub.js'), /router\.get\('\/export', requireAuth, /);
  assert.ok(!fs.existsSync(new URL('../web/public/hub', import.meta.url)), 'web/public/hub held a real class board and was public');
  assert.ok(!/hub\.json/.test(read('../web/src/lib/hub.ts').replace(/\/\*[\s\S]*?\*\//g, '')), 'the app no longer falls back to a baked export');
});

test('signed out, the app asks for no class data and shows the sign-in form in place', () => {
  const main = read('../web/src/main.tsx');
  assert.match(main, /loadMe\(\)\.then\(async \(me\) => \{\s+if \(!me\) return draw\(<SignedOut \/>\);/);
  assert.ok(main.indexOf('if (!me) return draw(<SignedOut />);') < main.indexOf('await Promise.all([coursesOnly ? Promise.resolve() : loadData(), loadHub()]);'));
  assert.match(main, /<Route path="\*" element=\{<SignInPage \/>\} \/>/);
  const signin = read('../web/src/pages/signin-page.tsx');
  assert.match(signin, /window\.location\.replace\(/, 'signing in loads the app afresh, now that it may have the data');
  assert.match(signin, /const next = \/\^\\\/\(\?!\[\\\/\\\\\]\)\/\.test\(asked\) \? asked : "\/";/, 'only an address on this site is returned to');
});

test('search engines are told no, on every response and every page', () => {
  assert.match(ROBOTS_HEADER, /noindex/);
  assert.match(ROBOTS_HEADER, /nofollow/);
  const server = read('../server.js');
  assert.ok(server.indexOf('app.use(noIndex);') < server.indexOf('app.use(helmet('), 'said before anything else can answer');
  /* Not disallowed: a crawler forbidden to ask never sees the noindex. */
  assert.ok(!/Disallow: \//.test(ROBOTS_TXT));
  for (const page of ['../web/index.html', '../public/index.html', '../public/mock-oral.html']) {
    assert.match(read(page), /<meta name="robots" content="noindex/, `${page} has no robots meta tag`);
  }
});

test('the past-questions service answers only the portal', () => {
  const proxy = read('../src/pqproxy.js');
  assert.match(proxy, /const PASS = crypto\.randomBytes\(32\)\.toString\('hex'\);/);
  assert.match(proxy, /headers\[PASS_HEADER\] = PASS;/);
  assert.match(proxy, /name === 'cookie' \|\| name === PASS_HEADER\) continue;/, 'a pass sent by the browser is dropped');
  assert.match(proxy, /crypto\.timingSafeEqual\(given, ours\)/);
  const service = read('../pq/server.py');
  for (const verb of ['do_GET', 'do_HEAD', 'do_POST']) {
    const body = service.slice(service.indexOf(`def ${verb}(self):`)).split('\n    def ')[0];
    assert.match(body, /if not self\.allowed\(\):\s+return/, `${verb} does not check the pass`);
  }
  assert.match(service, /if clean == '\/_health':/, 'the health check stays open');
  assert.match(service, /f'\{HUB_URL\}\/api\/pq-pass\/\{given\}'/);
});
