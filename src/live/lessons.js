/**
 * Lessons built in the studio: a title, a course, a video (or none, for a
 * deck the teacher steps through live) and the phrases.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { one, query } from '../db.js';
import { config } from '../config.js';
import { prerender } from './tts.js';

export const VIDEO_DIR = path.join(config.uploadDir, 'live-videos');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    course: row.course || '',
    courseId: row.course_id || '',
    videoId: row.video_id || '',
    videoUrl: row.video_id ? `/api/live/video/${encodeURIComponent(row.video_id)}` : '',
    videoType: row.video_type || '',
    phrases: Array.isArray(row.phrases) ? row.phrases : [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/** What the studio and console list. */
export async function listLessons() {
  const rows = (await query(
    `SELECT l.*, c.title course_title FROM live_lessons l LEFT JOIN courses c ON c.id=l.course_id
     ORDER BY l.updated_at DESC`)).rows;
  return rows.map((row) => {
    const lesson = shape(row);
    // The portal's course name wins when the lesson is filed under a real course.
    if (row.course_title) lesson.course = row.course_title;
    return { id: lesson.id, title: lesson.title, course: lesson.course, courseId: lesson.courseId,
      phrases: lesson.phrases.length, hasVideo: Boolean(lesson.videoId), videoUrl: lesson.videoUrl, updatedAt: lesson.updatedAt };
  });
}

export async function getLesson(id) {
  const row = await one(
    `SELECT l.*, c.title course_title FROM live_lessons l LEFT JOIN courses c ON c.id=l.course_id WHERE l.id=$1`,
    [String(id || '')]);
  const lesson = shape(row);
  if (lesson && row.course_title) lesson.course = row.course_title;
  return lesson;
}

export function cleanPhrases(input) {
  return (Array.isArray(input) ? input : []).slice(0, 300).map((p, i) => ({
    id: String(p?.id || `p${Date.now().toString(36)}${i}`).slice(0, 40),
    at: Math.max(0, Number(p?.at) || 0),
    irish: String(p?.irish || '').slice(0, 200).trim(),
    english: String(p?.english || '').slice(0, 240).trim(),
    phonetic: String(p?.phonetic || '').slice(0, 240).trim(),
  })).filter((p) => p.irish).sort((a, b) => a.at - b.at);
}

export async function saveLesson(body) {
  const b = body || {};
  const existing = b.id ? await getLesson(b.id) : null;
  const id = existing ? existing.id : crypto.randomBytes(6).toString('hex');
  const videoId = String(b.videoId ?? existing?.videoId ?? '').replace(/[^a-z0-9.-]/gi, '').slice(0, 80);
  const phrases = cleanPhrases(b.phrases);
  if (!videoId && !phrases.length) throw Object.assign(new Error('Add a video or at least one phrase.'), { status: 400 });
  const courseId = UUID.test(String(b.courseId ?? existing?.courseId ?? '')) ? String(b.courseId ?? existing?.courseId) : null;
  const record = {
    id,
    title: String(b.title || '').slice(0, 120).trim() || 'Untitled lesson',
    course: String(b.course ?? existing?.course ?? '').slice(0, 120).trim(),
    courseId,
    videoId,
    videoType: String(b.videoType ?? existing?.videoType ?? '').slice(0, 60),
    phrases,
  };
  await query(
    `INSERT INTO live_lessons(id,title,course,course_id,video_id,video_type,phrases)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, course=EXCLUDED.course, course_id=EXCLUDED.course_id,
       video_id=EXCLUDED.video_id, video_type=EXCLUDED.video_type, phrases=EXCLUDED.phrases, updated_at=now()`,
    [record.id, record.title, record.course, record.courseId, record.videoId, record.videoType, JSON.stringify(record.phrases)]);
  const saved = await getLesson(id);
  prerender(saved);
  return saved;
}

export async function deleteLesson(id) {
  const lesson = await getLesson(id);
  if (!lesson) return false;
  await query('DELETE FROM live_lessons WHERE id=$1', [lesson.id]);
  if (lesson.videoId) {
    const stillUsed = await one('SELECT 1 FROM live_lessons WHERE video_id=$1', [lesson.videoId]);
    if (!stillUsed) fs.unlink(path.join(VIDEO_DIR, lesson.videoId), () => {});
  }
  return true;
}

/* ---- video upload and normalisation ----------------------------------- */
function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 << 20 }, (err, stdout, stderr) =>
      (err ? reject(new Error(String(stderr || err.message).slice(0, 400))) : resolve(stdout)));
  });
}

/* Browsers refuse a lot of perfectly normal camera files: a .mov with PCM
   audio will sit there loading forever. So every upload is normalised to a
   browser-safe MP4 when ffmpeg is about; the video is copied when it is
   already H.264, audio re-encoded only when needed. Without ffmpeg the file is
   served as it came, which is fine for an MP4 and not for much else. */
const WEB_VIDEO = ['h264', 'vp8', 'vp9', 'av1'];
const WEB_AUDIO = ['aac', 'mp3', 'opus', 'vorbis'];
export async function normalizeVideo(id) {
  const src = path.join(VIDEO_DIR, id);
  let info;
  try {
    info = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', src], 120000));
  } catch (error) {
    console.error('ffprobe unavailable or failed, serving the original:', error.message);
    return id;
  }
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error('No video track in that file.');
  const vOk = WEB_VIDEO.includes(v.codec_name);
  const aOk = !a || WEB_AUDIO.includes(a.codec_name);
  const containerOk = /\.(mp4|webm)$/i.test(id);
  const extraStreams = streams.length > (a ? 2 : 1);
  if (vOk && aOk && containerOk && !extraStreams) return id;
  const outId = id.replace(/\.[^.]+$/, '') + '-web.mp4';
  const args = ['-y', '-i', src, '-map', '0:v:0'];
  if (a) args.push('-map', '0:a:0?');
  args.push('-c:v', vOk ? 'copy' : 'libx264');
  if (!vOk) args.push('-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p');
  if (a) args.push('-c:a', aOk ? 'copy' : 'aac', '-b:a', '160k');
  args.push('-movflags', '+faststart', path.join(VIDEO_DIR, outId));
  console.log(`[live video] normalising ${id} (v=${v.codec_name}${a ? ' a=' + a.codec_name : ''}) -> ${outId}`);
  await run('ffmpeg', args, 20 * 60 * 1000);
  fs.unlink(src, () => {});
  return outId;
}

/** The raw upload: the browser POSTs the file bytes with the file's own mime. */
export function receiveVideo(req, res) {
  const type = String(req.get('content-type') || '');
  if (!/^video\//.test(type)) return res.status(400).json({ error: 'That is not a video file.' });
  const ext = type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm'
    : (type.includes('quicktime') || type.includes('mov')) ? 'mov' : type.includes('ogg') ? 'ogv' : 'bin';
  const videoId = crypto.randomBytes(10).toString('hex') + '.' + ext;
  const dest = path.join(VIDEO_DIR, videoId);
  const out = fs.createWriteStream(dest);
  const MAX = 700 * 1024 * 1024;
  let bytes = 0, aborted = false;
  const fail = (code, msg) => {
    if (aborted) return; aborted = true;
    try { out.destroy(); } catch { /* already closed */ }
    fs.unlink(dest, () => {});
    if (!res.headersSent) res.status(code).json({ error: msg });
  };
  req.on('data', (c) => { bytes += c.length; if (bytes > MAX) { try { req.destroy(); } catch { /* gone */ } fail(413, 'Video is too large (700 MB max).'); } });
  req.on('error', () => fail(500, 'Upload failed.'));
  out.on('error', () => fail(500, 'Could not save the video.'));
  out.on('finish', async () => {
    if (aborted) return;
    if (bytes < 1000) return fail(400, 'That video looks empty.');
    try {
      const finalId = await normalizeVideo(videoId);
      res.json({ ok: true, videoId: finalId, videoUrl: `/api/live/video/${encodeURIComponent(finalId)}`, videoType: 'video/mp4' });
    } catch (error) {
      console.error('live video normalise failed', error?.message);
      fs.unlink(dest, () => {});
      if (!res.headersSent) res.status(422).json({ error: 'That video could not be processed. Try an MP4.' });
    }
  });
  req.pipe(out);
}

/** Serve a lesson video, with range requests, to a signed-in viewer. */
export function sendVideo(req, res) {
  const file = String(req.params.file || '');
  if (!/^[a-z0-9.-]+$/i.test(file) || file.includes('..')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(VIDEO_DIR, file), {
    headers: { 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
  }, (error) => { if (error && !res.headersSent) res.status(404).json({ error: 'Video not found.' }); });
}
