import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Bold and italics, without ever putting somebody's HTML on the page.
   ------------------------------------------------------------------
   The order is the whole safety argument: escape everything first, so by the
   time the markers are turned into tags the text is already inert. Get that
   backwards and a comment on a class board becomes a way to run script in a
   teacher's browser. */

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

/* Lifted out and run, rather than asserted about, because what matters here is
   what it does to real input. */
const richText = (() => {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const source = app.slice(app.indexOf('function richText('));
  const body = source.slice(0, source.indexOf('\n}\n') + 2);
  return new Function('escapeHtml', `${body}; return richText;`)(escapeHtml);
})();

test('bold and italics come through', () => {
  assert.equal(richText('**bold**'), '<strong>bold</strong>');
  assert.equal(richText('*soft*'), '<em>soft</em>');
  assert.equal(richText('**a** and *b*'), '<strong>a</strong> and <em>b</em>');
});

test('nothing anybody types becomes HTML', () => {
  assert.equal(richText('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  // Escaped first, so the tag inside the bold markers is text by the time it is bolded.
  assert.equal(richText('**<img onerror=x>**'), '<strong>&lt;img onerror=x&gt;</strong>');
  assert.equal(richText('<b onmouseover="steal()">hi</b>'),
    '&lt;b onmouseover=&quot;steal()&quot;&gt;hi&lt;/b&gt;');
});

test('bold is read before italics', () => {
  /* The other way round, ** is two italic markers wrapping nothing and the text
     comes out with stray tags in it. */
  assert.doesNotMatch(richText('**bold**'), /<em>/);
});

test('a marker does not run past the end of a line', () => {
  /* A stray asterisk at the end of a paragraph would otherwise italicise
     everything down to the next one. */
  const out = richText('one * two\nthree * four');
  assert.doesNotMatch(out, /<em>/);
  assert.match(out, /<br>/);
});

test('an ordinary asterisk stays an asterisk', () => {
  assert.equal(richText('2 * 3 = 6'), '2 * 3 = 6');
  assert.equal(richText('stray * here'), 'stray * here');
});

test('line breaks survive', () => {
  assert.equal(richText('a\nb'), 'a<br>b');
});

/* Wherever somebody writes, they get the buttons; wherever it is read back, the
   formatting has to be rendered, or they wrote asterisks at each other. */
test('every box that takes formatting has the buttons over it', () => {
  for (const target of ['composer-body', 'reply-body', 'homework-corrections',
    'homework-general', 'checkin-feedback']) {
    assert.ok(app.includes(`formatBar('${target}')`), `${target} has no formatting buttons`);
  }
});

test('and every place it is read back renders it', () => {
  for (const call of ['richText(comment.body)', 'richText(thread.body)',
    'richText(written)', 'richText(corrections)', 'richText(general)']) {
    assert.ok(app.includes(call), `${call} is missing, so formatting is shown as asterisks`);
  }
});

test('pressing bold twice takes it off again', () => {
  const fn = app.slice(app.indexOf('function wrapSelection('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /before\.endsWith\(marker\) && after\.startsWith\(marker\)/,
    'the button appears to promise a toggle, so it has to be one');
});

test('the buttons act on mousedown, before the box loses its selection', () => {
  const fn = app.slice(app.indexOf('function bindFormatBars('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /addEventListener\('mousedown'/,
    'on click the selection is already gone and bold wraps nothing');
});
