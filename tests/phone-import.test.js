import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Phone numbers onto profiles.
   ------------------------------------------------------------------
   Two ways in: a pasted list and the student spreadsheet. Both look before
   they write, both spell a number the way it reads on a form, and both treat a
   person who is already on the portal as somebody to update rather than an
   error. */

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const tidyPhone = new Function(`${admin.slice(admin.indexOf('function tidyPhone'), admin.indexOf('\n}', admin.indexOf('function tidyPhone')) + 2)}; return tidyPhone;`)();

test('a number is written the way it reads on a form', () => {
  /* Exports carry Irish mobiles as 353877097020: no plus, no spaces. Stored
     like that the Call link dials a twelve-digit local number. */
  assert.equal(tidyPhone('353877097020'), '+353 87 709 7020');
  assert.equal(tidyPhone('0877097020'), '+353 87 709 7020', 'written at home with a leading zero');
  assert.equal(tidyPhone('16463036358'), '+16463036358', 'another country keeps its digits behind a plus');
  assert.equal(tidyPhone('919690900402'), '+919690900402');
  // Already typed by a person: left exactly as it was.
  assert.equal(tidyPhone('+353 87 709 7020'), '+353 87 709 7020');
  assert.equal(tidyPhone('087 709 7020'), '087 709 7020');
  assert.equal(tidyPhone(''), null);
  assert.equal(tidyPhone('abc'), null);
});

test('the spreadsheet updates a student who exists instead of refusing them', () => {
  const route = admin.slice(admin.indexOf("router.post('/students/import'"));
  const body = route.slice(0, route.indexOf('\n}));'));
  assert.match(body, /const existing = await one\('SELECT id, name, phone FROM users WHERE lower\(email\)=\$1'/);
  assert.match(body, /status: 'updated'/);
  assert.match(body, /status: 'unchanged'/, 'a number already on the profile is not an update');
  assert.match(body, /status: 'duplicate'/, 'the same email twice in one sheet is written once');
  /* Nothing is written on a preview, and the audit entry is only for a real
     import, so a look is not recorded as a change. */
  assert.match(body, /if \(!preview\) await query\('UPDATE users SET phone=\$1, updated_at=now\(\) WHERE id=\$2'/);
  assert.match(body, /if \(preview\) \{ results\.push\(\{ name, email, phone, status: 'created'/);
  assert.match(body, /if \(!preview\) \{\s*\n\s*await audit\(/);
});

test('the pasted list looks first, collapses repeats, and knows when there is nothing to do', () => {
  const route = admin.slice(admin.indexOf("router.post('/students/phone-import'"));
  const body = route.slice(0, route.indexOf('\n}));'));
  assert.match(body, /preview: z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(body, /phone: tidyPhone\(phone\)/, 'the same spelling as the spreadsheet');
  assert.match(body, /if \(seen\.has\(row\.email\)\) continue;/);
  assert.match(body, /if \(student\.phone === row\.phone\) \{ unchanged\.push/);
  assert.match(body, /if \(!preview\) await query\('UPDATE users SET phone=\$1, updated_at=now\(\) WHERE id=\$2'/);
  assert.match(body, /res\.json\(\{ preview, unchanged,/);
});

test('both dialogs check first and only then offer to apply', () => {
  // The spreadsheet dialog.
  assert.match(app, /id="run-student-import">Check the file</);
  assert.match(app, /button\.dataset\.mode = willWrite \? 'apply' : 'preview';/);
  assert.match(app, /Nothing is written until you have seen what the file would do\./);
  // The paste dialog.
  assert.match(app, /id="do-phone-import" data-mode="preview">Check the list</);
  assert.match(app, /const preview = button\.dataset\.mode !== 'apply';/);
  /* And the result line tells the truth about which step it was. */
  assert.match(app, /\$\{result\.preview \? 'to save' : 'saved'\}/);
  assert.match(app, /Nothing is written yet: press Apply\./);
});
