import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* A phone number on the student record, and a way to paste eighty of them.
   ------------------------------------------------------------------
   The list always arrives copied out of a spreadsheet, and the thing that makes
   or breaks an importer like this is what it does with the lines that are not
   perfect. The one that prompted it had duplicate students, names with fadas
   and apostrophes, a line with no number at all, and numbers written two
   different ways. */

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const bodyOf = (source, name) => {
  const cut = source.slice(source.indexOf(name));
  return cut.slice(0, cut.indexOf('\n}));'));
};

test('students are matched on email, never on name', () => {
  const body = bodyOf(admin, "router.post('/students/phone-import'");
  assert.match(body, /WHERE lower\(email\)=\$1 AND role='student'/);
  /* A name is not unique. The list that prompted this carried the same person
     twice, and matching on a name would have to guess which row was meant. */
  assert.doesNotMatch(body, /WHERE name=/);
});

test('a line that matches nobody is reported, not turned into a student', () => {
  const body = bodyOf(admin, "router.post('/students/phone-import'");
  assert.doesNotMatch(body, /INSERT INTO users/,
    'a typo in a spreadsheet must not quietly become an account');
  assert.match(body, /unknown\.push\(\{ line: row\.line, why: 'no student with that email' \}\)/);
});

test('a line with no number is reported rather than clearing the one on file', () => {
  const body = bodyOf(admin, "router.post('/students/phone-import'");
  assert.match(body, /if \(!row\.phone\) \{ noPhone\.push/,
    'a missing number is a gap in the list, not an instruction to wipe what is there');
});

test('tabs are read before commas, because a name can contain a comma', () => {
  const body = bodyOf(admin, "router.post('/students/phone-import'");
  assert.match(body, /line\.includes\('\\t'\) \? line\.split\('\\t'\) : line\.split\(','\)/);
});

test('a number is recognised however it is written', () => {
  const body = bodyOf(admin, "router.post('/students/phone-import'");
  /* 087 123 4567, +353 86 999 1234 and 087-111-2222 are all the same kind of
     thing, and a rule that only took one of them would silently drop the rest. */
  assert.match(body, /replace\(\/\[\^0-9\]\/g, ''\)\.length >= 7/);
});

test('the number is stored as it was written', () => {
  const migration = fs.readFileSync(
    new URL('../migrations/040_student_phone.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS phone text/);
  /* Reformatting a number into something its owner does not recognise makes it
     harder to check against a list, not easier. */
  assert.doesNotMatch(admin, /normalisePhone|formatPhone/);
});

test('a student is never shown their own number, and never asked for it', () => {
  /* Checked on the two ways it could reach them rather than on the word
     appearing anywhere: the session object every screen is built from, and a
     wildcard select in the student routes. */
  const session = fs.readFileSync(new URL('../src/session.js', import.meta.url), 'utf8');
  assert.doesNotMatch(session, /u\.phone/,
    'the session is on every student screen, so the number must not be in it');

  const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
  assert.doesNotMatch(student, /SELECT \* FROM users|SELECT u\.\* FROM users/,
    'a wildcard select would hand a student every column on their row');
  assert.doesNotMatch(student, /phone/i.test('') ? /$^/ : /u\.phone|,\s*phone\b/,
    'no student route may select the number');
});

test('the teacher can see it, edit it, and ring it', () => {
  assert.match(app, /function contactPanel\(student\)/);
  const body = app.slice(app.indexOf('function contactPanel('));
  const cut = body.slice(0, body.indexOf('\n}\n'));
  assert.match(cut, /href="tel:/);
  /* Stripped for the link, because a dialler does not want the spaces, while
     the field above it keeps them. */
  assert.match(cut, /replace\(\/\[\^0-9\+\]\/g, ''\)/);
});

test('an edit that does not mention the phone leaves it alone', () => {
  const body = bodyOf(admin, "router.patch('/students/:id'");
  assert.match(body, /parsed\.data\.phone === undefined \? student\.phone : \(parsed\.data\.phone \|\| null\)/,
    'renaming a student must not wipe their number, and clearing the box must clear it');
});

test('the contact export carries the number', () => {
  const body = bodyOf(admin, "router.get('/students/addresses.csv'");
  assert.match(body, /'Phone'/);
  assert.match(body, /row\.phone \|\| ''/);
});
