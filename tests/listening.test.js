import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DIALECTS, DIALECT_KEYS, hashText, providerName } from '../src/tts.js';

/* Listening activities.
   ------------------------------------------------------------------
   A story read aloud in a chosen dialect, comprehension questions under it, and
   marking that happens the moment the work is handed in but reaches nobody
   until the teacher has read it.

   Almost everything guarded here is about what does not leave the server. A
   student who can read the expected answers, or see their score before the
   teacher has looked at it, has an exercise that is worth nothing. */

const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const media = fs.readFileSync(new URL('../src/routes/media.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../migrations/045_listening_activities.sql', import.meta.url), 'utf8');

test('the dialects offered are the ones ABAIR speaks', () => {
  assert.deepEqual(DIALECT_KEYS, ['connacht', 'munster', 'ulster']);
  for (const dialect of DIALECTS) {
    assert.ok(dialect.label && dialect.hint, `${dialect.key} needs a label and a hint`);
  }
});

test('no speech key means a clear refusal, not a broken button', () => {
  const tts = fs.readFileSync(new URL('../src/tts.js', import.meta.url), 'utf8');
  assert.match(tts, /providerName\(\) === 'none'/);
  assert.match(tts, /Set ABAIR_API_KEY/);
  assert.match(tts, /status: 503/);
  // And the screen says so before the button is pressed rather than after.
  assert.match(app, /No speech service is set up/);
  assert.equal(providerName(), process.env.ABAIR_API_KEY ? 'abair' : 'none');
});

test('a story edited after it was read aloud is marked as out of step', () => {
  assert.notEqual(hashText('Bhí fear ann.'), hashText('Bhí bean ann.'));
  assert.equal(hashText('Bhí fear ann.'), hashText('Bhí fear ann.'));
  assert.match(admin, /stale: Boolean\(row && row\.state === 'ready' && row\.text_hash !== current\)/);
  assert.match(app, /Made from an older version of the story/);
});

test('one dialect failing does not take the others with it', () => {
  const body = admin.slice(admin.indexOf("router.post('/assignments/:id/listening/render'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  assert.match(inner, /for \(const dialect of parsed\.data\.dialects\)/);
  assert.match(inner, /state='failed', error=\$1/);
  assert.match(inner, /results\.push\(\{ dialect, state: 'failed'/);
});

test('the expected answers never leave the server on a student request', () => {
  /* Both student queries build their questions from a named list of columns
     rather than selecting the row, which is what keeps the answer sheet out of
     a payload that is otherwise the whole assignment. */
  const built = student.match(/'id',q\.id,'position',q\.position,'prompt',q\.prompt,'imageUrl',q\.image_url,'required',q\.required/g) || [];
  assert.ok(built.length >= 1, 'the student question list has to be built column by column');
  assert.doesNotMatch(student, /q\.expected_answer/, 'no student query may select it');
  assert.doesNotMatch(student, /SELECT q\.\*/);
  // The marking reads them in a query of its own, on the submit path only.
  assert.match(student, /SELECT position, prompt, expected_answer, marks FROM assignment_questions/);
});

test('nothing the machine produced reaches a student, ever', () => {
  const body = student.slice(student.indexOf('const FEEDBACK_COLUMNS'));
  const list = body.slice(0, body.indexOf('];'));
  for (const column of ['ai_feedback', 'ai_corrections', 'ai_general_feedback',
    'ai_marks', 'ai_score', 'ai_max']) {
    assert.ok(list.includes(`'${column}'`), `${column} has to be stripped`);
  }
  assert.match(body, /if \(column\.startsWith\('ai_'\)\) delete out\[column\]/,
    'the ai_ columns go even once the feedback has been returned');
});

test("a teacher's draft is held back as tightly as the machine's", () => {
  /* This was the hole. The ai_ columns were stripped and the teacher_ ones were
     not, and the teacher_ ones are seeded with the model's draft the moment the
     work is submitted. So a student reloading the page a second after handing up
     was sent the machine's corrections, its general feedback, and for a
     listening comprehension its marks and their score. */
  const body = student.slice(student.indexOf('const FEEDBACK_COLUMNS'));
  const list = body.slice(0, body.indexOf('];'));
  for (const column of ['teacher_feedback', 'teacher_corrections', 'teacher_general_feedback',
    'teacher_marks', 'teacher_score', 'teacher_max', 'teacher_audio_path']) {
    assert.ok(list.includes(`'${column}'`), `${column} has to be held until it is returned`);
  }
  assert.match(body, /if \(!returned\) for \(const column of FEEDBACK_COLUMNS\) delete out\[column\]/);
});

test('a listening comprehension is marked on submission, not on request', () => {
  const body = student.slice(student.indexOf("router.post('/assignments/:id/submit'"));
  assert.match(body, /if \(assignment\.kind === 'listening'\)/);
  assert.match(body, /markListening\(/);
  /* Marking failing is not a failed submission: the work is saved either way and
     the teacher marks it themselves, which is what they would be doing if none
     of this existed. */
  assert.match(body, /console\.error\('Listening marking failed', error\)/);
});

test('the teacher can change a mark before it goes out', () => {
  assert.match(admin, /marks: z\.array\(z\.object\(\{/);
  assert.match(admin, /UPDATE homework_submissions SET teacher_marks=\$1::jsonb, teacher_score=\$2, teacher_max=\$3/);
  assert.match(app, /function marksFromScreen\(\)/);
  assert.match(app, /marks: marksFromScreen\(\)/);
  // And a mark above what the question is worth cannot be released.
  assert.match(admin, /Math\.min\(mark\.awarded, mark\.available\)/);
});

test('a recording is behind the same three tests the assignment is', () => {
  const body = media.slice(media.indexOf("router.get('/listening/:assignmentId/:dialect'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  assert.match(inner, /row\.status === 'published'/);
  assert.match(inner, /!row\.archived_at/);
  assert.match(inner, /new Date\(row\.visible_at\)\.getTime\(\) <= Date\.now\(\)/);
  assert.match(inner, /FROM class_students WHERE class_id=\$1 AND student_id=\$2 AND active=true/);
  // Scrubbing back over a sentence is the exercise, so ranges are supported.
  assert.match(inner, /Accept-Ranges/);
  assert.match(inner, /Content-Range/);
});

test('the player survives moving between questions', () => {
  /* The rolling form rebuilds its body on every step. Without this the story
     would start again from the beginning at question two, which makes a
     listening comprehension impossible to answer. */
  assert.match(app, /function bindListeningPanel\(\)/);
  assert.match(app, /audio\.currentTime = Math\.min\(listen\.at/);
  assert.match(app, /listen\.at = audio\.currentTime/);
  // Drawn on every step rather than only the first.
  assert.match(app, /<div class="rolling-stage">\$\{listeningPanel\(assignment, form\)\}/);
});

test('the transcript starts where the teacher set it and is the student\'s after that', () => {
  assert.match(app, /textShown: Boolean\(data\.assignment\.listening_text_shown\)/);
  assert.match(app, /id="listen-toggle-text"/);
  assert.match(app, /listen\.textShown = !listen\.textShown/);
  assert.match(migration, /listening_text_shown boolean NOT NULL DEFAULT false/,
    'listening first is the default, because reading it defeats the exercise');
});

test('a mark belongs to the assignment it was given for', () => {
  assert.match(migration, /ADD CONSTRAINT assignments_kind_check CHECK \(kind IN \('written', 'listening'\)\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS listening_audio_unique/);
  assert.match(migration, /ON DELETE CASCADE/);
});

/* A listening activity from the spreadsheet.
   ------------------------------------------------------------------
   The import is how a term gets built, so an activity that could only be made
   through the form would not get made. */

test('a row with a story in it is a listening activity', () => {
  /* No Kind column to remember. Pasting a story is the thing that makes it one,
     which is also how somebody describes it out loud. */
  assert.match(admin, /story: \['story', 'text', 'listening', 'listening text', 'passage', 'script'\]/);
  assert.match(admin, /const kind = kindText \? \(kindText\.startsWith\('listen'\) \? 'listening' : 'written'\)\s*\n\s*: \(story \? 'listening' : 'written'\)/);
});

test('the expected answers sit beside the questions in the sheet', () => {
  assert.match(admin, /function expectedFrom\(row\)/);
  assert.match(admin, /\^a\\s\*\(\\d\+\)\$\|\^answer\\s\*\(\\d\+\)\$\|\^expected\\s\*\(\\d\+\)\$/);
  assert.match(admin, /function marksFrom\(row\)/);
  /* Lined up against the questions rather than left ragged, so row three of the
     sheet and question three of the assignment are the same thing. */
  assert.match(admin, /expected: questions\.map\(\(_, index\) => expected\[index\] \|\| ''\)/);
  assert.match(admin, /marks: questions\.map\(\(_, index\) => Number\(marks\[index\]\) \|\| 1\)/);
});

test('a listening row with no expected answers is refused', () => {
  /* Marked against what the teacher wrote, so a row with nothing to mark
     against would come back as full marks for everybody. */
  /* The condition, not just the words. A guard rewritten to never fire still
     contains its own message, so matching the message proves nothing. */
  assert.match(admin, /const answered = expected\.filter\(Boolean\)\.length;/);
  assert.match(admin, /if \(!answered\) problems\.push\('no expected answers/);
  assert.match(admin, /else if \(answered < questions\.length\) \{/);
  assert.match(admin, /if \(!story\) problems\.push\('a listening activity needs a story/);
  assert.match(admin, /const bad = marks\.slice\(0, questions\.length\)\.find\(\(value\) => value && !\/\^\\d\+\$\/\.test\(value\)\);/);
  // And all of it only for a listening row.
  assert.match(admin, /if \(kind === 'listening'\) \{/);
});

test('an existing written sheet still imports unchanged', () => {
  /* The new columns are additions at the end. A sheet with Deadline, Title and
     Q1 and nothing else has no Story, so it is written, which is what it was
     before any of this existed. */
  const body = admin.slice(admin.indexOf('function readAssignmentCsv'));
  const inner = body.slice(0, body.indexOf('\n}\n'));
  assert.match(inner, /const kind = kindText/);
  assert.doesNotMatch(inner, /problems\.push\('no story'\)/,
    'a written row must never be asked for a story');
});

test('the template shows a listening row rather than describing one', () => {
  const body = admin.slice(admin.indexOf("router.get('/classes/:id/assignment-template'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  assert.match(inner, /Deadline,Title,Instructions,Opens,Deadline type,Story,Show text,Q1,Q2,Q3,A1,A2,A3,M1,M2,M3/);
  assert.match(inner, /Cluastuiscint/, 'a filled-in listening line is how the columns are learned');
});

test('a term of stories can be read aloud in one go', () => {
  const body = admin.slice(admin.indexOf("router.post('/classes/:id/listening/render-all'"));
  const inner = body.slice(0, body.indexOf('\n}));'));
  /* Running it again after adding one row must not re-read the other eleven. */
  assert.match(inner, /existing\?\.state === 'ready' && existing\.text_hash === hashText\(assignment\.listening_text\)/);
  assert.match(inner, /continue;/);
  assert.match(inner, /kind='listening'/);
  // Asked rather than done: thirty six trips to a speech service is a decision.
  assert.match(app, /function offerBulkRender\(classId, count\)/);
  assert.match(app, /if \(result\.listening\) offerBulkRender\(classId, result\.listening\)/);
});
