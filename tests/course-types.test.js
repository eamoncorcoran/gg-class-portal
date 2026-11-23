/* Course types: Irish for Primary Teaching (taught) and Hibernia (on demand).
   A Hibernia student sees their course and the private line, nothing else, and
   the two groups are never enrolled in each other's courses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkPackage, VIDEO_HOSTS } from '../src/courseimport.js';
import { COURSE_TYPE_KEYS, isOnDemand, taughtClass } from '../src/coursetypes.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('a class is Irish for Primary Teaching unless it is made a Hibernia one', () => {
  const sql = read('../migrations/067_course_types.sql');
  assert.match(sql, /course_type text NOT NULL DEFAULT 'irish_for_primary'/);
  assert.deepEqual(COURSE_TYPE_KEYS, ['irish_for_primary', 'hibernia']);
  assert.ok(isOnDemand('hibernia'));
  assert.ok(!isOnDemand('irish_for_primary'));
  assert.equal(taughtClass('c'), "c.course_type NOT IN ('hibernia')");
});

test('an on-demand class has no weeks, sittings, reminders, live room or tracker class', () => {
  assert.match(read('../src/weeks.js'), /if \(isOnDemand\(classRow\.course_type\)\) return/);
  assert.match(read('../src/reminders.js'), /FROM classes c WHERE c\.active=true AND \$\{taughtClass\('c'\)\}/);
  assert.match(read('../src/live/classes.js'), /taughtClass\('c'\)/);
  assert.match(read('../src/calendar.js'), /taughtClass\('c'\)/);
  // the student's class (board, homework, check-ins) is never the Hibernia one
  assert.match(read('../src/routes/student.js'), /async function studentClass[\s\S]{0,400}taughtClass\('c'\)/);
  assert.match(read('../src/routes/admin.js'), /router\.get\('\/class-dates'[\s\S]{0,600}taughtClass\('c'\)/);
});

test('past questions and papers are closed to a student whose courses are all on demand', () => {
  const wall = read('../src/wall.js');
  assert.match(wall, /isPastQuestionsPath\(req\.path\) && \(await studentAccess\(user\.id\)\)\.coursesOnly/);
  assert.match(wall, /status\(403\)/);
  const access = read('../src/coursetypes.js');
  assert.match(access, /coursesOnly: courseTypes\.length > 0 && courseTypes\.every\(isOnDemand\)/);
});

test('each student is sent the courses of their own classes only', () => {
  const hub = read('../src/routes/hub.js');
  assert.match(hub, /const courses = allCourses\.filter\(\(c\) => viewer\.admin\s+\|\| \(c\.open_to_all && !viewer\.coursesOnly\)\s+\|\| \(c\.class_ids \|\| \[\]\)\.some\(\(id\) => mine\.has\(id\)\)\);/);
  // one cached answer per set of classes, never one for everybody
  assert.match(hub, /student:\$\{viewer\.coursesOnly \? 'courses' : 'hub'\}:\$\{viewer\.classIds\.join\(','\)\}/);
  // no board, no class, no timetable for an on-demand student
  assert.match(hub, /if \(signedIn && classId && !viewer\.coursesOnly\)/);
  assert.match(hub, /const classes = viewer\.coursesOnly \? \[\] :/);
  // a lesson waiting for its video is not shown
  assert.match(hub, /!waiting\.has\(l\.id\)/);
});

test('the Hibernia hub is Courses and the private line, nothing else', () => {
  const main = read('../web/src/main.tsx');
  const only = main.slice(main.indexOf('const CoursesOnlyApp'), main.indexOf('const App = '));
  for (const path of ['/courses', '/courses/:id', '/courses/:id/:lesson', '/message', '/account']) assert.ok(only.includes(`path="${path}"`), path);
  for (const path of ['/community', '/questions', '/papers', '/tracker', '/live', '/t/:slug']) assert.ok(!only.includes(`path="${path}"`), path);
  assert.match(only, /<Route path="\*" element=\{<Navigate to="\/courses" replace \/>\} \/>/);
  assert.match(main, /coursesOnly \? <CoursesOnlyApp \/> : <App \/>/);
  const side = read('../web/src/components/app/app-sidebar.tsx');
  assert.match(side, /me\?\.role === "student" && me\.coursesOnly \?/);
  const tabs = read('../web/src/components/app/mobile-tabs.tsx');
  assert.match(tabs, /\[courses, menu\]/);
});

test('a Hibernia student is not asked for a photograph and gets a letter about their course', () => {
  const admin = read('../src/routes/admin.js');
  assert.match(admin, /const askForPhoto = !isOnDemand\(klass\.course_type\);/);
  const email = read('../src/email.js');
  assert.match(email, /const onDemand = courseType === 'hibernia';/);
  assert.ok(!/—/.test(email.slice(email.indexOf('sendStudentInvite'), email.indexOf('sendStudentInvite') + 3000)), 'no em dashes in the letter');
});

test('the teacher can filter students, classes and messages by course type', () => {
  assert.match(read('../src/routes/admin.js'), /COURSE_TYPE_KEYS\.includes\(req\.query\.courseType\)/);
  assert.match(read('../src/messages.js'), /courseType: row\.course_type \|\| null/);
  assert.match(read('../web/src/pages/teach/people-section.tsx'), /label="Course type"/);
  assert.match(read('../web/src/pages/teach/messages-section.tsx'), /label="Course type"/);
});

test('a course package is checked before anything is written', () => {
  const good = { title: 'T', modules: [{ title: 'S', lessons: [{ title: 'L', video: 'https://cdn.courses.apisystem.tech/x.mp4' }, { title: 'R', notes: 'Read me' }] }] };
  assert.deepEqual(checkPackage(good), []);
  assert.ok(checkPackage({ title: 'T', modules: [] }).length);
  assert.ok(checkPackage({ title: 'T', modules: [{ title: 'S', lessons: [{ title: 'L' }] }] }).some((p) => /neither a video nor notes/.test(p)));
  // a video only from the known course hosts, never the server's own network
  for (const bad of ['http://cdn.courses.apisystem.tech/x.mp4', 'https://169.254.169.254/latest', 'https://localhost/x.mp4', 'not a url']) {
    assert.ok(checkPackage({ title: 'T', modules: [{ title: 'S', lessons: [{ title: 'L', video: bad }] }] }).some((p) => /not on a host/.test(p)), bad);
  }
  assert.ok(VIDEO_HOSTS.has('cdn.courses.apisystem.tech'));
});

test('the Hibernia course package, if present, is whole and has no em dashes', () => {
  const file = new URL('../data/course-packages/hibernia-irish-interview.json', import.meta.url);
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!/—/.test(text));
  const pkg = JSON.parse(text);
  assert.deepEqual(checkPackage(pkg), []);
  const lessons = pkg.modules.flatMap((m) => m.lessons);
  assert.equal(lessons.length, 47);
});

test('an imported video is fetched once onto the video network as soon as it can be played', () => {
  const imp = read('../src/courseimport.js');
  assert.match(imp, /switched \+= 1;\s+warmVideo\(row\.bunny_ref\)/);
  assert.match(imp, /const PLAYER_REFERER = 'https:\/\/iframe\.mediadelivery\.net\/';/);
  assert.match(read('../src/routes/admin.js'), /router\.post\('\/course-imports\/:courseId\/warm', requireSuperAdmin/);
});
