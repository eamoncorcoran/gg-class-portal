import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The speaking practice, after the complaint that it was not taking many
   people's voices. The sounds the app plays were never shipped; Azure was
   never told what phrase to listen for; a tap to finish threw away Azure's
   last word; a rough early guess at a word was locked for good. */
const { evaluatePartial, normalize, matchGrade } = await import('../public/live/scoring.js');
const practice = fs.readFileSync(new URL('../public/live/practice.js', import.meta.url), 'utf8');
const relay = fs.readFileSync(new URL('../src/live/speech.js', import.meta.url), 'utf8');
const room = fs.readFileSync(new URL('../public/live/room.html', import.meta.url), 'utf8');

const words = (s) => s.split(/\s+/).filter(Boolean);
const fresh = (s) => new Array(words(s).length).fill(null);

test('the two sounds exist and are played from unlocked elements, not clones', () => {
  for (const f of ['success_sound.mp3', 'incorrect_sound.mp3']) {
    const size = fs.statSync(new URL(`../public/sounds/${f}`, import.meta.url)).size;
    assert.ok(size > 10000, `${f} is there`);
  }
  assert.match(practice, /function unlockSounds\(\)/);
  assert.match(practice, /unlockSounds\(\);/, 'unlocked on the mic tap');
  assert.match(practice, /playSound\(verdict === 'incorrect' \? sndIncorrect : sndSuccess\)/);
  assert.doesNotMatch(practice, /cloneNode\(\)\.play\(\)/);
});

test('a fair word is looked at again and only ever goes up', () => {
  const target = 'go raibh maith agat';
  let r = evaluatePartial(words(target), fresh(target), 'go raibh math');
  assert.equal(r.locked[2], 'goodEffort');
  r = evaluatePartial(words(target), r.locked, 'go raibh maith agat');
  assert.deepEqual(r.locked, ['correct', 'correct', 'correct', 'correct']);
  // Never down: a later, worse partial leaves a correct word correct.
  r = evaluatePartial(words(target), r.locked, 'go raibh math agat');
  assert.deepEqual(r.locked, ['correct', 'correct', 'correct', 'correct']);
});

test('a hyphen is a space to the ear, and a dash on its own is not a word to say', () => {
  const target = 'an mhaith';
  const r = evaluatePartial(words(target), fresh(target), 'an-mhaith');
  assert.deepEqual(r.locked, ['correct', 'correct']);
  const dashed = 'Dia duit – conas atá tú';
  const d = evaluatePartial(words(dashed), fresh(dashed), 'dia duit conas ata tu');
  assert.ok(!d.locked.includes(null), JSON.stringify(d.locked));
});

test('a two-letter word heard with one letter wrong is fair, not a fail', () => {
  assert.equal(matchGrade(normalize('tú'), 0.5), 'goodEffort');
  assert.equal(matchGrade(normalize('maith'), 0.5), null);
  const r = evaluatePartial(words('conas atá tú'), fresh('conas atá tú'), 'conas ata ta');
  assert.ok(!r.locked.includes(null), JSON.stringify(r.locked));
});

test('numbers Azure writes as digits are the words the class said', () => {
  const r = evaluatePartial(words('fiche euro'), fresh('fiche euro'), '20 euro');
  assert.deepEqual(r.locked, ['correct', 'correct']);
});

test('Azure is told the phrase before it hears a sound, and told when the student stops', () => {
  assert.match(relay, /path: speech\.context/);
  assert.match(relay, /dgi: \{ Groups: \[\{ Type: 'Generic', Items: items \}\] \}/);
  assert.match(relay, /msg\?\.type === 'phrase'/);
  assert.match(relay, /msg\?\.type === 'end' && !ended/);
  assert.match(relay, /wrapAudio\(requestId, Buffer\.alloc\(0\)\)/, 'an empty chunk ends the stream');
  // The listener is on before the settings are read, so nothing is dropped.
  const handler = relay.slice(relay.indexOf("wss.on('connection'"));
  assert.ok(handler.indexOf("client.on('message'") < handler.indexOf('await getSpeechConfig()'));
  assert.match(relay, /client\.on\('error'/);
  assert.match(practice, /ws\.send\(JSON\.stringify\(\{ type: 'phrase', text: currentTarget \}\)\)/);
});

test('a tap to finish keeps the socket open for the last word, and a dropped line is graded as it stands', () => {
  assert.match(practice, /practiceState = 'finishing';\s*stopCapture\(\);/);
  assert.match(practice, /ws\.send\(JSON\.stringify\(\{ type: 'end' \}\)\)/);
  assert.match(practice, /settleTimer = setTimeout\(settle, 1800\)/);
  assert.match(practice, /function onSocketGone\(\)/);
  assert.match(practice, /if \(locked\.some\(Boolean\)\) finalize\(\);/);
  // Audio before the relay opens is kept, not dropped; the replay voice cannot be heard as the student.
  assert.match(practice, /earlyAudio\.push\(pcm\.buffer\)/);
  assert.match(practice, /replayBtn\.disabled = true;/);
  assert.match(practice, /if \(!currentTarget \|\| replayBtn\.disabled\) return;/);
});

test('inside a breakout room the student is moved, heard and able to talk', () => {
  assert.match(room, /leaveOnPageUnload: false/, 'with it on, Zoom does not move an assigned participant');
  assert.match(room, /client\.on\('room-state-change'/);
  assert.match(room, /await client\.joinBreakoutRoom\(room\.roomId\)/);
  assert.match(room, /const audioButton = \(\) => zoomButton\('Join Audio'\) \|\| zoomButton\('Audio'\)/);
  assert.match(room, /await client\.mute\(false\)/);
  assert.match(room, /id="boLeave"/);
});

/* Eamon's iPhone, 5 Oct 2026: Zoom's "Unable to Join Audio". Zoom's own
   docs: the component view "is not supported on mobile or tablet browsers.
   For mobile and tablet use cases, use client view." So phones get the
   client view, with the same door, audio press and phrase card over it. */
test('a phone gets Zoom\'s client view, the desktop keeps the embedded one', () => {
  assert.match(room, /const mobile = !preview && !demo && \(\/iPhone\|iPad\|iPod\|Android\/i\.test\(navigator\.userAgent\)/);
  assert.match(room, /async function joinClientView\(/);
  assert.match(room, /zoom-meeting-6\.2\.0\.min\.js/);
  assert.match(room, /Z\.setZoomJSLib\('https:\/\/source\.zoom\.us\/6\.2\.0\/lib', '\/av'\)/);
  assert.match(room, /if \(mobile\) \{\s*await joinClientView\(/);
  assert.match(room, /<div id="zmmtg-root"><\/div>\s*<div id="aria-notify-area"><\/div>/);
  // Leaving sends Zoom to this page without wait=1, so it boots and joins again.
  assert.match(room, /back\.searchParams\.delete\('wait'\)/);
  // The host ending the class reaches the student through Zoom's own status.
  assert.match(room, /d\.meetingStatus === 3\) classOver\('ended by host'\)/);
  // Audio is recognised by what the client offers, and its sheet is closed after.
  assert.match(room, /disconnect audio\|\^\(mute\|unmute\)/);
  assert.match(room, /function closeAudioSheet\(\)/);
  // The phrase card stays above Zoom's full-page client.
  assert.match(room, /body\.clientview \.videowrap\{position:relative;z-index:2147483000/);
});
