/**
 * Reading Irish aloud.
 *
 * ABAIR, from the Phonetics and Speech Laboratory in Trinity, is the only
 * synthesiser that speaks Irish in its dialects rather than in an approximation
 * of one. That is the whole point of the exercise here: a student from Donegal
 * should be able to hear the story in Donegal Irish, and a student sitting the
 * exam with a Munster teacher should be able to hear it in Munster.
 *
 * The provider sits behind one function so it can be changed without touching
 * anything else. Today there are two: `abair`, which needs a key, and `none`,
 * which refuses politely and is what runs on a machine that has no key. The
 * second exists so the rest of the feature can be built, tested and used
 * without waiting on anybody's API key.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

/* What a student is offered. The label is what they see; the voice is what
   ABAIR is asked for, and is filled in from its own voice list at render time
   rather than hard-coded, because which voices exist is theirs to decide. */
export const DIALECTS = Object.freeze([
  { key: 'connacht', label: 'Connacht', hint: 'Conamara and Ráth Chairn' },
  { key: 'munster', label: 'Munster', hint: 'Corca Dhuibhne and Múscraí' },
  { key: 'ulster', label: 'Ulster', hint: 'Tír Chonaill' },
  /* For a recording that is not in any one dialect: an exam tape, a newsreader,
     the Caighdeán as it is read out in a classroom. Synthesis has no voice for
     it, so it is only ever an upload. */
  { key: 'standard', label: 'Standard', hint: 'An Caighdeán, no particular dialect' },
]);

export const DIALECT_KEYS = DIALECTS.map((item) => item.key);

/* ABAIR's voice ids carry their dialect in the name: ga_UL_anb_nemo is Ulster,
   ga_CO_snc_nemo Connacht, ga_MU_nnc_nemo Munster. Matching on the segment
   rather than the whole id means a voice being retired and replaced does not
   need a code change. */
const DIALECT_CODES = { ulster: 'UL', connacht: 'CO', munster: 'MU' };

/* Which dialects a synthesiser can be asked for. Standard is not one of them:
   ABAIR has no neutral voice, and picking a dialect voice and calling it
   standard would be a lie told to a student learning to tell them apart. */
export const SYNTHESISABLE = Object.freeze(['connacht', 'munster', 'ulster']);

/* What a browser may hand up as a recording. Deliberately the same set the
   voice notes accept, because it is the same question: what can be played back
   without converting it. */
export const AUDIO_UPLOAD_MB = 60;

export function providerName() {
  return process.env.TTS_PROVIDER || (process.env.ABAIR_API_KEY ? 'abair' : 'none');
}

/* A stand-in for a machine with no ABAIR key.
   ------------------------------------------------------------------
   macOS will read text aloud from the command line, and it has an Irish English
   voice among others. It does not speak Irish: a Connemara story read by Moira
   sounds like a Dubliner doing their best. It exists so the rest of this can be
   tested end to end without waiting on anybody's API key, and it says so on the
   screen rather than quietly pretending to be the real thing.

   Never reached in production, where TTS_PROVIDER is unset and the absence of a
   key means the honest refusal above. */
export function isStandIn() {
  return providerName() === 'say';
}

const SAY_VOICES = { connacht: 'Moira', munster: 'Karen', ulster: 'Daniel' };

async function synthesiseWithSay({ text, dialect }) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const os = await import('node:os');

  const voice = SAY_VOICES[dialect] || 'Moira';
  /* WAV at sixteen bit, which is the pairing `say` actually writes: asked for
     thirty two bit floats it exits zero, prints "Opening output file failed" and
     leaves an empty file behind, so the failure arrives as a player with
     nothing in it rather than as an error. */
  const scratch = path.join(os.tmpdir(), `gg-say-${crypto.randomUUID()}.wav`);
  await run('say', ['-v', voice, '--data-format=LEI16@22050', '-o', scratch, text]);
  const buffer = await fs.readFile(scratch);
  await fs.unlink(scratch).catch(() => {});
  if (!buffer.length) {
    throw Object.assign(new Error(`The stand-in voice wrote nothing for ${dialect}.`), { status: 502 });
  }
  return { buffer, mime: 'audio/wav', voice: `${voice} (stand-in, not Irish)` };
}

export function ttsConfigured() {
  return providerName() !== 'none';
}

/** Where a rendering lives. Private: it is course material, not public media. */
export function audioDir() {
  return path.join(config.privateUploadDir, 'listening');
}

/* The text a rendering was made from, so a story edited afterwards can be told
   apart from one that has not moved. */
export function hashText(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 32);
}

/**
 * Pick ABAIR's voice for a dialect.
 *
 * Asked of ABAIR rather than assumed, and cached for the life of the process:
 * the list changes about once a year and a lookup per sentence would be rude.
 */
let voiceCache = null;
async function abairVoices() {
  if (voiceCache) return voiceCache;
  const response = await fetch('https://api.abair.ie/v4/synthesis/voices', {
    headers: { Authorization: `Bearer ${process.env.ABAIR_API_KEY}` },
  });
  if (!response.ok) {
    throw Object.assign(new Error(`ABAIR refused the voice list (${response.status}).`), { status: 502 });
  }
  voiceCache = await response.json();
  return voiceCache;
}

function pickVoice(voices, dialect) {
  const code = DIALECT_CODES[dialect];
  const list = Array.isArray(voices) ? voices : (voices?.voices || []);
  const named = list.find((voice) => {
    const id = String(voice?.name || voice?.id || voice);
    return code && id.split('_').includes(code);
  });
  return named ? String(named.name || named.id || named) : null;
}

/**
 * Render one story in one dialect.
 *
 * Returns the bytes and the voice used. Long stories are sent whole: ABAIR
 * takes paragraphs, and splitting them would put a seam in the middle of a
 * sentence where a comprehension question might be listening for it.
 */
async function synthesiseWithAbair({ text, dialect }) {
  const voices = await abairVoices();
  const voice = pickVoice(voices, dialect);
  if (!voice) {
    throw Object.assign(new Error(`ABAIR has no voice for ${dialect} at the moment.`), { status: 502 });
  }

  const response = await fetch('https://api.abair.ie/v4/synthesis/synthesise', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ABAIR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, voice, outputType: 'MP3' }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error(`ABAIR could not read that out (${response.status}). ${detail.slice(0, 200)}`), { status: 502 });
  }

  const type = response.headers.get('content-type') || '';
  /* Some deployments answer with JSON carrying base64 rather than the bytes
     themselves, so both shapes are accepted rather than one being assumed. */
  if (type.includes('application/json')) {
    const body = await response.json();
    const encoded = body.audioContent || body.audio || body.data;
    if (!encoded) throw Object.assign(new Error('ABAIR returned no audio.'), { status: 502 });
    return { buffer: Buffer.from(encoded, 'base64'), mime: 'audio/mpeg', voice };
  }
  return { buffer: Buffer.from(await response.arrayBuffer()), mime: type || 'audio/mpeg', voice };
}

/**
 * Render a story, whatever the provider is.
 *
 * Writes the file and hands back what belongs in the row. The caller records
 * the failure rather than this throwing into a request: one dialect failing is
 * not a reason the other two should not play.
 */
export async function renderStory({ assignmentId, dialect, text }) {
  if (!SYNTHESISABLE.includes(dialect)) {
    throw Object.assign(new Error(`There is no synthesised voice for ${dialect}. Upload a recording instead.`), { status: 400 });
  }
  if (!String(text || '').trim()) {
    throw Object.assign(new Error('There is no story to read out.'), { status: 400 });
  }
  if (providerName() === 'none') {
    throw Object.assign(new Error(
      'No speech service is configured, so the story cannot be read aloud yet. Set ABAIR_API_KEY.',
    ), { status: 503 });
  }

  const { buffer, mime, voice } = isStandIn()
    ? await synthesiseWithSay({ text, dialect })
    : await synthesiseWithAbair({ text, dialect });
  await fs.mkdir(audioDir(), { recursive: true });
  const name = `${assignmentId}-${dialect}-${hashText(text).slice(0, 12)}.${isStandIn() ? 'wav' : 'mp3'}`;
  const filePath = path.join(audioDir(), name);
  await fs.writeFile(filePath, buffer);
  return {
    filePath, voice,
    mimeType: mime,
    sizeBytes: buffer.length,
    textHash: hashText(text),
  };
}
