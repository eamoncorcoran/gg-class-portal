import { Router } from 'express';
import { asyncRoute } from '../middleware.js';
import { requireAuth } from '../session.js';
import { searchGifs, trendingGifs, gifsConfigured } from '../gifs.js';

/* Open to everybody signed in, teacher and student alike. A GIF is the one thing
   on the feed that costs nothing to add and does most to make a quiet board feel
   like a room rather than a form. */
const router = Router();
router.use(requireAuth);

router.get('/', asyncRoute(async (req, res) => {
  if (!gifsConfigured()) return res.json({ configured: false, results: [] });
  const query = String(req.query.q || '').trim();
  const results = query ? await searchGifs(query) : await trendingGifs();
  res.json({ configured: true, results });
}));

export default router;
