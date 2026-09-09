/**
 * Telling people that something happened on the board.
 *
 * Three things are worth an email, and each has a different audience:
 *
 *   a new post          — everybody on the class, because that is the point of
 *                         posting one
 *   a reply to a post   — the person who wrote it, and everybody who has
 *                         commented on it, because they are in the conversation
 *   a reply to a comment— the same, and the person being replied to
 *
 * Two rules run through all of it. Nobody is ever emailed about their own
 * action, which is the fastest way to make a notification feel broken. And
 * nobody is emailed twice about one thing, however many ways they qualify —
 * being both the author and a commenter is one person, not two.
 */
import { query, one } from './db.js';
import { sendBoardPostNotice, sendBoardReplyNotice } from './email.js';

/* Everybody on the class who wants to hear about it. Whether they have ever
   signed in does not come into it: somebody invited last week is exactly who a
   first post is for. Withdrawn and deactivated accounts are left out. */
async function classAudience(classId, column) {
  const result = await query(
    `SELECT u.id, u.name, u.email
     FROM class_students cs
     JOIN users u ON u.id=cs.student_id
     WHERE cs.class_id=$1 AND cs.active=true
       AND u.role='student' AND u.active=true AND u.withdrawn_at IS NULL
       AND u.${column}=true
     ORDER BY u.name`,
    [classId],
  );
  return result.rows;
}

/**
 * Everybody already in one conversation.
 *
 * The person who wrote the post, everybody who has commented on it, and — when
 * this is a reply to a particular comment — whoever wrote that comment. An
 * administrator is included: a teacher who answered a question wants to know
 * when the student comes back, and they are not on class_students, so asking
 * only the class would miss them.
 */
async function conversationAudience(thread, parentId) {
  const result = await query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     WHERE u.active=true AND u.withdrawn_at IS NULL AND u.notify_board_replies=true
       AND (u.id=$1
            OR u.id IN (SELECT author_id FROM discussion_posts
                        WHERE thread_id=$2 AND deleted_at IS NULL AND author_id IS NOT NULL)
            OR u.id = (SELECT author_id FROM discussion_posts WHERE id=$3))
     ORDER BY u.name`,
    [thread.author_id, thread.id, parentId || null],
  );
  return result.rows;
}

/** One send, recorded, and never sent twice to the same person for the same thing. */
async function deliver({ recipients, actorId, send, threadId, postId, templateKey }) {
  let sent = 0;
  let failed = 0;
  const seen = new Set();
  for (const person of recipients) {
    // Never about your own action, and never twice.
    if (person.id === actorId || seen.has(person.id)) continue;
    seen.add(person.id);

    /* Claimed before sending. A crash halfway through must not send the first
       half of the class a second copy when it runs again. */
    const claim = await one(
      `INSERT INTO email_deliveries(user_id,thread_id,post_id,template_key,recipient,status)
       VALUES ($1,$2,$3,$4,$5,'queued')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [person.id, threadId, postId, templateKey, person.email],
    );
    if (!claim) continue;

    try {
      const result = await send(person);
      await query('UPDATE email_deliveries SET status=$1, provider_id=$2, sent_at=now() WHERE id=$3',
        [result.simulated ? 'simulated' : 'sent', result.id || null, claim.id]);
      sent += 1;
    } catch (error) {
      await query('UPDATE email_deliveries SET status=$1, error=$2 WHERE id=$3',
        ['failed', error.message, claim.id]);
      failed += 1;
      // One bad address must not stop everybody else being told.
      console.error(`Board notice to ${person.email} failed: ${error.message}`);
    }
  }
  return { sent, failed };
}

/** How many people a new post on this class would reach. */
export async function boardAudienceCount(classId) {
  const row = await one(
    `SELECT count(*)::int count
     FROM class_students cs JOIN users u ON u.id=cs.student_id
     WHERE cs.class_id=$1 AND cs.active=true
       AND u.role='student' AND u.active=true AND u.withdrawn_at IS NULL
       AND u.notify_board_posts=true`,
    [classId]);
  return row?.count ?? 0;
}

/** A new post: everybody on the class hears about it, except whoever wrote it. */
export async function notifyNewPost(threadId) {
  const thread = await one(
    `SELECT t.*, c.programme_name, u.name author_name, u.role author_role
     FROM discussion_threads t
     JOIN classes c ON c.id=t.class_id
     LEFT JOIN users u ON u.id=t.author_id
     WHERE t.id=$1 AND t.deleted_at IS NULL`,
    [threadId],
  );
  if (!thread) return { sent: 0, skipped: 'the post is gone' };
  // A scheduled post is announced when it appears, by the sweep, not now.
  if (new Date(thread.published_at).getTime() > Date.now()) {
    return { sent: 0, skipped: 'not published yet' };
  }

  const recipients = await classAudience(thread.class_id, 'notify_board_posts');
  return deliver({
    recipients,
    actorId: thread.author_id,
    threadId: thread.id,
    postId: null,
    templateKey: 'board_new_post',
    send: (student) => sendBoardPostNotice({ student, thread }),
  });
}

/** A reply: the people already in that conversation, except whoever replied. */
export async function notifyNewComment(postId) {
  const comment = await one(
    `SELECT p.*, u.name author_name, u.role author_role
     FROM discussion_posts p LEFT JOIN users u ON u.id=p.author_id
     WHERE p.id=$1 AND p.deleted_at IS NULL`,
    [postId],
  );
  if (!comment) return { sent: 0, skipped: 'the comment is gone' };
  const thread = await one(
    'SELECT * FROM discussion_threads WHERE id=$1 AND deleted_at IS NULL', [comment.thread_id]);
  if (!thread) return { sent: 0, skipped: 'the post is gone' };

  const recipients = await conversationAudience(thread, comment.parent_id);
  return deliver({
    recipients,
    actorId: comment.author_id,
    threadId: thread.id,
    postId: comment.id,
    templateKey: 'board_new_comment',
    send: (person) => sendBoardReplyNotice({ student: person, thread, comment }),
  });
}

/* Scheduled posts appear because the clock passed, not because anything ran, so
   something has to notice. Shared with the sweep in boardemail.js rather than a
   second timer of its own. */
export async function notifyPublishedPosts() {
  const due = await query(
    `SELECT t.id FROM discussion_threads t
     WHERE t.deleted_at IS NULL AND t.published_at <= now()
       AND t.notified_at IS NULL
     ORDER BY t.published_at
     LIMIT 20`,
  );
  for (const row of due.rows) {
    try {
      await query('UPDATE discussion_threads SET notified_at=now() WHERE id=$1 AND notified_at IS NULL', [row.id]);
      await notifyNewPost(row.id);
    } catch (error) {
      console.error(`Could not announce post ${row.id}: ${error.message}`);
    }
  }
  return due.rowCount;
}
