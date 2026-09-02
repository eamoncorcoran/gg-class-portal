/**
 * Calls every route the server defines, and reports the ones that break.
 *
 *   BASE_URL=http://localhost:3111 npm run audit-routes
 *
 * The route-coverage test proves each address the interface asks for exists.
 * That is a different and much weaker claim than the address working: a route
 * can exist, be reachable, and still throw the moment it touches the database.
 * Nothing was calling these, so nothing knew.
 *
 * Every GET is called against real records created here and removed again at the
 * end. A GET should never change anything, so they can all be swept blind; the
 * mutating routes are exercised deliberately by the smoke test instead, because
 * a blind POST is as likely to test the validator as the route.
 *
 * What counts as a failure is narrow on purpose. A 400 or a 404 from a route
 * given a plausible id is a route working — it looked, and said no. A 5xx is the
 * server falling over, and that is what this is for.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { pool, query, one } from '../src/db.js';
import { hashPassword } from '../src/security.js';

const BASE = (process.env.BASE_URL || process.env.APP_URL
  || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.');
  process.exit(1);
}

const MOUNTS = {
  'admin.js': '/api/admin', 'student.js': '/api/student', 'auth.js': '/api/auth',
  'settings.js': '/api/settings', 'media.js': '/api/media', 'zoom.js': '/api/zoom',
};

function definedRoutes() {
  const dir = new URL('../src/routes/', import.meta.url);
  const routes = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(new URL(file, dir), 'utf8');
    const mount = MOUNTS[file];
    if (mount === undefined) continue;
    for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      const path = match[2] === '/' ? '' : match[2];
      routes.push({ method: match[1].toUpperCase(), path: `${mount}${path}`, file });
    }
  }
  return routes;
}

function actor() {
  const jar = new Map();
  return {
    async call(path, { method = 'GET', body } = {}) {
      const headers = {};
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (body !== undefined) headers['content-type'] = 'application/json';
      let response;
      try {
        response = await fetch(`${BASE}${path}`, {
          method, headers, body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'manual',
        });
      } catch (error) {
        return { status: 0, data: { error: error.message } };
      }
      for (const cookie of response.headers.getSetCookie?.() || []) {
        const [pair] = cookie.split(';');
        const index = pair.indexOf('=');
        const value = pair.slice(index + 1);
        if (value) jar.set(pair.slice(0, index), value); else jar.delete(pair.slice(0, index));
      }
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { nonJson: text.slice(0, 200) }; }
      return { status: response.status, data };
    },
  };
}

const stamp = Date.now();
const admin = actor();
const student = actor();
const fixture = {};
const failures = [];
let called = 0;

/** A real record of every kind a route parameter might name. */
async function buildFixture() {
  const klass = await one(
    `INSERT INTO classes(programme_name,day_of_week,start_time,timezone,starts_on,ends_on)
     VALUES ($1,1,'19:00','Europe/Dublin','2026-09-07','2027-06-01') RETURNING *`,
    [`Audit ${stamp}`]);
  const studentRow = await one(
    `INSERT INTO users(role,name,email,password_hash,active) VALUES ('student',$1,$2,$3,true) RETURNING *`,
    [`Audit Student`, `audit.${stamp}@gaeilgeoirguides.test`, await hashPassword(`Audit!Pass${stamp}aA9`)]);
  await query('INSERT INTO class_students(class_id,student_id) VALUES ($1,$2)', [klass.id, studentRow.id]);

  const week = await one(
    `INSERT INTO weeks(class_id,week_start,checkin_release_at,checkin_due_at,checkin_enabled)
     VALUES ($1,'2026-09-07', now() - interval '1 day', now() + interval '5 days', true) RETURNING *`,
    [klass.id]);
  const assignment = await one(
    `INSERT INTO assignments(class_id,week_id,title,instructions,visible_at,deadline_at,status)
     VALUES ($1,$2,'Audit homework','Do the thing', now() - interval '1 day', now() + interval '3 days','published') RETURNING *`,
    [klass.id, week.id]);
  const thread = await one(
    `INSERT INTO discussion_threads(class_id,author_id,title,body)
     VALUES ($1,$2,'Audit thread','Body of the audit thread') RETURNING *`,
    [klass.id, studentRow.id]);
  const post = await one(
    `INSERT INTO discussion_posts(thread_id,author_id,body) VALUES ($1,$2,'Audit comment') RETURNING *`,
    [thread.id, studentRow.id]);
  const checkin = await one(
    `INSERT INTO checkins(week_id,student_id,status,answers,submitted_at)
     VALUES ($1,$2,'submitted','{}'::jsonb,now()) RETURNING *`, [week.id, studentRow.id]);
  const submission = await one(
    `INSERT INTO homework_submissions(assignment_id,student_id,status,submitted_at)
     VALUES ($1,$2,'submitted',now()) RETURNING *`, [assignment.id, studentRow.id]);

  Object.assign(fixture, {
    class: klass.id, student: studentRow.id, week: week.id, assignment: assignment.id,
    thread: thread.id, post: post.id, checkin: checkin.id, submission: submission.id,
    studentEmail: studentRow.email, studentPassword: `Audit!Pass${stamp}aA9`,
  });

  // Optional records: only if the tables exist in this schema.
  const course = await one(
    `INSERT INTO courses(title,description,published) VALUES ('Audit course','Summary',true) RETURNING *`)
    .catch(() => null);
  if (course) fixture.course = course.id;
  return fixture;
}

async function teardown() {
  await query('DELETE FROM classes WHERE programme_name=$1', [`Audit ${stamp}`]).catch(() => {});
  await query('DELETE FROM users WHERE email=$1', [fixture.studentEmail]).catch(() => {});
  if (fixture.course) await query('DELETE FROM courses WHERE id=$1', [fixture.course]).catch(() => {});
}

/* Which real record a parameter names, read from the segment before it. The
   route says what it is looking at: /weeks/:id wants a week, and
   /community/thread/:id wants a thread. */
const BY_SEGMENT = {
  classes: 'class', class: 'class', tracker: 'class', attendance: 'class', community: 'class',
  students: 'student', student: 'student',
  weeks: 'week', week: 'week',
  assignments: 'assignment', assignment: 'assignment',
  thread: 'thread', threads: 'thread',
  post: 'post', posts: 'post', replies: 'post',
  checkins: 'checkin', checkin: 'checkin',
  homework: 'submission', submissions: 'submission', submission: 'submission',
  courses: 'course', course: 'course',
};

function fill(path) {
  const parts = path.split('/');
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part.startsWith(':')) { out.push(part); continue; }
    const name = part.slice(1);
    // The parameter's own name first, then whatever the previous segment names.
    let key = null;
    if (/^class/i.test(name)) key = 'class';
    else if (/^student/i.test(name)) key = 'student';
    else if (/^week/i.test(name)) key = 'week';
    else if (/^assignment/i.test(name)) key = 'assignment';
    else if (/^course/i.test(name)) key = 'course';
    else key = BY_SEGMENT[parts[i - 1]] ?? null;
    const value = key && fixture[key];
    out.push(value || '00000000-0000-0000-0000-000000000000');
  }
  return out.join('/');
}

function record(who, route, filled, result) {
  called += 1;
  /* A 5xx is the server falling over. Everything else — including 400 and 404 —
     is the route answering, which is all a blind sweep can ask of it. */
  if (result.status >= 500 || result.status === 0) {
    failures.push({
      who, method: route.method, path: filled, status: result.status,
      detail: JSON.stringify(result.data).slice(0, 220),
    });
    console.log(`  FAIL ${result.status} ${route.method} ${filled}  ${JSON.stringify(result.data).slice(0, 140)}`);
  }
}

try {
  const login = await admin.call('/api/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (login.status !== 200) { console.error('Could not sign in as administrator:', login.status, login.data); process.exit(1); }

  await buildFixture();
  const studentLogin = await student.call('/api/auth/login', { method: 'POST', body: { email: fixture.studentEmail, password: fixture.studentPassword } });
  if (studentLogin.status !== 200) console.error('Warning: could not sign in as the audit student:', studentLogin.status, studentLogin.data);

  const routes = definedRoutes();
  const gets = routes.filter((route) => route.method === 'GET');
  console.log(`\nSweeping ${gets.length} GET routes of ${routes.length} defined, against real records.\n`);

  for (const route of gets) {
    const filled = fill(route.path);
    const who = route.path.startsWith('/api/student') ? student : admin;
    const label = route.path.startsWith('/api/student') ? 'student' : 'admin';
    record(label, route, filled, await who.call(filled));
  }

  console.log(`\n${called} routes called, ${failures.length} failing.`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  ${failure.status} ${failure.method} ${failure.path}\n      ${failure.detail}`);
  }
} finally {
  await teardown();
  await pool.end();
}

process.exit(failures.length ? 1 : 0);
