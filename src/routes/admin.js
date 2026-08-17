import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncRoute } from '../middleware.js';
import { requireAdmin } from '../session.js';
import { one, query, transaction } from '../db.js';
import { generateStrongPassword, hashPassword } from '../security.js';
import { sendStudentInvite, sendNudge } from '../email.js';
import { ensureWeeksForClass, scheduleCheckins, CHECKIN_DEFAULTS } from '../weeks.js';
import { audit } from '../audit.js';
import { draftCheckinFeedback, draftHomeworkFeedback } from '../ai.js';
import { VOICE_MIME_TYPES, audioExtension, dictate, withVoiceNote, withVoiceNotes } from '../voice.js';
import { buildCalendar, assignmentEvent, ensureCalendarToken, rotateCalendarToken } from '../calendar.js';
import { FILE_TYPE_GROUPS } from '../documents.js';
import { listThreads, getThread, createThread, createPost, listCategories, toggleReaction, topContributors, REACTIONS } from '../community.js';
import { extractVideoLinks } from '../videolinks.js';
import { listCoursesForAdmin, getCourse, courseProgress } from '../courses.js';
import { parseVideoSource, VIDEO_PROVIDERS } from '../lessonvideo.js';

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
    if (!allowedUploads.has(file.mimetype)) return callback(Object.assign(new Error('This file type is not allowed.'), { status: 400 }));
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
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a programme name, day, time and timezone.' });
  const row = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time,timezone)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [parsed.data.programmeName, parsed.data.dayOfWeek, parsed.data.startTime, parsed.data.timezone],
  );
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
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid class settings. A class link must be a full https:// address.' });
  const current = await one('SELECT * FROM classes WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Class not found.' });
  const data = parsed.data;
  const joinUrl = data.joinUrl === undefined ? current.join_url : (data.joinUrl || null);
  const row = await one(
    `UPDATE classes SET programme_name=$1,day_of_week=$2,start_time=$3,timezone=$4,active=$5,
       join_url=$6,join_note=$7,updated_at=now()
     WHERE id=$8 RETURNING *`,
    [data.programmeName ?? current.programme_name, data.dayOfWeek ?? current.day_of_week, data.startTime ?? String(current.start_time).slice(0,5), data.timezone ?? current.timezone, data.active ?? current.active,
     joinUrl, data.joinNote ?? current.join_note, current.id],
  );
  await ensureWeeksForClass(row);
  await audit({ actorId: req.user.id, action: 'class.updated', entityType: 'class', entityId: row.id, metadata: data, ip: req.ip });
  res.json({ ...row, label: classLabel(row) });
}));

/* Deleting a class takes its whole history with it: every teaching week,
   attendance record, check-in, assignment and submission. The students themselves
   survive — they simply end up unassigned — but everything they did in this class
   is gone. Closing a class hides it everywhere while keeping all of that. */
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
    `SELECT u.id,u.name,u.email,u.active,u.must_change_password,u.last_login_at,
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
  if (!parsed.success) return res.status(400).json({ error: 'Enter a student name, email and class.' });
  const klass = await one('SELECT id FROM classes WHERE id=$1 AND active=true', [parsed.data.classId]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });
  const student = await createStudent({ ...parsed.data, actorId: req.user.id, ip: req.ip });
  res.status(201).json(student);
}));

router.post('/students/import', diskUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
  const content = await fs.readFile(req.file.path, 'utf8');
  await fs.unlink(req.file.path).catch(() => {});
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  const classesResult = await query('SELECT * FROM classes WHERE active=true');
  const classes = classesResult.rows;
  const results = [];
  for (const row of rows) {
    const name = normalizeHeader(row, ['name','student name','full name']);
    const email = normalizeHeader(row, ['email','email address']);
    const classText = normalizeHeader(row, ['class','current class','course']);
    const classIdFromBody = req.body.classId || '';
    const klass = classes.find((item) => item.id === classIdFromBody || classLabel(item).toLowerCase() === classText.toLowerCase() || `${item.programme_name} ${item.day_of_week} ${String(item.start_time).slice(0,5)}`.toLowerCase() === classText.toLowerCase());
    if (!name || !email || !klass) { results.push({ name, email, status: 'error', error: 'Missing name, email or matching class.' }); continue; }
    try {
      const student = await createStudent({ name, email, classId: klass.id, actorId: req.user.id, ip: req.ip });
      results.push({ name, email, status: 'created', studentId: student.id, emailStatus: student.emailStatus });
    } catch (error) {
      results.push({ name, email, status: 'error', error: error.message });
    }
  }
  res.json({ total: rows.length, created: results.filter((item) => item.status === 'created').length, results });
}));

router.patch('/students/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().min(2).optional(), email: z.string().email().optional(), classId: z.string().uuid().optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid student update.' });
  const student = await one(`SELECT u.*,cs.class_id FROM users u LEFT JOIN class_students cs ON cs.student_id=u.id AND cs.active=true WHERE u.id=$1 AND u.role='student'`, [req.params.id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  await transaction(async (client) => {
    await client.query('UPDATE users SET name=$1,email=$2,active=$3,updated_at=now() WHERE id=$4', [parsed.data.name ?? student.name, parsed.data.email ?? student.email, parsed.data.active ?? student.active, student.id]);
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
      COALESCE((SELECT json_agg(jsonb_build_object('id',q.id,'position',q.position,'prompt',q.prompt,'imageUrl',q.image_url,'required',q.required) ORDER BY q.position)
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid attendance record.' });
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
  const files = (req.files || []).map((file) => ({ fileName: file.originalname, mimeType: file.mimetype, url: `/uploads/${path.basename(file.path)}` }));
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
      COALESCE((SELECT json_agg(jsonb_build_object('id',q.id,'position',q.position,'prompt',q.prompt,'imageUrl',q.image_url,'required',q.required) ORDER BY q.position)
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

router.post('/assignments', asyncRoute(async (req, res) => {
  const parsed = z.object({
    classId: z.string().uuid(), weekId: z.string().uuid().nullable().optional(), title: z.string().min(2), instructions: z.string().default(''), loomUrl: z.string().url().nullable().optional(), visibleAt: z.string().datetime().optional(), deadlineAt: z.string().datetime(), hardDeadline: z.boolean().default(true), remindersEnabled: z.boolean().default(true),
    questions: z.array(z.object({ prompt: z.string().min(1), imageUrl: z.string().nullable().optional(), required: z.boolean().default(true) })).min(1),
    resources: z.array(z.object({ fileName: z.string(), fileUrl: z.string(), mimeType: z.string().optional() })).default([]),
    allowUploads: z.boolean().default(false),
    uploadsRequired: z.boolean().default(false),
    acceptedFileTypes: z.array(z.enum(Object.keys(FILE_TYPE_GROUPS))).default(['image', 'pdf']),
    maxFiles: z.coerce.number().int().min(1).max(10).default(3),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Complete the assignment title, deadline and at least one question.' });
  const a = parsed.data;
  const assignment = await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO assignments(class_id,week_id,title,instructions,loom_url,visible_at,deadline_at,hard_deadline,reminders_enabled,created_by,
         allow_uploads,uploads_required,accepted_file_types,max_files)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14) RETURNING *`,
      [a.classId, a.weekId || null, a.title, a.instructions, a.loomUrl || null, a.visibleAt || new Date().toISOString(), a.deadlineAt, a.hardDeadline, a.remindersEnabled, req.user.id,
       a.allowUploads, a.allowUploads && a.uploadsRequired, JSON.stringify(a.acceptedFileTypes), a.maxFiles],
    );
    for (const [position, question] of a.questions.entries()) {
      await client.query(`INSERT INTO assignment_questions(assignment_id,position,prompt,image_url,required) VALUES ($1,$2,$3,$4,$5)`, [inserted.rows[0].id, position, question.prompt, question.imageUrl || null, question.required]);
    }
    for (const resource of a.resources) {
      await client.query(`INSERT INTO assignment_resources(assignment_id,file_name,file_url,mime_type) VALUES ($1,$2,$3,$4)`, [inserted.rows[0].id, resource.fileName, resource.fileUrl, resource.mimeType || null]);
    }
    return inserted.rows[0];
  });
  await audit({ actorId: req.user.id, action: 'assignment.created', entityType: 'assignment', entityId: assignment.id, metadata: { classId: a.classId }, ip: req.ip });
  res.status(201).json(assignment);
}));

router.put('/assignments/:id', asyncRoute(async (req, res) => {
  const assignment = await one('SELECT * FROM assignments WHERE id=$1', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const parsed = z.object({ title: z.string().min(2), instructions: z.string(), loomUrl: z.string().url().nullable().optional(), visibleAt: z.string().datetime(), deadlineAt: z.string().datetime(), hardDeadline: z.boolean(), remindersEnabled: z.boolean(), status: z.enum(['draft','published','archived']), questions: z.array(z.object({ prompt: z.string().min(1), imageUrl: z.string().nullable().optional(), required: z.boolean() })).min(1), resources: z.array(z.object({ fileName: z.string(), fileUrl: z.string(), mimeType: z.string().optional() })).default([]),
    allowUploads: z.boolean().default(false),
    uploadsRequired: z.boolean().default(false),
    acceptedFileTypes: z.array(z.enum(Object.keys(FILE_TYPE_GROUPS))).default(['image', 'pdf']),
    maxFiles: z.coerce.number().int().min(1).max(10).default(3),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid assignment update.' });
  const a = parsed.data;
  await transaction(async (client) => {
    await client.query(`UPDATE assignments SET title=$1,instructions=$2,loom_url=$3,visible_at=$4,deadline_at=$5,hard_deadline=$6,reminders_enabled=$7,status=$8,
       allow_uploads=$9,uploads_required=$10,accepted_file_types=$11::jsonb,max_files=$12,updated_at=now() WHERE id=$13`,
      [a.title, a.instructions, a.loomUrl || null, a.visibleAt, a.deadlineAt, a.hardDeadline, a.remindersEnabled, a.status,
       a.allowUploads, a.allowUploads && a.uploadsRequired, JSON.stringify(a.acceptedFileTypes), a.maxFiles, assignment.id]);
    await client.query('DELETE FROM assignment_questions WHERE assignment_id=$1', [assignment.id]);
    await client.query('DELETE FROM assignment_resources WHERE assignment_id=$1', [assignment.id]);
    for (const [position, question] of a.questions.entries()) await client.query(`INSERT INTO assignment_questions(assignment_id,position,prompt,image_url,required) VALUES ($1,$2,$3,$4,$5)`, [assignment.id, position, question.prompt, question.imageUrl || null, question.required]);
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
  if (!parsed.success) return res.status(400).json({ error: 'Choose a new closing time.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid check-in setting.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Choose a start date, an end date and the weekly times.' });

  const klass = await one('SELECT * FROM classes WHERE id=$1', [req.params.id]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });

  const result = await scheduleCheckins(klass, parsed.data);
  await audit({ actorId: req.user.id, action: 'class.checkins_scheduled', entityType: 'class', entityId: klass.id, metadata: { ...parsed.data, ...result }, ip: req.ip });
  res.json(result);
}));

/* Turn several weeks on or off in one go — a mid-term break is rarely one week. */
router.post('/weeks/bulk-checkin', asyncRoute(async (req, res) => {
  const parsed = z.object({ weekIds: z.array(z.string().uuid()).min(1).max(60), enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose at least one week.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Write a subject and a message.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid feedback.' });
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
  const parsed = z.object({ corrections: z.string().max(20000).default(''), generalFeedback: z.string().max(12000).default('') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid feedback.' });
  const current = await one('SELECT id, teacher_audio_path FROM homework_submissions WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Homework submission not found.' });
  const hasText = parsed.data.corrections.trim() && parsed.data.generalFeedback.trim();
  if (!hasText && !current.teacher_audio_path) {
    return res.status(400).json({ error: 'Complete both feedback sections, or record a voice note.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid feedback draft.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid homework feedback draft.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Write a note before saving.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid note update.' });
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
  res.json({
    class: { ...klass, label: classLabel(klass) },
    threads, categories, contributors, sort, categoryId,
  });
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
  await audit({ actorId: req.user.id, action: 'community.thread_created', entityType: 'thread', entityId: row.id, metadata: { scheduled: Boolean(parsed.data.publishedAt) }, ip: req.ip });
  res.status(201).json({ ...row, pinned: parsed.data.pinned });
}));

/* Rescheduling, or releasing something early. Setting it to now is how a
   scheduled post gets published on the spot. */
router.patch('/community/thread/:id/schedule', asyncRoute(async (req, res) => {
  const parsed = z.object({ publishedAt: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose when this should go out.' });
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
  await fs.writeFile(path.join(config.uploadDir, storedName), req.file.buffer);
  res.status(201).json({
    kind: 'file',
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid thread change.' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Say whether to remove or restore.' });
  const row = await one(
    `UPDATE discussion_threads SET deleted_at=$1,deleted_by=$2,updated_at=now() WHERE id=$3 RETURNING *`,
    [parsed.data.removed ? new Date() : null, parsed.data.removed ? req.user.id : null, req.params.id],
  );
  if (!row) return res.status(404).json({ error: 'Thread not found.' });
  await audit({ actorId: req.user.id, action: parsed.data.removed ? 'community.thread_removed' : 'community.thread_restored', entityType: 'thread', entityId: row.id, ip: req.ip });
  res.json(row);
}));

router.post('/community/post/:id/removal', asyncRoute(async (req, res) => {
  const parsed = z.object({ removed: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Say whether to remove or restore.' });
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
  // Null means every class sees it, which is what a course taught identically
  // to both groups needs.
  classId: z.string().uuid().nullable().optional(),
  coverUrl: z.string().max(2000).nullable().optional(),
  published: z.boolean().optional().default(false),
});

router.post('/courses', asyncRoute(async (req, res) => {
  const parsed = courseInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give the course a title.' });
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM courses');
  const row = await one(
    `INSERT INTO courses(class_id,title,description,cover_url,published,position,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [parsed.data.classId || null, parsed.data.title, parsed.data.description,
     parsed.data.coverUrl || null, parsed.data.published, next.position, req.user.id],
  );
  await audit({ actorId: req.user.id, action: 'course.created', entityType: 'course', entityId: row.id, ip: req.ip });
  res.status(201).json(row);
}));

router.patch('/courses/:id', asyncRoute(async (req, res) => {
  const parsed = courseInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid course.' });
  const current = await one('SELECT * FROM courses WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Course not found.' });
  const data = parsed.data;
  const row = await one(
    `UPDATE courses SET title=$1,description=$2,class_id=$3,cover_url=$4,published=$5,updated_at=now()
     WHERE id=$6 RETURNING *`,
    [data.title ?? current.title, data.description ?? current.description,
     data.classId === undefined ? current.class_id : (data.classId || null),
     data.coverUrl === undefined ? current.cover_url : (data.coverUrl || null),
     data.published ?? current.published, current.id],
  );
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
  if (!parsed.success) return res.status(400).json({ error: 'Give the section a title.' });
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM course_modules WHERE course_id=$1', [req.params.id]);
  const row = await one(
    'INSERT INTO course_modules(course_id,title,position) VALUES ($1,$2,$3) RETURNING *',
    [req.params.id, parsed.data.title, next.position],
  );
  res.status(201).json(row);
}));

router.patch('/modules/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give the section a title.' });
  const row = await one('UPDATE course_modules SET title=$1 WHERE id=$2 RETURNING *', [parsed.data.title, req.params.id]);
  if (!row) return res.status(404).json({ error: 'Section not found.' });
  res.json(row);
}));

router.delete('/modules/:id', asyncRoute(async (req, res) => {
  await query('DELETE FROM course_modules WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

const lessonInput = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(20000).optional().default(''),
  videoProvider: z.enum(VIDEO_PROVIDERS).nullable().optional(),
  // Whatever was pasted: a whole URL or a bare id, sorted out below.
  video: z.string().max(2000).nullable().optional(),
  durationSeconds: z.coerce.number().int().min(0).max(60 * 60 * 12).nullable().optional(),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  published: z.boolean().optional().default(true),
});

/* A lesson without a recording is a normal state — the notes often exist before
   the class has been taught — so an empty video is accepted and only a video
   that cannot be understood is refused. */
function resolveVideo(data, current = {}) {
  if (data.videoProvider === undefined && data.video === undefined) {
    return { provider: current.video_provider ?? null, ref: current.video_ref ?? null };
  }
  const provider = data.videoProvider ?? current.video_provider;
  const raw = data.video ?? current.video_ref;
  if (!provider || !String(raw || '').trim()) return { provider: null, ref: null };
  const parsed = parseVideoSource(provider, raw);
  if (!parsed) {
    throw Object.assign(new Error('That video link was not recognised for the host you chose.'), { status: 400 });
  }
  return parsed;
}

router.post('/modules/:id/lessons', asyncRoute(async (req, res) => {
  const parsed = lessonInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give the lesson a title.' });
  const video = resolveVideo(parsed.data);
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM course_lessons WHERE module_id=$1', [req.params.id]);
  const row = await one(
    `INSERT INTO course_lessons(module_id,title,notes,video_provider,video_ref,duration_seconds,recorded_on,published,position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, parsed.data.title, parsed.data.notes, video.provider, video.ref,
     parsed.data.durationSeconds || null, parsed.data.recordedOn || null, parsed.data.published, next.position],
  );
  await audit({ actorId: req.user.id, action: 'lesson.created', entityType: 'lesson', entityId: row.id, ip: req.ip });
  res.status(201).json(row);
}));

router.patch('/lessons/:id', asyncRoute(async (req, res) => {
  const parsed = lessonInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid lesson.' });
  const current = await one('SELECT * FROM course_lessons WHERE id=$1', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Lesson not found.' });
  const data = parsed.data;
  const video = resolveVideo(data, current);
  const row = await one(
    `UPDATE course_lessons SET title=$1,notes=$2,video_provider=$3,video_ref=$4,
       duration_seconds=$5,recorded_on=$6,published=$7,updated_at=now()
     WHERE id=$8 RETURNING *`,
    [data.title ?? current.title, data.notes ?? current.notes, video.provider, video.ref,
     data.durationSeconds === undefined ? current.duration_seconds : (data.durationSeconds || null),
     data.recordedOn === undefined ? current.recorded_on : (data.recordedOn || null),
     data.published ?? current.published, current.id],
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid order.' });
  await transaction(async (client) => {
    for (const [index, module] of parsed.data.modules.entries()) {
      await client.query('UPDATE course_modules SET position=$1 WHERE id=$2 AND course_id=$3',
        [index, module.id, req.params.id]);
      for (const [lessonIndex, lessonId] of module.lessons.entries()) {
        await client.query('UPDATE course_lessons SET position=$1 WHERE id=$2 AND module_id=$3',
          [lessonIndex, lessonId, module.id]);
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
  await fs.writeFile(path.join(config.uploadDir, storedName), req.file.buffer);
  const next = await one('SELECT COALESCE(max(position),-1)+1 position FROM lesson_attachments WHERE lesson_id=$1', [req.params.id]);
  const row = await one(
    `INSERT INTO lesson_attachments(lesson_id,url,stored_name,file_name,mime_type,size_bytes,position)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, `/uploads/${storedName}`, storedName, req.file.originalname.slice(0, 200),
     document.mimeType, req.file.size, next.position],
  );
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

export default router;
