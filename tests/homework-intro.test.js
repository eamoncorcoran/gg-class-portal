import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The instructions a teacher writes on the assign form were stored and never
   shown. They are now a page of their own that a student reads before the
   first question, with the video and files on it, and a way back to it from
   any question. */
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');

test('a homework with instructions opens on the explanation page, once', () => {
  assert.match(app, /function renderHomeworkIntro\(\)/);
  assert.match(app, /if \(homeworkHasIntro\(data\.assignment\) && !started\) renderHomeworkIntro\(\); else renderHomeworkStep\(\);/);
  // The page carries what the teacher wrote, formatted the way the board is.
  assert.match(app, /class="hw-intro-text">\$\{richText\(assignment\.instructions\)\}/);
  assert.match(app, /id="homework-start">\$\{started \? 'Back to the questions' : 'Start the homework'\}/);
});

test('the questions keep a way back to the instructions, and do not repeat the video', () => {
  assert.match(app, /id="homework-instructions">Instructions<\/button>/);
  assert.match(app, /else if \(hasIntro\) renderHomeworkIntro\(\);/);
  assert.match(app, /form\.step === 0 && !hasIntro \? loomEmbed\(assignment\.loom_url\)/);
  assert.match(css, /\.hw-intro-text\{/);
});

test('the assign form says what the field is for', () => {
  assert.match(app, /<label>Instructions page \$\{formatBar\('assignment-instructions'\)\}<\/label>/);
  assert.match(app, /Students read this as a page of its own, then press Start\./);
  // The student route still hands the instructions over while the work is open.
  assert.match(student, /open \? assignment : \{ \.\.\.assignment, questions: \[\], instructions: '' \}/);
});
