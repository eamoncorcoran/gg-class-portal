import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Files posted to a class board used to be written into the publicly served
   uploads directory, so a PDF on a private board was readable by anybody with
   the address — unlisted rather than private, which is the exact property that
   ruled out putting the recordings on YouTube. */

const media = fs.readFileSync(new URL('../src/routes/media.js', import.meta.url), 'utf8');
const adminRoutes = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const community = fs.readFileSync(new URL('../src/community.js', import.meta.url), 'utf8');

test('board and lesson uploads are written to the private directory', () => {
  const board = adminRoutes.slice(adminRoutes.indexOf("router.post('/community/attachments'"), adminRoutes.indexOf("router.patch('/community/thread/:id'"));
  assert.match(board, /privateUploadDir, storedName/, 'a board attachment is still written to the public directory');

  const lesson = adminRoutes.slice(adminRoutes.indexOf("router.post('/lessons/:id/attachments'"), adminRoutes.indexOf("router.delete('/lesson-attachments/:id'"));
  assert.match(lesson, /privateUploadDir, storedName/, 'a lesson handout is still written to the public directory');
});

test('their addresses are the authenticated route, not the public path', () => {
  assert.match(community, /\/api\/media\/attachment\/post\/\$\{row\.id\}/);
  assert.match(adminRoutes, /\/api\/media\/attachment\/lesson\/\$\{row\.id\}/);
});

test('serving one checks class membership', () => {
  const start = media.indexOf("router.get('/attachment/:kind/:id'");
  assert.ok(start !== -1, 'the attachment route is gone');
  const route = media.slice(start, media.indexOf('const SOURCES', start));

  // Signed in at all is not enough; it has to be your class.
  assert.match(route, /class_students WHERE class_id=\$1 AND student_id=\$2 AND active=true/);
  // A removed post's attachment goes with it, for students.
  assert.match(route, /row\.deleted_at\) return res\.status\(404\)/);
  // An unknown kind is refused rather than interpolated into SQL.
  assert.match(route, /ATTACHMENT_SOURCES\[req\.params\.kind\]/);
  assert.match(route, /if \(!sql\) return res\.status\(404\)/);
});

test('assignment resources stay public on purpose, and that is written down', () => {
  /* Not every file should be behind auth: homework resources are handed out
     with the assignment. The distinction should be deliberate and stated. */
  assert.match(media, /Assignment resources are deliberately still public/);
});
