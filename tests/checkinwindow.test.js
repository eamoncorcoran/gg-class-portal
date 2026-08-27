import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkinOpen, checkinOpenSql } from '../src/weeks.js';

/* What a student is offered must be what the server will accept.
   ------------------------------------------------------------------
   These were two rules written separately, and they disagreed. The screen asked
   only whether the check-in had opened; the save also required that it had not
   closed. So a week past its deadline arrived marked available, a student
   answered six questions, pressed Submit — and the save was refused. The work
   was gone and there was nothing on the teacher's screen to say anybody had
   tried. It reads, from both ends, as the button doing nothing.

   Now there is one predicate and one SQL form of it, and these hold them to
   saying the same thing. */

const HOUR = 3600 * 1000;
const at = (offsetHours) => new Date(Date.now() + offsetHours * HOUR).toISOString();

const week = (overrides = {}) => ({
  checkin_enabled: true,
  checkin_release_at: at(-48),
  checkin_due_at: at(48),
  checkin_hard_deadline: true,
  ...overrides,
});

test('a check-in is open between its opening and its deadline', () => {
  assert.equal(checkinOpen(week()), true);
});

test('it is closed before it opens', () => {
  assert.equal(checkinOpen(week({ checkin_release_at: at(2) })), false);
});

test('a hard deadline closes it; a soft one does not', () => {
  const past = { checkin_release_at: at(-72), checkin_due_at: at(-2) };
  assert.equal(checkinOpen(week({ ...past, checkin_hard_deadline: true })), false,
    'this is the case that was being offered and then refused');
  assert.equal(checkinOpen(week({ ...past, checkin_hard_deadline: false })), true,
    'a soft deadline keeps accepting, which is the whole point of it');
});

test('a week switched off is closed whatever its dates say', () => {
  assert.equal(checkinOpen(week({ checkin_enabled: false })), false);
});

test('the boundaries are inclusive at both ends', () => {
  const now = Date.now();
  assert.equal(checkinOpen({ ...week(), checkin_release_at: new Date(now).toISOString() }, now), true);
  assert.equal(checkinOpen({ ...week(), checkin_due_at: new Date(now).toISOString() }, now), true);
  assert.equal(checkinOpen({ ...week(), checkin_due_at: new Date(now - 1).toISOString() }, now), false);
});

test('nothing missing counts as open', () => {
  assert.equal(checkinOpen(null), false);
  assert.equal(checkinOpen(undefined), false);
});

test('the SQL form asks the same three questions as the predicate', () => {
  const sql = checkinOpenSql('w');
  for (const column of ['w.checkin_enabled', 'w.checkin_release_at', 'w.checkin_due_at', 'w.checkin_hard_deadline']) {
    assert.ok(sql.includes(column), `${column} is missing from the SQL form`);
  }
  // Unaliased, for the query that selects straight from weeks.
  const bare = checkinOpenSql();
  assert.ok(bare.includes('checkin_due_at') && !bare.includes('.checkin_due_at'));
});

/* The two places that decide this must both go through the shared rule. A copy
   made in either would be free to drift again, which is exactly what happened. */
test('both ends of the journey use the shared rule and not their own', () => {
  const routes = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');

  assert.match(routes, /checkin_available/, 'the student still has to be told');
  assert.match(routes, /\$\{checkinOpenSql\(\)\} checkin_available/,
    'what the student is offered must come from the shared rule');
  assert.match(routes, /if \(!checkinOpen\(week\)\)/,
    'what the server accepts must come from the same rule');

  /* The specific comparison that used to live in the submit route, written out
     by hand. If it comes back, the two can disagree again. */
  assert.doesNotMatch(routes, /checkin_hard_deadline !== false && new Date\(week\.checkin_due_at\)/,
    'the submit route has grown its own copy of the deadline rule again');
  assert.doesNotMatch(routes, /checkin_release_at<=now\(\) checkin_available/,
    'the bootstrap has grown its own copy of the availability rule again');
});

/* The journey itself, against a real database.
   ------------------------------------------------------------------
   The rules above can agree with each other and still leave a submission that
   nobody ever sees, so this walks the whole way: a student hands work in, and
   the teacher's tracker has it. That is the promise, and it is worth asserting
   rather than assuming. */

const dbTest = { skip: process.env.RUN_DB_TESTS !== '1' };

test('a submitted check-in reaches the teacher’s tracker', dbTest, async () => {
  const { query, one } = await import('../src/db.js');
  const stamp = `${Date.now()}`;

  const klass = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time,timezone)
     VALUES ('Journey test',1,'19:00','Europe/Dublin') RETURNING *`);
  const student = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('student','Journey',$1,'x') RETURNING *`,
    [`journey-${stamp}@test.local`]);
  await query('INSERT INTO class_students(class_id,student_id) VALUES ($1,$2)', [klass.id, student.id]);

  const week = await one(
    `INSERT INTO weeks(class_id,week_start,checkin_release_at,checkin_due_at,checkin_enabled)
     VALUES ($1,'2026-09-07', now() - interval '1 hour', now() + interval '2 days', true) RETURNING *`,
    [klass.id]);

  try {
    // Open, so it may be offered and must be accepted.
    assert.equal(checkinOpen(week), true);

    await query(
      `INSERT INTO checkins(week_id,student_id,status,answers,submitted_at)
       VALUES ($1,$2,'submitted','{}'::jsonb, now())`, [week.id, student.id]);

    /* Exactly what the tracker asks: the class's weeks, its active students, and
       the check-ins joining the two. A submission that does not survive this
       join is one the teacher never sees. */
    const weeks = await query('SELECT id FROM weeks WHERE class_id=$1', [klass.id]);
    const students = await query(
      `SELECT u.id FROM users u JOIN class_students cs ON cs.student_id=u.id
       WHERE cs.class_id=$1 AND cs.active=true AND u.active=true`, [klass.id]);
    const seen = await query(
      `SELECT * FROM checkins WHERE week_id=ANY($1::uuid[]) AND student_id=ANY($2::uuid[])`,
      [weeks.rows.map((row) => row.id), students.rows.map((row) => row.id)]);

    assert.equal(students.rows.length, 1, 'the student must be listed on the tracker at all');
    assert.equal(seen.rowCount, 1, 'the submitted check-in must reach the tracker');
    assert.equal(seen.rows[0].status, 'submitted');

    /* A withdrawn student's work must still be visible: they handed it in, and
       hiding it would lose work that was really done. */
    await query('UPDATE users SET withdrawn_at=now() WHERE id=$1', [student.id]);
    const afterWithdrawal = await query(
      `SELECT u.id FROM users u JOIN class_students cs ON cs.student_id=u.id
       WHERE cs.class_id=$1 AND cs.active=true AND u.active=true`, [klass.id]);
    assert.equal(afterWithdrawal.rowCount, 1, 'withdrawing must not hide work already handed in');
  } finally {
    await query('DELETE FROM classes WHERE id=$1', [klass.id]);
    await query('DELETE FROM users WHERE id=$1', [student.id]);
  }
});
