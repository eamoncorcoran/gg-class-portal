import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Editing a comment on the board.
   ------------------------------------------------------------------
   Removing was the only thing that could be done to a comment, so a typo and a
   problem were the same category of event. What matters about the repair is
   that it leaves a mark: a teacher may edit a comment somebody else wrote, and
   without a mark the board would show a student saying words they did not
   write, with nothing to indicate otherwise. */

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const community = fs.readFileSync(new URL('../src/community.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('a comment can be edited', () => {
  assert.match(admin, /router\.patch\('\/community\/post\/:id'/,
    'there must be a route that edits a comment');
});

test('an edit is recorded as an edit', () => {
  const route = admin.slice(admin.indexOf("router.patch('/community/post/:id'"));
  const body = route.slice(0, route.indexOf('\n}));'));
  assert.match(body, /edited_at=now\(\)/, 'the edit has to be stamped');
  assert.match(body, /edited_by=\$2/, 'and attributed, since it may not be the author');
  assert.match(body, /audit\(/, 'and recorded in the log like every other change');
});

test('an empty comment cannot be saved over a real one', () => {
  const route = admin.slice(admin.indexOf("router.patch('/community/post/:id'"));
  const body = route.slice(0, route.indexOf('\n}));'));
  assert.match(body, /z\.string\(\)\.trim\(\)\.min\(1\)/,
    'whitespace must not be accepted as a comment');
});

/* The whole point. If the mark is not carried to the board and shown, the edit
   is silent, and a silent edit of somebody else's words is the thing to avoid. */
test('the mark reaches the board and is shown', () => {
  assert.match(community, /p\.edited_at/,
    'the board query has to return whether a comment was edited');
  assert.match(app, /comment\.edited_at \? ' · edited' : ''/,
    'and the comment has to say so on screen');
});

test('a removed comment offers restoring rather than editing', () => {
  /* Editing something that is hidden would be writing into a void: nobody can
     read it, and the button beside it is the one that brings it back. */
  assert.match(app, /admin && !removed \? `<button class="cmt-remove" data-edit-comment=/,
    'Edit must not be offered on a comment that has been removed');
});
