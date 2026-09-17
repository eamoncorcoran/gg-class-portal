import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DateTime } from 'luxon';

/* What follows a deadline that has moved, and what an Undo has to be.
   ------------------------------------------------------------------
   Found by an adversarial pass the day the drag shipped. */

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const move = admin.slice(admin.indexOf("router.patch('/assignments/:id/move'"));
const moveBody = move.slice(0, move.indexOf('\n}));'));

test('moving a deadline re-arms its reminders and un-dismisses it', () => {
  /* Reminders are logged per (student, assignment, template) with no date in
     the key, so once "tomorrow" had gone out for the old date nothing ever went
     out for the new one. Extending a deadline by a week switched its reminders
     off. */
  const helper = admin.slice(admin.indexOf('async function deadlineMoved'));
  const body = helper.slice(0, helper.indexOf('\n}'));
  assert.match(body, /if \(new Date\(from\)\.getTime\(\) === new Date\(to\)\.getTime\(\)\) return;/,
    'a save that leaves the deadline alone must not re-arm reminders that already went out');
  assert.match(body, /template_key IN \('tomorrow','twoHours','thirtyMinutes'\)/, 'the three deadline reminders, nothing else');
  assert.match(body, /DELETE FROM dismissed_deadlines WHERE kind='homework' AND ref_id=\$1/);
  // Every route that can change a deadline goes through it.
  const calls = admin.match(/await deadlineMoved\(assignment\.id, assignment\.deadline_at, /g) || [];
  assert.equal(calls.length, 3, 'the drag, the undo, and the edit form');
});

test('a drag never hides an assignment students can already see', () => {
  /* Shifting a live assignment's visible date into the future took it off
     their screens mid-work. The lead is kept only while it is still to come. */
  assert.match(moveBody, /const alreadyVisible = assignment\.visible_at && new Date\(assignment\.visible_at\)\.getTime\(\) <= Date\.now\(\);/);
  assert.match(moveBody, /const visibleAt = alreadyVisible \? assignment\.visible_at : shift\(assignment\.visible_at\);/);
  assert.match(moveBody, /keptVisible: Boolean\(alreadyVisible\)/);
  assert.match(app, /Students could already see it, so it stays visible/);
});

test('undo writes back the exact instants, not the sum in reverse', () => {
  /* The sum in reverse lands an hour out when either end fell in the spring
     clock change, and on a day nobody chose if the assignment was reopened in
     between. The instants it started from are handed to the browser and handed
     straight back. */
  assert.match(moveBody, /restore: z\.object\(\{/);
  assert.match(moveBody, /if \(parsed\.data\.restore\) \{/);
  assert.match(moveBody, /\[r\.deadlineAt, r\.visibleAt, r\.reopenedUntil, r\.weekId, assignment\.id\]/);
  assert.match(moveBody, /previous, keptVisible/);
  assert.match(app, /async function undoMove\(assignmentId, previous\)/);
  assert.match(app, /body: \{ restore: previous \}/);
  assert.match(app, /action: \(\) => undoMove\(assignmentId, result\.previous\)/);
  // The case that made the sum-in-reverse wrong, shown rather than described.
  const zone = 'Europe/Dublin';
  const original = DateTime.fromISO('2027-03-27T01:30:00Z').setZone(zone);
  const dragged = original.plus({ days: 1 });
  assert.equal(dragged.toFormat('HH:mm'), '02:30', '01:30 does not exist on the clock-change night');
  assert.notEqual(dragged.minus({ days: 1 }).toUTC().toISO(), original.toUTC().toISO(), 'so the reverse sum is an hour out');
});

test('each chip on the calendar is plotted in its own class zone', () => {
  assert.match(app, /zonedDateParts\(assignment\.reopened_until \|\| assignment\.deadline_at, assignment\.timezone \|\| classTimezone\(\)\)/);
});

test('a half mark says so, and clearing a recording clears it', () => {
  assert.match(admin, /marks have to be a whole number between 0 and what the question is worth/);
  assert.match(app, /min="0" step="1" max="\$\{Number\(mark\.available\) \|\| 0\}"/);
  /* undefined means the field was not on the form; null means the box was
     emptied. `??` treated them the same and fell back to the stored link. */
  assert.match(admin, /const raw = data\.video === undefined \? current\.video_ref : data\.video;/);
  assert.doesNotMatch(admin, /const raw = data\.video \?\? current\.video_ref;/);
});
