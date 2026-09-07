import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The recording of the class that ran.
   ------------------------------------------------------------------
   A link, pasted per teaching week, so somebody who was sick can watch the
   class back. Two things here can go wrong quietly, and both have a test.

   A link the teacher pastes is put into an href. `javascript:` in an href is
   not a link, it is a script the student runs by clicking it — and the teacher
   is trusted, but a link pasted from somewhere else is not necessarily what it
   looks like.

   And a column added to a table does not reach a screen that names its columns.
   That is not hypothetical: it is what happened here, and the recording sat in
   the database while the teacher's own list said every week had none. */

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const recordingRoute = () => {
  const start = admin.indexOf("router.put('/weeks/:id/recording'");
  return admin.slice(start, admin.indexOf('\n}));', start));
};

test('a link that is not a link is refused', () => {
  const body = recordingRoute();
  assert.match(body, /new URL\(url\)/, 'the link has to be parsed rather than pattern-matched');
  assert.match(body, /\['http:', 'https:'\]\.includes\(parsedUrl\.protocol\)/,
    'only http and https may be stored, because this string becomes an href');
});

test('a blank link clears the recording rather than storing an empty one', () => {
  const body = recordingRoute();
  assert.match(body, /url \|\| null/, 'an empty string must be stored as nothing');
  assert.match(body, /recording_added_at=CASE WHEN \$1::text IS NULL THEN NULL ELSE now\(\) END/,
    'and the date it was added must go with it');
});

/* The bug this file was written after. The teacher's week list names its
   columns, so a column added to `weeks` does not appear there by itself, and
   the screen said "Add recording" on a week that had one. */
test('the recording reaches the screen the teacher manages weeks on', () => {
  const start = admin.indexOf("router.get('/teaching-weeks'");
  const route = admin.slice(start, admin.indexOf('}));', start));
  for (const column of ['w.recording_url', 'w.recording_passcode', 'w.recording_note']) {
    assert.ok(route.includes(column), `${column} is missing from the teaching-weeks query`);
  }
});

test('the student is shown the passcode, not just the link', () => {
  /* A Zoom share link nearly always needs one. A student given the link without
     it meets a page asking for something nobody gave them, which reads as the
     link being broken. */
  assert.match(app, /recording\.recording_passcode/, 'the class popup must show the passcode');
  assert.match(app, /week\.recording_passcode/, 'and so must the list of recordings');
});

test('the recording opens away from the portal, safely', () => {
  const list = app.slice(app.indexOf('function recordingsCard()'));
  const body = list.slice(0, list.indexOf('\n}\n'));
  assert.match(body, /target="_blank" rel="noopener noreferrer"/,
    'a link to another site must not hand it a reference to this page');
  assert.match(body, /escapeHtml\(week\.recording_url\)/, 'and the URL goes into an attribute');
});

test('a week with no recording shows nothing rather than an empty card', () => {
  const list = app.slice(app.indexOf('function recordingsCard()'));
  assert.match(list.slice(0, list.indexOf('\n}\n')), /if \(!weeks\.length\) return ''/,
    'a course that never posts recordings should not carry a permanently empty card');
});

/* A week is stored by its Monday. A class on the Thursday of that week is still
   that week's class, and the recording of it is what somebody clicking the
   Thursday is looking for. */
test('a date is matched to the week it falls in, not only to its Monday', () => {
  const fn = app.slice(app.indexOf('function weekForDate('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /setUTCDate\(end\.getUTCDate\(\) \+ 6\)/,
    'the whole week has to be considered, not just its first day');
  assert.match(body, /day >= start && day <= /, 'and the date compared against both ends');
});
