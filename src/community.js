import { one, query } from './db.js';

/* The class board.
   ------------------------------------------------------------------
   Two rules decide everything here.

   Removal is a soft delete, so a moderated thread keeps its shape: replies still
   read as replies to something, and a misclick is reversible. Students see a
   removed item as gone; the administrator sees it greyed with a way back.

   Nothing is anonymous and nothing is editable after the fact. On a board of
   thirty adults who meet weekly, an edit history is a problem nobody has, and
   knowing your name is on it is most of what keeps a small board civil. */

const AUTHOR = `jsonb_build_object('id',u.id,'name',u.name,'role',u.role)`;

/** Threads for one class, pinned first, then by real activity. */
export async function listThreads({ classId, includeDeleted = false }) {
  const result = await query(
    `SELECT t.id, t.title, t.body, t.pinned, t.locked, t.created_at, t.last_activity_at,
            t.deleted_at, ${AUTHOR} author,
            (SELECT count(*)::int FROM discussion_posts p
              WHERE p.thread_id=t.id AND p.deleted_at IS NULL) reply_count,
            (SELECT max(p.created_at) FROM discussion_posts p
              WHERE p.thread_id=t.id AND p.deleted_at IS NULL) last_reply_at
     FROM discussion_threads t
     LEFT JOIN users u ON u.id=t.author_id
     WHERE t.class_id=$1 ${includeDeleted ? '' : 'AND t.deleted_at IS NULL'}
     ORDER BY t.pinned DESC, t.last_activity_at DESC`,
    [classId],
  );
  return result.rows;
}

/** One thread with its replies. */
export async function getThread({ threadId, includeDeleted = false }) {
  const thread = await one(
    `SELECT t.*, ${AUTHOR} author, c.programme_name, c.day_of_week, c.start_time
     FROM discussion_threads t
     LEFT JOIN users u ON u.id=t.author_id
     JOIN classes c ON c.id=t.class_id
     WHERE t.id=$1 ${includeDeleted ? '' : 'AND t.deleted_at IS NULL'}`,
    [threadId],
  );
  if (!thread) return null;
  const posts = await query(
    `SELECT p.id, p.body, p.created_at, p.deleted_at, ${AUTHOR} author
     FROM discussion_posts p
     LEFT JOIN users u ON u.id=p.author_id
     WHERE p.thread_id=$1 ${includeDeleted ? '' : 'AND p.deleted_at IS NULL'}
     ORDER BY p.created_at`,
    [threadId],
  );
  return { ...thread, posts: posts.rows };
}

/** Is this person entitled to see this class board at all. */
export async function canSeeClass({ userId, isAdmin, classId }) {
  if (isAdmin) return Boolean(await one('SELECT 1 FROM classes WHERE id=$1', [classId]));
  return Boolean(await one(
    `SELECT 1 FROM class_students WHERE class_id=$1 AND student_id=$2 AND active=true`,
    [classId, userId],
  ));
}

export async function createThread({ classId, authorId, title, body }) {
  return one(
    `INSERT INTO discussion_threads(class_id,author_id,title,body,last_activity_at)
     VALUES ($1,$2,$3,$4,now()) RETURNING *`,
    [classId, authorId, title, body],
  );
}

export async function createPost({ threadId, authorId, body }) {
  const post = await one(
    `INSERT INTO discussion_posts(thread_id,author_id,body) VALUES ($1,$2,$3) RETURNING *`,
    [threadId, authorId, body],
  );
  // Sorting the list by activity is only honest if replying counts as activity.
  await query('UPDATE discussion_threads SET last_activity_at=now(),updated_at=now() WHERE id=$1', [threadId]);
  return post;
}

/**
 * How much has happened on this board since this person last looked.
 *
 * Counts threads and replies written by somebody else. Your own message coming
 * back at you as "1 new" is the fastest way to teach a person to ignore a badge.
 * Somebody who has never opened the board sees everything as new, which is
 * correct: it is all new to them.
 */
export async function unreadCount({ userId, classId }) {
  const row = await one(
    `WITH seen AS (
       SELECT last_seen_at FROM discussion_reads WHERE user_id=$1 AND class_id=$2
     )
     SELECT
       (SELECT count(*)::int FROM discussion_threads t
         WHERE t.class_id=$2 AND t.deleted_at IS NULL AND t.author_id<>$1
           AND t.created_at > COALESCE((SELECT last_seen_at FROM seen), 'epoch'::timestamptz))
     + (SELECT count(*)::int FROM discussion_posts p
         JOIN discussion_threads t ON t.id=p.thread_id
         WHERE t.class_id=$2 AND t.deleted_at IS NULL AND p.deleted_at IS NULL AND p.author_id<>$1
           AND p.created_at > COALESCE((SELECT last_seen_at FROM seen), 'epoch'::timestamptz)) count`,
    [userId, classId],
  );
  return row?.count || 0;
}

export async function markRead({ userId, classId }) {
  await query(
    `INSERT INTO discussion_reads(user_id,class_id,last_seen_at) VALUES ($1,$2,now())
     ON CONFLICT (user_id,class_id) DO UPDATE SET last_seen_at=now()`,
    [userId, classId],
  );
}
