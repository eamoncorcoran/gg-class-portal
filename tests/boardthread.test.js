import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Replying to a comment rather than to the room.
   ------------------------------------------------------------------
   One level of indent, decided in the database rather than the drawing: a reply
   to a reply hangs off the comment that began the exchange. Anything deeper
   would build a shape the screen has no way to render, and a client is not the
   place to enforce that. */

const community = fs.readFileSync(new URL('../src/community.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('a reply to a reply joins the same exchange', () => {
  const fn = community.slice(community.indexOf('export async function createPost('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /parent \? \(parent\.parent_id \|\| parent\.id\) : null/,
    'a reply must attach to the comment that began the exchange, not to another reply');
  assert.match(body, /parent\.thread_id !== threadId/,
    'a comment from another post must not be answerable from this one');
});

test('the comments come back knowing their parent', () => {
  assert.match(community, /p\.parent_id, \$\{AUTHOR\} author/,
    'without the parent there is no way to draw the shape');
});

test('a comment whose parent has gone is still shown', () => {
  const fn = app.slice(app.indexOf('function commentTree('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /ids\.has\(comment\.parent_id\) \? comment\.parent_id : null/,
    'a reply whose parent was cleared out must appear at the top rather than vanish');
});

test('the reply box opens under the comment it answers', () => {
  /* After forty comments a box at the foot of the page has no visible
     connection to the one somebody meant to answer. */
  assert.match(app, /function openInlineReply\(thread, parentId\)/);
  assert.match(app, /data-reply-slot="\$\{comment\.id\}"/, 'each comment needs its own place to put one');
  assert.match(app, /modalRoot\.querySelectorAll\('\[data-reply-slot\]'\)\.forEach\(\(other\) => \{ other\.innerHTML = ''; \}\)/,
    'only one may be open, or which one is being answered is a guess');
});

test('the post and its conversation are read in the middle of the screen', () => {
  const fn = app.slice(app.indexOf('function renderThreadDrawer()'));
  const body = fn.slice(0, fn.indexOf('\n  });\n}'));
  assert.match(body, /modal\(\{\s*\n\s*wide: true,\s*\n\s*bare: true,/,
    'a post and its comments take the middle, not a column narrower than the feed');
  assert.doesNotMatch(body, /openDrawer\(/, 'the side drawer is gone');
});

test('liking something takes one press', () => {
  const fn = app.slice(app.indexOf('function reactionRow('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /data-emoji="\$\{LIKE_EMOJI\}"/,
    'the like must act directly rather than opening the picker');
  assert.match(body, /const others = rows\.filter\(\(row\) => row\.emoji !== LIKE_EMOJI\)/,
    'and must not also appear as one of the other chips');
  assert.match(app, /const LIKE_EMOJI = '👍'/);
});
