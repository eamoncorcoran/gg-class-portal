import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/* The Sraith Pictiúr revision section.
   ------------------------------------------------------------------
   Built from the course document into content/sraith. Pinned here: every
   Sraith has its six boxes, every sentence has its Irish and its English,
   every picture named is on disk, the section is only for the Irish for
   Primary Teaching class, the audio is a fixed list of sentences cached on
   disk, and the player answers the partial requests an iPhone makes. */

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const data = JSON.parse(read('content/sraith/sraith.json'));
const { audioId, sraithSummaries, sraithBySlug, clipText, SRAITH_CLASS_PREFIX } = await import('../src/sraith.js');
const routes = read('src/routes/sraith.js');
const app = read('public/app.js');
const student = read('src/routes/student.js');
const server = read('server.js');

test('every Sraith in the course book is there, six boxes each', () => {
  assert.equal(data.sraith.length, 10);
  assert.deepEqual(data.sraith.map((s) => s.title), [
    'Imreoir Gortaithe', 'Rialacha na Scoile', 'Madra ar Strae', 'An Ghaeilge: Seoid Luachmhair', 'Samhradh Iontach',
    'Obair Dhian: Torthaí Maithe san Ardteist', 'Breoite ar Scoil', 'Fadhbanna ar Saoire', 'Teip sa Scrúdú Tiomána',
    'Cuairt ar Aintín i Nua-Eabhrac',
  ]);
  for (const s of data.sraith) {
    assert.equal(s.boxes.length, 6, `${s.title} has six boxes`);
    assert.deepEqual(s.boxes.map((b) => b.n), [1, 2, 3, 4, 5, 6]);
  }
});

test('every sentence has its Irish and its English, tidied, with no dashes or worksheet rows', () => {
  for (const s of data.sraith) {
    for (const line of [...s.boxes.flatMap((b) => b.sentences), ...s.ending]) {
      assert.ok(line.ga && line.en, `${s.title}: ${JSON.stringify(line)}`);
      assert.match(line.ga, /^["\u201c]?\p{Lu}|^[nbdgmt]\p{Lu}/u, `${s.title} starts with a capital: ${line.ga}`);
      assert.match(line.en, /^["\u201c]?\p{Lu}/u, `${s.title} English starts with a capital: ${line.en}`);
      assert.doesNotMatch(line.ga + line.en, /[–—]/, 'no dashes');
      assert.doesNotMatch(line.ga, /^\d|^[••]/, 'no bullet or number left on the front');
    }
    for (const b of s.boxes) assert.ok(b.sentences.length >= 2, `${s.title} box ${b.n} has sentences`);
  }
  // The proverb lines run on into one.
  const samhradh = data.sraith.find((s) => s.slug === 'samhradh-iontach');
  assert.ok(samhradh.ending.some((e) => e.ga === 'Ach mar a deir an seanfhocal: Ní bhíonn in aon rud ach seal.'));
});

test('every picture named is on disk, and only Fadhbanna ar Saoire is without them', () => {
  for (const s of data.sraith) {
    for (const b of s.boxes) {
      if (!b.image) { assert.equal(s.slug, 'fadhbanna-ar-saoire', `${s.title} box ${b.n} has no picture`); continue; }
      assert.ok(fs.existsSync(new URL(`content/sraith/img/${b.image.file}`, root)), b.image.file);
      assert.ok(b.image.width > 0 && b.image.height > 0);
    }
  }
  const files = fs.readdirSync(new URL('content/sraith/img/', root));
  assert.equal(files.length, 54);
  assert.ok(files.every((f) => /^[a-z0-9-]+\.jpg$/.test(f)));
});

test('the content is served with stable audio ids and picture paths behind the API', () => {
  const list = sraithSummaries();
  assert.equal(list.length, 10);
  assert.equal(list[7].pictures, 0);
  assert.equal(list[0].cover.src, '/api/sraith/img/imreoir-gortaithe-1.jpg');
  const story = sraithBySlug('madra-ar-strae');
  const first = story.boxes[0].sentences[0];
  assert.equal(first.audio, audioId(first.ga));
  assert.equal(first.audio.length, 16);
  assert.equal(clipText(first.audio), first.ga);
  assert.equal(clipText('0000000000000000'), null, 'a sentence that is not in a Sraith has no clip');
  assert.equal(sraithBySlug('nope'), null);
});

test('the section is for the Irish for Primary Teaching class and the teachers only', () => {
  assert.equal(SRAITH_CLASS_PREFIX, 'Irish for Primary Teaching');
  const sraith = read('src/sraith.js');
  assert.match(sraith, /if \(user\.role === 'admin'\) return true;/);
  assert.match(sraith, /cs\.active=true AND c\.active=true AND u\.active=true AND u\.withdrawn_at IS NULL\s+AND c\.programme_name ILIKE \$2/);
  assert.match(routes, /router\.use\(requireAuth\);/);
  assert.match(routes, /if \(!\(await canSeeSraith\(req\.user\)\)\) return res\.status\(403\)/);
  assert.match(student, /sraith: await canSeeSraith\(req\.user\),/);
  assert.match(app, /state\.studentData\?\.sraith \? studentNavButton\('sraith'/);
  assert.match(app, /\.\.\.\(state\.studentData\?\.sraith \? \[\['sraith', svg\.pictures, 'Sraith'\]\] : \[\]\)/);
  assert.match(server, /app\.use\('\/api\/sraith', sraithRoutes\);/);
  // Pictures are not in the public folder.
  assert.ok(!fs.existsSync(new URL('public/sraith', root)));
});

test('audio is Azure, cached on disk, warmed at start-up, and answers an iPhone’s range requests', () => {
  const sraith = read('src/sraith.js');
  assert.match(sraith, /return ttsFor\(text, ''\);/);
  assert.match(sraith, /if \(!azureKey\) return \{ made: 0, skipped: 'no Azure key' \};/);
  assert.match(server, /warmSraithAudio\(\)/);
  assert.match(routes, /'Cache-Control': 'private, max-age=31536000, immutable', 'Accept-Ranges': 'bytes'/);
  assert.match(routes, /res\.status\(206\)\.set\(\{ 'Content-Range': `bytes \$\{start\}-\$\{end\}\/\$\{buf\.length\}`/);
  assert.match(routes, /return res\.status\(416\)\.end\(\);/);
  assert.match(routes, /if \(!\/\^\[a-z0-9-\]\+\\\.jpg\$\/\.test\(file\)\) return res\.status\(404\)\.end\(\);/);
});

test('the page: Irish bold, English beneath in italics, a speaker on every line, and the study tools', () => {
  assert.match(app, /<p class="sr-ga" lang="ga">/);
  assert.match(app, /<p class="sr-en"><span>/);
  assert.match(app, /<button class="sr-say" type="button" aria-label="Play: /);
  assert.match(app, /id="sr-english"/);
  assert.match(app, /id="sr-slow"/);
  assert.match(app, /data-sr-playall=/);
  assert.match(app, /srAudio\.defaultPlaybackRate = srAudio\.playbackRate = sraithPrefs\(\)\.slow \? 0\.75 : 1;/);
  const css = read('public/styles.css');
  assert.match(css, /\.sr-ga\{[^}]*font-weight:700/);
  assert.match(css, /\.sr-en\{[^}]*font-style:italic/);
  assert.match(css, /\.sr-box\{display:grid;grid-template-columns:minmax\(0,1\.08fr\) minmax\(0,\.92fr\)/);
  const mine = app.slice(app.indexOf('/* ---- Sraith Pictiúr'));
  assert.doesNotMatch(mine, /—/, 'no em dashes in the Sraith page');
  assert.ok(fs.existsSync(new URL('scripts/build-sraith.py', root)));
  assert.equal(path.basename(data.source).startsWith('Irish for Primary Teaching'), true);
});
