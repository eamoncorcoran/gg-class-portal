import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Homework sits in the tracker week its deadline falls in.
   ------------------------------------------------------------------
   The week used to be picked by hand on the form, defaulting to none. An
   empty pick took the homework off the tracker altogether and an edited
   deadline left it a week away from where it was due, so two teachers looking
   at the same class saw weeks with homework missing. Now the server works the
   week out on every create, edit, drag and undo, and migration 055 re-filed
   what was already there. */

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const weeks = read('../src/weeks.js');
const admin = read('../src/routes/admin.js');
const app = read('../public/app.js');
const migration = read('../migrations/055_assignment_week_by_deadline.sql');

test('the week is the Monday of the deadline in the class timezone', () => {
  assert.match(weeks, /export async function weekForDeadline\(classId, deadlineAt, db = \{ query \}\)/);
  assert.match(weeks, /w\.week_start=\(date_trunc\('week', \$2::timestamptz AT TIME ZONE COALESCE\(c\.timezone,'Europe\/Dublin'\)\)\)::date/);
  assert.match(migration, /w\.week_start = \(date_trunc\('week', a\.deadline_at AT TIME ZONE COALESCE\(c\.timezone, 'Europe\/Dublin'\)\)\)::date/);
});

test('creating homework files it by its deadline, whatever an old page sends', () => {
  const body = admin.slice(admin.indexOf("router.post('/assignments'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  assert.match(inner, /const weekId = await weekForDeadline\(a\.classId, a\.deadlineAt\);/);
  assert.match(inner, /\[a\.classId, weekId, a\.title,/);
});

test('the form has no week picker to get wrong', () => {
  assert.doesNotMatch(app, /id="assignment-week"/);
  assert.doesNotMatch(app, /No weekly tracker column/);
  assert.doesNotMatch(app, /function loadAssignmentWeeks/);
  assert.match(app, /It shows on the tracker in the week of this deadline\./);
});

test('a coming week shows on the teacher tracker once homework in it is open, and Now stays on this week', () => {
  assert.match(app, /const openedWeeks = new Set\(t\.assignments\.filter\(\(a\) => a\.week_id && new Date\(a\.visible_at\) <= new Date\(\)\)/);
  assert.match(app, /\|\| openedWeeks\.has\(week\.id\)\);/);
  assert.match(app, /const currentWeekId = weeks\.findLast\(\(week\) => String\(week\.week_start\)\.slice\(0, 10\) <= thisMonday\)\?\.id/);
});
