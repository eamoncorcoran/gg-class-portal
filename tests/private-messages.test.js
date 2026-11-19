import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Private messages.
   ------------------------------------------------------------------
   The private line was another company's chat widget loaded into one page.
   Messages left the portal, the teacher answered them somewhere else, and when
   the widget failed to load there was no line at all. It is now one long
   conversation per student, kept here, with an email to whoever was written to. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const messages = read('../src/messages.js');
const student = read('../src/routes/student.js');
const admin = read('../src/routes/admin.js');
const email = read('../src/email.js');

test('a student can only ever reach their own conversation', () => {
  const routes = student.slice(student.indexOf("router.get('/messages'"), student.indexOf("router.get('/bootstrap'"));
  // The id comes from the session. Nothing in these routes reads an id from the address or the body.
  assert.ok(!/req\.params|req\.query|studentId/.test(routes));
  assert.match(routes, /studentThread\(req\.user\.id\)/);
  assert.match(routes, /studentUnread\(req\.user\.id\)/);
  assert.match(routes, /studentSends\(req\.user, parsed\.data\.body, files\)/);
  // They sit behind the student gate, not above it.
  assert.ok(student.indexOf('router.use(requireStudent);') < student.indexOf("router.get('/messages'"));
});

test('the teacher side is in the administrator routes and checks who it is writing to', () => {
  assert.match(admin, /router\.get\('\/messages', asyncRoute/);
  // "unread" must be declared before the route that takes a student id, or it is read as one.
  assert.ok(admin.indexOf("router.get('/messages/unread'") < admin.indexOf("router.get('/messages/:studentId'"));
  assert.match(messages, /if \(!student \|\| student\.role !== 'student'\) throw Object\.assign\(new Error\('There is no such student\.'\), \{ status: 404 \}\);/);
  assert.match(messages, /if \(!student\.active\) throw/);
});

test('it is one conversation per student: a message belongs to a student, there is no thread to open or close', () => {
  const sql = read('../migrations/061_private_messages.sql');
  assert.match(sql, /student_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.ok(!/CREATE TABLE IF NOT EXISTS private_threads/.test(sql));
  assert.match(messages, /WHERE m\.student_id=\$1 ORDER BY m\.created_at, m\.id/);
});

test('opening a conversation is reading it, and answering is reading it', () => {
  assert.match(messages, /UPDATE private_messages SET read_at=now\(\) WHERE student_id=\$1 AND from_teacher=true AND read_at IS NULL/);
  const sends = messages.slice(messages.indexOf('export async function teacherSends'));
  assert.match(sends, /UPDATE private_messages SET read_at=now\(\) WHERE student_id=\$1 AND from_teacher=false AND read_at IS NULL/);
});

test('an email goes only for what is still unread after a quiet minute, once, with a run of messages folded into one', () => {
  const sweep = messages.slice(messages.indexOf('export async function announceMessages'));
  assert.match(sweep, /WHERE m\.emailed_at IS NULL AND m\.read_at IS NULL AND m\.created_at < \$1::timestamptz - make_interval\(secs => \$2\)/);
  // Claimed before the mail server is spoken to, so two sweeps cannot both send.
  assert.ok(sweep.indexOf('UPDATE private_messages SET emailed_at=now() WHERE id = ANY($1) AND emailed_at IS NULL RETURNING id') < sweep.indexOf('await sendPrivateMessageNotice('));
  assert.match(messages, /export const QUIET_SECONDS = 90;/);
  assert.match(read('../server.js'), /startMessageNotifier\(\);/);
});

test('the email carries the words as text, one way back, and is not paced like board notices', () => {
  const fn = email.slice(email.indexOf('export async function sendPrivateMessageNotice'), email.indexOf('export async function sendMockOralConfirmation'));
  assert.match(fn, /\$\{escapeHtml\(body\)\}/, 'what a student typed is never put into the page as markup');
  assert.match(fn, /priority: 'message',/);
  assert.match(fn, /`\$\{config\.appUrl\}\/teach\/messages\/\$\{student\.id\}`/);
  assert.match(fn, /`\$\{config\.appUrl\}\/message`/);
  assert.ok(!/PACED = new Set\(\[[^\]]*'message'/.test(email));
});

test('the page is the conversation, and the outside chat widget is gone from it', () => {
  const page = read('../web/src/pages/student/message-page.tsx');
  assert.ok(!/leadconnectorhq|chat-widget|mountChatWidget/.test(page.replace(/\/\/[^\n]*/g, '')));
  assert.match(page, /<Thread/);
  assert.match(page, /if \(me\.role !== "student"\) return <Navigate to=\{me\.isSuperAdmin \? "\/teach\/messages" : "\/teach"\} replace \/>;/);
  const thread = read('../web/src/components/app/message-thread.tsx');
  // A message is drawn as text. Nothing in the thread sets HTML from what somebody wrote.
  assert.ok(!/dangerouslySetInnerHTML/.test(thread));
  assert.match(read('../web/src/pages/teach/console-page.tsx'), /messages: lazy\(/);
});


test('a student writes to the teacher, not the staff: only the lead teacher reads or answers', () => {
  // Students have no route that names anybody else, so there is nobody else they can write to.
  const routes = student.slice(student.indexOf("router.get('/messages'"), student.indexOf("router.get('/bootstrap'"));
  assert.equal((routes.match(/router\.(get|post)\('\/messages/g) || []).length, 3);
  // Every teacher-side route sits behind the lead-teacher check.
  assert.ok(admin.indexOf("router.use('/messages', leadTeacherOnly);") > -1);
  assert.ok(admin.indexOf("router.use('/messages', leadTeacherOnly);") < admin.indexOf("router.get('/messages', asyncRoute"));
  assert.match(admin, /if \(req\.user\.isSuperAdmin\) return next\(\);/);
  // The teacher may write first, to any student.
  assert.match(admin, /router\.post\('\/messages\/:studentId', receiveMessageFiles, asyncRoute/);
  assert.match(read('../web/src/components/app/console.tsx'), /\{ id: "messages", label: "Private messages", icon: Mail01, superOnly: true \},/);
});

/* Read and unread in the teacher's inbox, and "Mark as unread".
   ------------------------------------------------------------------
   Reading a message and dealing with it are different things, so the teacher
   can put a conversation back to unread. That is the teacher's own note: it is
   kept away from the messages, because a message's read_at is what a student
   sees as "Seen". */
test('marking a conversation unread is the teacher\'s own note and changes nothing a student sees', () => {
  const mark = messages.slice(messages.indexOf('export async function markConversationUnread'), messages.indexOf('const clearMark'));
  assert.match(mark, /INSERT INTO private_message_marks\(student_id,marked_by\)/);
  assert.ok(!/UPDATE private_messages/.test(mark), 'read_at, which the student sees as Seen, is not touched');
  // Nothing on the student's side reads the mark.
  const side = messages.slice(messages.indexOf('/* ---- the student\'s side'), messages.indexOf('/* ---- the teacher\'s side'));
  assert.ok(!/private_message_marks|marked/i.test(side));
  const routes = student.slice(student.indexOf("router.get('/messages'"), student.indexOf("router.get('/bootstrap'"));
  assert.ok(!/unread'\s*,\s*asyncRoute\(async \(req, res\) => \{\s*const id/.test(routes), 'students have no mark-unread route');
  // The route is on the teacher side, behind the lead-teacher check.
  assert.ok(admin.indexOf("router.use('/messages', leadTeacherOnly);") < admin.indexOf("router.post('/messages/:studentId/unread'"));
});

test('a marked conversation counts as waiting until it is opened or answered', () => {
  assert.match(messages, /unread: conversations\.rows\.reduce\(\(sum, row\) => sum \+ \(row\.unread \|\| \(row\.marked_unread \? 1 : 0\)\), 0\),/);
  const thread = messages.slice(messages.indexOf('export async function teacherThread'), messages.indexOf('export async function teacherSends'));
  assert.match(thread, /await clearMark\(studentId\);/);
  const sends = messages.slice(messages.indexOf('export async function teacherSends'));
  assert.match(sends, /await clearMark\(studentId, \{ settled: true \}\);/);
  // The open page asks every few seconds; a request already on its way must not undo a mark just made.
  assert.match(messages, /AND marked_unread_at < now\(\) - interval '3 seconds'/);
});

test('the inbox can be shown as all, unread or read, and a conversation can be marked unread from it', () => {
  const page = read('../web/src/pages/teach/messages-section.tsx');
  assert.match(page, /const waiting = \(c: Inbox\["conversations"\]\[number\]\) => c\.unread > 0 \|\| Boolean\(c\.markedUnread\);/);
  assert.match(page, /\{ id: "all", label: "All" \},/);
  assert.match(page, /\{ id: "read", label: "Read" \},/);
  assert.match(page, /Mark as unread/);
  // Marking unread closes the conversation, since having it open is reading it.
  const fn = page.slice(page.indexOf('const markUnread = async'), page.indexOf('if (error && !data)'));
  assert.ok(fn.indexOf('/unread`') < fn.indexOf('nav("/teach/messages");'));
});
