/**
 * "Hear it" audio for a phrase.
 *
 * A dialect voice comes from abair.ie (the only synthesiser with Connemara,
 * Donegal and Kerry voices) when ABAIR_API_KEY is set; the standardised voice
 * is Azure's ga-IE Orla, on the same key the mic uses; OpenAI is the last
 * resort. A phrase is spoken the same way every time it is asked for, so it is
 * synthesised once per voice and kept on disk for as long as the portal has a
 * disk. Saving a lesson renders its phrases in the background, so the first
 * student to open it is not the one who pays for the synthesis.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

export const VOICES = Object.freeze([
  { id: '', name: 'Standardised', sample: 'Conas atá tú?' },
  { id: 'sibeal', name: 'Connemara', sample: 'Cén chaoi a bhfuil tú?' },
  { id: 'donall', name: 'Donegal', sample: 'Cad é mar atá tú?' },
  { id: 'fianait', name: 'Kerry', sample: 'Conas atá tú?' },
]);

const azureKey = process.env.AZURE_SPEECH_KEY || '';
const azureRegion = process.env.AZURE_SPEECH_REGION || 'germanywestcentral';

const TTS_DIR = path.join(config.privateUploadDir, 'live-tts');
fs.mkdirSync(TTS_DIR, { recursive: true });
const memory = new Map();

const fileFor = (voice, text) =>
  path.join(TTS_DIR, crypto.createHash('sha1').update(`${voice}|${text}`).digest('hex') + '.mp3');

function fromDisk(voice, text) {
  try { return fs.readFileSync(fileFor(voice, text)); } catch { return null; }
}
function toDisk(voice, text, buf) {
  try {
    const target = fileFor(voice, text);
    fs.writeFileSync(target + '.part', buf);
    fs.renameSync(target + '.part', target);
  } catch (error) { console.error('live tts cache write failed', error?.message); }
}

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
// The same duit→dhuit pronunciation tweak the HeyRua app applies.
const spoken = (text) => text.replaceAll('duit', 'dhuit').replaceAll('Duit', 'Dhuit');

async function azureOrla(text) {
  if (!azureKey) return null;
  const ssml = `<speak version='1.0' xml:lang='ga-IE'><voice name='ga-IE-OrlaNeural'>${escapeXml(spoken(text))}</voice></speak>`;
  const r = await fetch(`https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': azureKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
      'User-Agent': 'GaeilgeoirLive',
    },
    body: ssml,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) { console.error('azure tts', r.status, (await r.text()).slice(0, 200)); return null; }
  return Buffer.from(await r.arrayBuffer());
}

/* abair.ie hands out short-lived tokens and allows only so many alive per
   key at once. One token, kept until it is about to expire, is the whole
   budget; minting one per clip locked the key out within minutes. */
let abairToken = { token: '', expiresAt: 0, minting: null };
async function abairAuth(key, { fresh = false } = {}) {
  if (!fresh && abairToken.token && Date.now() < abairToken.expiresAt - 30000) return abairToken.token;
  if (abairToken.minting) return abairToken.minting;
  abairToken.minting = (async () => {
    try {
      const r = await fetch('https://api.abair.ie/v4/tokens', { method: 'POST', headers: { 'abair-api-key': key }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { console.error('abair token', r.status, (await r.text().catch(() => '')).slice(0, 160)); return null; }
      const j = await r.json();
      abairToken.token = j.token || '';
      abairToken.expiresAt = Date.now() + (Number(j.expiresIn) || 900) * 1000;
      return abairToken.token || null;
    } finally { abairToken.minting = null; }
  })();
  return abairToken.minting;
}
async function abair(text, voice) {
  const key = process.env.ABAIR_API_KEY;
  if (!key || !voice) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await abairAuth(key, { fresh: attempt > 0 });
    if (!token) return null;
    const r = await fetch('https://api.abair.ie/v4/synthesis?outputType=JSON&audioEncoding=MP3&timing=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'abair-api-key': token },
      body: JSON.stringify({ input: spoken(text), voice, speed: 1.0 }),
      signal: AbortSignal.timeout(30000),
    });
    // A token abair no longer honours: mint once more, then give up.
    if (r.status === 401 && attempt === 0) { abairToken.token = ''; continue; }
    if (!r.ok) { console.error('abair tts', r.status, (await r.text().catch(() => '')).slice(0, 160)); return null; }
    const j = await r.json();
    return j.audioContent ? Buffer.from(j.audioContent, 'base64') : null;
  }
  return null;
}

async function openai(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts', voice: 'alloy', input: text, response_format: 'mp3',
      instructions: 'You are a native Irish (Gaeilge) speaker from Connacht. Pronounce the text with clear, natural, native Irish pronunciation at a learner-friendly, slightly slow pace.',
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

export function knownVoice(voice) {
  return VOICES.some((v) => v.id === voice);
}

export async function ttsFor(rawText, voice = '') {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const key = `${voice}|${text}`;
  if (memory.has(key)) return memory.get(key);
  let buf = fromDisk(voice, text);
  /* A dialect asked for before abair.ie is set up falls back to the standard
     voice, and that must not be remembered as the dialect: the clip goes on
     disk under the voice that actually spoke it, so the day the key arrives
     the dialects start speaking without anything to clear out. */
  let spokeAs = voice;
  if (!buf) {
    if (voice) { try { buf = await abair(text, voice); } catch (e) { console.error('abair tts failed', e?.message); } }
    if (!buf) { spokeAs = ''; buf = fromDisk('', text); }
    if (!buf) { try { buf = await azureOrla(text); } catch (e) { console.error('azure tts failed', e?.message); } }
    if (!buf) { try { buf = await openai(text); } catch (e) { console.error('openai tts failed', e?.message); } }
    if (buf) toDisk(spokeAs, text, buf);
  }
  if (buf && spokeAs === voice) {
    memory.set(key, buf);
    if (memory.size > 200) memory.delete(memory.keys().next().value);
  }
  return buf;
}

/* One phrase after another, one voice after another, so a lesson with sixty
   phrases does not fire two hundred requests at abair.ie in the same second. */
let queue = Promise.resolve();
export function prerender(lesson) {
  const jobs = [];
  for (const p of lesson.phrases || []) for (const v of VOICES) jobs.push([v.id, String(p.irish || '').trim()]);
  queue = queue.then(async () => {
    let made = 0;
    for (const [voice, text] of jobs) {
      if (!text || fromDisk(voice, text)) continue;
      // Nothing to render a dialect with: skip rather than file the standard voice under it.
      if (voice && !process.env.ABAIR_API_KEY) continue;
      try { if (await ttsFor(text, voice)) made += 1; } catch { /* the next one may still work */ }
    }
    if (made) console.log(`live tts: rendered ${made} phrase clip(s) for "${lesson.title}"`);
  }).catch(() => {});
  return queue;
}
