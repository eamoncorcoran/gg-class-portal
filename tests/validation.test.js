import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { z } from 'zod';
import { problemFrom, FIELD_NAMES } from '../src/validation.js';

/* Why a form would not save, in words that name the field.
   ------------------------------------------------------------------
   Every route answered any validation failure with one fixed sentence written
   for the likeliest case, so a description one character over its limit was
   told to give the course a title. */

const say = (schema, body, fallback = 'the old fixed sentence') => {
  const r = schema.safeParse(body);
  return r.success ? 'OK' : problemFrom(r.error, FIELD_NAMES, fallback);
};

test('the field that failed is the field that is named', () => {
  assert.equal(say(z.object({ description: z.string().max(4000) }), { description: 'x'.repeat(4001) }),
    'The description is too long: at most 4000 characters.');
  assert.equal(say(z.object({ dictionary: z.array(z.string().max(120)).max(200) }), { dictionary: Array(201).fill('a') }),
    'The personal dictionary can have at most 200 items.');
  assert.equal(say(z.object({ dictionary: z.array(z.string().max(120)) }), { dictionary: ['a', 'b'.repeat(121)] }),
    'Dictionary line 2 is too long: at most 120 characters.');
  assert.equal(say(z.object({ durationSeconds: z.coerce.number().int() }), { durationSeconds: 'ninety' }),
    'The duration has to be a number.');
  assert.equal(say(z.object({ checkinNotes: z.string().max(4000) }), { checkinNotes: 'x'.repeat(4001) }),
    'The check-in notes are too long: at most 4000 characters.');
  assert.equal(say(z.object({ title: z.string().min(2) }), { title: 'T' }), 'The title needs at least 2 characters.');
  assert.equal(say(z.object({ title: z.string().min(1) }), {}), 'Fill in the title.');
  assert.equal(say(z.object({ joinUrl: z.string().url() }), { joinUrl: 'zoom.us/j/1' }),
    'The class link has to be a full web address starting with https://');
  assert.equal(say(z.object({ questions: z.array(z.object({ prompt: z.string().min(1) })) }), { questions: [{ prompt: 'a' }, { prompt: '' }] }),
    'Question 2: Fill in the question text.');
  assert.equal(say(z.object({ status: z.enum(['draft', 'published']) }), { status: 'live' }),
    'The status has to be one of: draft, published.');
});

test('an Eircode that is too short gets the Eircode hint, not a character count', () => {
  /* The route had a good sentence about Eircodes, but a length check ran first
     and said "fill in your Eircode" to somebody who had. */
  assert.match(say(z.object({ eircode: z.string().trim().min(6).max(10) }), { eircode: 'A65' }),
    /seven characters, like A65 F4E2/);
});

test('the fixed sentence survives as the fallback, so nothing gets worse', () => {
  assert.equal(problemFrom(null, FIELD_NAMES, 'the old fixed sentence'), 'the old fixed sentence');
  assert.equal(say(z.object({ x: z.custom(() => false) }), { x: 1 }), 'the old fixed sentence');
});

test('no route answers a validation failure with a bare fixed sentence any more', () => {
  /* The pattern that produced the family. If it comes back, so does the bug. */
  for (const file of ['settings.js', 'admin.js', 'student.js']) {
    const src = fs.readFileSync(new URL(`../src/routes/${file}`, import.meta.url), 'utf8');
    const bare = src.match(/if \(!parsed\.success\) return res\.status\(400\)\.json\(\{ error: '[^']*' \}\);/g) || [];
    assert.equal(bare.length, 0, `${file} still has ${bare.length} refusal(s) that name nothing: ${bare[0]}`);
    assert.match(src, /import \{ FIELD_NAMES, problemFrom \} from '\.\.\/validation\.js';/);
  }
});
