import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Taking a student off a class, and deleting them, are not the same act.
   ------------------------------------------------------------------
   There was only ever one control here — a dropdown that moved a student from
   one class to another — so there was no way to express either of the two things
   an administrator actually needs: "not in this class" and "should not be here
   at all". These hold the two apart, because collapsing them is the failure that
   costs something: a student who simply changed group should not lose a year of
   submitted work.

   The structural checks come first and run everywhere. The journey below needs a
   database. */

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('the reversible removal and the destructive one are separate routes', () => {
  assert.match(admin, /router\.post\('\/students\/:id\/remove-from-class'/,
    'there must be a way to take somebody off a class without deleting them');
  assert.match(admin, /router\.delete\('\/students\/:id'/,
    'there must be a way to delete a student');
  assert.match(admin, /router\.get\('\/students\/:id\/impact'/,
    'deleting must be able to say what it destroys before it does it');
});

test('taking a student off a class does not touch their work', () => {
  const route = admin.slice(admin.indexOf("router.post('/students/:id/remove-from-class'"));
  const body = route.slice(0, route.indexOf('}));'));

  assert.match(body, /UPDATE class_students SET active=false/,
    'the enrolment is what ends; nothing else should');
  /* The whole point of this route is that it is the safe one. If it ever learns
     to delete, the interface is offering a choice that is not a choice. */
  assert.doesNotMatch(body, /DELETE FROM (users|checkins|homework_submissions|attendance)/,
    'the safe removal has grown the ability to destroy work');
});

test('deleting refuses until the amount of work is named back', () => {
  const route = admin.slice(admin.indexOf("router.delete('/students/:id'"));
  const body = route.slice(0, route.indexOf('\n}));'));

  assert.match(body, /confirmWork/,
    'deletion must be confirmed against a count, not just clicked');
  assert.match(body, /counts\.work > 0 && confirmed !== counts\.work/,
    'the confirmation must match the count exactly, not merely be present');
  assert.match(body, /res\.status\(409\)/, 'an unconfirmed delete must be refused');

  /* Uploaded files are not in the database, so the cascade cannot reach them.
     Without this they stay on the disk forever with nothing pointing at them. */
  assert.match(body, /homework_files/, 'the files on disk have to be found before the rows go');
  assert.match(body, /fs\.unlink/, 'and actually removed');
});

test('the interface confirms the same number the server demands', () => {
  assert.match(app, /confirmWork=\$\{work\}/,
    'the count sent must be the count shown, or the dialog is confirming something else');
  assert.match(app, /students\/\$\{id\}\/impact/, 'the dialog must ask what will be lost');
  assert.match(app, /data-remove-student/, 'and there must be something to press');
});

/* A student in no class must be able to say so. The dropdown listed only real
   classes, so somebody enrolled in none of them displayed as sitting in
   whichever class happened to be first — the browser selects the first option
   when nothing matches. It read as fact and was not. */
test('the class dropdown can say “not in a class”', () => {
  assert.match(app, /<option value="" \$\{student\.class_id \? '' : 'selected'\}>Not in a class<\/option>/,
    'a student with no class must not appear to be in the first one');
});

/* The dialog said "deleted cleanly" while displaying six board posts directly
   above the sentence. Both came from the same screen and only one was true. The
   count that gates the delete is submitted work, deliberately — but the sentence
   describing what survives has to account for everything else as well. */
test('nothing is called a clean deletion while something is being deleted', () => {
  assert.match(app, /function deleteWarning\(/,
    'the warning has to be worked out rather than assumed');
  const fn = app.slice(app.indexOf('function deleteWarning('));
  const body = fn.slice(0, fn.indexOf('\n}'));

  assert.match(body, /impact\.posts \+ impact\.comments \+ impact\.notes \+ impact\.attendance/,
    'the reassurance must consider what is lost besides submitted work');
  /* The claim of cleanliness has to sit behind that check, not before it. */
  const claim = body.indexOf('deleted cleanly');
  const guard = body.indexOf('if (!alsoLost)');
  assert.ok(guard !== -1 && guard < claim,
    'the clean-deletion claim must be guarded by there actually being nothing else');
});

const dbTest = { skip: process.env.RUN_DB_TESTS !== '1' };

test('off the class, but the work survives; deleted, and nothing does', dbTest, async () => {
  const { query, one } = await import('../src/db.js');
  const stamp = `${Date.now()}`;

  const klass = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time,timezone)
     VALUES ('Removal test',1,'19:00','Europe/Dublin') RETURNING *`);
  const student = await one(
    `INSERT INTO users(role,name,email,password_hash) VALUES ('student','Removal',$1,'x') RETURNING *`,
    [`removal-${stamp}@test.local`]);
  await query('INSERT INTO class_students(class_id,student_id) VALUES ($1,$2)', [klass.id, student.id]);

  const week = await one(
    `INSERT INTO weeks(class_id,week_start,checkin_release_at,checkin_due_at)
     VALUES ($1,'2026-09-07', now() - interval '1 day', now() + interval '1 day') RETURNING *`,
    [klass.id]);
  await query(
    `INSERT INTO checkins(week_id,student_id,status,answers,submitted_at)
     VALUES ($1,$2,'submitted','{}'::jsonb, now())`, [week.id, student.id]);

  try {
    // Taken off the class, exactly as the route does it.
    await query('UPDATE class_students SET active=false WHERE student_id=$1 AND class_id=$2',
      [student.id, klass.id]);

    const roster = await query(
      `SELECT u.id FROM users u JOIN class_students cs ON cs.student_id=u.id
       WHERE cs.class_id=$1 AND cs.active=true`, [klass.id]);
    assert.equal(roster.rowCount, 0, 'they must come off the register');

    const stillThere = await query('SELECT id FROM users WHERE id=$1', [student.id]);
    assert.equal(stillThere.rowCount, 1, 'but the account must survive');
    const work = await query('SELECT id FROM checkins WHERE student_id=$1', [student.id]);
    assert.equal(work.rowCount, 1, 'and so must the work they handed in');

    /* The count the delete route guards on, computed the same way. It is the
       number the administrator has to confirm, so it has to be right. */
    const counts = await one(
      `SELECT (SELECT count(*)::int FROM checkins WHERE student_id=$1 AND status<>'draft')
            + (SELECT count(*)::int FROM homework_submissions WHERE student_id=$1 AND status<>'draft') work`,
      [student.id]);
    assert.equal(counts.work, 1, 'the warning must count work that is off a class too');

    // Deleted. Everything that references them has to go with them, by cascade.
    await query('DELETE FROM users WHERE id=$1', [student.id]);
    const after = await query('SELECT id FROM checkins WHERE student_id=$1', [student.id]);
    assert.equal(after.rowCount, 0, 'a deleted student must not leave rows behind');
    const enrolment = await query('SELECT class_id FROM class_students WHERE student_id=$1', [student.id]);
    assert.equal(enrolment.rowCount, 0, 'including the enrolment itself');
  } finally {
    await query('DELETE FROM classes WHERE id=$1', [klass.id]);
    await query('DELETE FROM users WHERE id=$1', [student.id]);
  }
});
