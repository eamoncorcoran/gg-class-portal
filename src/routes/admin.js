import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncRoute } from '../middleware.js';
import { requireAdmin, requireSuperAdmin } from '../session.js';
import { one, query, transaction } from '../db.js';
import { generateStrongPassword, hashPassword } from '../security.js';
import { sendStudentInvite, sendNudge } from '../email.js';
import { ensureWeeksForClass, scheduleCheckins, CHECKIN_DEFAULTS } from '../weeks.js';
import { audit } from '../audit.js';
import { draftCheckinFeedback, draftHomeworkFeedback } from '../ai.js';
import { VOICE_MIME_TYPES, audioExtension, audioTypeFor, dictate, originalName, withVoiceNote, withVoiceNotes } from '../voice.js';
import { buildCalendar, assignmentEvent, ensureCalendarToken, rotateCalendarToken } from '../calendar.js';
import { FILE_TYPE_GROUPS } from '../documents.js';
import { formatAddress, hasAddress } from '../address.js';
import { boardAudienceCount } from '../boardnotify.js';
import { notifyNewPost, notifyNewComment } from '../boardnotify.js';
import { listThreads, getThread, createThread, createPost, listCategories, toggleReaction, topContributors, REACTIONS, draftReplyFor } from '../community.js';
import { extractVideoLinks } from '../videolinks.js';
import { listCoursesForAdmin, getCourse, courseProgress, setCourseClasses, coursesForClass, classRecordingProgress } from '../courses.js';
import { addTopic, coursesWithPlans, getPlan, getTopics, importPlan, packagedPlan, removeTopic,
  reorderWeek, scheduleTopic, setItemDone, setTopicGroup, topicCost, unscheduleItem } from '../plans.js';
import { nextClassWithSessions, joinLinkFor, classSittings } from '../classtime.js';
import { AUDIO_UPLOAD_MB, DIALECTS, DIALECT_KEYS, SYNTHESISABLE, audioDir, hashText, isStandIn,
  providerName, renderStory, ttsConfigured } from '../tts.js';
import { parseVideoSource, detectVideoProvider, PROVIDER_LABELS, VIDEO_PROVIDERS } from '../lessonvideo.js';
import { availableRecordings, importRecording, importWatched, importConfigured } from '../zoomimport.js';
import { zoomConfigured } from '../zoom.js';
import { bunnyConfigured, bunnySigning } from '../bunny.js';
import { FIELD_NAMES, problemFrom } from '../validation.js';

const router = Router();
router.use(requireAdmin);

/* Course notes and scanned handouts get large. Generous rather than tight,
   with a message that says so when it is exceeded. */
const POST_ATTACHMENT_MB = 40;

const allowedUploads = new Set([
  'text/csv','application/pdf','image/png','image/jpeg','image/webp','image/gif',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  /* Audio and video, because a class resource is whatever the teacher wants the
     class to have. This refused every recording, and the picker it sits behind
     is the obvious place to attach one: it is beside the questions, it takes any
     file, and it is called "files students can use". Somebody reaching for it
     with an MP3 was told "this file type is not allowed" and had no reason to
     look anywhere else. */
  ...VOICE_MIME_TYPES,
  'video/mp4','video/quicktime','video/webm',
]);

/* Recordings never touch the public uploads path. Dictation is held in memory just
   long enough to reach OpenAI, and voice notes are written to disk under a random
   name and served only through the authenticated media route. */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!VOICE_MIME_TYPES.has(String(file.mimetype).split(';')[0])) {
      return callback(Object.assign(new Error('That audio format is not supported.'), { status: 400 }));
    }
    callback(null, true);
  },
});
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 20 },
  fileFilter(_req, file, callback) {
    /* The type comes from the browser, and browsers disagree about CSV: some
       say text/csv, some say application/vnd.ms-excel, and some give up and say
       application/octet-stream. The file is parsed as CSV straight afterwards
       and refused if it is not one, so the extension is the better gate here. */
    const isCsv = path.extname(file.originalname).toLowerCase() === '.csv';
    /* The same fallback the recordings use: a file that arrives with no type, or
       as octet-stream, is a browser giving up rather than a claim about the
       contents, so the name is worth more than the label. */
    const allowed = isCsv || allowedUploads.has(file.mimetype) || Boolean(audioTypeFor(file));
    if (!allowed) {
      return callback(Object.assign(
        new Error(`${originalName(file) || 'That file'} is not a file type the portal takes. PDFs, images, Word, audio and video all work.`),
        { status: 400 },
      ));
    }
    callback(null, true);
  },
});

function classLabel(row) {
  const day = ['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][Number(row.day_of_week)] || '';
  return `${row.programme_name} | ${day} | ${String(row.start_time).slice(0,5)}`;
}

function normalizeHeader(row, names) {
  const entries = Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]);
  for (const name of names) {
    const match = entries.find(([key]) => key === name || key.includes(name));
    if (match && match[1] != null) return String(match[1]).trim();
  }
  return '';
}

function parseAttendanceMinutes(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) {
    const hours = Number(clock[1] || 0);
    const minutes = Number(clock[2] || 0);
    const seconds = Number(clock[3] || 0);
    return Math.max(0, Math.round(hours * 60 + minutes + seconds / 60));
  }
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/i)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute)/i)?.[1] || 0);
  if (hours || minutes) return Math.max(0, Math.round(hours * 60 + minutes));
  return Math.max(0, Number.parseInt(text, 10) || 0);
}

async function createStudent({ name, email, classId, actorId, ip }) {
  const existing = await one('SELECT id FROM users WHERE email=$1', [email]);
  if (existing) throw Object.assign(new Error(`A user already exists for ${email}.`), { status: 409 });
  const temporaryPassword = generateStrongPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const student = await transaction(async (client) => {
    const inserted = await client.query(
      // Everybody created from here on is asked for a photograph on first login.
      // Students already on the course are left alone by migration 013.
      `INSERT INTO users(role,name,email,password_hash,must_change_password,must_set_avatar)
       VALUES ('student',$1,$2,$3,true,true) RETURNING id,name,email,role,must_change_password,must_set_avatar`,
      [name, email, passwordHash],
    );
    await client.query('INSERT INTO class_students(class_id,student_id) VALUES ($1,$2)', [classId, inserted.rows[0].id]);
    return inserted.rows[0];
  });
  let emailStatus = 'sent';
  let emailError = null;
  try { await sendStudentInvite({ student, temporaryPassword }); }
  catch (error) { emailStatus = 'failed'; emailError = error.message; console.error(error); }
  await audit({ actorId, action: 'student.created', entityType: 'user', entityId: student.id, metadata: { classId, emailStatus, emailError }, ip });
  return { ...student, emailStatus };
}

router.get('/bootstrap', asyncRoute(async (_req, res) => {
  const [classes, studentCount, assignmentCount] = await Promise.all([
    query(`SELECT c.*, count(cs.student_id)::int student_count FROM classes c LEFT JOIN class_students cs ON cs.class_id=c.id AND cs.active=true WHERE c.active=true GROUP BY c.id ORDER BY c.created_at`),
    one(`SELECT count(*)::int count FROM users WHERE role='student' AND active=true`),
    one(`SELECT count(*)::int count FROM assignments WHERE status<>'archived'`),
  ]);
  res.json({ classes: classes.rows.map((row) => ({ ...row, label: classLabel(row) })), counts: { students: studentCount.count, assignments: assignmentCount.count } });
}));

router.get('/classes', asyncRoute(async (_req, res) => {
  const result = await query(`SELECT c.*, count(cs.student_id)::int student_count FROM classes c LEFT JOIN class_students cs ON cs.class_id=c.id AND cs.active=true WHERE c.active=true GROUP BY c.id ORDER BY c.created_at`);
  res.json(result.rows.map((row) => ({ ...row, label: classLabel(row) })));
}));

router.post('/classes', asyncRoute(async (req, res) => {
  const parsed = z.object({
    programmeName: z.string().min(2).max(120),
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().min(3).default(config.defaultTimezone),
    // Not every group wants a board. A class set up without one never shows
    // Community at all, rather than showing an empty one.
    hasCommunity: z.boolean().optional().default(true),
    courseIds: z.array(z.string().uuid()).optional().default([]),
    // When the course runs. Weeks are only generated inside it.
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Enter a programme name, day, time and timezone.') });
  const row = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time,timezone,has_community,starts_on,ends_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [parsed.data.programmeName, parsed.data.dayOfWeek, parsed.data.startTime, parsed.data.timezone,
     parsed.data.hasCommunity, parsed.data.startsOn || null, parsed.data.endsOn || null],
  );
  for (const courseId of parsed.data.courseIds) {
    await query('INSERT INTO course_classes(course_id,class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [courseId, row.id]);
  }
  await ensureWeeksForClass(row);
  await audit({ actorId: req.user.id, action: 'class.created', entityType: 'class', entityId: row.id, metadata: parsed.data, ip: req.ip });
  res.status(201).json({ ...row, label: classLabel(row) });
}));

router.patch('/classes/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({
    programmeName: z.string().min(2).optional(),
    dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: z.string().min(3).optional(),
    active: z.boolean().optional(),
    // Emptying the field clears the link, so the banner disappears rather than
    // offering students a button that goes nowhere.
    joinUrl: z.string().url().or(z.literal('')).nullable().optional(),
    joinNote: z.string().max(200).optional(),
    hasCommunity: z.boolean().optional(),
    // Present means "these are the courses now", absent means leave them alone.
    courseIds: z.array(z.string().uuid()).optional(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid class settings. A class link must be a full https:// address.') });
  const current = await one('SELECT * FROM classes WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Class not found.' });
  const data = parsed.data;
  const joinUrl = data.joinUrl === undefined ? current.join_url : (data.joinUrl || null);
  const row = await one(
    `UPDATE classes SET programme_name=$1,day_of_week=$2,start_time=$3,timezone=$4,active=$5,
       join_url=$6,join_note=$7,has_community=$8,starts_on=$9,ends_on=$10,updated_at=now()
     WHERE id=$11 RETURNING *`,
    [data.programmeName ?? current.programme_name, data.dayOfWeek ?? current.day_of_week, data.startTime ?? String(current.start_time).slice(0,5), data.timezone ?? current.timezone, data.active ?? current.active,
     joinUrl, data.joinNote ?? current.join_note, data.hasCommunity ?? current.has_community,
     data.startsOn === undefined ? current.starts_on : (data.startsOn || null),
     data.endsOn === undefined ? current.ends_on : (data.endsOn || null),
     current.id],
  );
  if (data.courseIds) {
    await query('DELETE FROM course_classes WHERE class_id=$1', [current.id]);
    for (const courseId of data.courseIds) {
      await query('INSERT INTO course_classes(course_id,class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [courseId, current.id]);
    }
  }
  await ensureWeeksForClass(row);
  await audit({ actorId: req.user.id, action: 'class.updated', entityType: 'class', entityId: row.id, metadata: data, ip: req.ip });
  res.json({ ...row, label: classLabel(row) });
}));

/* Deleting a class takes its whole history with it: every teaching week,
   attendance record, check-in, assignment and submission. The students themselves
   survive — they simply end up unassigned — but everything they did in this class
   is gone. Closing a class hides it everywhere while keeping all of that. */
/* Everything the class screen needs to be set up in one place: whether it has a
   board, which courses it carries, and the extra sittings on top of the weekly
   slot. */
router.get('/classes/:id/setup', asyncRoute(async (req, res) => {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const sessions = await query(
    `SELECT id, starts_at, duration_minutes, join_url, label, cancelled
     FROM class_sessions WHERE class_id=$1 ORDER BY starts_at DESC`, [klass.id]);
  const changes = await query(
    'SELECT on_date, kind, moved_to, reason FROM class_date_changes WHERE class_id=$1 ORDER BY on_date',
    [klass.id]);
  res.json({
    class: { ...klass, label: classLabel(klass) },
    courses: await coursesForClass(klass.id),
    sessions: sessions.rows,
    dateChanges: changes.rows.map((row) => ({
      onDate: String(row.on_date).slice(0, 10),
      kind: row.kind,
      movedTo: row.moved_to ? row.moved_to.toISOString() : null,
      reason: row.reason || '',
    })),
    recordings: await classRecordingProgress(klass.id),
  });
}));

/* Which weeks the class does not meet.
   ------------------------------------------------------------------
   Sent whole rather than one at a time: the screen shows the term and the
   administrator ticks their way down it, so what arrives is the finished
   decision about every week rather than a stream of individual ones that could
   half-apply. */
router.put('/classes/:id/date-changes', asyncRoute(async (req, res) => {
  const parsed = z.object({
    changes: z.array(z.object({
      onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      kind: z.enum(['skipped', 'recorded', 'moved']),
      movedTo: z.string().datetime().nullable().optional(),
      reason: z.string().max(200).optional().default(''),
    })).max(200),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid list of class dates.') });
  const klass = await one('SELECT id FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });

  /* A move with nowhere to move to would leave students with a week marked as
     changed and no answer about when it is. Refused here as well as in the
     database, so the message is a sentence rather than a constraint name. */
  const homeless = parsed.data.changes.find((change) => change.kind === 'moved' && !change.movedTo);
  if (homeless) {
    return res.status(400).json({ error: `Give the class moved from ${homeless.onDate} a new date and time.` });
  }

  await transaction(async (client) => {
    await client.query('DELETE FROM class_date_changes WHERE class_id=$1', [klass.id]);
    for (const change of parsed.data.changes) {
      await client.query(
        `INSERT INTO class_date_changes(class_id,on_date,kind,moved_to,reason)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (class_id,on_date) DO UPDATE
           SET kind=EXCLUDED.kind, moved_to=EXCLUDED.moved_to, reason=EXCLUDED.reason`,
        [klass.id, change.onDate, change.kind, change.movedTo || null, change.reason || ''],
      );
    }
  });
  await audit({ actorId: req.user.id, action: 'class.dates_updated', entityType: 'class', entityId: klass.id,
    metadata: { count: parsed.data.changes.length }, ip: req.ip });
  res.json({ changes: parsed.data.changes });
}));

/* An extra sitting: a second evening that week, a catch-up, a moved class. It
   carries its own time and, when the room differs, its own link. */
router.post('/classes/:id/sessions', asyncRoute(async (req, res) => {
  const parsed = z.object({
    startsAt: z.string().min(10),
    durationMinutes: z.coerce.number().int().min(15).max(480).optional().default(90),
    joinUrl: z.string().url().or(z.literal('')).nullable().optional(),
    label: z.string().max(120).optional().default(''),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the session a date and time. A link must be a full https:// address.') });
  const when = new Date(parsed.data.startsAt);
  if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'That date and time could not be read.' });
  const row = await one(
    `INSERT INTO class_sessions(class_id,starts_at,duration_minutes,join_url,label)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, when.toISOString(), parsed.data.durationMinutes, parsed.data.joinUrl || null, parsed.data.label],
  );
  await audit({ actorId: req.user.id, action: 'class.session.added', entityType: 'class', entityId: req.params.id, metadata: parsed.data, ip: req.ip });
  res.status(201).json(row);
}));

/* Cancelling keeps the row so the administrator can see they called it off;
   deleting is for one entered by mistake. */
router.patch('/classes/:id/sessions/:sessionId', asyncRoute(async (req, res) => {
  const parsed = z.object({
    startsAt: z.string().min(10).optional(),
    durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
    joinUrl: z.string().url().or(z.literal('')).nullable().optional(),
    label: z.string().max(120).optional(),
    cancelled: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid session.') });
  const current = await one('SELECT * FROM class_sessions WHERE id=$1 AND class_id=$2', [req.params.sessionId, req.params.id]);
  if (!current) return res.status(404).json({ error: 'Session not found.' });
  const data = parsed.data;
  const row = await one(
    `UPDATE class_sessions SET starts_at=$1,duration_minutes=$2,join_url=$3,label=$4,cancelled=$5
     WHERE id=$6 RETURNING *`,
    [data.startsAt ? new Date(data.startsAt).toISOString() : current.starts_at,
     data.durationMinutes ?? current.duration_minutes,
     data.joinUrl === undefined ? current.join_url : (data.joinUrl || null),
     data.label ?? current.label, data.cancelled ?? current.cancelled, current.id],
  );
  res.json(row);
}));

router.delete('/classes/:id/sessions/:sessionId', asyncRoute(async (req, res) => {
  await query('DELETE FROM class_sessions WHERE id=$1 AND class_id=$2', [req.params.sessionId, req.params.id]);
  res.status(204).end();
}));

router.get('/classes/:id/impact', asyncRoute(async (req, res) => {
  const klass = await one('SELECT id, programme_name, day_of_week, start_time, active FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM class_students WHERE class_id=$1 AND active=true) students,
       (SELECT count(*)::int FROM assignments WHERE class_id=$1) assignments,
       (SELECT count(*)::int FROM weeks WHERE class_id=$1) weeks,
       (SELECT count(*)::int FROM checkins ch JOIN weeks w ON w.id=ch.week_id
         WHERE w.class_id=$1 AND ch.status<>'draft') checkins,
       (SELECT count(*)::int FROM homework_submissions hs JOIN assignments a ON a.id=hs.assignment_id
         WHERE a.class_id=$1 AND hs.status<>'draft') submissions,
       (SELECT count(*)::int FROM attendance at JOIN weeks w ON w.id=at.week_id
         WHERE w.class_id=$1 AND at.status<>'unknown') attendance`,
    [klass.id],
  );
  res.json({ class: { ...klass, label: classLabel(klass) }, ...counts });
}));

router.delete('/classes/:id', asyncRoute(async (req, res) => {
  const klass = await one('SELECT id, programme_name, day_of_week, start_time FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM checkins ch JOIN weeks w ON w.id=ch.week_id WHERE w.class_id=$1 AND ch.status<>'draft')
     + (SELECT count(*)::int FROM homework_submissions hs JOIN assignments a ON a.id=hs.assignment_id WHERE a.class_id=$1 AND hs.status<>'draft') work`,
    [klass.id],
  );
  const confirmed = Number(req.query.confirmWork ?? req.body?.confirmWork ?? -1);
  if (counts.work > 0 && confirmed !== counts.work) {
    return res.status(409).json({
      error: `“${classLabel(klass)}” holds ${counts.work} piece${counts.work === 1 ? '' : 's'} of student work. Deleting removes ${counts.work === 1 ? 'it' : 'them'} permanently. Close the class instead to keep everything.`,
      work: counts.work,
    });
  }
  await query('DELETE FROM classes WHERE id=$1', [klass.id]);
  await audit({ actorId: req.user.id, action: 'class.deleted', entityType: 'class', entityId: klass.id, metadata: { label: classLabel(klass), work: counts.work }, ip: req.ip });
  res.json({ ok: true, deletedWork: counts.work });
}));

router.get('/students', asyncRoute(async (req, res) => {
  const params = [];
  let classWhere = '';
  if (req.query.classId) { params.push(req.query.classId); classWhere = `AND cs.class_id=$${params.length}`; }
  const result = await query(
    `SELECT u.id,u.name,u.email,u.phone,u.active,u.must_change_password,u.last_login_at,
            c.id class_id,c.programme_name,c.day_of_week,c.start_time,c.timezone
     FROM users u
     LEFT JOIN class_students cs ON cs.student_id=u.id AND cs.active=true
     LEFT JOIN classes c ON c.id=cs.class_id
     WHERE u.role='student' ${classWhere}
     ORDER BY u.name`, params,
  );
  res.json(result.rows.map((row) => ({ ...row, classLabel: row.class_id ? classLabel(row) : null })));
}));

router.post('/students', asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), classId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Enter a student name, email and class.') });
  const klass = await one('SELECT id FROM classes WHERE id=$1 AND active=true', [parsed.data.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const student = await createStudent({ ...parsed.data, actorId: req.user.id, ip: req.ip });
  res.status(201).json(student);
}));

/* A phone number as a person would write it on a form.
   ------------------------------------------------------------------
   Exports and spreadsheets carry Irish mobiles as 353877097020: no plus, no
   spaces. Stored like that the Call link dials a twelve-digit local number and
   the profile is hard to read. An Irish mobile becomes +353 87 709 7020; any
   other country keeps its digits behind a plus; anything already typed with a
   plus or spaces is left as it was, because it was somebody's choice. */
function tidyPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/[\s+()-]/.test(raw)) return raw.slice(0, 40);
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // 0871234567 is how an Irish number is written at home.
  if (/^0[1-9]\d{7,9}$/.test(digits)) return `+353 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (/^353\d{9}$/.test(digits)) return `+353 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits}`;
}

/* Students from a spreadsheet: new ones created, existing ones brought up to
   date.
   ------------------------------------------------------------------
   Until now this only created, and an email that already existed was reported
   as an error, so the same sheet could never be uploaded twice and a column
   of phone numbers for people already on the portal had nowhere to go.

   Now a row whose email exists updates what the sheet carries for them, which
   for the moment is a phone number, and says "updated" rather than failing. A
   row for somebody new still needs a name and a class.

   Preview first. The sheet is read and every row reported without anything
   being written, so "82 matched, 5 not found" is seen before it is true. The
   same request with preview off does the writing. */
router.post('/students/import', diskUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
  const preview = String(req.body?.preview || '') === '1';
  const content = await fs.readFile(req.file.path, 'utf8');
  await fs.unlink(req.file.path).catch(() => {});
  let rows;
  try {
    rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (error) {
    return res.status(400).json({ error: `That file could not be read as a CSV. ${error.message}` });
  }
  const classesResult = await query('SELECT * FROM classes WHERE active=true');
  const classes = classesResult.rows;
  const results = [];
  /* A sheet exported from a phone list often carries the same person twice.
     The second row is reported as a duplicate rather than written twice or
     counted as two updates. */
  const seenEmails = new Set();

  for (const row of rows) {
    const name = normalizeHeader(row, ['name','student name','full name']);
    const email = normalizeHeader(row, ['email','email address']).toLowerCase();
    const classText = normalizeHeader(row, ['class','current class','course']);
    const phone = tidyPhone(normalizeHeader(row, ['phone','phone number','mobile','telephone','tel']));
    if (!email) { results.push({ name, email, phone, status: 'error', error: 'No email on this row.' }); continue; }
    if (seenEmails.has(email)) { results.push({ name, email, phone, status: 'duplicate', error: 'Same email as an earlier row.' }); continue; }
    seenEmails.add(email);

    const existing = await one('SELECT id, name, phone FROM users WHERE lower(email)=$1', [email]);
    if (existing) {
      if (!phone) { results.push({ name: existing.name, email, phone: existing.phone, status: 'unchanged', error: 'Already on the portal. No phone on this row.' }); continue; }
      if (existing.phone === phone) { results.push({ name: existing.name, email, phone, status: 'unchanged', error: 'Phone already up to date.' }); continue; }
      if (!preview) await query('UPDATE users SET phone=$1, updated_at=now() WHERE id=$2', [phone, existing.id]);
      results.push({ name: existing.name, email, phone, status: 'updated', studentId: existing.id, was: existing.phone });
      continue;
    }

    const klass = (req.body.classId && classes.find((item) => item.id === req.body.classId))
      || classes.find((item) => classLabel(item).toLowerCase() === classText.toLowerCase())
      || classes.find((item) => classText && classLabel(item).toLowerCase().includes(classText.toLowerCase()));
    if (!name || !klass) {
      results.push({ name, email, phone, status: 'not found', error: name
        ? 'No student with this email. Add a Class column, or pick a default class, to create them.'
        : 'No student with this email, and no name to create one with.' });
      continue;
    }
    if (preview) { results.push({ name, email, phone, status: 'created', error: `Will be created in ${classLabel(klass)}.` }); continue; }
    try {
      const student = await createStudent({ name, email, classId: klass.id, actorId: req.user.id, ip: req.ip });
      if (phone) await query('UPDATE users SET phone=$1 WHERE id=$2', [phone, student.id]);
      results.push({ name, email, phone, status: 'created', studentId: student.id, emailStatus: student.emailStatus });
    } catch (error) {
      results.push({ name, email, phone, status: 'error', error: error.message });
    }
  }

  const count = (status) => results.filter((row) => row.status === status).length;
  if (!preview) {
    await audit({ actorId: req.user.id, action: 'students.imported', entityType: 'user',
      metadata: { total: results.length, created: count('created'), updated: count('updated'), notFound: count('not found') }, ip: req.ip });
  }
  res.json({
    preview, total: results.length,
    created: count('created'), updated: count('updated'), unchanged: count('unchanged'),
    notFound: count('not found'), duplicates: count('duplicate'), errors: count('error'),
    results,
  });
}));

router.patch('/students/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().min(2).optional(), email: z.string().email().optional(), classId: z.string().uuid().optional(), active: z.boolean().optional(), phone: z.string().trim().max(40).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid student update.') });
  const student = await one(`SELECT u.*,cs.class_id FROM users u LEFT JOIN class_students cs ON cs.student_id=u.id AND cs.active=true WHERE u.id=$1 AND u.role='student'`, [req.params.id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  await transaction(async (client) => {
    await client.query(
      'UPDATE users SET name=$1,email=$2,active=$3,phone=$5,updated_at=now() WHERE id=$4',
      [parsed.data.name ?? student.name, parsed.data.email ?? student.email,
       parsed.data.active ?? student.active, student.id,
       // Undefined means the edit did not mention it; an empty string clears it.
       parsed.data.phone === undefined ? student.phone : (parsed.data.phone || null)]);
    if (parsed.data.classId && parsed.data.classId !== student.class_id) {
      await client.query('UPDATE class_students SET active=false WHERE student_id=$1', [student.id]);
      await client.query(`INSERT INTO class_students(class_id,student_id,active) VALUES ($1,$2,true) ON CONFLICT (class_id,student_id) DO UPDATE SET active=true,enrolled_at=now()`, [parsed.data.classId, student.id]);
    }
  });
  await audit({ actorId: req.user.id, action: 'student.updated', entityType: 'user', entityId: student.id, metadata: parsed.data, ip: req.ip });
  res.json({ ok: true });
}));

router.post('/students/:id/reset-password', asyncRoute(async (req, res) => {
  const student = await one(`SELECT id,name,email FROM users WHERE id=$1 AND role='student' AND active=true`, [req.params.id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const temporaryPassword = generateStrongPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await transaction(async (client) => {
    await client.query('UPDATE users SET password_hash=$1,must_change_password=true,updated_at=now() WHERE id=$2', [passwordHash, student.id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1', [student.id]);
  });
  await sendStudentInvite({ student, temporaryPassword });
  await audit({ actorId: req.user.id, action: 'student.password_reset', entityType: 'user', entityId: student.id, ip: req.ip });
  res.json({ ok: true, message: 'A new temporary password was emailed to the student.' });
}));

router.post('/students/:id/resend-invite', asyncRoute(async (req, res) => {
  const student = await one(`SELECT id,name,email FROM users WHERE id=$1 AND role='student' AND active=true`, [req.params.id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const temporaryPassword = generateStrongPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await transaction(async (client) => {
    await client.query('UPDATE users SET password_hash=$1,must_change_password=true,updated_at=now() WHERE id=$2', [passwordHash, student.id]);
    // The old password no longer exists, so any session created with it must go too.
    await client.query('DELETE FROM sessions WHERE user_id=$1', [student.id]);
  });
  await sendStudentInvite({ student, temporaryPassword });
  await audit({ actorId: req.user.id, action: 'student.invite_resent', entityType: 'user', entityId: student.id, ip: req.ip });
  res.json({ ok: true, message: 'A fresh invitation was emailed to the student.' });
}));

/* Taking a student off a class, and removing them altogether.
   ------------------------------------------------------------------
   These are two different intentions and they were being served by one
   half-measure: the class dropdown, which could only ever move somebody from one
   class to another. There was no way to say "this person is not in this class"
   and no way to say "this person should not be here at all", so the wrong entry
   and the duplicate account stayed on the register forever.

   They are kept separate because they lose different amounts. Removing from a
   class keeps the account and every piece of work; deleting keeps nothing. The
   safe one is the one offered first, and the destructive one has to say what it
   is about to destroy before it will do it. */

/** What deleting this student would take with them. */
/* Every student's address, in one sheet.
   ------------------------------------------------------------------
   The reason the addresses are collected at all: something has to be posted,
   and posting it means one list with a name against each address. Everybody is
   included, with or without an address, because a list of who has not answered
   is exactly as useful as the list of who has when the envelopes are being
   written.

   Excel decides a file's encoding by looking at the first bytes, and without a
   byte order mark it reads UTF-8 as Latin-1 — which turns every fada in a name
   into mojibake. Ó Súilleabháin becomes Ã“ SÃºilleabhÃ¡in in a spreadsheet of
   Irish names, which is most of them. */
/* Phone numbers, pasted in a block.
   ------------------------------------------------------------------
   Eighty odd students is not a job for eighty odd edits, and the list always
   arrives the same way: copied out of a spreadsheet, one student to a line,
   tab or comma between the columns.

   Matched on email, because a name is not unique and is spelled differently in
   different places. Two people called Gemma Mc Loughlin appeared twice in the
   same list, and matching on a name would have to guess which. An email either
   matches a student or it does not.

   Nothing is created here. A line whose email is not on the portal is reported
   rather than invented, since a typo in a spreadsheet should not quietly become
   a new account.
*/
router.post('/students/phone-import', asyncRoute(async (req, res) => {
  const parsed = z.object({ text: z.string().min(1).max(200000), preview: z.boolean().optional().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Paste the list before importing.') });
  const preview = parsed.data.preview;

  const rows = String(parsed.data.text).split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      /* Split on tabs first, since that is what a spreadsheet paste gives and a
         name can contain a comma. Falls back to commas for a CSV. */
      const parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map((part) => part.trim());
      const email = parts.find((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) || '';
      /* The phone is whatever else on the line looks like a number: at least
         seven digits, allowing the spaces, brackets, plus and dashes people
         write them with. */
      const phone = parts.find((part) => part !== email && /[0-9]/.test(part)
        && part.replace(/[^0-9]/g, '').length >= 7) || '';
      /* Written the way it reads on a form: 353877097020 becomes
         +353 87 709 7020, so the Call link dials it and the profile shows it. */
      return { line, email: email.toLowerCase(), phone: tidyPhone(phone) };
    });

  const updated = [];
  const noPhone = [];
  const unknown = [];
  const unchanged = [];
  /* A list copied out of a phone export often carries the same person twice.
     The second line is skipped rather than counted as a second update. */
  const seen = new Set();
  for (const row of rows) {
    if (!row.email) { unknown.push({ line: row.line, why: 'no email on this line' }); continue; }
    if (seen.has(row.email)) continue;
    seen.add(row.email);
    if (!row.phone) { noPhone.push({ email: row.email }); continue; }
    const student = await one(
      "SELECT id, name, email, phone FROM users WHERE lower(email)=$1 AND role='student'", [row.email]);
    if (!student) { unknown.push({ line: row.line, why: 'no student with that email' }); continue; }
    if (student.phone === row.phone) { unchanged.push({ name: student.name, email: student.email, phone: row.phone }); continue; }
    if (!preview) await query('UPDATE users SET phone=$1, updated_at=now() WHERE id=$2', [row.phone, student.id]);
    updated.push({ name: student.name, email: student.email, phone: row.phone, was: student.phone });
  }

  if (!preview) {
    await audit({
      actorId: req.user.id, action: 'students.phones_imported', entityType: 'user', entityId: null,
      metadata: { updated: updated.length, unmatched: unknown.length, withoutPhone: noPhone.length }, ip: req.ip,
    });
  }
  res.json({ preview, unchanged, updated, unknown, noPhone, considered: rows.length });
}));

router.get('/students/addresses.csv', asyncRoute(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.classId) { params.push(req.query.classId); where = `AND cs.class_id=$${params.length}`; }
  const result = await query(
    `SELECT u.name, u.email, u.phone, u.address_line1, u.address_line2, u.address_county, u.eircode,
            u.address_updated_at, c.programme_name, c.day_of_week, c.start_time
     FROM users u
     LEFT JOIN class_students cs ON cs.student_id=u.id AND cs.active=true
     LEFT JOIN classes c ON c.id=cs.class_id
     WHERE u.role='student' AND u.active=true ${where}
     ORDER BY u.name`, params,
  );

  /* Quoted every time, and doubled quotes inside. An address line is exactly the
     kind of field that contains a comma, and one unquoted comma moves every
     column after it into the wrong place for that row alone — the sort of error
     that is only noticed when an envelope comes back. */
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Name', 'Email', 'Phone', 'Class', 'Address line 1', 'Address line 2', 'County', 'Eircode', 'Full address', 'Given on'].map(cell).join(','),
    ...result.rows.map((row) => [
      row.name, row.email, row.phone || '', row.programme_name ? classLabel(row) : '',
      row.address_line1 || '', row.address_line2 || '', row.address_county || '', row.eircode || '',
      hasAddress(row) ? formatAddress(row) : 'Not given yet',
      row.address_updated_at ? new Date(row.address_updated_at).toISOString().slice(0, 10) : '',
    ].map(cell).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="student-contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${lines.join('\n')}\n`);
}));

router.get('/students/:id/impact', asyncRoute(async (req, res) => {
  const student = await one(
    `SELECT u.id,u.name,u.email,u.withdrawn_at,
            c.id class_id,c.programme_name,c.day_of_week,c.start_time
     FROM users u
     LEFT JOIN class_students cs ON cs.student_id=u.id AND cs.active=true
     LEFT JOIN classes c ON c.id=cs.class_id
     WHERE u.id=$1 AND u.role='student'`,
    [req.params.id],
  );
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM checkins WHERE student_id=$1 AND status<>'draft') checkins,
       (SELECT count(*)::int FROM homework_submissions WHERE student_id=$1 AND status<>'draft') submissions,
       (SELECT count(*)::int FROM homework_files WHERE student_id=$1) files,
       (SELECT count(*)::int FROM attendance WHERE student_id=$1 AND status<>'unknown') attendance,
       (SELECT count(*)::int FROM discussion_threads WHERE author_id=$1 AND deleted_at IS NULL) posts,
       (SELECT count(*)::int FROM discussion_posts WHERE author_id=$1 AND deleted_at IS NULL) comments,
       (SELECT count(*)::int FROM student_notes WHERE student_id=$1) notes`,
    [student.id],
  );
  res.json({
    student: {
      id: student.id, name: student.name, email: student.email,
      withdrawn: Boolean(student.withdrawn_at),
      classId: student.class_id,
      classLabel: student.class_id ? classLabel(student) : null,
    },
    ...counts,
    work: counts.checkins + counts.submissions,
  });
}));

/* Off the register, but still a person. Their work stays exactly where it is —
   a check-in they submitted in March was really submitted, and a class list is
   not the right place to decide otherwise. */
router.post('/students/:id/remove-from-class', asyncRoute(async (req, res) => {
  const student = await one(`SELECT id,name FROM users WHERE id=$1 AND role='student'`, [req.params.id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const parsed = z.object({ classId: z.string().uuid().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid request.') });

  const enrolment = parsed.data.classId
    ? await one('SELECT class_id FROM class_students WHERE student_id=$1 AND class_id=$2 AND active=true', [student.id, parsed.data.classId])
    : await one('SELECT class_id FROM class_students WHERE student_id=$1 AND active=true', [student.id]);
  if (!enrolment) return res.status(404).json({ error: `${student.name} is not in that class.` });

  await query('UPDATE class_students SET active=false WHERE student_id=$1 AND class_id=$2', [student.id, enrolment.class_id]);
  await audit({ actorId: req.user.id, action: 'student.removed_from_class', entityType: 'user', entityId: student.id, metadata: { classId: enrolment.class_id }, ip: req.ip });
  res.json({ ok: true, message: `${student.name} was taken off the class. Their account and their work are kept.` });
}));

/* Gone. Everything referencing the student cascades on delete, so the database
   half of this is one statement; the files are not in the database and have to
   be removed by hand, or they sit on the disk forever with nothing left pointing
   at them.
 
   Refuses until the caller has said how many pieces of work it is destroying,
   the same bargain the class delete makes. A number that has to be repeated back
   cannot be clicked past by accident. */
router.delete('/students/:id', asyncRoute(async (req, res) => {
  const student = await one(`SELECT id,name,email,avatar_path FROM users WHERE id=$1 AND role='student'`, [req.params.id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const counts = await one(
    `SELECT (SELECT count(*)::int FROM checkins WHERE student_id=$1 AND status<>'draft')
          + (SELECT count(*)::int FROM homework_submissions WHERE student_id=$1 AND status<>'draft') work`,
    [student.id],
  );
  const confirmed = Number(req.query.confirmWork ?? req.body?.confirmWork ?? -1);
  if (counts.work > 0 && confirmed !== counts.work) {
    return res.status(409).json({
      error: `${student.name} has handed in ${counts.work} piece${counts.work === 1 ? '' : 's'} of work. Deleting removes ${counts.work === 1 ? 'it' : 'them'} permanently. Take them off the class instead to keep everything.`,
      work: counts.work,
    });
  }

  /* Read the filenames before the rows go, since the cascade takes them with it. */
  const files = await query('SELECT stored_name FROM homework_files WHERE student_id=$1', [student.id]);
  const storedNames = files.rows.map((row) => row.stored_name);
  if (student.avatar_path) storedNames.push(path.basename(student.avatar_path));

  await query('DELETE FROM users WHERE id=$1', [student.id]);

  /* After the delete, deliberately. A file that will not unlink must not stop
     the account from going — the record is the thing that matters, and a stray
     file is a housekeeping problem rather than a reason to keep somebody on the
     system after being asked twice to remove them. */
  let filesRemoved = 0;
  for (const name of storedNames) {
    try {
      await fs.unlink(path.join(config.privateUploadDir, name));
      filesRemoved += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(`Could not remove ${name} for the deleted student: ${error.message}`);
    }
  }

  await audit({
    actorId: req.user.id, action: 'student.deleted', entityType: 'user', entityId: student.id,
    metadata: { name: student.name, email: student.email, work: counts.work, filesRemoved }, ip: req.ip,
  });
  res.json({ ok: true, deletedWork: counts.work, filesRemoved });
}));

router.get('/tracker/:classId', asyncRoute(async (req, res) => {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  await ensureWeeksForClass(klass);
  const [weeksResult, studentsResult, assignmentsResult] = await Promise.all([
    query(`SELECT * FROM weeks WHERE class_id=$1 ORDER BY week_start`, [klass.id]),
    query(`SELECT u.id,u.name,u.email,u.withdrawn_at,
             (SELECT cw.reason FROM course_withdrawals cw WHERE cw.student_id=u.id) withdrawal_reason
           FROM users u JOIN class_students cs ON cs.student_id=u.id
           WHERE cs.class_id=$1 AND cs.active=true AND u.active=true
           ORDER BY u.withdrawn_at NULLS FIRST, u.name`, [klass.id]),
    query(`SELECT a.*,
      COALESCE((SELECT json_agg(jsonb_build_object('id',q.id,'position',q.position,'prompt',q.prompt,'imageUrl',q.image_url,'required',q.required,
        /* The answer key travels to the teacher and only the teacher. Without it
           the edit form opened blank, and saving a fixed typo in the story
           re-wrote every question with no expected answer and one mark. */
        'expectedAnswer',q.expected_answer,'marks',q.marks) ORDER BY q.position)
        FROM assignment_questions q WHERE q.assignment_id=a.id),'[]'::json) questions
      FROM assignments a WHERE a.class_id=$1 AND a.status<>'archived' ORDER BY a.deadline_at`, [klass.id]),
  ]);
  const weekIds = weeksResult.rows.map((row) => row.id);
  const studentIds = studentsResult.rows.map((row) => row.id);
  let attendanceRows = [], checkinRows = [], homeworkRows = [];
  if (weekIds.length && studentIds.length) {
    [attendanceRows, checkinRows, homeworkRows] = await Promise.all([
      query(`SELECT * FROM attendance WHERE week_id=ANY($1::uuid[]) AND student_id=ANY($2::uuid[])`, [weekIds, studentIds]).then((r) => r.rows),
      query(`SELECT * FROM checkins WHERE week_id=ANY($1::uuid[]) AND student_id=ANY($2::uuid[])`, [weekIds, studentIds]).then((r) => r.rows),
      query(`SELECT hs.*,
               COALESCE((SELECT json_agg(jsonb_build_object('id',f.id,'fileName',f.file_name,'mimeType',f.mime_type,
                 'sizeBytes',f.size_bytes,'extractionState',f.extraction_state,'extractedText',f.extracted_text)
                 ORDER BY f.created_at) FROM homework_files f WHERE f.submission_id=hs.id),'[]'::json) files
             FROM homework_submissions hs JOIN assignments a ON a.id=hs.assignment_id
             WHERE a.class_id=$1 AND hs.student_id=ANY($2::uuid[])`, [klass.id, studentIds]).then((r) => r.rows),
    ]);
  }
  res.json({
    class: { ...klass, label: classLabel(klass) }, weeks: weeksResult.rows, students: studentsResult.rows,
    assignments: assignmentsResult.rows, attendance: attendanceRows,
    checkins: withVoiceNotes(checkinRows, 'checkin'), homework: withVoiceNotes(homeworkRows, 'homework'),
  });
}));

/* Engagement for one class.
   "Still on the course" is the share of enrolled students who have not withdrawn.
   "Work submitted" is the share of everything actually due so far — released
   check-ins on weeks that were switched on, plus published assignments past their
   visible date — that has been handed in by students still on the course. Weeks
   switched off and people who have left are excluded from both, because counting
   them would make the figure meaningless. */
router.get('/engagement/:classId', asyncRoute(async (req, res) => {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });

  const [people, expected, withdrawals] = await Promise.all([
    one(
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE u.withdrawn_at IS NULL)::int active,
              count(*) FILTER (WHERE u.withdrawn_at IS NOT NULL)::int withdrawn
       FROM class_students cs JOIN users u ON u.id=cs.student_id
       WHERE cs.class_id=$1 AND cs.active=true AND u.active=true`,
      [klass.id],
    ),
    one(
      `WITH active_students AS (
         SELECT u.id FROM class_students cs JOIN users u ON u.id=cs.student_id
         WHERE cs.class_id=$1 AND cs.active=true AND u.active=true AND u.withdrawn_at IS NULL
       ),
       due_checkins AS (
         SELECT w.id week_id FROM weeks w
         WHERE w.class_id=$1 AND w.checkin_enabled=true AND w.checkin_release_at<=now()
       ),
       due_assignments AS (
         SELECT a.id assignment_id FROM assignments a
         WHERE a.class_id=$1 AND a.status='published' AND a.visible_at<=now()
       )
       SELECT
         ((SELECT count(*) FROM due_checkins) * (SELECT count(*) FROM active_students)
          + (SELECT count(*) FROM due_assignments) * (SELECT count(*) FROM active_students))::int expected,
         ((SELECT count(*) FROM checkins ch JOIN due_checkins d ON d.week_id=ch.week_id
             WHERE ch.student_id IN (SELECT id FROM active_students) AND ch.status<>'draft')
          + (SELECT count(*) FROM homework_submissions hs JOIN due_assignments d ON d.assignment_id=hs.assignment_id
             WHERE hs.student_id IN (SELECT id FROM active_students) AND hs.status<>'draft'))::int submitted,
         (SELECT count(*) FROM due_checkins)::int checkins_due,
         (SELECT count(*) FROM due_assignments)::int assignments_due`,
      [klass.id],
    ),
    query(
      `SELECT cw.*, u.name, u.email FROM course_withdrawals cw
       JOIN users u ON u.id=cw.student_id
       WHERE cw.class_id=$1 ORDER BY cw.submitted_at DESC`,
      [klass.id],
    ),
  ]);

  /* The two headline figures average everything together, which hides the week
     that went badly. These break it back apart: one row per thing that was
     actually due, with the names of whoever has not done it — the part you can
     act on. */
  const ACTIVE_STUDENTS = `SELECT u.id, u.name FROM class_students cs JOIN users u ON u.id=cs.student_id
     WHERE cs.class_id=$1 AND cs.active=true AND u.active=true AND u.withdrawn_at IS NULL`;

  const [checkinItems, assignmentItems] = await Promise.all([
    query(
      `WITH active_students AS (${ACTIVE_STUDENTS})
       SELECT w.id, w.week_start, w.checkin_due_at due_at, w.label,
         (SELECT count(*) FROM active_students)::int expected,
         (SELECT count(*) FROM checkins ch WHERE ch.week_id=w.id AND ch.status<>'draft'
            AND ch.student_id IN (SELECT id FROM active_students))::int submitted,
         COALESCE((SELECT json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name)
            FROM active_students a
            WHERE NOT EXISTS (SELECT 1 FROM checkins ch
              WHERE ch.week_id=w.id AND ch.student_id=a.id AND ch.status<>'draft')), '[]'::json) missing
       FROM weeks w
       WHERE w.class_id=$1 AND w.checkin_enabled=true AND w.checkin_release_at<=now()
       ORDER BY w.week_start DESC`,
      [klass.id],
    ),
    query(
      `WITH active_students AS (${ACTIVE_STUDENTS})
       SELECT a.id, a.title, COALESCE(a.reopened_until, a.deadline_at) due_at,
         (SELECT count(*) FROM active_students)::int expected,
         (SELECT count(*) FROM homework_submissions hs WHERE hs.assignment_id=a.id AND hs.status<>'draft'
            AND hs.student_id IN (SELECT id FROM active_students))::int submitted,
         COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
            FROM active_students s
            WHERE NOT EXISTS (SELECT 1 FROM homework_submissions hs
              WHERE hs.assignment_id=a.id AND hs.student_id=s.id AND hs.status<>'draft')), '[]'::json) missing
       FROM assignments a
       WHERE a.class_id=$1 AND a.status='published' AND a.visible_at<=now()
       ORDER BY COALESCE(a.reopened_until, a.deadline_at) DESC`,
      [klass.id],
    ),
  ]);

  const rate = (row) => (row.expected ? Math.round((row.submitted / row.expected) * 100) : null);
  const items = [
    ...checkinItems.rows.map((row) => ({
      kind: 'checkin', id: row.id, label: row.label || null, weekStart: row.week_start,
      dueAt: row.due_at, expected: row.expected, submitted: row.submitted, rate: rate(row), missing: row.missing,
    })),
    ...assignmentItems.rows.map((row) => ({
      kind: 'homework', id: row.id, label: row.title,
      dueAt: row.due_at, expected: row.expected, submitted: row.submitted, rate: rate(row), missing: row.missing,
    })),
  ].sort((a, b) => new Date(b.dueAt) - new Date(a.dueAt));

  const retention = people.total ? Math.round((people.active / people.total) * 100) : null;
  const completion = expected.expected ? Math.round((expected.submitted / expected.expected) * 100) : null;
  res.json({ class: { ...klass, label: classLabel(klass) }, people, expected, retention, completion, items, withdrawals: withdrawals.rows });
}));

/* Whether the feedback is actually being read. Deliberately a report you ask
   for rather than a figure on a dashboard, and nothing about it appears on the
   student side: they are told when new feedback arrives, never that opening it
   is recorded. */
router.get('/reports/feedback-read/:classId', asyncRoute(async (req, res) => {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });

  /* Check-ins and homework are separate tables with the same two timestamps, so
     line them up once and report on the pair. */
  const RETURNED = `
    SELECT ch.student_id, 'checkin' AS kind, ch.feedback_returned_at, ch.feedback_read_at,
           'Week of ' || to_char(w.week_start, 'DD Mon') AS title
      FROM checkins ch
      JOIN weeks w ON w.id=ch.week_id
     WHERE w.class_id=$1 AND ch.status='returned' AND ch.feedback_returned_at IS NOT NULL
    UNION ALL
    SELECT hs.student_id, 'homework' AS kind, hs.feedback_returned_at, hs.feedback_read_at, a.title
      FROM homework_submissions hs
      JOIN assignments a ON a.id=hs.assignment_id
     WHERE a.class_id=$1 AND hs.status='returned' AND hs.feedback_returned_at IS NOT NULL`;

  const [totals, perStudent, unopened] = await Promise.all([
    one(
      `WITH returned AS (${RETURNED})
       SELECT count(*)::int returned,
              count(*) FILTER (WHERE feedback_read_at IS NOT NULL)::int opened,
              (SELECT EXTRACT(EPOCH FROM percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY feedback_read_at - feedback_returned_at))
                 FROM returned WHERE feedback_read_at IS NOT NULL) median_seconds
         FROM returned`,
      [klass.id],
    ),
    query(
      `WITH returned AS (${RETURNED})
       SELECT u.id, u.name, u.email, u.withdrawn_at,
              count(r.*)::int returned,
              count(r.*) FILTER (WHERE r.feedback_read_at IS NOT NULL)::int opened,
              max(r.feedback_read_at) last_opened
         FROM class_students cs
         JOIN users u ON u.id=cs.student_id
         LEFT JOIN returned r ON r.student_id=u.id
        WHERE cs.class_id=$1 AND cs.active=true AND u.active=true
        GROUP BY u.id, u.name, u.email, u.withdrawn_at
        ORDER BY count(r.*) FILTER (WHERE r.feedback_read_at IS NOT NULL)::float
                 / NULLIF(count(r.*), 0) NULLS LAST, u.name`,
      [klass.id],
    ),
    query(
      `WITH returned AS (${RETURNED})
       SELECT r.kind, r.title, r.feedback_returned_at, u.id student_id, u.name
         FROM returned r JOIN users u ON u.id=r.student_id
        WHERE r.feedback_read_at IS NULL
        ORDER BY r.feedback_returned_at`,
      [klass.id],
    ),
  ]);

  const rate = totals.returned ? Math.round((totals.opened / totals.returned) * 100) : null;
  res.json({
    class: { ...klass, label: classLabel(klass) },
    generatedAt: new Date().toISOString(),
    totals: {
      returned: totals.returned,
      opened: totals.opened,
      unopened: totals.returned - totals.opened,
      rate,
      medianHoursToOpen: totals.median_seconds == null ? null : Math.round((Number(totals.median_seconds) / 3600) * 10) / 10,
    },
    students: perStudent.rows.map((row) => ({
      id: row.id, name: row.name, email: row.email, withdrawn: Boolean(row.withdrawn_at),
      returned: row.returned, opened: row.opened,
      rate: row.returned ? Math.round((row.opened / row.returned) * 100) : null,
      lastOpened: row.last_opened,
    })),
    unopened: unopened.rows.map((row) => ({
      kind: row.kind, title: row.title, studentId: row.student_id,
      name: row.name, returnedAt: row.feedback_returned_at,
    })),
  });
}));

router.put('/attendance/:weekId/:studentId', asyncRoute(async (req, res) => {
  const parsed = z.object({
    status: z.enum(['live','partial','missed','recording','unknown']),
    minutes: z.coerce.number().int().min(0).max(1440).default(0),
    notes: z.string().max(4000).optional().default(''),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid attendance record.') });
  const row = await one(
    `INSERT INTO attendance(week_id,student_id,status,minutes,source,notes,updated_at)
     VALUES ($1,$2,$3,$4,'manual',$5,now())
     ON CONFLICT (week_id,student_id) DO UPDATE
       SET status=EXCLUDED.status,minutes=EXCLUDED.minutes,source='manual',notes=EXCLUDED.notes,updated_at=now()
     RETURNING *`,
    [req.params.weekId, req.params.studentId, parsed.data.status, parsed.data.minutes, parsed.data.notes],
  );
  await audit({ actorId: req.user.id, action: 'attendance.updated', entityType: 'attendance', entityId: row.id, ip: req.ip });
  res.json(row);
}));

router.post('/attendance/import', diskUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an attendance CSV.' });
  const parsedMeta = z.object({ classId: z.string().uuid(), weekId: z.string().uuid(), liveThresholdMinutes: z.coerce.number().int().min(1).default(30) }).safeParse(req.body);
  if (!parsedMeta.success) return res.status(400).json({ error: 'Class, week and attendance threshold are required.' });
  const content = await fs.readFile(req.file.path, 'utf8');
  await fs.unlink(req.file.path).catch(() => {});
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  const enrolled = await query(`SELECT u.id,u.name,u.email FROM users u JOIN class_students cs ON cs.student_id=u.id WHERE cs.class_id=$1 AND cs.active=true`, [parsedMeta.data.classId]);
  const unmatched = [];
  const totals = new Map();
  for (const row of rows) {
    const email = normalizeHeader(row, ['email','user email']);
    const name = normalizeHeader(row, ['name','participant','user name']);
    const durationText = normalizeHeader(row, ['duration','minutes','time in session']);
    const minutes = parseAttendanceMinutes(durationText);
    const student = enrolled.rows.find((item) => item.email.toLowerCase() === email.toLowerCase()) ||
      enrolled.rows.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!student) { unmatched.push({ name, email, matched: false }); continue; }
    totals.set(student.id, (totals.get(student.id) || 0) + minutes);
  }
  const updates = [];
  for (const student of enrolled.rows) {
    const minutes = totals.get(student.id) || 0;
    const status = minutes >= parsedMeta.data.liveThresholdMinutes ? 'live' : minutes > 0 ? 'partial' : 'missed';
    await query(
      `INSERT INTO attendance(week_id,student_id,status,minutes,source,updated_at)
       VALUES ($1,$2,$3,$4,'csv',now())
       ON CONFLICT (week_id,student_id) DO UPDATE SET status=EXCLUDED.status,minutes=EXCLUDED.minutes,source='csv',updated_at=now()`,
      [parsedMeta.data.weekId, student.id, status, minutes],
    );
    updates.push({ name: student.name, email: student.email, matched: true, status, minutes });
  }
  updates.push(...unmatched);
  await audit({ actorId: req.user.id, action: 'attendance.imported', entityType: 'week', entityId: parsedMeta.data.weekId, metadata: { rows: rows.length }, ip: req.ip });
  res.json({ rows: updates });
}));

router.post('/uploads', diskUpload.array('files', 10), asyncRoute(async (req, res) => {
  // Named as it was named, fada and all, rather than as the bytes arrived.
  const files = (req.files || []).map((file) => ({ fileName: originalName(file), mimeType: file.mimetype, url: `/uploads/${path.basename(file.path)}` }));
  res.status(201).json({ files });
}));

router.get('/assignments', asyncRoute(async (req, res) => {
  const params = [];
  const filters = [];
  if (req.query.classId) { params.push(req.query.classId); filters.push(`a.class_id=$${params.length}`); }
  // Archived assignments are hidden unless asked for, so the screen can offer a restore.
  if (req.query.includeArchived !== 'true') filters.push(`a.status<>'archived'`);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await query(
    `SELECT a.*,c.programme_name,c.day_of_week,c.start_time,c.timezone,
      COALESCE((SELECT json_agg(jsonb_build_object('id',q.id,'position',q.position,'prompt',q.prompt,'imageUrl',q.image_url,'required',q.required,
        /* The answer key travels to the teacher and only the teacher. Without it
           the edit form opened blank, and saving a fixed typo in the story
           re-wrote every question with no expected answer and one mark. */
        'expectedAnswer',q.expected_answer,'marks',q.marks) ORDER BY q.position)
        FROM assignment_questions q WHERE q.assignment_id=a.id),'[]'::json) questions,
      COALESCE((SELECT json_agg(jsonb_build_object('id',r.id,'fileName',r.file_name,'fileUrl',r.file_url,'mimeType',r.mime_type) ORDER BY r.created_at)
        FROM assignment_resources r WHERE r.assignment_id=a.id),'[]'::json) resources
     FROM assignments a JOIN classes c ON c.id=a.class_id
     ${where} ORDER BY a.deadline_at`, params,
  );
  res.json(result.rows.map((row) => ({ ...row, classLabel: classLabel(row) })));
}));

/* The teaching calendar: every week of every class, so the homework screen can
   show which weeks carry an assignment and which deliberately do not. */
/* Every class sitting in a range, for the calendar.
   ------------------------------------------------------------------
   Sittings are worked out rather than stored, so this asks classtime for them
   the same way the student's calendar does. A week that was moved appears at
   the time it actually runs, one that was cancelled appears struck through
   rather than vanishing, and an extra evening appears as itself.

   The join link is resolved here rather than on the screen, because it can be
   overridden per week and per session, and the rule for which one wins should
   not be written twice. */
router.get('/class-dates', asyncRoute(async (req, res) => {
  const params = [];
  let scope = '';
  if (req.query.classId) { params.push(req.query.classId), scope = `AND id=$${params.length}`; }
  const classes = await query(`SELECT * FROM classes WHERE active=true ${scope}`, params);

  const out = [];
  for (const klass of classes.rows) {
    const [changes, sessions, weeks] = await Promise.all([
      query('SELECT on_date, kind, moved_to, reason FROM class_date_changes WHERE class_id=$1', [klass.id]),
      query(`SELECT id, starts_at, duration_minutes, join_url, label, cancelled
             FROM class_sessions WHERE class_id=$1`, [klass.id]),
      query('SELECT week_start, join_url FROM weeks WHERE class_id=$1 AND join_url IS NOT NULL', [klass.id]),
    ]);
    for (const sitting of classSittings(klass, { changes: changes.rows, sessions: sessions.rows })) {
      out.push({
        ...sitting,
        classId: klass.id,
        classLabel: classLabel(klass),
        timezone: klass.timezone,
        joinUrl: sitting.joinUrl
          || joinLinkFor(klass, weeks.rows, { weekStart: mondayOf(sitting.onDate) }),
        note: klass.join_note || null,
      });
    }
  }
  out.sort((a, b) => new Date(a.at) - new Date(b.at));
  res.json(out);
}));

/* The Monday a date belongs to, which is how a week is keyed everywhere here. */
function mondayOf(isoDate) {
  const date = new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

router.get('/teaching-weeks', asyncRoute(async (req, res) => {
  const params = [];
  const where = req.query.classId ? (params.push(req.query.classId), 'WHERE w.class_id=$1') : '';
  const result = await query(
    `SELECT w.id, w.class_id, w.week_start, w.checkin_enabled, w.checkin_release_at, w.checkin_due_at,
            w.checkin_hard_deadline, w.label, w.notes,
            c.programme_name, c.day_of_week, c.start_time, c.timezone
     FROM weeks w JOIN classes c ON c.id=w.class_id ${where} ORDER BY w.week_start`, params,
  );
  res.json(result.rows.map((row) => ({ ...row, classLabel: classLabel(row) })));
}));

/* Calendar subscription. The token is the credential, so it is only ever handed
   to the signed-in owner, and rotating it revokes every existing subscription. */
router.get('/calendar-feed', asyncRoute(async (req, res) => {
  const token = await ensureCalendarToken(req.user.id);
  res.json({ url: `${config.appUrl}/calendar/${token}.ics`, token });
}));

router.post('/calendar-feed/rotate', asyncRoute(async (req, res) => {
  const token = await rotateCalendarToken(req.user.id);
  await audit({ actorId: req.user.id, action: 'calendar.token_rotated', entityType: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ url: `${config.appUrl}/calendar/${token}.ics`, token });
}));

/* A file attached to an assignment.
   ------------------------------------------------------------------
   The upload route has answered with `url` since the portal shipped, and this
   schema has demanded `fileUrl` for exactly as long, so a handout attached
   through "files students can use" was refused on every save since 16 August.
   The old error blamed the title, the deadline and the questions, so nobody
   could tell.

   Either spelling is taken now, and normalised on the way in, so a browser
   still holding yesterday's app.js works the moment this is deployed rather
   than an hour later when its cache expires. */
const resourceSchema = z.object({
  fileName: z.string().min(1),
  fileUrl: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  mimeType: z.string().optional(),
}).transform((item) => ({
  fileName: item.fileName,
  fileUrl: item.fileUrl || item.url,
  mimeType: item.mimeType,
})).refine((item) => Boolean(item.fileUrl), { message: 'has no address', path: ['fileUrl'] });

/* Why the assignment would not save.
   ------------------------------------------------------------------
   "Complete the assignment title, deadline and at least one question" was said
   for every failure, including four that have nothing to do with any of those:
   a second question added and left blank, a title of one character, a Loom
   address typed without https, and a story over the length limit. A teacher who
   has filled all three in is then told to fill them in.

   Zod already knows which field failed and why. This says it.
*/
const ASSIGNMENT_FIELD_NAMES = {
  title: 'the title',
  instructions: 'the instructions',
  deadlineAt: 'the deadline',
  visibleAt: 'the date it becomes visible',
  loomUrl: 'the Loom address',
  classId: 'the class',
  weekId: 'the teaching week',
  listeningText: 'the story',
  kind: 'the kind of assignment',
  questions: 'the questions',
  resources: 'the attached files',
  maxFiles: 'the number of files',
};

function assignmentProblem(error) {
  const issue = error?.issues?.[0];
  if (!issue) return 'Something in this assignment could not be saved.';

  const [head, index, field] = issue.path;
  if (head === 'questions' && typeof index === 'number') {
    const which = `Question ${index + 1}`;
    if (field === 'prompt') return `${which} has no text in it. Write it, or remove it with the Remove link.`;
    if (field === 'expectedAnswer') return `${which}: the expected answer is too long.`;
    if (field === 'marks') return `${which}: the marks should be a whole number between 0 and 100.`;
    return `${which} is not complete.`;
  }
  if (head === 'questions') return 'Add at least one question.';
  if (head === 'resources' && typeof index === 'number') {
    return `Attached file ${index + 1} did not upload properly. Remove it and attach it again.`;
  }

  const name = ASSIGNMENT_FIELD_NAMES[head] || String(head || 'Something');
  if (issue.code === 'too_small') {
    return head === 'title'
      ? 'The title needs at least two characters.'
      : `Fill in ${name}.`;
  }
  if (issue.code === 'too_big') return `${name.charAt(0).toUpperCase()}${name.slice(1)} is too long.`;
  if (issue.code === 'invalid_string' && issue.validation === 'url') {
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} has to be a full web address starting with https://`;
  }
  if (issue.code === 'invalid_string' && issue.validation === 'datetime') {
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} is not a valid date and time.`;
  }
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} is not right: ${issue.message}`;
}

router.post('/assignments', asyncRoute(async (req, res) => {
  const parsed = z.object({
    classId: z.string().uuid(), weekId: z.string().uuid().nullable().optional(), title: z.string().min(2), instructions: z.string().default(''), loomUrl: z.string().url().nullable().optional(), visibleAt: z.string().datetime().optional(), deadlineAt: z.string().datetime(), hardDeadline: z.boolean().default(true), remindersEnabled: z.boolean().default(true),
    questions: z.array(z.object({ prompt: z.string().min(1), imageUrl: z.string().nullable().optional(), required: z.boolean().default(true),
      /* What a right answer looks like, and what the question is worth. Only a
         listening activity uses them, and neither ever leaves the server on a
         student's request. */
      expectedAnswer: z.string().max(4000).default(''), marks: z.coerce.number().int().min(0).max(100).default(1) })).min(1),
    kind: z.enum(['written', 'listening']).default('written'),
    listeningText: z.string().max(40000).default(''),
    listeningTextShown: z.boolean().default(false),
    resources: z.array(resourceSchema).default([]),
    allowUploads: z.boolean().default(false),
    uploadsRequired: z.boolean().default(false),
    acceptedFileTypes: z.array(z.enum(Object.keys(FILE_TYPE_GROUPS))).default(['image', 'pdf']),
    maxFiles: z.coerce.number().int().min(1).max(10).default(3),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: assignmentProblem(parsed.error) });
  const a = parsed.data;
  const assignment = await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO assignments(class_id,week_id,title,instructions,loom_url,visible_at,deadline_at,hard_deadline,reminders_enabled,created_by,
         allow_uploads,uploads_required,accepted_file_types,max_files,kind,listening_text,listening_text_shown)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17) RETURNING *`,
      [a.classId, a.weekId || null, a.title, a.instructions, a.loomUrl || null, a.visibleAt || new Date().toISOString(), a.deadlineAt, a.hardDeadline, a.remindersEnabled, req.user.id,
       a.allowUploads, a.allowUploads && a.uploadsRequired, JSON.stringify(a.acceptedFileTypes), a.maxFiles,
       a.kind, a.kind === 'listening' ? a.listeningText : null, a.listeningTextShown],
    );
    for (const [position, question] of a.questions.entries()) {
      await client.query(`INSERT INTO assignment_questions(assignment_id,position,prompt,image_url,required,expected_answer,marks) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [inserted.rows[0].id, position, question.prompt, question.imageUrl || null, question.required, question.expectedAnswer || null, question.marks]);
    }
    for (const resource of a.resources) {
      await client.query(`INSERT INTO assignment_resources(assignment_id,file_name,file_url,mime_type) VALUES ($1,$2,$3,$4)`, [inserted.rows[0].id, resource.fileName, resource.fileUrl, resource.mimeType || null]);
    }
    return inserted.rows[0];
  });
  await audit({ actorId: req.user.id, action: 'assignment.created', entityType: 'assignment', entityId: assignment.id, metadata: { classId: a.classId }, ip: req.ip });
  res.status(201).json(assignment);
}));

/* A term of homework in one spreadsheet.
   ------------------------------------------------------------------
   Building twelve assignments through the form, each with five questions, is
   the job this replaces. The planning already exists as a document, so the
   document is what it takes.

   One row per assignment, with the questions in numbered columns — Q1, Q2, Q3 —
   because that is how somebody lays out a term when they are writing it, and it
   keeps one assignment on one line where it can be read.

   As with the scheduled posts, the file is read and shown back before anything
   is written: a wrong date in row nine should not leave eight assignments
   created and a half-finished import. */
const ASSIGNMENT_COLUMNS = {
  title: ['title', 'assignment', 'name'],
  instructions: ['instructions', 'brief', 'description', 'notes'],
  deadline: ['deadline', 'due', 'due date', 'closes', 'deadline at'],
  visible: ['opens', 'visible', 'visible from', 'release', 'opens at'],
  hard: ['deadline type', 'hard', 'hard deadline', 'type'],
  /* A listening activity is a row with a story in it. No Kind column to
     remember: pasting a story is the thing that makes it one, which is also how
     somebody describes it out loud. The column is still accepted for anybody
     who would rather be explicit. */
  story: ['story', 'text', 'listening', 'listening text', 'passage', 'script'],
  showText: ['show text', 'show the text', 'transcript', 'text shown'],
  kind: ['kind', 'activity', 'assignment type'],
};

/** Q1, Q2, Q3… in order, however they are capitalised or spaced. */
/** Numbered columns of one family, in order: Q1 Q2 Q3, or A1 A2 A3. */
function numberedColumns(row, pattern) {
  return Object.keys(row)
    .map((key) => ({ key, match: pattern.exec(key.trim()) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ key: entry.key, index: Number(entry.match.slice(1).find(Boolean)) }))
    .sort((a, b) => a.index - b.index)
    .map((entry) => String(row[entry.key] ?? '').trim());
}

function questionsFrom(row) {
  return numberedColumns(row, /^q\s*(\d+)$|^question\s*(\d+)$/i).filter(Boolean);
}

/* What a right answer to each question looks like, and what it is worth.
   ------------------------------------------------------------------
   Their own columns rather than interleaved with the questions, so an existing
   sheet with Q1 Q2 Q3 keeps working untouched and a listening sheet is the same
   sheet with A and M columns added to the end of it. */
function expectedFrom(row) {
  return numberedColumns(row, /^a\s*(\d+)$|^answer\s*(\d+)$|^expected\s*(\d+)$/i);
}

function marksFrom(row) {
  return numberedColumns(row, /^m\s*(\d+)$|^marks?\s*(\d+)$/i);
}

/* What the Deadline type column is allowed to say.
   ------------------------------------------------------------------
   The rule used to be "soft, late or no means soft, anything else means hard",
   which quietly turned "soft deadline", "flexible" and "allow late" into hard
   deadlines: the opposite of what was written, with nothing on screen to say so.
   A word that is not understood is a problem on that row now, not a guess.

   Blank still means hard. That is the documented default and it is the one that
   cannot lose a student's work by surprise. */
const SOFT_DEADLINE_WORDS = ['soft', 'soft deadline', 'late', 'allow late', 'accepts late',
  'accept late', 'flexible', 'open', 'no', 'n'];
const HARD_DEADLINE_WORDS = ['hard', 'hard deadline', 'strict', 'firm', 'closed', 'yes', 'y'];

/* When a week's homework appears, if the sheet does not say.
   ------------------------------------------------------------------
   A term imported in one go used to arrive all at once: every assignment was
   visible the moment it was created, so a student opening the calendar in
   September saw twelve weeks of homework stacked up in front of them. What they
   should see is this week's.

   Monday at 10:00 of the week the deadline falls in. A row that names its own
   opening date keeps it, because that is somebody's decision. */
const HOMEWORK_OPENS_HOUR = 10;

function defaultOpensFor(deadline, timezone) {
  if (!deadline) return null;
  const monday = deadline.setZone(timezone).startOf('week')
    .set({ hour: HOMEWORK_OPENS_HOUR, minute: 0, second: 0, millisecond: 0 });
  /* A deadline early on the Monday itself would otherwise open after it closes,
     which the import would then refuse for a reason the teacher never wrote. */
  return monday < deadline ? monday : null;
}

/* A date on its own means the end of that day, for a deadline.
   ------------------------------------------------------------------
   "11/10/2026" parses to midnight, which is the first second of the Sunday
   rather than the last. Written into a spreadsheet as a deadline it reads as
   "you have until Sunday", and what it did was close the thing as Saturday
   night turned into Sunday. Nobody writing a term of homework means that.

   An opening date is the opposite and is already right: the start of the day is
   when something should appear. */
function endOfDayForDeadline(text, parsed) {
  if (!parsed) return parsed;
  return /\d{1,2}:\d{2}/.test(String(text)) ? parsed : parsed.set({ hour: 23, minute: 55 });
}

function readAssignmentCsv(content, { weeks, timezone }) {
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  return rows.map((row, index) => {
    const line = index + 2; // The header is line 1, so a spreadsheet agrees.
    const title = columnFrom(row, ASSIGNMENT_COLUMNS.title);
    const instructions = columnFrom(row, ASSIGNMENT_COLUMNS.instructions);
    const deadlineText = columnFrom(row, ASSIGNMENT_COLUMNS.deadline);
    const visibleText = columnFrom(row, ASSIGNMENT_COLUMNS.visible);
    const hardText = columnFrom(row, ASSIGNMENT_COLUMNS.hard).toLowerCase();
    const questions = questionsFrom(row);
    const story = columnFrom(row, ASSIGNMENT_COLUMNS.story);
    const kindText = columnFrom(row, ASSIGNMENT_COLUMNS.kind).toLowerCase();
    // A story makes it a listening activity; the column only has to disagree.
    const kind = kindText ? (kindText.startsWith('listen') ? 'listening' : 'written')
      : (story ? 'listening' : 'written');
    const expected = expectedFrom(row);
    const marks = marksFrom(row);
    const showText = ['yes', 'y', 'true', 'shown', 'show'].includes(
      columnFrom(row, ASSIGNMENT_COLUMNS.showText).toLowerCase());

    const deadline = endOfDayForDeadline(deadlineText, parseScheduleDate(deadlineText, timezone));
    const visible = visibleText
      ? parseScheduleDate(visibleText, timezone)
      : defaultOpensFor(deadline, timezone);

    /* Homework belongs to the teaching week its deadline falls in, which is what
       puts it in the right column of the tracker. Working it out from the date
       means one less column to fill in and one less thing to get wrong. */
    const week = deadline
      ? weeks.find((candidate) => {
          const start = DateTime.fromJSDate(new Date(candidate.week_start)).setZone(timezone).startOf('day');
          return deadline >= start && deadline < start.plus({ days: 7 });
        })
      : null;

    const problems = [];
    if (!title) problems.push('no title');
    if (!deadlineText) problems.push('no deadline');
    else if (!deadline) problems.push(`the deadline “${deadlineText}” could not be read`);
    if (visibleText && !visible) problems.push(`the opening date “${visibleText}” could not be read`);
    if (visible && deadline && visible >= deadline) problems.push('it opens after it closes');
    if (!questions.length) problems.push('no questions — add a Q1 column');
    if (kind === 'listening') {
      if (!story) problems.push('a listening activity needs a story — add a Story column');
      /* Marked against what the teacher wrote, so a listening row with no
         expected answers would be handed to the model with nothing to mark
         against and come back as full marks for everybody. */
      const answered = expected.filter(Boolean).length;
      if (!answered) problems.push('no expected answers — add A1, A2, A3 beside the questions');
      else if (answered < questions.length) {
        problems.push(`${questions.length - answered} question${questions.length - answered === 1 ? ' has' : 's have'} no expected answer`);
      }
      const bad = marks.slice(0, questions.length).find((value) => value && !/^\d+$/.test(value));
      if (bad) problems.push(`the marks “${bad}” should be a whole number`);
    }
    if (hardText && !SOFT_DEADLINE_WORDS.includes(hardText) && !HARD_DEADLINE_WORDS.includes(hardText)) {
      problems.push(`the deadline type “${hardText}” is not one I know — write hard or soft`);
    }

    return {
      line, title, instructions, questions, kind, story, showText,
      /* Lined up with the questions rather than left ragged, so row three of the
         sheet and question three of the assignment are the same thing. */
      expected: questions.map((_, index) => expected[index] || ''),
      marks: questions.map((_, index) => Number(marks[index]) || 1),
      deadlineAt: deadline ? deadline.toUTC().toISO() : null,
      visibleAt: visible ? visible.toUTC().toISO() : null,
      localDeadline: deadline ? deadline.toFormat('ccc d LLL yyyy, HH:mm') : deadlineText,
      localVisible: visible ? visible.toFormat('ccc d LLL yyyy, HH:mm') : (visibleText || null),
      // So the preview can say "we chose this" rather than showing it as given.
      opensAssumed: Boolean(!visibleText && visible),
      hardDeadline: !SOFT_DEADLINE_WORDS.includes(hardText),
      weekId: week?.id || null,
      weekLabel: week ? String(week.week_start).slice(0, 10) : null,
      past: Boolean(deadline && deadline < DateTime.now().setZone(timezone)),
      problems,
    };
  });
}

router.get('/classes/:id/assignment-template', asyncRoute(async (req, res) => {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const zone = klass.timezone || config.defaultTimezone;
  const first = DateTime.now().setZone(zone).plus({ days: 7 }).set({ hour: 20, minute: 0 });
  const row = (offset, title) => [
    `${first.plus({ weeks: offset }).toFormat('dd/MM/yyyy HH:mm')}`,
    title,
    '"Work through the handout before you start. Answer in Irish where you can."',
    `${first.plus({ weeks: offset }).minus({ days: 6 }).toFormat('dd/MM/yyyy HH:mm')}`,
    'hard',
  ];
  /* The listening row is in the template rather than only in the instructions.
     A teacher who has never made one can see what the columns do by reading
     across a filled-in line, which is how a spreadsheet is learned. */
  const lines = [
    'Deadline,Title,Instructions,Opens,Deadline type,Story,Show text,Q1,Q2,Q3,A1,A2,A3,M1,M2,M3',
    [...row(0, 'Week 1: An aimsir chaite'), '', '',
      '"Write five sentences in the past tense."', '"Which verbs are irregular?"', '"Translate: I went to the shop."',
      '', '', '', '', '', ''].join(','),
    [...row(1, 'Week 2: An aimsir láithreach'), '', '',
      '"Write five sentences in the present tense."', '"When do you use tá and when is?"', '',
      '', '', '', '', '', ''].join(','),
    [...row(2, 'Week 3: Cluastuiscint'),
      '"Bhí Máire ina cónaí i dteach beag cois farraige i gConamara. Gach maidin, shiúil sí síos go dtí an trá lena madra, Bran."',
      'no',
      '"Cá raibh Máire ina cónaí?"', '"Cad é ainm an mhadra?"', '"Cathain a shiúil sí go dtí an trá?"',
      '"I dteach beag cois farraige i gConamara"', '"Bran"', '"Gach maidin"',
      '2', '1', '2'].join(','),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="assignments-template.csv"');
  res.send(`${lines.join('\n')}\n`);
}));

async function assignmentCsvRows(req) {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return { error: 'Class not found.', status: 404 };
  const content = await fs.readFile(req.file.path, 'utf8');
  await fs.unlink(req.file.path).catch(() => {});
  const weeks = (await query('SELECT id, week_start FROM weeks WHERE class_id=$1 ORDER BY week_start', [klass.id])).rows;
  try {
    return {
      klass,
      timezone: klass.timezone || config.defaultTimezone,
      rows: readAssignmentCsv(content, { weeks, timezone: klass.timezone || config.defaultTimezone }),
    };
  } catch (error) {
    return { error: `That file could not be read as a CSV. ${error.message}`, status: 400 };
  }
}

router.post('/classes/:id/assignment-preview', diskUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
  const result = await assignmentCsvRows(req);
  if (result.error) return res.status(result.status).json({ error: result.error });
  if (!result.rows.length) return res.status(400).json({ error: 'That file has a header but no rows.' });
  res.json({
    timezone: result.timezone,
    rows: result.rows,
    ready: result.rows.filter((row) => !row.problems.length).length,
    problems: result.rows.filter((row) => row.problems.length).length,
    // How many stories will still need reading aloud once these are created.
    listening: result.rows.filter((row) => !row.problems.length && row.kind === 'listening').length,
  });
}));

router.post('/classes/:id/assignment-import', diskUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
  const result = await assignmentCsvRows(req);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const usable = result.rows.filter((row) => !row.problems.length);
  if (!usable.length) return res.status(400).json({ error: 'No row in that file could be used. Fix the problems listed and try again.' });

  const created = [];
  await transaction(async (client) => {
    for (const row of usable) {
      const inserted = await client.query(
        `INSERT INTO assignments(class_id,week_id,title,instructions,visible_at,deadline_at,
           hard_deadline,reminders_enabled,created_by,kind,listening_text,listening_text_shown)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11) RETURNING id,title`,
        [result.klass.id, row.weekId, row.title, row.instructions,
         row.visibleAt || new Date().toISOString(), row.deadlineAt, row.hardDeadline, req.user.id,
         row.kind, row.kind === 'listening' ? row.story : null, row.showText],
      );
      for (const [position, prompt] of row.questions.entries()) {
        await client.query(
          `INSERT INTO assignment_questions(assignment_id,position,prompt,required,expected_answer,marks)
           VALUES ($1,$2,$3,true,$4,$5)`,
          [inserted.rows[0].id, position, prompt, row.expected[position] || null, row.marks[position]],
        );
      }
      created.push(inserted.rows[0]);
    }
  });

  await audit({ actorId: req.user.id, action: 'assignment.bulk_imported', entityType: 'class',
    entityId: result.klass.id, metadata: { created: created.length, skipped: result.rows.length - usable.length }, ip: req.ip });
  res.status(201).json({
    created: created.length,
    // Imported without audio: the stories still have to be read aloud.
    listening: usable.filter((row) => row.kind === 'listening').length,
    skipped: result.rows.filter((row) => row.problems.length),
  });
}));

/* Building a listening activity.
   ------------------------------------------------------------------
   The story is typed or pasted once and read aloud as many times as there are
   dialects. Rendering is a separate step from saving the text, deliberately:
   ABAIR takes a few seconds per dialect, and a teacher who has just fixed a
   typo should not have to wait for three recordings to find out whether the
   typo is fixed.

   A story edited after it was read aloud leaves the recordings out of step, so
   each row remembers the text it was made from and the screen says which are
   stale rather than playing last week's story under this week's questions. */
router.get('/assignments/:id/listening', asyncRoute(async (req, res) => {
  const assignment = await one('SELECT id, listening_text FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const current = hashText(assignment.listening_text);
  const rows = (await query(
    'SELECT * FROM listening_audio WHERE assignment_id=$1 ORDER BY dialect', [req.params.id])).rows;

  res.json({
    provider: providerName(),
    configured: ttsConfigured(),
    // True on a machine using the local stand-in voice, which is not Irish.
    standIn: isStandIn(),
    dialects: DIALECTS.map((dialect) => {
      const row = rows.find((item) => item.dialect === dialect.key);
      return {
        ...dialect,
        state: row?.state || 'none',
        error: row?.error || null,
        voice: row?.voice || null,
        seconds: row?.seconds || null,
        sizeBytes: row?.size_bytes || null,
        source: row?.source || null,
        /* The words on the tab the student presses, when they are not the plain
           dialect name. Called tag rather than label because the dialect already
           has a label and one silently overwriting the other would put "Corca
           Dhuibhne" where the heading "Munster" belongs. */
        tag: row?.label || null,
        originalName: row?.original_name || null,
        // Only synthesis can be synthesised; standard has no voice.
        synthesisable: SYNTHESISABLE.includes(dialect.key),
        /* Made from a story that has since been edited. An upload is not derived
           from the story, so editing the story does not make it wrong the way it
           makes a synthesised reading wrong. */
        stale: Boolean(row && row.state === 'ready' && row.source !== 'upload' && row.text_hash !== current),
      };
    }),
  });
}));

/* A recording the teacher made.
   ------------------------------------------------------------------
   The better answer most of the time, and the cheaper one: a real speaker in a
   real dialect beats a synthesiser, and a file recorded once costs nothing every
   time it is played. Synthesis stays for anybody without a recording to hand.

   Written under a random name into the private store, and served only through
   the authenticated media route, the same as every other recording here. */
const listeningUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    /* Read from the name when the browser will not say what it is, so a
       perfectly good recording is not turned away for arriving unlabelled. */
    const type = audioTypeFor(file);
    if (!type) {
      return callback(Object.assign(new Error(`${originalName(file) || 'That file'} is not an audio format the portal reads. MP3, M4A, WAV, OGG, FLAC and WebM all work.`), { status: 400 }));
    }
    file.resolvedType = type;
    callback(null, true);
  },
});

router.post('/assignments/:id/listening/upload', listeningUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an audio file.' });
  const parsed = z.object({
    dialect: z.enum(DIALECT_KEYS),
    // What the student is told they are listening to, if not the plain dialect.
    label: z.string().trim().max(60).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Say which dialect this recording is in.') });

  const assignment = await one('SELECT id FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  await fs.mkdir(audioDir(), { recursive: true });
  const type = req.file.resolvedType || audioTypeFor(req.file) || 'audio/mpeg';
  const extension = audioExtension(type) || '.mp3';
  const name = `${crypto.randomUUID()}${extension}`;
  const filePath = path.join(audioDir(), name);
  await fs.writeFile(filePath, req.file.buffer);

  /* The old file goes only once the new one is safely written, and only if it
     is a different file: a failed write must not leave the week with nothing to
     play. */
  const previous = await one(
    'SELECT file_path FROM listening_audio WHERE assignment_id=$1 AND dialect=$2',
    [assignment.id, parsed.data.dialect],
  );

  const row = await one(
    `INSERT INTO listening_audio(assignment_id,dialect,state,source,label,file_path,mime_type,
       size_bytes,original_name,uploaded_by,text_hash,voice,error)
     VALUES ($1,$2,'ready','upload',$3,$4,$5,$6,$7,$8,NULL,NULL,NULL)
     ON CONFLICT (assignment_id,dialect) DO UPDATE
       SET state='ready', source='upload', label=EXCLUDED.label, file_path=EXCLUDED.file_path,
           mime_type=EXCLUDED.mime_type, size_bytes=EXCLUDED.size_bytes,
           original_name=EXCLUDED.original_name, uploaded_by=EXCLUDED.uploaded_by,
           text_hash=NULL, voice=NULL, error=NULL, updated_at=now()
     RETURNING *`,
    [assignment.id, parsed.data.dialect, parsed.data.label || null, filePath,
     type, req.file.size, originalName(req.file).slice(0, 200) || null, req.user.id],
  );

  if (previous?.file_path && path.basename(previous.file_path) !== name) {
    await fs.unlink(previous.file_path).catch(() => {});
  }

  await audit({ actorId: req.user.id, action: 'listening.uploaded', entityType: 'assignment',
    entityId: assignment.id, metadata: { dialect: parsed.data.dialect, bytes: req.file.size }, ip: req.ip });
  res.status(201).json({ dialect: row.dialect, label: row.label, sizeBytes: row.size_bytes });
}));

/* Renaming the tag without re-uploading the file. */
router.patch('/assignments/:id/listening/:dialect', asyncRoute(async (req, res) => {
  const parsed = z.object({ label: z.string().trim().max(60) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'That label is too long.') });
  const row = await one(
    `UPDATE listening_audio SET label=$1, updated_at=now()
     WHERE assignment_id=$2 AND dialect=$3 RETURNING dialect, label`,
    [parsed.data.label || null, req.params.id, req.params.dialect],
  );
  if (!row) return res.status(404).json({ error: 'There is no recording for that dialect yet.' });
  res.json(row);
}));

router.delete('/assignments/:id/listening/:dialect', asyncRoute(async (req, res) => {
  const row = await one(
    'DELETE FROM listening_audio WHERE assignment_id=$1 AND dialect=$2 RETURNING file_path',
    [req.params.id, req.params.dialect],
  );
  if (!row) return res.status(404).json({ error: 'There is no recording for that dialect.' });
  if (row.file_path) await fs.unlink(row.file_path).catch(() => {});
  await audit({ actorId: req.user.id, action: 'listening.removed', entityType: 'assignment',
    entityId: req.params.id, metadata: { dialect: req.params.dialect }, ip: req.ip });
  res.json({ ok: true });
}));

/* Every story in a class that has not been read aloud yet.
   ------------------------------------------------------------------
   A term imported from a spreadsheet arrives as twelve listening activities
   with no audio, and rendering them one at a time through twelve dialogs is the
   work the import was supposed to remove. */
router.post('/classes/:id/listening/render-all', asyncRoute(async (req, res) => {
  const parsed = z.object({
    dialects: z.array(z.enum(SYNTHESISABLE)).min(1).max(SYNTHESISABLE.length),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Choose at least one dialect.') });
  if (!ttsConfigured()) {
    return res.status(503).json({ error: 'No speech service is set up yet, so nothing can be read aloud.' });
  }

  const pending = (await query(
    `SELECT a.id, a.title, a.listening_text FROM assignments a
     WHERE a.class_id=$1 AND a.kind='listening' AND a.status<>'archived'
       AND COALESCE(a.listening_text,'') <> ''
     ORDER BY a.deadline_at`,
    [req.params.id],
  )).rows;

  const done = [];
  for (const assignment of pending) {
    for (const dialect of parsed.data.dialects) {
      /* Skipped when it is already made from this exact story, so running it
         again after adding one row does not re-read the other eleven. */
      const existing = await one(
        'SELECT state, text_hash FROM listening_audio WHERE assignment_id=$1 AND dialect=$2',
        [assignment.id, dialect],
      );
      /* An upload is never replaced by a synthesised reading. Somebody who
         recorded their own voice did so on purpose. */
      if (existing?.source === 'upload') continue;
      if (existing?.state === 'ready' && existing.text_hash === hashText(assignment.listening_text)) continue;

      await query(
        `INSERT INTO listening_audio(assignment_id,dialect,state) VALUES ($1,$2,'pending')
         ON CONFLICT (assignment_id,dialect) DO UPDATE SET state='pending', error=NULL, updated_at=now()`,
        [assignment.id, dialect],
      );
      try {
        const made = await renderStory({ assignmentId: assignment.id, dialect, text: assignment.listening_text });
        await query(
          `UPDATE listening_audio SET state='ready', error=NULL, voice=$1, file_path=$2,
             mime_type=$3, size_bytes=$4, text_hash=$5, updated_at=now()
           WHERE assignment_id=$6 AND dialect=$7`,
          [made.voice, made.filePath, made.mimeType, made.sizeBytes, made.textHash, assignment.id, dialect],
        );
        done.push({ title: assignment.title, dialect, state: 'ready' });
      } catch (error) {
        await query(
          `UPDATE listening_audio SET state='failed', error=$1, updated_at=now()
           WHERE assignment_id=$2 AND dialect=$3`,
          [String(error.message).slice(0, 400), assignment.id, dialect],
        );
        done.push({ title: assignment.title, dialect, state: 'failed', error: error.message });
      }
    }
  }

  await audit({ actorId: req.user.id, action: 'listening.rendered_all', entityType: 'class',
    entityId: req.params.id, metadata: { made: done.length }, ip: req.ip });
  res.json({
    stories: pending.length,
    made: done.filter((item) => item.state === 'ready').length,
    failed: done.filter((item) => item.state === 'failed'),
  });
}));

router.post('/assignments/:id/listening/render', asyncRoute(async (req, res) => {
  const parsed = z.object({
    dialects: z.array(z.enum(SYNTHESISABLE)).min(1).max(SYNTHESISABLE.length),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Choose at least one dialect.') });

  const assignment = await one(
    'SELECT id, listening_text FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (!String(assignment.listening_text || '').trim()) {
    return res.status(400).json({ error: 'Write the story first, then have it read out.' });
  }
  if (!ttsConfigured()) {
    return res.status(503).json({
      error: 'No speech service is set up yet, so the story cannot be read aloud. Add ABAIR_API_KEY and restart.',
    });
  }

  /* One at a time, and one failing does not stop the others: a teacher with two
     working dialects and a broken one should get the two. */
  const results = [];
  for (const dialect of parsed.data.dialects) {
    await query(
      `INSERT INTO listening_audio(assignment_id,dialect,state)
       VALUES ($1,$2,'pending')
       ON CONFLICT (assignment_id,dialect) DO UPDATE SET state='pending', error=NULL, updated_at=now()`,
      [assignment.id, dialect],
    );
    try {
      const made = await renderStory({
        assignmentId: assignment.id, dialect, text: assignment.listening_text,
      });
      await query(
        `UPDATE listening_audio SET state='ready', error=NULL, voice=$1, file_path=$2,
           mime_type=$3, size_bytes=$4, text_hash=$5, updated_at=now()
         WHERE assignment_id=$6 AND dialect=$7`,
        [made.voice, made.filePath, made.mimeType, made.sizeBytes, made.textHash, assignment.id, dialect],
      );
      results.push({ dialect, state: 'ready' });
    } catch (error) {
      await query(
        `UPDATE listening_audio SET state='failed', error=$1, updated_at=now()
         WHERE assignment_id=$2 AND dialect=$3`,
        [String(error.message).slice(0, 400), assignment.id, dialect],
      );
      results.push({ dialect, state: 'failed', error: error.message });
    }
  }

  await audit({ actorId: req.user.id, action: 'listening.rendered', entityType: 'assignment',
    entityId: assignment.id, metadata: { results }, ip: req.ip });
  res.json({ results });
}));

router.put('/assignments/:id', asyncRoute(async (req, res) => {
  const assignment = await one('SELECT * FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const parsed = z.object({ title: z.string().min(2), instructions: z.string(), loomUrl: z.string().url().nullable().optional(), visibleAt: z.string().datetime(), deadlineAt: z.string().datetime(), hardDeadline: z.boolean(), remindersEnabled: z.boolean(), status: z.enum(['draft','published','archived']),
    // Sent by the edit form since the day it was built, and silently stripped here until now.
    weekId: z.string().uuid().nullable().optional(), questions: z.array(z.object({ prompt: z.string().min(1), imageUrl: z.string().nullable().optional(), required: z.boolean(), expectedAnswer: z.string().max(4000).default(''), marks: z.coerce.number().int().min(0).max(100).default(1) })).min(1),
    kind: z.enum(['written', 'listening']).default('written'),
    listeningText: z.string().max(40000).default(''),
    listeningTextShown: z.boolean().default(false), resources: z.array(resourceSchema).default([]),
    allowUploads: z.boolean().default(false),
    uploadsRequired: z.boolean().default(false),
    acceptedFileTypes: z.array(z.enum(Object.keys(FILE_TYPE_GROUPS))).default(['image', 'pdf']),
    maxFiles: z.coerce.number().int().min(1).max(10).default(3),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: assignmentProblem(parsed.error) });
  const a = parsed.data;
  await transaction(async (client) => {
    await client.query(`UPDATE assignments SET title=$1,instructions=$2,loom_url=$3,visible_at=$4,deadline_at=$5,hard_deadline=$6,reminders_enabled=$7,status=$8,
       allow_uploads=$9,uploads_required=$10,accepted_file_types=$11::jsonb,max_files=$12,kind=$13,listening_text=$14,listening_text_shown=$15,
       week_id=$16,updated_at=now() WHERE id=$17`,
      [a.title, a.instructions, a.loomUrl || null, a.visibleAt, a.deadlineAt, a.hardDeadline, a.remindersEnabled, a.status,
       a.allowUploads, a.allowUploads && a.uploadsRequired, JSON.stringify(a.acceptedFileTypes), a.maxFiles,
       a.kind, a.kind === 'listening' ? a.listeningText : null, a.listeningTextShown,
       /* Omitted means untouched; sent as null means "no weekly tracker column". */
       a.weekId === undefined ? assignment.week_id : a.weekId, assignment.id]);
    await deadlineMoved(assignment.id, assignment.deadline_at, a.deadlineAt);
    await client.query('DELETE FROM assignment_questions WHERE assignment_id=$1', [assignment.id]);
    await client.query('DELETE FROM assignment_resources WHERE assignment_id=$1', [assignment.id]);
    for (const [position, question] of a.questions.entries()) await client.query(`INSERT INTO assignment_questions(assignment_id,position,prompt,image_url,required,expected_answer,marks) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [assignment.id, position, question.prompt, question.imageUrl || null, question.required, question.expectedAnswer || null, question.marks]);
    for (const resource of a.resources) await client.query(`INSERT INTO assignment_resources(assignment_id,file_name,file_url,mime_type) VALUES ($1,$2,$3,$4)`, [assignment.id, resource.fileName, resource.fileUrl, resource.mimeType || null]);
  });
  await audit({ actorId: req.user.id, action: 'assignment.updated', entityType: 'assignment', entityId: assignment.id, ip: req.ip });
  res.json({ ok: true });
}));

/* Deleting an assignment takes every student's work with it, so the count is
   reported first and the caller has to say the number back. Archiving is the
   answer most of the time: it disappears from the tracker and the student view
   while the submissions stay. */
router.get('/assignments/:id/impact', asyncRoute(async (req, res) => {
  const assignment = await one('SELECT id,title,status FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const counts = await one(
    `SELECT
       count(*) FILTER (WHERE status<>'draft')::int submissions,
       count(*) FILTER (WHERE status='returned')::int returned,
       count(*) FILTER (WHERE status='draft')::int drafts
     FROM homework_submissions WHERE assignment_id=$1`,
    [assignment.id],
  );
  res.json({ assignment, ...counts });
}));

/* Dragging an assignment to another day on the calendar.
   ------------------------------------------------------------------
   The whole thing shifts by a number of days. The deadline lands on the day it
   was dropped on at the time it already had; the date it becomes visible moves
   by the same number of days, so it stays as many days before the deadline as
   it was; and if it has been reopened, the reopened date moves with it, because
   that is the date the chip was drawn on and the chip should land where it was
   dropped.

   Done here rather than in the browser, in the class's own timezone, because
   "the time stays the same" means eight o'clock in Dublin. A move from October
   to November crosses the clock change, and shifting a UTC instant by
   twenty-four hours a day would land it at seven. Luxon's plus({ days }) in the
   zone keeps the wall clock.

   The teaching week is re-derived from the new deadline, so the tracker column
   follows the drag. A day-only date arrives, never a time, so nothing about the
   time can be changed by accident from here. */
/* What follows a deadline that has moved.
   ------------------------------------------------------------------
   Reminders are logged per (student, assignment, template) with no date in the
   key, so once "tomorrow" had gone out for the old date nothing ever went out
   for the new one. A teacher who extended a deadline by a week was, without
   knowing it, switching the reminders off. The three deadline reminders are
   cleared so the new date gets its own; nothing else keyed on the assignment is
   touched. Only when the instant really changed, so a save that leaves the
   deadline alone does not re-arm reminders that already went out.

   A student who had dismissed the old overdue card is un-dismissed for the
   same reason: the thing they dismissed is not the thing that is due now. */
async function deadlineMoved(assignmentId, from, to) {
  if (new Date(from).getTime() === new Date(to).getTime()) return;
  await query(
    `DELETE FROM email_deliveries WHERE assignment_id=$1 AND template_key IN ('tomorrow','twoHours','thirtyMinutes')`,
    [assignmentId],
  );
  await query(`DELETE FROM dismissed_deadlines WHERE kind='homework' AND ref_id=$1`, [assignmentId]);
}

router.patch('/assignments/:id/move', asyncRoute(async (req, res) => {
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const instant = z.string().datetime().nullable();
  const parsed = z.object({
    onDate: day.optional(),
    /* Undo. The exact instants the move started from, written back verbatim,
       rather than the same sum run in reverse: a sum in reverse lands an hour
       out when either end fell in the spring clock change, and lands on a day
       nobody chose if the assignment was reopened in between. */
    restore: z.object({
      deadlineAt: z.string().datetime(), visibleAt: instant, reopenedUntil: instant,
      weekId: z.string().uuid().nullable(),
    }).optional(),
    /* The day the chip was dragged from, as the calendar drew it. With both
       ends as plain dates the number of days is arithmetic on the calendar the
       teacher was looking at, and nothing depends on which zone drew the chip
       and which zone did the sum. Older callers send only onDate and get the
       plotted day worked out here instead. */
    fromDate: day.optional(),
  }).safeParse(req.body);
  if (!parsed.success || (!parsed.data.onDate && !parsed.data.restore)) {
    return res.status(400).json({ error: 'Say which day to move it to.' });
  }

  const assignment = await one(
    `SELECT a.*, c.timezone FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=$1`,
    [req.params.id],
  );
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (assignment.status === 'archived') {
    return res.status(409).json({ error: 'Restore this assignment before moving it.' });
  }
  const previous = {
    deadlineAt: assignment.deadline_at, visibleAt: assignment.visible_at,
    reopenedUntil: assignment.reopened_until, weekId: assignment.week_id,
  };

  if (parsed.data.restore) {
    const r = parsed.data.restore;
    const row = await one(
      `UPDATE assignments SET deadline_at=$1, visible_at=$2, reopened_until=$3, week_id=$4, updated_at=now()
       WHERE id=$5 RETURNING *`,
      [r.deadlineAt, r.visibleAt, r.reopenedUntil, r.weekId, assignment.id],
    );
    await deadlineMoved(assignment.id, assignment.deadline_at, r.deadlineAt);
    await audit({ actorId: req.user.id, action: 'assignment.move_undone', entityType: 'assignment', entityId: row.id,
      metadata: { to: r.deadlineAt }, ip: req.ip });
    return res.json({ ...row, moved: -1, restored: true, previous });
  }

  /* A class whose timezone column holds nonsense would otherwise turn every
     drag into "that is not a real date", which blames the wrong thing. */
  const wanted = assignment.timezone || config.defaultTimezone;
  const zone = DateTime.now().setZone(wanted).isValid ? wanted : config.defaultTimezone;
  const inZone = (value) => DateTime.fromJSDate(new Date(value)).setZone(zone);
  const plotted = parsed.data.fromDate
    ? DateTime.fromISO(parsed.data.fromDate, { zone }).startOf('day')
    : inZone(assignment.reopened_until || assignment.deadline_at).startOf('day');
  const target = DateTime.fromISO(parsed.data.onDate, { zone }).startOf('day');
  if (!target.isValid || !plotted.isValid) return res.status(400).json({ error: 'That is not a real date.' });

  const delta = Math.round(target.diff(plotted, 'days').days);
  if (delta === 0) return res.json({ ...assignment, moved: 0 });

  const shift = (value) => (value ? inZone(value).plus({ days: delta }).toUTC().toISO() : null);
  const deadlineAt = shift(assignment.deadline_at);
  /* Keep the same number of days before the deadline, unless students can
     already see it. Shifting a live assignment's visible date into the future
     would take it off their screens mid-work, which no drag was meant to do. */
  const alreadyVisible = assignment.visible_at && new Date(assignment.visible_at).getTime() <= Date.now();
  const visibleAt = alreadyVisible ? assignment.visible_at : shift(assignment.visible_at);
  const reopenedUntil = shift(assignment.reopened_until);

  /* Which teaching week the new deadline falls in. Only re-filed when it was
     filed at all: "no weekly tracker column" is a choice and stays one. */
  let weekId = assignment.week_id;
  if (weekId) {
    const newDeadline = DateTime.fromISO(deadlineAt).setZone(zone);
    const week = await one(
      `SELECT id FROM weeks WHERE class_id=$1
         AND week_start <= $2::date AND week_start > ($2::date - interval '7 days')
       ORDER BY week_start DESC LIMIT 1`,
      [assignment.class_id, newDeadline.toISODate()],
    );
    weekId = week?.id || null;
  }

  const row = await one(
    `UPDATE assignments SET deadline_at=$1, visible_at=$2, reopened_until=$3, week_id=$4, updated_at=now()
     WHERE id=$5 RETURNING *`,
    [deadlineAt, visibleAt, reopenedUntil, weekId, assignment.id],
  );
  await deadlineMoved(assignment.id, assignment.deadline_at, deadlineAt);
  await audit({
    actorId: req.user.id, action: 'assignment.moved', entityType: 'assignment', entityId: row.id,
    metadata: { days: delta, from: assignment.deadline_at, to: deadlineAt }, ip: req.ip,
  });
  res.json({ ...row, moved: delta, previousDay: plotted.toISODate(), previous, keptVisible: Boolean(alreadyVisible) });
}));

router.delete('/assignments/:id', asyncRoute(async (req, res) => {
  const assignment = await one('SELECT id,title,class_id FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const counts = await one(
    `SELECT count(*) FILTER (WHERE status<>'draft')::int submissions FROM homework_submissions WHERE assignment_id=$1`,
    [assignment.id],
  );
  const confirmed = Number(req.query.confirmSubmissions ?? req.body?.confirmSubmissions ?? -1);
  if (counts.submissions > 0 && confirmed !== counts.submissions) {
    return res.status(409).json({
      error: `“${assignment.title}” has ${counts.submissions} student submission${counts.submissions === 1 ? '' : 's'}. Deleting removes ${counts.submissions === 1 ? 'it' : 'them'} permanently. Archive it instead to keep the work.`,
      submissions: counts.submissions,
    });
  }
  await query('DELETE FROM assignments WHERE id=$1', [assignment.id]);
  await audit({ actorId: req.user.id, action: 'assignment.deleted', entityType: 'assignment', entityId: assignment.id, metadata: { title: assignment.title, submissions: counts.submissions }, ip: req.ip });
  res.json({ ok: true, deletedSubmissions: counts.submissions });
}));

router.post('/assignments/:id/archive', asyncRoute(async (req, res) => {
  const archived = req.body?.archived !== false;
  const row = await one(
    `UPDATE assignments SET status=$1, archived_at=$2, archived_by=$3, updated_at=now()
     WHERE id=$4 RETURNING *`,
    [archived ? 'archived' : 'published', archived ? new Date().toISOString() : null, archived ? req.user.id : null, req.params.id],
  );
  if (!row) return res.status(404).json({ error: 'Assignment not found.' });
  await audit({ actorId: req.user.id, action: archived ? 'assignment.archived' : 'assignment.restored', entityType: 'assignment', entityId: row.id, ip: req.ip });
  res.json(row);
}));

/** One-off .ics for a single deadline, for people who prefer a file to a feed. */
router.get('/assignments/:id/calendar.ics', asyncRoute(async (req, res) => {
  const assignment = await one(
    `SELECT a.*, c.programme_name, c.day_of_week, c.start_time
     FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=$1`,
    [req.params.id],
  );
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const body = buildCalendar({
    name: assignment.title,
    description: 'Gaeilgeoir Guides homework deadline',
    events: [assignmentEvent(assignment, { classLabel: classLabel(assignment) })],
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${assignment.title.replace(/[^\w -]/g, '').slice(0, 60) || 'assignment'}.ics"`);
  res.send(body);
}));

router.post('/assignments/:id/reopen', asyncRoute(async (req, res) => {
  const parsed = z.object({ reopenedUntil: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Choose a new closing time.') });
  const row = await one(`UPDATE assignments SET reopened_until=$1,updated_at=now() WHERE id=$2 RETURNING *`, [parsed.data.reopenedUntil, req.params.id]);
  if (!row) return res.status(404).json({ error: 'Assignment not found.' });
  await audit({ actorId: req.user.id, action: 'assignment.reopened', entityType: 'assignment', entityId: row.id, metadata: parsed.data, ip: req.ip });
  res.json(row);
}));

/* Per-week check-in control: skip a week entirely, move when it opens or closes,
   or make the deadline soft so late submissions are still accepted. */
router.put('/weeks/:id/checkin', asyncRoute(async (req, res) => {
  const parsed = z.object({
    enabled: z.boolean().optional(),
    releaseAt: z.string().datetime().optional(),
    dueAt: z.string().datetime().optional(),
    hardDeadline: z.boolean().optional(),
    label: z.string().max(120).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid check-in setting.') });
  const current = await one('SELECT * FROM weeks WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Week not found.' });
  const data = parsed.data;
  if (data.releaseAt && data.dueAt && new Date(data.dueAt) <= new Date(data.releaseAt)) {
    return res.status(400).json({ error: 'The check-in must close after it opens.' });
  }
  const row = await one(
    `UPDATE weeks SET checkin_enabled=$1, checkin_release_at=$2, checkin_due_at=$3,
       checkin_hard_deadline=$4, label=$5, notes=$6
     WHERE id=$7 RETURNING *`,
    [
      data.enabled ?? current.checkin_enabled,
      data.releaseAt ?? current.checkin_release_at,
      data.dueAt ?? current.checkin_due_at,
      data.hardDeadline ?? current.checkin_hard_deadline,
      data.label === undefined ? current.label : (data.label || null),
      data.notes === undefined ? current.notes : (data.notes || null),
      current.id,
    ],
  );
  await audit({ actorId: req.user.id, action: 'week.checkin_updated', entityType: 'week', entityId: row.id, metadata: data, ip: req.ip });
  res.json(row);
}));

/* Removing a check-in rather than switching it off.
   ------------------------------------------------------------------
   Switching one off leaves the week in the tracker as a deliberate gap, which
   is the right answer for a bank holiday. Deleting is for a week that should
   never have been created — a term scheduled two weeks too long, or a run built
   against the wrong dates.

   A week can hold submitted work, so the count comes first and the delete
   refuses unless it has been acknowledged. Attendance and homework hang off the
   same week; the impact says so rather than discovering it afterwards. */
router.get('/weeks/:id/impact', asyncRoute(async (req, res) => {
  const week = await one('SELECT id, week_start, label, checkin_enabled FROM weeks WHERE id=$1', [req.params.id]);
  if (!week) return res.status(404).json({ error: 'Week not found.' });
  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM checkins WHERE week_id=$1 AND status<>'draft') checkins,
       (SELECT count(*)::int FROM attendance WHERE week_id=$1) attendance,
       (SELECT count(*)::int FROM assignments WHERE week_id=$1) assignments`,
    [req.params.id],
  );
  res.json({ ...week, ...counts, work: counts.checkins + counts.attendance });
}));

router.delete('/weeks/:id', asyncRoute(async (req, res) => {
  const week = await one('SELECT * FROM weeks WHERE id=$1', [req.params.id]);
  if (!week) return res.status(404).json({ error: 'Week not found.' });
  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM checkins WHERE week_id=$1 AND status<>'draft') checkins,
       (SELECT count(*)::int FROM attendance WHERE week_id=$1) attendance,
       (SELECT count(*)::int FROM assignments WHERE week_id=$1) assignments`,
    [req.params.id],
  );

  /* Homework is planned against a week and outlives it in a way a check-in does
     not, so a week still carrying an assignment is refused outright rather than
     taking it down as well. Move or delete the homework first. */
  if (counts.assignments > 0) {
    return res.status(409).json({
      error: `This week still carries ${counts.assignments} assignment${counts.assignments === 1 ? '' : 's'}. Delete or move ${counts.assignments === 1 ? 'it' : 'them'} first.`,
      assignments: counts.assignments,
    });
  }

  const work = counts.checkins + counts.attendance;
  const acknowledged = Number(req.query.confirmWork ?? -1);
  if (work > 0 && acknowledged !== work) {
    return res.status(409).json({
      error: `This week holds ${counts.checkins} submitted check-in${counts.checkins === 1 ? '' : 's'} and ${counts.attendance} attendance record${counts.attendance === 1 ? '' : 's'}. Deleting removes ${work === 1 ? 'it' : 'them'} permanently. Switch the check-in off instead to keep everything.`,
      work,
    });
  }

  await query('DELETE FROM weeks WHERE id=$1', [req.params.id]);
  await audit({ actorId: req.user.id, action: 'week.deleted', entityType: 'week', entityId: req.params.id,
    metadata: { weekStart: week.week_start, ...counts }, ip: req.ip });
  res.status(204).end();
}));

/* Build a run of check-ins across a term, with exceptions switched off. */
router.post('/classes/:id/checkin-schedule', asyncRoute(async (req, res) => {
  const parsed = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    skipWeekStarts: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120).default([]),
    releaseDay: z.coerce.number().int().min(1).max(7).default(CHECKIN_DEFAULTS.releaseDay),
    releaseHour: z.coerce.number().int().min(0).max(23).default(CHECKIN_DEFAULTS.releaseHour),
    releaseMinute: z.coerce.number().int().min(0).max(59).default(CHECKIN_DEFAULTS.releaseMinute),
    dueDay: z.coerce.number().int().min(1).max(7).default(CHECKIN_DEFAULTS.dueDay),
    dueHour: z.coerce.number().int().min(0).max(23).default(CHECKIN_DEFAULTS.dueHour),
    dueMinute: z.coerce.number().int().min(0).max(59).default(CHECKIN_DEFAULTS.dueMinute),
    hardDeadline: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Choose a start date, an end date and the weekly times.') });

  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });

  const result = await scheduleCheckins(klass, parsed.data);
  await audit({ actorId: req.user.id, action: 'class.checkins_scheduled', entityType: 'class', entityId: klass.id, metadata: { ...parsed.data, ...result }, ip: req.ip });
  res.json(result);
}));

/* Turn several weeks on or off in one go — a mid-term break is rarely one week. */
router.post('/weeks/bulk-checkin', asyncRoute(async (req, res) => {
  const parsed = z.object({ weekIds: z.array(z.string().uuid()).min(1).max(60), enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Choose at least one week.') });
  const result = await query('UPDATE weeks SET checkin_enabled=$1 WHERE id=ANY($2::uuid[]) RETURNING id', [parsed.data.enabled, parsed.data.weekIds]);
  await audit({ actorId: req.user.id, action: 'week.checkin_bulk_updated', entityType: 'week', metadata: { count: result.rowCount, enabled: parsed.data.enabled }, ip: req.ip });
  res.json({ updated: result.rowCount });
}));

/* Nudge one student about one missing thing. Refused once they have submitted,
   because the point of a nudge is that something is outstanding. */
router.post('/nudge', asyncRoute(async (req, res) => {
  const parsed = z.object({
    studentId: z.string().uuid(),
    type: z.enum(['checkin', 'homework']),
    weekId: z.string().uuid().optional(),
    assignmentId: z.string().uuid().optional(),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(8000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Write a subject and a message.') });
  const { studentId, type, weekId, assignmentId, subject, body } = parsed.data;

  const student = await one(`SELECT id,name,email,withdrawn_at FROM users WHERE id=$1 AND role='student' AND active=true`, [studentId]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (student.withdrawn_at) return res.status(409).json({ error: `${student.name.split(' ')[0]} has withdrawn from the course.` });

  if (type === 'checkin') {
    const existing = await one(`SELECT status FROM checkins WHERE week_id=$1 AND student_id=$2`, [weekId, studentId]);
    if (existing && existing.status !== 'draft') return res.status(409).json({ error: `${student.name.split(' ')[0]} has already submitted this check-in.` });
  } else {
    const existing = await one(`SELECT status FROM homework_submissions WHERE assignment_id=$1 AND student_id=$2`, [assignmentId, studentId]);
    if (existing && existing.status !== 'draft') return res.status(409).json({ error: `${student.name.split(' ')[0]} has already submitted this homework.` });
  }

  let status = 'failed';
  let error = null;
  try {
    const result = await sendNudge({ student, subject, body, metadata: { nudgeType: type, weekId, assignmentId } });
    status = result.simulated ? 'simulated' : 'sent';
  } catch (sendError) {
    error = sendError.message;
    console.error('Nudge delivery failed', sendError);
  }
  await audit({ actorId: req.user.id, action: 'student.nudged', entityType: 'user', entityId: student.id, metadata: { type, weekId, assignmentId, status, error }, ip: req.ip });
  if (status === 'failed') return res.status(502).json({ error: `The email could not be sent: ${error}` });
  res.json({ ok: true, status, to: student.email });
}));

/* When this student was last nudged about this item, so nobody gets pestered. */
router.get('/nudge/history', asyncRoute(async (req, res) => {
  const { studentId, type, weekId, assignmentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'A student is required.' });
  const row = await one(
    `SELECT created_at, metadata FROM audit_logs
     WHERE action='student.nudged' AND entity_id=$1
       AND metadata->>'type'=$2
       AND COALESCE(metadata->>'weekId','') = COALESCE($3,'')
       AND COALESCE(metadata->>'assignmentId','') = COALESCE($4,'')
     ORDER BY created_at DESC LIMIT 1`,
    [String(studentId), String(type || 'checkin'), weekId || null, assignmentId || null],
  );
  res.json({ lastSentAt: row?.created_at || null });
}));

router.post('/checkins/:id/return', asyncRoute(async (req, res) => {
  const parsed = z.object({ feedback: z.string().max(12000).default('') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid feedback.') });
  const current = await one('SELECT id, teacher_audio_path FROM checkins WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Check-in not found.' });
  // A voice note can carry the whole reply, so text is only required without one.
  if (!parsed.data.feedback.trim() && !current.teacher_audio_path) {
    return res.status(400).json({ error: 'Write a reply or record a voice note before returning this check-in.' });
  }
  const row = await one(`UPDATE checkins SET teacher_feedback=$1,status='returned',feedback_state='returned',feedback_returned_at=now(),feedback_read_at=NULL,updated_at=now() WHERE id=$2 RETURNING *`, [parsed.data.feedback, current.id]);
  await audit({ actorId: req.user.id, action: 'checkin.returned', entityType: 'checkin', entityId: row.id, metadata: { voiceNote: Boolean(current.teacher_audio_path) }, ip: req.ip });
  res.json(withVoiceNote(row, 'checkin'));
}));

router.post('/checkins/:id/redraft', asyncRoute(async (req, res) => {
  const row = await one(`SELECT ch.*,u.name,u.email,w.week_start FROM checkins ch JOIN users u ON u.id=ch.student_id JOIN weeks w ON w.id=ch.week_id WHERE ch.id=$1`, [req.params.id]);
  if (!row || row.status === 'draft') return res.status(400).json({ error: 'A submitted check-in is required.' });
  await query(`UPDATE checkins SET feedback_state='generating' WHERE id=$1`, [row.id]);
  try {
    const feedback = await draftCheckinFeedback({ student: { name: row.name, email: row.email }, weekStart: row.week_start, answers: row.answers });
    const updated = await one(`UPDATE checkins SET ai_feedback=$1,teacher_feedback=$1,feedback_state='ai_drafted',updated_at=now() WHERE id=$2 RETURNING *`, [feedback, row.id]);
    res.json(withVoiceNote(updated, 'checkin'));
  } catch (error) {
    await query(`UPDATE checkins SET feedback_state='failed' WHERE id=$1`, [row.id]);
    throw error;
  }
}));

router.post('/homework/:id/return', asyncRoute(async (req, res) => {
  const parsed = z.object({
    corrections: z.string().max(20000).default(''),
    generalFeedback: z.string().max(12000).default(''),
    /* The marks as the teacher is returning them. Sent back from the screen
       rather than left as they were found, because the point of the review is
       that they can be changed: a mark the teacher disagreed with and corrected
       must not be quietly replaced by the machine's on the way out. */
    marks: z.array(z.object({
      position: z.coerce.number().int().min(0).max(200),
      awarded: z.coerce.number().int().min(0).max(100),
      available: z.coerce.number().int().min(0).max(100),
      note: z.string().max(2000).default(''),
    })).max(200).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue?.path?.[0] === 'marks'
      ? `Question ${Number(issue.path[1]) + 1}: marks have to be a whole number between 0 and what the question is worth.`
      : 'Invalid feedback.' });
  }
  const current = await one('SELECT id, teacher_audio_path FROM homework_submissions WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Homework submission not found.' });
  const hasText = parsed.data.corrections.trim() && parsed.data.generalFeedback.trim();
  if (!hasText && !current.teacher_audio_path) {
    return res.status(400).json({ error: 'Complete both feedback sections, or record a voice note.' });
  }
  if (parsed.data.marks) {
    const awarded = parsed.data.marks.reduce((total, mark) => total + Math.min(mark.awarded, mark.available), 0);
    const available = parsed.data.marks.reduce((total, mark) => total + mark.available, 0);
    await query(
      'UPDATE homework_submissions SET teacher_marks=$1::jsonb, teacher_score=$2, teacher_max=$3 WHERE id=$4',
      [JSON.stringify(parsed.data.marks), awarded, available, current.id],
    );
  }
  const row = await one(`UPDATE homework_submissions SET teacher_corrections=$1,teacher_general_feedback=$2,status='returned',feedback_state='returned',feedback_returned_at=now(),feedback_read_at=NULL,updated_at=now() WHERE id=$3 RETURNING *`, [parsed.data.corrections, parsed.data.generalFeedback, current.id]);
  await audit({ actorId: req.user.id, action: 'homework.returned', entityType: 'homework_submission', entityId: row.id, metadata: { voiceNote: Boolean(current.teacher_audio_path) }, ip: req.ip });
  res.json(withVoiceNote(row, 'homework'));
}));

router.post('/homework/:id/redraft', asyncRoute(async (req, res) => {
  const row = await one(`SELECT hs.*,u.name,u.email,a.title,a.instructions FROM homework_submissions hs JOIN users u ON u.id=hs.student_id JOIN assignments a ON a.id=hs.assignment_id WHERE hs.id=$1`, [req.params.id]);
  if (!row || row.status === 'draft') return res.status(400).json({ error: 'Submitted homework is required.' });
  const questions = await query(`SELECT position,prompt FROM assignment_questions WHERE assignment_id=$1 ORDER BY position`, [row.assignment_id]);
  const answers = Array.isArray(row.answers) ? row.answers : [];
  await query(`UPDATE homework_submissions SET feedback_state='generating' WHERE id=$1`, [row.id]);
  try {
    const feedback = await draftHomeworkFeedback({ student: { name: row.name, email: row.email }, assignment: { title: row.title, instructions: row.instructions }, questions: questions.rows.map((q, index) => ({ prompt: q.prompt, answer: answers[index] || '' })) });
    const updated = await one(`UPDATE homework_submissions SET ai_corrections=$1,ai_general_feedback=$2,teacher_corrections=$1,teacher_general_feedback=$2,feedback_state='ai_drafted',updated_at=now() WHERE id=$3 RETURNING *`, [feedback.corrections, feedback.generalFeedback, row.id]);
    res.json(withVoiceNote(updated, 'homework'));
  } catch (error) {
    await query(`UPDATE homework_submissions SET feedback_state='failed' WHERE id=$1`, [row.id]);
    throw error;
  }
}));


router.patch('/checkins/:id/feedback-draft', asyncRoute(async (req, res) => {
  const parsed = z.object({ feedback: z.string().max(12000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid feedback draft.') });
  const current = await one('SELECT * FROM checkins WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Check-in not found.' });
  if (current.status === 'draft') return res.status(409).json({ error: 'The student has not submitted this check-in.' });
  const state = current.feedback_state === 'returned' ? 'returned' : 'teacher_edited';
  const row = await one(
    `UPDATE checkins SET teacher_feedback=$1,feedback_state=$2,updated_at=now()
     WHERE id=$3 RETURNING *`,
    [parsed.data.feedback, state, current.id],
  );
  res.json(withVoiceNote(row, 'checkin'));
}));

router.patch('/homework/:id/feedback-draft', asyncRoute(async (req, res) => {
  const parsed = z.object({
    corrections: z.string().max(20000),
    generalFeedback: z.string().max(12000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid homework feedback draft.') });
  const current = await one('SELECT * FROM homework_submissions WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Homework submission not found.' });
  if (current.status === 'draft') return res.status(409).json({ error: 'The student has not submitted this homework.' });
  const state = current.feedback_state === 'returned' ? 'returned' : 'teacher_edited';
  const row = await one(
    `UPDATE homework_submissions SET teacher_corrections=$1,teacher_general_feedback=$2,
       feedback_state=$3,updated_at=now()
     WHERE id=$4 RETURNING *`,
    [parsed.data.corrections, parsed.data.generalFeedback, state, current.id],
  );
  res.json(withVoiceNote(row, 'homework'));
}));

/* A student's profile: who they are, how they are doing, and the private notes an
   administrator keeps about them. Notes are never exposed to students. */
router.get('/students/:id/profile', asyncRoute(async (req, res) => {
  const student = await one(
    `SELECT u.id,u.name,u.email,u.active,u.must_change_password,u.last_login_at,u.created_at,u.withdrawn_at,
            u.phone,
            u.address_line1,u.address_line2,u.address_county,u.eircode,u.address_updated_at,
            c.id class_id,c.programme_name,c.day_of_week,c.start_time,c.timezone
     FROM users u
     LEFT JOIN class_students cs ON cs.student_id=u.id AND cs.active=true
     LEFT JOIN classes c ON c.id=cs.class_id
     WHERE u.id=$1 AND u.role='student'`,
    [req.params.id],
  );
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const [notes, stats] = await Promise.all([
    query(
      `SELECT n.*, u.name author_name FROM student_notes n
       LEFT JOIN users u ON u.id=n.author_id
       WHERE n.student_id=$1 ORDER BY n.pinned DESC, n.created_at DESC LIMIT 200`,
      [student.id],
    ),
    one(
      `SELECT
        (SELECT count(*)::int FROM attendance a WHERE a.student_id=$1 AND a.status='live') live_weeks,
        (SELECT count(*)::int FROM attendance a WHERE a.student_id=$1 AND a.status<>'unknown') recorded_weeks,
        (SELECT count(*)::int FROM checkins ch WHERE ch.student_id=$1 AND ch.status<>'draft') checkins_submitted,
        (SELECT count(*)::int FROM homework_submissions hs WHERE hs.student_id=$1 AND hs.status<>'draft') homework_submitted,
        (SELECT round(avg((ch.answers->>'understanding')::numeric),1) FROM checkins ch
          WHERE ch.student_id=$1 AND ch.status<>'draft' AND ch.answers->>'understanding' ~ '^[0-9]+$') avg_understanding,
        (SELECT round(avg((ch.answers->>'confidence')::numeric),1) FROM checkins ch
          WHERE ch.student_id=$1 AND ch.status<>'draft' AND ch.answers->>'confidence' ~ '^[0-9]+$') avg_confidence`,
      [student.id],
    ),
  ]);

  const withdrawal = await one('SELECT * FROM course_withdrawals WHERE student_id=$1', [student.id]);
  res.json({
    student: { ...student, classLabel: student.class_id ? classLabel(student) : null },
    notes: notes.rows,
    stats,
    withdrawal,
  });
}));

router.post('/students/:id/notes', asyncRoute(async (req, res) => {
  const parsed = z.object({ body: z.string().trim().min(1).max(8000), pinned: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Write a note before saving.') });
  const student = await one(`SELECT id FROM users WHERE id=$1 AND role='student'`, [req.params.id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const row = await one(
    `INSERT INTO student_notes(student_id,author_id,body,pinned) VALUES ($1,$2,$3,$4) RETURNING *`,
    [student.id, req.user.id, parsed.data.body, parsed.data.pinned],
  );
  await audit({ actorId: req.user.id, action: 'student.note_added', entityType: 'user', entityId: student.id, ip: req.ip });
  res.status(201).json({ ...row, author_name: req.user.name });
}));

router.patch('/notes/:noteId', asyncRoute(async (req, res) => {
  const parsed = z.object({ body: z.string().trim().min(1).max(8000).optional(), pinned: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid note update.') });
  const current = await one('SELECT * FROM student_notes WHERE id=$1', [req.params.noteId]);
  if (!current) return res.status(404).json({ error: 'Note not found.' });
  const row = await one(
    `UPDATE student_notes SET body=$1, pinned=$2, updated_at=now() WHERE id=$3 RETURNING *`,
    [parsed.data.body ?? current.body, parsed.data.pinned ?? current.pinned, current.id],
  );
  res.json(row);
}));

router.delete('/notes/:noteId', asyncRoute(async (req, res) => {
  const row = await one('DELETE FROM student_notes WHERE id=$1 RETURNING id, student_id', [req.params.noteId]);
  if (!row) return res.status(404).json({ error: 'Note not found.' });
  await audit({ actorId: req.user.id, action: 'student.note_deleted', entityType: 'user', entityId: row.student_id, ip: req.ip });
  res.status(204).end();
}));

/* Dictation. The audio is transcribed and cleaned, then discarded — only the text
   comes back. `light` mode is used for the Irish corrections box, where the cleanup
   model is forbidden from touching the Irish being taught. */
router.post('/dictate', audioUpload.single('audio'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No recording was received.' });
  const mode = req.body?.mode === 'light' ? 'light' : 'full';
  const result = await dictate({
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    filename: `dictation${audioExtension(req.file.mimetype)}`,
    mode,
  });
  await audit({ actorId: req.user.id, action: 'feedback.dictated', entityType: 'dictation', metadata: { mode, cleaned: result.cleaned, characters: result.text.length }, ip: req.ip });
  res.json(result);
}));

const VOICE_TARGETS = {
  checkin: { table: 'checkins', label: 'Check-in' },
  homework: { table: 'homework_submissions', label: 'Homework submission' },
  /* A comment on the class board carries the same four columns, so recording,
     replacing and removing all work here without a second implementation.
     Recording stays the teacher's: students have no recorder anywhere. */
  comment: { table: 'discussion_posts', label: 'Comment' },
};

function voiceTarget(type) {
  const target = VOICE_TARGETS[type];
  if (!target) throw Object.assign(new Error('Unknown feedback type.'), { status: 400 });
  return target;
}

router.post('/voice-note/:type/:id', audioUpload.single('audio'), asyncRoute(async (req, res) => {
  const target = voiceTarget(req.params.type);
  if (!req.file) return res.status(400).json({ error: 'No recording was received.' });
  const seconds = Math.max(0, Math.round(Number(req.body?.seconds) || 0));
  if (seconds > 15 * 60) return res.status(413).json({ error: 'Voice notes are limited to 15 minutes.' });

  const current = await one(`SELECT id, teacher_audio_path FROM ${target.table} WHERE id=$1`, [req.params.id]);
  if (!current) return res.status(404).json({ error: `${target.label} not found.` });

  const fileName = `voice-${crypto.randomUUID()}${audioExtension(req.file.mimetype)}`;
  await fs.writeFile(path.join(config.privateUploadDir, fileName), req.file.buffer);
  // Replacing a note should not leave the previous recording on disk.
  if (current.teacher_audio_path) await fs.unlink(path.join(config.privateUploadDir, current.teacher_audio_path)).catch(() => {});

  const row = await one(
    `UPDATE ${target.table}
       SET teacher_audio_path=$1, teacher_audio_mime=$2, teacher_audio_seconds=$3,
           teacher_audio_recorded_at=now(), updated_at=now()
     WHERE id=$4 RETURNING *`,
    [fileName, String(req.file.mimetype).split(';')[0], seconds, current.id],
  );
  await audit({ actorId: req.user.id, action: 'feedback.voice_note_recorded', entityType: req.params.type, entityId: current.id, metadata: { seconds }, ip: req.ip });
  res.status(201).json(withVoiceNote(row, req.params.type));
}));

router.delete('/voice-note/:type/:id', asyncRoute(async (req, res) => {
  const target = voiceTarget(req.params.type);
  const current = await one(`SELECT id, teacher_audio_path FROM ${target.table} WHERE id=$1`, [req.params.id]);
  if (!current) return res.status(404).json({ error: `${target.label} not found.` });
  if (current.teacher_audio_path) await fs.unlink(path.join(config.privateUploadDir, current.teacher_audio_path)).catch(() => {});
  const row = await one(
    `UPDATE ${target.table}
       SET teacher_audio_path=NULL, teacher_audio_mime=NULL, teacher_audio_seconds=NULL,
           teacher_audio_recorded_at=NULL, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [current.id],
  );
  await audit({ actorId: req.user.id, action: 'feedback.voice_note_removed', entityType: req.params.type, entityId: current.id, ip: req.ip });
  res.json(withVoiceNote(row, req.params.type));
}));

router.get('/audit', asyncRoute(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const result = await query(`SELECT al.*,u.name actor_name FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_id ORDER BY al.created_at DESC LIMIT $1`, [limit]);
  res.json(result.rows);
}));

/* ------------------------------------------------------------------
   Class board
   ------------------------------------------------------------------ */

router.get('/community/:classId', asyncRoute(async (req, res) => {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const sort = req.query.sort === 'hot' ? 'hot' : 'new';
  const categoryId = req.query.categoryId || null;
  // Removed threads stay listed for the administrator, greyed, with a way back,
  // and scheduled ones show here before they show anywhere else.
  const [threads, categories, contributors] = await Promise.all([
    listThreads({ classId: klass.id, viewerId: req.user.id, includeDeleted: true, includeScheduled: true, categoryId, sort }),
    listCategories(klass.id),
    topContributors({ classId: klass.id }),
  ]);
  /* The teacher is at the same class the students are, so the column beside the
     feed says when it is, the same as it does for them. */
  const sessions = (await query(
    `SELECT id, starts_at, duration_minutes, join_url, label, cancelled
     FROM class_sessions WHERE class_id=$1 AND starts_at > now() - interval '4 hours'
     ORDER BY starts_at`, [klass.id],
  )).rows;
  const boardChanges = (await query(
    'SELECT on_date, kind, moved_to FROM class_date_changes WHERE class_id=$1', [klass.id])).rows;
  const next = nextClassWithSessions(klass, sessions, undefined, boardChanges);
  const overrideWeeks = next
    ? (await query('SELECT week_start, join_url FROM weeks WHERE class_id=$1 AND week_start=$2', [klass.id, next.weekStart])).rows
    : [];

  res.json({
    class: { ...klass, label: classLabel(klass) },
    nextClass: next
      ? { ...next, joinUrl: next.sessionJoinUrl || joinLinkFor(klass, overrideWeeks, next), note: next.sessionLabel || klass.join_note || null }
      : null,
    threads, categories, contributors, sort, categoryId,
    /* How many people an email about this class would actually reach, counted
       by the same rule that decides who gets one. A number worked out separately
       for the screen is a number free to disagree with what happens, and this is
       the number somebody reads before mailing thirty people. */
    emailAudience: await boardAudienceCount(klass.id),
  });
}));

/* Scheduling a term of posts at once.
   ------------------------------------------------------------------
   Writing one post a week into the composer for twelve weeks is the thing this
   is meant to replace. A spreadsheet is where that planning already happens, so
   the import takes one and answers with what it made of every row before
   anything is written — a wrong date column in row nine should not leave eight
   posts on the board and a half-finished import.

   The dry run and the real thing share one parser, so what is previewed is
   exactly what lands. */
const SCHEDULE_COLUMNS = {
  date: ['date', 'publish', 'publish at', 'published at', 'when', 'appears at', 'scheduled for'],
  title: ['title', 'subject', 'heading'],
  body: ['body', 'message', 'post', 'text', 'content'],
  category: ['category', 'section', 'topic'],
  pinned: ['pinned', 'pin'],
};

function columnFrom(row, names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((candidate) => candidate.trim().toLowerCase() === name);
    if (key && String(row[key]).trim()) return String(row[key]).trim();
  }
  return '';
}

/* A spreadsheet writes dates the way the person's computer does. Accepts the
   ISO form, the Irish day-first form, and either with a time; anything else is
   reported on its own row rather than guessed at. */
function parseScheduleDate(text, timezone) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const iso = DateTime.fromISO(raw, { zone: timezone });
  if (iso.isValid) return iso;
  for (const format of ['dd/MM/yyyy HH:mm', 'dd/MM/yyyy', 'd/M/yyyy HH:mm', 'd/M/yyyy',
                        'dd-MM-yyyy HH:mm', 'dd-MM-yyyy', 'yyyy-MM-dd HH:mm']) {
    const parsed = DateTime.fromFormat(raw, format, { zone: timezone });
    if (parsed.isValid) return parsed;
  }
  return null;
}

function readScheduleCsv(content, { categories, timezone }) {
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  return rows.map((row, index) => {
    const line = index + 2; // Header is line 1, so a person counting in a spreadsheet agrees.
    const title = columnFrom(row, SCHEDULE_COLUMNS.title);
    const body = columnFrom(row, SCHEDULE_COLUMNS.body);
    const dateText = columnFrom(row, SCHEDULE_COLUMNS.date);
    const categoryText = columnFrom(row, SCHEDULE_COLUMNS.category);
    const pinnedText = columnFrom(row, SCHEDULE_COLUMNS.pinned).toLowerCase();

    const when = parseScheduleDate(dateText, timezone);
    const category = categoryText
      ? categories.find((item) => item.name.trim().toLowerCase() === categoryText.toLowerCase())
      : null;

    const problems = [];
    if (!title) problems.push('no title');
    if (!body) problems.push('no message');
    if (!dateText) problems.push('no date');
    else if (!when) problems.push(`the date “${dateText}” could not be read`);
    if (categoryText && !category) problems.push(`there is no category called “${categoryText}”`);

    return {
      line, title, body,
      publishedAt: when ? when.toUTC().toISO() : null,
      localWhen: when ? when.toFormat('ccc d LLL yyyy, HH:mm') : dateText,
      categoryId: category?.id || null,
      categoryName: category?.name || (categoryText || null),
      pinned: ['yes', 'y', 'true', '1', 'pin', 'pinned'].includes(pinnedText),
      past: Boolean(when && when < DateTime.now().setZone(timezone)),
      problems,
    };
  });
}

/* A file to start from, so nobody has to guess the column names. */
router.get('/community/:classId/schedule-template', asyncRoute(async (req, res) => {
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const categories = await listCategories(klass.id);
  const zone = klass.timezone || config.defaultTimezone;
  const first = DateTime.now().setZone(zone).plus({ days: 7 }).set({ hour: 9, minute: 0 });
  const name = (categories[0]?.name) || 'General';
  const second = categories[1]?.name || name;

  const lines = [
    'Date,Title,Body,Category,Pinned',
    `${first.toFormat('dd/MM/yyyy HH:mm')},Welcome to week one,"Post the week ahead here. A comma is fine inside quotes, and so is a line break.",${name},yes`,
    `${first.plus({ weeks: 1 }).toFormat('dd/MM/yyyy HH:mm')},Week two: what we are covering,"One row per post. Delete these three rows and write your own.",${second},no`,
    `${first.plus({ weeks: 2 }).toFormat('dd/MM/yyyy HH:mm')},Week three,"Dates can be written 25/12/2026 09:00 or 2026-12-25T09:00. Times are ${zone}.",${name},no`,
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="scheduled-posts-template.csv"');
  res.send(`${lines.join('\n')}\n`);
}));

/* Read the file and say what would happen. Nothing is written. */
router.post('/community/:classId/schedule-preview', diskUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) { await fs.unlink(req.file.path).catch(() => {}); return res.status(404).json({ error: 'Class not found.' }); }
  const content = await fs.readFile(req.file.path, 'utf8');
  await fs.unlink(req.file.path).catch(() => {});

  let rows;
  try {
    rows = readScheduleCsv(content, {
      categories: await listCategories(klass.id),
      timezone: klass.timezone || config.defaultTimezone,
    });
  } catch (error) {
    return res.status(400).json({ error: `That file could not be read as a CSV. ${error.message}` });
  }
  if (!rows.length) return res.status(400).json({ error: 'That file has a header but no rows.' });
  res.json({
    timezone: klass.timezone || config.defaultTimezone,
    rows,
    ready: rows.filter((row) => !row.problems.length).length,
    problems: rows.filter((row) => row.problems.length).length,
  });
}));

/* Write them. Rows with problems are skipped and named rather than silently
   dropped, and the whole thing is one transaction so a failure halfway leaves
   the board as it was. */
router.post('/community/:classId/schedule-import', diskUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) { await fs.unlink(req.file.path).catch(() => {}); return res.status(404).json({ error: 'Class not found.' }); }
  const content = await fs.readFile(req.file.path, 'utf8');
  await fs.unlink(req.file.path).catch(() => {});

  let rows;
  try {
    rows = readScheduleCsv(content, {
      categories: await listCategories(klass.id),
      timezone: klass.timezone || config.defaultTimezone,
    });
  } catch (error) {
    return res.status(400).json({ error: `That file could not be read as a CSV. ${error.message}` });
  }

  const usable = rows.filter((row) => !row.problems.length);
  if (!usable.length) return res.status(400).json({ error: 'No row in that file could be used. Fix the problems listed and try again.' });

  const created = [];
  await transaction(async (client) => {
    for (const row of usable) {
      const thread = await client.query(
        `INSERT INTO discussion_threads(class_id,author_id,title,body,category_id,pinned,published_at,last_activity_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id,title,published_at`,
        [klass.id, req.user.id, row.title, row.body, row.categoryId, row.pinned, row.publishedAt],
      );
      created.push(thread.rows[0]);
    }
  });

  await audit({ actorId: req.user.id, action: 'community.schedule.imported', entityType: 'class',
    entityId: klass.id, metadata: { created: created.length, skipped: rows.length - usable.length }, ip: req.ip });
  res.status(201).json({
    created: created.length,
    skipped: rows.filter((row) => row.problems.length),
  });
}));

/* What is queued, for the calendar. Everything not yet published, oldest first,
   so it reads as a plan rather than as a feed. */
router.get('/community/:classId/scheduled', asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT t.id, t.title, t.body, t.pinned, t.published_at, c.name category_name, c.id category_id
     FROM discussion_threads t
     LEFT JOIN discussion_categories c ON c.id=t.category_id
     WHERE t.class_id=$1 AND t.deleted_at IS NULL AND t.published_at > now()
     ORDER BY t.published_at`, [req.params.classId],
  );
  const klass = await one('SELECT timezone FROM classes WHERE id=$1', [req.params.classId]);
  res.json({ timezone: klass?.timezone || config.defaultTimezone, posts: result.rows });
}));

router.get('/community/thread/:id', asyncRoute(async (req, res) => {
  const thread = await getThread({ threadId: req.params.id, viewerId: req.user.id, includeDeleted: true, includeScheduled: true });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });
  res.json(thread);
}));

/* Attachments a post can carry. Files are uploaded here first and referenced by
   the post that follows, so a half-written post never leaves an orphan row. */
/* An uploaded file comes back as a path under /uploads rather than a full
   address, because the host is whatever the portal is being served from.
   Requiring a complete URL here rejected every uploaded document and — because
   the whole body then failed to parse — reported it as a missing title. */
const attachmentUrl = z.string().min(1).max(2000).refine(
  (value) => value.startsWith('/uploads/') || /^https?:\/\//i.test(value),
  'An attachment must be an uploaded file or a web address.',
);

const attachmentInput = z.object({
  kind: z.enum(['file', 'loom', 'gif', 'youtube']),
  url: attachmentUrl,
  storedName: z.string().max(200).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
  sizeBytes: z.coerce.number().int().min(0).optional().default(0),
});

router.post('/community/:classId/threads', asyncRoute(async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(2).max(200),
    body: z.string().trim().min(1).max(20000),
    categoryId: z.string().uuid().nullable().optional(),
    pinned: z.boolean().optional().default(false),
    /* The "email the class" tick. Sent by the composer since the box was
       drawn, and stripped here until now, so every post emailed the class
       whatever the box said. Absent means yes, which is what always happened. */
    notifyEmail: z.boolean().optional().default(true),
    // Absent or past means publish now. The clock does the rest of the work.
    publishedAt: z.string().datetime().nullable().optional(),
    attachments: z.array(attachmentInput).max(6).optional().default([]),
  }).safeParse(req.body);
  // An attachment that will not validate is not a missing title, and saying so
  // sends somebody hunting through a form that is already filled in.
  if (!parsed.success) {
    const onAttachment = parsed.error.issues[0]?.path?.[0] === 'attachments';
    return res.status(400).json({
      error: onAttachment
        ? 'That attachment could not be added. Try uploading it again.'
        : 'Give the post a title and a message.',
    });
  }
  const klass = await one('SELECT id FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const category = parsed.data.categoryId
    ? await one('SELECT id FROM discussion_categories WHERE id=$1 AND class_id=$2', [parsed.data.categoryId, klass.id])
    : null;
  /* Any Loom or YouTube link in the body becomes a player and leaves the text,
     so nobody has to find a separate field for it. */
  const video = extractVideoLinks(parsed.data.body);
  const row = await createThread({
    classId: klass.id, authorId: req.user.id,
    title: parsed.data.title, body: video.body || parsed.data.body,
    categoryId: category?.id || null,
    publishedAt: parsed.data.publishedAt || null,
    attachments: [...parsed.data.attachments, ...video.attachments],
  });
  if (parsed.data.pinned) await query('UPDATE discussion_threads SET pinned=true WHERE id=$1', [row.id]);
  if (!parsed.data.notifyEmail) await query('UPDATE discussion_threads SET notify_email=false WHERE id=$1', [row.id]);
  await audit({ actorId: req.user.id, action: 'community.thread_created', entityType: 'thread', entityId: row.id, metadata: { scheduled: Boolean(parsed.data.publishedAt), notifyEmail: parsed.data.notifyEmail }, ip: req.ip });
  res.status(201).json({ ...row, pinned: parsed.data.pinned });

  /* After the answer, because the post is saved either way and a class of thirty
     is thirty round trips to a mail server — long enough for the button to look
     stuck if it were waited on.

     Only when it is already published. A scheduled post is announced when it
     appears, by the sweep, since nothing runs at that moment: a post becomes
     visible by the clock passing rather than by anything happening. */
  if (!parsed.data.publishedAt) {
    query('UPDATE discussion_threads SET notified_at=now() WHERE id=$1', [row.id])
      .then(() => notifyNewPost(row.id))
      .catch((error) => console.error(`Could not announce post ${row.id}: ${error.message}`));
  }
}));

/* Rescheduling, or releasing something early. Setting it to now is how a
   scheduled post gets published on the spot. */
/* Categories on the board.
   ------------------------------------------------------------------
   The screen to manage these has always been there; the routes behind it were
   not, so the button did nothing and said nothing. Deleting one does not delete
   what was filed under it — the posts keep their place on the board and simply
   stop being filed, which is why the column is ON DELETE SET NULL. */
router.post('/community/:classId/categories', asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the category a name.') });
  const klass = await one('SELECT id FROM classes WHERE id=$1', [req.params.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });

  const clash = await one(
    'SELECT id FROM discussion_categories WHERE class_id=$1 AND lower(name)=lower($2)',
    [klass.id, parsed.data.name],
  );
  if (clash) return res.status(409).json({ error: `There is already a category called “${parsed.data.name}”.` });

  const next = await one(
    'SELECT COALESCE(max(position),-1)+1 position FROM discussion_categories WHERE class_id=$1', [klass.id]);
  const row = await one(
    'INSERT INTO discussion_categories(class_id,name,position) VALUES ($1,$2,$3) RETURNING *',
    [klass.id, parsed.data.name, next.position],
  );
  await audit({ actorId: req.user.id, action: 'community.category_created', entityType: 'category', entityId: row.id, metadata: { name: row.name }, ip: req.ip });
  res.status(201).json(row);
}));

router.patch('/community/categories/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the category a name.') });
  const row = await one('UPDATE discussion_categories SET name=$1 WHERE id=$2 RETURNING *',
    [parsed.data.name, req.params.id]);
  if (!row) return res.status(404).json({ error: 'Category not found.' });
  res.json(row);
}));

router.delete('/community/categories/:id', asyncRoute(async (req, res) => {
  const row = await one('SELECT id, name, class_id FROM discussion_categories WHERE id=$1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Category not found.' });
  await query('DELETE FROM discussion_categories WHERE id=$1', [req.params.id]);
  await audit({ actorId: req.user.id, action: 'community.category_deleted', entityType: 'category', entityId: req.params.id, metadata: { name: row.name }, ip: req.ip });
  res.status(204).end();
}));

/* Send the reminders that are due, now, rather than waiting for tonight. The
   same cycle the schedule runs, so what happens here is what happens then. */
/* This week's check-in reminder, sent by hand.
   ------------------------------------------------------------------
   Two routes rather than one, because the send cannot be taken back. The first
   says who it would reach and who has already had one this week; the second
   does it. Nobody should be finding out how many people they just emailed by
   reading the log afterwards. */
router.get('/reminders/checkin-preview', asyncRoute(async (req, res) => {
  const { previewCheckinReminder } = await import('../reminders.js');
  res.json(await previewCheckinReminder(req.query.classId || null));
}));

router.post('/reminders/checkin-now', asyncRoute(async (req, res) => {
  const { sendCheckinReminderNow } = await import('../reminders.js');
  const summary = await sendCheckinReminderNow({
    classId: req.body?.classId || null,
    actorId: req.user.id,
  });
  await audit({
    actorId: req.user.id, action: 'reminders.checkin_sent_manually',
    entityType: 'settings', entityId: 'reminders', metadata: summary, ip: req.ip,
  });
  res.json(summary);
}));

router.post('/reminders/run', asyncRoute(async (req, res) => {
  const { runReminderCycle } = await import('../reminders.js');
  const summary = await runReminderCycle();
  await audit({ actorId: req.user.id, action: 'reminders.run_manually', entityType: 'settings', entityId: 'reminders', metadata: summary, ip: req.ip });
  res.json(summary || { ok: true });
}));

/* The suggested reply to a board post.
   ------------------------------------------------------------------
   The drawer asks for this the moment an administrator opens a thread, and the
   answer is cached on the thread, so opening the same post twice does not draft
   twice. `regenerate` is the "draft again" button: it ignores the cache.

   Nothing here ever reaches a student — the draft lives in columns that
   forStudentView strips, and no student route reads them. */
/* Replying and reacting, from the teacher's side.
   ------------------------------------------------------------------
   The board is one screen serving two kinds of person, and the interface picks
   which half of the API to call by role — `boardApi()` resolves to /api/student
   or /api/admin. Both of these were written once, on the student side, so the
   teacher pressing the same buttons was addressing routes that did not exist and
   getting the generic Not found back. Commenting on the board was impossible for
   the only person expected to answer on it.

   The difference from the student versions is scope. A student may act only on
   their own class's board; a teacher answers on all of them, so there is no
   class to check against — only that the thread is real and not deleted. */

router.post('/community/thread/:id/replies', asyncRoute(async (req, res) => {
  const parsed = z.object({
    body: z.string().trim().min(1).max(20000),
    // Present when replying to one comment rather than to the post itself.
    parentId: z.string().uuid().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Write a reply before sending.') });
  const thread = await one(
    'SELECT * FROM discussion_threads WHERE id=$1 AND deleted_at IS NULL', [req.params.id],
  );
  if (!thread) return res.status(404).json({ error: 'Post not found.' });
  /* Deliberately not refused on a locked thread, unlike the student route. The
     teacher is who closes a conversation, and closing it to students while
     leaving a last word is the reason to close it. */
  const row = await createPost({ threadId: thread.id, authorId: req.user.id, body: parsed.data.body, parentId: parsed.data.parentId || null });
  await audit({ actorId: req.user.id, action: 'community.replied', entityType: 'thread', entityId: thread.id, ip: req.ip });
  res.status(201).json(row);

  // After the answer: the reply is saved either way, and the people in a
  // conversation are a handful of round trips to a mail server.
  notifyNewComment(row.id).catch((error) => {
    console.error(`Could not tell anybody about comment ${row.id}: ${error.message}`);
  });
}));

router.post('/community/react/:type/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ emoji: z.enum(REACTIONS) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'That is not one of the reactions.') });
  const type = req.params.type === 'post' ? 'post' : 'thread';
  const target = type === 'thread'
    ? await one('SELECT 1 FROM discussion_threads WHERE id=$1 AND deleted_at IS NULL', [req.params.id])
    : await one(
        `SELECT 1 FROM discussion_posts p JOIN discussion_threads t ON t.id=p.thread_id
         WHERE p.id=$1 AND p.deleted_at IS NULL AND t.deleted_at IS NULL`,
        [req.params.id],
      );
  if (!target) return res.status(404).json({ error: 'Not found.' });
  res.json(await toggleReaction({ userId: req.user.id, targetType: type, targetId: req.params.id, emoji: parsed.data.emoji }));
}));

router.post('/community/thread/:id/draft', asyncRoute(async (req, res) => {
  const parsed = z.object({ regenerate: z.boolean().optional().default(false) }).safeParse(req.body || {});
  const result = await draftReplyFor({
    threadId: req.params.id,
    force: parsed.success ? parsed.data.regenerate : false,
  });
  if (!result) return res.status(404).json({ error: 'Post not found.' });
  /* A missing key is the one failure worth naming outright, because it is
     configuration rather than a bad day for the model. */
  if (result.state === 'failed' && /Claude key/i.test(result.error || '')) {
    return res.status(409).json({ error: result.error });
  }
  res.json(result);
}));

router.patch('/community/thread/:id/schedule', asyncRoute(async (req, res) => {
  const parsed = z.object({ publishedAt: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Choose when this should go out.') });
  const row = await one(
    `UPDATE discussion_threads SET published_at=$1,
       -- A post that has not appeared yet has had no activity, so its sort key
       -- should follow it rather than stay at the moment it was written.
       last_activity_at=GREATEST($1, last_activity_at), updated_at=now()
     WHERE id=$2 RETURNING *`,
    [parsed.data.publishedAt, req.params.id],
  );
  if (!row) return res.status(404).json({ error: 'Post not found.' });
  await audit({ actorId: req.user.id, action: 'community.thread_rescheduled', entityType: 'thread', entityId: row.id, metadata: { publishedAt: parsed.data.publishedAt }, ip: req.ip });
  res.json(row);
}));

/* A document to hang off a post. Uploads are the administrator's alone: the
   class feed should not be a route by which arbitrary files arrive on the
   server.

   Held in memory rather than written straight to disk, because what a browser
   claims a file is cannot be trusted. A PDF dragged out of some file managers
   arrives labelled `application/octet-stream`, and a .docx is a zip, so both
   were being refused on a label while being perfectly good documents. The bytes
   decide instead. */
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: POST_ATTACHMENT_MB * 1024 * 1024, files: 1 },
});

/** What the file actually is, read from its first bytes. */
function sniffDocument(buffer, fileName) {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  if (buffer.length >= 4) {
    // %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { kind: 'pdf', mimeType: 'application/pdf', extension: '.pdf' };
    }
    // PK\x03\x04 — every Office file is a zip, so the extension separates them.
    const zip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    if (zip && extension === '.docx') {
      return {
        kind: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: '.docx',
      };
    }
  }
  return null;
}

router.post('/community/attachments', documentUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
  const document = sniffDocument(req.file.buffer, req.file.originalname);
  if (!document) {
    return res.status(400).json({
      error: 'Posts take PDFs and Word documents (.docx). For anything else, put it in the homework resources.',
    });
  }
  const storedName = `post-${crypto.randomUUID()}${document.extension}`;
  // Private: a file posted to a class board is for that class, not for anybody
  // who ends up with the address.
  await fs.writeFile(path.join(config.privateUploadDir, storedName), req.file.buffer);
  res.status(201).json({
    kind: 'file',
    // Rewritten to the authenticated route once the attachment row exists.
    url: `/uploads/${storedName}`,
    storedName,
    fileName: req.file.originalname.slice(0, 200),
    mimeType: document.mimeType,
    sizeBytes: req.file.size,
    label: document.kind.toUpperCase(),
  });
}));

router.patch('/community/thread/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ pinned: z.boolean().optional(), locked: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid thread change.') });
  const current = await one('SELECT * FROM discussion_threads WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Thread not found.' });
  const row = await one(
    `UPDATE discussion_threads SET pinned=$1,locked=$2,updated_at=now() WHERE id=$3 RETURNING *`,
    [parsed.data.pinned ?? current.pinned, parsed.data.locked ?? current.locked, current.id],
  );
  await audit({ actorId: req.user.id, action: 'community.thread_updated', entityType: 'thread', entityId: row.id, metadata: parsed.data, ip: req.ip });
  res.json(row);
}));

router.post('/community/thread/:id/removal', asyncRoute(async (req, res) => {
  const parsed = z.object({ removed: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Say whether to remove or restore.') });
  const row = await one(
    `UPDATE discussion_threads SET deleted_at=$1,deleted_by=$2,updated_at=now() WHERE id=$3 RETURNING *`,
    [parsed.data.removed ? new Date() : null, parsed.data.removed ? req.user.id : null, req.params.id],
  );
  if (!row) return res.status(404).json({ error: 'Thread not found.' });
  await audit({ actorId: req.user.id, action: parsed.data.removed ? 'community.thread_removed' : 'community.thread_restored', entityType: 'thread', entityId: row.id, ip: req.ip });
  res.json(row);
}));

/* Editing a comment on the board.
   ------------------------------------------------------------------
   Removing was the only thing that could be done to a comment, which makes a
   typo and a problem the same category of event. This is the ordinary repair.

   Who did it is recorded, because a teacher may edit a comment they did not
   write and the reader has no other way of knowing. The board shows that a
   comment was edited; it does not keep the earlier text, which would be a
   record of what somebody said before they were helped to say it better. */
router.patch('/community/post/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ body: z.string().trim().min(1).max(20000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'A comment cannot be empty.') });
  const current = await one('SELECT * FROM discussion_posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Comment not found.' });
  if (current.body === parsed.data.body) return res.json(current);
  const row = await one(
    `UPDATE discussion_posts SET body=$1, edited_at=now(), edited_by=$2, updated_at=now()
     WHERE id=$3 RETURNING *`,
    [parsed.data.body, req.user.id, current.id],
  );
  await audit({
    actorId: req.user.id, action: 'community.comment_edited', entityType: 'post', entityId: current.id,
    metadata: { threadId: current.thread_id, wasAuthor: current.author_id === req.user.id }, ip: req.ip,
  });
  res.json(row);
}));

router.post('/community/post/:id/removal', asyncRoute(async (req, res) => {
  const parsed = z.object({ removed: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Say whether to remove or restore.') });
  const row = await one(
    `UPDATE discussion_posts SET deleted_at=$1,deleted_by=$2,updated_at=now() WHERE id=$3 RETURNING *`,
    [parsed.data.removed ? new Date() : null, parsed.data.removed ? req.user.id : null, req.params.id],
  );
  if (!row) return res.status(404).json({ error: 'Reply not found.' });
  await audit({ actorId: req.user.id, action: parsed.data.removed ? 'community.post_removed' : 'community.post_restored', entityType: 'post', entityId: row.id, ip: req.ip });
  res.json(row);
}));

/* ------------------------------------------------------------------
   Courses
   ------------------------------------------------------------------ */

router.get('/courses', asyncRoute(async (_req, res) => {
  res.json({ courses: await listCoursesForAdmin() });
}));

router.get('/courses/:id', asyncRoute(async (req, res) => {
  const course = await getCourse({ courseId: req.params.id, viewerId: req.user.id, isAdmin: true });
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  res.json(course);
}));

router.get('/courses/:id/progress', asyncRoute(async (req, res) => {
  res.json({ students: await courseProgress(req.params.id) });
}));

const courseInput = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(4000).optional().default(''),
  // Open to all is the shortcut for a course taught identically to every group;
  // otherwise it is enrolled class by class.
  openToAll: z.boolean().optional(),
  classIds: z.array(z.string().uuid()).optional(),
  coverUrl: z.string().max(2000).nullable().optional(),
  published: z.boolean().optional().default(false),
});

/* Teaching plans. Teacher only, deliberately: there is no route for a plan on
   the student side and nothing that returns one to them. What a course intends
   to cover, and how far through it the teaching has got, is not something a
   student needs to be reading. */
router.get('/plans', asyncRoute(async (_req, res) => {
  res.json(await coursesWithPlans());
}));

router.get('/plans/:courseId', asyncRoute(async (req, res) => {
  const plan = await getPlan(req.params.courseId);
  if (!plan) return res.status(404).json({ error: 'This course has no plan yet.' });
  res.json(plan);
}));

/* The plan that ships with the portal, brought into a course. */
router.post('/plans/:courseId/import', asyncRoute(async (req, res) => {
  const course = await one('SELECT id, title FROM courses WHERE id=$1', [req.params.courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  const plan = await packagedPlan();
  const created = await importPlan({
    courseId: course.id,
    title: req.body?.title?.trim() || 'Irish for Primary Teaching 2026/27',
    plan,
    actorId: req.user.id,
  });
  await audit({ actorId: req.user.id, action: 'plan.imported', entityType: 'course', entityId: course.id, ip: req.ip });
  res.status(201).json(created);
}));

router.delete('/plans/:courseId', asyncRoute(async (req, res) => {
  const plan = await one('SELECT id FROM course_plans WHERE course_id=$1', [req.params.courseId]);
  if (!plan) return res.status(404).json({ error: 'This course has no plan.' });
  const covered = await one(
    `SELECT count(*)::int c FROM plan_items i JOIN plan_weeks w ON w.id=i.week_id
     WHERE w.plan_id=$1 AND i.done_at IS NOT NULL`, [plan.id]);
  /* The ticks are the one thing here that cannot be recreated from the file, so
     removing a plan that carries them has to be confirmed against the count. */
  const confirmed = Number(req.query.confirmDone ?? -1);
  if (covered.c > 0 && confirmed !== covered.c) {
    return res.status(409).json({
      error: `This plan has ${covered.c} item${covered.c === 1 ? '' : 's'} ticked off. Removing it loses that record.`,
      done: covered.c,
    });
  }
  await query('DELETE FROM course_plans WHERE id=$1', [plan.id]);
  await audit({ actorId: req.user.id, action: 'plan.removed', entityType: 'course', entityId: req.params.courseId, metadata: { done: covered.c }, ip: req.ip });
  res.json({ ok: true });
}));

router.patch('/plan-items/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Say whether it is done.') });
  const row = await setItemDone({ itemId: req.params.id, done: parsed.data.done, actorId: req.user.id });
  if (!row) return res.status(404).json({ error: 'That item is no longer in the plan.' });
  res.json(row);
}));

/* The checklist, as a file.
   Every scheduled item with its week, its category and whether it is done, which
   is what somebody wants when they are looking at the term away from a screen. */
/* Every topic the course covers, and where each has landed. */
router.get('/plans/:courseId/topics', asyncRoute(async (req, res) => {
  const topics = await getTopics(req.params.courseId);
  if (!topics) return res.status(404).json({ error: 'This course has no plan yet.' });
  res.json(topics);
}));

/* Dropping a topic into a week. */
router.post('/plan-weeks/:weekId/items', asyncRoute(async (req, res) => {
  const parsed = z.object({ topicId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Say which topic to add.') });
  res.status(201).json(await scheduleTopic({ weekId: req.params.weekId, topicId: parsed.data.topicId }));
}));

/* The order of a week after a drag. The whole week arrives, not one move. */
router.put('/plan-weeks/:weekId/order', asyncRoute(async (req, res) => {
  const parsed = z.object({ itemIds: z.array(z.string().uuid()).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid order.') });
  res.json(await reorderWeek({ weekId: req.params.weekId, itemIds: parsed.data.itemIds }));
}));

router.delete('/plan-items/:id', asyncRoute(async (req, res) => {
  const row = await unscheduleItem(req.params.id);
  if (!row) return res.status(404).json({ error: 'That item is no longer in the plan.' });
  res.json({ ok: true });
}));

/* A topic the course covers that the packaged plan did not know about. */
router.post('/plans/:courseId/topics', asyncRoute(async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(2).max(160),
    category: z.string().trim().max(60).optional(),
    examGroup: z.string().trim().max(40).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'A topic needs a name of at least two characters.') });
  const row = await addTopic({ courseId: req.params.courseId, ...parsed.data });
  await audit({ actorId: req.user.id, action: 'plan.topic.added', entityType: 'course', entityId: req.params.courseId, metadata: { title: row.title }, ip: req.ip });
  res.status(201).json(row);
}));

/* What removing one would cost, so the question can name it before it is asked. */
router.get('/plan-topics/:id/cost', asyncRoute(async (req, res) => {
  const cost = await topicCost(req.params.id);
  if (!cost) return res.status(404).json({ error: 'Topic not found.' });
  res.json(cost);
}));

/* Off the course altogether, and out of every week it was in. Unscheduling an
   item is the other thing: that leaves the topic in the bank. */
router.delete('/plan-topics/:id', asyncRoute(async (req, res) => {
  const row = await removeTopic({ topicId: req.params.id, confirmDone: req.query.confirmDone ?? -1 });
  if (!row) return res.status(404).json({ error: 'Topic not found.' });
  await audit({ actorId: req.user.id, action: 'plan.topic.removed', entityType: 'course', entityId: req.params.id, metadata: { title: row.title, done: row.done }, ip: req.ip });
  res.json(row);
}));

router.patch('/plan-topics/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ examGroup: z.string().max(40) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Say which section it belongs to.') });
  const row = await setTopicGroup({ topicId: req.params.id, examGroup: parsed.data.examGroup });
  if (!row) return res.status(404).json({ error: 'Topic not found.' });
  res.json(row);
}));

router.get('/plans/:courseId/checklist.csv', asyncRoute(async (req, res) => {
  const plan = await getPlan(req.params.courseId);
  if (!plan) return res.status(404).json({ error: 'This course has no plan yet.' });

  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Week', 'Topic', 'Category', 'Done', 'Date covered', 'Covered by', 'Homework for that week']
      .map(cell).join(','),
  ];
  for (const week of plan.weeks) {
    if (!week.items.length) {
      lines.push([week.name, '', '', '', '', '', week.homework || ''].map(cell).join(','));
      continue;
    }
    for (const [index, item] of week.items.entries()) {
      lines.push([
        week.name, item.title, item.category || '',
        item.doneAt ? 'Yes' : 'No',
        item.doneAt ? new Date(item.doneAt).toISOString().slice(0, 10) : '',
        item.doneBy || '',
        // Written against the week, so it goes on the week's first line only.
        index === 0 ? (week.homework || '') : '',
      ].map(cell).join(','));
    }
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="plan-${String(plan.course_title).replace(/[^\w -]/g, '').slice(0, 40).trim() || 'course'}-${new Date().toISOString().slice(0, 10)}.csv"`);
  // The byte order mark, or Excel reads the fadas in these topic names as Latin-1.
  res.send(`\uFEFF${lines.join('\n')}\n`);
}));

router.post('/courses', asyncRoute(async (req, res) => {
  const parsed = courseInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the course a title.') });
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM courses');
  const row = await one(
    `INSERT INTO courses(title,description,cover_url,published,position,created_by,open_to_all)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [parsed.data.title, parsed.data.description,
     parsed.data.coverUrl || null, parsed.data.published, next.position, req.user.id,
     parsed.data.openToAll ?? false],
  );
  await setCourseClasses(row.id, parsed.data.classIds || []);
  await audit({ actorId: req.user.id, action: 'course.created', entityType: 'course', entityId: row.id, ip: req.ip });
  res.status(201).json(row);
}));

router.patch('/courses/:id', asyncRoute(async (req, res) => {
  const parsed = courseInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid course.') });
  const current = await one('SELECT * FROM courses WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Course not found.' });
  const data = parsed.data;
  const row = await one(
    `UPDATE courses SET title=$1,description=$2,open_to_all=$3,cover_url=$4,published=$5,updated_at=now()
     WHERE id=$6 RETURNING *`,
    [data.title ?? current.title, data.description ?? current.description,
     data.openToAll ?? current.open_to_all,
     data.coverUrl === undefined ? current.cover_url : (data.coverUrl || null),
     data.published ?? current.published, current.id],
  );
  if (data.classIds) await setCourseClasses(current.id, data.classIds);
  await audit({ actorId: req.user.id, action: 'course.updated', entityType: 'course', entityId: row.id, ip: req.ip });
  res.json(row);
}));

/* Deleting a course takes its lessons and everybody's progress through them.
   The count is shown before the button is offered. */
router.get('/courses/:id/impact', asyncRoute(async (req, res) => {
  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM course_modules WHERE course_id=$1) modules,
       (SELECT count(*)::int FROM course_lessons l JOIN course_modules m ON m.id=l.module_id
         WHERE m.course_id=$1) lessons,
       (SELECT count(*)::int FROM lesson_progress p JOIN course_lessons l ON l.id=p.lesson_id
         JOIN course_modules m ON m.id=l.module_id WHERE m.course_id=$1) progress`,
    [req.params.id],
  );
  res.json(counts);
}));

router.delete('/courses/:id', asyncRoute(async (req, res) => {
  const current = await one('SELECT title FROM courses WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Course not found.' });
  await query('DELETE FROM courses WHERE id=$1', [req.params.id]);
  await audit({ actorId: req.user.id, action: 'course.deleted', entityType: 'course', entityId: req.params.id, metadata: { title: current.title }, ip: req.ip });
  res.status(204).end();
}));

router.post('/courses/:id/modules', asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the section a title.') });
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM course_modules WHERE course_id=$1', [req.params.id]);
  const row = await one(
    'INSERT INTO course_modules(course_id,title,position) VALUES ($1,$2,$3) RETURNING *',
    [req.params.id, parsed.data.title, next.position],
  );
  res.status(201).json(row);
}));

router.patch('/modules/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the section a title.') });
  const row = await one('UPDATE course_modules SET title=$1 WHERE id=$2 RETURNING *', [parsed.data.title, req.params.id]);
  if (!row) return res.status(404).json({ error: 'Section not found.' });
  res.json(row);
}));

/* Deleting a section takes its lessons and everybody's record of having watched
   them. The count is shown before the button is offered, the same as a course. */
router.get('/modules/:id/impact', asyncRoute(async (req, res) => {
  const module = await one('SELECT id, title FROM course_modules WHERE id=$1', [req.params.id]);
  if (!module) return res.status(404).json({ error: 'Section not found.' });
  const counts = await one(
    `SELECT
       (SELECT count(*)::int FROM course_lessons WHERE module_id=$1) lessons,
       (SELECT count(*)::int FROM lesson_progress p
          JOIN course_lessons l ON l.id=p.lesson_id WHERE l.module_id=$1) progress`,
    [req.params.id],
  );
  res.json({ ...module, ...counts });
}));

router.delete('/modules/:id', asyncRoute(async (req, res) => {
  await query('DELETE FROM course_modules WHERE id=$1', [req.params.id]);
  await audit({ actorId: req.user.id, action: 'course.module.deleted', entityType: 'module', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
}));

/* Copy a course, so last year's can be run again without rebuilding it.
   ------------------------------------------------------------------
   Sections, lessons, notes and recording links come across; nobody's progress
   does, because the copy is a course nobody has taken yet. It arrives
   unpublished and enrolled in nothing, so it can be worked on before anybody
   sees it — copying a live course straight onto a class's screen is not a thing
   anybody wants to happen by accident. */
router.post('/courses/:id/duplicate', asyncRoute(async (req, res) => {
  const source = await one('SELECT * FROM courses WHERE id=$1', [req.params.id]);
  if (!source) return res.status(404).json({ error: 'Course not found.' });
  const parsed = z.object({ title: z.string().trim().min(2).max(200).optional() }).safeParse(req.body || {});
  const title = parsed.success && parsed.data.title ? parsed.data.title : `${source.title} (copy)`;

  const copy = await transaction(async (client) => {
    const next = await client.query('SELECT COALESCE(max(position),-1)+1 position FROM courses');
    const created = await client.query(
      `INSERT INTO courses(title,description,cover_url,published,position,created_by,open_to_all)
       VALUES ($1,$2,$3,false,$4,$5,false) RETURNING *`,
      [title, source.description, source.cover_url, next.rows[0].position, req.user.id],
    );
    const course = created.rows[0];

    const modules = await client.query(
      'SELECT * FROM course_modules WHERE course_id=$1 ORDER BY position, created_at', [source.id]);
    for (const [index, module] of modules.rows.entries()) {
      const newModule = await client.query(
        'INSERT INTO course_modules(course_id,title,position) VALUES ($1,$2,$3) RETURNING id',
        [course.id, module.title, index],
      );
      const lessons = await client.query(
        'SELECT * FROM course_lessons WHERE module_id=$1 ORDER BY position, created_at', [module.id]);
      for (const [lessonIndex, lesson] of lessons.rows.entries()) {
        await client.query(
          `INSERT INTO course_lessons(module_id,title,notes,video_provider,video_ref,
             duration_seconds,recorded_on,published,position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [newModule.rows[0].id, lesson.title, lesson.notes, lesson.video_provider, lesson.video_ref,
           lesson.duration_seconds, lesson.recorded_on, lesson.published, lessonIndex],
        );
      }
    }
    return course;
  });

  await audit({ actorId: req.user.id, action: 'course.duplicated', entityType: 'course', entityId: copy.id,
    metadata: { from: source.id }, ip: req.ip });
  res.status(201).json(copy);
}));

const lessonInput = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(20000).optional().default(''),
  videoProvider: z.enum(VIDEO_PROVIDERS).nullable().optional(),
  // Whatever was pasted: a whole URL or a bare id, sorted out below.
  video: z.string().max(2000).nullable().optional(),
  durationSeconds: z.coerce.number().int().min(0).max(60 * 60 * 12).nullable().optional(),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /* Zoom share links nearly always carry one, and a link given out without it
     is a page asking the student for something nobody gave them. */
  videoPasscode: z.string().trim().max(60).nullable().optional(),
  published: z.boolean().optional().default(true),
});

/* A lesson without a recording is a normal state — the notes often exist before
   the class has been taught — so an empty video is accepted and only a video
   that cannot be understood is refused. */
function resolveVideo(data, current = {}) {
  if (data.videoProvider === undefined && data.video === undefined) {
    return { provider: current.video_provider ?? null, ref: current.video_ref ?? null };
  }
  /* undefined means the field was not on the form; null means the box was
     emptied. `??` treated them the same and fell back to the stored link, so
     clearing a recording kept it, and the lesson saved happily with the video
     the teacher had just deleted. */
  const raw = data.video === undefined ? current.video_ref : data.video;
  const link = String(raw || '').trim();
  // No link is how a recording is removed, and how a lesson written before it is
  // taught sits waiting for one.
  if (!link) return { provider: null, ref: null };

  /* The host is worked out from the link when it has not been chosen. Requiring
     somebody to confirm in a dropdown what the URL already says is asking them
     to do the computer's work — and forgetting to did not warn, it silently
     dropped the link and reported success, which is how a pasted recording came
     to vanish with a lesson saved happily on top of it. */
  const provider = data.videoProvider || current.video_provider || detectVideoProvider(link);
  if (!provider) {
    throw Object.assign(new Error(
      'That link was not recognised. Choose where the recording is hosted, or paste a Zoom, YouTube, Loom or Bunny link.',
    ), { status: 400 });
  }
  const parsed = parseVideoSource(provider, link);
  if (!parsed) {
    /* Say which host it was read as. "Not recognised" alone sends somebody
       checking a link that is perfectly good but filed under the wrong host. */
    throw Object.assign(new Error(
      `That link was not recognised as ${PROVIDER_LABELS[provider] || provider}. Check the host is right for the link you pasted.`,
    ), { status: 400 });
  }
  return parsed;
}

router.post('/modules/:id/lessons', asyncRoute(async (req, res) => {
  const parsed = lessonInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the lesson a title.') });
  const video = resolveVideo(parsed.data);
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM course_lessons WHERE module_id=$1', [req.params.id]);
  const row = await one(
    `INSERT INTO course_lessons(module_id,title,notes,video_provider,video_ref,video_passcode,duration_seconds,recorded_on,published,position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.params.id, parsed.data.title, parsed.data.notes, video.provider, video.ref,
     parsed.data.videoPasscode || null,
     parsed.data.durationSeconds || null, parsed.data.recordedOn || null, parsed.data.published, next.position],
  );
  await audit({ actorId: req.user.id, action: 'lesson.created', entityType: 'lesson', entityId: row.id, ip: req.ip });
  res.status(201).json(row);
}));

router.patch('/lessons/:id', asyncRoute(async (req, res) => {
  const parsed = lessonInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid lesson.') });
  const current = await one('SELECT * FROM course_lessons WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Lesson not found.' });
  const data = parsed.data;
  const video = resolveVideo(data, current);
  const row = await one(
    `UPDATE course_lessons SET title=$1,notes=$2,video_provider=$3,video_ref=$4,video_passcode=$9,
       duration_seconds=$5,recorded_on=$6,published=$7,updated_at=now()
     WHERE id=$8 RETURNING *`,
    [data.title ?? current.title, data.notes ?? current.notes, video.provider, video.ref,
     data.durationSeconds === undefined ? current.duration_seconds : (data.durationSeconds || null),
     data.recordedOn === undefined ? current.recorded_on : (data.recordedOn || null),
     data.published ?? current.published, current.id,
     /* Undefined means the edit did not mention it, which is not the same as
        being cleared: a lesson edited to fix its title must keep its passcode. */
     data.videoPasscode === undefined ? current.video_passcode : (data.videoPasscode || null)],
  );
  res.json(row);
}));

router.delete('/lessons/:id', asyncRoute(async (req, res) => {
  await query('DELETE FROM course_lessons WHERE id=$1', [req.params.id]);
  await audit({ actorId: req.user.id, action: 'lesson.deleted', entityType: 'lesson', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
}));

/* Reordering. The whole ordered list arrives at once rather than one move at a
   time, so a drag that lands in the wrong place cannot leave two things holding
   the same position. */
router.put('/courses/:id/order', asyncRoute(async (req, res) => {
  const parsed = z.object({
    modules: z.array(z.object({
      id: z.string().uuid(),
      lessons: z.array(z.string().uuid()).optional().default([]),
    })),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid order.') });
  /* The order sent is the whole shape of the course, so a lesson listed under a
     different section than it currently sits in is a move. Scoping the update
     to this course's own modules is what stops an id from another course being
     dragged in by a crafted request. */
  await transaction(async (client) => {
    const own = await client.query('SELECT id FROM course_modules WHERE course_id=$1', [req.params.id]);
    const mine = new Set(own.rows.map((row) => row.id));
    for (const [index, module] of parsed.data.modules.entries()) {
      if (!mine.has(module.id)) continue;
      await client.query('UPDATE course_modules SET position=$1 WHERE id=$2 AND course_id=$3',
        [index, module.id, req.params.id]);
      for (const [lessonIndex, lessonId] of module.lessons.entries()) {
        await client.query(
          `UPDATE course_lessons SET position=$1, module_id=$2
           WHERE id=$3 AND module_id IN (SELECT id FROM course_modules WHERE course_id=$4)`,
          [lessonIndex, module.id, lessonId, req.params.id]);
      }
    }
  });
  res.json({ ok: true });
}));

/* A handout on a lesson, reusing the same document check the feed uses. */
router.post('/lessons/:id/attachments', documentUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
  const document = sniffDocument(req.file.buffer, req.file.originalname);
  if (!document) return res.status(400).json({ error: 'Lessons take PDFs and Word documents (.docx).' });
  const storedName = `lesson-${crypto.randomUUID()}${document.extension}`;
  await fs.writeFile(path.join(config.privateUploadDir, storedName), req.file.buffer);
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM lesson_attachments WHERE lesson_id=$1', [req.params.id]);
  const row = await one(
    `INSERT INTO lesson_attachments(lesson_id,url,stored_name,file_name,mime_type,size_bytes,position)
     VALUES ($1,'',$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, storedName, req.file.originalname.slice(0, 200),
     document.mimeType, req.file.size, next.position],
  );
  // The address is the authenticated route, which needs the row's own id.
  await query('UPDATE lesson_attachments SET url=$1 WHERE id=$2',
    [`/api/media/attachment/lesson/${row.id}`, row.id]);
  row.url = `/api/media/attachment/lesson/${row.id}`;
  res.status(201).json(row);
}));

router.delete('/lesson-attachments/:id', asyncRoute(async (req, res) => {
  const current = await one('SELECT * FROM lesson_attachments WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Attachment not found.' });
  if (current.stored_name) {
    await fs.unlink(path.join(config.uploadDir, path.basename(current.stored_name))).catch(() => {});
  }
  await query('DELETE FROM lesson_attachments WHERE id=$1', [current.id]);
  res.status(204).end();
}));

/* ------------------------------------------------------------------
   Zoom import
   ------------------------------------------------------------------ */

router.get('/zoom/status', asyncRoute(async (_req, res) => {
  res.json({
    zoom: zoomConfigured(),
    bunny: bunnyConfigured(),
    signedPlayback: bunnySigning(),
    ready: importConfigured(),
  });
}));

/* Everything on the Zoom account, with what has already been taken marked. The
   list is deliberately the whole account rather than a filtered view: seeing
   what is there is the point, and nothing acts on it without being told. */
router.get('/zoom/recordings', asyncRoute(async (req, res) => {
  if (!zoomConfigured()) return res.json({ configured: false, recordings: [], sources: [] });
  const months = Math.min(Math.max(Number(req.query.months) || 3, 1), 12);
  const [recordings, sources] = await Promise.all([
    availableRecordings({ months }),
    query(`SELECT s.*, m.title module_title, c.title course_title
           FROM zoom_sources s
           LEFT JOIN course_modules m ON m.id=s.module_id
           LEFT JOIN courses c ON c.id=m.course_id
           ORDER BY s.created_at`),
  ]);
  res.json({ configured: true, recordings, sources: sources.rows });
}));

router.post('/zoom/import', asyncRoute(async (req, res) => {
  const parsed = z.object({
    uuid: z.string().min(1),
    fileId: z.string().min(1),
    moduleId: z.string().uuid(),
    title: z.string().trim().max(200).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Choose a recording and the section it belongs in.') });

  // Fetched fresh rather than trusted from the browser: the download URL is a
  // credential, and it is not one to accept from a request body.
  const recordings = await availableRecordings({ months: 12 });
  const recording = recordings.find((row) => row.uuid === parsed.data.uuid && row.fileId === parsed.data.fileId);
  if (!recording) return res.status(404).json({ error: 'That recording is no longer on the Zoom account.' });

  const result = await importRecording({
    recording, moduleId: parsed.data.moduleId, actorId: req.user.id, title: parsed.data.title,
  });
  if (result.alreadyImported) return res.status(409).json({ error: 'That recording has already been brought across.' });
  res.status(201).json(result);
}));

/* Runs the automatic import by hand, for the webinars already marked for it. */
router.post('/zoom/sweep', asyncRoute(async (req, res) => {
  res.json(await importWatched({ actorId: req.user.id }));
}));

/* Which webinars are wanted. Naming one is not the same as agreeing every
   future recording should import unread, so `autoImport` is separate. */
router.put('/zoom/sources', asyncRoute(async (req, res) => {
  const parsed = z.object({
    zoomId: z.string().trim().min(3).max(60),
    label: z.string().trim().max(200).optional().default(''),
    moduleId: z.string().uuid().nullable().optional(),
    autoImport: z.boolean().optional().default(false),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give the webinar id and where its recordings should land.') });
  const row = await one(
    `INSERT INTO zoom_sources(zoom_id,label,module_id,auto_import) VALUES ($1,$2,$3,$4)
     ON CONFLICT (zoom_id) DO UPDATE SET label=EXCLUDED.label, module_id=EXCLUDED.module_id,
       auto_import=EXCLUDED.auto_import
     RETURNING *`,
    [parsed.data.zoomId, parsed.data.label, parsed.data.moduleId || null, parsed.data.autoImport],
  );
  await audit({ actorId: req.user.id, action: 'zoom.source_saved', entityType: 'zoom_source', entityId: row.id, metadata: parsed.data, ip: req.ip });
  res.json(row);
}));

router.delete('/zoom/sources/:id', asyncRoute(async (req, res) => {
  await query('DELETE FROM zoom_sources WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

router.get('/zoom/imports', asyncRoute(async (_req, res) => {
  const rows = await query(
    `SELECT i.*, l.title lesson_title FROM zoom_imports i
     LEFT JOIN course_lessons l ON l.id=i.lesson_id
     ORDER BY i.started_at DESC LIMIT 50`,
  );
  res.json({ imports: rows.rows });
}));

/* ------------------------------------------------------------------
   Administrators
   ------------------------------------------------------------------
   Behind requireSuperAdmin rather than requireAdmin. Creating an administrator
   hands somebody every other action in the application, so an ordinary admin
   account being compromised should not extend to minting more accounts like it.
   ------------------------------------------------------------------ */

router.get('/admins', requireSuperAdmin, asyncRoute(async (req, res) => {
  const rows = await query(
    `SELECT id, name, email, active, is_super_admin, must_change_password,
            last_login_at, created_at
     FROM users WHERE role='admin' ORDER BY created_at`,
  );
  res.json({ admins: rows.rows, me: req.user.id });
}));

router.post('/admins', requireSuperAdmin, asyncRoute(async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email(),
    superAdmin: z.boolean().optional().default(false),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Give a name and a valid email address.') });

  const existing = await one('SELECT id, role FROM users WHERE email=$1', [parsed.data.email.trim()]);
  if (existing) {
    return res.status(409).json({
      error: existing.role === 'admin'
        ? 'That email already belongs to an administrator.'
        : 'That email already belongs to a student. Use a different address.',
    });
  }

  /* The same invitation path students get: a strong temporary password, emailed,
     changed on first login, and a photograph asked for on the way in. */
  const temporaryPassword = generateStrongPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const admin = await one(
    `INSERT INTO users(role,name,email,password_hash,must_change_password,must_set_avatar,is_super_admin)
     VALUES ('admin',$1,$2,$3,true,true,$4)
     RETURNING id,name,email,role,is_super_admin`,
    [parsed.data.name, parsed.data.email.trim(), passwordHash, parsed.data.superAdmin],
  );

  let emailStatus = 'sent';
  try { await sendStudentInvite({ student: admin, temporaryPassword }); }
  catch (error) { emailStatus = 'failed'; console.error(error); }

  await audit({
    actorId: req.user.id, action: 'admin.created', entityType: 'user', entityId: admin.id,
    metadata: { email: admin.email, superAdmin: parsed.data.superAdmin, emailStatus }, ip: req.ip,
  });
  res.status(201).json({ ...admin, emailStatus });
}));

/* Suspending an administrator, or changing whether they can create others.
   Two things are refused outright: removing the last super administrator, which
   would lock everybody out of this screen permanently, and demoting or
   suspending yourself, which is the same mistake with an extra step. */
router.patch('/admins/:id', requireSuperAdmin, asyncRoute(async (req, res) => {
  const parsed = z.object({
    active: z.boolean().optional(),
    superAdmin: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: problemFrom(parsed.error, FIELD_NAMES, 'Invalid change.') });

  const target = await one(`SELECT * FROM users WHERE id=$1 AND role='admin'`, [req.params.id]);
  if (!target) return res.status(404).json({ error: 'Administrator not found.' });

  if (target.id === req.user.id && (parsed.data.active === false || parsed.data.superAdmin === false)) {
    return res.status(409).json({ error: 'You cannot remove your own access. Ask another super administrator.' });
  }

  const losingSuper = target.is_super_admin && (parsed.data.superAdmin === false || parsed.data.active === false);
  if (losingSuper) {
    const remaining = await one(
      `SELECT count(*)::int count FROM users
       WHERE role='admin' AND is_super_admin=true AND active=true AND id<>$1`,
      [target.id],
    );
    if (!remaining.count) {
      return res.status(409).json({ error: 'That is the last super administrator. Promote somebody else first.' });
    }
  }

  const row = await one(
    `UPDATE users SET active=$1, is_super_admin=$2, updated_at=now() WHERE id=$3
     RETURNING id,name,email,active,is_super_admin`,
    [parsed.data.active ?? target.active, parsed.data.superAdmin ?? target.is_super_admin, target.id],
  );
  // Suspending somebody should end their session, not wait for it to expire.
  if (row.active === false) await query('DELETE FROM sessions WHERE user_id=$1', [row.id]);

  await audit({ actorId: req.user.id, action: 'admin.updated', entityType: 'user', entityId: row.id, metadata: parsed.data, ip: req.ip });
  res.json(row);
}));

export default router;
