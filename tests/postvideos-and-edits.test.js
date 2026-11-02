import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

/* Videos uploaded straight into a post, and editing a post after it is up.

   The video never passes through the portal: the browser sends it to Bunny over
   TUS with a signature the server makes for that one video. So the signature has
   to be exactly what Bunny checks, the key must never reach the browser, and the
   player address has to be made per reader rather than stored. An edit must say
   it was an edit, and must not be able to pull another post's file in. */

process.env.BUNNY_LIBRARY_ID = '777';
process.env.BUNNY_API_KEY = 'library-key';
process.env.BUNNY_TOKEN_KEY = 'token-key';
const { uploadTicket, TUS_ENDPOINT } = await import('../src/bunny.js');
const { planAttachmentEdit, withPlayableVideos } = await import('../src/community.js');

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/056_post_videos_and_edits.sql', import.meta.url), 'utf8');

test('the upload signature is the one Bunny checks', () => {
  const ticket = uploadTicket('0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0');
  const expected = crypto.createHash('sha256')
    .update(`777library-key${ticket.expires}0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0`).digest('hex');
  assert.equal(ticket.signature, expected);
  assert.equal(ticket.endpoint, TUS_ENDPOINT);
  assert.equal(ticket.libraryId, '777');
  // Bunny wants at least an hour; a day covers a slow phone upload.
  assert.ok(ticket.expires - Date.now() / 1000 >= 3600);
});

test('the ticket never carries the library key', () => {
  const ticket = uploadTicket('0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0');
  assert.ok(!JSON.stringify(ticket).includes('library-key'));
  assert.ok(!JSON.stringify(ticket).includes('token-key'));
});

test('a stored video becomes a signed player address for each reader', () => {
  const thread = withPlayableVideos({
    id: 't1',
    attachments: [
      { id: 'a1', kind: 'bunny', url: 'bunny:0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0' },
      { id: 'a2', kind: 'youtube', url: 'https://youtu.be/abcdefg' },
    ],
  });
  const url = new URL(thread.attachments[0].url);
  assert.equal(url.origin + url.pathname, 'https://iframe.mediadelivery.net/embed/777/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0');
  assert.ok(url.searchParams.get('token') && url.searchParams.get('expires'));
  assert.equal(thread.attachments[1].url, 'https://youtu.be/abcdefg', 'other attachments are left alone');
});

test('a malformed stored video id plays nothing rather than something', () => {
  const thread = withPlayableVideos({ attachments: [{ kind: 'bunny', url: 'bunny:../../other' }] });
  assert.equal(thread.attachments[0].url, '');
});

test('an edit keeps, reorders, adds and removes attachments, and ignores ids from elsewhere', () => {
  const plan = planAttachmentEdit(
    [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
    [{ id: 'z' }, { kind: 'bunny', url: 'bunny:0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0' }, { id: 'x' }, { id: 'someone-elses' }],
  );
  assert.deepEqual(plan.keep, ['z', 'x']);
  assert.deepEqual(plan.drop, ['y']);
  assert.equal(plan.add.length, 1);
});

test('the post edit route exists, is stamped, attributed and logged, and emails nobody', () => {
  const start = admin.indexOf("router.patch('/community/thread/:id/content'");
  assert.ok(start > 0, 'there must be a route that edits a post');
  const route = admin.slice(start, admin.indexOf('\n}));', start));
  assert.match(route, /editThread\(/);
  assert.match(route, /editorId: req\.user\.id/);
  assert.match(route, /audit\(/);
  assert.doesNotMatch(route, /notifyNewPost/, 'an edit is not a second announcement');
});

test('only an admin can reserve a video, and only with Bunny set up', () => {
  const start = admin.indexOf("router.post('/community/videos'");
  assert.ok(start > admin.indexOf('router.use(requireAdmin)'), 'the route sits behind the admin check');
  const route = admin.slice(start, admin.indexOf('\n}));', start));
  assert.match(route, /bunnyConfigured\(\)/);
  assert.match(route, /uploadTicket\(/);
});

test('the page may talk to Bunny and play its player, and nothing wider', () => {
  assert.match(server, /'https:\/\/video\.bunnycdn\.com'/);
  assert.match(server, /'https:\/\/iframe\.mediadelivery\.net'/);
});

test('the composer waits for an upload to finish before posting', () => {
  const submit = app.slice(app.indexOf('async function submitComposer()'));
  assert.match(submit.slice(0, 600), /Wait for the upload to finish/);
});

test('an edited post says so on the board', () => {
  assert.match(app, /thread\.edited_at \? ' · edited' : ''/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS edited_at/);
  assert.match(migration, /'bunny'/);
});
