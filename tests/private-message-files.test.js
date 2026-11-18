import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Attachments and voice notes on private messages.
   ------------------------------------------------------------------
   Everybody may attach files. A student may send only a PDF or a Word
   document; the teacher may send more kinds, and may record a voice note,
   which a student may not. What a file is, is read from the file. */

const { sniffFile, checkMessageFiles, STUDENT_KINDS, TEACHER_KINDS, MAX_FILE_MB } = await import('../src/messagefiles.js');
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const bytes = (...head) => Buffer.concat([Buffer.from(head), Buffer.alloc(64, 0x20)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);
const file = (buffer, originalname, mimetype = 'application/octet-stream') => ({ buffer, originalname, mimetype, size: buffer.length });
const sent = (files, voice, body = {}) => ({ files: { ...(files ? { files } : {}), ...(voice ? { voice: [voice] } : {}) }, body });

test('a file is what its first bytes say, not what it is called', () => {
  assert.equal(sniffFile(PDF, 'essay.pdf'), 'pdf');
  assert.equal(sniffFile(PDF, 'essay.docx'), 'pdf', 'a PDF under another name is still a PDF');
  assert.equal(sniffFile(ZIP, 'essay.docx'), 'docx');
  assert.equal(sniffFile(OLE, 'essay.doc'), 'doc');
  assert.equal(sniffFile(PNG, 'photo.png'), 'png');
  assert.equal(sniffFile(EXE, 'essay.pdf'), null, 'a program named .pdf is nothing we take');
  assert.equal(sniffFile(ZIP, 'archive.zip'), null, 'a bare zip is not a document');
  assert.equal(sniffFile(OLE, 'sheet.xls'), null);
});

test('a student may send a PDF or a Word document and nothing else', () => {
  assert.deepEqual([...STUDENT_KINDS].sort(), ['doc', 'docx', 'pdf']);
  const ok = checkMessageFiles(sent([file(PDF, 'essay.pdf'), file(ZIP, 'aiste.docx'), file(OLE, 'old.doc')]), { role: 'student' });
  assert.deepEqual(ok.map((f) => f.mimeType), [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ]);
  for (const refused of [file(PNG, 'photo.png', 'image/png'), file(EXE, 'essay.pdf', 'application/pdf'), file(ZIP, 'slides.pptx'), file(ZIP, 'stuff.zip')]) {
    assert.throws(() => checkMessageFiles(sent([refused]), { role: 'student' }), /cannot be sent\. You can attach a PDF or a Word document\./);
  }
});

test('a student may not send a voice note; the teacher may', () => {
  const voice = file(Buffer.alloc(200, 1), 'recording.webm', 'audio/webm;codecs=opus');
  assert.throws(() => checkMessageFiles(sent(null, voice), { role: 'student' }), (error) => error.status === 403 && /Voice notes are for the teacher/.test(error.message));
  const out = checkMessageFiles(sent(null, voice, { voiceSeconds: '42' }), { role: 'admin' });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'voice');
  assert.equal(out[0].seconds, 42);
  assert.equal(out[0].mimeType, 'audio/webm');
  // Something that is not audio cannot ride in as a voice note.
  assert.throws(() => checkMessageFiles(sent(null, file(EXE, 'recording.webm', 'application/x-msdownload')), { role: 'admin' }), /cannot be played back/);
  assert.throws(() => checkMessageFiles(sent(null, voice, { voiceSeconds: String(16 * 60) }), { role: 'admin' }), /limited to 15 minutes/);
});

test('the teacher may send more kinds, but still only from a list, and nothing over the size', () => {
  assert.ok(TEACHER_KINDS.includes('png') && TEACHER_KINDS.includes('pptx') && TEACHER_KINDS.includes('mp3'));
  assert.equal(checkMessageFiles(sent([file(PNG, 'photo.png'), file(ZIP, 'slides.pptx')]), { role: 'admin' }).length, 2);
  assert.throws(() => checkMessageFiles(sent([file(EXE, 'setup.exe')]), { role: 'admin' }), /not a kind of file that can be sent here/);
  const big = { buffer: PDF, originalname: 'huge.pdf', mimetype: 'application/pdf', size: (MAX_FILE_MB + 1) * 1024 * 1024 };
  assert.throws(() => checkMessageFiles(sent([big]), { role: 'student' }), (error) => error.status === 413);
});

test('a file is opened only by the student whose conversation it is, or the teacher', () => {
  const media = read('../src/routes/media.js');
  const route = media.slice(media.indexOf("router.get('/message-file/:id'"));
  assert.match(route, /const mine = req\.user\.role === 'student' && file\.student_id === req\.user\.id;/);
  assert.match(route, /if \(!mine && !\(await mayReadAsTeacher\(req\.user\)\)\) return res\.status\(403\)/);
  // Kept in the private store under a random name, never in the public uploads folder.
  const store = read('../src/messagefiles.js');
  assert.match(store, /const storedName = `message-\$\{crypto\.randomUUID\(\)\}\$\{file\.ext\}`;/);
  assert.match(store, /path\.join\(config\.privateUploadDir, storedName\)/);
  // And behind the sign-in like every media route.
  assert.ok(media.indexOf('router.use(requireAuth);') < media.indexOf("router.get('/message-file/:id'"));
});

test('each side is checked by its own rule where the message arrives', () => {
  assert.match(read('../src/routes/student.js'), /const files = checkMessageFiles\(req, \{ role: 'student' \}\);/);
  assert.match(read('../src/routes/admin.js'), /const files = checkMessageFiles\(req, \{ role: 'admin' \}\);/);
  // The student's page offers no microphone; the teacher's does.
  assert.ok(!/canVoice/.test(read('../web/src/pages/student/message-page.tsx')));
  assert.match(read('../web/src/pages/teach/messages-section.tsx'), /canVoice/);
  assert.match(read('../web/src/lib/messages.ts'), /export const STUDENT_ACCEPT = "\.pdf,\.doc,\.docx";/);
});

test('the private line is at the foot of the menu on every page, with what is unread', () => {
  const side = read('../web/src/components/app/app-sidebar.tsx');
  assert.match(side, /<NavRow href=\{lineHref\} icon=\{DuoMail\} current=\{active === "message"\} badge=\{unread\}>/);
  assert.match(side, /const lineHref = me\?\.role === "admin" \? "\/teach\/messages" : "\/message";/);
  assert.match(side, /const hasLine = Boolean\(me\) && !\(me\?\.role === "admin" && !me\.isSuperAdmin\);/);
  assert.match(read('../web/src/components/app/mobile-tabs.tsx'), /t\.id === "menu" && unread > 0/);
});

test('an email names what was attached and does not carry it', () => {
  const email = read('../src/email.js');
  const fn = email.slice(email.indexOf('export async function sendPrivateMessageNotice'), email.indexOf('export async function sendMockOralConfirmation'));
  assert.match(fn, /`\[Attached: \$\{file\.file_name\}\]`/);
  assert.match(fn, /listen in the hub\]/);
  assert.ok(!/attachments:/.test(fn), 'the file itself stays in the hub');
});
