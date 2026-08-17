import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVideoLinks, embedUrl } from '../src/videolinks.js';

test('a YouTube link in the body becomes a player and leaves the text', () => {
  const result = extractVideoLinks('Watch this before Monday https://www.youtube.com/watch?v=dQw4w9WgXcQ thanks');
  assert.deepEqual(result.attachments, [
    { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  ]);
  assert.equal(result.body, 'Watch this before Monday thanks');
});

test('every YouTube shape people actually paste is recognised', () => {
  const shapes = [
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
  ];
  for (const url of shapes) {
    const result = extractVideoLinks(`before ${url} after`);
    assert.equal(result.attachments.length, 1, `not recognised: ${url}`);
    assert.equal(result.attachments[0].kind, 'youtube', url);
  }
});

test('Loom share links still work', () => {
  const result = extractVideoLinks('Here it is https://www.loom.com/share/abc123def456 have a look');
  assert.deepEqual(result.attachments, [{ kind: 'loom', url: 'https://www.loom.com/share/abc123def456' }]);
  assert.equal(result.body, 'Here it is have a look');
});

test('the same video pasted twice becomes one player', () => {
  const url = 'https://youtu.be/dQw4w9WgXcQ';
  const result = extractVideoLinks(`${url} and again ${url}`);
  assert.equal(result.attachments.length, 1);
});

test('a post is not a playlist', () => {
  const body = [
    'https://youtu.be/aaaaaaaaaaa',
    'https://youtu.be/bbbbbbbbbbb',
    'https://youtu.be/ccccccccccc',
    'https://youtu.be/ddddddddddd',
  ].join(' ');
  assert.equal(extractVideoLinks(body).attachments.length, 3);
});

test('anything that is not one of the two is left alone', () => {
  const body = 'My notes are at https://example.com/notes and https://vimeo.com/12345';
  const result = extractVideoLinks(body);
  assert.deepEqual(result.attachments, []);
  // The text is untouched, so an ordinary link stays a readable link.
  assert.equal(result.body, body);
});

test('a body that is nothing but a link comes back empty rather than blank-ish', () => {
  const result = extractVideoLinks('   https://youtu.be/dQw4w9WgXcQ   ');
  assert.equal(result.body, '');
  assert.equal(result.attachments.length, 1);
});

test('embeds point at the privacy-preserving host', () => {
  assert.equal(embedUrl('youtube', 'abc123'), 'https://www.youtube-nocookie.com/embed/abc123');
  assert.equal(embedUrl('loom', 'abc123'), 'https://www.loom.com/embed/abc123');
  assert.equal(embedUrl('gif', 'abc123'), null);
});
