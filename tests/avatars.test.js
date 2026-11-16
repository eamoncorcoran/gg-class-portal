import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Profile pictures on the board.
   ------------------------------------------------------------------
   A face is drawn forty pixels wide and was sent as the four megabyte
   photograph it was uploaded as, to be downloaded again every five minutes.
   Opening the community meant fetching every one of them whole. These pin the
   three things that stopped that: a small copy, a browser that keeps it, and a
   portal that still starts and still shows the picture if the copy cannot be
   made. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const avatars = read('../src/avatars.js');
const media = read('../src/routes/media.js');
const route = media.slice(media.indexOf("router.get('/avatar/:userId'"), media.indexOf('export function resolveStored'));

test('a face is sent as a small copy, not as the photograph', () => {
  assert.match(avatars, /export const AVATAR_PX = 320;/);
  assert.match(avatars, /\.rotate\(\)/, 'the way up a phone recorded is applied before it is thrown away');
  assert.match(avatars, /fit: 'outside', withoutEnlargement: true/, 'the whole picture, never stretched');
  assert.match(avatars, /\.webp\(\{ quality: 80 \}\)/);
  assert.match(route, /const small = await avatarThumb\(file, owner\.avatar_path\);/);
  assert.match(route, /res\.setHeader\('Content-Length', size\)/);
});

test('a browser keeps a face and is told when it already has it', () => {
  assert.match(route, /res\.setHeader\('ETag', version\)/);
  assert.match(route, /'private, max-age=86400, stale-while-revalidate=604800'/);
  assert.ok(!/max-age=300/.test(route), 'five minutes is what made every visit a fresh download');
  assert.match(route, /if \(held\.includes\(version\)\) return res\.status\(304\)\.end\(\);/);
  // Still only for somebody signed in, and never in a shared cache.
  assert.match(media, /router\.use\(requireAuth\);/);
  assert.ok(!/public, max-age/.test(route));
});

test('the image library can be missing or defeated and the picture still shows', () => {
  // Loaded on first use, inside a catch: it is never why the portal fails to start.
  assert.ok(!/^import .*sharp/m.test(avatars), 'not imported at the top of the file');
  assert.match(avatars, /import\('sharp'\)\.then\(\(module\) => module\.default\)\.catch\(/);
  assert.match(route, /const sending = small \|\| file;/, 'the original when there is no small copy');
  assert.match(avatars, /failed\.add\(out\);/, 'and a picture that will not shrink is not retried on every request');
});

test('a small copy goes when its photograph does', () => {
  assert.match(read('../src/routes/auth.js'), /await removeAvatarThumb\(current\.avatar_path\);/);
  assert.match(read('../src/routes/admin.js'), /await removeAvatarThumb\(student\.avatar_path\);/);
});
