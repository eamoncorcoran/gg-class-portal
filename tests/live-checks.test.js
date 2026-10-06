import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Checking the class during a live session, and the report after it.
   ------------------------------------------------------------------
   The teacher asks the room something (do you understand, rate it, a pop
   quiz) and the answers come back as events on the session. What is pinned
   here: a typed quiz answer is judged kindly, the questions go to students
   without their answers, the room is told when the class ends from the
   portal too, and the report renders. */

const { answerMatches, cleanQuestions, publicPrompt } = await import('../src/live/room.js');
const { renderReportPdf } = await import('../src/live/report.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const room = read('../public/live/room.html');
const console_ = read('../public/live/teacher.html');
const routes = read('../src/routes/live.js');
const migration = read('../migrations/053_live_sessions.sql');
const roomServer = read('../src/live/room.js');

test('a quiz answer is judged on what was meant, not the fadas or a slipped key', () => {
  assert.equal(answerMatches('Bhi me', ['bhí mé']), true, 'missing fadas');
  assert.equal(answerMatches('  go raibh maith agat!  ', ['go raibh maith agat']), true, 'punctuation and space');
  assert.equal(answerMatches('go raibh math agat', ['go raibh maith agat']), true, 'one letter out in a long answer');
  assert.equal(answerMatches('bhíos', ['bhí mé', 'bhíos']), true, 'any of the accepted answers');
  assert.equal(answerMatches('slan', ['go raibh maith agat']), false, 'a different answer');
  assert.equal(answerMatches('te', ['tá']), false, 'a short word has to be the word');
  assert.equal(answerMatches('', ['tá']), false, 'nothing typed');
});

test('the teacher types answers loosely and the quiz keeps only real questions', () => {
  const qs = cleanQuestions([
    { q: ' Say hello ', a: 'Dia duit | Dia dhuit' },
    { q: 'No answer given', a: '   ' },
    { q: '', a: 'orphan answer' },
    { q: 'Comma list', answers: 'a, b; c / d' },
  ]);
  assert.deepEqual(qs, [
    { q: 'Say hello', answers: ['Dia duit', 'Dia dhuit'] },
    { q: 'Comma list', answers: ['a', 'b', 'c', 'd'] },
  ]);
  assert.equal(cleanQuestions(Array.from({ length: 12 }, (_, i) => ({ q: `Q${i}`, a: 'x' }))).length, 8, 'eight questions at most');
  assert.deepEqual(cleanQuestions('not a list'), []);
});

test('students see the questions and never the answers', () => {
  const pub = publicPrompt({ id: 'p1', kind: 'quiz', topic: 'Warm-up', created_at: 'now', questions: [{ q: 'Say hello', answers: ['Dia duit'] }], session_id: 's' });
  assert.deepEqual(pub, { id: 'p1', kind: 'quiz', topic: 'Warm-up', createdAt: 'now', questions: [{ index: 0, q: 'Say hello' }] });
  assert.equal(JSON.stringify(pub).includes('Dia duit'), false);
});

test('the routes are the teacher’s to ask and the student’s to answer', () => {
  assert.match(routes, /router\.post\('\/prompt', requireAdmin/);
  assert.match(routes, /router\.post\('\/prompt\/:id\/close', requireAdmin/);
  assert.match(routes, /router\.get\('\/prompt\/:id\/results', requireAdmin/);
  assert.match(routes, /router\.post\('\/respond', requireStudent/);
  assert.match(routes, /router\.post\('\/presence', requireStudent/);
  assert.match(routes, /router\.get\('\/sessions', requireAdmin/);
  assert.match(routes, /router\.get\('\/sessions\/:id\/report\.pdf', requireAdmin/);
  assert.match(routes, /Content-Disposition.*class-report-/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS live_sessions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS live_prompts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS live_events/);
  assert.match(migration, /kind text NOT NULL CHECK \(kind IN \('understand', ?'rating', ?'quiz', ?'enjoy'\)\)/);
});

test('how the class was is kept even when the console has already ended the session', () => {
  // The page names the session it means, and the server takes a recently ended one.
  assert.match(room, /post\('\/api\/live\/respond', \{ kind: 'enjoy', score, sessionId: sid \}\)/);
  assert.match(room, /post\('\/api\/live\/respond', \{ kind: 'idea', text, sessionId: sid \}\)/);
  assert.match(roomServer, /await recentSession\(body\?\.sessionId\) \|\| access\.sessionId/);
  assert.match(roomServer, /ended_at > now\(\) - interval '4 hours'/);
  // The portal's own End session reaches students outside the Zoom.
  assert.match(roomServer, /broadcastToStudents\(\{ type: 'ended', sessionId: sid \}\)/);
  // Wherever a session ends, its row is closed and the room told: End session, a fresh Go live, a changed link.
  assert.equal((roomServer.match(/await closeSessionRow\(\)/g) || []).length, 3);
  assert.match(roomServer, /if \(nextUrl !== access\.joinUrl\) \{ await closeSessionRow\(\);/);
  // Answers are written against the check's own session, and the console hears about every check that changed.
  assert.equal((roomServer.match(/, prompt\.session_id\);/g) || []).length, 4);
  assert.match(roomServer, /const promptStatsPending = new Set\(\)/);
  assert.match(room, /if \(!\(await sendAnswer\(pr, \{ promptId: pr\.id, kind: 'understand', yes \}\)\)\) return;/);
  assert.match(room, /if \(enjoy\) setTimeout\(\(\) => askForIdeas\(sid\), 1900\); else closeSoon\(1700\);/);
  assert.match(room, /d\.type === 'ended'\) return sessionEnded\(d\)/);
  assert.match(room, /function sessionEnded\(d\)\{\s*if \(preview \|\| inMeeting\) return;/);
});

test('the room has the overlay, the confetti, the full-screen switch and the questions drawer', () => {
  assert.match(room, /<div class="prompt" id="prompt" hidden>/);
  assert.match(room, /<canvas id="confetti">/);
  assert.match(room, /<button class="fsbtn" id="fsBtn"/);
  assert.match(room, /<button class="qfab" id="qfab" hidden>/);
  assert.match(room, /body\.preview \.prompt\{pointer-events:none\}/, 'the console preview never traps the teacher behind a prompt');
  assert.match(room, /tellPortal\(\{ type: 'fullscreen', on \}\)/);
  assert.match(room, /if \(d && d\.type === 'prompt'\) return showPrompt\(d\.prompt\)/);
  assert.match(room, /if \(d && d\.type === 'prompt-close'\) return hidePrompt\(d\.id\)/);
});

test('the console asks, sees results as they come, and lists the reports, two columns on an iPad', () => {
  for (const id of ['ckUnderstand', 'ckRating', 'quizRows', 'quizAdd', 'quizLaunch', 'ckEnjoy', 'checkResults', 'sessions', 'sessionsRefresh']) {
    assert.ok(console_.includes(`id="${id}"`), `#${id} is on the console`);
  }
  assert.match(console_, /d\.type==='promptstats'/);
  assert.match(console_, /report\.pdf/);
  assert.match(console_, /@media\(min-width:900px\) and \(max-width:1240px\)/);
  // The old check's closing figures arriving late never cover the new one.
  assert.match(console_, /if \(shownCheck && shownCheck\.id !== r\.id && !r\.open\) return;/);
});

test('the report renders as a PDF from a session’s data', async () => {
  const data = {
    session: { id: 's1', startedAt: '2026-10-05T18:00:00.000Z', endedAt: '2026-10-05T19:00:00.000Z', minutes: 60, classes: 'Irish for Primary Teaching', rosterSize: 2 },
    attendance: [{ id: 'u1', name: 'Aoife', first: '2026-10-05T18:01:00.000Z', last: '2026-10-05T18:59:00.000Z', left: '2026-10-05T18:59:00.000Z', minutes: 58 }],
    absent: ['Sarah'],
    students: [{ name: 'Aoife', minutes: 58, passed: 4, skipped: 1, failedAttempts: 2, quizCorrect: 1, quizTotal: 2, enjoyed: 9 }],
    phrases: [{ irish: 'Dia duit', passed: 1, skipped: 0, unfinished: 0, attempts: 2 }],
    hardWords: [{ word: 'raibh', wrong: 2, fair: 1, right: 3 }],
    checks: [
      { kind: 'understand', topic: 'an aimsir chaite', at: 'x', responded: 2, yes: 1, notYet: ['Aoife'] },
      { kind: 'rating', topic: 'an tuiseal ginideach', at: 'x', responded: 1, average: 8, low: [] },
      { kind: 'quiz', topic: 'Warm-up', at: 'x', total: 2, responded: 1, finished: 1,
        questions: [{ q: 'Say hello', answer: 'Dia duit', correct: 1, answered: 1, commonWrong: [] }, { q: 'Say thanks', answer: 'go raibh maith agat', correct: 0, answered: 1, commonWrong: ['slan (1)'] }],
        students: [{ name: 'Aoife', correct: 1, answered: 2, total: 2 }] },
    ],
    enjoyment: { responded: 1, average: 9, distribution: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0] },
    ideas: [{ name: 'Aoife', text: 'More songs' }],
  };
  const pdf = await renderReportPdf(data);
  assert.ok(Buffer.isBuffer(pdf) && pdf.length > 1500, `a PDF of ${pdf.length} bytes`);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const bare = await renderReportPdf({ session: { id: 's2', startedAt: '2026-10-05T18:00:00.000Z', endedAt: null, minutes: 1, classes: 'Every class', rosterSize: 0 }, attendance: [], absent: [], students: [], phrases: [], hardWords: [], checks: [], enjoyment: { responded: 0, average: null, distribution: Array(10).fill(0) }, ideas: [] });
  assert.equal(bare.subarray(0, 5).toString(), '%PDF-', 'an empty class still has a report');
});
