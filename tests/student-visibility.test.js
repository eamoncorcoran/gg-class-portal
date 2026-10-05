import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Eamon, 5 Oct 2026: "make absolutely sure that the logic behind showing the
   homework each week ... the check-ins ... and showing notifications when they
   come into the app ... They shouldn't see notifications if they've already
   done the work." What the audit found, pinned. */
const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const weeks = fs.readFileSync(new URL('../src/weeks.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('the badge counts only feedback the student can reach', () => {
  assert.match(student, /openWeeks\.has\(row\.week_id\)/);
  assert.match(student, /shownAssignments\.has\(row\.assignment_id\)/);
  assert.match(student, /row\.status === 'returned' && !row\.feedback_read_at && openWeeks/);
});

test('a check-in tile stays on the tracker once it has opened, closed or not', () => {
  assert.match(app, /const released = week\.checkin_enabled !== false && week\.checkin_release_at && Date\.now\(\) >= new Date\(week\.checkin_release_at\)\.getTime\(\);/);
  assert.match(app, /if \(released \|\| checkin\) \{/);
  assert.doesNotMatch(app, /if \(week\.checkin_available\) \{\s*const unread/);
  // The "opens on" line is only for one that has not opened.
  assert.match(app, /released \|\| checkin \|\| week\.checkin_enabled === false \? '' : `<p class="week-card-note">Your check-in opens/);
});

test('a soft check-in deadline keeps taking the check-in, as the server does', () => {
  assert.match(app, /Date\.now\(\) > new Date\(week\.checkin_due_at\)\.getTime\(\) && week\.checkin_hard_deadline !== false/);
});

test('work the teacher has replied to cannot be submitted over', () => {
  assert.match(student, /already\?\.status === 'returned'\) return res\.status\(409\)\.json\(\{ error: 'Your teacher has already replied to this check-in/);
  assert.match(student, /already\?\.status === 'returned'\) return res\.status\(409\)\.json\(\{ error: 'Your teacher has already returned this homework/);
});

test('a deleted week stays deleted', () => {
  assert.match(weeks, /SELECT max\(week_start\)::text latest FROM weeks WHERE class_id=\$1/);
  assert.match(weeks, /if \(after && week <= after\) continue;/);
});

test('work that closed before a student joined is not theirs to have missed, and a stale tab asks again', () => {
  assert.match(student, /enrolledAt: klass\.enrolled_at \|\| null/);
  assert.match(student, /SELECT c\.\*, cs\.enrolled_at FROM classes c/);
  assert.match(app, /const joinedAt = state\.studentData\.enrolledAt/);
  assert.match(app, /!\(item\.status\.tone === 'red' && joinedAt && new Date\(item\.due\)\.getTime\(\) < joinedAt\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.match(app, /Date\.now\(\) - studentLoadedAt < 60 \* 1000/);
});
