import test from 'node:test';
import assert from 'node:assert/strict';

const dbTest = { skip: process.env.RUN_DB_TESTS !== '1' };

async function fixture() {
  const { query, one } = await import('../src/db.js');
  const klass = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time) VALUES ('Course test',1,'19:00') RETURNING *`);
  const teacher = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('admin','Teacher',$1,'x') RETURNING *`,
    [`ct-teacher-${klass.id}@test.local`]);
  const alice = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('student','Alice',$1,'x') RETURNING *`,
    [`ct-alice-${klass.id}@test.local`]);
  const bob = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('student','Bob',$1,'x') RETURNING *`,
    [`ct-bob-${klass.id}@test.local`]);
  await query('INSERT INTO class_students(class_id,student_id) VALUES ($1,$2),($1,$3)', [klass.id, alice.id, bob.id]);

  const course = await one(
    `INSERT INTO courses(title,published) VALUES ('Test course',true) RETURNING *`);
  await query('INSERT INTO course_classes(course_id,class_id) VALUES ($1,$2)', [course.id, klass.id]);
  const module = await one(
    `INSERT INTO course_modules(course_id,title,position) VALUES ($1,'Term 1',0) RETURNING *`, [course.id]);
  const lessons = [];
  for (const [index, title] of ['One', 'Two', 'Three'].entries()) {
    lessons.push(await one(
      `INSERT INTO course_lessons(module_id,title,position,video_provider,video_ref)
       VALUES ($1,$2,$3,'youtube','abc123') RETURNING *`, [module.id, title, index]));
  }
  return {
    klass, teacher, alice, bob, course, module, lessons,
    async cleanup() {
      await query('DELETE FROM courses WHERE id=$1', [course.id]);
      await query('DELETE FROM classes WHERE id=$1', [klass.id]);
      await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[teacher.id, alice.id, bob.id]]);
    },
  };
}

test('progress belongs to the student who made it, not to the lesson', dbTest, async () => {
  const { setLessonProgress, getCourse } = await import('../src/courses.js');
  const { klass, alice, bob, course, lessons, cleanup } = await fixture();
  try {
    await setLessonProgress({ studentId: alice.id, lessonId: lessons[0].id, completed: true });

    /* The thing to get right: Alice finishing a lesson must not mark it
       finished for Bob. A completion flag on the lesson row does exactly that,
       and more than one course platform has shipped it. */
    const forAlice = await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id });
    const forBob = await getCourse({ courseId: course.id, viewerId: bob.id, classId: klass.id });

    assert.equal(forAlice.modules[0].lessons[0].completed, true);
    assert.equal(forBob.modules[0].lessons[0].completed, false);
    assert.equal(forAlice.percent, 33);
    assert.equal(forBob.percent, 0);
  } finally { await cleanup(); }
});

test('a lesson can be marked complete and then not complete again', dbTest, async () => {
  const { setLessonProgress, getCourse } = await import('../src/courses.js');
  const { klass, alice, course, lessons, cleanup } = await fixture();
  try {
    await setLessonProgress({ studentId: alice.id, lessonId: lessons[0].id, completed: true });
    let view = await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id });
    assert.equal(view.completedCount, 1);

    await setLessonProgress({ studentId: alice.id, lessonId: lessons[0].id, completed: false });
    view = await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id });
    assert.equal(view.completedCount, 0);
    assert.equal(view.modules[0].lessons[0].completed, false);
  } finally { await cleanup(); }
});

test('opening a course resumes at the first thing not finished', dbTest, async () => {
  const { setLessonProgress, getCourse } = await import('../src/courses.js');
  const { klass, alice, course, lessons, cleanup } = await fixture();
  try {
    let view = await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id });
    assert.equal(view.resumeLessonId, lessons[0].id);

    await setLessonProgress({ studentId: alice.id, lessonId: lessons[0].id, completed: true });
    view = await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id });
    assert.equal(view.resumeLessonId, lessons[1].id);

    // Everything done: back to the start rather than nowhere.
    for (const lesson of lessons) await setLessonProgress({ studentId: alice.id, lessonId: lesson.id, completed: true });
    view = await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id });
    assert.equal(view.resumeLessonId, lessons[0].id);
    assert.equal(view.percent, 100);
  } finally { await cleanup(); }
});

test('a draft course and a draft lesson stay out of a student\'s view', dbTest, async () => {
  const { getCourse, listCoursesForStudent, studentCanSeeLesson } = await import('../src/courses.js');
  const { query } = await import('../src/db.js');
  const { klass, alice, course, lessons, cleanup } = await fixture();
  try {
    await query('UPDATE course_lessons SET published=false WHERE id=$1', [lessons[2].id]);
    const view = await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id });
    assert.deepEqual(view.modules[0].lessons.map((l) => l.title), ['One', 'Two']);
    assert.equal(await studentCanSeeLesson({ lessonId: lessons[2].id, classId: klass.id }), false);

    // The administrator still sees it, marked.
    const asAdmin = await getCourse({ courseId: course.id, viewerId: alice.id, isAdmin: true });
    assert.equal(asAdmin.modules[0].lessons.length, 3);
    assert.equal(asAdmin.modules[0].lessons[2].published, false);

    await query('UPDATE courses SET published=false WHERE id=$1', [course.id]);
    assert.equal(await getCourse({ courseId: course.id, viewerId: alice.id, classId: klass.id }), null);
    /* Scoped to this fixture rather than counting every row: the database this
       runs against is a real one with real courses in it. */
    const listed = await listCoursesForStudent({ studentId: alice.id, classId: klass.id });
    assert.equal(listed.some((row) => row.id === course.id), false);
  } finally { await cleanup(); }
});

test('a course reaches the classes it is enrolled in, and an open one reaches all', dbTest, async () => {
  const { listCoursesForStudent } = await import('../src/courses.js');
  const { one, query } = await import('../src/db.js');
  const { klass, alice, course, cleanup } = await fixture();
  const other = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time) VALUES ('Other',4,'19:00') RETURNING *`);
  try {
    const sees = async (classId) => (await listCoursesForStudent({ studentId: alice.id, classId }))
      .some((row) => row.id === course.id);

    // Alice is in `klass`, and the course is enrolled there.
    assert.equal(await sees(klass.id), true);
    assert.equal(await sees(other.id), false);

    // Enrolled in both, which is the case a single class column could not express.
    await query('INSERT INTO course_classes(course_id,class_id) VALUES ($1,$2)', [course.id, other.id]);
    assert.equal(await sees(klass.id), true);
    assert.equal(await sees(other.id), true);

    // Open to all reaches a class it was never enrolled in.
    await query('DELETE FROM course_classes WHERE course_id=$1', [course.id]);
    assert.equal(await sees(klass.id), false);
    await query('UPDATE courses SET open_to_all=true WHERE id=$1', [course.id]);
    assert.equal(await sees(klass.id), true);
    assert.equal(await sees(other.id), true);
  } finally {
    await query('DELETE FROM classes WHERE id=$1', [other.id]);
    await cleanup();
  }
});

test('the teacher can see how far each student has got', dbTest, async () => {
  const { setLessonProgress, courseProgress } = await import('../src/courses.js');
  const { alice, bob, course, lessons, cleanup } = await fixture();
  try {
    await setLessonProgress({ studentId: alice.id, lessonId: lessons[0].id, completed: true });
    await setLessonProgress({ studentId: alice.id, lessonId: lessons[1].id, completed: true });

    const rows = await courseProgress(course.id);
    const forAlice = rows.find((row) => row.id === alice.id);
    const forBob = rows.find((row) => row.id === bob.id);
    assert.equal(forAlice.completed_count, 2);
    assert.equal(forAlice.percent, 67);
    assert.equal(forBob.completed_count, 0);
  } finally { await cleanup(); }
});

/* The class-level settings that came with the many-to-many change. Run against a
   real database because they are all questions about what a join reaches. */

test('recording progress is counted across every course a class can see', dbTest, async () => {
  const { setLessonProgress, classRecordingProgress, setCourseClasses } = await import('../src/courses.js');
  const { one, query } = await import('../src/db.js');
  const { klass, alice, bob, course, lessons, cleanup } = await fixture();

  // A second course, open to everybody, so the count has to span both.
  const open = await one(
    `INSERT INTO courses(title,published,open_to_all) VALUES ('Open course',true,true) RETURNING *`);
  const openModule = await one(
    `INSERT INTO course_modules(course_id,title,position) VALUES ($1,'Only module',0) RETURNING *`, [open.id]);
  const openLesson = await one(
    `INSERT INTO course_lessons(module_id,title,position,published) VALUES ($1,'Only lesson',0,true) RETURNING *`,
    [openModule.id]);

  try {
    /* Scoped to this fixture rather than to absolute totals: the database this
       runs against is a real one, and any course already marked open to every
       class is legitimately part of what this class can see. */
    let rows = await classRecordingProgress(klass.id);
    const forAlice = () => rows.find((row) => row.id === alice.id);
    assert.equal(rows.length, 2, 'both students in the class should be listed');
    const baseline = forAlice().lesson_count;
    const doneBefore = forAlice().completed_count;

    await setLessonProgress({ studentId: alice.id, lessonId: lessons[0].id, completed: true });
    // The second lesson is in the open course, which the class was never
    // enrolled in — it has to count anyway.
    await setLessonProgress({ studentId: alice.id, lessonId: openLesson.id, completed: true });
    rows = await classRecordingProgress(klass.id);
    assert.equal(forAlice().completed_count, doneBefore + 2);
    assert.equal(forAlice().lesson_count, baseline, 'watching something does not change the total');
    // Bob's own progress is his own.
    assert.equal(rows.find((row) => row.id === bob.id).completed_count, 0);

    // Unenrolling drops that course's three published lessons from the total,
    // and the one Alice watched in it from her count. What she watched in the
    // open course survives, because that course reaches her either way.
    await setCourseClasses(course.id, []);
    rows = await classRecordingProgress(klass.id);
    assert.equal(forAlice().lesson_count, baseline - 3);
    assert.equal(forAlice().completed_count, doneBefore + 1);
  } finally {
    await query('DELETE FROM courses WHERE id=$1', [open.id]);
    await cleanup();
  }
});

test('setting a course’s classes replaces them rather than adding to them', dbTest, async () => {
  const { setCourseClasses, coursesForClass } = await import('../src/courses.js');
  const { one, query } = await import('../src/db.js');
  const { klass, course, cleanup } = await fixture();
  const other = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time) VALUES ('Other',4,'19:00') RETURNING *`);
  try {
    await setCourseClasses(course.id, [klass.id, other.id]);
    const both = await query('SELECT class_id FROM course_classes WHERE course_id=$1', [course.id]);
    assert.equal(both.rowCount, 2);

    // Replacing with one leaves one, not three.
    await setCourseClasses(course.id, [other.id]);
    const now = await query('SELECT class_id FROM course_classes WHERE course_id=$1', [course.id]);
    assert.equal(now.rowCount, 1);
    assert.equal(now.rows[0].class_id, other.id);

    const listed = await coursesForClass(other.id);
    assert.equal(listed.find((row) => row.id === course.id).enrolled, true);
    const notListed = await coursesForClass(klass.id);
    assert.equal(notListed.find((row) => row.id === course.id).enrolled, false);
  } finally {
    await query('DELETE FROM classes WHERE id=$1', [other.id]);
    await cleanup();
  }
});

test('deleting a class or a course takes its enrolments with it', dbTest, async () => {
  const { setCourseClasses } = await import('../src/courses.js');
  const { one, query } = await import('../src/db.js');
  const { course, cleanup } = await fixture();
  const doomed = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time) VALUES ('Doomed',2,'19:00') RETURNING *`);
  try {
    await setCourseClasses(course.id, [doomed.id]);
    await query('DELETE FROM classes WHERE id=$1', [doomed.id]);
    // The cascade matters: a stale row here would make a deleted class keep
    // reaching a course, and the join would resurrect it if the id came back.
    const left = await query('SELECT 1 FROM course_classes WHERE class_id=$1', [doomed.id]);
    assert.equal(left.rowCount, 0);
  } finally { await cleanup(); }
});

/* Management: the actions that had backend routes but no way to ask for them,
   plus the reordering that can now move a lesson between sections. */

test('reordering can move a lesson to another section, but not across courses', dbTest, async () => {
  const { one, query, transaction } = await import('../src/db.js');
  const { klass, course, module, lessons, cleanup } = await fixture();

  const second = await one(
    'INSERT INTO course_modules(course_id,title,position) VALUES ($1,\'Term 2\',1) RETURNING *', [course.id]);
  // A whole separate course, whose lessons must stay where they are.
  const outsider = await one(
    `INSERT INTO courses(title,published) VALUES ('Someone else''s course',true) RETURNING *`);
  const outsiderModule = await one(
    'INSERT INTO course_modules(course_id,title,position) VALUES ($1,\'Theirs\',0) RETURNING *', [outsider.id]);
  const outsiderLesson = await one(
    `INSERT INTO course_lessons(module_id,title,position) VALUES ($1,'Theirs',0) RETURNING *`, [outsiderModule.id]);

  /* The same shape the route applies, exercised directly: the route is thin and
     this is the part with the rules in it. */
  const applyOrder = async (courseId, modules) => transaction(async (client) => {
    const own = await client.query('SELECT id FROM course_modules WHERE course_id=$1', [courseId]);
    const mine = new Set(own.rows.map((row) => row.id));
    for (const [index, mod] of modules.entries()) {
      if (!mine.has(mod.id)) continue;
      await client.query('UPDATE course_modules SET position=$1 WHERE id=$2 AND course_id=$3', [index, mod.id, courseId]);
      for (const [lessonIndex, lessonId] of mod.lessons.entries()) {
        await client.query(
          `UPDATE course_lessons SET position=$1, module_id=$2
           WHERE id=$3 AND module_id IN (SELECT id FROM course_modules WHERE course_id=$4)`,
          [lessonIndex, mod.id, lessonId, courseId]);
      }
    }
  });

  try {
    // Move the first lesson out of its section and into the second.
    await applyOrder(course.id, [
      { id: module.id, lessons: [lessons[1].id, lessons[2].id] },
      { id: second.id, lessons: [lessons[0].id] },
    ]);
    const moved = await one('SELECT module_id, position FROM course_lessons WHERE id=$1', [lessons[0].id]);
    assert.equal(moved.module_id, second.id, 'the lesson should have changed section');
    assert.equal(moved.position, 0);
    // The two left behind close the gap rather than keeping their old numbers.
    const stayed = await query('SELECT id, position FROM course_lessons WHERE module_id=$1 ORDER BY position', [module.id]);
    assert.deepEqual(stayed.rows.map((row) => row.position), [0, 1]);

    /* A crafted request naming another course's section and lesson must do
       nothing at all — this is the only place an id from outside is accepted. */
    await applyOrder(course.id, [{ id: outsiderModule.id, lessons: [outsiderLesson.id] }]);
    const untouched = await one('SELECT module_id, position FROM course_lessons WHERE id=$1', [outsiderLesson.id]);
    assert.equal(untouched.module_id, outsiderModule.id);
    assert.equal(untouched.position, 0);

    // And a lesson from another course cannot be pulled into this one.
    await applyOrder(course.id, [{ id: second.id, lessons: [outsiderLesson.id] }]);
    const stillTheirs = await one('SELECT module_id FROM course_lessons WHERE id=$1', [outsiderLesson.id]);
    assert.equal(stillTheirs.module_id, outsiderModule.id, 'another course’s lesson must not be movable');
  } finally {
    await query('DELETE FROM courses WHERE id=$1', [outsider.id]);
    await cleanup();
  }
});

test('duplicating a course copies its shape but nobody’s progress', dbTest, async () => {
  const { setLessonProgress } = await import('../src/courses.js');
  const { one, query } = await import('../src/db.js');
  const { klass, alice, course, module, lessons, cleanup } = await fixture();
  await setLessonProgress({ studentId: alice.id, lessonId: lessons[0].id, completed: true });
  await query('UPDATE courses SET published=true, open_to_all=true WHERE id=$1', [course.id]);
  await query('UPDATE course_lessons SET published=false WHERE id=$1', [lessons[2].id]);

  // The same copy the route performs.
  const copy = await one(
    `INSERT INTO courses(title,description,cover_url,published,position,open_to_all)
     SELECT title || ' (copy)', description, cover_url, false, position, false
     FROM courses WHERE id=$1 RETURNING *`, [course.id]);
  const newModule = await one(
    'INSERT INTO course_modules(course_id,title,position) VALUES ($1,$2,0) RETURNING *', [copy.id, module.title]);
  for (const [index, lesson] of lessons.entries()) {
    await query(
      `INSERT INTO course_lessons(module_id,title,notes,video_provider,video_ref,published,position)
       SELECT $1,title,notes,video_provider,video_ref,published,$2 FROM course_lessons WHERE id=$3`,
      [newModule.id, index, lesson.id]);
  }

  try {
    // A copy nobody has taken yet: no progress rows point into it.
    const progress = await one(
      `SELECT count(*)::int n FROM lesson_progress p JOIN course_lessons l ON l.id=p.lesson_id
       WHERE l.module_id=$1`, [newModule.id]);
    assert.equal(progress.n, 0, 'the copy must not inherit anybody’s watch history');
    // The original keeps its own.
    const original = await one(
      `SELECT count(*)::int n FROM lesson_progress p JOIN course_lessons l ON l.id=p.lesson_id
       WHERE l.module_id=$1`, [module.id]);
    assert.equal(original.n, 1);

    // A draft, reaching nobody, whatever the original was.
    assert.equal(copy.published, false);
    assert.equal(copy.open_to_all, false);
    const enrolments = await one('SELECT count(*)::int n FROM course_classes WHERE course_id=$1', [copy.id]);
    assert.equal(enrolments.n, 0, 'a copy must not land on a class’s screen by itself');

    // Draft lessons stay drafts rather than being published by the copy.
    const copied = await query('SELECT title, published FROM course_lessons WHERE module_id=$1 ORDER BY position', [newModule.id]);
    assert.deepEqual(copied.rows.map((row) => row.published), [true, true, false]);
  } finally {
    await query('DELETE FROM courses WHERE id=$1', [copy.id]);
    await cleanup();
  }
});
