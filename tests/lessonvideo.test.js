import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoSource, videoSource, fmtDuration, VIDEO_PROVIDERS } from '../src/lessonvideo.js';

/* People paste whole links, not ids, so every host takes either. */

test('YouTube links and bare ids both resolve', () => {
  for (const input of [
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://youtu.be/aqz-KE-bpKQ',
    'https://www.youtube.com/shorts/aqz-KE-bpKQ',
    'https://www.youtube.com/embed/aqz-KE-bpKQ',
    'https://www.youtube.com/watch?feature=share&v=aqz-KE-bpKQ',
    'aqz-KE-bpKQ',
  ]) {
    assert.deepEqual(parseVideoSource('youtube', input), { provider: 'youtube', ref: 'aqz-KE-bpKQ' }, input);
  }
});

test('Loom links and bare ids both resolve', () => {
  assert.deepEqual(parseVideoSource('loom', 'https://www.loom.com/share/abc123def456'),
    { provider: 'loom', ref: 'abc123def456' });
  assert.deepEqual(parseVideoSource('loom', 'abc123def456'), { provider: 'loom', ref: 'abc123def456' });
});

test('a Bunny embed link becomes library and video', () => {
  assert.deepEqual(
    parseVideoSource('bunny', 'https://iframe.mediadelivery.net/embed/12345/9f8e7d6c-1234-5678-9abc-def012345678'),
    { provider: 'bunny', ref: '12345/9f8e7d6c-1234-5678-9abc-def012345678' },
  );
  assert.deepEqual(parseVideoSource('bunny', '12345/9f8e7d6c-1234-5678-9abc-def012345678'),
    { provider: 'bunny', ref: '12345/9f8e7d6c-1234-5678-9abc-def012345678' });
});

test('a link for the wrong host is refused rather than half-accepted', () => {
  // Choosing Bunny and pasting a YouTube link is a mistake worth catching.
  assert.equal(parseVideoSource('bunny', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'), null);
  assert.equal(parseVideoSource('loom', 'https://example.com/video'), null);
  assert.equal(parseVideoSource('youtube', ''), null);
  assert.equal(parseVideoSource('nonsense', 'anything'), null);
});

test('a Zoom recording link is not a valid source for any host', () => {
  /* Zoom serves its playback pages with framing blocked and has no embed
     product, so a share link must not be quietly accepted and then render as an
     empty box. */
  const zoom = 'https://us02web.zoom.us/rec/share/abc123XYZ';
  for (const provider of VIDEO_PROVIDERS) {
    if (provider === 'mp4') continue; // mp4 takes any https address by design
    assert.equal(parseVideoSource(provider, zoom), null, `${provider} accepted a Zoom link`);
  }
});

test('an uploaded file is accepted as a path or an address', () => {
  assert.deepEqual(parseVideoSource('mp4', '/uploads/week-1.mp4'), { provider: 'mp4', ref: '/uploads/week-1.mp4' });
  assert.equal(parseVideoSource('mp4', 'week-1.mp4'), null);
});

test('the player is told what kind of thing it is rendering', () => {
  assert.deepEqual(videoSource({ video_provider: 'youtube', video_ref: 'abc123' }),
    { type: 'iframe', provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/abc123' });
  assert.deepEqual(videoSource({ video_provider: 'loom', video_ref: 'abc123def4' }),
    { type: 'iframe', provider: 'loom', src: 'https://www.loom.com/embed/abc123def4' });
  assert.equal(videoSource({ video_provider: 'mp4', video_ref: '/uploads/x.mp4' }).type, 'file');
  assert.match(videoSource({ video_provider: 'bunny', video_ref: '12/abc' }).src, /iframe\.mediadelivery\.net\/embed\/12\/abc/);
  // A lesson written before the class was taught has no recording, and that is
  // a normal state rather than an error.
  assert.equal(videoSource({ video_provider: null, video_ref: null }), null);
  assert.equal(videoSource(null), null);
});

test('durations read the way a contents list needs them', () => {
  assert.equal(fmtDuration(5400), '1h 30m');
  assert.equal(fmtDuration(540), '9m');
  assert.equal(fmtDuration(0), '');
  assert.equal(fmtDuration(null), '');
});
