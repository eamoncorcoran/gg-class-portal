import cron from 'node-cron';
import { config } from './config.js';
import { query, one } from './db.js';
import { getSetting } from './settings.js';
import { sendDeadlineReminder, sendCheckinReminder, sendClassReminder } from './email.js';
import { classSittings } from './classtime.js';

/* Two hours before a class, give or take the width of one cycle. */
const CLASS_REMINDER_MS = 2 * 60 * 60 * 1000;
const WINDOW_MS = 6 * 60 * 1000;

const thresholds = [
  { key: 'tomorrow', seconds: 24 * 60 * 60 },
  { key: 'twoHours', seconds: 2 * 60 * 60 },
  { key: 'thirtyMinutes', seconds: 30 * 60 },
];

async function candidates(seconds) {
  const result = await query(
    `SELECT a.id assignment_id, a.title, a.deadline_at, c.timezone,
            u.id student_id, u.name, u.email
     FROM assignments a
     JOIN classes c ON c.id=a.class_id
     JOIN class_students cs ON cs.class_id=a.class_id AND cs.active=true
     JOIN users u ON u.id=cs.student_id AND u.active=true AND u.withdrawn_at IS NULL
     LEFT JOIN homework_submissions hs ON hs.assignment_id=a.id AND hs.student_id=u.id
     WHERE a.status='published' AND a.reminders_enabled=true
       AND COALESCE(hs.status,'draft') <> 'submitted' AND COALESCE(hs.status,'draft') <> 'returned'
       AND a.deadline_at BETWEEN now() + ($1::text || ' seconds')::interval - interval '6 minutes'
                           AND now() + ($1::text || ' seconds')::interval + interval '6 minutes'`,
    [seconds],
  );
  return result.rows;
}

export async function runReminderCycle() {
  const settings = await getSetting('reminders', { enabled: true });
  if (settings.enabled === false) return;
  for (const threshold of thresholds) {
    const template = settings[threshold.key];
    if (!template || template.enabled === false) continue;
    const rows = await candidates(threshold.seconds);
    for (const row of rows) {
      const existing = await one(
        `SELECT id FROM email_deliveries WHERE user_id=$1 AND assignment_id=$2 AND template_key=$3`,
        [row.student_id, row.assignment_id, threshold.key],
      );
      if (existing) continue;
      let status = 'failed';
      let providerId = null;
      let error = null;
      try {
        const result = await sendDeadlineReminder({
          student: { id: row.student_id, name: row.name, email: row.email },
          assignment: { id: row.assignment_id, title: row.title, deadline_at: row.deadline_at, timezone: row.timezone },
          template,
        });
        /* A held message is neither sent nor failed, and recording it as sent
           was worse than either: the delivery row stops it being tried again, so
           a reminder held during a pause was lost for good and the log said it
           had gone. Recorded as suppressed, and no row is written, so the next
           cycle picks it up once sending resumes. */
        if (result?.suppressed) { status = 'suppressed'; error = result.reason || null; }
        else { status = result.simulated ? 'simulated' : 'sent'; providerId = result.id; }
      } catch (sendError) {
        error = sendError.message;
        console.error('Reminder delivery failed', sendError);
      }
      /* Nothing recorded for a held message. The row is what stops a reminder
         being sent twice, so writing one for a reminder that never went would
         stop it being sent at all. */
      if (status === 'suppressed') continue;
      await query(
        `INSERT INTO email_deliveries(user_id,assignment_id,template_key,recipient,status,provider_id,error,sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $5 IN ('sent','simulated') THEN now() ELSE NULL END)
         ON CONFLICT (user_id,assignment_id,template_key) DO NOTHING`,
        [row.student_id, row.assignment_id, threshold.key, row.email, status, providerId, error],
      );
    }
  }
}

/* Two reminders that are not about homework.
   ------------------------------------------------------------------
   Both follow the shape of the deadline sequence above, and both are
   deliberately single: one message each, not a sequence. The homework reminder
   fires three times per assignment per student, which is the largest multiplier
   in the portal, and hanging two more sequences beside it would have undone the
   point of narrowing the board notices in the first place.
*/

/* What makes a reminder "the same reminder" differs by kind, so the caller
   chooses the key: a check-in is one per week, a class is one per sitting. */
async function sendOnce({ studentId, email, key, templateKey, send }) {
  const already = await one(
    'SELECT id FROM email_deliveries WHERE user_id=$1 AND dedupe_key=$2', [studentId, key]);
  if (already) return false;

  let status = 'failed';
  let providerId = null;
  let error = null;
  try {
    const result = await send();
    /* Held by the pacing is not sent and not failed. Nothing is recorded, so the
       next cycle picks it up rather than the reminder being lost with the log
       claiming it went. */
    if (result?.suppressed) return false;
    status = result.simulated ? 'simulated' : 'sent';
    providerId = result.id;
  } catch (sendError) {
    error = sendError.message;
    console.error(`Reminder to ${email} failed: ${sendError.message}`);
  }
  await query(
    `INSERT INTO email_deliveries(user_id,dedupe_key,template_key,recipient,status,provider_id,error,sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $5 IN ('sent','simulated') THEN now() ELSE NULL END)
     ON CONFLICT DO NOTHING`,
    [studentId, key, templateKey, email, status, providerId, error],
  );
  return status === 'sent' || status === 'simulated';
}

/* A day before the check-in closes, to whoever has not done it. */
export async function runCheckinReminders() {
  const settings = await getSetting('reminders', { enabled: true });
  if (settings.enabled === false || settings.checkin?.enabled === false) return 0;

  const due = await query(
    `SELECT w.id week_id, w.week_start, w.checkin_due_at, c.timezone,
            u.id student_id, u.name, u.email
     FROM weeks w
     JOIN classes c ON c.id=w.class_id AND c.active=true
     JOIN class_students cs ON cs.class_id=w.class_id AND cs.active=true
     JOIN users u ON u.id=cs.student_id AND u.active=true AND u.withdrawn_at IS NULL
     LEFT JOIN checkins ch ON ch.week_id=w.id AND ch.student_id=u.id
     WHERE w.checkin_enabled=true
       AND w.checkin_release_at <= now()
       AND COALESCE(ch.status,'draft') = 'draft'
       AND w.checkin_due_at BETWEEN now() + interval '24 hours' - interval '6 minutes'
                              AND now() + interval '24 hours' + interval '6 minutes'`,
  );

  let sent = 0;
  for (const row of due.rows) {
    const ok = await sendOnce({
      studentId: row.student_id, email: row.email,
      key: `checkin_due:${row.week_id}`, templateKey: 'checkin_due',
      send: () => sendCheckinReminder({
        student: { id: row.student_id, name: row.name, email: row.email },
        week: row,
      }),
    });
    if (ok) sent += 1;
  }
  return sent;
}

/* Two hours before a class, to everybody on it.
   Sittings are worked out rather than stored, so this asks classtime for them
   the same way the calendar does: a class that was moved is reminded about when
   it actually runs, one that was cancelled is not reminded about at all, and an
   extra session gets its own. */
export async function runClassReminders() {
  const settings = await getSetting('reminders', { enabled: true });
  if (settings.enabled === false || settings.classSoon?.enabled === false) return 0;

  const classes = await query('SELECT * FROM classes WHERE active=true');
  /* Two hours: enough notice to move something and be there, late enough that
     it is about today rather than an item on a list. The cycle runs every five
     minutes, so the window is wide enough that a sitting cannot fall between
     two runs and be missed. */
  const now = Date.now();
  const window = {
    from: now + CLASS_REMINDER_MS - WINDOW_MS,
    to: now + CLASS_REMINDER_MS + WINDOW_MS,
  };
  let sent = 0;

  for (const klass of classes.rows) {
    const [changes, sessions] = await Promise.all([
      query('SELECT on_date, kind, moved_to, reason FROM class_date_changes WHERE class_id=$1', [klass.id]),
      query(`SELECT id, starts_at, duration_minutes, join_url, label, cancelled
             FROM class_sessions WHERE class_id=$1 AND starts_at > now() - interval '1 day'`, [klass.id]),
    ]);
    const soon = classSittings(klass, { changes: changes.rows, sessions: sessions.rows })
      /* Only sittings somebody can turn up to. A week marked recorded has no
         live class, and a skipped one has nothing at all. */
      .filter((sitting) => ['running', 'moved', 'extra'].includes(sitting.kind))
      .filter((sitting) => {
        const at = new Date(sitting.at).getTime();
        return at >= window.from && at <= window.to;
      });
    if (!soon.length) continue;

    const students = await query(
      `SELECT u.id, u.name, u.email FROM class_students cs
       JOIN users u ON u.id=cs.student_id
       WHERE cs.class_id=$1 AND cs.active=true
         AND u.role='student' AND u.active=true AND u.withdrawn_at IS NULL`,
      [klass.id],
    );

    for (const sitting of soon) {
      for (const student of students.rows) {
        const ok = await sendOnce({
          studentId: student.id, email: student.email,
          key: `class_soon:${klass.id}:${new Date(sitting.at).toISOString()}`,
          templateKey: 'class_soon',
          send: () => sendClassReminder({ student, klass, sitting }),
        });
        if (ok) sent += 1;
      }
    }
  }
  return sent;
}

/* Sending this week's check-in reminder by hand.
   ------------------------------------------------------------------
   The scheduled one fires a day before the check-in closes. Sometimes the
   answer is simply "send it now", and waiting for a window to come round is not
   a reason to leave a class unreminded.

   Same audience rule as the scheduled one, minus the timing: an open check-in
   somebody has not done. Never anybody who has already submitted, because
   chasing somebody for work they have handed in is the fastest way to make them
   stop reading these.
*/
async function pendingCheckins(classId = null) {
  const params = [];
  let scope = '';
  if (classId) { params.push(classId); scope = `AND w.class_id=$${params.length}`; }
  const result = await query(
    `SELECT w.id week_id, w.week_start, w.checkin_due_at, c.timezone, c.id class_id,
            c.programme_name, c.day_of_week, c.start_time,
            u.id student_id, u.name, u.email
     FROM weeks w
     JOIN classes c ON c.id=w.class_id AND c.active=true
     JOIN class_students cs ON cs.class_id=w.class_id AND cs.active=true
     JOIN users u ON u.id=cs.student_id AND u.active=true AND u.withdrawn_at IS NULL
     LEFT JOIN checkins ch ON ch.week_id=w.id AND ch.student_id=u.id
     WHERE w.checkin_enabled=true
       AND w.checkin_release_at <= now()
       AND w.checkin_due_at > now()
       AND COALESCE(ch.status,'draft') = 'draft'
       ${scope}
     ORDER BY w.checkin_due_at, u.name`,
    params,
  );
  /* One per student, about whichever closes first.
     A student with two check-ins open is usually a sign that an old week was
     left switched on, and either way two emails about two weeks reads as the
     portal sending the same thing twice. The nearest deadline is the one worth
     chasing. */
  const perStudent = new Map();
  for (const row of result.rows) {
    if (!perStudent.has(row.student_id)) perStudent.set(row.student_id, row);
  }
  return [...perStudent.values()];
}

/** Who a reminder sent right now would reach, without sending anything. */
export async function previewCheckinReminder(classId = null) {
  const rows = await pendingCheckins(classId);
  const already = await query(
    `SELECT user_id, dedupe_key FROM email_deliveries
     WHERE dedupe_key = ANY($1::text[]) AND status IN ('sent','simulated')`,
    [rows.map((row) => `checkin_due:${row.week_id}`)],
  );
  const told = new Set(already.rows.map((row) => `${row.user_id}|${row.dedupe_key}`));
  return {
    total: rows.length,
    alreadyReminded: rows.filter((row) => told.has(`${row.student_id}|checkin_due:${row.week_id}`)).length,
    students: rows.map((row) => ({
      name: row.name,
      email: row.email,
      week: row.week_start,
      closes: row.checkin_due_at,
      alreadyReminded: told.has(`${row.student_id}|checkin_due:${row.week_id}`),
    })),
  };
}

/**
 * Send it now.
 *
 * Keyed on the day rather than the week, so pressing the button twice in an
 * evening sends nothing the second time, while somebody who had the scheduled
 * reminder yesterday can still be reminded again today if that is what is
 * wanted. The decision to send twice is the teacher's; sending twice by accident
 * is not.
 */
export async function sendCheckinReminderNow({ classId = null, actorId = null } = {}) {
  const rows = await pendingCheckins(classId);
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  for (const row of rows) {
    const ok = await sendOnce({
      studentId: row.student_id, email: row.email,
      key: `checkin_nudge:${row.week_id}:${today}`, templateKey: 'checkin_due',
      send: () => sendCheckinReminder({
        student: { id: row.student_id, name: row.name, email: row.email },
        week: row,
      }),
    });
    if (ok) sent += 1; else skipped += 1;
  }
  console.log(`Check-in reminder sent by hand${actorId ? ` by ${actorId}` : ''}: ${sent} sent, ${skipped} skipped.`);
  return { sent, skipped, considered: rows.length };
}

export function startReminderScheduler() {
  cron.schedule(config.reminderCron, async () => {
    /* One after another rather than together: they share a mail server and a
       pacing check, and running them at once only makes the ordering of the
       pacing arbitrary. */
    try { await runReminderCycle(); } catch (error) { console.error('Reminder cycle failed', error); }
    try { await runCheckinReminders(); } catch (error) { console.error('Check-in reminders failed', error); }
    try { await runClassReminders(); } catch (error) { console.error('Class reminders failed', error); }
  }, { noOverlap: true });
}
