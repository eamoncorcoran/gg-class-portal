import cron from 'node-cron';
import { one, query } from './db.js';
import { sendPrivateMessageNotice } from './email.js';

/**
 * Private messages: one long conversation between each student and the teacher.
 *
 * A student has exactly one conversation and it is never closed, so going into
 * Private message always shows everything the two of them have said, oldest at
 * the top, with the place to write underneath. The teacher has the same thread
 * from the other side, plus a list of who has written.
 *
 * Any administrator may read and answer; to the student it is all "the
 * teacher". Nobody else can ever see a conversation, and a student can only
 * ever reach their own: every query here is keyed by the signed-in student's
 * id, never by an id taken from the request.
 */

export const MESSAGE_MAX = 5000;
/* More than this from one person inside ten minutes is not a conversation. */
const BURST_LIMIT = 30;

const shape = (row) => ({
  id: row.id,
  fromTeacher: row.from_teacher,
  senderName: row.sender_name || (row.from_teacher ? 'Teacher' : 'Student'),
  body: row.body,
  createdAt: row.created_at,
  readAt: row.read_at,
});

const THREAD_SQL = `SELECT m.*, u.name sender_name FROM private_messages m
  LEFT JOIN users u ON u.id=m.sender_id WHERE m.student_id=$1 ORDER BY m.created_at, m.id`;

/** The teacher a student is writing to: the lead administrator, by name and face. */
export async function leadTeacher() {
  const row = await one(
    `SELECT id, name, avatar_path FROM users WHERE role='admin' AND active=true
     ORDER BY is_super_admin DESC NULLS LAST, created_at LIMIT 1`,
  );
  return row ? { id: row.id, name: row.name, firstName: String(row.name).split(' ')[0], avatar: row.avatar_path ? `/api/media/avatar/${row.id}` : undefined } : { name: 'Your teacher', firstName: 'your teacher' };
}

async function guardBurst(senderId) {
  const recent = await one(
    `SELECT count(*)::int n FROM private_messages WHERE sender_id=$1 AND created_at > now() - interval '10 minutes'`,
    [senderId],
  );
  if ((recent?.n || 0) >= BURST_LIMIT) {
    throw Object.assign(new Error('That is a lot of messages in a few minutes. Give it a little while and try again.'), { status: 429 });
  }
}

/* ---- the student's side ------------------------------------------------ */

/** The whole conversation. Opening it is reading it: the teacher's messages are marked read. */
export async function studentThread(studentId, { markRead = true } = {}) {
  if (markRead) {
    await query(`UPDATE private_messages SET read_at=now() WHERE student_id=$1 AND from_teacher=true AND read_at IS NULL`, [studentId]);
  }
  const rows = await query(THREAD_SQL, [studentId]);
  return { teacher: await leadTeacher(), messages: rows.rows.map(shape) };
}

export async function studentUnread(studentId) {
  const row = await one(`SELECT count(*)::int n FROM private_messages WHERE student_id=$1 AND from_teacher=true AND read_at IS NULL`, [studentId]);
  return row?.n || 0;
}

export async function studentSends(student, body) {
  await guardBurst(student.id);
  const row = await one(
    `INSERT INTO private_messages(student_id,sender_id,from_teacher,body) VALUES ($1,$1,false,$2) RETURNING *`,
    [student.id, body],
  );
  return shape({ ...row, sender_name: student.name });
}

/* ---- the teacher's side ------------------------------------------------ */

/** Everybody who has a conversation, newest first, and every student who could be written to. */
export async function teacherInbox() {
  const conversations = await query(
    `SELECT u.id, u.name, u.email, u.avatar_path, u.active,
            last.body last_body, last.created_at last_at, last.from_teacher last_from_teacher,
            (SELECT count(*)::int FROM private_messages x WHERE x.student_id=u.id AND x.from_teacher=false AND x.read_at IS NULL) unread,
            (SELECT c.programme_name FROM classes c JOIN class_students cs ON cs.class_id=c.id
              WHERE cs.student_id=u.id AND cs.active=true ORDER BY cs.enrolled_at DESC LIMIT 1) class_name
     FROM users u
     JOIN LATERAL (SELECT body, created_at, from_teacher FROM private_messages m WHERE m.student_id=u.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) last ON true
     ORDER BY last.created_at DESC`,
  );
  const students = await query(
    `SELECT u.id, u.name,
            (SELECT c.programme_name FROM classes c JOIN class_students cs ON cs.class_id=c.id
              WHERE cs.student_id=u.id AND cs.active=true ORDER BY cs.enrolled_at DESC LIMIT 1) class_name
     FROM users u WHERE u.role='student' AND u.active=true ORDER BY u.name`,
  );
  const face = (row) => (row.avatar_path ? `/api/media/avatar/${row.id}` : undefined);
  return {
    unread: conversations.rows.reduce((sum, row) => sum + row.unread, 0),
    conversations: conversations.rows.map((row) => ({
      studentId: row.id, name: row.name, email: row.email, avatar: face(row), className: row.class_name || null, active: row.active,
      lastBody: String(row.last_body).slice(0, 200), lastAt: row.last_at, lastFromTeacher: row.last_from_teacher, unread: row.unread,
    })),
    students: students.rows.map((row) => ({ id: row.id, name: row.name, className: row.class_name || null })),
  };
}

export async function teacherUnread() {
  const row = await one(`SELECT count(*)::int n FROM private_messages WHERE from_teacher=false AND read_at IS NULL`);
  return row?.n || 0;
}

/** One student's conversation, from the teacher's side. Opening it marks the student's messages read. */
export async function teacherThread(studentId, { markRead = true } = {}) {
  const student = await one(
    `SELECT u.id, u.name, u.email, u.avatar_path, u.active, u.role,
            (SELECT c.programme_name FROM classes c JOIN class_students cs ON cs.class_id=c.id
              WHERE cs.student_id=u.id AND cs.active=true ORDER BY cs.enrolled_at DESC LIMIT 1) class_name
     FROM users u WHERE u.id=$1`,
    [studentId],
  );
  if (!student || student.role !== 'student') throw Object.assign(new Error('There is no such student.'), { status: 404 });
  if (markRead) {
    await query(`UPDATE private_messages SET read_at=now() WHERE student_id=$1 AND from_teacher=false AND read_at IS NULL`, [studentId]);
  }
  const rows = await query(THREAD_SQL, [studentId]);
  return {
    student: { id: student.id, name: student.name, email: student.email, avatar: student.avatar_path ? `/api/media/avatar/${student.id}` : undefined, className: student.class_name || null, active: student.active },
    messages: rows.rows.map(shape),
  };
}

export async function teacherSends(teacher, studentId, body) {
  const student = await one(`SELECT id, role, active FROM users WHERE id=$1`, [studentId]);
  if (!student || student.role !== 'student') throw Object.assign(new Error('There is no such student.'), { status: 404 });
  if (!student.active) throw Object.assign(new Error('This student’s account is switched off, so they would not see a reply.'), { status: 409 });
  await guardBurst(teacher.id);
  const row = await one(
    `INSERT INTO private_messages(student_id,sender_id,from_teacher,body) VALUES ($1,$2,true,$3) RETURNING *`,
    [studentId, teacher.id, body],
  );
  /* Answering is reading: whatever the student wrote before this is seen. */
  await query(`UPDATE private_messages SET read_at=now() WHERE student_id=$1 AND from_teacher=false AND read_at IS NULL`, [studentId]);
  return shape({ ...row, sender_name: teacher.name });
}

/* ---- telling the other side, by email ---------------------------------- */

/* How long a message waits before anybody is emailed about it.
   ------------------------------------------------------------------
   Long enough that three messages typed one after another are one email, and
   that a message read straight away in the portal is no email at all. Short
   enough that a reply still reaches somebody who has closed the tab. */
export const QUIET_SECONDS = 90;

/**
 * One email per side of a conversation, for everything written since the last
 * one and not yet read. Run every minute.
 *
 * A student's messages go to the lead administrators. The teacher's go to the
 * student. Each email carries the words, because they are the reader's own
 * conversation, and one button back to it. Replying happens in the portal, so
 * the thread stays whole.
 */
export async function announceMessages({ now = new Date() } = {}) {
  const due = await query(
    `SELECT m.*, s.name sender_name FROM private_messages m LEFT JOIN users s ON s.id=m.sender_id
     WHERE m.emailed_at IS NULL AND m.read_at IS NULL AND m.created_at < $1::timestamptz - make_interval(secs => $2)
     ORDER BY m.created_at, m.id`,
    [now, QUIET_SECONDS],
  );
  if (!due.rows.length) return { sent: 0 };

  const groups = new Map();
  for (const row of due.rows) {
    const key = `${row.student_id}:${row.from_teacher}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let sent = 0;
  for (const rows of groups.values()) {
    const { student_id: studentId, from_teacher: fromTeacher } = rows[0];
    /* Claimed before sending, in one statement, so a second sweep that starts
       while this one is still talking to the mail server cannot send it again. */
    const claimed = await query(
      `UPDATE private_messages SET emailed_at=now() WHERE id = ANY($1) AND emailed_at IS NULL RETURNING id`,
      [rows.map((row) => row.id)],
    );
    const mine = rows.filter((row) => claimed.rows.some((c) => c.id === row.id));
    if (!mine.length) continue;
    try {
      const student = await one(`SELECT id, name, email, active FROM users WHERE id=$1`, [studentId]);
      if (!student) continue;
      if (fromTeacher) {
        if (!student.active) continue;
        const teacher = await leadTeacher();
        await sendPrivateMessageNotice({ to: student, toTeacher: false, student, fromName: mine.at(-1).sender_name || teacher.name, messages: mine });
        sent += 1;
      } else {
        /* The lead administrators; if nobody is marked as one, every administrator. */
        let teachers = (await query(`SELECT id, name, email FROM users WHERE role='admin' AND active=true AND is_super_admin=true`)).rows;
        if (!teachers.length) teachers = (await query(`SELECT id, name, email FROM users WHERE role='admin' AND active=true`)).rows;
        for (const teacher of teachers) {
          await sendPrivateMessageNotice({ to: teacher, toTeacher: true, student, fromName: student.name, messages: mine });
          sent += 1;
        }
      }
    } catch (error) {
      /* Not put back in the queue. The message itself is safe in the portal,
         and a mail server that is refusing would be asked again every minute. */
      console.error('Private message email failed', studentId, error.message);
    }
  }
  return { sent };
}

export function startMessageNotifier() {
  cron.schedule('* * * * *', () => {
    announceMessages().catch((error) => console.error('Private message sweep failed', error));
  }, { noOverlap: true });
}
