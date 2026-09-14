import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The teacher's calendar.
   ------------------------------------------------------------------
   It was the Homework tab and it showed homework: deadlines, with the teaching
   weeks shaded behind them. The two things it did not show were the two things
   most likely to be wanted from a calendar, which are when the classes are and
   when the check-ins close. A week was shaded but the deadline inside it was
   nowhere on the page. */

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');

const bodyOf = (source, name) => {
  const cut = source.slice(source.indexOf(name));
  return cut.slice(0, cut.indexOf('\n}\n'));
};

test('the tab is a calendar, and says so', () => {
  assert.match(app, /adminNavButton\('assignments', svg\.calendar, 'Calendar'\)/);
  assert.doesNotMatch(app, /adminNavButton\('assignments', svg\.book, 'Homework'\)/);
});

test('classes are drawn from the worked-out sittings, not the weekly slot', () => {
  const body = bodyOf(app, 'function assignmentCalendarView(');
  assert.match(body, /state\.classDates/, 'the calendar needs the real sittings');
  /* A cancelled week is struck through rather than missing, because an absence
     leaves somebody wondering whether they are looking at the wrong week. */
  assert.match(body, /class="calendar-event klass \$\{sitting\.kind\}"/,
    'a class entry carries its kind, so a month reads without hovering every one');
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.calendar-event\.klass\.skipped\{[^}]*line-through/);
});

test('a check-in appears on the day it closes', () => {
  const body = bodyOf(app, 'function assignmentCalendarView(');
  assert.match(body, /week\.checkin_due_at/, 'the deadline is what goes on the calendar');
  assert.match(body, /checkin_enabled !== false/, 'a week switched off has no deadline to show');
});

test('a check-in says which class it belongs to', () => {
  /* Three groups can have a check-in closing at the same minute, and three
     identical chips on one day say nothing about which is which. */
  const body = bodyOf(app, 'function assignmentCalendarView(');
  assert.match(body, /Check-in\$\{filter \? '' : `: \$\{escapeHtml\(whose\)\}`\}/,
    'named when looking at all classes, and not when the view is already one class');
});

test('clicking a class offers the link to open it', () => {
  assert.match(app, /function openAdminClassInfo\(classId, at\)/);
  const body = bodyOf(app, 'function openAdminClassInfo');
  assert.match(body, /sitting\.joinUrl/);
  assert.match(body, /target="_blank" rel="noopener noreferrer"/);
  /* A cancelled or pre-recorded week has nothing to join, and offering a button
     that drops somebody into an empty room is worse than not offering one. */
  assert.match(body, /const running = \['running', 'moved', 'extra'\]\.includes\(sitting\.kind\)/);
  assert.match(body, /running && sitting\.joinUrl/);
});

test('the join link is resolved on the server, where the rule lives', () => {
  /* It can be overridden per week and per session, and that rule should not be
     written a second time on a screen. */
  const body = bodyOf(admin, "router.get('/class-dates'");
  assert.match(body, /joinLinkFor\(klass, weeks\.rows/);
  assert.match(body, /sitting\.joinUrl\s*\n?\s*\|\| joinLinkFor/,
    "a session's own link wins over the class one");
});

/* Found while building this: the passcode helper only matched a note that began
   with the word, so "7pm Irish · Passcode: 975967" printed in full under the
   heading Passcode, on the student's screen as well as the teacher's. */
test('a passcode is found anywhere in the note, not only at the start', () => {
  const cut = app.slice(app.indexOf('function passcodeOnly('));
  const body = cut.slice(0, cut.indexOf('\n}\n') + 2);
  const passcodeOnly = new Function(`${body}; return passcodeOnly;`)();

  assert.equal(passcodeOnly('7pm Irish · Passcode: 975967'), '975967');
  assert.equal(passcodeOnly('Passcode: 975967'), '975967');
  assert.equal(passcodeOnly('975967'), '975967');
  // It stops at the next separator rather than swallowing the rest of the line.
  assert.equal(passcodeOnly('Passcode 8Xk?2wQz, join early'), '8Xk?2wQz');
  // A note with no code in it is still shown, rather than becoming empty.
  assert.equal(passcodeOnly('no code here'), 'no code here');
});
