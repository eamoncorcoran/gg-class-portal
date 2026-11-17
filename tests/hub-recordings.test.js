import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* A class recording in Courses.
   ------------------------------------------------------------------
   The Bunny library has token authentication switched on. The hub's export
   handed the React front end the plain embed address, which Bunny refuses: the
   recording of 16 November 2026 uploaded without a fault and then showed
   nothing but "403" where the player should be. The old interface signed its
   addresses all along; the export has to as well. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const hub = read('../src/routes/hub.js');

test('a recording in the hub export is given a signed address, to somebody signed in', () => {
  assert.match(hub, /import \{ bunnySigning, embedUrl as bunnyEmbedUrl \} from '\.\.\/bunny\.js';/);
  assert.match(hub, /if \(signedIn && bunnySigning\(\) && library && video\) \{\s+return \{ type: 'iframe', src: bunnyEmbedUrl\(video, \{ libraryId: library \}\) \};/);
  assert.match(hub, /if \(provider === 'bunny'\) return bunnyVideo\(ref, signedIn\);/);
  assert.match(hub, /video: videoOf\(l, liveById, \{ signedIn \}\),/, 'the export tells videoOf who is asking');
});

test('a visitor is never handed a signed address', () => {
  const fn = hub.slice(hub.indexOf('function bunnyVideo'), hub.indexOf('/* The front end\'s video description'));
  const signed = fn.indexOf('bunnyEmbedUrl(');
  const guard = fn.indexOf('if (signedIn && bunnySigning()');
  assert.ok(guard > -1 && signed > guard, 'signing sits behind the signed-in check');
  assert.equal((fn.match(/bunnyEmbedUrl\(/g) || []).length, 1);
});

test('a page left open past the expiry asks for a fresh address rather than show 403', () => {
  const page = read('../web/src/pages/courses-pages.tsx');
  assert.match(page, /if \(expires && expires \* 1000 < Date\.now\(\) \+ 60_000\) refreshHub\(\);/);
  assert.match(read('../web/src/lib/hub.ts'), /export const refreshHub = \(\) =>/);
});
