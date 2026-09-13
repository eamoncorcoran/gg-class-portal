import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The three things the portal reminds somebody about.
   ------------------------------------------------------------------
   Homework, the weekly check-in, and class starting. The first was here
   already; the other two were asked for and did not exist, so a student got
   nothing about a check-in closing and nothing about a class two hours away.

   Both new ones are single messages rather than sequences. The homework
   reminder fires three times per assignment per student, which is the largest
   multiplier in the portal, and hanging two more sequences beside it would have
   undone the point of narrowing the board notices. */

const reminders = fs.readFileSync(new URL('../src/reminders.js', import.meta.url), 'utf8');
const email = fs.readFileSync(new URL('../src/email.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const bodyOf = (source, name) => {
  const cut = source.slice(source.indexOf(name));
  return cut.slice(0, cut.indexOf('\n}\n'));
};

test('a check-in reminder goes to whoever has not done it', () => {
  const body = bodyOf(reminders, 'export async function runCheckinReminders');
  assert.match(body, /COALESCE\(ch\.status,'draft'\) = 'draft'/,
    'somebody who has already submitted must not be chased');
  assert.match(body, /w\.checkin_release_at <= now\(\)/,
    'nor anybody about a check-in that has not opened');
  assert.match(body, /interval '24 hours'/, 'a day before it closes');
  assert.match(body, /u\.withdrawn_at IS NULL/);
});

test('a class reminder goes two hours before, and only for a class that is running', () => {
  const body = bodyOf(reminders, 'export async function runClassReminders');
  assert.match(reminders, /const CLASS_REMINDER_MS = 2 \* 60 \* 60 \* 1000/, 'two hours before');
  assert.match(body, /now \+ CLASS_REMINDER_MS - WINDOW_MS/,
    'and a window wide enough that a sitting cannot fall between two cycles');
  /* A week marked recorded has no live class and a skipped one has nothing at
     all. Reminding somebody to turn up to either is worse than silence. */
  assert.match(body, /\['running', 'moved', 'extra'\]\.includes\(sitting\.kind\)/);
  assert.match(body, /classSittings\(klass/,
    'sittings are worked out, not assumed from the weekly day and time');
});

test('each reminder is sent once, and a held one is not recorded', () => {
  const body = bodyOf(reminders, 'async function sendOnce');
  assert.match(body, /SELECT id FROM email_deliveries WHERE user_id=\$1 AND dedupe_key=\$2/);
  assert.match(body, /if \(result\?\.suppressed\) return false/,
    'held is neither sent nor failed, and recording it would lose the reminder');
  assert.ok(body.indexOf('if (result?.suppressed)') < body.indexOf('INSERT INTO email_deliveries'),
    'the check has to come before the row is written');
});

test('a class reminder is keyed on the sitting, not the class', () => {
  const body = bodyOf(reminders, 'export async function runClassReminders');
  assert.match(body, /class_soon:\$\{klass\.id\}:\$\{new Date\(sitting\.at\)\.toISOString\(\)\}/,
    'an extra session in the same week needs its own reminder');
});

test('all three run on the one timer', () => {
  const body = bodyOf(reminders, 'export function startReminderScheduler');
  for (const fn of ['runReminderCycle', 'runCheckinReminders', 'runClassReminders']) {
    assert.ok(body.includes(fn), `${fn} is never scheduled`);
  }
  /* One after another. They share a mail server and a pacing check, and running
     them together only makes the order of the pacing arbitrary. */
  assert.match(body, /await runReminderCycle\(\)/);
});

/* The links. Every reminder has always carried a destination in its URL and
   nothing ever read it, so the homework reminder's button landed students on
   the calendar with no idea why. */
test('the links in reminders point somewhere the app understands', () => {
  assert.match(email, /\?go=tracker/, 'the check-in reminder opens the tracker');
  assert.match(email, /\?go=calendar/, 'the class reminder opens the calendar');
  assert.match(email, /\?go=assignment&id=/, 'the homework reminder opens the homework');
  assert.doesNotMatch(email, /\?assignment=\$\{assignment\.id\}/,
    'the old parameter was never read by anything');
});

test('and the app actually follows them', () => {
  assert.match(app, /async function followLink\(\)/);
  const body = bodyOf(app, 'async function followLink');
  for (const destination of ['calendar', 'tracker', 'community', 'assignment']) {
    assert.ok(body.includes(`'${destination}'`), `${destination} is not handled`);
  }
  /* Cleared from the address bar, or a refresh reopens whatever it named. */
  assert.match(body, /searchParams\.delete\(key\)/);
  assert.ok(body.indexOf('history.replaceState') < body.indexOf("go === 'calendar'"),
    'the address bar is cleaned before anything that might fail');
});

test('a link to an assignment that is gone leaves the student on the calendar', () => {
  const body = bodyOf(app, 'async function followLink');
  assert.match(body, /if \(assignment\) openHomeworkForm\(assignment\)/,
    'a missing assignment must not throw at somebody arriving from an email');
});
