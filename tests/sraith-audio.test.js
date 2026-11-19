import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Listening to the Sraith Pictiúr.
   ------------------------------------------------------------------
   The Sraith page students reach from the menu (Past questions, Oral, Sraith
   Pictiúr) showed each picture and its sentences and nothing to listen to. The
   audio had only ever been on an older Sraith page that the menu does not lead
   to. Every sentence can now be played, in Azure's Irish voice and no other,
   from a clip that is made once and kept. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const service = read('../pq/server.py');
const page = read('../web/src/pages/oral-pages.tsx');

test('every sentence of a Sraith has a listen button, and a picture can be played through', () => {
  const sraith = page.slice(page.indexOf('export const SraithPage'));
  assert.match(sraith, /<Listen on=\{here && !player\.state\.loading\} loading=\{here && player\.state\.loading\} onPress=\{press\}/);
  assert.match(sraith, /player\.play\(b\.sentences\.map\(\(x, i\) => \(\{ key: `b\$\{b\.n\}-\$\{i\}`, audio: clipOf\(s\.slug, b\.n, i, x\.ga\) \}\)\), `b\$\{b\.n\}`\)/);
  assert.match(sraith, /clipOf\(s\.slug, "end", i, x\.ga\)/, 'the ending too');
  // One player for the page, the one the course-book Sraith already used.
  assert.match(page, /import \{ usePlayer \} from "\.\/student\/sraith-page";/);
});

test('a clip is asked for by where the sentence is, so only Sraith sentences can be spoken', () => {
  assert.match(page, /`\/oral\/sp\/audio\/\$\{encodeURIComponent\(slug\)\}\/\$\{box\}-\$\{i\}\.mp3\?v=\$\{mark\(ga\)\}`/);
  assert.match(service, /SRAITH_CLIP = re\.compile\(r'\^\/oral\/sp\/audio\/\(\[a-z0-9-\]\{1,80\}\)\/\(\\d\{1,2\}\|end\)-\(\\d\{1,2\}\)\\\.mp3\$'\)/);
  // Looked up in the Sraith content; text from the request is never spoken.
  const clip = service.slice(service.indexOf('def sraith_clip'), service.indexOf('def serve_range'));
  assert.match(clip, /text = sraith_sentence\(slug, box, index\)\s+if not text:\s+return self\.json_out\(404/);
  // Behind the same check as everything else the service holds.
  const get = service.slice(service.indexOf('    def do_GET(self):'), service.indexOf('    def do_HEAD(self):'));
  assert.ok(get.indexOf('if not self.allowed():') < get.indexOf('SRAITH_CLIP.match'));
  // And the portal passes this address through to the service, behind its own sign-in wall.
  assert.match(read('../src/pqproxy.js'), /'\/oral\/sp\/'/);
});

test('the voice is Azure\'s Irish voice and nothing else', () => {
  const speak = service.slice(service.indexOf('def speak(text, lang):'), service.indexOf('# ---------------- the Sraith'));
  assert.match(service, /VOICES = \{'ga': 'ga-IE-OrlaNeural'/);
  assert.match(speak, /tts\.speech\.microsoft\.com/);
  assert.ok(!/openai|abair|elevenlabs/i.test(speak), 'no other voice is fallen back to');
  const clip = service.slice(service.indexOf('def sraith_clip'), service.indexOf('def serve_range'));
  assert.match(clip, /status, f = speak\(text, 'ga'\)/);
  assert.match(clip, /return self\.json_out\(503/, 'no audio is the answer when Azure cannot be reached');
  // The page uses the clip or nothing: it does not fall back to the browser's own voice.
  const sraith = page.slice(page.indexOf('const clipOf'), page.indexOf('export const SraithPage'));
  assert.ok(!/speechSynthesis/.test(sraith));
});

test('a clip is made once and kept, and all of them are made ahead of time', () => {
  const speak = service.slice(service.indexOf('def speak(text, lang):'), service.indexOf('# ---------------- the Sraith'));
  // On disk already: answered from the file, before any key is even looked for.
  assert.ok(speak.indexOf('if os.path.exists(f):') < speak.indexOf('speech_keys()'));
  assert.match(service, /threading\.Thread\(target=warm_sraith_audio, daemon=True\)\.start\(\)/);
  const warm = service.slice(service.indexOf('def warm_sraith_audio'), service.indexOf("DIST = os.environ.get('DIST_DIR')"));
  assert.match(warm, /for text in todo:/);
  assert.match(warm, /for attempt in range\(4\):/, 'a refusal is waited out and tried again');
  // The browser keeps a clip too, and the address changes if the sentence is reworded.
  const clip = service.slice(service.indexOf('def sraith_clip'), service.indexOf('def serve_range'));
  assert.match(clip, /'Cache-Control', 'private, max-age=31536000, immutable'/);
  assert.match(clip, /self\.send_response\(206\)/, 'ranges, which an iPhone asks for before it plays anything');
});
