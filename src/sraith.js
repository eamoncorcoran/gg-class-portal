/**
 * The Sraith Pictiúr revision section.
 *
 * Ten picture sequences from the Irish for Primary Teaching course book, each
 * broken into its six boxes: the sentences for the box in Irish and English
 * beside the box picture, and every Irish sentence playable aloud.
 *
 * The content is built from the course document by scripts/build-sraith.py
 * into content/sraith/, and read once here. It is for students enrolled in an
 * Irish for Primary Teaching class (and the teachers), never anyone else, so
 * the pictures are served through an authenticated route rather than from the
 * public folder.
 *
 * Audio is Azure's ga-IE voice through the live classroom's speech module,
 * which keeps every clip on the portal's disk: a sentence is synthesised once,
 * ever, and every play after that is a file read. The clips are rendered in
 * the background at start-up, so no student waits on the first play either.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { one } from './db.js';
import { getSpeechConfig } from './settings.js';
import { ttsFor } from './live/tts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRAITH_DIR = path.resolve(HERE, '..', 'content', 'sraith');
export const SRAITH_IMG_DIR = path.join(SRAITH_DIR, 'img');

/* Which classes the section is for. A class whose name begins this way, so
   next year's "Irish for Primary Teaching 2027/28" is included without a
   change here. */
export const SRAITH_CLASS_PREFIX = 'Irish for Primary Teaching';

export const audioId = (text) => crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16);

let content = null;
const clips = new Map(); // audio id -> Irish text

export function sraithContent() {
  if (content) return content;
  let raw = { sraith: [] };
  try { raw = JSON.parse(fs.readFileSync(path.join(SRAITH_DIR, 'sraith.json'), 'utf8')); }
  catch (error) { console.error('Sraith content unreadable', error?.message); }
  const line = (s) => {
    const id = audioId(s.ga);
    clips.set(id, s.ga);
    return { ga: s.ga, en: s.en || '', audio: id };
  };
  const sraith = (raw.sraith || []).map((s, index) => ({
    n: index + 1,
    slug: s.slug,
    title: s.title,
    boxes: (s.boxes || []).map((b) => ({
      n: b.n,
      image: b.image ? { src: `/api/sraith/img/${encodeURIComponent(b.image.file)}`, width: b.image.width, height: b.image.height } : null,
      sentences: (b.sentences || []).map(line),
    })),
    ending: (s.ending || []).map(line),
  }));
  content = { sraith };
  return content;
}

export function sraithSummaries() {
  return sraithContent().sraith.map((s) => ({
    n: s.n, slug: s.slug, title: s.title,
    boxes: s.boxes.length,
    sentences: s.boxes.reduce((a, b) => a + b.sentences.length, 0) + s.ending.length,
    cover: s.boxes.find((b) => b.image)?.image || null,
    pictures: s.boxes.filter((b) => b.image).length,
  }));
}

export function sraithBySlug(slug) {
  return sraithContent().sraith.find((s) => s.slug === slug) || null;
}

export function clipText(id) {
  sraithContent();
  return clips.get(String(id)) || null;
}

/** Admins, and students on an active Irish for Primary Teaching class. */
export async function canSeeSraith(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const row = await one(
    `SELECT 1 FROM class_students cs JOIN classes c ON c.id=cs.class_id JOIN users u ON u.id=cs.student_id
     WHERE cs.student_id=$1 AND cs.active=true AND c.active=true AND u.active=true AND u.withdrawn_at IS NULL
       AND c.programme_name ILIKE $2 LIMIT 1`,
    [user.id, `${SRAITH_CLASS_PREFIX}%`]);
  return Boolean(row);
}

export async function sraithAudio(id) {
  const text = clipText(id);
  if (!text) return null;
  return ttsFor(text, '');
}

/* Every clip, one at a time, before anybody asks. Only with the Azure key
   in place: without it the speech module would fall back to another voice,
   and the point is that these are Azure's. */
let warming = null;
export function warmSraithAudio() {
  if (warming) return warming;
  warming = (async () => {
    const { azureKey } = await getSpeechConfig().catch(() => ({}));
    if (!azureKey) return { made: 0, skipped: 'no Azure key' };
    sraithContent();
    let made = 0;
    for (const text of new Set(clips.values())) {
      try { if (await ttsFor(text, '')) made += 1; } catch { /* the next may still work */ }
    }
    console.log(`Sraith audio ready: ${made} of ${new Set(clips.values()).size} clips on disk`);
    return { made };
  })().finally(() => { warming = null; });
  return warming;
}
