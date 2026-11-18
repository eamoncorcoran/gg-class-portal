import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* A listening or reading comprehension set as homework is marked against the
   marking scheme and handed straight back.
   ------------------------------------------------------------------
   It used to be marked in the student's browser, then held as "submitted" while
   a draft of Irish corrections was written for the teacher. That draft corrected
   every slip in every short answer, which is not how the paper is marked: the
   scheme gives the mark for meaning. Now the server marks it from what was
   typed and returns it in the same request, and nothing is drafted. */

const { markable, allMarkable, summary } = await import('../src/pqhomework.js');
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const student = read('../src/routes/student.js');
const logic = read('../src/pqhomework.js');

test('the scheme can mark a listening and a reading comprehension, not a composition or a poem', () => {
  assert.equal(markable('aural-fogra-announcement-2026-announcement-1'), true);
  assert.equal(markable('aural-comhra-conversation-2025-conversation-1'), true);
  assert.equal(markable('reading-comprehension-2026A'), true);
  assert.equal(markable('biology.h.2024.q3'), true);
  assert.equal(markable('write-2026-essay'), false);
  assert.equal(markable('poetry-geibheann-2025'), false);
  assert.equal(allMarkable(['aural-fogra-announcement-2026-announcement-1', 'reading-comprehension-2026A']), true);
  assert.equal(allMarkable(['reading-comprehension-2026A', 'write-2026-essay']), false, 'one written question keeps the homework with the teacher');
  assert.equal(allMarkable([]), false);
});

test('homework the scheme can mark gets no corrections draft, and is returned with its marks', () => {
  const submit = student.slice(student.indexOf("router.post('/assignments/:id/submit'"), student.indexOf("router.post('/homework/:id/read-feedback'"));
  assert.match(submit, /const markedByScheme = allMarkable\(assignment\.pq_ids\);/);
  assert.match(submit, /const draftsHomework = \(drafting\.corrections \|\| drafting\.generalFeedback\) && !markedByScheme;/);
  assert.match(submit, /row = await returnMarked\(\{ submissionId: row\.id, answers: typed, marks, seen: true, actorId: req\.user\.id \}\);/);
  const back = logic.slice(logic.indexOf('export async function returnMarked'), logic.indexOf('export async function returnWaitingHomework'));
  assert.match(back, /status='returned', feedback_state='returned', feedback_returned_at=now\(\)/);
  assert.match(back, /ai_corrections=NULL, ai_general_feedback=NULL,/, 'a strict draft left from before is removed');
  assert.match(back, /teacher_score=\$4, teacher_max=\$5/);
});

test('the marks are the server\'s, made from what was typed: marks sent by the browser are not kept', () => {
  const submit = student.slice(student.indexOf("router.post('/assignments/:id/submit'"), student.indexOf("router.post('/homework/:id/read-feedback'"));
  assert.match(submit, /let kept = \{ answers: typed, results: \{\}, got: 0, total: 0 \};/);
  assert.ok(!/only\(sent\.results\)|sent\.got|sent\.total/.test(submit), 'nothing of the browser\'s marks reaches the row');
  assert.match(submit, /const marks = await markPastQuestions\(pastQuestions, typed\);/);
  assert.match(logic, /askPastQuestions\('\/api\/check', \{ id, answers: answers\?\.\[id\] \|\| \{\} \}\)/);
  // A mark can never be more than the space is worth, whatever the marker says.
  assert.match(logic, /awarded: Math\.min\(whole\(result\.awarded\), max\),/);
  // The page no longer marks at hand-in.
  const page = read('../web/src/pages/student/pq-homework-page.tsx');
  assert.ok(!/checkQuestion/.test(page));
});

test('the marker failing is not a failed hand-in, and what is waiting is marked later', () => {
  const submit = student.slice(student.indexOf("router.post('/assignments/:id/submit'"), student.indexOf("router.post('/homework/:id/read-feedback'"));
  // What was typed is saved before the marker is asked.
  assert.ok(submit.indexOf("await query('UPDATE homework_submissions SET pq_result=$1::jsonb WHERE id=$2', [JSON.stringify(kept), row.id]);") < submit.indexOf('await markPastQuestions(pastQuestions, typed)'));
  assert.match(submit, /console\.error\('Past question marking failed at hand-in', row\.id, error\.message\);/);
  const sweep = logic.slice(logic.indexOf('export async function returnWaitingHomework'));
  assert.match(sweep, /WHERE hs\.status='submitted' AND cardinality\(a\.pq_ids\) > 0 AND a\.status <> 'archived'/);
  assert.match(sweep, /if \(!allMarkable\(row\.pq_ids\)\) continue;/);
  assert.match(read('../server.js'), /setInterval\(sweepHomework, 15 \* 60 \* 1000\)/);
});

test('the marker gives the mark for meaning, and the benefit of the doubt', () => {
  const rules = read('../pq/server.py');
  assert.match(rules, /spelling, grammar and mutation \\\nslips are underlined by the examiner but never cost marks/);
  assert.match(rules, /the candidate gets the benefit of the doubt and the mark\./);
  assert.match(summary({ got: 14, total: 18 }), /^Marked against the official marking scheme: 14 of 18 marks\./);
  assert.ok(!summary({ got: 1, total: 2 }).includes('—'));
});

test('a past paper homework cannot be handed in as loose text through the old form', () => {
  const submit = student.slice(student.indexOf("router.post('/assignments/:id/submit'"), student.indexOf("router.post('/homework/:id/read-feedback'"));
  const guard = submit.indexOf('if (allMarkable(assignment.pq_ids)) {');
  assert.ok(guard > -1 && guard < submit.indexOf('INSERT INTO homework_submissions('), 'turned away before anything is saved');
  assert.match(submit, /This homework is done on the past paper itself\. Open it at \$\{config\.appUrl\}\/hw\/\$\{assignment\.id\}/);
});
