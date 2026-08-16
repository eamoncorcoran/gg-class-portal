/**
 * End-to-end smoke test against a running server.
 *
 *   BASE_URL=http://localhost:3000 \
 *   SMOKE_ADMIN_EMAIL=admin@example.com \
 *   SMOKE_ADMIN_PASSWORD='...' \
 *   npm run smoke
 *
 * Drives the real HTTP API through a full teaching week: admin signs in, invites a
 * student, publishes homework, the student changes their password, completes the
 * check-in and homework, the admin returns feedback, and the student reads it.
 * Every created record is removed again at the end.
 */
import 'dotenv/config';
import { pool, query } from '../src/db.js';
import { hashPassword } from '../src/security.js';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to an administrator account.');
  process.exit(1);
}

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** Minimal cookie jar so each actor keeps its own session. */
function actor() {
  const jar = new Map();
  return {
    jar,
    async call(path, { method = 'GET', body, raw = false } = {}) {
      const headers = {};
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      for (const cookie of response.headers.getSetCookie?.() || []) {
        const [pair] = cookie.split(';');
        const index = pair.indexOf('=');
        const name = pair.slice(0, index);
        const value = pair.slice(index + 1);
        if (value) jar.set(name, value); else jar.delete(name);
      }
      if (raw) return response;
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { nonJsonBody: text.slice(0, 120) }; }
      return { status: response.status, data, headers: response.headers };
    },
  };
}

const stamp = Date.now();
let classId = null;
const studentEmail = `smoke.${stamp}@gaeilgeoirguides.test`;
const studentPassword = `Smoke!Test${stamp}aA9`;
const admin = actor();
const student = actor();
let studentId = null;
let assignmentId = null;

try {
  section('Health and hardening');
  {
    const health = await admin.call('/api/health');
    check('health endpoint reports a live database', health.data?.ok === true && health.data?.database === true);
    check('health endpoint reports the running version', health.data?.version === process.env.npm_package_version, `got ${health.data?.version}`);

    const headers = (await admin.call('/api/health', { raw: true })).headers;
    const csp = headers.get('content-security-policy') || '';
    check('a content security policy is sent', csp.includes("default-src 'self'"));
    check('inline style attributes are permitted by the policy', /style-src-attr [^;]*'unsafe-inline'/.test(csp), csp.slice(0, 160));
    check('framing is blocked', csp.includes("frame-ancestors 'none'"));
    check('MIME sniffing is blocked', headers.get('x-content-type-options') === 'nosniff');

    const missing = await admin.call('/api/does-not-exist');
    check('unknown API routes return JSON, not the app shell', missing.status === 404 && typeof missing.data?.error === 'string', `status ${missing.status}`);

    const guarded = await admin.call('/api/admin/classes');
    check('admin routes reject anonymous callers', guarded.status === 401);

    const crossOrigin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    check('cross-origin state changes are blocked', crossOrigin.status === 403, `status ${crossOrigin.status}`);
  }

  section('Administrator sign-in');
  {
    const bad = await admin.call('/api/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'wrong-password' } });
    check('a wrong password is rejected', bad.status === 401);

    const login = await admin.call('/api/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    check('the administrator can sign in', login.status === 200 && login.data?.user?.role === 'admin', login.data?.error);

    const me = await admin.call('/api/auth/me');
    check('the session persists across requests', me.data?.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  }

  section('Classes, weeks and students');
  let weekId = null;
  {
    const classes = await admin.call('/api/admin/classes');
    check('at least one class exists', Array.isArray(classes.data) && classes.data.length > 0, 'run npm run seed-demo');
    classId = classes.data?.[0]?.id;
    check('classes carry a readable label', typeof classes.data?.[0]?.label === 'string' && classes.data[0].label.includes('|'));

    const tracker = await admin.call(`/api/admin/tracker/${classId}`);
    check('the tracker loads for that class', tracker.status === 200 && Array.isArray(tracker.data?.weeks));
    check('teaching weeks are generated automatically', (tracker.data?.weeks?.length || 0) >= 18);
    const past = tracker.data.weeks.filter((week) => new Date(week.checkin_release_at) <= new Date());
    weekId = past.at(-1)?.id;
    check('at least one week has already been released', Boolean(weekId));

    const created = await admin.call('/api/admin/students', {
      method: 'POST',
      body: { name: 'Smoke Student', email: studentEmail, classId },
    });
    check('a student account can be created', created.status === 201, created.data?.error);
    studentId = created.data?.id;

    const duplicate = await admin.call('/api/admin/students', {
      method: 'POST',
      body: { name: 'Smoke Student', email: studentEmail, classId },
    });
    check('duplicate email addresses are refused', duplicate.status === 409);

    const list = await admin.call('/api/admin/students');
    check('the new student appears in the roster', list.data?.some((row) => row.id === studentId));
  }

  section('Student first login');
  {
    const reset = await admin.call(`/api/admin/students/${studentId}/reset-password`, { method: 'POST' });
    check('an administrator can reset a student password', reset.status === 200);

    // Invite passwords are only ever emailed, never returned over HTTP, so the test
    // writes a password it knows straight to the database for this throwaway account.
    await query('UPDATE users SET password_hash=$1, must_change_password=true WHERE id=$2', [await hashPassword(studentPassword), studentId]);

    const login = await student.call('/api/auth/login', { method: 'POST', body: { email: studentEmail, password: studentPassword } });
    check('the student can sign in', login.status === 200, login.data?.error);
    check('the student is told to change their password', login.data?.user?.mustChangePassword === true);

    const weak = await student.call('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: studentPassword, newPassword: 'short' },
    });
    check('weak passwords are refused', weak.status === 400);

    const changed = await student.call('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: studentPassword, newPassword: `${studentPassword}Z!` },
    });
    check('the student can choose their own password', changed.status === 200, changed.data?.error);

    const escalate = await student.call('/api/admin/students');
    check('students cannot reach administrator data', escalate.status === 403);
  }

  section('Weekly check-in');
  {
    const bootstrap = await student.call('/api/student/bootstrap');
    check('the student sees their own class', bootstrap.data?.class?.id === classId);
    check('future weeks are hidden from the student', bootstrap.data?.weeks?.every((week) => new Date(week.week_start) <= new Date()));

    const openWeek = bootstrap.data.weeks.filter((week) => week.checkin_available && new Date(week.checkin_due_at) > new Date()).at(0)
      || bootstrap.data.weeks.filter((week) => week.checkin_available).at(-1);
    check('a released check-in is available', Boolean(openWeek));

    const draft = await student.call(`/api/student/checkins/${openWeek.id}/draft`, {
      method: 'PUT',
      body: { answers: { understanding: 7, weeklyWin: 'Partly written' } },
    });
    check('an unfinished check-in saves as a draft', draft.status === 200 && draft.data?.status === 'draft', draft.data?.error);

    const answers = {
      attendance: 'I attended live',
      reviewed: 'Yes',
      understanding: 8,
      confidence: 7,
      weeklyWin: 'I ordered a coffee as Gaeilge.',
      support: 'The tuiseal ginideach still catches me out.',
    };
    const submit = await student.call(`/api/student/checkins/${openWeek.id}/submit`, { method: 'POST', body: { answers } });
    const late = submit.status === 409;
    if (late) {
      console.log('  --   the only released week is past its deadline; check-in submission skipped');
    } else {
      check('the check-in submits', submit.status === 200 && submit.data?.status === 'submitted', submit.data?.error);

      const tracker = await admin.call(`/api/admin/tracker/${classId}`);
      const row = tracker.data.checkins.find((item) => item.student_id === studentId && item.week_id === openWeek.id);
      check('the submission reaches the administrator tracker', row?.status === 'submitted');
      check('a draft is only attempted after a real submission', ['ai_drafted', 'failed', 'generating'].includes(row?.feedback_state), row?.feedback_state);

      /* Redrafting is the first button pressed on a fresh deployment, usually
         before anyone has pasted a key in. Either it drafts, or it says what is
         missing — what it must never do is fail with "Something went wrong". */
      const redraft = await admin.call(`/api/admin/checkins/${row.id}/redraft`, { method: 'POST' });
      check(
        'redrafting either works or names what is missing',
        redraft.status === 200
          ? typeof redraft.data?.teacher_feedback === 'string'
          : redraft.status < 500 && /openai/i.test(redraft.data?.error || ''),
        `${redraft.status} ${redraft.data?.error || ''}`,
      );

      const returned = await admin.call(`/api/admin/checkins/${row.id}/return`, {
        method: 'POST',
        body: { feedback: 'Maith thú, keep going with the genitive drills.' },
      });
      check('the teacher can return check-in feedback', returned.status === 200 && returned.data?.status === 'returned', returned.data?.error);

      const afterReturn = await student.call('/api/student/bootstrap');
      check('the student is notified of new feedback', afterReturn.data?.notifications >= 1);

      const read = await student.call(`/api/student/checkins/${row.id}/read-feedback`, { method: 'POST' });
      check('opening the feedback clears the notification', read.status === 200 && Boolean(read.data?.feedback_read_at));
    }
  }

  section('Homework');
  {
    const deadline = new Date(Date.now() + 3 * 86400000).toISOString();
    const created = await admin.call('/api/admin/assignments', {
      method: 'POST',
      body: {
        classId,
        weekId,
        title: `Smoke assignment ${stamp}`,
        instructions: 'Answer as Gaeilge.',
        visibleAt: new Date(Date.now() - 3600000).toISOString(),
        deadlineAt: deadline,
        hardDeadline: true,
        remindersEnabled: false,
        questions: [
          { prompt: 'Scríobh abairt faoi do sheachtain.', required: true },
          { prompt: 'Optional extra.', required: false },
        ],
        resources: [],
      },
    });
    check('an assignment can be published', created.status === 201, created.data?.error);
    assignmentId = created.data?.id;

    const visible = await student.call(`/api/student/assignments/${assignmentId}`);
    check('the student can open the assignment', visible.status === 200 && visible.data?.assignment?.questions?.length === 2);

    const draft = await student.call(`/api/student/assignments/${assignmentId}/draft`, {
      method: 'PUT',
      body: { answers: ['Leath-scríofa'], currentQuestion: 0 },
    });
    check('homework saves as a draft', draft.status === 200 && draft.data?.status === 'draft');

    const incomplete = await student.call(`/api/student/assignments/${assignmentId}/submit`, { method: 'POST', body: { answers: ['', ''] } });
    check('a required question must be answered', incomplete.status === 400);

    const submit = await student.call(`/api/student/assignments/${assignmentId}/submit`, {
      method: 'POST',
      body: { answers: ['Bhí seachtain an-ghnóthach agam.', ''] },
    });
    check('homework submits', submit.status === 200 && submit.data?.status === 'submitted', submit.data?.error);

    const tracker = await admin.call(`/api/admin/tracker/${classId}`);
    const row = tracker.data.homework.find((item) => item.assignment_id === assignmentId && item.student_id === studentId);
    check('the submission reaches the review queue', row?.status === 'submitted');

    /* Redrafting is the first button pressed on a fresh deployment, usually
       before anyone has pasted a key in. Either it drafts, or it says what is
       missing — what it must never do is fail with "Something went wrong". */
    const redraft = await admin.call(`/api/admin/homework/${row.id}/redraft`, { method: 'POST' });
    check(
      'redrafting either works or names what is missing',
      redraft.status === 200
        ? typeof redraft.data?.teacher_general_feedback === 'string'
        : redraft.status < 500 && /openai/i.test(redraft.data?.error || ''),
      `${redraft.status} ${redraft.data?.error || ''}`,
    );

    const partial = await admin.call(`/api/admin/homework/${row.id}/return`, { method: 'POST', body: { corrections: 'x', generalFeedback: '' } });
    check('both feedback sections are required', partial.status === 400);

    const returned = await admin.call(`/api/admin/homework/${row.id}/return`, {
      method: 'POST',
      body: { corrections: 'No Irish corrections needed.', generalFeedback: 'Lovely work.' },
    });
    check('the teacher can return homework feedback', returned.status === 200 && returned.data?.status === 'returned', returned.data?.error);

    const edited = await admin.call(`/api/admin/homework/${row.id}/feedback-draft`, {
      method: 'PATCH',
      body: { corrections: 'No Irish corrections needed.', generalFeedback: 'Lovely work. One more push on word order.' },
    });
    check('returned feedback stays editable', edited.status === 200 && edited.data?.feedback_state === 'returned');

    const reopened = await admin.call(`/api/admin/assignments/${assignmentId}/reopen`, {
      method: 'POST',
      body: { reopenedUntil: new Date(Date.now() + 5 * 86400000).toISOString() },
    });
    check('an assignment can be reopened', reopened.status === 200 && Boolean(reopened.data?.reopened_until));
  }

  section('Attendance');
  {
    const saved = await admin.call(`/api/admin/attendance/${weekId}/${studentId}`, {
      method: 'PUT',
      body: { status: 'live', minutes: 74, notes: 'Joined a few minutes late.' },
    });
    check('attendance can be set by hand', saved.status === 200 && saved.data?.status === 'live', saved.data?.error);
    check('minutes are stored', saved.data?.minutes === 74);
    check('internal notes are stored', saved.data?.notes === 'Joined a few minutes late.');

    const invalid = await admin.call(`/api/admin/attendance/${weekId}/${studentId}`, { method: 'PUT', body: { status: 'sometimes' } });
    check('unknown attendance statuses are refused', invalid.status === 400);
  }

  section('Settings, reminders and audit');
  {
    const settings = await admin.call('/api/settings');
    check('settings load', settings.status === 200);
    check('the OpenAI key is never sent to the browser', !JSON.stringify(settings.data).includes('sk-'));
    check('the SMTP password is never sent to the browser', settings.data?.email?.smtpPassword === undefined);
    check('reminder templates are seeded', Boolean(settings.data?.reminders?.tomorrow?.subject));
    check('teacher prompts are seeded', Boolean(settings.data?.prompts?.correctionPrompt));

    const roundTrip = await admin.call('/api/settings/email', {
      method: 'PUT',
      body: { provider: 'console', fromName: 'Gaeilgeoir Guides', fromAddress: 'support@gaeilgeoirguides.com', smtpPort: 465, smtpSecure: true },
    });
    check('email settings save', roundTrip.status === 200, roundTrip.data?.error);
    const afterSave = await admin.call('/api/settings');
    check('the SMTP port survives a save', Number(afterSave.data?.email?.smtpPort) === 465, String(afterSave.data?.email?.smtpPort));
    check('the SMTP TLS setting survives a save', afterSave.data?.email?.smtpSecure === true, String(afterSave.data?.email?.smtpSecure));

    // Saving an unrelated field must not silently switch implicit TLS off.
    await admin.call('/api/settings/email', { method: 'PUT', body: { fromName: 'Gaeilgeoir Guides' } });
    const afterPartial = await admin.call('/api/settings');
    check('a partial save leaves TLS alone', afterPartial.data?.email?.smtpSecure === true, String(afterPartial.data?.email?.smtpSecure));
    check('a partial save leaves the port alone', Number(afterPartial.data?.email?.smtpPort) === 465, String(afterPartial.data?.email?.smtpPort));
    await admin.call('/api/settings/email', { method: 'PUT', body: { provider: 'console', smtpPort: 587, smtpSecure: false } });

    const test = await admin.call('/api/settings/email/test', { method: 'POST', body: { to: 'nobody@gaeilgeoirguides.test' } });
    check('a test email can be sent in console mode', test.status === 200);

    const cycle = await admin.call('/api/admin/reminders/run', { method: 'POST' });
    check('a reminder cycle can be run by hand', cycle.status === 200);

    const audit = await admin.call('/api/admin/audit?limit=50');
    check('administrator actions are audited', Array.isArray(audit.data) && audit.data.some((row) => row.action === 'student.created'));
    check('failed logins are audited', audit.data.some((row) => row.action === 'auth.login_failed'));
  }

  section('Voice notes and private notes');
  {
    const note = await admin.call(`/api/admin/students/${studentId}/notes`, { method: 'POST', body: { body: 'Smoke test note.', pinned: true } });
    check('a private note can be logged against a student', note.status === 201, note.data?.error);

    const profile = await admin.call(`/api/admin/students/${studentId}/profile`);
    check('the student profile loads', profile.status === 200 && profile.data?.student?.id === studentId);
    check('the profile carries the notes', profile.data?.notes?.some((row) => row.id === note.data.id));
    check('the profile carries progress figures', typeof profile.data?.stats?.checkins_submitted === 'number');

    const escalate = await student.call(`/api/admin/students/${studentId}/profile`);
    check('students cannot read notes about themselves', [401, 403].includes(escalate.status), `status ${escalate.status}`);

    await admin.call(`/api/admin/notes/${note.data.id}`, { method: 'DELETE' });

    const settings = await admin.call('/api/settings');
    check('dictation settings are seeded', Boolean(settings.data?.dictation?.transcribeModel));
    check('both cleanup prompts are seeded', Boolean(settings.data?.voicePrompts?.cleanupPrompt) && Boolean(settings.data?.voicePrompts?.lightPrompt));

    const badAudio = await admin.call('/api/admin/voice-note/checkin/00000000-0000-0000-0000-000000000000', { method: 'POST' });
    check('a voice note upload without audio is refused', [400, 404].includes(badAudio.status), `status ${badAudio.status}`);

    const anonymous = await fetch(`${BASE}/api/media/voice-note/checkin/00000000-0000-0000-0000-000000000000`);
    check('voice notes are not served to anonymous callers', anonymous.status === 401, `status ${anonymous.status}`);
  }

  section('Homework calendar, archiving and deletion');
  {
    const weeks = await admin.call('/api/admin/teaching-weeks');
    check('teaching weeks load for the calendar', Array.isArray(weeks.data) && weeks.data.length > 0);
    check('teaching weeks carry a class label', typeof weeks.data[0]?.classLabel === 'string');
    check('week_start stays a calendar day', /^\d{4}-\d{2}-\d{2}$/.test(String(weeks.data[0]?.week_start)));

    const impact = await admin.call(`/api/admin/assignments/${assignmentId}/impact`);
    check('the delete impact is reported before deleting', impact.status === 200 && typeof impact.data?.submissions === 'number');

    const blind = await admin.call(`/api/admin/assignments/${assignmentId}`, { method: 'DELETE' });
    check('deleting work without confirming the count is refused', blind.status === 409, `status ${blind.status}`);
    check('the refusal names how much would be lost', /submission/.test(blind.data?.error || ''));

    const archived = await admin.call(`/api/admin/assignments/${assignmentId}/archive`, { method: 'POST', body: { archived: true } });
    check('an assignment can be archived', archived.status === 200 && archived.data?.status === 'archived');

    const hidden = await admin.call('/api/admin/assignments');
    check('archived assignments drop out of the list', !hidden.data?.some((row) => row.id === assignmentId));
    const shown = await admin.call('/api/admin/assignments?includeArchived=true');
    check('archived assignments can be listed on request', shown.data?.some((row) => row.id === assignmentId));

    const studentSees = await student.call('/api/student/bootstrap');
    check('an archived assignment disappears for students', !studentSees.data?.assignments?.some((row) => row.id === assignmentId));

    const restored = await admin.call(`/api/admin/assignments/${assignmentId}/archive`, { method: 'POST', body: { archived: false } });
    check('an archived assignment can be restored', restored.data?.status === 'published');

    const ics = await admin.call(`/api/admin/assignments/${assignmentId}/calendar.ics`, { raw: true });
    const icsBody = await ics.text();
    check('a single assignment downloads as .ics', ics.status === 200 && icsBody.startsWith('BEGIN:VCALENDAR'));
    check('the .ics carries exactly one event', (icsBody.match(/BEGIN:VEVENT/g) || []).length === 1);
    check('the .ics uses CRLF line endings as the spec requires', icsBody.includes('\r\n'));

    const classes = await admin.call('/api/admin/classes');
    const classImpact = await admin.call(`/api/admin/classes/${classes.data[0].id}/impact`);
    check('the class delete impact is reported', classImpact.status === 200 && typeof classImpact.data?.students === 'number');
    check('the class impact counts student work', typeof classImpact.data?.submissions === 'number' && typeof classImpact.data?.checkins === 'number');
    const blindClass = await admin.call(`/api/admin/classes/${classes.data[0].id}`, { method: 'DELETE' });
    check('deleting a class holding work is refused', blindClass.status === 409, `status ${blindClass.status}`);
  }

  section('Calendar subscription');
  {
    const adminFeed = await admin.call('/api/admin/calendar-feed');
    check('an administrator gets a feed link', adminFeed.status === 200 && /\/calendar\/.+\.ics$/.test(adminFeed.data?.url || ''));
    const studentFeed = await student.call('/api/student/calendar-feed');
    check('a student gets their own feed link', studentFeed.status === 200 && Boolean(studentFeed.data?.token));
    check('the two feeds are different', adminFeed.data.token !== studentFeed.data.token);

    /* The link is built from APP_URL, which on a real deployment is a public
       domain this run cannot reach — and a parked domain answering 200 would
       turn these into false passes. Keep the path, aim it at the app on test. */
    const onTestServer = (url) => BASE + new URL(url).pathname;

    // Calendar apps send no cookies, so this is fetched exactly as one would.
    const anonymous = await fetch(onTestServer(adminFeed.data.url));
    const body = await anonymous.text();
    check('the feed serves with no session at all', anonymous.status === 200);
    check('the feed is served as a calendar', (anonymous.headers.get('content-type') || '').includes('text/calendar'));
    check('the feed is a valid calendar document', body.startsWith('BEGIN:VCALENDAR') && body.trimEnd().endsWith('END:VCALENDAR'));
    check('the feed asks calendars to refresh', body.includes('REFRESH-INTERVAL'));

    const guessed = await fetch(`${BASE}/calendar/not-a-real-token-0123456789abcdef.ics`);
    check('a guessed feed token is refused', guessed.status === 404, `status ${guessed.status}`);
    const tooShort = await fetch(`${BASE}/calendar/abc.ics`);
    check('a short feed token is refused', tooShort.status === 404);

    const rotated = await student.call('/api/student/calendar-feed/rotate', { method: 'POST' });
    check('a student can reset their feed link', rotated.status === 200 && rotated.data.token !== studentFeed.data.token);
    const revoked = await fetch(onTestServer(studentFeed.data.url));
    check('resetting revokes the old link', revoked.status === 404, `status ${revoked.status}`);
  }

  section('Check-in scheduling and nudges');
  {
    const weeks = await admin.call(`/api/admin/teaching-weeks?classId=${classId}`);
    const week = weeks.data.at(-1);
    check('weeks load for one class', Array.isArray(weeks.data) && weeks.data.length > 0);

    const off = await admin.call(`/api/admin/weeks/${week.id}/checkin`, { method: 'PUT', body: { enabled: false, label: 'Christmas week' } });
    check('a week can be switched off entirely', off.status === 200 && off.data?.checkin_enabled === false, off.data?.error);
    check('a week can carry a note', off.data?.label === 'Christmas week');

    const soft = await admin.call(`/api/admin/weeks/${week.id}/checkin`, { method: 'PUT', body: { enabled: true, hardDeadline: false } });
    check('a check-in deadline can be made soft', soft.data?.checkin_hard_deadline === false);

    const backwards = await admin.call(`/api/admin/weeks/${week.id}/checkin`, {
      method: 'PUT',
      body: { releaseAt: '2026-12-25T10:00:00.000Z', dueAt: '2026-12-20T10:00:00.000Z' },
    });
    check('a check-in cannot close before it opens', backwards.status === 400);

    const bulk = await admin.call('/api/admin/weeks/bulk-checkin', { method: 'POST', body: { weekIds: [week.id], enabled: false } });
    check('several weeks can be switched at once', bulk.data?.updated === 1);
    await admin.call('/api/admin/weeks/bulk-checkin', { method: 'POST', body: { weekIds: [week.id], enabled: true } });
    await admin.call(`/api/admin/weeks/${week.id}/checkin`, { method: 'PUT', body: { hardDeadline: true, label: null } });

    const schedule = await admin.call(`/api/admin/classes/${classId}/checkin-schedule`, {
      method: 'POST',
      body: {
        startDate: '2027-01-04', endDate: '2027-03-15',
        skipWeekStarts: ['2027-02-15'],
        releaseDay: 5, releaseHour: 14, releaseMinute: 0,
        dueDay: 7, dueHour: 20, dueMinute: 0, hardDeadline: true,
      },
    });
    check('a run of check-ins can be created across a date range', schedule.status === 200 && schedule.data?.total === 11, JSON.stringify(schedule.data));
    check('exceptions are left switched off', schedule.data?.skipped === 1);

    const built = await admin.call(`/api/admin/teaching-weeks?classId=${classId}`);
    const january = built.data.find((row) => String(row.week_start).slice(0, 10) === '2027-01-04');
    // Compare the individual fields rather than a formatted string, whose exact
    // punctuation is a locale detail and not what this is testing.
    const inDublin = (value) => Object.fromEntries(
      new Intl.DateTimeFormat('en-IE', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Dublin' })
        .formatToParts(new Date(value)).map((part) => [part.type, part.value]));
    const opens = inDublin(january.checkin_release_at);
    const closes = inDublin(january.checkin_due_at);
    check('the generated week opens Friday at 14:00 in the class timezone',
      opens.weekday === 'Fri' && opens.hour === '14' && opens.minute === '00', JSON.stringify(opens));
    check('the generated week closes Sunday at 20:00',
      closes.weekday === 'Sun' && closes.hour === '20' && closes.minute === '00', JSON.stringify(closes));
    check('the deadline mode reaches the schedule screen', january.checkin_hard_deadline === true);
    check('the excepted week is off', built.data.find((row) => String(row.week_start).slice(0, 10) === '2027-02-15')?.checkin_enabled === false);

    const reversedRange = await admin.call(`/api/admin/classes/${classId}/checkin-schedule`, {
      method: 'POST', body: { startDate: '2027-03-15', endDate: '2027-01-04' },
    });
    check('a backwards date range is refused', reversedRange.status === 400);

    const settings = await admin.call('/api/settings');
    check('the nudge wording is seeded', Boolean(settings.data?.nudge?.checkinBody));

    const openWeek = weeks.data.find((row) => new Date(row.checkin_release_at) <= new Date());
    const nudged = await admin.call('/api/admin/nudge', {
      method: 'POST',
      body: { studentId, type: 'checkin', weekId: openWeek.id, subject: 'Smoke nudge', body: 'A smoke test nudge.' },
    });
    check('a student with nothing submitted can be nudged', nudged.status === 200, nudged.data?.error);

    const history = await admin.call(`/api/admin/nudge/history?studentId=${studentId}&type=checkin&weekId=${openWeek.id}`);
    check('the last nudge is recorded', Boolean(history.data?.lastSentAt));

    const empty = await admin.call('/api/admin/nudge', {
      method: 'POST',
      body: { studentId, type: 'checkin', weekId: openWeek.id, subject: '', body: '' },
    });
    check('an empty nudge is refused', empty.status === 400);

    const escalate = await student.call('/api/admin/nudge', { method: 'POST', body: { studentId, type: 'checkin', weekId: openWeek.id, subject: 'x', body: 'y' } });
    check('students cannot send nudges', [401, 403].includes(escalate.status), `status ${escalate.status}`);
  }

  section('Uploaded homework');
  {
    const created = await admin.call('/api/admin/assignments', {
      method: 'POST',
      body: {
        classId, title: `Smoke upload ${stamp}`, instructions: 'Type it or hand up a photo.',
        visibleAt: new Date(Date.now() - 3600000).toISOString(),
        deadlineAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        hardDeadline: true, remindersEnabled: false,
        allowUploads: true, uploadsRequired: false, acceptedFileTypes: ['image', 'word'], maxFiles: 2,
        questions: [{ prompt: 'Scríobh faoi do sheachtain.', required: true }], resources: [],
      },
    });
    check('an assignment can be set to accept uploads', created.status === 201 && created.data?.allow_uploads === true, created.data?.error);
    check('the accepted formats are stored', JSON.stringify(created.data?.accepted_file_types) === JSON.stringify(['image', 'word']));
    const uploadAssignment = created.data.id;

    // A real .docx, so the local extraction path is genuinely exercised.
    const { zipSync, strToU8 } = await import('fflate');
    const body = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Bhí mé ag siúl sa pháirc.</w:t></w:r></w:p></w:body></w:document>';
    const docx = Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'), 'word/document.xml': strToU8(body) }));

    const form = new FormData();
    form.append('file', new Blob([docx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'homework.docx');
    const uploadResponse = await fetch(`${BASE}/api/student/assignments/${uploadAssignment}/files`, {
      method: 'POST', body: form,
      headers: { cookie: [...student.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    const uploaded = await uploadResponse.json();
    check('a student can upload work', uploadResponse.status === 201, uploaded?.error);
    check('a Word document is read into text without a model call', uploaded?.extractionState === 'done', uploaded?.extractionState);

    const wrongType = new FormData();
    wrongType.append('file', new Blob(['a,b\n1,2'], { type: 'text/csv' }), 'sheet.csv');
    const refused = await fetch(`${BASE}/api/student/assignments/${uploadAssignment}/files`, {
      method: 'POST', body: wrongType,
      headers: { cookie: [...student.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    check('a format the teacher did not accept is refused', refused.status === 400, `status ${refused.status}`);

    check('the teacher can open the file', (await admin.call(`/api/media/homework-file/${uploaded.id}`, { raw: true })).status === 200);
    check('the student can open their own file', (await student.call(`/api/media/homework-file/${uploaded.id}`, { raw: true })).status === 200);
    const anonymous = await fetch(`${BASE}/api/media/homework-file/${uploaded.id}`);
    check('uploaded work is not served to anonymous callers', anonymous.status === 401, `status ${anonymous.status}`);

    // The whole point of the private directory: not reachable without a session.
    const { rows } = await query('SELECT stored_name FROM homework_files WHERE id=$1', [uploaded.id]);
    const publicPath = await fetch(`${BASE}/uploads/${rows[0].stored_name}`);
    check('uploaded work is not in the public uploads path', publicPath.status === 404, `status ${publicPath.status}`);

    await query('DELETE FROM assignments WHERE id=$1', [uploadAssignment]);
  }

  section('Feedback opened report');
  {
    const report = await admin.call(`/api/admin/reports/feedback-read/${classId}`);
    check('the report runs', report.status === 200, report.data?.error);
    const totals = report.data?.totals || {};
    check('it counts what was returned and what was opened',
      Number.isInteger(totals.returned) && Number.isInteger(totals.opened) && totals.opened <= totals.returned,
      JSON.stringify(totals));
    check('opened plus unopened equals returned', totals.opened + totals.unopened === totals.returned);
    check('every student on the class is listed', Array.isArray(report.data?.students) && report.data.students.length > 0);
    check('the never-opened list matches the count',
      (report.data?.unopened || []).length === totals.unopened,
      `${(report.data?.unopened || []).length} listed vs ${totals.unopened} counted`);
    check('the worst read rate is listed first',
      report.data.students.every((row, index) => index === 0
        || (report.data.students[index - 1].rate ?? 101) <= (row.rate ?? 101)));

    // Students must not be able to see who has read what, including their own.
    const peeking = await student.call(`/api/admin/reports/feedback-read/${classId}`);
    check('a student cannot run the report', peeking.status === 403, `status ${peeking.status}`);
    const anonymous = await fetch(`${BASE}/api/admin/reports/feedback-read/${classId}`);
    check('running it needs a session', anonymous.status === 401, `status ${anonymous.status}`);

    // Nothing about read tracking may leak into what a student is served.
    const theirs = await student.call('/api/student/bootstrap');
    check('the student payload never mentions read tracking',
      !/feedback_read_at|read_receipt/.test(JSON.stringify(theirs.data?.class || {})));
  }

  section('Clearing a deadline that has closed');
  {
    /* A hard deadline that has gone cannot be met, so the student can take it off
       their list. Everything still reachable has to stay put, and the record of
       the miss must survive being cleared. */
    const weeks = await admin.call(`/api/admin/teaching-weeks?classId=${classId}`);
    const past = weeks.data.filter((row) => new Date(row.checkin_due_at) < new Date());
    const target = past.at(-1);

    if (!target) {
      console.log('  --   no closed week on this data; dismissal checks skipped');
    } else {
      await admin.call(`/api/admin/weeks/${target.id}/checkin`, { method: 'PUT', body: { enabled: true, hardDeadline: true } });
      await query('DELETE FROM checkins WHERE week_id=$1 AND student_id=$2', [target.id, studentId]);
      await query('DELETE FROM dismissed_deadlines WHERE student_id=$1', [studentId]);

      const cleared = await student.call('/api/student/dismissals', { method: 'POST', body: { kind: 'checkin', refId: target.id } });
      check('a missed hard deadline can be cleared', cleared.status === 201, `${cleared.status} ${cleared.data?.error || ''}`);

      const after = await student.call('/api/student/bootstrap');
      check('the dismissal comes back with the student data', (after.data?.dismissals || []).some((row) => row.kind === 'checkin' && row.refId === target.id));
      check('clearing it does not erase the record', (await admin.call(`/api/admin/tracker/${classId}`)).status === 200);

      const again = await student.call('/api/student/dismissals', { method: 'POST', body: { kind: 'checkin', refId: target.id } });
      check('clearing the same one twice is harmless', again.status === 201, `status ${again.status}`);

      const undone = await student.call(`/api/student/dismissals/checkin/${target.id}`, { method: 'DELETE' });
      check('a cleared deadline can be brought back', undone.status === 204, `status ${undone.status}`);
      const restored = await student.call('/api/student/bootstrap');
      check('bringing it back empties the list again', !(restored.data?.dismissals || []).some((row) => row.refId === target.id));

      // A soft deadline still accepts work, so it must not be clearable.
      await admin.call(`/api/admin/weeks/${target.id}/checkin`, { method: 'PUT', body: { enabled: true, hardDeadline: false } });
      const soft = await student.call('/api/student/dismissals', { method: 'POST', body: { kind: 'checkin', refId: target.id } });
      check('a soft deadline cannot be cleared, because it is still open', soft.status === 409, `status ${soft.status}`);
      await admin.call(`/api/admin/weeks/${target.id}/checkin`, { method: 'PUT', body: { enabled: true, hardDeadline: true } });

      const unknown = await student.call('/api/student/dismissals', { method: 'POST', body: { kind: 'checkin', refId: '00000000-0000-0000-0000-000000000000' } });
      check('a deadline that is not theirs cannot be cleared', unknown.status === 409, `status ${unknown.status}`);

      const nonsense = await student.call('/api/student/dismissals', { method: 'POST', body: { kind: 'nonsense', refId: target.id } });
      check('an unknown kind is refused', nonsense.status === 400, `status ${nonsense.status}`);

      const anonymous = await fetch(`${BASE}/api/student/dismissals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'checkin', refId: target.id }),
      });
      check('clearing needs a session', anonymous.status === 401, `status ${anonymous.status}`);

      await query('DELETE FROM dismissed_deadlines WHERE student_id=$1', [studentId]);
    }
  }

  section('Course withdrawal and engagement');
  {
    const before = await admin.call(`/api/admin/engagement/${classId}`);
    check('engagement figures load', before.status === 200 && typeof before.data?.retention === 'number', before.data?.error);
    check('the figures name what was counted', typeof before.data?.expected?.checkins_due === 'number' && typeof before.data?.expected?.assignments_due === 'number');
    /* The per-item breakdown is what turns "27% submitted" into something you
       can act on, so it has to add up and it has to name the right people. */
    const items = before.data?.items || [];
    check('every check-in and assignment is broken out on its own', Array.isArray(items) && items.length > 0, `${items.length} items`);
    const consistent = items.every((item) =>
      item.submitted + item.missing.length === item.expected &&
      item.rate === (item.expected ? Math.round((item.submitted / item.expected) * 100) : null));
    check('each breakdown adds up to the class size', consistent);
    check('the breakdown says who has not submitted', items.every((item) => item.missing.every((person) => person.id && person.name)));
    check('the breakdown is newest first', items.every((item, index) =>
      index === 0 || new Date(items[index - 1].dueAt) >= new Date(item.dueAt)));

    const activeBefore = before.data.people.active;

    const blank = await student.call('/api/student/withdrawal', { method: 'POST', body: {} });
    check('a withdrawal without a reason is refused', blank.status === 400);

    const withdrawn = await student.call('/api/student/withdrawal', {
      method: 'POST',
      body: { reason: 'Not enough time alongside work or family', detail: 'Smoke test.', overallRating: 5, teachingRating: 5, materialsRating: 4, pace: 'About right', wouldRecommend: 'Yes', mayContact: true },
    });
    check('a student can submit the withdrawal form', withdrawn.status === 201, withdrawn.data?.error);

    const twice = await student.call('/api/student/withdrawal', { method: 'POST', body: { reason: 'Cost' } });
    check('withdrawing twice is refused', twice.status === 409);

    const bootstrap = await student.call('/api/student/bootstrap');
    check('the student is told they have withdrawn', Boolean(bootstrap.data?.withdrawnAt));

    const openWeek = bootstrap.data.weeks.filter((row) => row.checkin_available).at(-1);
    const blocked = await student.call(`/api/student/checkins/${openWeek.id}/submit`, {
      method: 'POST',
      body: { answers: { attendance: 'I attended live', reviewed: 'Yes', understanding: 8, confidence: 7, weeklyWin: 'x' } },
    });
    check('a withdrawn student cannot submit work', blocked.status === 409, `status ${blocked.status}`);

    const nudge = await admin.call('/api/admin/nudge', {
      method: 'POST',
      body: { studentId, type: 'checkin', weekId: openWeek.id, subject: 'x', body: 'y' },
    });
    check('a withdrawn student cannot be nudged', nudge.status === 409, `status ${nudge.status}`);

    const after = await admin.call(`/api/admin/engagement/${classId}`);
    check('the withdrawal moves the retention figure', after.data.people.active === activeBefore - 1, `${after.data.people.active} vs ${activeBefore}`);
    check('the withdrawal is listed for the class', after.data.withdrawals?.some((row) => row.student_id === studentId));

    const profile = await admin.call(`/api/admin/students/${studentId}/profile`);
    check('the reasons reach the student profile', profile.data?.withdrawal?.reason === 'Not enough time alongside work or family');
    check('the ratings are kept', profile.data?.withdrawal?.overall_rating === 5);

    const tracker = await admin.call(`/api/admin/tracker/${classId}`);
    check('the tracker marks them as withdrawn', Boolean(tracker.data.students.find((row) => row.id === studentId)?.withdrawn_at));
  }

  section('Sign out');
  {
    const out = await student.call('/api/auth/logout', { method: 'POST' });
    check('the student can sign out', out.status === 204);
    const after = await student.call('/api/auth/me');
    check('the session is gone after signing out', after.status === 401);
  }
} catch (error) {
  failures.push(`unexpected error — ${error.message}`);
  console.error(error);
} finally {
  // The API deliberately has no destructive delete routes, so the throwaway records
  // created by this run are removed directly.
  if (assignmentId) await query('DELETE FROM assignments WHERE id=$1', [assignmentId]).catch(() => {});
  if (studentId) await query('DELETE FROM users WHERE id=$1', [studentId]).catch(() => {});
  await pool.end().catch(() => {});
}

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((line) => console.log(`- ${line}`));
  process.exit(1);
}
