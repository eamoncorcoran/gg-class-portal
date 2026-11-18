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
  // Through the same submit as any homework. Only what was typed is sent; the hub does the marking
  // (tests/pq-homework-marking.test.js).
  assert.match(page, /\(`\/api\/student\/assignments\/\$\{id\}\/submit`, \{/);
  assert.match(page, /json: \{ answers: qs\.map\(\(q\) => transcript\(q, mine\[q\.id\] \|\| \{\}\)\), pqResult \}/);
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

/* The top of a list of past questions.
   ------------------------------------------------------------------
   It used to pin three tall tabs and a bar of every year over the paper. The bar
   of years is three small tools now. The tabs are one bar, and they and the
   tools stay at the top of the screen while the page's own top bar scrolls away. */

test('a list of questions keeps its tabs and three small tools pinned, with no bar of years', () => {
  const parts = read('../web/src/components/app/page-parts.tsx');
  assert.match(parts, /export const Pinned = /);
  assert.match(parts.slice(parts.indexOf('export const Pinned')), /"sticky top-0 z-10 /);
  const groups = parts.slice(parts.indexOf('export const YearGroups'));
  assert.match(groups, /<Pinned className="mb-6">\s+\{head\}/, 'the tabs and the tools are pinned together');
  assert.ok(!/<JumpBar/.test(groups), 'the bar of years is gone from the list');
  assert.match(groups, /<Tool icon=\{ToolBookmark\} label=\{savedOnly \?/);
  assert.match(groups, /<Tool icon=\{ToolPrinter\} label="Choose questions to print"/);
  assert.match(groups, /<Tool icon=\{ToolFilter\} label="Filter by year"/);
  const topic = read('../web/src/pages/topic-page.tsx');
  assert.match(topic, /const stickyTabs = <Pinned className="mb-8">\{tabs\(\)\}<\/Pinned>;/, 'Lessons and Samples keep the tabs pinned too');
  assert.ok(!/Print all/.test(topic), 'Print all became Create exam');
  assert.match(topic, /"Create exam"/);
  // The page's top bar is pinned everywhere but here, where the tabs take its place.
  assert.match(read('../web/src/components/app/app-shell.tsx'), /pathname\.startsWith\("\/t\/"\) \? "relative" : "sticky top-0"/);
});

test('the buttons on a question are one height, and the two icon buttons one square', () => {
  const header = card.slice(card.indexOf('{printing && !inExam ? ('), card.indexOf('</header>', card.indexOf('{printing && !inExam ? (')));
  assert.ok(!/size="xs"/.test(header), 'no smaller button sits beside the others');
  assert.equal((header.match(/"w-10\.5/g) || []).length, 2, 'Save and Print are the same square');
  assert.match(read('../web/src/components/app/set-homework.tsx'), /<DuoButton color="secondary" size="sm" iconLeading=\{Calendar\}/);
});

test('print asks for more before it prints, and Add to exam waits for Create exam', () => {
  // In a list, a question's print button ticks it and opens the choosing bar rather than printing.
  assert.match(card, /onPress=\{\(\) => \(inExam \? printQuestions\(\[q\], false, true\) : startPrinting\(q\.id\)\)\}/);
  assert.match(card, /\{picked \? "Selected" : "Select"\}/);
  const tray = read('../web/src/components/app/print-tray.tsx');
  assert.match(tray, /Tick any others you want\./);
  assert.match(tray, /printQuestions\(list, getPick\(\)\.scheme, false\);/);
  assert.match(tray, /Select all/);
  // Add to exam is on no question until an exam is being put together.
  assert.match(card, /\{\(building \|\| examed\) && \(/);
  // Saving is the icon alone.
  assert.match(card, /iconLeading=\{Bookmark\}\s+ariaLabel=\{saved \? "Saved for revision\. Press to remove" : "Save for revision"\}/);
});

test('no line of capitals sits on top of a main heading', () => {
  for (const file of ['topic-page.tsx', 'home-page.tsx', 'subject-pages.tsx', 'questions-page.tsx', 'hub-home.tsx', 'courses-pages.tsx']) {
    const source = read(`../web/src/pages/${file}`);
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!/<h1[ >]/.test(line)) return;
      const above = lines.slice(Math.max(0, index - 2), index).join('\n');
      assert.ok(!/duo-label/.test(above), `${file}: a capital label sits above the heading on line ${index + 1}`);
    });
  }
});

test('a question\'s title is a title, and nothing sits under it', () => {
  // It was a link that opened the same question on a page of its own, over a line saying which page of the paper it came from.
  const header = card.slice(card.indexOf('<h2 id={`qt-${q.id}`}'), card.indexOf('{!inExam && <HomeworkTags q={q} />}'));
  assert.ok(!/<Link|href=/.test(header), 'the title does not link anywhere');
  assert.ok(!/State Examinations Commission|where\(q\)/.test(header));
  assert.match(header, /\{label\(q\)\}/);
});
