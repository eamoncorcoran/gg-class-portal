import { one, query } from './db.js';
import { videoSource, fmtDuration } from './lessonvideo.js';

/* Courses.
   ------------------------------------------------------------------
   A course is modules, and a module is lessons. Progress belongs to the student
   who made it, never to the lesson — a completion flag on the lesson itself
   means the first person to finish marks it finished for everybody.

   Everything a student can reach is filtered twice: the course has to be
   published and either theirs or open to all, and the lesson has to be
   published too. A draft is the administrator's alone. */

const LESSON_ATTACHMENTS = `COALESCE((SELECT json_agg(jsonb_build_object(
    'id',a.id,'url',a.url,'fileName',a.file_name,'mimeType',a.mime_type,'sizeBytes',a.size_bytes
  ) ORDER BY a.position, a.created_at)
  FROM lesson_attachments a WHERE a.lesson_id=l.id),'[]'::json) attachments`;

/** Courses a student may see, each with how far through it they are. */
export async function listCoursesForStudent({ studentId, classId }) {
  const result = await query(
    `SELECT c.id, c.title, c.description, c.cover_url, c.position,
            (SELECT count(*)::int FROM course_lessons l
               JOIN course_modules m ON m.id=l.module_id
              WHERE m.course_id=c.id AND l.published=true) lesson_count,
            (SELECT count(*)::int FROM lesson_progress p
               JOIN course_lessons l ON l.id=p.lesson_id
               JOIN course_modules m ON m.id=l.module_id
              WHERE m.course_id=c.id AND l.published=true AND p.student_id=$1) completed_count
     FROM courses c
     WHERE c.published=true AND (c.class_id IS NULL OR c.class_id=$2)
     ORDER BY c.position, c.created_at`,
    [studentId, classId],
  );
  return result.rows.map(withProgress);
}

/** Every course, draft included, for the administrator. */
export async function listCoursesForAdmin() {
  const result = await query(
    `SELECT c.*, k.programme_name, k.day_of_week, k.start_time,
            (SELECT count(*)::int FROM course_lessons l
               JOIN course_modules m ON m.id=l.module_id WHERE m.course_id=c.id) lesson_count,
            (SELECT count(*)::int FROM course_modules m WHERE m.course_id=c.id) module_count
     FROM courses c LEFT JOIN classes k ON k.id=c.class_id
     ORDER BY c.position, c.created_at`,
  );
  return result.rows;
}

function withProgress(row) {
  const total = row.lesson_count || 0;
  const done = row.completed_count || 0;
  return { ...row, percent: total ? Math.round((done / total) * 100) : 0 };
}

/**
 * One course with its modules and lessons.
 *
 * `viewerId` decides which lessons come back ticked. An administrator sees
 * unpublished lessons as well, marked, so a term can be built out in the open.
 */
export async function getCourse({ courseId, viewerId, classId, isAdmin = false }) {
  const course = await one(
    `SELECT c.* FROM courses c
     WHERE c.id=$1
       ${isAdmin ? '' : 'AND c.published=true AND (c.class_id IS NULL OR c.class_id=$2)'}`,
    isAdmin ? [courseId] : [courseId, classId],
  );
  if (!course) return null;

  const lessons = await query(
    `SELECT l.*, m.title module_title, m.position module_position, m.id module_id,
            ${LESSON_ATTACHMENTS},
            (p.student_id IS NOT NULL) completed, p.last_position_seconds
     FROM course_modules m
     JOIN course_lessons l ON l.module_id=m.id
     LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.student_id=$2
     WHERE m.course_id=$1 ${isAdmin ? '' : 'AND l.published=true'}
     ORDER BY m.position, m.created_at, l.position, l.created_at`,
    [courseId, viewerId],
  );

  // Grouped here rather than in the browser so the shape the screen draws is
  // decided once.
  const modules = [];
  for (const row of lessons.rows) {
    let group = modules.find((item) => item.id === row.module_id);
    if (!group) {
      group = { id: row.module_id, title: row.module_title, position: row.module_position, lessons: [] };
      modules.push(group);
    }
    group.lessons.push({
      id: row.id,
      title: row.title,
      notes: row.notes,
      published: row.published,
      recordedOn: row.recorded_on,
      durationLabel: fmtDuration(row.duration_seconds),
      durationSeconds: row.duration_seconds,
      completed: Boolean(row.completed),
      lastPositionSeconds: row.last_position_seconds || 0,
      attachments: row.attachments,
      video: videoSource(row),
      // What the administrator needs to edit it; never sent to a student.
      ...(isAdmin ? { videoProvider: row.video_provider, videoRef: row.video_ref } : {}),
    });
  }

  // Empty modules exist while a course is being built and should still show.
  if (isAdmin) {
    const empties = await query(
      `SELECT m.id, m.title, m.position FROM course_modules m
       WHERE m.course_id=$1 AND NOT EXISTS (SELECT 1 FROM course_lessons l WHERE l.module_id=m.id)
       ORDER BY m.position`,
      [courseId],
    );
    for (const row of empties.rows) modules.push({ ...row, lessons: [] });
    modules.sort((a, b) => a.position - b.position);
  }

  const all = modules.flatMap((module) => module.lessons);
  const done = all.filter((lesson) => lesson.completed).length;
  return {
    ...course,
    modules,
    lessonCount: all.length,
    completedCount: done,
    percent: all.length ? Math.round((done / all.length) * 100) : 0,
    // Where to drop somebody who opens the course: the first thing they have not
    // finished, or the start if they have finished everything.
    resumeLessonId: (all.find((lesson) => !lesson.completed) || all[0])?.id || null,
  };
}

/** Is this lesson one this student is entitled to open. */
export async function studentCanSeeLesson({ lessonId, classId }) {
  return Boolean(await one(
    `SELECT 1 FROM course_lessons l
     JOIN course_modules m ON m.id=l.module_id
     JOIN courses c ON c.id=m.course_id
     WHERE l.id=$1 AND l.published=true AND c.published=true
       AND (c.class_id IS NULL OR c.class_id=$2)`,
    [lessonId, classId],
  ));
}

export async function setLessonProgress({ studentId, lessonId, completed, positionSeconds }) {
  if (completed === false) {
    await query('DELETE FROM lesson_progress WHERE student_id=$1 AND lesson_id=$2', [studentId, lessonId]);
    return { completed: false };
  }
  await query(
    `INSERT INTO lesson_progress(student_id,lesson_id,last_position_seconds)
     VALUES ($1,$2,$3)
     ON CONFLICT (student_id,lesson_id) DO UPDATE
       SET last_position_seconds=GREATEST(lesson_progress.last_position_seconds, EXCLUDED.last_position_seconds)`,
    [studentId, lessonId, Math.max(0, Number(positionSeconds) || 0)],
  );
  return { completed: true };
}

/**
 * How far each student has got, for the administrator.
 *
 * Withdrawn students are left in but flagged, because "who has not watched
 * anything" is a question about the people still on the course.
 */
export async function courseProgress(courseId) {
  const result = await query(
    `WITH lessons AS (
       SELECT l.id FROM course_lessons l JOIN course_modules m ON m.id=l.module_id
       WHERE m.course_id=$1 AND l.published=true
     )
     SELECT u.id, u.name, u.withdrawn_at IS NOT NULL withdrawn,
            (SELECT count(*)::int FROM lesson_progress p
              WHERE p.student_id=u.id AND p.lesson_id IN (SELECT id FROM lessons)) completed_count,
            (SELECT count(*)::int FROM lessons) lesson_count
     FROM users u
     WHERE u.role='student' AND u.active=true
       AND (
         (SELECT class_id FROM courses WHERE id=$1) IS NULL
         OR EXISTS (SELECT 1 FROM class_students cs
                     WHERE cs.student_id=u.id AND cs.active=true
                       AND cs.class_id=(SELECT class_id FROM courses WHERE id=$1))
       )
     ORDER BY u.name`,
    [courseId],
  );
  return result.rows.map(withProgress);
}
