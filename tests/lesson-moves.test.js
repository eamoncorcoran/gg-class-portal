import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Moving a lesson's recording from a Zoom link into the player.
   ------------------------------------------------------------------
   The first nine lessons of Irish for Primary Teaching 26/27 were added by
   hand as Zoom links. Matching each to its recording is the part that must not
   be wrong: a class put under the wrong week is worse than a link. The link on
   the lesson is no help, because Zoom hands out a different share address every
   time it is asked. The cases below are that course as it stood on
   18 November 2026. */

process.env.DEFAULT_TIMEZONE = 'Europe/Dublin';
const { matchRecordings } = await import('../src/lessonmoves.js');
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const MODULE = 'term-1';
const CLASS = '83512243750';
const rec = (uuid, startedAt, minutes, meetingId = CLASS) => ({ uuid, fileId: `f-${uuid}`, meetingId, startedAt, durationSeconds: minutes * 60, shareUrl: `https://zoom.us/rec/share/today-${uuid}` });
const recordings = [
  rec('nov16', '2026-11-16T18:58:25Z', 72),
  rec('nov09', '2026-11-09T18:57:07Z', 82),
  rec('oral', '2026-10-29T18:53:33Z', 58, '82900659840'),
  rec('oct26', '2026-10-26T19:00:43Z', 54),
  rec('oct19', '2026-10-19T18:03:26Z', 73),
  rec('oct12', '2026-10-12T18:01:30Z', 83),
  rec('oct05', '2026-10-05T17:55:42Z', 71),
  rec('sep29', '2026-09-29T18:11:58Z', 70),
  rec('sep29-false-start', '2026-09-29T18:09:11Z', 2),
  rec('webinar', '2026-09-25T17:30:00Z', 67, '84254167702'),
  rec('sep21', '2026-09-21T18:02:07Z', 71),
  rec('sep14', '2026-09-14T18:06:10Z', 84),
  rec('sep07', '2026-09-07T17:57:51Z', 85),
];
const lesson = (id, position, extra = {}) => ({ id, moduleId: MODULE, position, title: id, recordedOn: null, videoRef: `https://zoom.us/rec/share/copied-long-ago-${id}`, ...extra });
const lessons = [
  lesson('ceacht-1', 0), lesson('ceacht-2', 1), lesson('ceacht-3', 2),
  lesson('ceacht-4', 3, { videoRef: 'https://zoom.us/rec/share/abc?startTime=1790705539000' }),
  lesson('ceacht-5', 4), lesson('ceacht-6', 5), lesson('ceacht-7', 6),
  lesson('oct-26', 7, { recordedOn: '2026-10-26' }),
  lesson('ceacht-9', 8),
];
const sources = [{ zoomId: CLASS, moduleId: MODULE }];
const taken = new Set(['nov16:f-nov16']); // already in the player as its own lesson
const pairs = (result) => Object.fromEntries(result.map((row) => [row.lessonId, row.recording?.uuid || null]));

test('each hand-made lesson finds its own class, by what does not change', () => {
  const result = matchRecordings({ lessons, recordings, sources, imports: [{ lessonId: 'oct-26', uuid: 'oct26', fileId: 'f-oct26' }], taken });
  assert.deepEqual(pairs(result), {
    'ceacht-1': 'sep07', 'ceacht-2': 'sep14', 'ceacht-3': 'sep21', 'ceacht-4': 'sep29',
    'ceacht-5': 'oct05', 'ceacht-6': 'oct12', 'ceacht-7': 'oct19', 'oct-26': 'oct26', 'ceacht-9': 'nov09',
  });
  const how = Object.fromEntries(result.map((row) => [row.lessonId, row.by]));
  assert.equal(how['oct-26'], 'import');
  assert.equal(how['ceacht-4'], 'time');
  assert.equal(how['ceacht-1'], 'order');
});

test('a date on the lesson is enough when the portal has no record of importing it', () => {
  const result = matchRecordings({ lessons, recordings, sources, taken });
  assert.equal(pairs(result)['oct-26'], 'oct26');
  assert.equal(result.find((row) => row.lessonId === 'oct-26').by, 'date');
});

test('a two-minute false start, another webinar and a recording already in the player are never used', () => {
  const used = Object.values(pairs(matchRecordings({ lessons, recordings, sources, taken })));
  for (const never of ['sep29-false-start', 'oral', 'webinar', 'nov16']) assert.ok(!used.includes(never), `${never} was matched to a lesson`);
});

test('when the counts do not agree, nothing is guessed', () => {
  // One class was never recorded: seven lessons left to place and only six recordings.
  const fewer = recordings.filter((r) => r.uuid !== 'oct12');
  const result = matchRecordings({ lessons, recordings: fewer, sources, taken });
  const got = pairs(result);
  assert.equal(got['ceacht-4'], 'sep29', 'what is certain is still matched');
  assert.equal(got['oct-26'], 'oct26');
  for (const id of ['ceacht-1', 'ceacht-2', 'ceacht-3', 'ceacht-5', 'ceacht-6', 'ceacht-7', 'ceacht-9']) {
    assert.equal(got[id], null, `${id} was guessed`);
    assert.match(result.find((row) => row.lessonId === id).reason, /not certain which is which/);
  }
});

test('a guess that would put the dates out of order is thrown away whole', () => {
  // The lessons were rearranged: "ceacht-9" now sits before "ceacht-4", whose date is known.
  const moved = lessons.map((l) => (l.id === 'ceacht-9' ? { ...l, position: 2.5 } : l));
  const got = pairs(matchRecordings({ lessons: moved, recordings, sources, taken }));
  assert.equal(got['ceacht-4'], 'sep29');
  assert.equal(got['ceacht-1'], null);
  assert.equal(got['ceacht-9'], null);
});

test('a section no webinar feeds is left alone, with the reason', () => {
  const result = matchRecordings({ lessons: [{ ...lesson('stray', 0), moduleId: 'elsewhere' }], recordings, sources, taken });
  assert.equal(result[0].recording, null);
  assert.match(result[0].reason, /No Zoom webinar is set to feed this section/);
});

test('the lesson is switched only once its copy can be played, and only if nobody changed it meanwhile', () => {
  const source = read('../src/lessonmoves.js');
  const finish = source.slice(source.indexOf('export async function finishMoves'));
  assert.ok(finish.indexOf('if (!video.playable) { waiting += 1; continue; }') < finish.indexOf("UPDATE course_lessons SET video_provider='bunny'"));
  assert.match(finish, /WHERE id=\$1 AND video_provider=\$4 AND video_ref=\$5 RETURNING id/);
  // The copy is a new video on Bunny; the lesson row is updated, never inserted.
  assert.ok(!/INSERT INTO course_lessons/.test(source));
  // What the lesson pointed at before is kept, so it can be put back.
  assert.match(read('../migrations/060_lesson_video_moves.sql'), /previous_ref text NOT NULL/);
});

test('Bunny reporting an error is not mistaken for a finished video', () => {
  const bunny = read('../src/bunny.js');
  assert.match(bunny, /playable: status === 4 \|\| status === 7 \|\| status === 8,/);
  assert.match(bunny, /failed: status === 5 \|\| status === 6,/);
});
