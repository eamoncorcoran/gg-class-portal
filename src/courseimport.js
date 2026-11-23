/**
 * Bringing a whole course into the hub from somewhere else.
 *
 * Written for the Hibernia Irish Interview course, which was built in
 * GoHighLevel: its sections, lessons, notes and videos, rebuilt here as an
 * ordinary course. A course arrives as a package (see data/course-packages/):
 * a title, a description, and sections of lessons, each lesson with its notes
 * and, where it has one, the address of its video.
 *
 * The course, its sections and its lessons are written at once. Each video is
 * then copied into the hub's own video library (Bunny Stream) by this server,
 * one after another, and a lesson is shown to students only once its copy has
 * been encoded and can be played. Nobody opens a lesson to an empty player.
 *
 * The videos are fetched from a short list of known hosts only, so the import
 * cannot be pointed at anything on the server's own network.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, query, transaction } from './db.js';
import { bunnyConfigured, createVideo, deleteVideo, getBunnyVideo, uploadVideo } from './bunny.js';
import { config } from './config.js';
import { audit } from './audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = path.join(__dirname, '..', 'data', 'course-packages');

/* Where a video may be fetched from: GoHighLevel's course and media stores. */
export const VIDEO_HOSTS = new Set([
  'cdn.courses.apisystem.tech',
  'assets.cdn.filesafe.space',
  'storage.googleapis.com',
]);

const MAX_ATTEMPTS = 3;
const WORKERS = 2;

/** A package by its file name, without the .json. Only plain names: no paths. */
export async function readPackage(name) {
  if (!/^[a-z0-9-]{1,80}$/.test(String(name || ''))) {
    throw Object.assign(new Error('That is not a course package name.'), { status: 400 });
  }
  try {
    return JSON.parse(await fs.readFile(path.join(PACKAGE_DIR, `${name}.json`), 'utf8'));
  } catch {
    throw Object.assign(new Error(`There is no course package called ${name}.`), { status: 404 });
  }
}

const allowedVideo = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && VIDEO_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
};

/** Checks a package before anything is written, and says what is wrong in words. */
export function checkPackage(pkg) {
  const problems = [];
  if (!pkg || typeof pkg !== 'object') return ['The package is empty.'];
  if (!String(pkg.title || '').trim()) problems.push('The course has no title.');
  if (!Array.isArray(pkg.modules) || !pkg.modules.length) problems.push('The course has no sections.');
  for (const [i, m] of (pkg.modules || []).entries()) {
    if (!String(m.title || '').trim()) problems.push(`Section ${i + 1} has no title.`);
    if (!Array.isArray(m.lessons) || !m.lessons.length) problems.push(`Section "${m.title}" has no lessons.`);
    for (const l of m.lessons || []) {
      if (!String(l.title || '').trim()) problems.push(`A lesson in "${m.title}" has no title.`);
      if (!l.video && !String(l.notes || '').trim()) problems.push(`"${l.title}" has neither a video nor notes.`);
      if (l.video && !allowedVideo(l.video)) problems.push(`"${l.title}": its video is not on a host the import trusts.`);
    }
  }
  return problems;
}

/**
 * Writes the course and queues its videos.
 * The course is linked to `classId` only, so only that class's students are
 * enrolled in it. Refuses a second course of the same title, so pressing twice
 * does not make two.
 */
export async function importCourse({ pkg, classId, actorId }) {
  const problems = checkPackage(pkg);
  if (problems.length) throw Object.assign(new Error(problems.join(' ')), { status: 400 });
  const klass = await one('SELECT id, programme_name FROM classes WHERE id=$1 AND active=true', [classId]);
  if (!klass) throw Object.assign(new Error('That class does not exist.'), { status: 404 });
  const same = await one('SELECT id FROM courses WHERE lower(title)=lower($1)', [pkg.title.trim()]);
  if (same) throw Object.assign(new Error(`There is already a course called "${pkg.title}".`), { status: 409, courseId: same.id });
  if (pkg.modules.some((m) => m.lessons.some((l) => l.video)) && !bunnyConfigured()) {
    throw Object.assign(new Error('The video library (Bunny Stream) is not connected, so the videos have nowhere to go.'), { status: 409 });
  }

  const result = await transaction(async (client) => {
    const position = (await client.query('SELECT COALESCE(max(position), 0) + 1 AS p FROM courses')).rows[0].p;
    const course = (await client.query(
      `INSERT INTO courses(title, description, cover_url, published, position, created_by, open_to_all)
       VALUES ($1, $2, $3, true, $4, $5, false) RETURNING id`,
      [pkg.title.trim(), String(pkg.description || '').trim(), pkg.cover || null, position, actorId],
    )).rows[0];
    await client.query('INSERT INTO course_classes(course_id, class_id) VALUES ($1, $2)', [course.id, classId]);
    let lessons = 0;
    let videos = 0;
    for (const [mi, m] of pkg.modules.entries()) {
      const mod = (await client.query(
        'INSERT INTO course_modules(course_id, title, position) VALUES ($1, $2, $3) RETURNING id',
        [course.id, m.title.trim(), mi],
      )).rows[0];
      for (const [li, l] of m.lessons.entries()) {
        const lesson = (await client.query(
          `INSERT INTO course_lessons(module_id, title, notes, duration_seconds, published, position)
           VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
          [mod.id, l.title.trim(), String(l.notes || '').trim(), Math.round(Number(l.durationSeconds) || 0) || null, li],
        )).rows[0];
        lessons += 1;
        if (l.video) {
          await client.query('INSERT INTO lesson_video_imports(lesson_id, source_url) VALUES ($1, $2)', [lesson.id, l.video]);
          videos += 1;
        }
      }
    }
    return { courseId: course.id, lessons, videos };
  });
  await audit({ actorId, action: 'course.imported', entityType: 'course', entityId: result.courseId, metadata: { title: pkg.title, classId, lessons: result.lessons, videos: result.videos } });
  // The copies run in the background; the answer does not wait for them.
  runVideoImports().catch((error) => console.error('Course video import failed', error));
  return result;
}

/** How far a course's videos have got. */
export async function importProgress(courseId) {
  const rows = (await query(
    `SELECT l.id, l.title, i.status, i.attempts, i.error, i.bytes, i.started_at, i.finished_at
     FROM lesson_video_imports i
     JOIN course_lessons l ON l.id=i.lesson_id
     JOIN course_modules m ON m.id=l.module_id
     WHERE m.course_id=$1 ORDER BY m.position, l.position`,
    [courseId],
  )).rows;
  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    total: rows.length,
    queued: count('queued'),
    copying: count('copying'),
    encoding: count('encoding'),
    done: count('done'),
    failed: count('failed'),
    lessons: rows.map((r) => ({ id: r.id, title: r.title, status: r.status, attempts: r.attempts, error: r.error, bytes: Number(r.bytes) || null })),
  };
}

/* ---- the copying ------------------------------------------------------- */

let running = null;

/** Copies every queued video, two at a time, then waits for Bunny to encode them. One run at a time. */
export function runVideoImports() {
  // Nowhere to put them: they wait, queued, until the library is connected.
  if (!bunnyConfigured()) return Promise.resolve();
  running ||= (async () => {
    try {
      await Promise.all(Array.from({ length: WORKERS }, () => worker()));
      // Then wait for the encodes: every half minute for up to two hours. The hourly sweep catches the rest.
      for (let round = 0; round < 240; round += 1) {
        const left = await finishVideoImports();
        if (!left) break;
        await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

async function worker() {
  for (;;) {
    const row = await one(
      `UPDATE lesson_video_imports SET status='copying', started_at=now(), attempts=attempts+1, error=NULL
       WHERE lesson_id=(SELECT lesson_id FROM lesson_video_imports WHERE status='queued' ORDER BY created_at, lesson_id LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
    );
    if (!row) return;
    let videoId = null;
    try {
      if (!allowedVideo(row.source_url)) throw new Error('The video is not on a host the import trusts.');
      const lesson = await one(
        `SELECT l.title, c.title AS course FROM course_lessons l JOIN course_modules m ON m.id=l.module_id
         JOIN courses c ON c.id=m.course_id WHERE l.id=$1`, [row.lesson_id]);
      if (!lesson) throw new Error('The lesson has been deleted.');
      const response = await fetch(row.source_url, { redirect: 'follow' });
      if (!response.ok || !response.body) throw new Error(`The video could not be fetched (${response.status}).`);
      const size = Number(response.headers.get('content-length')) || 0;
      videoId = await createVideo(`${lesson.course}: ${lesson.title}`);
      await query('UPDATE lesson_video_imports SET bunny_ref=$2, bytes=$3 WHERE lesson_id=$1', [row.lesson_id, `${config.bunny.libraryId}/${videoId}`, size || null]);
      await uploadVideo(videoId, response.body, size);
      await query(`UPDATE lesson_video_imports SET status='encoding' WHERE lesson_id=$1`, [row.lesson_id]);
    } catch (error) {
      console.error('Course video copy failed', row.lesson_id, error.message);
      if (videoId) await deleteVideo(videoId).catch(() => {});
      const again = row.attempts < MAX_ATTEMPTS;
      await query(
        `UPDATE lesson_video_imports SET status=$2, error=$3, bunny_ref=NULL, finished_at=CASE WHEN $2='failed' THEN now() END WHERE lesson_id=$1`,
        [row.lesson_id, again ? 'queued' : 'failed', String(error.message || error).slice(0, 500)],
      );
    }
  }
}

/** Switches each lesson on once Bunny can play its copy. Returns how many are still encoding. */
export async function finishVideoImports() {
  if (!bunnyConfigured()) return 0;
  const rows = (await query(`SELECT * FROM lesson_video_imports WHERE status='encoding' AND bunny_ref IS NOT NULL`)).rows;
  let waiting = 0;
  let switched = 0;
  for (const row of rows) {
    const videoId = row.bunny_ref.split('/')[1];
    let video;
    try { video = await getBunnyVideo(videoId); } catch (error) { waiting += 1; console.error('Bunny status unreadable', videoId, error.message); continue; }
    if (video.failed) {
      await query(`UPDATE lesson_video_imports SET status='failed', error='Bunny Stream could not encode this video.', finished_at=now() WHERE lesson_id=$1`, [row.lesson_id]);
      continue;
    }
    if (!video.playable) { waiting += 1; continue; }
    await query(
      `UPDATE course_lessons SET video_provider='bunny', video_ref=$2,
              duration_seconds=COALESCE(NULLIF($3::int, 0), duration_seconds), updated_at=now()
       WHERE id=$1 AND video_provider IS NULL`,
      [row.lesson_id, row.bunny_ref, video.durationSeconds || 0],
    );
    await query(`UPDATE lesson_video_imports SET status='done', error=NULL, finished_at=now() WHERE lesson_id=$1`, [row.lesson_id]);
    switched += 1;
  }
  if (switched) (await import('./routes/hub.js')).forgetHubExport();
  return waiting;
}

/** Failed copies, given another go (from the teacher's button). */
export async function retryFailedImports(courseId) {
  const result = await query(
    `UPDATE lesson_video_imports i SET status='queued', attempts=0, error=NULL, finished_at=NULL
     FROM course_lessons l JOIN course_modules m ON m.id=l.module_id
     WHERE i.lesson_id=l.id AND m.course_id=$1 AND i.status='failed'`,
    [courseId],
  );
  if (result.rowCount) runVideoImports().catch((error) => console.error('Course video import failed', error));
  return result.rowCount;
}

/* A copy runs inside this server and cannot outlive it. Anything cut off by a
   restart goes back in the queue (it has attempts left, or it is failed), and
   whatever was waiting carries on. */
export async function resumeVideoImports() {
  // The half-sent copies are taken back out of the library first.
  const cut = (await query(`SELECT bunny_ref FROM lesson_video_imports WHERE status='copying' AND bunny_ref IS NOT NULL`)).rows;
  for (const row of cut) await deleteVideo(row.bunny_ref.split('/')[1]).catch(() => {});
  await query(
    `UPDATE lesson_video_imports SET status=CASE WHEN attempts < ${MAX_ATTEMPTS} THEN 'queued' ELSE 'failed' END,
            error='Interrupted when the portal restarted.', bunny_ref=NULL
     WHERE status='copying'`,
  );
  const pending = await one(`SELECT count(*)::int n FROM lesson_video_imports WHERE status IN ('queued','encoding')`);
  if (pending?.n) runVideoImports().catch((error) => console.error('Course video import failed', error));
  return pending?.n || 0;
}
