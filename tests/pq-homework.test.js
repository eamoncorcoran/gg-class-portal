import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* A past exam question set as homework.
   ------------------------------------------------------------------
   The teacher sets a past question (a listening piece, a reading
   comprehension) for a class with a deadline. It has to behave as homework in
   every way that matters: on the calendar, in the reminders, in the review. And
   only the teacher can set it, or see that it has been set. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const admin = read('../src/routes/admin.js');
const student = read('../src/routes/student.js');
const migration = read('../migrations/059_past_question_homework.sql');
const setHomework = read('../web/src/components/app/set-homework.tsx');
const data = read('../web/src/lib/pq-homework.ts');
const page = read('../web/src/pages/student/pq-homework-page.tsx');
const card = read('../web/src/components/app/question-card.tsx');

test('it is an ordinary assignment that also names its past questions', () => {
  assert.match(migration, /ALTER TABLE assignments ADD COLUMN IF NOT EXISTS pq_ids text\[\] NOT NULL DEFAULT '\{\}'/);
  assert.match(migration, /ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS pq_result jsonb/);
  // Made by the same route as every other assignment, so the calendar, the reminders and the review need no telling.
  const create = admin.slice(admin.indexOf("router.post('/assignments', asyncRoute"), admin.indexOf("router.get('/pq-homework'"));
  assert.match(create, /pqIds: z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\(160\)\.regex\(\/\^\[\\w\.:-\]\+\$\/\)\)\.max\(12\)\.default\(\[\]\)/);
  assert.match(create, /listening_text_shown,pq_ids\)/);
  assert.match(create, /a\.pqIds\.length !== a\.questions\.length/, 'one question for each past question, so each has its own answer in the review');
});

test('only a teacher can set it, add to it, or see what has been set', () => {
  // Everything in this file sits behind the teacher's sign-in.
  assert.ok(admin.indexOf('router.use(requireAdmin);') < admin.indexOf("router.post('/assignments', asyncRoute"));
  assert.ok(admin.indexOf('router.use(requireAdmin);') < admin.indexOf("router.get('/pq-homework'"));
  assert.ok(admin.indexOf('router.use(requireAdmin);') < admin.indexOf("router.post('/assignments/:id/pq'"));
  // The student's routes have no way to make an assignment or to list what has been set.
  assert.ok(!/pq-homework/.test(student));
  assert.ok(!/INSERT INTO assignments\(/.test(student));
  // And the page draws neither the button nor the tags for anybody else.
  assert.match(setHomework, /if \(me\?\.role !== "admin"\) return null;/);
  assert.match(data, /return teacher \? v : undefined;/);
  assert.match(data, /if \(teacher && !state && !pending\) loadPqHomework\(\)/);
  assert.match(card, /\{!inExam && <SetHomeworkButton q=\{q\} \/>\}/);
});

test('the teacher sees which questions were set, for whom, and how many handed in', () => {
  const list = admin.slice(admin.indexOf("router.get('/pq-homework'"), admin.indexOf("router.post('/assignments/:id/pq'"));
  assert.match(list, /CROSS JOIN LATERAL unnest\(a\.pq_ids\) AS pq\(pq_id\)/);
  assert.match(list, /hs\.status IN \('submitted','returned'\)\) done/);
  assert.match(list, /a\.status <> 'archived'/);
  assert.match(setHomework, /Homework · \{s\.className\} · \{past \? "was due" : "due"\} \{dueLabel\(s\.deadlineAt\)\} · \{s\.done\} of \{s\.students\} done/);
  assert.match(card, /\{!inExam && <HomeworkTags q=\{q\} \/>\}/);
});

test('a question can join homework already set, but not once somebody has handed it in', () => {
  const add = admin.slice(admin.indexOf("router.post('/assignments/:id/pq'"), admin.indexOf('/* A term of homework in one spreadsheet.'));
  assert.match(add, /FOR UPDATE/);
  assert.match(add, /status IN \('submitted','returned'\) LIMIT 1/);
  assert.match(add, /Somebody has already handed this homework in/);
  assert.match(add, /array_append\(pq_ids, \$2\)/);
});

test('the student does it on the paper, and it is handed in as their homework', () => {
  // Through the same submit as any homework, so late marking, drafting and the review all apply.
  assert.match(page, /api\(`\/api\/student\/assignments\/\$\{id\}\/submit`, \{/);
  assert.match(page, /json: \{ answers: qs\.map\(\(q\) => transcript\(q, mine\[q\.id\] \|\| \{\}, checks\[q\.id\]\?\.by \|\| \{\}\)\), pqResult \}/);
  // Nothing is marked or shown until it is finished.
  assert.match(page, /<QuestionCard q=\{q\} exam=\{\{ running: !handedIn \}\} \/>/);
  // The server keeps only what belongs to the questions the homework was set from.
  const submit = student.slice(student.indexOf("router.post('/assignments/:id/submit'"), student.indexOf("router.post('/homework/:id/read-feedback'"));
  assert.match(submit, /const only = \(record\) => Object\.fromEntries\(pastQuestions\.filter\(\(id\) => record\[id\]\)\.map\(\(id\) => \[id, record\[id\]\]\)\);/);
  assert.match(submit, /UPDATE homework_submissions SET pq_result=\$1::jsonb WHERE id=\$2/);
});

test('no em dashes in anything the teacher or a student reads', () => {
  for (const [name, text] of [['dialog', setHomework], ['page', page], ['data', data]]) {
    assert.ok(!text.includes('—'), `${name} must not contain an em dash`);
  }
});
