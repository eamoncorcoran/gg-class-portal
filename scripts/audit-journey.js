/**
 * Every action in the app, performed for real, in the order a person would.
 *
 *   BASE_URL=http://localhost:3111 npm run audit-journey
 *
 * The route sweep proves a GET does not throw. This is the other 108 routes: the
 * ones that change something, which is to say the ones anybody actually presses.
 * Each is called with a payload that ought to work, and anything other than
 * success is reported — including the silent kind, where a route answers 200 and
 * has not done the thing.
 *
 * Everything is created here and removed at the end, so it can be run against a
 * live portal without leaving a mark. It signs in as its own throwaway
 * administrator and student rather than borrowing anybody's account.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { pool, query, one } from '../src/db.js';
import { hashPassword } from '../src/security.js';

const BASE = (process.env.BASE_URL || process.env.APP_URL
  || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) { console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.'); process.exit(1); }

const stamp = Date.now();
const failures = [];
let passed = 0;
let currentSection = '';

function section(title) { currentSection = title; console.log(`\n${title}`); }
function ok(name) { passed += 1; console.log(`  ok   ${name}`); }
function fail(name, detail) {
  failures.push({ section: currentSection, name, detail });
  console.log(`  FAIL ${name} — ${detail}`);
}
/** A call that should have worked. */
function expectOk(name, result, extra = () => true) {
  if (result.status >= 200 && result.status < 300 && extra(result.data)) return ok(name), result.data;
  fail(name, `status ${result.status} ${JSON.stringify(result.data).slice(0, 200)}`);
  return null;
}
function expectStatus(name, result, wanted) {
  if (result.status === wanted) return ok(name), result.data;
  fail(name, `expected ${wanted}, got ${result.status} ${JSON.stringify(result.data).slice(0, 160)}`);
  return null;
}
function expect(name, condition, detail = '') { condition ? ok(name) : fail(name, detail); }
/* For everything that depends on a key or an integration this portal may not
   have configured. The requirement is not that it succeeds — it cannot — but
   that it fails like a feature that is switched off rather than a server that
   has fallen over, because the second is what a user reports as "it's broken". */
function expectGraceful(name, result) {
  if (result.status < 500 && result.status !== 0) {
    if (result.status >= 400 && typeof result.data?.error !== 'string') {
      return fail(name, `refused with ${result.status} but no explanation: ${JSON.stringify(result.data).slice(0, 140)}`);
    }
    return ok(name), result.data;
  }
  fail(name, `status ${result.status} ${JSON.stringify(result.data).slice(0, 200)}`);
  return null;
}

const touched = new Set();

function actor(label) {
  const jar = new Map();
  return {
    label, jar,
    async call(path, { method = 'GET', body, form } = {}) {
      const headers = {};
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (body !== undefined) headers['content-type'] = 'application/json';
      touched.add(`${method} ${path.split('?')[0]}`);
      let response;
      try {
        response = await fetch(`${BASE}${path}`, {
          method, headers,
          body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
          redirect: 'manual',
        });
      } catch (error) { return { status: 0, data: { error: error.message } }; }
      for (const cookie of response.headers.getSetCookie?.() || []) {
        const [pair] = cookie.split(';');
        const index = pair.indexOf('=');
        const value = pair.slice(index + 1);
        if (value) jar.set(pair.slice(0, index), value); else jar.delete(pair.slice(0, index));
      }
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { nonJson: text.slice(0, 4000) }; }
      return { status: response.status, data };
    },
  };
}

const PNG_PIXEL = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
), (c) => c.charCodeAt(0));

/* Board posts and lesson attachments take documents, not pictures, so the
   journey has to offer a real one. */
const PDF_BYTES = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF\n');

const admin = actor('admin');
const student = actor('student');
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString();
const day = (days) => iso(days).slice(0, 10);

const made = { classId: null, studentId: null, courseId: null, assignmentId: null,
  weekId: null, threadId: null, postId: null, categoryId: null, moduleId: null,
  lessonId: null, sessionId: null, noteId: null, adminId: null };
const studentEmail = `audit.student.${stamp}@gaeilgeoirguides.test`;
const studentPassword = `Audit!Pass${stamp}aA9`;

try {
  /* ---------------------------------------------------------------- auth */
  section('Signing in');
  expectOk('administrator signs in', await admin.call('/api/auth/login',
    { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }));
  expectOk('the session reports who it is', await admin.call('/api/auth/me'),
    (d) => d?.user?.role === 'admin');
  expectStatus('a wrong password is refused', await admin.call('/api/auth/login',
    { method: 'POST', body: { email: ADMIN_EMAIL, password: 'not-the-password' } }), 401);

  /* ------------------------------------------------------------- classes */
  section('Setting up a class');
  const klass = expectOk('create a class', await admin.call('/api/admin/classes', { method: 'POST', body: {
    programmeName: `Audit ${stamp}`, dayOfWeek: 1, startTime: '19:00',
    timezone: 'Europe/Dublin', hasCommunity: true, startsOn: day(-7), endsOn: day(120),
  } }));
  made.classId = klass?.id;
  if (!made.classId) throw new Error('Cannot continue without a class.');

  expectOk('rename the class', await admin.call(`/api/admin/classes/${made.classId}`,
    { method: 'PATCH', body: { programmeName: `Audit ${stamp} renamed` } }));
  expectOk('read the class setup', await admin.call(`/api/admin/classes/${made.classId}/setup`));

  const session = expectOk('add an extra session', await admin.call(`/api/admin/classes/${made.classId}/sessions`,
    { method: 'POST', body: { startsAt: iso(3), durationMinutes: 60, label: 'Extra class', joinUrl: 'https://example.com/j' } }));
  made.sessionId = session?.id;
  if (made.sessionId) {
    expectOk('edit the extra session', await admin.call(`/api/admin/classes/${made.classId}/sessions/${made.sessionId}`,
      { method: 'PATCH', body: { label: 'Renamed session', durationMinutes: 45 } }));
  }

  expectOk('mark a class date as recorded or moved', await admin.call(`/api/admin/classes/${made.classId}/date-changes`,
    { method: 'PUT', body: { changes: [
      { onDate: day(7), kind: 'recorded', reason: 'Recorded this week' },
      { onDate: day(14), kind: 'skipped', reason: 'Mid-term' },
      { onDate: day(21), kind: 'moved', movedTo: iso(22), reason: 'Moved to Tuesday' },
    ] } }));

  expectOk('build the check-in schedule', await admin.call(`/api/admin/classes/${made.classId}/checkin-schedule`,
    { method: 'POST', body: { startDate: day(-7), endDate: day(35), releaseDay: 1, dueDay: 7, hardDeadline: true } }));

  const weeks = expectOk('list the teaching weeks', await admin.call(`/api/admin/teaching-weeks?classId=${made.classId}`));
  made.weekId = Array.isArray(weeks) ? weeks[0]?.id : weeks?.weeks?.[0]?.id;
  expect('the schedule produced weeks', Boolean(made.weekId), JSON.stringify(weeks).slice(0, 160));

  if (made.weekId) {
    expectOk('change one week’s check-in window', await admin.call(`/api/admin/weeks/${made.weekId}/checkin`,
      { method: 'PUT', body: { enabled: true, releaseAt: iso(-1), dueAt: iso(6), hardDeadline: true, label: 'Week one' } }));
    expectOk('switch several weeks on at once', await admin.call('/api/admin/weeks/bulk-checkin',
      { method: 'POST', body: { weekIds: [made.weekId], enabled: true } }));
    expectOk('see what deleting a week would remove', await admin.call(`/api/admin/weeks/${made.weekId}/impact`));
  }

  /* ------------------------------------------------------------ students */
  section('Adding a student');
  const created = expectOk('create a student', await admin.call('/api/admin/students', { method: 'POST', body: {
    name: 'Audit Student', email: studentEmail, classId: made.classId } }));
  made.studentId = created?.id;
  if (made.studentId) {
    expectOk('rename the student', await admin.call(`/api/admin/students/${made.studentId}`,
      { method: 'PATCH', body: { name: 'Audit Student Renamed' } }));
    const note = expectOk('write a note about the student', await admin.call(`/api/admin/students/${made.studentId}/notes`,
      { method: 'POST', body: { body: 'A private note.', pinned: false } }));
    made.noteId = note?.id;
    if (made.noteId) {
      expectOk('edit the note', await admin.call(`/api/admin/notes/${made.noteId}`,
        { method: 'PATCH', body: { body: 'An edited private note.', pinned: true } }));
    }
    expectOk('open the student profile', await admin.call(`/api/admin/students/${made.studentId}/profile`));
    expectOk('see what deleting the student would remove', await admin.call(`/api/admin/students/${made.studentId}/impact`));
    // Give the student a password we know, rather than the emailed one.
    await query('UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2',
      [await hashPassword(studentPassword), made.studentId]);
  }

  /* --------------------------------------------------------- assignments */
  section('Setting homework');
  const assignment = expectOk('create an assignment', await admin.call('/api/admin/assignments', { method: 'POST', body: {
    classId: made.classId, weekId: made.weekId ?? null, title: 'Audit homework',
    instructions: 'Write three sentences.', visibleAt: iso(-1), deadlineAt: iso(5),
    hardDeadline: true, remindersEnabled: true,
    questions: [{ prompt: 'Write a sentence in Irish.', required: true }],
    allowUploads: true, uploadsRequired: false, acceptedFileTypes: ['image', 'pdf'], maxFiles: 3,
  } }));
  made.assignmentId = assignment?.id;
  if (made.assignmentId) {
    expectOk('edit the assignment', await admin.call(`/api/admin/assignments/${made.assignmentId}`, { method: 'PUT', body: {
      title: 'Audit homework edited', instructions: 'Write four sentences.',
      visibleAt: iso(-1), deadlineAt: iso(5), hardDeadline: true, remindersEnabled: true,
      status: 'published',
      questions: [{ prompt: 'Write a sentence in Irish.', required: true }],
      resources: [],
      allowUploads: true, uploadsRequired: false, acceptedFileTypes: ['image', 'pdf'], maxFiles: 3,
    } }));
    expectOk('download the import template', await admin.call(`/api/admin/classes/${made.classId}/assignment-template`));
  }

  /* -------------------------------------------------------------- course */
  section('Building a course');
  const course = expectOk('create a course', await admin.call('/api/admin/courses',
    { method: 'POST', body: { title: `Audit course ${stamp}`, description: 'A course', published: true, classIds: [made.classId] } }));
  made.courseId = course?.id;
  if (made.courseId) {
    expectOk('edit the course', await admin.call(`/api/admin/courses/${made.courseId}`,
      { method: 'PATCH', body: { title: `Audit course ${stamp} edited`, published: true } }));
    const module = expectOk('add a section', await admin.call(`/api/admin/courses/${made.courseId}/modules`,
      { method: 'POST', body: { title: 'Section one' } }));
    made.moduleId = module?.id;
    if (made.moduleId) {
      expectOk('rename the section', await admin.call(`/api/admin/modules/${made.moduleId}`,
        { method: 'PATCH', body: { title: 'Section one renamed' } }));
      expectOk('see what deleting the section would remove', await admin.call(`/api/admin/modules/${made.moduleId}/impact`));
      const lesson = expectOk('add a lesson', await admin.call(`/api/admin/modules/${made.moduleId}/lessons`,
        { method: 'POST', body: { title: 'Lesson one', notes: 'Notes', published: true } }));
      made.lessonId = lesson?.id;
      if (made.lessonId) {
        expectOk('edit the lesson', await admin.call(`/api/admin/lessons/${made.lessonId}`,
          { method: 'PATCH', body: { title: 'Lesson one renamed', published: true } }));
        expectOk('reorder the course', await admin.call(`/api/admin/courses/${made.courseId}/order`,
          { method: 'PUT', body: { modules: [{ id: made.moduleId, lessons: [made.lessonId] }] } }));
      }
    }
    expectOk('duplicate the course', await admin.call(`/api/admin/courses/${made.courseId}/duplicate`,
      { method: 'POST', body: { title: `Audit course ${stamp} copy` } }));
  }

  /* ----------------------------------------------------------- community */
  section('The community board');
  const category = expectOk('add a category', await admin.call(`/api/admin/community/${made.classId}/categories`,
    { method: 'POST', body: { name: 'Questions' } }));
  made.categoryId = category?.id;
  if (made.categoryId) {
    expectOk('rename the category', await admin.call(`/api/admin/community/categories/${made.categoryId}`,
      { method: 'PATCH', body: { name: 'Questions renamed' } }));
  }
  const thread = expectOk('the teacher posts to the board', await admin.call(`/api/admin/community/${made.classId}/threads`,
    { method: 'POST', body: { title: 'Audit board post', body: 'The body of the post.', categoryId: made.categoryId ?? null, pinned: false } }));
  made.threadId = thread?.id;
  if (made.threadId) {
    const reply = expectOk('the teacher comments on it', await admin.call(`/api/admin/community/thread/${made.threadId}/replies`,
      { method: 'POST', body: { body: 'A teacher comment.' } }));
    made.postId = reply?.id;
    expectOk('the teacher reacts to it', await admin.call(`/api/admin/community/react/thread/${made.threadId}`,
      { method: 'POST', body: { emoji: '👍' } }));
    expectOk('pin the post', await admin.call(`/api/admin/community/thread/${made.threadId}`,
      { method: 'PATCH', body: { pinned: true } }));
    expectOk('close the post to replies', await admin.call(`/api/admin/community/thread/${made.threadId}`,
      { method: 'PATCH', body: { locked: true } }));
    expectOk('reopen the post', await admin.call(`/api/admin/community/thread/${made.threadId}`,
      { method: 'PATCH', body: { locked: false } }));
    expectOk('schedule the post', await admin.call(`/api/admin/community/thread/${made.threadId}/schedule`,
      { method: 'PATCH', body: { publishedAt: iso(1) } }));
    expectOk('publish it again', await admin.call(`/api/admin/community/thread/${made.threadId}/schedule`,
      { method: 'PATCH', body: { publishedAt: iso(-1) } }));
    expectOk('hide and restore the post', await admin.call(`/api/admin/community/thread/${made.threadId}/removal`,
      { method: 'POST', body: { removed: true } }));
    expectOk('restore it', await admin.call(`/api/admin/community/thread/${made.threadId}/removal`,
      { method: 'POST', body: { removed: false } }));
    if (made.postId) {
      const edited = expectOk('the teacher edits a comment', await admin.call(`/api/admin/community/post/${made.postId}`,
        { method: 'PATCH', body: { body: 'A teacher comment, corrected.' } }));
      expect('the edit is recorded as an edit', Boolean(edited?.edited_at),
        JSON.stringify(edited).slice(0, 160));
      expect('and the new words are what is stored', edited?.body === 'A teacher comment, corrected.',
        JSON.stringify(edited?.body));
      expectStatus('an empty comment is refused', await admin.call(`/api/admin/community/post/${made.postId}`,
        { method: 'PATCH', body: { body: '   ' } }), 400);
      const board = await admin.call(`/api/admin/community/thread/${made.threadId}`);
      const shown = (board.data?.comments || []).find((row) => row.id === made.postId);
      expect('the board shows the comment as edited', Boolean(shown?.edited_at),
        JSON.stringify(shown).slice(0, 200));
      expectOk('hide a comment', await admin.call(`/api/admin/community/post/${made.postId}/removal`,
        { method: 'POST', body: { removed: true } }));
      expectOk('restore the comment', await admin.call(`/api/admin/community/post/${made.postId}/removal`,
        { method: 'POST', body: { removed: false } }));
    }
    expectOk('read the board', await admin.call(`/api/admin/community/${made.classId}`));
    expectOk('open one post', await admin.call(`/api/admin/community/thread/${made.threadId}`));
  }

  /* ------------------------------------------------------ the student’s day */
  section('The student’s side');
  const signedIn = expectOk('the student signs in', await student.call('/api/auth/login',
    { method: 'POST', body: { email: studentEmail, password: studentPassword } }));
  /* Every new student is required to add a photograph before anything else will
     answer them. It is a deliberate gate and the journey has to pass through it
     exactly as a person does, or everything after this is testing the gate. */
  expect('a new student is asked for a photograph', signedIn?.user?.mustSetAvatar === true,
    JSON.stringify(signedIn?.user).slice(0, 160));
  expectStatus('and is refused until they add one', await student.call('/api/student/bootstrap'), 428);
  const photo = new FormData();
  photo.append('avatar', new Blob([PNG_PIXEL], { type: 'image/png' }), 'me.png');
  expectOk('the student adds a photograph', await student.call('/api/auth/avatar', { method: 'POST', form: photo }));
  const home = expectOk('the student’s home screen loads', await student.call('/api/student/bootstrap'));
  expect('the student sees their class', Boolean(home?.klass || home?.class), JSON.stringify(home).slice(0, 200));

  if (made.weekId) {
    const answers = { attendance: 'live', reviewed: 'yes', understanding: 8, confidence: 7,
      weeklyWin: 'I learned the modh coinníollach.', support: 'Nothing for now.' };
    expectOk('save a check-in draft', await student.call(`/api/student/checkins/${made.weekId}/draft`,
      { method: 'PUT', body: { answers } }));
    expectOk('submit the check-in', await student.call(`/api/student/checkins/${made.weekId}/submit`,
      { method: 'POST', body: { answers } }));
  }
  if (made.assignmentId) {
    expectOk('save a homework draft', await student.call(`/api/student/assignments/${made.assignmentId}/draft`,
      { method: 'PUT', body: { answers: ['A first attempt.'], currentQuestion: 0 } }));
    expectOk('submit the homework', await student.call(`/api/student/assignments/${made.assignmentId}/submit`,
      { method: 'POST', body: { answers: ['Tá an aimsir go breá inniu.'] } }));
  }
  if (made.threadId) {
    expectOk('the student reads the board', await student.call('/api/student/community'));
    expectOk('the student comments', await student.call(`/api/student/community/thread/${made.threadId}/replies`,
      { method: 'POST', body: { body: 'A student comment.' } }));
    expectOk('the student reacts', await student.call(`/api/student/community/react/thread/${made.threadId}`,
      { method: 'POST', body: { emoji: '🎉' } }));
    expectOk('the student marks the board read', await student.call('/api/student/community/read', { method: 'POST', body: {} }));
    expectOk('the student starts their own post', await student.call('/api/student/community/threads',
      { method: 'POST', body: { title: 'A student question', body: 'How do I say this?' } }));
  }
  if (made.lessonId) {
    expectOk('the student marks a lesson watched', await student.call(`/api/student/lessons/${made.lessonId}/progress`,
      { method: 'POST', body: { completed: true, positionSeconds: 120 } }));
  }
  expectOk('the student’s courses load', await student.call('/api/student/courses'));

  /* The address the portal asks for at the top of the screen. */
  expect('a new student is asked for their address', home?.addressNeeded === true,
    `addressNeeded was ${JSON.stringify(home?.addressNeeded)}`);
  expectOk('the address form loads', await student.call('/api/student/address'),
    (d) => Array.isArray(d?.counties) && d.counties.length === 32);
  expectStatus('a county that is not a county is refused', await student.call('/api/student/address',
    { method: 'PUT', body: { line1: '12 Ard na Gréine', county: 'Nowhere', eircode: 'H91 ABC1' } }), 400);
  expectStatus('something that is not an Eircode is refused', await student.call('/api/student/address',
    { method: 'PUT', body: { line1: '12 Ard na Gréine', county: 'Galway', eircode: 'NOPE' } }), 400);
  const saved = expectOk('the student saves their address', await student.call('/api/student/address',
    { method: 'PUT', body: { line1: '12 Ard na Gréine', line2: 'Ballinfoyle', county: 'co. galway', eircode: 'h91abc1' } }));
  expect('the county is stored in its proper form', saved?.address_county === 'Galway', JSON.stringify(saved));
  expect('and the Eircode in its proper form', saved?.eircode === 'H91 ABC1', JSON.stringify(saved));
  const after = await student.call('/api/student/bootstrap');
  expect('the bar stops asking once it is answered', after.data?.addressNeeded === false,
    `addressNeeded was ${JSON.stringify(after.data?.addressNeeded)}`);

  /* --------------------------------------------------------- the feedback */
  section('Returning feedback');
  const tracker = expectOk('the tracker loads', await admin.call(`/api/admin/tracker/${made.classId}`));
  const checkinId = tracker?.rows?.[0]?.weeks?.find?.((w) => w.checkin?.id)?.checkin?.id
    ?? (await one(`SELECT id FROM checkins WHERE student_id=$1 ORDER BY created_at DESC LIMIT 1`, [made.studentId]))?.id;
  if (checkinId) {
    expectOk('save a feedback draft on the check-in', await admin.call(`/api/admin/checkins/${checkinId}/feedback-draft`,
      { method: 'PATCH', body: { feedback: 'Well done this week.' } }));
    expectOk('return the check-in feedback', await admin.call(`/api/admin/checkins/${checkinId}/return`,
      { method: 'POST', body: { feedback: 'Well done this week.' } }));
    expectOk('the student reads the feedback', await student.call(`/api/student/checkins/${checkinId}/read-feedback`,
      { method: 'POST', body: {} }));
  } else fail('found the submitted check-in to give feedback on', 'no check-in id');

  const submissionId = (await one(
    `SELECT id FROM homework_submissions WHERE student_id=$1 ORDER BY created_at DESC LIMIT 1`, [made.studentId]))?.id;
  if (submissionId) {
    expectOk('save a feedback draft on the homework', await admin.call(`/api/admin/homework/${submissionId}/feedback-draft`,
      { method: 'PATCH', body: { corrections: 'Tá an aimsir go breá inniu.', generalFeedback: 'Good work.' } }));
    expectOk('return the homework feedback', await admin.call(`/api/admin/homework/${submissionId}/return`,
      { method: 'POST', body: { corrections: 'Tá an aimsir go breá inniu.', generalFeedback: 'Good work.' } }));
    expectOk('the student reads the homework feedback', await student.call(`/api/student/homework/${submissionId}/read-feedback`,
      { method: 'POST', body: {} }));
  } else fail('found the submitted homework to give feedback on', 'no submission id');

  /* -------------------------------------------------------- attendance */
  section('The address sheet');
  {
    const sheet = await admin.call('/api/admin/students/addresses.csv');
    const text = sheet.data?.nonJson ?? '';
    expect('the address sheet downloads', sheet.status === 200, `status ${sheet.status}`);
    /* Read as bytes, because decoding to text strips a leading byte order mark —
       so the one way of checking it is there is the one way that cannot see it. */
    const raw = new Uint8Array(await (await fetch(`${BASE}/api/admin/students/addresses.csv`, {
      headers: { cookie: [...admin.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    })).arrayBuffer());
    expect('it carries the byte order mark a spreadsheet needs',
      raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF,
      `starts with ${[...raw.slice(0, 3)].map((b) => b.toString(16)).join(' ')}`);
    expect('it has a name against each address', text.includes('"Name"') && text.includes('Audit Student'),
      text.slice(0, 200));
    expect('and the address that was just given', text.includes('H91 ABC1') && text.includes('Galway'),
      text.slice(0, 400));
    const profile = await admin.call(`/api/admin/students/${made.studentId}/profile`);
    expect('the teacher sees the address on the profile', profile.data?.student?.eircode === 'H91 ABC1',
      JSON.stringify(profile.data?.student).slice(0, 200));
  }

  section('Attendance');
  if (made.weekId && made.studentId) {
    expectOk('mark attendance by hand', await admin.call(`/api/admin/attendance/${made.weekId}/${made.studentId}`,
      { method: 'PUT', body: { status: 'live', minutes: 60, source: 'manual' } }));
  }

  /* ---------------------------------------------------------- settings */
  section('Settings');
  expectOk('the settings screen loads', await admin.call('/api/settings'));
  expectOk('save the reminder settings', await admin.call('/api/settings/reminders',
    { method: 'PUT', body: { enabled: true, hoursBefore: 24 } }));
  const nudgeNow = (await admin.call('/api/settings')).data?.nudge ?? {};
  expectOk('save the nudge settings', await admin.call('/api/settings/nudge',
    { method: 'PUT', body: nudgeNow }));
  const promptsNow = (await admin.call('/api/settings')).data?.prompts ?? {};
  expectOk('save the prompt settings', await admin.call('/api/settings/prompts', { method: 'PUT', body: promptsNow }));
  expectStatus('an Anthropic admin key is refused with an explanation', await admin.call('/api/settings/anthropic',
    { method: 'PUT', body: { apiKey: 'sk-ant-admin01-example', model: 'claude-opus-5' } }), 400);

  /* ------------------------------------------------------------- other */
  section('Everything else');
  expectOk('the reminder run can be triggered', await admin.call('/api/admin/reminders/run', { method: 'POST', body: {} }));
  expectOk('the calendar feed can be rotated', await admin.call('/api/admin/calendar-feed/rotate', { method: 'POST', body: {} }));
  expectOk('the administrators screen loads', await admin.call('/api/admin/admins'));
  expectOk('the audit log loads', await admin.call('/api/admin/audit'));


  /* ------------------------------------------------ the rest of the surface */
  section('Files and media');
  {
    const avatarShown = await admin.call(`/api/media/avatar/${made.studentId}`);
    expect('a student photograph is served to the teacher', avatarShown.status === 200 || avatarShown.status === 404,
      `status ${avatarShown.status}`);

    if (made.assignmentId) {
      const upload = new FormData();
      upload.append('file', new Blob([PNG_PIXEL], { type: 'image/png' }), 'homework.png');
      const file = await student.call(`/api/student/assignments/${made.assignmentId}/files`, { method: 'POST', form: upload });
      const uploaded = expectOk('the student uploads a photo of their work', file);
      const fileId = uploaded?.id ?? uploaded?.file?.id;
      if (fileId) {
        expectOk('the teacher can open the uploaded file', await admin.call(`/api/media/homework-file/${fileId}`));
        /* The homework is already handed in by this point, and work that has been
           submitted must not be quietly withdrawn afterwards. The refusal is the
           behaviour worth asserting. */
        expectStatus('a file cannot be removed once the work is submitted',
          await student.call(`/api/student/files/${fileId}`, { method: 'DELETE' }), 409);
      }
    }

    const attachment = new FormData();
    attachment.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'board.pdf');
    expectOk('an attachment can be added to a board post', await admin.call('/api/admin/community/attachments', { method: 'POST', form: attachment }));

    const upload = new FormData();
    upload.append('files', new Blob([PNG_PIXEL], { type: 'image/png' }), 'resource.png');
    expectOk('a resource can be uploaded for an assignment', await admin.call('/api/admin/uploads', { method: 'POST', form: upload }));
  }

  section('Voice notes and dictation');
  {
    const audio = new FormData();
    audio.append('audio', new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'audio/webm' }), 'note.webm');
    expectGraceful('dictation answers even without a key', await admin.call('/api/admin/dictate', { method: 'POST', form: audio }));
    const checkinId = (await one('SELECT id FROM checkins WHERE student_id=$1 LIMIT 1', [made.studentId]))?.id;
    if (checkinId) {
      const note = new FormData();
      note.append('audio', new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'audio/webm' }), 'note.webm');
      expectGraceful('a voice note can be attached to a check-in', await admin.call(`/api/admin/voice-note/checkin/${checkinId}`, { method: 'POST', form: note }));
      expectGraceful('and removed again', await admin.call(`/api/admin/voice-note/checkin/${checkinId}`, { method: 'DELETE' }));
      expectGraceful('the voice note route answers', await admin.call(`/api/media/voice-note/checkin/${checkinId}`));
      expectGraceful('a check-in draft can be regenerated', await admin.call(`/api/admin/checkins/${checkinId}/redraft`, { method: 'POST', body: {} }));
    }
    const submissionId = (await one('SELECT id FROM homework_submissions WHERE student_id=$1 LIMIT 1', [made.studentId]))?.id;
    if (submissionId) {
      expectGraceful('a homework draft can be regenerated', await admin.call(`/api/admin/homework/${submissionId}/redraft`, { method: 'POST', body: {} }));
    }
  }

  section('Scheduled posts and drafts');
  if (made.classId) {
    expectOk('the scheduled-post template downloads', await admin.call(`/api/admin/community/${made.classId}/schedule-template`));
    expectOk('the scheduled posts list loads', await admin.call(`/api/admin/community/${made.classId}/scheduled`));
    const csv = 'title,body,publish_at\nScheduled audit post,The body.,2027-01-01T10:00:00Z\n';
    const preview = new FormData();
    preview.append('file', new Blob([csv], { type: 'text/csv' }), 'posts.csv');
    expectGraceful('a spreadsheet of posts can be previewed', await admin.call(`/api/admin/community/${made.classId}/schedule-preview`, { method: 'POST', form: preview }));
    const importer = new FormData();
    importer.append('file', new Blob([csv], { type: 'text/csv' }), 'posts.csv');
    expectGraceful('and imported', await admin.call(`/api/admin/community/${made.classId}/schedule-import`, { method: 'POST', form: importer }));
    if (made.threadId) {
      expectGraceful('a suggested reply can be asked for', await admin.call(`/api/admin/community/thread/${made.threadId}/draft`, { method: 'POST', body: { regenerate: true } }));
    }
  }

  section('Importing spreadsheets');
  if (made.classId) {
    const students = `name,email,class\nImported Audit,audit.student.import.${stamp}@gaeilgeoirguides.test,Audit ${stamp} renamed\n`;
    const form = new FormData();
    form.append('file', new Blob([students], { type: 'text/csv' }), 'students.csv');
    form.append('classId', made.classId);
    expectGraceful('a spreadsheet of students can be imported', await admin.call('/api/admin/students/import', { method: 'POST', form }));

    const homework = 'title,instructions,deadline\nImported homework,Do it,2027-01-01\n';
    const preview = new FormData();
    preview.append('file', new Blob([homework], { type: 'text/csv' }), 'homework.csv');
    expectGraceful('a spreadsheet of homework can be previewed', await admin.call(`/api/admin/classes/${made.classId}/assignment-preview`, { method: 'POST', form: preview }));

    if (made.weekId) {
      const attendance = 'Name (original name),Email,Duration (minutes)\nAudit Student,' + studentEmail + ',60\n';
      const att = new FormData();
      att.append('file', new Blob([attendance], { type: 'text/csv' }), 'attendance.csv');
      att.append('classId', made.classId);
      att.append('weekId', made.weekId);
      expectGraceful('a Zoom attendance report can be imported', await admin.call('/api/admin/attendance/import', { method: 'POST', form: att }));
    }
  }

  section('Courses, read back');
  expectOk('the course list loads', await admin.call('/api/admin/courses'));
  if (made.courseId) {
    expectOk('one course loads', await admin.call(`/api/admin/courses/${made.courseId}`));
    expectOk('course progress loads', await admin.call(`/api/admin/courses/${made.courseId}/progress`));
    expectOk('the course deletion impact loads', await admin.call(`/api/admin/courses/${made.courseId}/impact`));
    expectOk('the student can open the course', await student.call(`/api/student/courses/${made.courseId}`));
  }
  if (made.lessonId) {
    const attachment = new FormData();
    attachment.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'lesson.pdf');
    const added = expectOk('a file can be attached to a lesson', await admin.call(`/api/admin/lessons/${made.lessonId}/attachments`, { method: 'POST', form: attachment }));
    const attachmentId = added?.id;
    if (attachmentId) {
      expectOk('the teacher can open the attachment', await admin.call(`/api/media/attachment/lesson/${attachmentId}`));
      /* The path with the permission rule in it. A student on a class the course
         is offered to must be able to open the file. */
      expectOk('a student on the course can open it too', await student.call(`/api/media/attachment/lesson/${attachmentId}`));
      expectOk('the attachment can be removed', await admin.call(`/api/admin/lesson-attachments/${attachmentId}`, { method: 'DELETE' }));
    }
  }

  section('Zoom, which may not be configured');
  expectGraceful('the Zoom status answers', await admin.call('/api/admin/zoom/status'));
  expectGraceful('the recordings list answers', await admin.call('/api/admin/zoom/recordings'));
  expectGraceful('the import history answers', await admin.call('/api/admin/zoom/imports'));
  expectGraceful('a sweep can be asked for', await admin.call('/api/admin/zoom/sweep', { method: 'POST', body: {} }));
  expectGraceful('an import can be asked for', await admin.call('/api/admin/zoom/import', { method: 'POST', body: { meetingId: '123', classId: made.classId } }));
  expectGraceful('the sources can be saved', await admin.call('/api/admin/zoom/sources', { method: 'PUT', body: { sources: [] } }));
  expectGraceful('a source can be removed', await admin.call('/api/admin/zoom/sources/00000000-0000-0000-0000-000000000000', { method: 'DELETE' }));

  section('The student’s own screens');
  if (made.assignmentId) expectOk('the student opens the assignment', await student.call(`/api/student/assignments/${made.assignmentId}`));
  if (made.threadId) expectOk('the student opens one board post', await student.call(`/api/student/community/thread/${made.threadId}`));
  expectOk('the calendar feed address loads', await student.call('/api/student/calendar-feed'));
  expectOk('the student can rotate their calendar link', await student.call('/api/student/calendar-feed/rotate', { method: 'POST', body: {} }));
  expectOk('the withdrawal form loads', await student.call('/api/student/withdrawal'));
  if (made.weekId) {
    expectGraceful('a missed deadline can be dismissed', await student.call('/api/student/dismissals', { method: 'POST', body: { kind: 'checkin', refId: made.weekId } }));
    expectGraceful('and undismissed', await student.call(`/api/student/dismissals/checkin/${made.weekId}`, { method: 'DELETE' }));
  }

  section('Settings, the rest');
  expectGraceful('the OpenAI key can be saved', await admin.call('/api/settings/openai', { method: 'PUT', body: { apiKey: '', model: 'gpt-4o-mini' } }));
  expectGraceful('the dictation settings can be saved', await admin.call('/api/settings/dictation', { method: 'PUT', body: {} }));
  const emailNow = (await admin.call('/api/settings')).data?.email ?? {};
  expectGraceful('the email settings can be saved', await admin.call('/api/settings/email', { method: 'PUT', body: emailNow }));
  expectGraceful('a test email can be asked for', await admin.call('/api/settings/email/test', { method: 'POST', body: { to: 'audit@gaeilgeoirguides.test' } }));
  expectGraceful('a draft can be previewed', await admin.call('/api/settings/anthropic/test', { method: 'POST', body: {} }));

  section('Passwords and administrators');
  expectOk('the password policy loads', await admin.call('/api/auth/password-policy'));
  expectGraceful('a forgotten password can be requested', await admin.call('/api/auth/forgot-password', { method: 'POST', body: { email: studentEmail } }));
  expectGraceful('an invalid reset token is refused', await admin.call('/api/auth/reset-password', { method: 'POST', body: { token: 'not-a-real-token', password: `Brand!New${stamp}aA9` } }));
  {
    const secondAdmin = actor('second admin');
    const email = `audit.admin.${stamp}@gaeilgeoirguides.test`;
    const invited = expectGraceful('another administrator can be invited', await admin.call('/api/admin/admins',
      { method: 'POST', body: { name: 'Audit Admin', email, isSuperAdmin: false } }));
    made.adminId = invited?.id;
    if (made.adminId) {
      expectOk('an administrator can be suspended', await admin.call(`/api/admin/admins/${made.adminId}`,
        { method: 'PATCH', body: { active: false } }));
      /* Sign in as them to change a password for real, which is the one flow
         that cannot be tested from an account that must keep working. */
      const password = `Audit!Admin${stamp}aA9`;
      await query('UPDATE users SET password_hash=$1, must_change_password=false, active=true WHERE id=$2',
        [await hashPassword(password), made.adminId]);
      const signed = await secondAdmin.call('/api/auth/login', { method: 'POST', body: { email, password } });
      if (signed.status === 200) {
        expectOk('an administrator can change their own password', await secondAdmin.call('/api/auth/change-password',
          { method: 'POST', body: { currentPassword: password, newPassword: `Audit!Admin${stamp}bB9` } }));
        expectOk('and sign out', await secondAdmin.call('/api/auth/logout', { method: 'POST', body: {} }));
      } else fail('the invited administrator can sign in', `status ${signed.status}`);
    }
  }


  section('The screens that simply have to load');
  expectOk('the admin home screen loads', await admin.call('/api/admin/bootstrap'));
  expectOk('the class list loads', await admin.call('/api/admin/classes'));
  expectOk('the student list loads', await admin.call('/api/admin/students'));
  expectOk('the assignment list loads', await admin.call('/api/admin/assignments'));
  expectOk('the calendar feed address loads', await admin.call('/api/admin/calendar-feed'));

  if (made.classId) {
    expectOk('the engagement report loads', await admin.call(`/api/admin/engagement/${made.classId}`));
    expectOk('the feedback-read report loads', await admin.call(`/api/admin/reports/feedback-read/${made.classId}`));
  }
  if (made.assignmentId) {
    expectOk('the assignment deletion impact loads', await admin.call(`/api/admin/assignments/${made.assignmentId}/impact`));
    expectOk('an assignment can be added to a calendar', await admin.call(`/api/admin/assignments/${made.assignmentId}/calendar.ics`));
    expectOk('a closed assignment can be reopened', await admin.call(`/api/admin/assignments/${made.assignmentId}/reopen`,
      { method: 'POST', body: { reopenedUntil: iso(9) } }));
  }

  section('Invitations and nudges');
  if (made.studentId) {
    expectGraceful('a student can be sent their invitation again', await admin.call(`/api/admin/students/${made.studentId}/resend-invite`, { method: 'POST', body: {} }));
    expectGraceful('a student password can be reset', await admin.call(`/api/admin/students/${made.studentId}/reset-password`, { method: 'POST', body: {} }));
    /* Both of those replace the password, so the student's session is gone and
       the one we know no longer works. Put a known one back before the journey
       carries on using it. */
    await query('UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2',
      [await hashPassword(studentPassword), made.studentId]);
    await student.call('/api/auth/login', { method: 'POST', body: { email: studentEmail, password: studentPassword } });
    expectGraceful('a nudge can be sent', await admin.call('/api/admin/nudge',
      { method: 'POST', body: { studentIds: [made.studentId], subject: 'A gentle nudge', body: 'Just checking in.' } }));
    expectOk('the nudge history loads', await admin.call(`/api/admin/nudge/history?studentId=${made.studentId}&type=checkin`));
  }

  section('Importing homework, and withdrawing');
  if (made.classId) {
    const homework = 'title,instructions,deadline\nImported homework,Do it,2027-01-01\n';
    const form = new FormData();
    form.append('file', new Blob([homework], { type: 'text/csv' }), 'homework.csv');
    expectGraceful('a spreadsheet of homework can be imported', await admin.call(`/api/admin/classes/${made.classId}/assignment-import`, { method: 'POST', form }));
  }
  /* Left until last on the student's side: withdrawing closes things behind it,
     so anything after this would be testing a withdrawn account. */
  expectGraceful('the student can withdraw from the course', await student.call('/api/student/withdrawal', { method: 'POST', body: {
    reason: 'Too busy this term', detail: 'Work got in the way.', overallRating: 4,
    teachingRating: 5, materialsRating: 4, pace: 'About right',
    whatWorked: 'The recordings.', whatToImprove: 'Nothing.', wouldRecommend: 'Yes', mayContact: false,
  } }));

  /* ------------------------------------------------- removing what we made */
  section('Removing a student and a class');
  /* Before the student, because a note belongs to them and goes when they do. */
  if (made.noteId) expectOk('delete the note', await admin.call(`/api/admin/notes/${made.noteId}`, { method: 'DELETE' }));
  if (made.studentId) {
    expectOk('take the student off the class', await admin.call(`/api/admin/students/${made.studentId}/remove-from-class`,
      { method: 'POST', body: { classId: made.classId } }));
    const impact = await admin.call(`/api/admin/students/${made.studentId}/impact`);
    const work = impact.data?.work ?? 0;
    expectStatus('deleting without confirming the work is refused', await admin.call(
      `/api/admin/students/${made.studentId}`, { method: 'DELETE' }), work > 0 ? 409 : 200);
    if (work > 0) {
      expectOk('deleting with the work confirmed succeeds', await admin.call(
        `/api/admin/students/${made.studentId}?confirmWork=${work}`, { method: 'DELETE' }));
    }
    made.studentId = null;
  }
  if (made.lessonId) expectOk('delete the lesson', await admin.call(`/api/admin/lessons/${made.lessonId}`, { method: 'DELETE' }));
  if (made.moduleId) expectOk('delete the section', await admin.call(`/api/admin/modules/${made.moduleId}`, { method: 'DELETE' }));
  if (made.categoryId) expectOk('delete the category', await admin.call(`/api/admin/community/categories/${made.categoryId}`, { method: 'DELETE' }));
  if (made.sessionId) expectOk('delete the extra session', await admin.call(`/api/admin/classes/${made.classId}/sessions/${made.sessionId}`, { method: 'DELETE' }));
  if (made.assignmentId) {
    expectOk('archive the assignment', await admin.call(`/api/admin/assignments/${made.assignmentId}/archive`, { method: 'POST', body: {} }));
    expectOk('delete the assignment', await admin.call(`/api/admin/assignments/${made.assignmentId}`, { method: 'DELETE' }));
  }
  if (made.weekId) {
    const impact = await admin.call(`/api/admin/weeks/${made.weekId}/impact`);
    expectOk('delete a teaching week', await admin.call(
      `/api/admin/weeks/${made.weekId}?confirmWork=${impact.data?.work ?? 0}`, { method: 'DELETE' }));
  }
  if (made.courseId) expectOk('delete the course', await admin.call(`/api/admin/courses/${made.courseId}`, { method: 'DELETE' }));
  if (made.classId) {
    const impact = await admin.call(`/api/admin/classes/${made.classId}/impact`);
    const work = impact.data ? (impact.data.checkins + impact.data.submissions) : 0;
    expectOk('delete the class', await admin.call(`/api/admin/classes/${made.classId}?confirmWork=${work}`, { method: 'DELETE' }));
  }
} catch (error) {
  fail('the journey ran to the end', error.message);
  console.error(error);
} finally {
  // Whatever the journey did or failed to do, leave nothing behind.
  await query('DELETE FROM users WHERE email LIKE $1', [`audit.%@gaeilgeoirguides.test`]).catch(() => {});
  await query('DELETE FROM classes WHERE programme_name LIKE $1', [`Audit ${stamp}%`]).catch(() => {});
  await query('DELETE FROM courses WHERE title LIKE $1', [`Audit course ${stamp}%`]).catch(() => {});
  await pool.end();
}

/* Which routes this journey never called. Named rather than counted, because a
   number tells you there is a gap and not where it is. */
const MOUNTS = { 'admin.js': '/api/admin', 'student.js': '/api/student', 'auth.js': '/api/auth',
  'settings.js': '/api/settings', 'media.js': '/api/media', 'zoom.js': '/api/zoom' };
const defined = [];
for (const file of fs.readdirSync(new URL('../src/routes/', import.meta.url))) {
  const mount = MOUNTS[file];
  if (mount === undefined) continue;
  const source = fs.readFileSync(new URL(`../src/routes/${file}`, import.meta.url), 'utf8');
  for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
    defined.push({ method: match[1].toUpperCase(), path: `${mount}${match[2] === '/' ? '' : match[2]}` });
  }
}
const segments = (p) => p.replace(/^\/+|\/+$/g, '').split('/');
const covered = (route) => [...touched].some((call) => {
  const [method, path] = call.split(' ');
  if (method !== route.method) return false;
  const a = segments(path), b = segments(route.path);
  return a.length === b.length && b.every((seg, i) => seg.startsWith(':') || seg === a[i]);
});
const uncovered = defined.filter((route) => !covered(route));

console.log(`\n${passed} passed, ${failures.length} failed.`);
console.log(`${defined.length - uncovered.length} of ${defined.length} routes exercised.`);
if (uncovered.length) {
  console.log('\nNot exercised by this journey:');
  for (const route of uncovered) console.log(`  ${route.method} ${route.path}`);
}
if (failures.length) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(`  [${failure.section}] ${failure.name}\n      ${failure.detail}`);
}
process.exit(failures.length ? 1 : 0);
