import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { asyncRoute } from '../middleware.js';
import { requireStudent } from '../session.js';
import { studentProgress } from '../status.js';
import { one, query, transaction } from '../db.js';
import { draftCheckinFeedback, draftHomeworkFeedback } from '../ai.js';
import { audit } from '../audit.js';
import { ensureWeeksForClass } from '../weeks.js';
import { withVoiceNote, withVoiceNotes } from '../voice.js';
import { ensureCalendarToken, rotateCalendarToken } from '../calendar.js';
import { FILE_TYPE_GROUPS, mimeTypesFor, extractText } from '../documents.js';
import { nextClassAt, joinLinkFor } from '../classtime.js';
import { listThreads, getThread, createThread, createPost, unreadCount, markRead,
  listCategories, toggleLike, topContributors } from '../community.js';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const router = Router();
router.use(requireStudent);

const homeworkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

async function studentClass(studentId) {
  return one(
    `SELECT c.* FROM classes c
     JOIN class_students cs ON cs.class_id=c.id
     WHERE cs.student_id=$1 AND cs.active=true AND c.active=true
     ORDER BY cs.enrolled_at DESC LIMIT 1`,
    [studentId],
  );
}

function assignmentOpen(row) {
  const now = Date.now();
  const deadline = new Date(row.deadline_at).getTime();
  const reopened = row.reopened_until ? new Date(row.reopened_until).getTime() : 0;
  return !row.hard_deadline || now <= deadline || now <= reopened;
}

async function accessibleAssignment(studentId, assignmentId) {
  return one(
    `SELECT a.*,c.timezone,
      COALESCE((SELECT json_agg(jsonb_build_object(
        'id',q.id,'position',q.position,'prompt',q.prompt,'imageUrl',q.image_url,'required',q.required
      ) ORDER BY q.position) FROM assignment_questions q WHERE q.assignment_id=a.id),'[]'::json) questions,
      COALESCE((SELECT json_agg(jsonb_build_object(
        'id',r.id,'fileName',r.file_name,'fileUrl',r.file_url,'mimeType',r.mime_type
      ) ORDER BY r.created_at) FROM assignment_resources r WHERE r.assignment_id=a.id),'[]'::json) resources
     FROM assignments a
     JOIN classes c ON c.id=a.class_id
     JOIN class_students cs ON cs.class_id=a.class_id AND cs.student_id=$1 AND cs.active=true
     WHERE a.id=$2 AND a.status='published' AND a.visible_at<=now()`,
    [studentId, assignmentId],
  );
}

/**
 * Everything a student is allowed to see of a check-in or a submission.
 *
 * The `ai_*` columns and the `ai_drafted` state are working notes for the
 * teacher: what the model proposed before it was read, edited and approved. What
 * the student receives is the teacher's reply, because that is what it is by the
 * time it reaches them — nobody returns a draft without reading it.
 *
 * Stripped on the way out rather than merely hidden in the interface, so opening
 * the network tab reveals nothing the screen does not. `feedback_state` collapses
 * to the only two states that mean anything from this side.
 */
function forStudent(row) {
  if (!row) return row;
  const {
    ai_feedback: _f, ai_corrections: _c, ai_general_feedback: _g,
    feedback_state: state, ...rest
  } = row;
  return { ...rest, feedback_state: state === 'returned' ? 'returned' : 'pending' };
}

const allForStudent = (rows = []) => rows.map(forStudent);

/* Once someone has withdrawn, nothing more is asked of them. Their existing work
   and feedback stay exactly where they are. */
async function refuseIfWithdrawn(req, res) {
  const me = await one('SELECT withdrawn_at FROM users WHERE id=$1', [req.user.id]);
  if (me?.withdrawn_at) {
    res.status(409).json({ error: 'You have withdrawn from this course, so submissions are closed.' });
    return true;
  }
  return false;
}

router.get('/bootstrap', asyncRoute(async (req, res) => {
  const me = await one('SELECT withdrawn_at FROM users WHERE id=$1', [req.user.id]);
  const klass = await studentClass(req.user.id);
  if (!klass) {
    return res.json({ student: req.user, class: null, weeks: [], attendance: [], checkins: [], assignments: [], homework: [], notifications: 0, withdrawnAt: me?.withdrawn_at || null });
  }
  await ensureWeeksForClass(klass);
  const now = DateTime.utc();
  const currentMonday = now.setZone(klass.timezone).startOf('week').toISODate();
  const [weeksResult, attendanceResult, checkinsResult, assignmentsResult, dismissalsResult, homeworkResult] = await Promise.all([
    query(
      `SELECT *, checkin_release_at<=now() checkin_available
       FROM weeks
       WHERE class_id=$1 AND week_start<=$2
       ORDER BY week_start`,
      [klass.id, currentMonday],
    ),
    query(
      `SELECT at.* FROM attendance at
       JOIN weeks w ON w.id=at.week_id
       WHERE w.class_id=$1 AND at.student_id=$2`,
      [klass.id, req.user.id],
    ),
    query(
      `SELECT ch.* FROM checkins ch
       JOIN weeks w ON w.id=ch.week_id
       WHERE w.class_id=$1 AND ch.student_id=$2`,
      [klass.id, req.user.id],
    ),
    query(
      `SELECT a.*,
        COALESCE((SELECT json_agg(jsonb_build_object(
          'id',q.id,'position',q.position,'prompt',q.prompt,'imageUrl',q.image_url,'required',q.required
        ) ORDER BY q.position) FROM assignment_questions q WHERE q.assignment_id=a.id),'[]'::json) questions,
        COALESCE((SELECT json_agg(jsonb_build_object(
          'id',r.id,'fileName',r.file_name,'fileUrl',r.file_url,'mimeType',r.mime_type
        ) ORDER BY r.created_at) FROM assignment_resources r WHERE r.assignment_id=a.id),'[]'::json) resources
       FROM assignments a
       WHERE a.class_id=$1 AND a.status='published' AND a.visible_at<=now()
       ORDER BY a.deadline_at`,
      [klass.id],
    ),
    query('SELECT kind, ref_id FROM dismissed_deadlines WHERE student_id=$1', [req.user.id]),
    query(
      `SELECT hs.*,
         COALESCE((SELECT json_agg(jsonb_build_object('id',f.id,'fileName',f.file_name,'mimeType',f.mime_type,
           'sizeBytes',f.size_bytes,'extractionState',f.extraction_state) ORDER BY f.created_at)
           FROM homework_files f WHERE f.submission_id=hs.id),'[]'::json) files
       FROM homework_submissions hs
       JOIN assignments a ON a.id=hs.assignment_id
       WHERE a.class_id=$1 AND hs.student_id=$2`,
      [klass.id, req.user.id],
    ),
  ]);
  const notifications =
    checkinsResult.rows.filter((row) => row.status === 'returned' && !row.feedback_read_at).length +
    homeworkResult.rows.filter((row) => row.status === 'returned' && !row.feedback_read_at).length;

  /* The next class and the link to join it. Worked out from the class day, time
     and timezone rather than stored, so there is no weekly row to forget to fill
     in. The week the sitting falls in is looked up separately because it may be
     ahead of the weeks a student can otherwise see. */
  const next = nextClassAt(klass);
  const overrideWeeks = next
    ? (await query('SELECT week_start, join_url FROM weeks WHERE class_id=$1 AND week_start=$2', [klass.id, next.weekStart])).rows
    : [];
  const community = await unreadCount({ userId: req.user.id, classId: klass.id });

  res.json({
    student: req.user,
    class: {
      ...klass,
      label: `${klass.programme_name} | ${['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][klass.day_of_week]} | ${String(klass.start_time).slice(0,5)}`,
    },
    nextClass: next ? { ...next, joinUrl: joinLinkFor(klass, overrideWeeks, next), note: klass.join_note || null } : null,
    communityUnread: community,
    weeks: weeksResult.rows,
    attendance: attendanceResult.rows,
    checkins: allForStudent(withVoiceNotes(checkinsResult.rows, 'checkin')),
    assignments: assignmentsResult.rows,
    homework: allForStudent(withVoiceNotes(homeworkResult.rows, 'homework')),
    notifications,
    progress: studentProgress({ checkins: checkinsResult.rows, homework: homeworkResult.rows }),
    dismissals: dismissalsResult.rows.map((row) => ({ kind: row.kind, refId: row.ref_id })),
    withdrawnAt: me?.withdrawn_at || null,
    serverNow: new Date().toISOString(),
  });
}));

router.put('/checkins/:weekId/draft', asyncRoute(async (req, res) => {
  const parsed = z.object({
    answers: z.object({
      attendance: z.string().optional(),
      reviewed: z.string().optional(),
      understanding: z.number().int().min(1).max(10).optional(),
      confidence: z.number().int().min(1).max(10).optional(),
      weeklyWin: z.string().max(2000).optional(),
      support: z.string().max(4000).optional(),
    }),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid check-in draft.' });
  const week = await one(
    `SELECT w.* FROM weeks w
     JOIN class_students cs ON cs.class_id=w.class_id
     WHERE w.id=$1 AND cs.student_id=$2 AND cs.active=true
       AND w.checkin_enabled=true AND w.checkin_release_at<=now()`,
    [req.params.weekId, req.user.id],
  );
  if (!week) return res.status(404).json({ error: 'This check-in is not available.' });
  const row = await one(
    `INSERT INTO checkins(week_id,student_id,status,answers,updated_at)
     VALUES ($1,$2,'draft',$3::jsonb,now())
     ON CONFLICT (week_id,student_id) DO UPDATE
       SET answers=EXCLUDED.answers,
           status=CASE WHEN checkins.status='returned' THEN checkins.status ELSE 'draft' END,
           updated_at=now()
     RETURNING *`,
    [week.id, req.user.id, JSON.stringify(parsed.data.answers)],
  );
  res.json(forStudent(row));
}));

router.post('/checkins/:weekId/submit', asyncRoute(async (req, res) => {
  if (await refuseIfWithdrawn(req, res)) return;
  const parsed = z.object({
    answers: z.object({
      attendance: z.string().min(1),
      reviewed: z.string().min(1),
      understanding: z.number().int().min(1).max(10),
      confidence: z.number().int().min(1).max(10),
      weeklyWin: z.string().min(1).max(2000),
      support: z.string().max(4000).optional().default(''),
    }),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Complete every required check-in question.' });
  const week = await one(
    `SELECT w.*,c.programme_name,c.timezone FROM weeks w
     JOIN classes c ON c.id=w.class_id
     JOIN class_students cs ON cs.class_id=w.class_id
     WHERE w.id=$1 AND cs.student_id=$2 AND cs.active=true
       AND w.checkin_enabled=true AND w.checkin_release_at<=now()`,
    [req.params.weekId, req.user.id],
  );
  if (!week) return res.status(404).json({ error: 'This check-in is not available.' });
  // A soft deadline keeps accepting late check-ins; only a hard one closes.
  if (week.checkin_hard_deadline !== false && new Date(week.checkin_due_at).getTime() < Date.now()) {
    return res.status(409).json({ error: 'This check-in deadline has passed.' });
  }
  const row = await one(
    `INSERT INTO checkins(week_id,student_id,status,answers,submitted_at,feedback_state,updated_at)
     VALUES ($1,$2,'submitted',$3::jsonb,now(),'generating',now())
     ON CONFLICT (week_id,student_id) DO UPDATE
       SET answers=EXCLUDED.answers,status='submitted',submitted_at=now(),
           ai_feedback=NULL,teacher_feedback=NULL,feedback_state='generating',
           feedback_returned_at=NULL,feedback_read_at=NULL,updated_at=now()
     RETURNING *`,
    [week.id, req.user.id, JSON.stringify(parsed.data.answers)],
  );
  let feedbackState = 'generating';
  try {
    const reply = await draftCheckinFeedback({
      student: { name: req.user.name, email: req.user.email },
      class: { programmeName: week.programme_name },
      weekStart: week.week_start,
      checkin: parsed.data.answers,
    });
    await query(
      `UPDATE checkins SET ai_feedback=$1,teacher_feedback=$1,feedback_state='ai_drafted',updated_at=now()
       WHERE id=$2`,
      [reply, row.id],
    );
    feedbackState = 'ai_drafted';
  } catch (error) {
    console.error('Check-in draft generation failed', error);
    await query(`UPDATE checkins SET feedback_state='failed',updated_at=now() WHERE id=$1`, [row.id]);
    feedbackState = 'failed';
  }
  await audit({ actorId: req.user.id, action: 'checkin.submitted', entityType: 'checkin', entityId: row.id, ip: req.ip });
  res.json(forStudent({ ...row, feedback_state: feedbackState }));
}));

router.post('/checkins/:id/read-feedback', asyncRoute(async (req, res) => {
  const row = await one(
    `UPDATE checkins SET feedback_read_at=now(),updated_at=now()
     WHERE id=$1 AND student_id=$2 AND status='returned' RETURNING *`,
    [req.params.id, req.user.id],
  );
  if (!row) return res.status(404).json({ error: 'Returned feedback not found.' });
  res.json(forStudent(withVoiceNote(row, 'checkin')));
}));

router.get('/assignments/:id', asyncRoute(async (req, res) => {
  const assignment = await accessibleAssignment(req.user.id, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const submission = await one(
    `SELECT hs.*,
       COALESCE((SELECT json_agg(jsonb_build_object('id',f.id,'fileName',f.file_name,'mimeType',f.mime_type,
         'sizeBytes',f.size_bytes,'extractionState',f.extraction_state) ORDER BY f.created_at)
         FROM homework_files f WHERE f.submission_id=hs.id),'[]'::json) files
     FROM homework_submissions hs WHERE hs.assignment_id=$1 AND hs.student_id=$2`,
    [assignment.id, req.user.id],
  );
  res.json({ assignment: { ...assignment, open: assignmentOpen(assignment) }, submission: submission ? forStudent(withVoiceNote(submission, 'homework')) : null });
}));

router.put('/assignments/:id/draft', asyncRoute(async (req, res) => {
  const parsed = z.object({
    answers: z.array(z.string().max(20000)),
    currentQuestion: z.number().int().min(0),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid homework draft.' });
  const assignment = await accessibleAssignment(req.user.id, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (!assignmentOpen(assignment)) return res.status(409).json({ error: 'This assignment is closed.' });
  const row = await one(
    `INSERT INTO homework_submissions(assignment_id,student_id,status,answers,current_question,updated_at)
     VALUES ($1,$2,'draft',$3::jsonb,$4,now())
     ON CONFLICT (assignment_id,student_id) DO UPDATE
       SET answers=EXCLUDED.answers,current_question=EXCLUDED.current_question,
           status=CASE WHEN homework_submissions.status='returned' THEN homework_submissions.status ELSE 'draft' END,
           updated_at=now()
     RETURNING *`,
    [assignment.id, req.user.id, JSON.stringify(parsed.data.answers), parsed.data.currentQuestion],
  );
  res.json(forStudent(row));
}));

router.post('/assignments/:id/submit', asyncRoute(async (req, res) => {
  if (await refuseIfWithdrawn(req, res)) return;
  const parsed = z.object({ answers: z.array(z.string().max(20000)) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid homework submission.' });
  const assignment = await accessibleAssignment(req.user.id, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (!assignmentOpen(assignment)) return res.status(409).json({ error: 'This assignment is closed.' });
  const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
  const missingRequired = questions.some((question, index) => question.required && !String(parsed.data.answers[index] || '').trim());
  if (missingRequired) return res.status(400).json({ error: 'Complete every required homework question.' });

  const uploaded = assignment.allow_uploads
    ? (await query(
        `SELECT f.file_name, f.extracted_text, f.extraction_state FROM homework_files f
         JOIN homework_submissions hs ON hs.id=f.submission_id
         WHERE hs.assignment_id=$1 AND hs.student_id=$2 ORDER BY f.created_at`,
        [assignment.id, req.user.id],
      )).rows
    : [];
  if (assignment.uploads_required && !uploaded.length) {
    return res.status(400).json({ error: 'Upload your work before submitting this assignment.' });
  }
  const row = await one(
    `INSERT INTO homework_submissions(
       assignment_id,student_id,status,answers,current_question,submitted_at,feedback_state,updated_at
     ) VALUES ($1,$2,'submitted',$3::jsonb,$4,now(),'generating',now())
     ON CONFLICT (assignment_id,student_id) DO UPDATE
       SET answers=EXCLUDED.answers,current_question=EXCLUDED.current_question,status='submitted',
           submitted_at=now(),ai_corrections=NULL,ai_general_feedback=NULL,
           teacher_corrections=NULL,teacher_general_feedback=NULL,feedback_state='generating',
           feedback_returned_at=NULL,feedback_read_at=NULL,updated_at=now()
     RETURNING *`,
    [assignment.id, req.user.id, JSON.stringify(parsed.data.answers), Math.max(0, questions.length - 1)],
  );
  let feedbackState = 'generating';
  try {
    const feedback = await draftHomeworkFeedback({
      student: { name: req.user.name, email: req.user.email },
      assignment: { title: assignment.title, instructions: assignment.instructions },
      questions: [
        ...questions.map((question, index) => ({
          prompt: question.prompt,
          answer: parsed.data.answers[index] || '',
        })),
        // Work handed up as a file is read into text on upload, so corrections
        // cover a photo of handwriting the same as anything typed in.
        ...uploaded
          .filter((file) => file.extraction_state === 'done' && String(file.extracted_text || '').trim())
          .map((file) => ({ prompt: `Uploaded work: ${file.file_name}`, answer: file.extracted_text })),
      ],
    });
    await query(
      `UPDATE homework_submissions SET
         ai_corrections=$1,ai_general_feedback=$2,
         teacher_corrections=$1,teacher_general_feedback=$2,
         feedback_state='ai_drafted',updated_at=now()
       WHERE id=$3`,
      [feedback.corrections, feedback.generalFeedback, row.id],
    );
    feedbackState = 'ai_drafted';
  } catch (error) {
    console.error('Homework draft generation failed', error);
    await query(`UPDATE homework_submissions SET feedback_state='failed',updated_at=now() WHERE id=$1`, [row.id]);
    feedbackState = 'failed';
  }
  await audit({ actorId: req.user.id, action: 'homework.submitted', entityType: 'homework_submission', entityId: row.id, ip: req.ip });
  res.json(forStudent({ ...row, feedback_state: feedbackState }));
}));

router.post('/homework/:id/read-feedback', asyncRoute(async (req, res) => {
  const row = await one(
    `UPDATE homework_submissions SET feedback_read_at=now(),updated_at=now()
     WHERE id=$1 AND student_id=$2 AND status='returned' RETURNING *`,
    [req.params.id, req.user.id],
  );
  if (!row) return res.status(404).json({ error: 'Returned feedback not found.' });
  res.json(forStudent(withVoiceNote(row, 'homework')));
}));

/* Students subscribe to their own deadlines. The token is theirs alone and only
   ever reaches the signed-in owner. */
router.get('/calendar-feed', asyncRoute(async (req, res) => {
  const token = await ensureCalendarToken(req.user.id);
  res.json({ url: `${config.appUrl}/calendar/${token}.ics`, token });
}));

router.post('/calendar-feed/rotate', asyncRoute(async (req, res) => {
  const token = await rotateCalendarToken(req.user.id);
  await audit({ actorId: req.user.id, action: 'calendar.token_rotated', entityType: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ url: `${config.appUrl}/calendar/${token}.ics`, token });
}));

/* The course withdrawal form. Deliberately tucked away under the account screen:
   it should be findable when someone genuinely needs it and invisible otherwise. */
router.get('/withdrawal', asyncRoute(async (req, res) => {
  const row = await one('SELECT * FROM course_withdrawals WHERE student_id=$1', [req.user.id]);
  const me = await one('SELECT withdrawn_at FROM users WHERE id=$1', [req.user.id]);
  res.json({ withdrawnAt: me?.withdrawn_at || null, response: row || null });
}));

router.post('/withdrawal', asyncRoute(async (req, res) => {
  const parsed = z.object({
    reason: z.string().trim().min(1).max(120),
    detail: z.string().max(4000).optional().default(''),
    overallRating: z.coerce.number().int().min(1).max(5).optional(),
    teachingRating: z.coerce.number().int().min(1).max(5).optional(),
    materialsRating: z.coerce.number().int().min(1).max(5).optional(),
    pace: z.string().max(60).optional().default(''),
    whatWorked: z.string().max(4000).optional().default(''),
    whatToImprove: z.string().max(4000).optional().default(''),
    wouldRecommend: z.string().max(60).optional().default(''),
    mayContact: z.boolean().optional().default(false),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Tell us the main reason before submitting.' });

  const existing = await one('SELECT withdrawn_at FROM users WHERE id=$1', [req.user.id]);
  if (existing?.withdrawn_at) return res.status(409).json({ error: 'You have already withdrawn from this course.' });

  const klass = await studentClass(req.user.id);
  const data = parsed.data;
  const row = await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO course_withdrawals(student_id,class_id,reason,detail,overall_rating,teaching_rating,
         materials_rating,pace,what_worked,what_to_improve,would_recommend,may_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (student_id) DO UPDATE SET
         reason=EXCLUDED.reason, detail=EXCLUDED.detail, overall_rating=EXCLUDED.overall_rating,
         teaching_rating=EXCLUDED.teaching_rating, materials_rating=EXCLUDED.materials_rating,
         pace=EXCLUDED.pace, what_worked=EXCLUDED.what_worked, what_to_improve=EXCLUDED.what_to_improve,
         would_recommend=EXCLUDED.would_recommend, may_contact=EXCLUDED.may_contact, submitted_at=now()
       RETURNING *`,
      [req.user.id, klass?.id || null, data.reason, data.detail, data.overallRating || null,
       data.teachingRating || null, data.materialsRating || null, data.pace, data.whatWorked,
       data.whatToImprove, data.wouldRecommend, data.mayContact],
    );
    // This is what stops reminders, nudges and new work reaching them.
    await client.query('UPDATE users SET withdrawn_at=now(), updated_at=now() WHERE id=$1', [req.user.id]);
    return inserted.rows[0];
  });

  await audit({ actorId: req.user.id, action: 'course.withdrawn', entityType: 'user', entityId: req.user.id, metadata: { reason: data.reason, classId: klass?.id }, ip: req.ip });
  res.status(201).json({ ok: true, withdrawnAt: new Date().toISOString(), response: row });
}));

/* Uploading work. The file is read straight away so the correction pipeline has
   something to work with, but a failed read never costs the student their upload. */
router.post('/assignments/:id/files', homeworkUpload.single('file'), asyncRoute(async (req, res) => {
  const assignment = await accessibleAssignment(req.user.id, req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (!assignment.allow_uploads) return res.status(409).json({ error: 'This assignment does not accept uploads.' });
  if (!assignmentOpen(assignment)) return res.status(409).json({ error: 'This assignment is closed.' });
  if (await refuseIfWithdrawn(req, res)) return;
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });

  const accepted = mimeTypesFor(assignment.accepted_file_types || []);
  const base = String(req.file.mimetype).split(';')[0];
  if (!accepted.has(base)) {
    const names = (assignment.accepted_file_types || []).map((group) => FILE_TYPE_GROUPS[group]?.label).filter(Boolean);
    return res.status(400).json({ error: `That file type is not accepted. This assignment takes: ${names.join(', ') || 'nothing'}.` });
  }

  const submission = await one(
    `INSERT INTO homework_submissions(assignment_id,student_id,status,answers,updated_at)
     VALUES ($1,$2,'draft','[]'::jsonb,now())
     ON CONFLICT (assignment_id,student_id) DO UPDATE SET updated_at=now()
     RETURNING *`,
    [assignment.id, req.user.id],
  );

  const existing = await one('SELECT count(*)::int count FROM homework_files WHERE submission_id=$1', [submission.id]);
  if (existing.count >= (assignment.max_files || 3)) {
    return res.status(409).json({ error: `You can upload up to ${assignment.max_files || 3} file${(assignment.max_files || 3) === 1 ? '' : 's'} for this assignment.` });
  }

  const extension = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const storedName = `homework-${crypto.randomUUID()}${extension}`;
  await fs.writeFile(path.join(config.privateUploadDir, storedName), req.file.buffer);

  const read = await extractText({ buffer: req.file.buffer, mimeType: base, fileName: req.file.originalname });
  const row = await one(
    `INSERT INTO homework_files(submission_id,student_id,stored_name,file_name,mime_type,size_bytes,extracted_text,extraction_state,extraction_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,file_name,mime_type,size_bytes,extraction_state`,
    [submission.id, req.user.id, storedName, req.file.originalname.slice(0, 200), base, req.file.size, read.text, read.state, read.error || null],
  );
  res.status(201).json({
    id: row.id, fileName: row.file_name, mimeType: row.mime_type,
    sizeBytes: row.size_bytes, extractionState: row.extraction_state,
  });
}));

router.delete('/files/:fileId', asyncRoute(async (req, res) => {
  const file = await one(
    `SELECT f.* FROM homework_files f JOIN homework_submissions hs ON hs.id=f.submission_id
     WHERE f.id=$1 AND f.student_id=$2`,
    [req.params.fileId, req.user.id],
  );
  if (!file) return res.status(404).json({ error: 'File not found.' });
  const submission = await one('SELECT status FROM homework_submissions WHERE id=$1', [file.submission_id]);
  if (submission?.status !== 'draft') return res.status(409).json({ error: 'This homework has been submitted, so its files cannot be removed.' });
  await fs.unlink(path.join(config.privateUploadDir, path.basename(file.stored_name))).catch(() => {});
  await query('DELETE FROM homework_files WHERE id=$1', [file.id]);
  res.status(204).end();
}));

/* Clearing a deadline that can no longer be met. The record of the miss is not
   touched — the tracker still shows it and the teacher still sees it. All that
   changes is whether it keeps sitting in this student's list of things to do. */
const dismissal = z.object({ kind: z.enum(['checkin', 'homework']), refId: z.string().uuid() });

router.post('/dismissals', asyncRoute(async (req, res) => {
  const parsed = dismissal.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Say which deadline to dismiss.' });
  const { kind, refId } = parsed.data;

  /* Only genuinely unreachable work can be cleared. Anything still open, and
     anything already handed in, stays where it is. */
  const open = kind === 'checkin'
    ? await one(
        `SELECT 1 FROM weeks w
         JOIN class_students cs ON cs.class_id=w.class_id AND cs.student_id=$2 AND cs.active=true
         WHERE w.id=$1 AND w.checkin_enabled=true AND w.checkin_hard_deadline=true
           AND w.checkin_due_at<now()
           AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.week_id=w.id AND c.student_id=$2 AND c.status<>'draft')`,
        [refId, req.user.id],
      )
    : await one(
        `SELECT 1 FROM assignments a
         JOIN class_students cs ON cs.class_id=a.class_id AND cs.student_id=$2 AND cs.active=true
         WHERE a.id=$1 AND a.status='published' AND a.hard_deadline=true
           AND COALESCE(a.reopened_until, a.deadline_at)<now()
           AND NOT EXISTS (SELECT 1 FROM homework_submissions h WHERE h.assignment_id=a.id AND h.student_id=$2 AND h.status<>'draft')`,
        [refId, req.user.id],
      );
  if (!open) return res.status(409).json({ error: 'Only a missed deadline that has closed can be cleared.' });

  await query(
    `INSERT INTO dismissed_deadlines(student_id, kind, ref_id) VALUES ($1,$2,$3)
     ON CONFLICT (student_id, kind, ref_id) DO NOTHING`,
    [req.user.id, kind, refId],
  );
  res.status(201).json({ ok: true, kind, refId });
}));

router.delete('/dismissals/:kind/:refId', asyncRoute(async (req, res) => {
  const parsed = dismissal.safeParse({ kind: req.params.kind, refId: req.params.refId });
  if (!parsed.success) return res.status(400).json({ error: 'Say which deadline to restore.' });
  await query('DELETE FROM dismissed_deadlines WHERE student_id=$1 AND kind=$2 AND ref_id=$3',
    [req.user.id, parsed.data.kind, parsed.data.refId]);
  res.status(204).end();
}));

/* ------------------------------------------------------------------
   The class board
   ------------------------------------------------------------------ */

/* Everything below is scoped to the one class this student belongs to. There is
   no route that takes a class id from the caller, so there is nothing to tamper
   with to read another group's board. */
async function boardClass(req, res) {
  const klass = await studentClass(req.user.id);
  if (!klass) {
    res.status(404).json({ error: 'You are not in a class yet.' });
    return null;
  }
  return klass;
}

router.get('/community', asyncRoute(async (req, res) => {
  const klass = await boardClass(req, res);
  if (!klass) return;
  const sort = req.query.sort === 'hot' ? 'hot' : 'new';
  const categoryId = req.query.categoryId || null;
  const [threads, categories, contributors] = await Promise.all([
    listThreads({ classId: klass.id, viewerId: req.user.id, categoryId, sort }),
    listCategories(klass.id),
    topContributors({ classId: klass.id }),
  ]);
  res.json({
    threads, categories, contributors, sort, categoryId,
    unread: await unreadCount({ userId: req.user.id, classId: klass.id }),
  });
}));

/* Opening the board is what clears the badge, not opening each thread. */
router.post('/community/read', asyncRoute(async (req, res) => {
  const klass = await boardClass(req, res);
  if (!klass) return;
  await markRead({ userId: req.user.id, classId: klass.id });
  res.json({ ok: true, unread: 0 });
}));

router.get('/community/thread/:id', asyncRoute(async (req, res) => {
  const klass = await boardClass(req, res);
  if (!klass) return;
  const thread = await getThread({ threadId: req.params.id, viewerId: req.user.id });
  if (!thread || thread.class_id !== klass.id) return res.status(404).json({ error: 'Post not found.' });
  res.json(thread);
}));

router.post('/community/threads', asyncRoute(async (req, res) => {
  const klass = await boardClass(req, res);
  if (!klass) return;
  if (await refuseIfWithdrawn(req, res)) return;
  const parsed = z.object({
    title: z.string().trim().min(2).max(200),
    body: z.string().trim().min(1).max(20000),
    categoryId: z.string().uuid().nullable().optional(),
    /* A Loom link or a GIF, but never a file upload. Nothing a student sends
       here reaches the disk. */
    attachments: z.array(z.object({
      kind: z.enum(['loom', 'gif']),
      url: z.string().url(),
    })).max(4).optional().default([]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Give your post a title and a message.' });
  // A category from another class would put the post somewhere its own filters
  // could never reach.
  const category = parsed.data.categoryId
    ? await one('SELECT id FROM discussion_categories WHERE id=$1 AND class_id=$2', [parsed.data.categoryId, klass.id])
    : null;
  const row = await createThread({
    classId: klass.id, authorId: req.user.id,
    title: parsed.data.title, body: parsed.data.body, categoryId: category?.id || null,
    attachments: parsed.data.attachments,
  });
  await audit({ actorId: req.user.id, action: 'community.thread_created', entityType: 'thread', entityId: row.id, ip: req.ip });
  res.status(201).json(row);
}));

/* Liking. Scoped to this student's own class the same way everything else is:
   the target has to belong to a thread on their board or it does not exist. */
router.post('/community/like/:type/:id', asyncRoute(async (req, res) => {
  const klass = await boardClass(req, res);
  if (!klass) return;
  const type = req.params.type === 'post' ? 'post' : 'thread';
  const owned = type === 'thread'
    ? await one('SELECT 1 FROM discussion_threads WHERE id=$1 AND class_id=$2 AND deleted_at IS NULL', [req.params.id, klass.id])
    : await one(
        `SELECT 1 FROM discussion_posts p JOIN discussion_threads t ON t.id=p.thread_id
         WHERE p.id=$1 AND t.class_id=$2 AND p.deleted_at IS NULL AND t.deleted_at IS NULL`,
        [req.params.id, klass.id],
      );
  if (!owned) return res.status(404).json({ error: 'Not found.' });
  res.json(await toggleLike({ userId: req.user.id, targetType: type, targetId: req.params.id }));
}));

router.post('/community/thread/:id/replies', asyncRoute(async (req, res) => {
  const klass = await boardClass(req, res);
  if (!klass) return;
  if (await refuseIfWithdrawn(req, res)) return;
  const parsed = z.object({ body: z.string().trim().min(1).max(20000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Write a reply before sending.' });
  const thread = await one(
    'SELECT * FROM discussion_threads WHERE id=$1 AND class_id=$2 AND deleted_at IS NULL',
    [req.params.id, klass.id],
  );
  if (!thread) return res.status(404).json({ error: 'Post not found.' });
  if (thread.locked) return res.status(409).json({ error: 'This conversation has been closed to new replies.' });
  const row = await createPost({ threadId: thread.id, authorId: req.user.id, body: parsed.data.body });
  res.status(201).json(row);
}));

export default router;
