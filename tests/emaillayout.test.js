import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* What arrives in a student's inbox.
   ------------------------------------------------------------------
   Every deadline reminder ever sent showed the student "Hi Kacey,\n\nJust a
   reminder that..." with the backslash and the n on screen. The templates were
   seeded through an ordinary single-quoted SQL string, where \n is a backslash
   and an n rather than a newline; only E'' interprets the escape. The code then
   split on real newlines, found none, and printed the lot as one paragraph with
   the escapes in it.

   Two things stop it coming back: the seed uses E-strings, and the rendering
   copes with a literal \n anyway, because typing one into a text box is an easy
   thing to do and nobody should have to know why it matters. */

const email = fs.readFileSync(new URL('../src/email.js', import.meta.url), 'utf8');
const seed = fs.readFileSync(new URL('../migrations/001_init.sql', import.meta.url), 'utf8');

const paragraphsFrom = (() => {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cut = email.slice(email.indexOf('function paragraphsFrom('));
  const body = cut.slice(0, cut.indexOf('\n}\n') + 2);
  return new Function('escapeHtml', `${body}; return paragraphsFrom;`)(escapeHtml);
})();

test('a literal backslash-n becomes a paragraph break, not two characters on screen', () => {
  const out = paragraphsFrom('Hi Kacey,\\n\\nJust a reminder.');
  assert.doesNotMatch(out, /\\n/, 'the escape must not reach the student');
  assert.equal((out.match(/<p /g) || []).length, 2);
});

test('a real newline works the same way', () => {
  const out = paragraphsFrom('Hi Kacey,\n\nJust a reminder.');
  assert.equal((out.match(/<p /g) || []).length, 2);
});

test('one line break inside a paragraph stays inside it', () => {
  const out = paragraphsFrom('One line\nsame paragraph');
  assert.equal((out.match(/<p /g) || []).length, 1);
  assert.match(out, /<br>/);
});

test('what somebody wrote is still escaped', () => {
  assert.match(paragraphsFrom('<script>alert(1)</script>'), /&lt;script&gt;/);
});

test('the seed cannot produce the bug again', () => {
  /* Single quotes here are what caused it. E'' is what interprets the escape. */
  assert.doesNotMatch(seed, /'body','Hi \{\{first_name\}\}/,
    'a body seeded through a plain quoted string keeps the backslashes');
  assert.equal((seed.match(/'body',E'/g) || []).length, 3,
    'all three reminder templates must be seeded as escape strings');
});

/* The email itself, as a piece of design. */
test('every email carries a preheader', () => {
  /* Without one the inbox list shows the first words of the body, which is how
     these appeared beside the subject as "Hi Kacey, Just a reminder that". */
  assert.match(email, /preheader = ''/, 'the layout must take one');
  assert.match(email, /mso-hide:all/, 'and hide it from the body itself');
  const uses = (email.match(/preheader:/g) || []).length;
  assert.ok(uses >= 6, `only ${uses} emails set a preheader; every one should`);
});

test('the button survives Outlook', () => {
  const cut = email.slice(email.indexOf('function layout('));
  const body = cut.slice(0, cut.indexOf('\n}\n'));
  /* Outlook drops padding on an inline anchor, and the button collapses into
     underlined text. A table cell holds its shape. */
  assert.match(body, /<td align="center" bgcolor="\$\{brand\}"/);
  assert.doesNotMatch(body, /display:flex|display:grid/, 'neither works in mail');
});

test('a reminder does not print the link and then offer a button to it', () => {
  const cut = email.slice(email.indexOf('export async function sendDeadlineReminder'));
  const body = cut.slice(0, cut.indexOf('\n}\n'));
  assert.match(body, /!line\.includes\(values\.assignment_link\)/,
    'the line naming the link is dropped, since the button is the link');
  assert.match(body, /buttonUrl: values\.assignment_link/);
});

test('every email goes through the one layout', () => {
  const senders = [...email.matchAll(/export async function (send\w+)\(/g)].map((m) => m[1])
    .filter((name) => name !== 'sendEmail');
  for (const name of senders) {
    const cut = email.slice(email.indexOf(`export async function ${name}(`));
    const body = cut.slice(0, cut.indexOf('\n}\n'));
    assert.match(body, /html: layout\(\{/, `${name} does not use the shared layout`);
  }
  assert.ok(senders.length >= 6, `expected to find the senders, saw ${senders.length}`);
});
