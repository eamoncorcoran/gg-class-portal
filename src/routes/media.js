/**
 * Authenticated playback for teacher voice notes.
 *
 * These recordings are a teacher talking about one student's work, so they are not
 * served from the public /uploads path. Every request is checked: an administrator
 * may play any note, a student may play only the notes attached to their own
 * returned work.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { asyncRoute } from '../middleware.js';
import { requireAuth } from '../session.js';
import { one } from '../db.js';

const router = Router();
router.use(requireAuth);

/* Profile pictures. Everybody signed in can see everybody else's, because that
   is the entire point of putting faces on the feed — but only people signed in,
   which is why these are not in the public uploads path. */
router.get('/avatar/:userId', asyncRoute(async (req, res) => {
  const owner = await one('SELECT avatar_path, avatar_mime FROM users WHERE id=$1', [req.params.userId]);
  const file = owner?.avatar_path ? resolveStored(owner.avatar_path) : null;
  if (!file) return res.status(404).json({ error: 'No picture.' });
  res.setHeader('Content-Type', owner.avatar_mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(file).pipe(res);
}));

/* Private files live outside the publicly served uploads directory. Anything
   written before that separation existed is still read from the old location, so
   existing recordings keep playing. */
function resolveStored(storedName) {
  if (!storedName) return null;
  const name = path.basename(storedName);
  for (const directory of [config.privateUploadDir, config.uploadDir]) {
    const candidate = path.join(directory, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const SOURCES = {
  checkin: {
    sql: `SELECT ch.id, ch.student_id, ch.status, ch.teacher_audio_path, ch.teacher_audio_mime
          FROM checkins ch WHERE ch.id=$1`,
  },
  homework: {
    sql: `SELECT hs.id, hs.student_id, hs.status, hs.teacher_audio_path, hs.teacher_audio_mime
          FROM homework_submissions hs WHERE hs.id=$1`,
  },
};

router.get('/voice-note/:type/:id', asyncRoute(async (req, res) => {
  const source = SOURCES[req.params.type];
  if (!source) return res.status(404).json({ error: 'Not found.' });

  const row = await one(source.sql, [req.params.id]);
  if (!row?.teacher_audio_path) return res.status(404).json({ error: 'No voice note for this feedback.' });

  const isOwner = row.student_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && !isOwner) return res.status(403).json({ error: 'This voice note belongs to another student.' });
  // An unreturned note is still a draft the teacher is working on.
  if (!isAdmin && row.status !== 'returned') return res.status(404).json({ error: 'No voice note for this feedback.' });

  // The stored name is generated server-side, but never trust it as a path.
  const filePath = resolveStored(row.teacher_audio_path);
  if (!filePath) return res.status(404).json({ error: 'That recording is no longer available.' });

  res.setHeader('Content-Type', row.teacher_audio_mime || 'audio/webm');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Accept-Ranges', 'bytes');

  // Range support so players can scrub without downloading the whole recording.
  const { size } = fs.statSync(filePath);
  const range = req.headers.range;
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.setHeader('Content-Length', size);
  return fs.createReadStream(filePath).pipe(res);
}));

/* A student's uploaded homework. Same rule as voice notes: the teacher may open
   anything, a student may open only their own. */
router.get('/homework-file/:id', asyncRoute(async (req, res) => {
  const file = await one(
    `SELECT f.*, hs.assignment_id FROM homework_files f
     JOIN homework_submissions hs ON hs.id=f.submission_id WHERE f.id=$1`,
    [req.params.id],
  );
  if (!file) return res.status(404).json({ error: 'File not found.' });
  if (req.user.role !== 'admin' && file.student_id !== req.user.id) {
    return res.status(403).json({ error: 'That file belongs to another student.' });
  }

  const filePath = resolveStored(file.stored_name);
  if (!filePath) return res.status(404).json({ error: 'That file is no longer available.' });

  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Images and PDFs are worth looking at in place; anything else downloads.
  const inline = /^image\/|^application\/pdf$/.test(file.mime_type || '');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${String(file.file_name).replace(/[^\w. -]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Length', fs.statSync(filePath).size);
  return fs.createReadStream(filePath).pipe(res);
}));

export default router;
