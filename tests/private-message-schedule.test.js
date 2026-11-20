import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { personalise } from '../src/messages.js';

/* A private message to a whole class, sent later.
   ------------------------------------------------------------------
   Each student gets their own copy with their first name in it, written by
   the minute sweep at the chosen moment as if the teacher had typed it then.
   Withdrawn students and anybody named as left out never get one. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const messages = read('../src/messages.js');

test('[First name] becomes the student’s own first name, whatever the case', () => {
  assert.equal(personalise('Hi [First name] 👋', 'Megan Kelly-Buggy'), 'Hi Megan 👋');
  assert.equal(personalise('Hi [first name], hi [FIRST NAME]', 'Áine Ní Bhriain'), 'Hi Áine, hi Áine');
  assert.equal(personalise('Hi [First name]', '   '), 'Hi there');
});

test('recipients are enrolled, active, not withdrawn, and never anybody left out by name', () => {
  assert.match(messages, /cs\.class_id=\$1 AND cs\.active AND u\.role='student' AND u\.active AND u\.withdrawn_at IS NULL/);
  assert.match(messages, /normalize\('NFD'\)/, 'names are matched without regard to accents');
});

test('a scheduled copy is claimed in the statement that picks it, and sent without the burst guard', () => {
  assert.match(messages, /UPDATE private_message_schedule SET sent_at=\$1\s+WHERE id IN \(SELECT id FROM private_message_schedule WHERE send_at <= \$1 AND sent_at IS NULL AND cancelled_at IS NULL/);
  assert.match(messages, /send\(teacher \|\| \{ id: row\.teacher_id, name: 'Teacher' \}, row\.student_id, row\.body, \[\], \{ burst: false \}\)/);
  assert.match(messages, /if \(burst\) await guardBurst\(teacher\.id\);/);
  assert.match(messages, /await sendDueMessages\(\)\.catch[\s\S]*await announceMessages\(\)/, 'what is due goes out before the email sweep looks');
});

test('the routes sit before /messages/:studentId so "schedule" is never read as a student id', () => {
  const admin = read('../src/routes/admin.js');
  const schedule = admin.indexOf("router.post('/messages/schedule'");
  const send = admin.indexOf("router.post('/messages/:studentId'");
  assert.ok(schedule > -1 && schedule < send);
  assert.ok(admin.indexOf("router.get('/messages/scheduled'") < admin.indexOf("router.get('/messages/:studentId'"));
  assert.match(read('../migrations/065_private_message_schedule.sql'), /CREATE TABLE IF NOT EXISTS private_message_schedule/);
});
