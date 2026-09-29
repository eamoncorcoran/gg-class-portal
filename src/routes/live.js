/**
 * The live classroom, inside the portal.
 *
 * Everything here is behind the portal's own session: a student is req.user,
 * a teacher is an administrator. The room, the questions, the lessons the
 * studio builds, and the practice support the player needs.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin, requireStudent } from '../session.js';
import { asyncRoute } from '../middleware.js';
import { query } from '../db.js';
import { liveClasses, liveClass, studentClassIds } from '../live/classes.js';
import { nextClassWithSessions } from '../classtime.js';
import { zoomClientId, signZoom, liveRoomOn } from '../live/zoom.js';
import { speechConfigured } from '../live/speech.js';
import * as room from '../live/room.js';
import * as lessons from '../live/lessons.js';
import { voices, ttsRoute, phoneticsRoute, analyzeRoute } from '../live/practice.js';

const router = Router();
router.use(requireAuth);

/* Who I am, from the room's point of view, and where the class is. A student
   is shown the webinar for the session's class when one is set, otherwise
   their own class's. */
router.get('/me', asyncRoute(async (req, res) => {
  const session = await room.sessionSummary();
  let classId = session.classId;
  let webinar = session.webinar;
  let nextClass = null;
  if (req.user.role !== 'admin') {
    const mine = await studentClassIds(req.user.id);
    const own = mine[0];
    /* The session's room when it is for everyone or for one of this student's
       classes; otherwise their own class's link, so a class that is not part of
       today's session still finds its usual room. */
    const inSession = !session.classIds.length || mine.some((id) => session.classIds.includes(id));
    if (own && (!inSession || !webinar.webinarId)) { classId = own; const klass = await liveClass(own); webinar = { webinarId: klass?.webinarId || null, webinarPwd: klass?.webinarPwd || '' }; }
    else if (own && !classId) classId = own;
    /* When the class next sits, from the same setup the calendar uses: the
       weekly slot, the term, the date changes and any extra sessions. */
    if (own) {
      const row = (await query('SELECT * FROM classes WHERE id=$1', [own])).rows[0];
      const sessions = (await query(
        `SELECT id, starts_at, duration_minutes, join_url, label, cancelled
         FROM class_sessions WHERE class_id=$1 AND starts_at > now() - interval '4 hours' ORDER BY starts_at`, [own])).rows;
      const changes = (await query('SELECT on_date, kind, moved_to, reason FROM class_date_changes WHERE class_id=$1', [own])).rows;
      const next = row ? nextClassWithSessions(row, sessions, undefined, changes) : null;
      nextClass = next ? { startsAt: next.startsAt, timezone: next.timezone, live: Boolean(next.live), soon: Boolean(next.soon), minutesAway: next.minutesAway, label: next.sessionLabel || null } : null;
    }
  }
  const gate = await room.studentGate(req.user);
  res.set('Cache-Control', 'no-store');
  res.json({
    id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role,
    allowed: gate.ok, reason: gate.ok ? '' : gate.error,
    session: { ...session, startUrl: undefined }, classId, webinar, nextClass,
    liveNow: req.user.role === 'admin' ? session.live : await room.liveFor(req.user.id),
    zoomClientId: await zoomClientId(), live: await liveRoomOn(), mic: await speechConfigured(),
  });
}));

/* The Zoom signature: the real door to the class. Attendee role only. */
router.post('/signature', asyncRoute(async (req, res) => {
  const gate = await room.studentGate(req.user);
  if (!gate.ok) return res.status(403).json({ error: gate.error });
  /* Said plainly rather than thrown: a 5xx from the error handler is
     "something went wrong", and the one thing a student needs to hear is
     that the room is not set up yet, not that the portal is broken. */
  const mn = String(req.body?.meetingNumber ?? '').replace(/\D/g, '');
  if (mn.length < 9 || mn.length > 12) return res.status(400).json({ error: 'A valid webinar ID is required.' });
  if (!(await liveRoomOn())) return res.status(503).json({ error: 'The live classroom is not set up on this portal yet.' });
  res.json({ signature: await signZoom(mn) });
}));

/* ---- the phrase on screen ---- */
router.get('/phrase-stream', asyncRoute(async (req, res) => {
  const gate = await room.studentGate(req.user);
  if (!gate.ok) return res.status(403).json({ error: gate.error });
  room.phraseStream(req, res);
}));
router.post('/phrase-result', requireStudent, asyncRoute(async (req, res) => {
  const gate = await room.studentGate(req.user);
  if (!gate.ok) return res.status(403).json({ error: gate.error });
  res.json(room.recordResult(req.user, req.body));
}));
router.post('/phrase', requireAdmin, (req, res) => res.json({ ok: true, phrase: room.pushPhrase(req.body) }));
router.get('/status', requireAdmin, (_req, res) => res.json(room.roomStatus()));

/* ---- questions ---- */
router.get('/chat-stream', asyncRoute(async (req, res) => {
  const gate = await room.studentGate(req.user);
  if (!gate.ok) return res.status(403).json({ error: gate.error });
  room.chatStream(req, res);
}));
router.post('/chat', requireStudent, asyncRoute(async (req, res) => {
  const gate = await room.studentGate(req.user);
  if (!gate.ok) return res.status(403).json({ error: gate.error });
  room.studentAsks(req.user, req.body?.text);
  res.json({ ok: true });
}));
router.post('/chat/reply', requireAdmin, (req, res) => { room.teacherReplies(req.body?.cid, req.body?.text); res.json({ ok: true }); });
router.post('/chat/read', requireAdmin, (req, res) => { room.teacherRead(req.body?.cid); res.json({ ok: true }); });
router.post('/chat/broadcast', requireAdmin, (req, res) => { room.teacherBroadcasts(req.body?.text); res.json({ ok: true }); });
router.post('/chat/highlight', requireAdmin, (req, res) => { room.teacherHighlights(req.body?.text, req.body?.name); res.json({ ok: true }); });

/* ---- the session: which class, who may join ---- */
router.get('/session', requireAdmin, asyncRoute(async (_req, res) => res.json(await room.sessionSummary())));
router.post('/session', requireAdmin, asyncRoute(async (req, res) => res.json({ ok: true, ...(await room.setSession(req.body || {})) })));
/* Going live, in one press, and the state of everything it needs. */
router.get('/readiness', requireAdmin, asyncRoute(async (_req, res) => {
  const { getZoomConfig } = await import('../settings.js');
  const { zoomConfigured: apiConfigured } = await import('../zoom.js');
  const sdk = await getZoomConfig();
  const session = await room.sessionSummary();
  res.json({
    sdk: { configured: sdk.configured, enabled: sdk.enabled, clientId: sdk.clientId },
    api: { configured: apiConfigured(), hostEmail: sdk.hostEmail || '' },
    session,
  });
}));
router.post('/go-live', requireAdmin, asyncRoute(async (req, res) => {
  const { getZoomConfig } = await import('../settings.js');
  const sdk = await getZoomConfig();
  if (!sdk.configured) return res.status(503).json({ error: 'Students cannot join until the Zoom Meeting SDK secret is pasted under Feedback drafting, Live classroom (Zoom).' });
  const classes = await liveClasses();
  const chosen = classes.filter((k) => (req.body?.classIds || []).includes(k.id));
  const topic = chosen.length ? `${chosen.map((k) => k.programme).join(', ')} live class` : 'Live class';
  res.json({ ok: true, ...(await room.goLive({ ...(req.body || {}), topic })) });
}));
router.post('/end', requireAdmin, asyncRoute(async (_req, res) => res.json({ ok: true, ...(await room.endLive()) })));

router.get('/classes', requireAdmin, asyncRoute(async (_req, res) => {
  res.json({ classes: await liveClasses(), current: room.access.classId || '' });
}));
router.get('/courses', requireAdmin, asyncRoute(async (_req, res) => {
  res.json({ courses: (await query('SELECT id, title FROM courses ORDER BY title')).rows });
}));

/* ---- lessons from the studio ---- */
router.get('/lessons', requireAdmin, asyncRoute(async (_req, res) => res.json(await lessons.listLessons())));
router.post('/lessons', requireAdmin, asyncRoute(async (req, res) => {
  const saved = await lessons.saveLesson(req.body);
  res.json({ ok: true, id: saved.id, lesson: saved });
}));
router.post('/lessons/video', requireAdmin, lessons.receiveVideo);
router.get('/lessons/:id', asyncRoute(async (req, res) => {
  const lesson = await lessons.getLesson(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
  res.json(lesson);
}));
router.delete('/lessons/:id', requireAdmin, asyncRoute(async (req, res) => {
  await lessons.deleteLesson(req.params.id);
  res.json({ ok: true });
}));
router.get('/video/:file', lessons.sendVideo);

/* ---- practice support ---- */
router.get('/voices', (_req, res) => res.json(voices()));
router.get('/tts', asyncRoute(ttsRoute));
router.get('/phonetics', asyncRoute(phoneticsRoute));
router.post('/analyze', asyncRoute(analyzeRoute));

export default router;
