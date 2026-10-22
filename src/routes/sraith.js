import path from 'node:path';
import { Router } from 'express';
import { asyncRoute } from '../middleware.js';
import { requireAuth } from '../session.js';
import { canSeeSraith, sraithSummaries, sraithBySlug, sraithAudio, SRAITH_IMG_DIR } from '../sraith.js';

/**
 * The Sraith Pictiúr section: for students on an Irish for Primary Teaching
 * class, and the teachers. Everything here, pictures and audio included, is
 * behind the same check, so a link passed on outside the class opens nothing.
 */
const router = Router();
router.use(requireAuth);
router.use(asyncRoute(async (req, res, next) => {
  if (!(await canSeeSraith(req.user))) return res.status(403).json({ error: 'The Sraith Pictiúr are for students on the Irish for Primary Teaching course.' });
  return next();
}));

router.get('/', (_req, res) => res.json({ sraith: sraithSummaries() }));

router.get('/s/:slug', (req, res) => {
  const s = sraithBySlug(req.params.slug);
  if (!s) return res.status(404).json({ error: 'No such Sraith.' });
  const all = sraithSummaries();
  const i = all.findIndex((x) => x.slug === s.slug);
  res.json({ ...s, prev: all[i - 1] || null, next: all[i + 1] || null, total: all.length });
});

/* A box picture. The file name is checked against the folder, so nothing
   outside it can be asked for. */
router.get('/img/:file', (req, res) => {
  const file = path.basename(String(req.params.file || ''));
  if (!/^[a-z0-9-]+\.jpg$/.test(file)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(SRAITH_IMG_DIR, file), (error) => { if (error && !res.headersSent) res.status(404).end(); });
});

/* A sentence, spoken. The id is a hash of the Irish, so the same sentence is
   the same URL for ever and the browser keeps it too. Only sentences that are
   in the Sraith can be asked for: this is not a way to have anything said. */
router.get('/audio/:id.mp3', asyncRoute(async (req, res) => {
  const buf = await sraithAudio(req.params.id);
  if (!buf) return res.status(404).json({ error: 'No audio for that sentence.' });
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' });
  /* Safari on an iPhone asks for the first two bytes before it will play
     anything, and plays nothing from a server that answers with the whole
     file instead. */
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (range) {
    let start = range[1] === '' ? Math.max(0, buf.length - Number(range[2] || 0)) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : buf.length - 1;
    end = Math.min(end, buf.length - 1);
    if (start > end || start >= buf.length) { res.set('Content-Range', `bytes */${buf.length}`); return res.status(416).end(); }
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 });
    return res.end(buf.subarray(start, end + 1));
  }
  res.set('Content-Length', buf.length);
  return res.end(buf);
}));

export default router;
