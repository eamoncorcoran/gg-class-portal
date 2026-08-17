import test from 'node:test';
import assert from 'node:assert/strict';

/* The board is all SQL, so these run against a real database the same way the
   other database tests do:
     RUN_DB_TESTS=1 npm test
   Without one they skip rather than pretending to pass. */
const dbTest = { skip: process.env.RUN_DB_TESTS !== '1' };

async function fixture() {
  const { query, one } = await import('../src/db.js');
  const klass = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time) VALUES ('Board test',1,'19:00') RETURNING *`,
  );
  const teacher = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('admin','Teacher',$1,'x') RETURNING *`,
    [`teacher-${klass.id}@test.local`],
  );
  const student = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('student','Student',$1,'x') RETURNING *`,
    [`student-${klass.id}@test.local`],
  );
  await query('INSERT INTO class_students(class_id,student_id) VALUES ($1,$2)', [klass.id, student.id]);
  return {
    klass, teacher, student,
    // Deleting the class takes its threads with it; the users are separate rows.
    async cleanup() {
      await query('DELETE FROM classes WHERE id=$1', [klass.id]);
      await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[teacher.id, student.id]]);
    },
  };
}

test('a student sees another persons post as unread, and their own as read', dbTest, async () => {
  const { createThread, createPost, unreadCount, markRead } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 0);

    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Notice', body: 'Read this' });
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 1);

    await createPost({ threadId: thread.id, authorId: teacher.id, body: 'And this' });
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 2);

    await markRead({ userId: student.id, classId: klass.id });
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 0);

    // Your own reply must never come back at you as something new to read.
    await createPost({ threadId: thread.id, authorId: student.id, body: 'Thanks' });
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 0);
  } finally { await cleanup(); }
});

test('a removed thread disappears for students and stays for the teacher', dbTest, async () => {
  const { createThread, listThreads, getThread } = await import('../src/community.js');
  const { query } = await import('../src/db.js');
  const { klass, teacher, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Oops', body: 'Wrong place' });
    await query('UPDATE discussion_threads SET deleted_at=now() WHERE id=$1', [thread.id]);

    assert.equal((await listThreads({ classId: klass.id })).length, 0);
    assert.equal((await listThreads({ classId: klass.id, includeDeleted: true })).length, 1);
    assert.equal(await getThread({ threadId: thread.id }), null);
    assert.ok(await getThread({ threadId: thread.id, includeDeleted: true }));
  } finally { await cleanup(); }
});

test('a removed reply stops counting towards unread', dbTest, async () => {
  const { createThread, createPost, unreadCount, getThread } = await import('../src/community.js');
  const { query } = await import('../src/db.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Question', body: 'Anyone?' });
    const post = await createPost({ threadId: thread.id, authorId: teacher.id, body: 'Removed shortly' });
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 2);

    await query('UPDATE discussion_posts SET deleted_at=now() WHERE id=$1', [post.id]);
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 1);
    assert.equal((await getThread({ threadId: thread.id })).comments.length, 0);
  } finally { await cleanup(); }
});

test('pinned threads come first, then the most recent activity', dbTest, async () => {
  const { createThread, createPost, listThreads } = await import('../src/community.js');
  const { query } = await import('../src/db.js');
  const { klass, teacher, cleanup } = await fixture();
  try {
    const first = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Oldest', body: '.' });
    const second = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Newest', body: '.' });
    await query('UPDATE discussion_threads SET pinned=true WHERE id=$1', [first.id]);

    let order = (await listThreads({ classId: klass.id })).map((row) => row.title);
    assert.deepEqual(order, ['Oldest', 'Newest']);

    // Replying lifts a thread, but not above a pinned one.
    await createPost({ threadId: second.id, authorId: teacher.id, body: 'bump' });
    order = (await listThreads({ classId: klass.id })).map((row) => row.title);
    assert.deepEqual(order, ['Oldest', 'Newest']);
  } finally { await cleanup(); }
});

test('membership decides who can see a class board', dbTest, async () => {
  const { canSeeClass } = await import('../src/community.js');
  const { one, query } = await import('../src/db.js');
  const { klass, teacher, student, cleanup } = await fixture();
  const outsider = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('student','Outsider',$1,'x') RETURNING *`,
    [`outsider-${klass.id}@test.local`],
  );
  try {
    assert.equal(await canSeeClass({ userId: student.id, isAdmin: false, classId: klass.id }), true);
    assert.equal(await canSeeClass({ userId: outsider.id, isAdmin: false, classId: klass.id }), false);
    assert.equal(await canSeeClass({ userId: teacher.id, isAdmin: true, classId: klass.id }), true);
  } finally {
    await query('DELETE FROM users WHERE id=$1', [outsider.id]);
    await cleanup();
  }
});

test('a like toggles both ways and never counts twice', dbTest, async () => {
  const { createThread, toggleLike, getThread } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Like me', body: '.' });

    let result = await toggleLike({ userId: student.id, targetType: 'thread', targetId: thread.id });
    assert.deepEqual(result, { liked: true, likeCount: 1 });

    result = await toggleLike({ userId: student.id, targetType: 'thread', targetId: thread.id });
    assert.deepEqual(result, { liked: false, likeCount: 0 });

    // Two different people, two likes.
    await toggleLike({ userId: student.id, targetType: 'thread', targetId: thread.id });
    result = await toggleLike({ userId: teacher.id, targetType: 'thread', targetId: thread.id });
    assert.equal(result.likeCount, 2);

    // The viewer's own like state is what the button reads from.
    const asStudent = await getThread({ threadId: thread.id, viewerId: student.id });
    assert.equal(asStudent.liked, true);
    assert.equal(asStudent.like_count, 2);
  } finally { await cleanup(); }
});

test('comments carry their own likes', dbTest, async () => {
  const { createThread, createPost, toggleLike, getThread } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Q', body: '.' });
    const comment = await createPost({ threadId: thread.id, authorId: teacher.id, body: 'An answer' });
    await toggleLike({ userId: student.id, targetType: 'post', targetId: comment.id });

    const seen = await getThread({ threadId: thread.id, viewerId: student.id });
    assert.equal(seen.comments[0].like_count, 1);
    assert.equal(seen.comments[0].liked, true);
    // Liking a comment must not add to the post it sits under.
    assert.equal(seen.like_count, 0);
  } finally { await cleanup(); }
});

test('the feed filters by category and sorts by likes on request', dbTest, async () => {
  const { createThread, listThreads, toggleLike } = await import('../src/community.js');
  const { one } = await import('../src/db.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const questions = await one(
      `INSERT INTO discussion_categories(class_id,name,position) VALUES ($1,'Questions',1) RETURNING *`, [klass.id]);
    const quiet = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Quiet', body: '.' });
    const popular = await createThread({
      classId: klass.id, authorId: teacher.id, title: 'Popular', body: '.', categoryId: questions.id,
    });
    await toggleLike({ userId: student.id, targetType: 'thread', targetId: popular.id });

    const filtered = await listThreads({ classId: klass.id, viewerId: student.id, categoryId: questions.id });
    assert.deepEqual(filtered.map((row) => row.title), ['Popular']);
    assert.equal(filtered[0].category_name, 'Questions');

    // Newest first by default: `quiet` was created before `popular`.
    const byNew = await listThreads({ classId: klass.id, viewerId: student.id });
    assert.deepEqual(byNew.map((row) => row.title), ['Popular', 'Quiet']);

    const byTop = await listThreads({ classId: klass.id, viewerId: student.id, sort: 'top' });
    assert.equal(byTop[0].title, 'Popular');
    assert.equal(byTop[0].like_count, 1);
    assert.equal(quiet.id !== popular.id, true);
  } finally { await cleanup(); }
});

test('contributors count what people wrote, and leave the teacher out', dbTest, async () => {
  const { createThread, createPost, toggleLike, topContributors } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: student.id, title: 'Mine', body: '.' });
    await createPost({ threadId: thread.id, authorId: student.id, body: 'and a comment' });
    await createThread({ classId: klass.id, authorId: teacher.id, title: 'Teacher post', body: '.' });
    // Likes received must not inflate a ranking that measures turning up.
    await toggleLike({ userId: teacher.id, targetType: 'thread', targetId: thread.id });

    const rows = await topContributors({ classId: klass.id });
    assert.equal(rows.length, 1, 'the teacher should not appear');
    assert.equal(rows[0].id, student.id);
    assert.equal(rows[0].total, 2);
    assert.equal(rows[0].posts, 1);
    assert.equal(rows[0].comments, 1);
  } finally { await cleanup(); }
});
