import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DateTime } from 'luxon';

/* Dragging an assignment to another day.
   ------------------------------------------------------------------
   The deadline lands on the day it was dropped on at the time it already had,
   and everything else shifts by the same number of days. What is guarded here
   is the arithmetic, because "the time stays the same" means eight o'clock in
   Dublin, and the calendar crosses the clock change twice a year. */

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const route = admin.slice(admin.indexOf("router.patch('/assignments/:id/move'"));
const body = route.slice(0, route.indexOf('\n}));'));

test('a move is whole days in the class timezone, not hours in UTC', () => {
  /* This is the arithmetic the route uses, run here without a database. A
     Thursday at 20:00 Dublin in October is 19:00Z; the same Thursday in
     November is 20:00Z. Adding fourteen days in the zone keeps 20:00 Dublin;
     adding fourteen times twenty-four hours to the instant would land at 19:00
     Dublin, an hour early, with nothing on screen to say why. */
  const zone = 'Europe/Dublin';
  const before = DateTime.fromISO('2026-10-22T19:00:00Z').setZone(zone);
  assert.equal(before.toFormat('HH:mm'), '20:00');
  const after = before.plus({ days: 14 });
  assert.equal(after.toFormat('ccc dd LLL HH:mm'), 'Thu 05 Nov 20:00');
  assert.equal(after.toUTC().toISO(), '2026-11-05T20:00:00.000Z', 'the instant moves an hour; the wall clock does not');
  // The naive version, for contrast: this is the bug being avoided.
  const naive = new Date(new Date('2026-10-22T19:00:00Z').getTime() + 14 * 86400000);
  assert.equal(DateTime.fromJSDate(naive).setZone(zone).toFormat('HH:mm'), '19:00');
  // And it is symmetric, so Undo lands on the exact original instant.
  assert.equal(after.minus({ days: 14 }).toUTC().toISO(), before.toUTC().toISO());
});

test('the route shifts in the zone and only ever by whole days', () => {
  assert.match(body, /const wanted = assignment\.timezone \|\| config\.defaultTimezone;/);
  assert.match(body, /const delta = Math\.round\(target\.diff\(plotted, 'days'\)\.days\);/);
  /* Both ends arrive as plain dates from the calendar the teacher was looking
     at, so the number of days never depends on which zone drew the chip. A
     nonsense timezone on the class falls back rather than failing every drag. */
  assert.match(body, /fromDate: day\.optional\(\)/);
  assert.match(body, /const zone = DateTime\.now\(\)\.setZone\(wanted\)\.isValid \? wanted : config\.defaultTimezone;/);
  assert.match(app, /if \(fromDate === day\.dataset\.dropOn\) return;/, 'a drop on the cell it came from is a no-op before any request');
  assert.match(body, /inZone\(value\)\.plus\(\{ days: delta \}\)/, 'plus({ days }) in the zone is what keeps the wall clock');
  // A day-only date arrives, so nothing about the time can change from here.
  assert.match(body, /const day = z\.string\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\);/);
  assert.match(body, /onDate: day\.optional\(\),/, 'optional because an Undo sends a restore instead');
});

test('the deadline, the visible date and a reopened date all move together', () => {
  assert.match(body, /const deadlineAt = shift\(assignment\.deadline_at\);/);
  /* The visible date shifts with the deadline only while it is still to come;
     a live assignment keeps its date so it stays on students' screens. */
  assert.match(body, /const visibleAt = alreadyVisible \? assignment\.visible_at : shift\(assignment\.visible_at\);/);
  assert.match(body, /const reopenedUntil = shift\(assignment\.reopened_until\);/);
  /* The chip is drawn on the reopened date when there is one, so that is the
     date that has to land where it was dropped. */
  assert.match(body, /: inZone\(assignment\.reopened_until \|\| assignment\.deadline_at\)\.startOf\('day'\);/,
    'and when the browser does not say which day it dragged from, the reopened date is the plotted one');
});

test('the teaching week follows the deadline, and only if it was filed at all', () => {
  assert.match(body, /let weekId = assignment\.week_id;/);
  assert.match(body, /if \(weekId\) \{/, '"no weekly tracker column" is a choice and stays one');
  assert.match(body, /week_start <= \$2::date AND week_start > \(\$2::date - interval '7 days'\)/);
  assert.match(body, /weekId = week\?\.id \|\| null;/, 'a deadline with no covering week is unfiled rather than left in the wrong column');
});

test('an archived assignment cannot be moved, and a same-day drop is a no-op', () => {
  assert.match(body, /if \(assignment\.status === 'archived'\)/);
  assert.match(body, /Restore this assignment before moving it\./);
  assert.match(body, /if \(delta === 0\) return res\.json\(\{ \.\.\.assignment, moved: 0 \}\);/);
  // The day it came from goes back to the browser, which is all Undo needs.
  assert.match(body, /previousDay: plotted\.toISODate\(\)/);
});

test('every drag can be undone from the toast, to the exact instants it started from', () => {
  /* Undo used to be the same move run in reverse. That lands an hour out when
     either end fell in the spring clock change, so it is now the instants the
     move started from, handed to the browser and handed straight back. */
  assert.match(app, /async function moveAssignment\(assignmentId, onDate, \{ undoing = false, fromDate = null \} = \{\}\)/);
  const client = app.slice(app.indexOf('async function moveAssignment'));
  const inner = client.slice(0, client.indexOf('\n}'));
  assert.match(inner, /if \(!result\.moved\) return;/, 'a same-day drop says nothing');
  assert.match(inner, /label: 'Undo', action: \(\) => undoMove\(assignmentId, result\.previous\)/);
  assert.match(app, /async function undoMove\(assignmentId, previous\)/);
  // The undo toast carries no undo of its own; undoMove shows a plain one.
  const undo = app.slice(app.indexOf('async function undoMove'));
  assert.doesNotMatch(undo.slice(0, undo.indexOf('\n}')), /label: 'Undo'/);
  // Only live assignments are draggable; an archived chip stays put.
  assert.match(app, /const draggable = assignment\.status !== 'archived';/);
  assert.match(app, /\.calendar-day\[data-drop-on\]/);
});
