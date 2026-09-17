/**
 * What the live classroom may ask the portal, service to service.
 *
 * Bearer-token routes, no cookie, no user: the caller is the live room's
 * server, not a person. Everything here is a thin read over tables the portal
 * already keeps, and nothing here writes.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { asyncRoute } from '../middleware.js';
import { classForLive, entitlementsBearerOk } from '../live.js';

const router = Router();

router.use((req, res, next) => {
  if (!entitlementsBearerOk(req)) return res.status(401).json({ error: 'A live-classroom bearer token is required.' });
  next();
});

/* Which classes this email is in. The contract the live room expects is a list
   under `courses`; ids of classes go there, because the live room is per class.
   The fuller `classes` carries the label and the webinar for the console. */
router.get('/entitlements', asyncRoute(async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Say which email.' });
  const rows = (await query(
    `SELECT c.* FROM classes c
     JOIN class_students cs ON cs.class_id=c.id
     JOIN users u ON u.id=cs.student_id
     WHERE lower(u.email)=$1 AND u.role='student' AND u.active=true AND u.withdrawn_at IS NULL
       AND cs.active=true AND c.active=true
     ORDER BY c.programme_name, c.day_of_week, c.start_time`,
    [email],
  )).rows;
  const classes = rows.map(classForLive);
  res.set('Cache-Control', 'no-store');
  res.json({ courses: classes.map((item) => item.id), classes });
}));

/* Every active class, for the teacher console's picker. */
router.get('/classes', asyncRoute(async (_req, res) => {
  const rows = (await query(
    'SELECT * FROM classes WHERE active=true ORDER BY programme_name, day_of_week, start_time')).rows;
  res.set('Cache-Control', 'no-store');
  res.json({ classes: rows.map(classForLive) });
}));

/* Every course, for filing a video lesson under a real course id. */
router.get('/courses', asyncRoute(async (_req, res) => {
  const rows = (await query('SELECT id, title FROM courses ORDER BY title')).rows;
  res.set('Cache-Control', 'no-store');
  res.json({ courses: rows });
}));

export default router;
