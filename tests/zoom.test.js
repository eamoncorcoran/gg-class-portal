import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/* The webhook is the only route in the application with no session behind it,
   so its signature check is the whole of its security. These run against the
   real implementation with the secret set for the process. */
process.env.ZOOM_WEBHOOK_SECRET = 'test-webhook-secret';
const { verifyWebhook, urlValidationReply, pickFile } = await import('../src/zoom.js');

const sign = (timestamp, body, secret = 'test-webhook-secret') =>
  `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;

test('a correctly signed request is accepted', () => {
  const body = JSON.stringify({ event: 'recording.completed' });
  const timestamp = '1700000000';
  assert.equal(verifyWebhook({ signature: sign(timestamp, body), timestamp, rawBody: body }), true);
});

test('a request signed with the wrong secret is refused', () => {
  const body = JSON.stringify({ event: 'recording.completed' });
  const timestamp = '1700000000';
  assert.equal(
    verifyWebhook({ signature: sign(timestamp, body, 'not-the-secret'), timestamp, rawBody: body }),
    false,
  );
});

test('a body changed after signing is refused', () => {
  const timestamp = '1700000000';
  const signature = sign(timestamp, JSON.stringify({ event: 'recording.completed' }));
  // Same signature, different body: this is the attack the check exists for.
  assert.equal(
    verifyWebhook({ signature, timestamp, rawBody: JSON.stringify({ event: 'account.deleted' }) }),
    false,
  );
});

test('a replayed signature against a different timestamp is refused', () => {
  const body = JSON.stringify({ event: 'recording.completed' });
  const signature = sign('1700000000', body);
  assert.equal(verifyWebhook({ signature, timestamp: '1700009999', rawBody: body }), false);
});

test('missing pieces are refused rather than waved through', () => {
  const body = '{}';
  assert.equal(verifyWebhook({ signature: null, timestamp: '1', rawBody: body }), false);
  assert.equal(verifyWebhook({ signature: sign('1', body), timestamp: null, rawBody: body }), false);
  assert.equal(verifyWebhook({}), false);
});

test('the ownership challenge is answered with a signature Zoom can check', () => {
  const reply = urlValidationReply('abc123');
  assert.equal(reply.plainToken, 'abc123');
  assert.equal(
    reply.encryptedToken,
    crypto.createHmac('sha256', 'test-webhook-secret').update('abc123').digest('hex'),
  );
});

test('the screen-and-speaker recording is preferred over the other cuts', () => {
  /* Zoom returns several files per meeting: audio only, a chat transcript, a
     gallery-view cut. Picking the wrong one means importing an hour of nobody's
     face. */
  const files = [
    { file_type: 'M4A', recording_type: 'audio_only', id: 'audio' },
    { file_type: 'TRANSCRIPT', recording_type: 'audio_transcript', id: 'text' },
    { file_type: 'MP4', recording_type: 'gallery_view', id: 'gallery' },
    { file_type: 'MP4', recording_type: 'shared_screen_with_speaker_view', id: 'wanted' },
  ];
  assert.equal(pickFile(files).id, 'wanted');
});

test('when the preferred cut is absent another video is taken, but never an audio file', () => {
  assert.equal(pickFile([
    { file_type: 'M4A', recording_type: 'audio_only', id: 'audio' },
    { file_type: 'MP4', recording_type: 'gallery_view', id: 'gallery' },
  ]).id, 'gallery');
  assert.equal(pickFile([{ file_type: 'M4A', recording_type: 'audio_only', id: 'audio' }]), null);
  assert.equal(pickFile([]), null);
});
