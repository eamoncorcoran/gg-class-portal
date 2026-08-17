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

test('a reaction toggles both ways and never counts twice', dbTest, async () => {
  const { createThread, toggleReaction, getThread } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'React to me', body: '.' });
    const react = (userId, emoji) => toggleReaction({ userId, targetType: 'thread', targetId: thread.id, emoji });

    let result = await react(student.id, '👍');
    assert.deepEqual(result.reactions, [{ emoji: '👍', count: 1, mine: true }]);

    result = await react(student.id, '👍');
    assert.deepEqual(result.reactions, []);

    /* One each: a different emoji replaces the one you had rather than adding
       to it, so the count under an emoji is always a count of people. */
    await react(student.id, '👍');
    result = await react(student.id, '🎉');
    assert.deepEqual(result.reactions, [{ emoji: '🎉', count: 1, mine: true }]);

    // Two people on the same emoji is one chip counting two.
    await react(teacher.id, '🎉');
    const asStudent = await getThread({ threadId: thread.id, viewerId: student.id });
    assert.deepEqual(asStudent.reactions, [{ emoji: '🎉', count: 2, mine: true }]);

    // Somebody else moving to a different emoji moves their count with them.
    await react(teacher.id, '💪');
    const after = await getThread({ threadId: thread.id, viewerId: student.id });
    assert.deepEqual(
      after.reactions.map((row) => [row.emoji, row.count]).sort(),
      [['💪', 1], ['🎉', 1]].sort(),
    );

    // And `mine` is per viewer, which is what the chip highlights from.
    assert.equal(after.reactions.find((row) => row.emoji === '💪').mine, false);
    const asTeacher = await getThread({ threadId: thread.id, viewerId: teacher.id });
    assert.equal(asTeacher.reactions.find((row) => row.emoji === '💪').mine, true);
  } finally { await cleanup(); }
});

test('only the known reactions are accepted', dbTest, async () => {
  const { createThread, toggleReaction } = await import('../src/community.js');
  const { klass, teacher, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Guarded', body: '.' });
    await assert.rejects(
      () => toggleReaction({ userId: teacher.id, targetType: 'thread', targetId: thread.id, emoji: '🍆' }),
      /not one of the reactions/,
    );
  } finally { await cleanup(); }
});

test('comments carry their own reactions', dbTest, async () => {
  const { createThread, createPost, toggleReaction, getThread } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Question', body: '.' });
    const comment = await createPost({ threadId: thread.id, authorId: teacher.id, body: 'An answer' });
    await toggleReaction({ userId: student.id, targetType: 'post', targetId: comment.id, emoji: '🙏' });

    const row = await getThread({ threadId: thread.id, viewerId: student.id });
    assert.deepEqual(row.comments[0].reactions, [{ emoji: '🙏', count: 1, mine: true }]);
    // Reacting to a comment must not put anything on the post above it.
    assert.deepEqual(row.reactions, []);
  } finally { await cleanup(); }
});

test('the feed filters by category', dbTest, async () => {
  const { createThread, listThreads, toggleReaction } = await import('../src/community.js');
  const { one } = await import('../src/db.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const questions = await one(
      `INSERT INTO discussion_categories(class_id,name,position) VALUES ($1,'Questions',1) RETURNING *`, [klass.id]);
    const quiet = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Quiet', body: '.' });
    const popular = await createThread({
      classId: klass.id, authorId: teacher.id, title: 'Popular', body: '.', categoryId: questions.id,
    });
    await toggleReaction({ userId: student.id, targetType: 'thread', targetId: popular.id, emoji: '👍' });

    const filtered = await listThreads({ classId: klass.id, viewerId: student.id, categoryId: questions.id });
    assert.deepEqual(filtered.map((row) => row.title), ['Popular']);
    assert.equal(filtered[0].category_name, 'Questions');

    // Newest first by default: `quiet` was created before `popular`.
    const byNew = await listThreads({ classId: klass.id, viewerId: student.id });
    assert.deepEqual(byNew.map((row) => row.title), ['Popular', 'Quiet']);

    // Reactions travel with the row so the chips need no second request.
    assert.deepEqual(byNew[0].reactions, [{ emoji: '👍', count: 1, mine: true }]);
    assert.deepEqual(byNew[1].reactions, []);
    assert.equal(quiet.id !== popular.id, true);
  } finally { await cleanup(); }
});

test('contributors count what people wrote, and leave the teacher out', dbTest, async () => {
  const { createThread, createPost, toggleReaction, topContributors } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({ classId: klass.id, authorId: student.id, title: 'Mine', body: '.' });
    await createPost({ threadId: thread.id, authorId: student.id, body: 'and a comment' });
    await createThread({ classId: klass.id, authorId: teacher.id, title: 'Teacher post', body: '.' });
    // Reactions received must not inflate a ranking that measures turning up.
    await toggleReaction({ userId: teacher.id, targetType: 'thread', targetId: thread.id, emoji: '👍' });

    const rows = await topContributors({ classId: klass.id });
    assert.equal(rows.length, 1, 'the teacher should not appear');
    assert.equal(rows[0].id, student.id);
    assert.equal(rows[0].total, 2);
    assert.equal(rows[0].posts, 1);
    assert.equal(rows[0].comments, 1);
  } finally { await cleanup(); }
});

test('a scheduled post is invisible to students until its moment', dbTest, async () => {
  const { createThread, listThreads, getThread, unreadCount } = await import('../src/community.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const thread = await createThread({
      classId: klass.id, authorId: teacher.id, title: 'Later', body: '.', publishedAt: future,
    });

    // The student's view of the feed, and of the post by its own id.
    assert.deepEqual(await listThreads({ classId: klass.id, viewerId: student.id }), []);
    assert.equal(await getThread({ threadId: thread.id, viewerId: student.id }), null);
    // And it must not ring the bell early either.
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 0);

    // The teacher sees it, marked.
    const mine = await listThreads({ classId: klass.id, viewerId: teacher.id, includeScheduled: true });
    assert.equal(mine.length, 1);
    assert.equal(mine[0].scheduled, true);
  } finally { await cleanup(); }
});

test('publishing a scheduled post makes it appear and count as new', dbTest, async () => {
  const { createThread, listThreads, unreadCount } = await import('../src/community.js');
  const { query } = await import('../src/db.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const thread = await createThread({
      classId: klass.id, authorId: teacher.id, title: 'Now', body: '.',
      publishedAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await query('UPDATE discussion_threads SET published_at=now() WHERE id=$1', [thread.id]);

    const seen = await listThreads({ classId: klass.id, viewerId: student.id });
    assert.deepEqual(seen.map((row) => row.title), ['Now']);
    assert.equal(seen[0].scheduled, false);
    assert.equal(await unreadCount({ userId: student.id, classId: klass.id }), 1);
  } finally { await cleanup(); }
});

test('attachments come back with the post that carries them', dbTest, async () => {
  const { createThread, getThread } = await import('../src/community.js');
  const { klass, teacher, cleanup } = await fixture();
  try {
    const thread = await createThread({
      classId: klass.id, authorId: teacher.id, title: 'With things', body: '.',
      attachments: [
        { kind: 'file', url: '/uploads/x.pdf', storedName: 'x.pdf', fileName: 'Week 4 notes.pdf', mimeType: 'application/pdf', sizeBytes: 4096 },
        { kind: 'loom', url: 'https://www.loom.com/share/abc123' },
        { kind: 'gif', url: 'https://media.giphy.com/media/abc/giphy.gif' },
      ],
    });
    const row = await getThread({ threadId: thread.id, viewerId: teacher.id });
    assert.deepEqual(row.attachments.map((a) => a.kind), ['file', 'loom', 'gif']);
    // The original filename survives, because a UUID is what goes on disk and
    // "Week 4 notes.pdf" is what a reader needs to see.
    assert.equal(row.attachments[0].fileName, 'Week 4 notes.pdf');
  } finally { await cleanup(); }
});

test('hot ranks a busy recent post above a busier old one', dbTest, async () => {
  const { createThread, createPost, listThreads } = await import('../src/community.js');
  const { query } = await import('../src/db.js');
  const { klass, teacher, student, cleanup } = await fixture();
  try {
    const old = await createThread({ classId: klass.id, authorId: teacher.id, title: 'Old but busy', body: '.' });
    const fresh = await createThread({ classId: klass.id, authorId: teacher.id, title: 'New and busy', body: '.' });
    for (let i = 0; i < 6; i += 1) await createPost({ threadId: old.id, authorId: student.id, body: `old ${i}` });
    for (let i = 0; i < 3; i += 1) await createPost({ threadId: fresh.id, authorId: student.id, body: `new ${i}` });
    // Age the old one by four days; its six comments decay past the fresh three.
    await query(`UPDATE discussion_threads SET last_activity_at=now() - interval '4 days' WHERE id=$1`, [old.id]);

    const hot = await listThreads({ classId: klass.id, viewerId: student.id, sort: 'hot' });
    assert.equal(hot[0].title, 'New and busy');

    // Latest is strictly by publication date and ignores the noise.
    const latest = await listThreads({ classId: klass.id, viewerId: student.id });
    assert.equal(latest[0].title, 'New and busy');
  } finally { await cleanup(); }
});
