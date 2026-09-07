/**
 * Telling a class that something has been posted.
 *
 * The board was silent: a post was seen when a student next opened the portal,
 * which is no use at all for the thing most worth posting — a class moved, a
 * class cancelled, a deadline changed.
 *
 * Per post rather than for all of them, deliberately. A board that emails
 * everybody about everything is a board people mute, and a muted board cannot
 * tell them the one thing that mattered.
 */
import cron from 'node-cron';
import { config } from './config.js';
import { query, one } from './db.js';
import { sendBoardPost } from './email.js';

/* Who is on this class, written once.
   ------------------------------------------------------------------
   Two things ask this question — the composer, to say how many people the
   email will reach, and the send itself — and they have to be the same
   question. A count that does not match what happens is worse than no count:
   it is a number on the screen that quietly lies.

   Everybody enrolled, whether or not they have ever signed in. Somebody who was
   invited last week and has not got round to it is exactly who most needs to be
   told the class is cancelled. Withdrawn and deactivated accounts are left out:
   they are no longer on the course, and mailing them is how a former student
   ends up hearing about next Tuesday. */
const AUDIENCE = `
  FROM class_students cs
  JOIN users u ON u.id=cs.student_id
  WHERE cs.class_id=$1 AND cs.active=true
    AND u.role='student' AND u.active=true AND u.withdrawn_at IS NULL`;

/** How many people an email about this class would reach. */
export async function boardAudienceCount(classId) {
  const row = await one(`SELECT count(*)::int count ${AUDIENCE}`, [classId]);
  return row?.count ?? 0;
}

/** Everybody an email about this class would reach. */
export async function boardRecipients(classId) {
  const result = await query(`SELECT u.id, u.name, u.email ${AUDIENCE} ORDER BY u.name`, [classId]);
  return result.rows;
}

/**
 * Send one post to a class, once.
 *
 * Marked as notified before anything is sent. If this crashes halfway the sweep
 * must not come back and start again from the top, because the people at the
 * top have already had it — and the delivery log records who actually received
 * it, so a partial send can be seen rather than guessed at.
 */
export async function notifyClassOfPost(threadId) {
  const thread = await one(
    `SELECT t.*, c.programme_name, c.day_of_week, c.start_time, u.name author_name
     FROM discussion_threads t
     JOIN classes c ON c.id=t.class_id
     LEFT JOIN users u ON u.id=t.author_id
     WHERE t.id=$1 AND t.deleted_at IS NULL`,
    [threadId],
  );
  if (!thread) return { sent: 0, skipped: 'the post is gone' };
  if (!thread.notify_email) return { sent: 0, skipped: 'this post was not meant to be emailed' };
  if (thread.notified_at) return { sent: 0, skipped: 'already sent' };
  if (new Date(thread.published_at).getTime() > Date.now()) {
    return { sent: 0, skipped: 'not published yet' };
  }

  /* Claimed first, and only if nobody else has claimed it. Two of these running
     at once — a sweep and the route that made the post — would otherwise both
     find notified_at empty and both send. */
  const claimed = await one(
    `UPDATE discussion_threads SET notified_at=now()
     WHERE id=$1 AND notified_at IS NULL RETURNING id`,
    [thread.id],
  );
  if (!claimed) return { sent: 0, skipped: 'already sent' };

  const recipients = await boardRecipients(thread.class_id);
  let sent = 0;
  let failed = 0;
  for (const student of recipients) {
    let status = 'failed';
    let providerId = null;
    let error = null;
    try {
      const result = await sendBoardPost({ student, thread });
      status = result.simulated ? 'simulated' : 'sent';
      providerId = result.id;
      sent += 1;
    } catch (sendError) {
      error = sendError.message;
      failed += 1;
      /* One bad address must not stop the other twenty-nine. */
      console.error(`Could not email ${student.email} about post ${thread.id}: ${sendError.message}`);
    }
    await query(
      `INSERT INTO email_deliveries(user_id,thread_id,template_key,recipient,status,provider_id,error,sent_at)
       VALUES ($1,$2,'board_post',$3,$4,$5,$6,CASE WHEN $4 IN ('sent','simulated') THEN now() ELSE NULL END)
       ON CONFLICT (user_id,thread_id,template_key) WHERE thread_id IS NOT NULL DO NOTHING`,
      [student.id, thread.id, student.email, status, providerId, error],
    );
  }
  return { sent, failed, total: recipients.length };
}

/**
 * Posts that are owed an email.
 *
 * A post written now and published now is emailed by the route that made it.
 * This is for the scheduled ones — which become visible by the clock passing
 * rather than by anything running, so without this nothing would ever notice
 * they had appeared — and for anything the route failed to send.
 */
export async function runBoardNotifications() {
  const due = await query(
    `SELECT id FROM discussion_threads
     WHERE notify_email=true AND notified_at IS NULL AND deleted_at IS NULL
       AND published_at <= now()
     ORDER BY published_at
     LIMIT 20`,
  );
  for (const row of due.rows) {
    try {
      await notifyClassOfPost(row.id);
    } catch (error) {
      console.error(`Could not send the board email for ${row.id}: ${error.message}`);
    }
  }
  return due.rowCount;
}

export function startBoardNotifier() {
  cron.schedule(config.boardEmailCron, () => {
    runBoardNotifications().catch((error) => console.error('Board notification sweep failed', error));
  }, { noOverlap: true });
}
