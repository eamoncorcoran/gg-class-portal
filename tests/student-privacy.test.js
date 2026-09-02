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
    'studentCommunityView', 'feedEmpty', 'studentHeader', 'studentGoals',
    'openWithdrawalForm', 'studentCalendarView', 'studentTrackerView',
    'showCheckinFeedback', 'showHomeworkFeedback', 'celebrationScreen',
    'avatarForm', 'feedPost', 'feedComment', 'checkinWindowNote', 'closedAssignmentNotice',
  ];
  const missing = names.filter((name) => !functionBody(name));
  assert.deepEqual(missing, [], `these student views were renamed or removed: ${missing.join(', ')}`);
  for (const name of names) {
    assert.doesNotMatch(functionBody(name), /\bAI\b|artificial intelligence|OpenAI|auto-?generated|dictat/i,
      `${name} renders something to a student that mentions AI or dictation`);
  }
});

test('the student page copy is present and says nothing about drafting', () => {
  const start = app.indexOf('const STUDENT_PAGE');
  assert.ok(start !== -1, 'STUDENT_PAGE is gone');
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

/* The suggested board reply is generated for the administrator and cached on the
   thread. It is written the moment a student posts, which means the row a
   student reads from is the same row it lives in — so the stripping matters more
   here than anywhere else. */
test('the draft endpoint is an admin route and has no student equivalent', () => {
  const adminRoutes = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
  assert.match(adminRoutes, /router\.post\('\/community\/thread\/:id\/draft'/,
    'the administrator must have a way to ask for a draft');
  /* Students do have draft routes — /checkins/:weekId/draft and
     /assignments/:id/draft save their own half-finished answers. That is a
     different sense of the word entirely. What must not exist is a student route
     that serves the *suggested reply*, or that touches the columns it lives in. */
  assert.doesNotMatch(studentRoutes, /community\/thread\/[^']*\/draft/,
    'no student route may serve the suggested board reply');
  /* ai_drafted is a different thing again: it is the feedback state a student's
     own submission moves into, and forStudent turns it back into "pending"
     before the student ever sees it. What is forbidden here is the board's
     ai_draft column itself. */
  assert.doesNotMatch(studentRoutes, /ai_draft(?![a-z])/,
    'no student route may read the board drafting columns');
  /* Student routes deliberately *generate* drafts — submitting a check-in or a
     piece of homework is what triggers one, so the teacher has it waiting rather
     than having to ask. The rule is not that a student route may not draft; it
     is that a student route may never hand one back. That is what forStudent and
     forStudentView are for, and what the tests above cover. */
  assert.match(studentRoutes, /draftCheckinFeedback/,
    'submitting a check-in should still start a draft');
  assert.match(studentRoutes, /forStudent\(/,
    'and everything returned to a student must go through the stripper');
});

test('drafting never blocks or fails a student posting', () => {
  /* The post is saved and answered first, and the draft is fired afterwards
     without being awaited. A missing key or a bad minute for the model must not
     be able to fail a student's post. */
  for (const marker of ['draftReplyFor({ threadId: row.id })', 'draftReplyFor({ threadId: thread.id, force: true })']) {
    const at = studentRoutes.indexOf(marker);
    assert.ok(at !== -1, `${marker} is no longer where this test expects it`);
    const after = studentRoutes.slice(at, at + 220);
    assert.match(after, /\.catch\(/, 'a drafting failure must be caught, not thrown');
  }
  // Fired after the response has already gone out.
  assert.ok(studentRoutes.indexOf('res.status(201).json(row);\n\n  /* Draft a suggested reply now')
    < studentRoutes.indexOf('draftReplyFor({ threadId: row.id })'),
    'the student must be answered before any drafting begins');
});

/* Functions called and never written fail silently inside a template literal:
   the screen stops being built where the call was, and what is left reads as a
   rough edge rather than a fault. studentProgress was called from three places
   and defined in none, so the goal strip vanished and no student ever saw the
   celebration after handing work in.

   Checked by name rather than by scanning every call: telling a missing function
   from a closure, a callback parameter or a promise handler needs a real parser,
   and a test that cries wolf gets ignored. These are the ones whose absence is
   invisible until a student hits them. */
test('the functions the student screens depend on are defined', () => {
  const NEEDED = [
    'studentProgress', 'studentGoals', 'celebrationScreen', 'celebrate',
    'studentHeader', 'studentTrackerView', 'studentCalendarView', 'studentCommunityView',
    'submitCheckin', 'submitHomework', 'autoGrow', 'studentMaps',
  ];
  const missing = NEEDED.filter((name) =>
    !new RegExp(`(?:^|\\n)(?:async )?function ${name}\\s*\\(`).test(app));
  assert.deepEqual(missing, [],
    `called by the student screens and never defined: ${missing.join(', ')}`);
});

/* Wording a student reads about their own class. */
test('the class banner says the hour in words and labels the passcode', () => {
  const banner = functionBody('nextClassBanner');
  assert.ok(banner, 'nextClassBanner is gone');
  assert.match(banner, /plainHour\(/, 'the hour should read as 7pm, not 19:00');
  assert.match(banner, /Irish/, '"Irish" rather than an abbreviation nobody reads');
  assert.doesNotMatch(banner, /timezoneAbbreviation/, 'IST means nothing to most people reading it');
  assert.match(banner, /Passcode: \$\{escapeHtml\(passcodeOnly/, 'the passcode should be labelled as one');
});

test('a note already saying "passcode" is not labelled twice', () => {
  const start = app.indexOf('function passcodeOnly(');
  assert.ok(start !== -1, 'passcodeOnly is gone');
  const passcodeOnly = new Function(`${app.slice(start, app.indexOf('\n}', start) + 2)}; return passcodeOnly;`)();

  // The field is free text and people write the word into it.
  assert.equal(passcodeOnly('Passcode 4821'), '4821');
  assert.equal(passcodeOnly('passcode: 4821'), '4821');
  assert.equal(passcodeOnly('Pass code - 4821'), '4821');
  assert.equal(passcodeOnly('975967'), '975967');
  // Anything that is not a passcode at all is left exactly as written.
  assert.equal(passcodeOnly('Bring a copy of the handout'), 'Bring a copy of the handout');
  assert.equal(passcodeOnly(''), '');
  assert.equal(passcodeOnly(null), '');
});

test('the hour reads the way somebody would say it', () => {
  const start = app.indexOf('function plainHour(');
  const plainHour = new Function(`${app.slice(start, app.indexOf('\n}', start) + 2)}; return plainHour;`)();
  assert.equal(plainHour('2026-09-07T18:00:00Z', 'Europe/Dublin'), '7pm');
  assert.equal(plainHour('2026-09-07T18:30:00Z', 'Europe/Dublin'), '7.30pm');
  assert.equal(plainHour('2026-09-07T09:00:00Z', 'Europe/Dublin'), '10am');
  // Noon and midnight are the two the twelve-hour clock gets wrong.
  assert.equal(plainHour('2026-09-07T11:00:00Z', 'Europe/Dublin'), '12pm');
  assert.equal(plainHour('2026-09-07T23:00:00Z', 'Europe/Dublin'), '12am');
});

/* Withdrawing.
   ------------------------------------------------------------------
   The button did nothing at all. currentTarget is nulled once an event has
   finished dispatching, and the handler awaited a confirmation before reading
   it, so setting `disabled` on null threw before the form was ever sent. The
   button went back to its old label and the screen sat there. */
test('the withdrawal button is held before the confirmation, not after', () => {
  const start = app.indexOf("document.getElementById('wd-submit')");
  assert.ok(start !== -1, 'the withdrawal button is gone');
  const handler = app.slice(start, start + 900);

  const captured = handler.indexOf('const button = event.currentTarget');
  const confirmed = handler.indexOf('await askConfirm');
  assert.ok(captured !== -1 && confirmed !== -1, 'both steps should still be there');
  assert.ok(captured < confirmed,
    'currentTarget must be read before the await, or it is null by the time it is used');
});

test('no handler reads currentTarget after awaiting', () => {
  /* The same mistake anywhere else would fail the same silent way, so it is
     worth catching as a shape rather than one instance. */
  const offenders = [];
  for (const match of app.matchAll(/addEventListener\([^,]+,\s*async \(event\)[^{]*\{/g)) {
    const rest = app.slice(match.index, match.index + 1600);
    const awaitAt = rest.indexOf('await ');
    const useAt = rest.indexOf('event.currentTarget');
    // An argument evaluated before the call is fine: it runs before suspending.
    const insideCall = useAt !== -1 && /\([^()]*event\.currentTarget/.test(rest.slice(Math.max(0, useAt - 60), useAt + 20));
    if (awaitAt !== -1 && useAt > awaitAt && !insideCall) {
      offenders.push(rest.slice(useAt - 60, useAt + 30).replace(/\s+/g, ' '));
    }
  }
  assert.deepEqual(offenders, [], `these read currentTarget after an await:\n  ${offenders.join('\n  ')}`);
});

test('a withdrawal is emailed to somebody rather than only recorded', () => {
  const routes = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
  assert.match(routes, /notifyWithdrawal\(/, 'somebody has to be told');
  assert.match(routes, /withdrawalNoticeTo \|\| config\.emailReplyTo/,
    'it should fall back to the reply-to inbox rather than going nowhere');

  // After the response and never awaited: the withdrawal is saved and the
  // student has been answered before any mail is attempted.
  const at = routes.indexOf('notifyWithdrawal({');
  assert.ok(routes.lastIndexOf('res.status(201)', at) !== -1 && routes.lastIndexOf('res.status(201)', at) < at,
    'the student must be answered before the notice is sent');
  assert.match(routes.slice(at, at + 220), /\.catch\(/,
    'a mail failure must not turn a saved withdrawal into an error');
});
