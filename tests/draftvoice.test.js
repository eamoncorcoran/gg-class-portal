import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKIN_SYSTEM, COMMUNITY_SYSTEM, HOMEWORK_VOICE, inEamonsVoice } from '../src/draftprompts.js';

/* These need no database and no API key. The voice is the product here, so the
   things that would quietly ruin it are worth pinning down. */

test('the scrub removes em dashes, which are the clearest sign a message was not typed by him', () => {
  assert.equal(
    inEamonsVoice('You are not behind — you are just in the middle of it.'),
    'You are not behind, you are just in the middle of it.',
  );
  // An en dash reads the same way on a phone, so it goes too.
  assert.equal(inEamonsVoice('one thing – then the next'), 'one thing, then the next');
  assert.ok(!inEamonsVoice('a — b – c').includes('—'));
});

test('the scrub upgrades the typed smiley he asked us to stop copying', () => {
  assert.equal(inEamonsVoice('Fáilte romhat! :)'), 'Fáilte romhat! 🙂');
  // Already an emoji, so nothing to do.
  assert.equal(inEamonsVoice('Maith thú 🙂'), 'Maith thú 🙂');
});

test('the scrub leaves ordinary punctuation and Irish alone', () => {
  const reply = 'Hey Niamh, ná bí buartha. One Sraith this week, learned properly.\nSay it out loud 🙂';
  assert.equal(inEamonsVoice(reply), reply);
});

test('the scrub survives nothing at all', () => {
  assert.equal(inEamonsVoice(null), '');
  assert.equal(inEamonsVoice(undefined), '');
});

/* The three rules that separate a reply of his from a support-desk reply. If a
   later edit drops one of them the drafts regress quietly, and nobody notices
   until a student reads one. */
test('every prompt forbids the em dash, the sign-off and the typed smiley', () => {
  for (const [name, prompt] of [['check-in', CHECKIN_SYSTEM], ['community', COMMUNITY_SYSTEM], ['homework', HOMEWORK_VOICE]]) {
    assert.match(prompt, /Never use an em dash/, `${name} prompt lost the em dash rule`);
    assert.match(prompt, /No sign-off/, `${name} prompt lost the sign-off rule`);
    assert.match(prompt, /Write 🙂 rather than/, `${name} prompt lost the emoji rule`);
  }
});

test('the prompts practise what they preach', () => {
  for (const [name, prompt] of [['check-in', CHECKIN_SYSTEM], ['community', COMMUNITY_SYSTEM], ['homework', HOMEWORK_VOICE]]) {
    assert.ok(!prompt.includes('—'), `${name} prompt contains an em dash`);
  }
});

test('the check-in prompt is written against the form the students actually fill in', () => {
  for (const field of ['attendance', 'reviewed', 'understanding', 'confidence', 'weeklyWin', 'support']) {
    assert.match(CHECKIN_SYSTEM, new RegExp(field), `check-in prompt never mentions ${field}`);
  }
});

test('the community prompt keeps private matters off a board every student can read', () => {
  assert.match(COMMUNITY_SYSTEM, /Do not answer publicly/);
  assert.match(COMMUNITY_SYSTEM, /An Caighdeán Oifigiúil/);
});
