import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Students must never be shown — or sent — anything implying their feedback was
   drafted by a model. The interface hiding it is not enough on its own: the
   network tab is one keystroke away, so the fields have to be gone from the
   payload as well.

   These read the source rather than a live server so they run anywhere, and they
   fail loudly if somebody adds a student route that returns a raw row. */

const studentRoutes = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('every student response for a check-in or submission is sanitised', () => {
  /* Any `res.json` in the student routes that hands back a row from `checkins`
     or `homework_submissions` has to pass through forStudent first. Rather than
     parse the file, assert on the shape: no bare `res.json(row)` survives. */
  const bare = studentRoutes.match(/res\.json\(row\)/g) || [];
  assert.equal(bare.length, 0, 'a student route returns a raw row: wrap it in forStudent');

  const spread = studentRoutes.match(/res\.json\(\{ \.\.\.row/g) || [];
  assert.equal(spread.length, 0, 'a student route spreads a raw row: wrap it in forStudent');
});

test('forStudent removes the drafting columns and the ai_drafted state', async () => {
  /* Exercised directly by lifting the function out of the module, which avoids
     needing a database to prove the shape of what it returns. */
  const source = studentRoutes.slice(
    studentRoutes.indexOf('function forStudent(row)'),
    studentRoutes.indexOf('const allForStudent'),
  );
  assert.ok(source.length > 0, 'forStudent is no longer where this test expects it');
  const forStudent = new Function(`${source}; return forStudent;`)();

  const row = forStudent({
    id: 'x',
    status: 'returned',
    teacher_feedback: 'Well done.',
    ai_feedback: 'model text',
    ai_corrections: 'model corrections',
    ai_general_feedback: 'model general',
    feedback_state: 'ai_drafted',
  });

  assert.equal('ai_feedback' in row, false);
  assert.equal('ai_corrections' in row, false);
  assert.equal('ai_general_feedback' in row, false);
  assert.equal(row.feedback_state, 'pending');
  // What the teacher actually approved still goes through untouched.
  assert.equal(row.teacher_feedback, 'Well done.');

  assert.equal(forStudent({ feedback_state: 'returned' }).feedback_state, 'returned');
  assert.equal(forStudent({ feedback_state: 'generating' }).feedback_state, 'pending');
  assert.equal(forStudent({ feedback_state: 'failed' }).feedback_state, 'pending');
  assert.equal(forStudent(null), null);
});

test('the dictate button cannot render for a student', () => {
  const start = app.indexOf('function dictateButton(');
  assert.ok(start !== -1, 'dictateButton is gone');
  const body = app.slice(start, start + 400);
  assert.match(
    body,
    /state\.user\?\.role !== 'admin'\) return ''/,
    'dictateButton must refuse to render for anybody who is not an administrator',
  );
});

/** One top-level function body, bounded by the next top-level declaration. */
function functionBody(name) {
  const start = [`\nfunction ${name}(`, `\nasync function ${name}(`]
    .map((marker) => app.indexOf(marker))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  if (start === undefined) return null;
  const ends = ['\nfunction ', '\nasync function ', '\nconst ']
    .map((marker) => app.indexOf(marker, start + 1))
    .filter((index) => index > start);
  return app.slice(start, ends.length ? Math.min(...ends) : app.length);
}

test('no student-facing copy mentions AI or drafting', () => {
  // Every function that renders something only a student sees.
  const names = [
    'studentCommunityView', 'feedEmpty', 'studentHero', 'studentGoals',
    'openWithdrawalForm', 'studentCalendarView', 'studentTrackerView',
    'showCheckinFeedback', 'showHomeworkFeedback', 'celebrationScreen',
    'avatarForm', 'feedPost', 'feedComment',
  ];
  const missing = names.filter((name) => !functionBody(name));
  assert.deepEqual(missing, [], `these student views were renamed or removed: ${missing.join(', ')}`);
  for (const name of names) {
    assert.doesNotMatch(functionBody(name), /\bAI\b|artificial intelligence|OpenAI|auto-?generated|dictat/i,
      `${name} renders something to a student that mentions AI or dictation`);
  }
});

test('the student hero copy is present and says nothing about drafting', () => {
  const start = app.indexOf('const STUDENT_HERO_COPY');
  assert.ok(start !== -1, 'STUDENT_HERO_COPY is gone');
  const block = app.slice(start, app.indexOf('};', start));
  assert.doesNotMatch(block, /\bAI\b|draft/i);
});

/* The drafted reply on the class board is the same kind of working note as the
   homework drafts: what a model proposed before the teacher read it. A student
   must not receive it, and must not be able to tell one existed. */

test('the drafted board reply is stripped from what a student receives', async () => {
  const community = fs.readFileSync(new URL('../src/community.js', import.meta.url), 'utf8');
  const start = community.indexOf('export function forStudentView(thread)');
  assert.ok(start !== -1, 'forStudentView is no longer where this test expects it');
  const source = community.slice(start, community.indexOf('/** One post with its comments', start));
  const forStudentView = new Function(`${source.replace('export ', '')}; return forStudentView;`)();

  const stripped = forStudentView({
    id: 'x', title: 'A question', body: 'Anyone?',
    ai_draft: 'model text', ai_draft_state: 'drafted', ai_drafted_at: '2026-01-01',
  });
  assert.equal('ai_draft' in stripped, false);
  assert.equal('ai_draft_state' in stripped, false);
  assert.equal('ai_drafted_at' in stripped, false);
  assert.equal(stripped.title, 'A question');
  assert.equal(forStudentView(null), null);
});

test('every student board response passes through the stripper', () => {
  /* Both the feed and a single post. A route that returns a raw thread would
     hand a student the draft. */
  const start = studentRoutes.indexOf("router.get('/community'");
  const end = studentRoutes.indexOf("router.post('/community/threads'");
  const section = studentRoutes.slice(start, end);
  assert.match(section, /threads: rawThreads\.map\(forStudentView\)/);
  assert.match(section, /res\.json\(forStudentView\(thread\)\)/);
});

test('the reply recorder and the draft never render for a student', () => {
  // Both are inside the admin branch of the thread drawer.
  const start = app.indexOf('function renderThreadDrawer()');
  const end = app.indexOf('function openScheduleModal', start);
  const drawer = app.slice(start, end);

  assert.match(drawer, /\$\{admin \? `<div class="rd" id="reply-draft"/,
    'the draft slot must be behind the admin check');
  assert.match(drawer, /\$\{admin \? replyRecorder\(\) : ''\}/,
    'the recorder must be behind the admin check');
  assert.match(drawer, /if \(admin\) loadReplyDraft\(thread\.id\)/,
    'drafting must only be requested for an administrator');
});
