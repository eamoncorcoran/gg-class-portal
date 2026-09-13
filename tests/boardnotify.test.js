import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Who hears about the board, and how often.
   ------------------------------------------------------------------
   This is the part of the portal that reaches people outside it, so the ways it
   can go wrong are the ways that cost trust: telling somebody about their own
   action, telling them twice, or telling them once and then never again.

   That last one is not hypothetical. The delivery log keyed a reply on the
   thread it belonged to, so the second reply in a conversation was taken for a
   repeat of the first and dropped without a word. Somebody heard about a
   conversation once and then heard nothing while it carried on. */

const notify = fs.readFileSync(new URL('../src/boardnotify.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/032_reply_notice_key.sql', import.meta.url), 'utf8');

test('nobody is told about a thing they did themselves', () => {
  assert.match(notify, /if \(person\.id === actorId \|\| seen\.has\(person\.id\)\) continue/,
    'the actor must be skipped, and so must anybody already counted');
});

test('being in a conversation twice over still means one email', () => {
  /* The author of a post who has also commented on it is one person. Without the
     seen set they would qualify twice and be told twice. */
  assert.match(notify, /const seen = new Set\(\)/);
  assert.match(notify, /SELECT DISTINCT u\.id/, 'the audience query must not return anybody twice either');
});

test('a reply is keyed on the reply, not on the thread it sits in', () => {
  /* The bug. A thread-wide key meant one notice per conversation for ever. */
  assert.match(migration, /DROP INDEX IF EXISTS email_deliveries_thread_key/);
  assert.match(migration, /WHERE thread_id IS NOT NULL AND post_id IS NULL/,
    'the thread key must apply only to post announcements, never to replies');
  assert.match(notify, /postId: comment\.id/, 'a reply notice must be keyed on the comment');
});

test('a delivery is claimed before it is sent', () => {
  /* A crash halfway through a class must not send the first half a second copy
     when it runs again. */
  const fn = notify.slice(notify.indexOf('async function deliver('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /VALUES \(\$1,\$2,\$3,\$4,\$5,'queued'\)/, 'the row is written before the send');
  assert.match(body, /ON CONFLICT DO NOTHING\s*\n\s*RETURNING id/);
  assert.match(body, /if \(!claim\) continue/, 'a row somebody else claimed is left alone');
  assert.match(body, /catch \(error\)/, 'one bad address must not stop the rest');
});

test('the audience for a new post is the class, however new the student is', () => {
  const fn = notify.slice(notify.indexOf('async function classAudience('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.doesNotMatch(body, /last_login_at/,
    'somebody who has never signed in is exactly who a first post is for');
  assert.match(body, /u\.withdrawn_at IS NULL/, 'somebody who left the course is not');
  assert.match(body, /u\.active=true/);
});

test('every notice says how to stop getting them', () => {
  const email = fs.readFileSync(new URL('../src/email.js', import.meta.url), 'utf8');
  assert.match(email, /OFF_SWITCH_HTML/);
  assert.match(email, /OFF_SWITCH_TEXT/);
  for (const fn of ['sendBoardPostNotice', 'sendBoardReplyNotice']) {
    const body = email.slice(email.indexOf(`export async function ${fn}`));
    const cut = body.slice(0, body.indexOf('\n}\n'));
    assert.match(cut, /OFF_SWITCH_HTML/, `${fn} must carry the off switch`);
    assert.match(cut, /OFF_SWITCH_TEXT/, `${fn} must carry it in the plain text too`);
  }
  // And the switch it points at has to exist.
  assert.match(app, /id="notify-posts"/);
  assert.match(app, /id="notify-replies"/);
});

test('a preference that fails to save shows what is actually true', () => {
  const fn = app.slice(app.indexOf('async function bindNotificationSettings('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /box\.checked = !wanted/,
    'a switch that failed to save must go back, not sit there showing a lie');
});

/* The one that actually went wrong.
   ------------------------------------------------------------------
   notified_at was added as a nullable column, so every post that already existed
   read as never announced. The sweep that catches scheduled posts then worked
   through the whole history of the board, twenty at a time every five minutes,
   emailing a class about conversations months old. It burned through a month's
   sending allowance in a day.

   Two things hold it shut, and both matter. The backfill fixed the posts that
   existed. The window makes the shape of it impossible, so a future migration
   that clears the column, or an import that brings in old posts, cannot turn
   into a mass mailing. */
test('the sweep cannot reach back into history', () => {
  assert.match(notify, /const ANNOUNCE_WINDOW = "interval '24 hours'"/,
    'the sweep must have a horizon');
  const fn = notify.slice(notify.indexOf('export async function notifyPublishedPosts'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /t\.published_at > now\(\) - \$\{ANNOUNCE_WINDOW\}/,
    'a post that became visible long ago is history, not news');
  assert.match(body, /t\.published_at <= now\(\)/,
    'and one that has not appeared yet is not news either');
});

test('an unusual number of posts at once is said out loud', () => {
  /* Sending cannot be taken back, so a batch that looks wrong is worth a line in
     the log where somebody will see it rather than a quiet mass mailing. */
  const fn = notify.slice(notify.indexOf('export async function notifyPublishedPosts'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /due\.rowCount > 5/);
  assert.match(body, /console\.warn/);
});

test('the backfill claims the history rather than deleting it', () => {
  const migration = fs.readFileSync(
    new URL('../migrations/035_stop_announcing_history.sql', import.meta.url), 'utf8');
  assert.match(migration, /SET notified_at = COALESCE\(published_at, created_at\)/,
    'an old post should record the time it appeared, not the time we noticed');
  assert.match(migration, /WHERE notified_at IS NULL/);
  assert.doesNotMatch(migration, /DELETE FROM discussion_threads/,
    'nothing here is worth deleting a post over');
});

/* Who hears about what, as it was asked for.
   ------------------------------------------------------------------
   These rules are narrower than they were, and the narrowing was the whole
   point: the board was sending more than the allowance could carry, mostly by
   telling people about conversations they were not really in.

     a post from the teacher  → the class, and the other staff
     a post from a student    → the staff only
     a reply                  → whoever wrote the post, and any staff in it

   The case that used to cost the most is the one now missing: a student who
   left a comment on somebody else's thread was mailed about every later turn in
   it. Having said something once is not a subscription. */

test('the class hears from the teacher, and not from each other', () => {
  const post = notify.slice(notify.indexOf('export async function notifyNewPost'));
  const body = post.slice(0, post.indexOf('\n}\n'));
  assert.match(body, /thread\.author_role === 'admin' \? await classAudience\(thread\.class_id\) : \[\]/,
    'a student post must not go round the class');
  assert.match(body, /const staff = await staffAudience\(\)/,
    'and the staff hear about every post, whoever wrote it');
});

test('a reply reaches the person whose post it is', () => {
  const fn = notify.slice(notify.indexOf('async function conversationAudience('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /u\.id = \$1/, 'the author of the post, always');
});

test('a student who once commented is not subscribed to the thread', () => {
  const fn = notify.slice(notify.indexOf('async function conversationAudience('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  /* The commenter clause is now scoped to staff. Without that scoping this is
     an email to everybody who ever spoke on a busy thread, for every reply. */
  assert.match(body, /u\.role = 'admin' AND u\.id IN \(\s*\n?\s*SELECT author_id FROM discussion_posts/,
    'only staff are followed into a thread by having commented on it');
});

test('a teacher who answered a question hears when the student comes back', () => {
  const fn = notify.slice(notify.indexOf('async function conversationAudience('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /thread_id = \$2/);
  /* Deliberately not scoped to class_students: a teacher is not on that list
     and would otherwise never be told. */
  assert.doesNotMatch(body, /class_students/);
});

test('the staff are found by role, since a class has no owning teacher', () => {
  assert.match(notify, /async function staffAudience\(column = 'notify_board_posts'\)/);
  const fn = notify.slice(notify.indexOf('async function staffAudience('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /role='admin' AND active=true/);
  assert.match(body, /\$\{column\}=true/, 'and can still turn it off');
});
