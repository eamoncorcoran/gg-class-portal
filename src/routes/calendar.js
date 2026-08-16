/**
 * Subscribable calendar feeds.
 *
 * Mounted before the session middleware's audience checks because calendar apps
 * cannot log in: the token in the URL is the whole credential. It is scoped to
 * one person, grants read access to nothing but their own deadlines, and is
 * revoked by generating a new one from the account screen.
 */
import { Router } from 'express';
import { asyncRoute } from '../middleware.js';
import { one } from '../db.js';
import { buildCalendar, feedForUser } from '../calendar.js';

const router = Router();

router.get('/:token.ics', asyncRoute(async (req, res) => {
  const token = String(req.params.token || '');
  // Long enough that guessing is hopeless; short-circuit anything obviously wrong
  // so a scan cannot use response timing to learn about the token space.
  if (token.length < 24) return res.status(404).type('text/plain').send('Calendar not found.');

  const user = await one(
    `SELECT id, role, name, active FROM users WHERE calendar_token=$1`,
    [token],
  );
  if (!user?.active) return res.status(404).type('text/plain').send('Calendar not found.');

  const feed = await feedForUser(user);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="gaeilgeoir-guides.ics"');
  res.setHeader('Cache-Control', 'private, max-age=900');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buildCalendar(feed));
}));

export default router;
