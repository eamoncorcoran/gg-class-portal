import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/* Signed playback is what makes a recording private rather than merely
   unlisted: a link forwarded outside the class has to be refused, not just hard
   to guess. */
process.env.BUNNY_LIBRARY_ID = '12345';
process.env.BUNNY_API_KEY = 'library-key';
process.env.BUNNY_TOKEN_KEY = 'token-key';
process.env.BUNNY_TOKEN_HOURS = '6';
const { embedUrl, bunnyConfigured, bunnySigning } = await import('../src/bunny.js');

test('configuration is reported honestly', () => {
  assert.equal(bunnyConfigured(), true);
  assert.equal(bunnySigning(), true);
});

test('a playback URL carries a signature and an expiry', () => {
  const url = new URL(embedUrl('video-guid-1'));
  assert.equal(url.origin + url.pathname, 'https://iframe.mediadelivery.net/embed/12345/video-guid-1');

  const expires = Number(url.searchParams.get('expires'));
  const token = url.searchParams.get('token');
  assert.ok(token, 'no token on the playback URL');

  // The signature has to be one Bunny will recompute and agree with.
  const expected = crypto.createHash('sha256').update(`token-key${'video-guid-1'}${expires}`).digest('hex');
  assert.equal(token, expected);

  // Six hours out: longer than any class recording, so nobody is cut off
  // two thirds of the way through.
  const hours = (expires - Math.floor(Date.now() / 1000)) / 3600;
  assert.ok(hours > 5.9 && hours < 6.1, `expiry was ${hours} hours away`);
});

test('two viewers do not share one address', () => {
  /* Not a cryptographic guarantee — same second, same token — but the URL is
     minted per request rather than stored, which is the property that matters:
     nothing in the database is a working playback link. */
  const a = embedUrl('video-a');
  const b = embedUrl('video-b');
  assert.notEqual(a, b);
});

test('a library id can be overridden per lesson', () => {
  // A lesson stores library/video, so an older recording in a different library
  // still resolves.
  assert.match(embedUrl('vid', { libraryId: '999' }), /\/embed\/999\/vid\?/);
});

/* 19 November 2026: students opened a class recording to a black rectangle.
   The signed address had been written without the two settings the plain one
   always carried, so the player tried to start itself, was refused by the
   browser, and sat with its preview gone and nothing playing. */
test('a recording waits to be played, signed or not', async () => {
  const signed = new URL(embedUrl('video-guid-1'));
  assert.equal(signed.searchParams.get('autoplay'), 'false');
  assert.equal(signed.searchParams.get('preload'), 'false');
  assert.ok(signed.searchParams.get('token'), 'still signed');
  // The token signs the video and the expiry only, so the extra settings do not disturb it.
  const expected = crypto.createHash('sha256').update(`token-key${'video-guid-1'}${signed.searchParams.get('expires')}`).digest('hex');
  assert.equal(signed.searchParams.get('token'), expected);

  // Every address the course hands out comes from embedUrl or carries the settings itself.
  const fs = await import('node:fs');
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const source = read('../src/bunny.js');
  assert.match(source, /if \(!bunnySigning\(\)\) return `\$\{EMBED\}\/\$\{libraryId\}\/\$\{videoId\}\?\$\{WAIT_TO_BE_PLAYED\}`;/);
  for (const file of ['../src/routes/hub.js', '../src/lessonvideo.js']) {
    const text = read(file);
    for (const line of text.split('\n').filter((l) => l.includes('iframe.mediadelivery.net/embed/') && l.includes('`'))) {
      assert.match(line, /autoplay=false&preload=false/, `${file} builds a player address that would start itself: ${line.trim()}`);
    }
  }
});
