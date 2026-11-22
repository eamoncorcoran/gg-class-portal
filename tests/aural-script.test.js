import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PQ_PREFIXES, isPastQuestionsPath } from '../src/pqproxy.js';

/* The listening script under the recording.
   ------------------------------------------------------------------
   The script files live on the past-questions service, so the portal must
   forward /aural/ like it forwards the recordings themselves, and the service
   must answer from its bundled copy when its disk has none. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the script files are forwarded to the past-questions service like the recordings', () => {
  assert.ok(PQ_PREFIXES.includes('/aural/'));
  assert.ok(isPastQuestionsPath('/aural/2024_A.json'));
  assert.match(read('../pq/server.py'), /clean\.startswith\('\/aural\/'\)/, 'the service falls back to the copy shipped with its code');
});

test('the panel follows the recording and opens a word the way HeyRua does', () => {
  const panel = read('../web/src/components/app/aural-script.tsx');
  assert.match(panel, /scriptUrlFor = \(audioSrc: string\) => audioSrc\.replace\(\/\^\\\/\?aud\\\/\/, "\/aural\/"\)/);
  assert.match(panel, /requestAnimationFrame\(tick\)/, 'the lit word is read every frame while the recording plays');
  assert.match(panel, /<Label>Meaning<\/Label>/);
  assert.match(panel, /<Label>In this sentence<\/Label>/);
  assert.doesNotMatch(panel, /—/, 'no em dashes');
  const card = read('../web/src/components/app/question-card.tsx');
  assert.match(card, /<AuralScript src=\{props\.src\} audioRef=\{audio\} \/>/, 'mounted under every listening player');
});
