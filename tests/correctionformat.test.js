import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CORRECTION_FORMAT, HOMEWORK_VOICE, inEamonsVoice } from '../src/draftprompts.js';

/* The prompts are written wrapped, so a phrase can have a line break in the
   middle of it. Comparing on one line asks whether the instruction is there
   rather than how it happens to be laid out. */
const flat = (text) => String(text).replace(/\s+/g, ' ');

/* How a correction reads, and how the note under it sounds.
   ------------------------------------------------------------------
   Both of these were being decided by a prompt stored in the database, which
   meant the shape of the student's screen depended on a settings row somebody
   could edit without knowing what it was for. The layout now lives in code and
   is appended last, so an older stored prompt cannot quietly reinstate the
   thing it replaced. */

test('the word "Correction" is gone from the format', () => {
  /* It was a label on every line of a list that is obviously a list of
     corrections, and it pushed the thing being read further along the line. */
  assert.doesNotMatch(CORRECTION_FORMAT, /Correction:/);
  assert.match(flat(CORRECTION_FORMAT), /Never write the word "Correction"/);
});

test('the part that changed is bolded, not the whole line', () => {
  assert.match(CORRECTION_FORMAT, /wrapped in double asterisks/);
  assert.match(flat(CORRECTION_FORMAT), /Bold only the words that actually changed, never the whole line/);
  // And the worked example shows it rather than only describing it.
  assert.match(CORRECTION_FORMAT, /\*\*Bhí\*\* mé go maith inné/);
});

test('the format has the last word over anything stored', () => {
  const ai = fs.readFileSync(new URL('../src/ai.js', import.meta.url), 'utf8');
  const fn = ai.slice(ai.indexOf('export async function draftHomeworkFeedback'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  const order = ['prompts.correctionPrompt', 'CORRECTION_FORMAT', 'HOMEWORK_VOICE']
    .map((name) => body.indexOf(name));
  assert.ok(order.every((at) => at !== -1), 'all three must be in the instructions');
  assert.ok(order[0] < order[1] && order[1] < order[2],
    'the stored prompt must come first, so the format in code overrides it');
});

test('a short reply is allowed to be short', () => {
  /* Every reply being the same length whatever the work was like is one of the
     things that makes feedback read as written by a machine. */
  assert.match(flat(HOMEWORK_VOICE), /Great job Aoife/);
  assert.match(flat(HOMEWORK_VOICE), /short really does mean short/);
  assert.doesNotMatch(flat(HOMEWORK_VOICE), /[Tt]wo or three short lines/,
    'a fixed length is what made every reply the same shape');
});

test('the phrases that give it away are named', () => {
  for (const tell of ['keep up the good work', 'I hope this helps', 'Well done on completing']) {
    assert.ok(flat(HOMEWORK_VOICE).includes(tell), `the prompt should name "${tell}" as one to avoid`);
  }
});

/* The one rule that runs through everything here. */
test('no em dash anywhere in what the app writes', () => {
  assert.doesNotMatch(CORRECTION_FORMAT, /—/);
  assert.doesNotMatch(HOMEWORK_VOICE, /—/);
  assert.match(flat(CORRECTION_FORMAT), /Do not use an em dash/,
    'corrections are not passed through the scrub, so the prompt has to say it');
});

test('an em dash that gets through is taken out on the way', () => {
  assert.equal(inEamonsVoice('Well done — really good work'), 'Well done, really good work');
  assert.doesNotMatch(inEamonsVoice('one — two – three'), /[—–]/);
});

/* Corrections are deliberately not scrubbed: rewriting punctuation inside a
   student's corrected Irish would change the correction. */
test('corrections are left exactly as written', () => {
  const ai = fs.readFileSync(new URL('../src/ai.js', import.meta.url), 'utf8');
  const fn = ai.slice(ai.indexOf('export async function draftHomeworkFeedback'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /corrections: parsed\.corrections\?\.trim\(\)/,
    'the corrected Irish must not be passed through the voice scrub');
  assert.match(body, /generalFeedback: inEamonsVoice\(/,
    'but the note underneath must be');
});
