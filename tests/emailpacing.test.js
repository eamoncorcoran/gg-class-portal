import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* How much mail leaves this portal, and when.
   ------------------------------------------------------------------
   A month's sending allowance went in a day, so pacing stopped being a nicety.
   It lives in sendEmail rather than at the callers, because a rule enforced at
   each of twenty call sites is a rule somebody forgets at the twenty-first. */

const email = fs.readFileSync(new URL('../src/email.js', import.meta.url), 'utf8');
const notify = fs.readFileSync(new URL('../src/boardnotify.js', import.meta.url), 'utf8');
const flat = (text) => String(text).replace(/\s+/g, ' ');

test('everything goes through one gate', () => {
  const fn = email.slice(email.indexOf('export async function sendEmail('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /const held = await pacingProblem\(\{ to, priority \}\)/,
    'the check must be the first thing sendEmail does');
  assert.ok(body.indexOf('pacingProblem') < body.indexOf('getEmailConfig'),
    'and must run before any provider is chosen');
});

test('an unlabelled message is paced rather than escaping the pacing', () => {
  assert.match(email, /priority = 'notice'/,
    'the default has to be the cautious end, or a message added later leaks');
});

test('what somebody is waiting on is never held', () => {
  /* Holding a password reset does not save an email. It produces a locked-out
     student and a message asking why the portal is broken. */
  assert.match(email, /const NEVER_HELD = new Set\(\['transactional'\]\)/);
  for (const fn of ['sendPasswordReset', 'sendPasswordChanged', 'sendStudentInvite', 'sendNudge']) {
    const cut = email.slice(email.indexOf(`export async function ${fn}`));
    const body = cut.slice(0, cut.indexOf('\n}\n'));
    assert.match(body, /priority: 'transactional'/, `${fn} must never be held back`);
  }
});

test('a reminder is not paced, because a late reminder is not a reminder', () => {
  const cut = email.slice(email.indexOf('export async function sendDeadlineReminder'));
  const body = cut.slice(0, cut.indexOf('\n}\n'));
  assert.match(body, /priority: 'deadline'/);
  assert.match(email, /const PACED = new Set\(\['notice'\]\)/,
    'only board traffic is paced');
});

test('the teacher’s own post is an announcement; a student’s is board traffic', () => {
  const cut = email.slice(email.indexOf('export async function sendBoardPostNotice'));
  const body = cut.slice(0, cut.indexOf('\n}\n'));
  assert.match(body, /priority: teacher \? 'announcement' : 'notice'/);
});

test('a reply notice says there is a reply and nothing about it', () => {
  const cut = email.slice(email.indexOf('export async function sendBoardReplyNotice'));
  const body = cut.slice(0, cut.indexOf('\n}\n'));
  /* Quoting a reply puts the same words in two places, out of order, with the
     email already stale by the time it is read, and puts one student's words in
     front of another in a channel neither chose. */
  assert.doesNotMatch(body, /comment\.body/, 'the reply text must not be in the email');
  assert.doesNotMatch(body, /quoted\(/, 'nor any part of it');
  assert.match(flat(body), /Somebody has replied to a post on the class board/);
  assert.match(flat(body), /Somebody has replied to a comment on the class board/);
  assert.match(body, /priority: 'notice'/);
});

test('a held message is recorded, not lost', () => {
  /* A message held back that left no trace is indistinguishable from one that
     was never attempted, and the whole point was wanting to know what the
     portal sends. */
  assert.match(email, /status: 'suppressed'/);
  assert.match(email, /INSERT INTO email_sends/);
  const fn = notify.slice(notify.indexOf('async function deliver('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /if \(result\?\.suppressed\)/, 'the board must notice when a notice was held');
  assert.match(body, /'suppressed', result\.reason/);
});

test('a held notice is not retried into the same person later', () => {
  const fn = notify.slice(notify.indexOf('async function deliver('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  /* The claim stays in place. The pace means this person hears once about the
     conversation, not that they hear about every turn of it an hour later. */
  assert.match(body, /suppressed \+= 1;\s*\n\s*continue;/);
});

test('the pause can be lifted without a deploy', () => {
  const settings = fs.readFileSync(new URL('../src/routes/settings.js', import.meta.url), 'utf8');
  assert.match(settings, /router\.get\('\/email\/pause'/);
  assert.match(settings, /router\.put\('\/email\/pause'/);
  /* Zero hours lifts it, so pausing and resuming are the same control rather
     than two that can disagree. */
  assert.match(settings, /const until = hours > 0 \? /);
});

/* A ceiling on the day, as distinct from the pace.
   ------------------------------------------------------------------
   The pace limits what one person receives and does nothing about the total. A
   hundred people getting one message each is a hundred messages, and an
   allowance is spent by the total. */
test('there is a ceiling on the day as well as a pace on the person', () => {
  assert.match(email, /async function overDailyCeiling\(priority\)/);
  const fn = email.slice(email.indexOf('async function overDailyCeiling('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /interval '24 hours'/, 'a rolling day, so a burst at midnight is still covered');
  assert.match(body, /console\.warn/, 'reaching it means something is wrong, so it should say so');
});

test('the ceiling never silences a reminder or a login', () => {
  /* A ceiling that stopped a homework reminder would trade a smaller problem
     for a worse one. */
  assert.match(email, /const CEILING_EXEMPT = new Set\(\['transactional', 'deadline'\]\)/);
});

test('the ceiling can be raised or switched off without a deploy', () => {
  const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  assert.match(config, /emailDailyCap: Number\(process\.env\.EMAIL_DAILY_CAP \?\? 150\)/);
  const fn = email.slice(email.indexOf('async function overDailyCeiling('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /if \(!Number\.isFinite\(limit\) \|\| limit <= 0\) return null/,
    'zero has to switch it off, or a wrong value becomes a silent outage');
});

/* The bug found while looking into this. */
test('a reminder that was held is not recorded as sent', () => {
  const reminders = fs.readFileSync(new URL('../src/reminders.js', import.meta.url), 'utf8');
  assert.match(reminders, /if \(result\?\.suppressed\) \{ status = 'suppressed'/,
    'a held message is neither sent nor failed');
  assert.match(reminders, /if \(status === 'suppressed'\) continue;/,
    'and no delivery row, or the reminder is never tried again');
  /* The delivery row is what stops a reminder going twice. Writing one for a
     reminder that never went stopped it going at all, and the log said it had. */
  assert.doesNotMatch(reminders, /status = result\.simulated \? 'simulated' : 'sent';\s*\n\s*providerId = result\.id;/,
    'the old unconditional recording has come back');
});

test('the screen says what is generating the volume, not just how much', () => {
  const settings = fs.readFileSync(new URL('../src/routes/settings.js', import.meta.url), 'utf8');
  assert.match(settings, /GROUP BY priority/, 'a total says it is a lot; only a breakdown says what to do');
  assert.match(settings, /date_trunc\('day', created_at\)/);
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /Board activity: replies and student posts/,
    'and in words somebody would use, not the code categories');
});
