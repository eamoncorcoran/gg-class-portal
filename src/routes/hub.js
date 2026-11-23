/**
 * The hub export: everything the React front end's Home, Courses, Community
 * and Live screens read, in one JSON.
 *
 * This began as gg-hub/tools/export-hub.mjs, a script that wrote the same
 * shape to a file for the front end to read while the hub was being built.
 * Served from here it is never stale, and the shape is kept exactly so the
 * baked file still works as the front end's fallback.
 *
 * Only somebody signed in may ask. It used to answer anybody with a shorter
 * version, and that shorter version still carried the class dates, the course
 * list and the links to the Zoom recordings. A visitor now gets a sign-in form
 * and nothing else.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { query } from '../db.js';
import { asyncRoute } from '../middleware.js';
import { requireAuth } from '../session.js';
import { bunnySigning, embedUrl as bunnyEmbedUrl } from '../bunny.js';
import { ON_DEMAND_TYPES, studentAccess, taughtClass } from '../coursetypes.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAN_FILE = path.join(__dirname, '..', '..', 'data', 'irish-primary-teaching-plan.json');

const CACHE_MS = 60 * 1000;
/* One cached answer per audience. The teachers see every course; a student sees
   the courses of the classes they are in, so students in the same classes
   share an answer. */
const cache = new Map();

const rows = async (sql, args = []) => (await query(sql, args)).rows;

/* A class recording on Bunny Stream.

   The library has token authentication switched on, so the plain embed address
   is refused: the player shows a bare "403" and nothing else. The address has to
   carry a signature and an expiry, made here at read time exactly as the course
   pages of the old interface make theirs. Only somebody signed in is given one;
   a visitor gets the plain address, which Bunny turns away. */
function bunnyVideo(ref, signedIn) {
  const [library, video] = String(ref).split('/');
  if (signedIn && bunnySigning() && library && video) {
    return { type: 'iframe', src: bunnyEmbedUrl(video, { libraryId: library }) };
  }
  return { type: 'iframe', src: `https://iframe.mediadelivery.net/embed/${ref}?autoplay=false&preload=false` };
}

/* The front end's video description for a lesson, by provider. */
function videoOf(lesson, liveById, { signedIn = false } = {}) {
  const provider = lesson.video_provider;
  const ref = lesson.video_ref || '';
  if (provider === 'youtube') return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${ref}` };
  if (provider === 'loom') return { type: 'iframe', src: `https://www.loom.com/embed/${ref}` };
  if (provider === 'bunny') return bunnyVideo(ref, signedIn);
  if (provider === 'zoom') return { type: 'link', src: ref, passcode: lesson.video_passcode || undefined };
  if (provider === 'mp4') return { type: 'file', src: ref };
  if (provider === 'practice') {
    const live = liveById.get(ref);
    return live
      ? { type: 'practice', ref, title: live.title, phrases: live.phrases, videoUrl: liveVideoUrl(live) }
      : null;
  }
  return null;
}

/* Practice videos are served by the live routes, to signed-in viewers. */
const liveVideoUrl = (live) => (live.video_id ? `/api/live/video/${encodeURIComponent(live.video_id)}` : undefined);

/* A title or body that is one short unaccented token is a test post, not a
   post. The front end applies the same rule, so dropping them here changes
   nothing it shows and keeps the answer the size it would be anyway. */
const junk = (s) => !s || (!/\s/.test(s.trim()) && s.trim().length < 6 && !/[áéíóú]/i.test(s));

/**
 * `viewer`: who is asking. `admin` sees every published course. A student sees
 * the courses linked to their own classes (and any open to all). A student
 * whose courses are all on demand (Hibernia) gets no class, no board and no
 * timetable: only their courses.
 */
async function buildExport({ signedIn, viewer = { admin: true, classIds: [], coursesOnly: false } }) {
  const users = await rows('SELECT id, name, role, avatar_path FROM users');
  const who = new Map(users.map((u) => [u.id, {
    id: u.id,
    name: u.name,
    role: u.role,
    avatar: u.avatar_path ? `/api/media/avatar/${u.id}` : undefined,
  }]));
  const unknown = { name: 'Unknown', role: 'student' };

  /* One class is the class: the Irish for Primary Teaching programme when
     there is one, otherwise the first active class. */
  const classes = viewer.coursesOnly ? [] : await rows(`SELECT id, programme_name, day_of_week, start_time, timezone, join_url, join_note,
                                     starts_on::text AS starts_on, ends_on::text AS ends_on
                              FROM classes c WHERE c.active AND ${taughtClass('c')} ORDER BY created_at, id`);
  const klass = classes.find((k) => /irish/i.test(k.programme_name)) || classes[0] || null;
  const classId = klass?.id;

  const [weeks, dateChanges, sessions, assignments] = classId ? await Promise.all([
    rows(`SELECT week_start::text AS week_start, checkin_enabled, checkin_release_at, checkin_due_at, join_url
          FROM weeks WHERE class_id=$1 ORDER BY week_start`, [classId]),
    rows('SELECT on_date::text AS on_date, kind, moved_to, reason FROM class_date_changes WHERE class_id=$1', [classId]),
    rows('SELECT starts_at, duration_minutes, join_url, label, cancelled FROM class_sessions WHERE class_id=$1', [classId]),
    rows(`SELECT id, title, instructions, visible_at, deadline_at, kind
          FROM assignments WHERE class_id=$1 ORDER BY deadline_at`, [classId]),
  ]) : [[], [], [], []];

  /* Courses, modules and lessons: published only. A course is on demand when it
     belongs to an on-demand (Hibernia) class; those keep their own sections
     and may have lessons that are reading only. A class recording without a
     video is left out, as before. */
  const [allCourses, modules, lessons, live, importing] = await Promise.all([
    rows(`SELECT c.id, c.title, c.description, c.cover_url, c.position, c.open_to_all,
                 COALESCE(array_agg(cc.class_id) FILTER (WHERE cc.class_id IS NOT NULL), '{}') AS class_ids,
                 COALESCE(bool_or(k.course_type = ANY($1)), false) AS on_demand
          FROM courses c
          LEFT JOIN course_classes cc ON cc.course_id=c.id
          LEFT JOIN classes k ON k.id=cc.class_id
          WHERE c.published GROUP BY c.id ORDER BY c.position, c.id`, [ON_DEMAND_TYPES]),
    rows('SELECT id, course_id, title, position FROM course_modules ORDER BY course_id, position, id'),
    rows(`SELECT id, module_id, title, notes, video_provider, video_ref, video_passcode, duration_seconds,
                 zoom_link, zoom_link_passcode, recorded_on::text AS recorded_on, position
          FROM course_lessons WHERE published ORDER BY module_id, position, id`),
    rows('SELECT id, title, course, course_id, video_id, phrases FROM live_lessons ORDER BY title'),
    // A lesson whose video is still on its way into the library is not shown yet.
    rows(`SELECT lesson_id FROM lesson_video_imports WHERE status <> 'done'`),
  ]);
  const liveById = new Map(live.map((l) => [l.id, l]));
  const waiting = new Set(importing.map((r) => r.lesson_id));
  const mine = new Set(viewer.classIds || []);
  const courses = allCourses.filter((c) => viewer.admin
    || (c.open_to_all && !viewer.coursesOnly)
    || (c.class_ids || []).some((id) => mine.has(id)));
  const shown = (l, course) => !waiting.has(l.id) && (l.video_provider || (course.on_demand && String(l.notes || '').trim()));

  const courseOut = courses
    .map((course) => ({
      id: String(course.id),
      title: course.title,
      description: course.description || '',
      cover: course.cover_url || undefined,
      onDemand: course.on_demand || undefined,
      modules: modules
        .filter((m) => m.course_id === course.id)
        .map((m) => ({
          id: String(m.id),
          title: m.title,
          lessons: lessons
            .filter((l) => l.module_id === m.id && shown(l, course))
            .map((l) => ({
              id: String(l.id),
              title: l.title,
              notes: l.notes || '',
              recordedOn: l.recorded_on,
              durationSeconds: l.duration_seconds || 0,
              video: videoOf(l, liveById, { signedIn }),
              // The recording's page on Zoom, under the player, for when the player will not play.
              zoomLink: signedIn && l.zoom_link ? { url: l.zoom_link, passcode: l.zoom_link_passcode || undefined } : undefined,
            })),
        }))
        .filter((m) => m.lessons.length),
    }))
    .filter((course) => course.modules.length);

  // The class board. Threads and comments are for members only.
  const categories = classId
    ? await rows('SELECT id, name, position FROM discussion_categories WHERE class_id=$1 ORDER BY position', [classId])
    : [];
  let threadOut = [];
  if (signedIn && classId && !viewer.coursesOnly) {
    const threads = await rows(`SELECT * FROM discussion_threads
                                WHERE class_id=$1 AND deleted_at IS NULL AND (published_at IS NULL OR published_at <= now())
                                ORDER BY pinned DESC, COALESCE(last_activity_at, created_at) DESC`, [classId]);
    const threadIds = threads.map((t) => t.id);
    const [posts, likes, attachments] = await Promise.all([
      rows('SELECT * FROM discussion_posts WHERE deleted_at IS NULL AND thread_id = ANY($1) ORDER BY created_at', [threadIds]),
      rows('SELECT target_type, target_id, emoji, count(*)::int AS n FROM discussion_likes GROUP BY 1, 2, 3'),
      rows(`SELECT thread_id, kind, url, file_name, mime_type, size_bytes
            FROM discussion_attachments WHERE thread_id = ANY($1) ORDER BY position`, [threadIds]),
    ]);
    const reactionsOf = (type, id) => likes
      .filter((l) => l.target_type === type && l.target_id === id)
      .map((l) => ({ emoji: l.emoji, count: l.n }));
    threadOut = threads
      .filter((t) => !(junk(t.title) && junk(t.body)))
      .map((t) => ({
        id: String(t.id),
        title: t.title,
        body: t.body || '',
        pinned: Boolean(t.pinned),
        locked: Boolean(t.locked),
        category: categories.find((k) => k.id === t.category_id)?.name,
        author: who.get(t.author_id) || unknown,
        at: t.published_at || t.created_at,
        edited: t.edited_at,
        attachments: attachments
          .filter((a) => a.thread_id === t.id)
          .map((a) => ({ kind: a.kind, url: a.url, fileName: a.file_name, mime: a.mime_type, bytes: a.size_bytes })),
        reactions: reactionsOf('thread', t.id),
        comments: posts
          .filter((p) => p.thread_id === t.id)
          .map((p) => ({
            id: String(p.id),
            body: p.body,
            at: p.created_at,
            parentId: p.parent_id ? String(p.parent_id) : undefined,
            author: who.get(p.author_id) || unknown,
            reactions: reactionsOf('post', p.id),
          })),
      }));
  }

  const plan = JSON.parse(await fs.readFile(PLAN_FILE, 'utf8'));

  // Signed out, the way into the class stays out of the answer.
  const hide = (value) => (signedIn ? value : undefined);

  return {
    exportedAt: new Date().toISOString(),
    class: klass ? {
      name: klass.programme_name,
      dayOfWeek: klass.day_of_week,
      startTime: klass.start_time,
      timezone: klass.timezone,
      joinUrl: hide(klass.join_url),
      joinNote: hide(klass.join_note),
      startsOn: klass.starts_on,
      endsOn: klass.ends_on,
    } : null,
    weeks: weeks.map((w) => ({ ...w, join_url: hide(w.join_url) })),
    dateChanges,
    sessions: sessions.map((s) => ({ ...s, join_url: hide(s.join_url) })),
    assignments,
    courses: courseOut,
    community: {
      categories: categories.map((k) => k.name),
      threads: threadOut,
      members: users.filter((u) => u.role !== 'admin').length,
    },
    live: live.map((l) => ({ id: l.id, title: l.title, course: l.course, phrases: l.phrases, videoUrl: liveVideoUrl(l) })),
    plan,
  };
}

router.get('/export', requireAuth, asyncRoute(async (req, res) => {
  const signedIn = true;
  let viewer = { admin: true, classIds: [], coursesOnly: false };
  if (req.user.role !== 'admin') {
    const access = await studentAccess(req.user.id);
    viewer = { admin: false, classIds: access.classIds, coursesOnly: access.coursesOnly };
  }
  const slot = viewer.admin ? 'admin' : `student:${viewer.coursesOnly ? 'courses' : 'hub'}:${viewer.classIds.join(',')}`;
  const now = Date.now();
  const hit = cache.get(slot);
  if (!hit || now - hit.at > CACHE_MS) {
    if (cache.size > 200) cache.clear();
    cache.set(slot, { at: now, body: JSON.stringify(await buildExport({ signedIn, viewer })) });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.type('application/json').send(cache.get(slot).body);
}));

/** After a course changes (an import finishing), so nobody waits a minute to see it. */
export function forgetHubExport() {
  cache.clear();
}

export default router;
