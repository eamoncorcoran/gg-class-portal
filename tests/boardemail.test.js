import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Emailing a class about a post.
   ------------------------------------------------------------------
   This is the one thing the portal does that reaches people outside it and
   cannot be taken back. Three properties matter, and each has a way of going
   quietly wrong:

   who gets it — everyone enrolled including those who have never signed in, and
   nobody who has left; how often — exactly once, because a post emailed twice to
   a whole class is what people unsubscribe over; and who can cause it — the
   teacher, never a student. */

const board = fs.readFileSync(new URL('../src/boardemail.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('a student who has never signed in is still told', () => {
  const audience = board.slice(board.indexOf('const AUDIENCE'), board.indexOf('/** How many'));
  /* The point of the whole feature. Somebody invited last week who has not got
     round to signing in is exactly who most needs to hear the class is off. */
  assert.doesNotMatch(audience, /last_login_at/,
    'the audience must not depend on whether somebody has ever signed in');
  assert.doesNotMatch(audience, /must_change_password/,
    'nor on whether they have set their own password yet');
});

test('somebody who has left the course is not', () => {
  const audience = board.slice(board.indexOf('const AUDIENCE'), board.indexOf('/** How many'));
  assert.match(audience, /u\.withdrawn_at IS NULL/, 'a withdrawn student must not be emailed');
  assert.match(audience, /u\.active=true/, 'nor a deactivated account');
  assert.match(audience, /cs\.active=true/, 'nor somebody taken off the class');
  assert.match(audience, /u\.role='student'/, 'and this is a mail to students');
});

/* The count on the screen and the people who get the mail have to come from one
   question. A number worked out separately for the composer is free to drift
   from what actually happens, and it is the number somebody reads before
   deciding to mail thirty people. */
test('the count shown and the people mailed come from the same rule', () => {
  const uses = board.match(/\$\{AUDIENCE\}/g) || [];
  assert.equal(uses.length, 2, 'both the count and the recipient list must use the shared clause');
  assert.match(board, /export async function boardAudienceCount/);
  assert.match(board, /export async function boardRecipients/);
  assert.match(admin, /emailAudience: await boardAudienceCount\(klass\.id\)/,
    'the board payload must carry the real count');
  assert.match(app, /state\.community\?\.emailAudience/,
    'and the composer must show that number rather than counting for itself');
});

test('a post is emailed once, whatever runs', () => {
  /* Claimed before anything is sent, and only if unclaimed. Two of these at once
     — the sweep and the route that made the post — would otherwise both find
     notified_at empty and both send to everybody. */
  assert.match(board, /UPDATE discussion_threads SET notified_at=now\(\)\s*\n?\s*WHERE id=\$1 AND notified_at IS NULL/,
    'the send must claim the post atomically before mailing anybody');
  assert.match(board, /if \(!claimed\) return/, 'and give up if somebody else claimed it');
  assert.match(board, /if \(thread\.notified_at\) return/, 'an already-sent post must not send again');
  // And a per-person record, so a half-finished send can be seen rather than guessed at.
  assert.match(board, /ON CONFLICT \(user_id,thread_id,template_key\) WHERE thread_id IS NOT NULL DO NOTHING/,
    'each delivery must be recorded once per person');
});

test('one bad address does not stop the rest of the class being told', () => {
  const loop = board.slice(board.indexOf('for (const student of recipients)'));
  assert.match(loop.slice(0, loop.indexOf('return {')), /catch \(sendError\)/,
    'a failure to one recipient must be caught and the loop continue');
});

test('a scheduled post is emailed when it appears, not when it was written', () => {
  assert.match(board, /if \(new Date\(thread\.published_at\)\.getTime\(\) > Date\.now\(\)\)/,
    'a post that has not been published must not be emailed');
  assert.match(board, /published_at <= now\(\)/, 'and the sweep must only pick up published ones');
  /* A post becomes visible by the clock passing rather than by anything running,
     so without a sweep nothing would ever notice a scheduled one had appeared. */
  assert.match(board, /export function startBoardNotifier/);
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /startBoardNotifier\(\)/, 'the sweep has to actually be started');
});

test('only the teacher can email the class', () => {
  assert.match(admin, /notifyEmail: z\.boolean\(\)\.optional\(\)\.default\(false\)/,
    'the teacher may ask for it, and it is off unless asked for');
  /* The student board route must not know the field at all. Zod strips what it
     does not name, so absence here is the guard. */
  const route = student.slice(student.indexOf("router.post('/community/threads'"));
  const body = route.slice(0, route.indexOf('\n}));'));
  assert.doesNotMatch(body, /notifyEmail/,
    'a student must not be able to email the whole class');
  assert.doesNotMatch(student, /notifyClassOfPost/,
    'nothing on the student side may trigger a mail to everybody');
});

test('the mail carries the post, not just word that there is one', () => {
  const email = fs.readFileSync(new URL('../src/email.js', import.meta.url), 'utf8');
  const fn = email.slice(email.indexOf('export async function sendBoardPost'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /thread\.body/, 'the post itself has to be in the email');
  assert.match(body, /subject: thread\.title/, 'and its title has to be the subject');
  /* A notification that only says "something was posted" makes somebody sign in
     to discover it did not concern them. */
  assert.match(body, /escapeHtml/, 'a post is written by a person and goes into HTML');
});
