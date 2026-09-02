import { one, query } from './db.js';
import { withVoiceNotes } from './voice.js';

/* The class feed.
   ------------------------------------------------------------------
   Three rules decide everything here.

   Removal is a soft delete, so a moderated post keeps its shape: comments still
   read as comments on something, and a misclick is reversible. Students see a
   removed item as gone; the administrator sees it greyed with a way back.

   Nothing is anonymous and nothing is editable after the fact. On a board of
   thirty adults who meet weekly, an edit history is a problem nobody has, and
   knowing your name is on it is most of what keeps a small board civil.

   A like is the cheapest possible signal that somebody read you. On a board this
   size that matters more than it does on a large one: the difference between
   posting into a room and posting into a void is often a single click from one
   other person. */

/* `avatar` is a boolean rather than a path: the picture itself is served from an
   authenticated route keyed on the user id, so the feed only needs to know
   whether there is one to ask for. */
const AUTHOR = `jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'avatar',u.avatar_path IS NOT NULL)`;

/* The reactions somebody may choose from. A short, fixed list: an open emoji
   keyboard on a class board invites the one joke that has to be moderated, and
   eight covers everything anybody actually wants to say without words.

   Validated server-side against this list, so the column can never hold whatever
   a crafted request felt like sending. */
export const REACTIONS = Object.freeze(['👍', '❤️', '🎉', '😂', '😮', '🙏', '💪', '🤔']);

/* Grouped in SQL: one row per emoji with its count and whether this viewer is in
   it, which is exactly what the chips need and nothing more. */
const reactionsFor = (type, column) => `COALESCE((
  SELECT json_agg(jsonb_build_object('emoji',g.emoji,'count',g.count,'mine',g.mine) ORDER BY g.count DESC, g.emoji)
  FROM (
    SELECT emoji, count(*)::int count, bool_or(user_id=$2) mine
    FROM discussion_likes WHERE target_type='${type}' AND target_id=${column} GROUP BY emoji
  ) g),'[]'::json)`;

const ATTACHMENTS = `COALESCE((SELECT json_agg(jsonb_build_object(
    'id',a.id,'kind',a.kind,'url',a.url,'fileName',a.file_name,
    'mimeType',a.mime_type,'sizeBytes',a.size_bytes
  ) ORDER BY a.position, a.created_at)
  FROM discussion_attachments a WHERE a.thread_id=t.id),'[]'::json) attachments`;

/**
 * Hot: comments, decayed by age.
 *
 * A post with eight comments this morning should sit above one with twelve from
 * a month ago, because the point of the sort is "where is the conversation", not
 * "what was popular once". The half-life is a day and a half, which on a weekly
 * course keeps the current week's discussion on top without burying something
 * from Friday by Sunday. Likes are deliberately not in it — they measure
 * approval, and this is measuring activity.
 */
const HOT_SCORE = `
  (SELECT count(*) FROM discussion_posts p WHERE p.thread_id=t.id AND p.deleted_at IS NULL)
  / power(2, EXTRACT(EPOCH FROM (now() - t.last_activity_at)) / 129600.0)`;

/* Counted in SQL rather than in the browser so a feed of forty posts is one
   query rather than forty. Reactions are per viewer, which is why every read
   takes a viewer id. */
const THREAD_COLUMNS = `
  t.id, t.class_id, t.title, t.body, t.pinned, t.locked, t.created_at,
  t.last_activity_at, t.deleted_at, t.category_id, t.published_at,
  t.published_at > now() scheduled,
  t.ai_draft, t.ai_draft_state, t.ai_drafted_at,
  ${AUTHOR} author,
  cat.name category_name,
  ${ATTACHMENTS},
  (SELECT count(*)::int FROM discussion_posts p
    WHERE p.thread_id=t.id AND p.deleted_at IS NULL) comment_count,
  ${reactionsFor('thread', 't.id')} reactions,
  (SELECT jsonb_build_object('id',lu.id,'name',lu.name,'at',lp.created_at,'avatar',lu.avatar_path IS NOT NULL)
     FROM discussion_posts lp JOIN users lu ON lu.id=lp.author_id
    WHERE lp.thread_id=t.id AND lp.deleted_at IS NULL
    ORDER BY lp.created_at DESC LIMIT 1) last_comment`;

/**
 * The feed for one class.
 *
 * Pinned posts always sit on top. Below them, `new` is the default because on a
 * board this quiet the most recent thing is nearly always the most relevant;
 * `top` sorts by likes for the occasional look back over what landed.
 */
export async function listThreads({
  classId, viewerId, includeDeleted = false, includeScheduled = false,
  categoryId = null, sort = 'new',
}) {
  const order = sort === 'hot'
    ? `${HOT_SCORE} DESC, t.last_activity_at DESC`
    : 't.published_at DESC';
  const result = await query(
    `SELECT ${THREAD_COLUMNS}
     FROM discussion_threads t
     LEFT JOIN users u ON u.id=t.author_id
     LEFT JOIN discussion_categories cat ON cat.id=t.category_id
     WHERE t.class_id=$1
       ${includeDeleted ? '' : 'AND t.deleted_at IS NULL'}
       ${includeScheduled ? '' : 'AND t.published_at <= now()'}
       ${categoryId ? 'AND t.category_id=$3' : ''}
     ORDER BY t.pinned DESC, ${order}`,
    categoryId ? [classId, viewerId, categoryId] : [classId, viewerId],
  );
  return result.rows;
}

/**
 * Everything a student is allowed to see of a post.
 *
 * The drafted reply is a working note for the teacher: what a model proposed
 * before anybody read it. Stripped on the way out rather than hidden in the
 * interface, so opening the network tab reveals nothing the screen does not.
 */
export function forStudentView(thread) {
  if (!thread) return thread;
  const { ai_draft: _d, ai_draft_state: _s, ai_drafted_at: _a, ...rest } = thread;
  return rest;
}

/** One post with its comments, each carrying its own like state. */
export async function getThread({ threadId, viewerId, includeDeleted = false, includeScheduled = false }) {
  const thread = await one(
    `SELECT ${THREAD_COLUMNS}
     FROM discussion_threads t
     LEFT JOIN users u ON u.id=t.author_id
     LEFT JOIN discussion_categories cat ON cat.id=t.category_id
     WHERE t.id=$1
       ${includeDeleted ? '' : 'AND t.deleted_at IS NULL'}
       ${includeScheduled ? '' : 'AND t.published_at <= now()'}`,
    [threadId, viewerId],
  );
  if (!thread) return null;
  const comments = await query(
    `SELECT p.id, p.body, p.created_at, p.deleted_at, p.edited_at, ${AUTHOR} author,
            p.teacher_audio_path, p.teacher_audio_mime, p.teacher_audio_seconds, p.teacher_audio_recorded_at,
            ${reactionsFor('post', 'p.id')} reactions
     FROM discussion_posts p
     LEFT JOIN users u ON u.id=p.author_id
     WHERE p.thread_id=$1 ${includeDeleted ? '' : 'AND p.deleted_at IS NULL'}
     ORDER BY p.created_at`,
    [threadId, viewerId],
  );
  // The audio path never leaves the server; withVoiceNote turns it into the
  // authenticated URL the player asks for.
  return { ...thread, comments: withVoiceNotes(comments.rows, 'comment') };
}

/** Is this person entitled to see this class board at all. */
export async function canSeeClass({ userId, isAdmin, classId }) {
  if (isAdmin) return Boolean(await one('SELECT 1 FROM classes WHERE id=$1', [classId]));
  return Boolean(await one(
    `SELECT 1 FROM class_students WHERE class_id=$1 AND student_id=$2 AND active=true`,
    [classId, userId],
  ));
}

export async function listCategories(classId) {
  const result = await query(
    `SELECT c.id, c.name, c.position,
            (SELECT count(*)::int FROM discussion_threads t
              WHERE t.category_id=c.id AND t.deleted_at IS NULL) thread_count
     FROM discussion_categories c WHERE c.class_id=$1 ORDER BY c.position, c.name`,
    [classId],
  );
  return result.rows;
}

export async function createThread({
  classId, authorId, title, body, categoryId = null, publishedAt = null, attachments = [],
}) {
  const thread = await one(
    `INSERT INTO discussion_threads(class_id,author_id,title,body,category_id,published_at,last_activity_at)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,now()),COALESCE($6,now())) RETURNING *`,
    [classId, authorId, title, body, categoryId, publishedAt],
  );
  await addAttachments(thread.id, attachments);
  return thread;
}

/* Attachments are written after the post they hang off, so a failure here costs
   the attachment rather than the writing. */
export async function addAttachments(threadId, attachments = []) {
  for (const [index, item] of attachments.entries()) {
    const row = await one(
      `INSERT INTO discussion_attachments(thread_id,kind,url,stored_name,file_name,mime_type,size_bytes,position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [threadId, item.kind, item.url, item.storedName || null, item.fileName || null,
       item.mimeType || null, item.sizeBytes || 0, index],
    );
    /* An uploaded file is addressed through the authenticated route rather than
       the public uploads path, so it is readable by the class and nobody else.
       A GIF or a video link is somebody else's public URL and stays as it is. */
    if (item.kind === 'file' && item.storedName) {
      await query('UPDATE discussion_attachments SET url=$1 WHERE id=$2',
        [`/api/media/attachment/post/${row.id}`, row.id]);
    }
  }
}

export async function createPost({ threadId, authorId, body }) {
  const post = await one(
    `INSERT INTO discussion_posts(thread_id,author_id,body) VALUES ($1,$2,$3) RETURNING *`,
    [threadId, authorId, body],
  );
  // Sorting the feed by activity is only honest if commenting counts as activity.
  await query('UPDATE discussion_threads SET last_activity_at=now(),updated_at=now() WHERE id=$1', [threadId]);
  return post;
}

/**
 * Sets, changes or clears this person's one reaction, and returns the whole set
 * back.
 *
 * One each. Choosing a different emoji replaces what you had rather than adding
 * to it, so the count under an emoji is always a count of people — which is the
 * only number anybody reads it for. Choosing the same one again clears it, and
 * doing that twice in a row is harmless, because a double tap on a phone is one
 * gesture.
 *
 * The full set comes back so the chips can be redrawn without a second request.
 */
export async function toggleReaction({ userId, targetType, targetId, emoji }) {
  if (!REACTIONS.includes(emoji)) {
    throw Object.assign(new Error('That is not one of the reactions.'), { status: 400 });
  }
  const existing = await one(
    'SELECT emoji FROM discussion_likes WHERE user_id=$1 AND target_type=$2 AND target_id=$3',
    [userId, targetType, targetId],
  );
  if (existing?.emoji === emoji) {
    await query('DELETE FROM discussion_likes WHERE user_id=$1 AND target_type=$2 AND target_id=$3',
      [userId, targetType, targetId]);
  } else {
    await query(
      `INSERT INTO discussion_likes(user_id,target_type,target_id,emoji) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id,target_type,target_id) DO UPDATE SET emoji=EXCLUDED.emoji, created_at=now()`,
      [userId, targetType, targetId, emoji],
    );
  }
  return { reactions: await reactionsOf({ targetType, targetId, viewerId: userId }) };
}

export async function reactionsOf({ targetType, targetId, viewerId }) {
  const result = await query(
    `SELECT emoji, count(*)::int count, bool_or(user_id=$3) mine
     FROM discussion_likes WHERE target_type=$1 AND target_id=$2
     GROUP BY emoji ORDER BY count DESC, emoji`,
    [targetType, targetId, viewerId],
  );
  return result.rows;
}

/**
 * How much has happened on this board since this person last looked.
 *
 * Counts posts and comments written by somebody else. Your own message coming
 * back at you as "1 new" is the fastest way to teach a person to ignore a badge.
 * Likes deliberately do not count: a badge that fires on a like turns the feed
 * into a slot machine, which is not what this is for.
 */
export async function unreadCount({ userId, classId }) {
  const row = await one(
    `WITH seen AS (
       SELECT last_seen_at FROM discussion_reads WHERE user_id=$1 AND class_id=$2
     )
     SELECT
       (SELECT count(*)::int FROM discussion_threads t
         WHERE t.class_id=$2 AND t.deleted_at IS NULL AND t.author_id<>$1
           AND t.published_at <= now()
           -- Measured from when it appeared, not when it was written: a post
           -- scheduled three days ago and released this morning is new today.
           AND t.published_at > COALESCE((SELECT last_seen_at FROM seen), 'epoch'::timestamptz))
     + (SELECT count(*)::int FROM discussion_posts p
         JOIN discussion_threads t ON t.id=p.thread_id
         WHERE t.class_id=$2 AND t.deleted_at IS NULL AND p.deleted_at IS NULL AND p.author_id<>$1
           AND t.published_at <= now()
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

/**
 * Who has been carrying the board over the last thirty days.
 *
 * Counts what somebody wrote, not the likes they collected. Ranking people by
 * likes received rewards the popular post; ranking by contribution rewards
 * turning up, which is the behaviour worth encouraging on a course. The teacher
 * is left out — a board where the teacher is permanently first is a noticeboard.
 */
export async function topContributors({ classId, days = 30, limit = 5 }) {
  const result = await query(
    `SELECT u.id, u.name,
            count(*) FILTER (WHERE source='thread')::int posts,
            count(*) FILTER (WHERE source='post')::int comments,
            count(*)::int total
     FROM (
       SELECT author_id, 'thread' source, created_at FROM discussion_threads
         WHERE class_id=$1 AND deleted_at IS NULL
       UNION ALL
       SELECT p.author_id, 'post', p.created_at FROM discussion_posts p
         JOIN discussion_threads t ON t.id=p.thread_id
        WHERE t.class_id=$1 AND p.deleted_at IS NULL AND t.deleted_at IS NULL
     ) activity
     JOIN users u ON u.id=activity.author_id
     WHERE activity.created_at > now() - ($2 || ' days')::interval
       AND u.role='student'
     GROUP BY u.id, u.name
     ORDER BY total DESC, u.name
     LIMIT $3`,
    [classId, String(days), limit],
  );
  return result.rows;
}

/**
 * The drafted reply for one post, written once and kept.
 *
 * Drafted when an administrator first opens the post rather than when a student
 * writes it: every post gets read, only some get replied to, and drafting for
 * all of them bills for work nobody asked for. `force` is the regenerate button.
 */
export async function draftReplyFor({ threadId, force = false }) {
  const thread = await one(
    `SELECT t.id, t.title, t.body, t.ai_draft, t.ai_draft_state, u.name author_name
     FROM discussion_threads t LEFT JOIN users u ON u.id=t.author_id
     WHERE t.id=$1 AND t.deleted_at IS NULL`,
    [threadId],
  );
  if (!thread) return null;
  if (!force && thread.ai_draft_state === 'drafted' && thread.ai_draft) {
    return { draft: thread.ai_draft, state: 'drafted', cached: true };
  }

  // What has already been said, so the draft does not repeat somebody.
  const comments = await query(
    `SELECT p.body, u.name, u.role FROM discussion_posts p
     LEFT JOIN users u ON u.id=p.author_id
     WHERE p.thread_id=$1 AND p.deleted_at IS NULL ORDER BY p.created_at LIMIT 20`,
    [threadId],
  );

  const { draftCommunityReply } = await import('./ai.js');
  try {
    const draft = await draftCommunityReply({
      post: { title: thread.title, body: thread.body, author: thread.author_name },
      commentsSoFar: comments.rows.map((row) => ({ author: row.name, role: row.role, body: row.body })),
    });
    await query(
      `UPDATE discussion_threads SET ai_draft=$1, ai_draft_state='drafted', ai_drafted_at=now() WHERE id=$2`,
      [draft, threadId],
    );
    return { draft, state: 'drafted', cached: false };
  } catch (error) {
    await query(`UPDATE discussion_threads SET ai_draft_state='failed' WHERE id=$1`, [threadId]);
    /* A failed draft is not a failed page. The teacher writes their own reply,
       which is what they were going to do anyway. */
    return { draft: null, state: 'failed', error: error.message };
  }
}
