/**
 * The live room: one session at a time, keyed by class.
 *
 * The teacher pushes a phrase; every student in the room gets it over a
 * server-sent stream and practises it aloud. Questions are private threads
 * between one student and the teacher; students never see each other. All of
 * it lives in memory, because it is the state of one evening's class, and the
 * bit that must survive a restart (who may join) is a one-row table.
 *
 * Identity is the portal's session: a student is req.user, a teacher is an
 * administrator. There is no gate to type a name into any more.
 */
import { one, query } from '../db.js';
import { liveClass, studentClassIds, parseWebinar } from './classes.js';
import { ttsFor } from './tts.js';

/* ---- the session: which link, which classes, who may join ------------- */
/* classIds: the classes this session is for (any number; none means every
   class). joinUrl/joinNote: the Zoom link the teacher is hosting today; when
   blank, the first class's own link from Class setup is used instead. */
export const access = { mode: 'open', classIds: [], joinUrl: '', joinNote: '', meetingId: '', startedAt: null, sessionId: null };
Object.defineProperty(access, 'classId', { get: () => access.classIds[0] || '' });
/* The host's own door into the meeting the portal created. Carries the
   host's key, so it lives in memory for this run only, never in the table. */
let hostStartUrl = '';

/* A class is an hour, an extra session a few. What nobody remembers to do is
   press End session after closing Zoom: the first real class stayed "live"
   on ninety students' tabs for a day. So live has a shelf life, after which
   the session counts as over on its own, and Go live starts a fresh one. */
export const LIVE_MAX_MS = 5 * 60 * 60 * 1000;
export function isLive(session = access, now = Date.now()) {
  if (!session.startedAt || !session.joinUrl) return false;
  const since = now - new Date(session.startedAt).getTime();
  return since >= 0 ? since < LIVE_MAX_MS : true;
}

export async function loadAccess() {
  const row = await one('SELECT mode, class_id, class_ids, join_url, join_note, meeting_id, started_at, session_id FROM live_access WHERE id=1');
  access.mode = row?.mode === 'entitled' ? 'entitled' : 'open';
  access.classIds = Array.isArray(row?.class_ids) && row.class_ids.length ? row.class_ids : (row?.class_id ? [row.class_id] : []);
  access.joinUrl = row?.join_url || '';
  access.joinNote = row?.join_note || '';
  access.meetingId = row?.meeting_id || '';
  access.startedAt = row?.started_at ? new Date(row.started_at) : null;
  access.sessionId = row?.session_id || null;
  if (access.sessionId) currentPrompt = await openPromptFor(access.sessionId);
  return access;
}
async function saveAccess() {
  await query(`UPDATE live_access SET mode=$1, class_id=$2, class_ids=$3, join_url=$4, join_note=$5, meeting_id=$6, started_at=$7, session_id=$8, updated_at=now() WHERE id=1`,
    [access.mode, access.classIds[0] || null, access.classIds, access.joinUrl, access.joinNote, access.meetingId, access.startedAt, access.sessionId]);
}

/* ---- the evening, written down ---------------------------------------- */
/* Everything a student does in a session is one row: present, left, a
   phrase said or skipped (with each word's grade), an answer to a check, a
   quiz answer, how they found the class. Nothing is written without a
   session to belong to, which is what being live means. */
export async function logEvent(studentId, kind, payload = {}, sessionId = access.sessionId) {
  if (!sessionId) return;
  try {
    await query('INSERT INTO live_events(session_id, student_id, kind, payload) VALUES ($1,$2,$3,$4::jsonb)',
      [sessionId, studentId || null, kind, JSON.stringify(payload)]);
  } catch (error) { console.error('live event not written', error?.message); }
}
export async function recordPresence(user, state) {
  const kind = state === 'left' ? 'left' : 'present';
  await logEvent(user.id, kind, { name: user.name });
  return { ok: true };
}

/** Live right now, and for this student (or for everyone). */
export async function liveFor(userId) {
  if (!isLive()) return false;
  if (!access.classIds.length) return true;
  const ids = await classesOf(userId);
  return ids.some((id) => access.classIds.includes(id));
}

/* A student's classes, cached a minute: ten thousand joins must not mean ten
   thousand queries, and a class change shows within the minute. */
const classCache = new Map(); // userId -> { at, ids }
export async function classesOf(userId) {
  const kept = classCache.get(userId);
  if (kept && Date.now() - kept.at < 60 * 1000) return kept.ids;
  const ids = await studentClassIds(userId);
  classCache.set(userId, { at: Date.now(), ids });
  return ids;
}

/** The one choke point: may this person take part in the current session? */
export async function studentGate(user) {
  if (!user) return { ok: false, error: 'Sign in to join the live class.' };
  if (user.role === 'admin') return { ok: true };
  if (access.mode !== 'entitled' || !access.classIds.length) return { ok: true };
  const ids = await classesOf(user.id);
  if (!ids.some((id) => access.classIds.includes(id))) return { ok: false, error: 'This live session is for a different class. Open it from your own course page.' };
  return { ok: true };
}

/* ---- the phrase on screen, and who is in the room --------------------- */
let phraseSeq = 0;
export let currentPhrase = { id: 0, show: false, irish: '', english: '', phonetic: '' };
let phraseResults = { id: 0, passed: new Set(), skipped: new Set() };
const listeners = new Set();           // { res, who, cid }
const presentStudents = new Map();     // cid -> connection count

function addPresence(cid) { presentStudents.set(cid, (presentStudents.get(cid) || 0) + 1); }
function dropPresence(cid) {
  const n = (presentStudents.get(cid) || 0) - 1;
  if (n > 0) presentStudents.set(cid, n); else presentStudents.delete(cid);
}
function phraseStats() {
  const students = presentStudents.size;
  const passed = phraseResults.passed.size;
  const skipped = phraseResults.skipped.size;
  const noAction = Math.max(0, students - passed - skipped);
  return { type: 'phrasestats', phraseId: phraseResults.id, passed, skipped, noAction, students };
}

/* Results arrive in bursts. Coalesce them so the teacher gets a smooth
   update rather than one frame per student. */
let statsTimer = null, statsDirty = false;
function scheduleStats(force) {
  if (force) { if (statsTimer) { clearTimeout(statsTimer); statsTimer = null; } statsDirty = false; return toTeachers(phraseStats()); }
  statsDirty = true;
  if (statsTimer) return;
  statsTimer = setTimeout(() => { statsTimer = null; if (statsDirty) { statsDirty = false; toTeachers(phraseStats()); } }, 200);
}

function broadcastPhrase() {
  const data = sseFrame(currentPhrase);
  for (const l of listeners) sseWrite(l.res, data);
}

/* ---- server-sent streams ---------------------------------------------- */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};
function sseFrame(obj) { return `data: ${JSON.stringify(obj)}\n\n`; }
function sseWrite(res, frame) { try { res.write(frame); } catch { /* closed */ } }
function sseSend(res, obj) { sseWrite(res, sseFrame(obj)); }

const MAX_STREAM_CLIENTS = Number(process.env.MAX_STREAM_CLIENTS || 25000);

export function phraseStream(req, res) {
  const who = req.user.role === 'admin' ? 'teacher' : 'student';
  if (who === 'student' && listeners.size >= MAX_STREAM_CLIENTS) return res.status(503).json({ error: 'The class is full right now.' });
  res.set(SSE_HEADERS);
  res.flushHeaders();
  const cid = who === 'student' ? req.user.id : null;
  const entry = { res, who, cid };
  listeners.add(entry);
  if (cid) { addPresence(cid); scheduleStats(); }
  sseSend(res, currentPhrase);
  if (currentPrompt && !currentPrompt.closed_at) sseSend(res, { type: 'prompt', prompt: publicPrompt(currentPrompt) });
  // Staggered, so thousands of clients do not all wake the process together.
  const ping = setInterval(() => sseWrite(res, ': ping\n\n'), 25000 + Math.floor(Math.random() * 10000));
  const done = () => { clearInterval(ping); listeners.delete(entry); if (cid) { dropPresence(cid); scheduleStats(); } };
  req.on('close', done);
  res.on('error', done);
}

export function recordResult(user, body) {
  const phraseId = Number(body?.phraseId) || 0;
  const result = body?.result === 'skipped' ? 'skipped' : body?.result === 'failed' ? 'failed' : 'passed';
  if (!phraseId || phraseId !== phraseResults.id) return { ok: true, stale: true };
  /* Each word's grade, for the report's list of what the class is getting
     wrong. Kept short and clean: the word as shown and one of correct, fair,
     wrong. */
  const words = (Array.isArray(body?.words) ? body.words : []).slice(0, 40)
    .map((w) => ({ w: String(w?.w || '').slice(0, 60), g: ['correct', 'goodEffort', 'wrong'].includes(w?.g) ? w.g : 'wrong' }))
    .filter((w) => w.w);
  logEvent(user.id, 'phrase', { phraseId, irish: currentPhrase.irish, result, words });
  if (result === 'failed') return { ok: true };
  phraseResults.passed.delete(user.id);
  phraseResults.skipped.delete(user.id);
  phraseResults[result].add(user.id);
  scheduleStats();
  return { ok: true };
}

export function pushPhrase(body) {
  const { irish = '', english = '', phonetic = '', show = true } = body || {};
  phraseSeq += 1;
  currentPhrase = show
    ? { id: phraseSeq, show: true, irish: String(irish).slice(0, 200).trim(), english: String(english).slice(0, 240).trim(), phonetic: String(phonetic).slice(0, 240).trim() }
    : { id: phraseSeq, show: false, irish: '', english: '', phonetic: '' };
  phraseResults = { id: phraseSeq, passed: new Set(), skipped: new Set() };
  broadcastPhrase();
  scheduleStats(true);
  // Pre-warm the replay audio so the student's first tap plays instantly.
  if (currentPhrase.show && currentPhrase.irish) ttsFor(currentPhrase.irish).catch(() => {});
  return currentPhrase;
}

const joinFailures = [];
export function noteJoinFailure(user, reason) {
  joinFailures.unshift({ name: String(user?.name || 'Somebody').slice(0, 60), reason: String(reason || 'Could not join.').slice(0, 200), at: new Date().toISOString() });
  if (joinFailures.length > 50) joinFailures.length = 50;
}
export function currentPromptPublic() { return currentPrompt && !currentPrompt.closed_at ? publicPrompt(currentPrompt) : null; }
export function roomStatus() {
  let students = 0;
  for (const l of listeners) if (l.who === 'student') students += 1;
  return { students, present: presentStudents.size, phrase: currentPhrase, joinFailures: joinFailures.slice(0, 20) };
}

/* ---- questions: private threads --------------------------------------- */
const studentConns = new Map();   // cid -> Set<res>
const teacherConns = new Set();   // res
const threads = new Map();        // cid -> { cid, name, messages, unread }
let chatSeq = 0;

function toStudent(cid, obj) { const set = studentConns.get(cid); if (!set) return; const f = sseFrame(obj); for (const r of set) sseWrite(r, f); }
function toTeachers(obj) { if (!teacherConns.size) return; const f = sseFrame(obj); for (const r of teacherConns) sseWrite(r, f); }
function toAllStudents(obj) { const f = sseFrame(obj); for (const set of studentConns.values()) for (const r of set) sseWrite(r, f); }
function threadSnap(t) { return { cid: t.cid, name: t.name, messages: t.messages, unread: t.unread }; }
function getThread(cid, name) {
  let t = threads.get(cid);
  if (!t) { t = { cid, name: name || 'Dalta', messages: [], unread: 0 }; threads.set(cid, t); }
  if (name) t.name = name;
  return t;
}

export function chatStream(req, res) {
  res.set(SSE_HEADERS);
  res.flushHeaders();
  const ping = setInterval(() => sseWrite(res, ': ping\n\n'), 25000);
  if (req.user.role === 'admin') {
    teacherConns.add(res);
    sseSend(res, { type: 'threads', threads: [...threads.values()].map(threadSnap) });
    req.on('close', () => { clearInterval(ping); teacherConns.delete(res); });
    return;
  }
  const cid = req.user.id;
  const t = getThread(cid, String(req.user.name || '').slice(0, 40).trim());
  if (!studentConns.has(cid)) studentConns.set(cid, new Set());
  studentConns.get(cid).add(res);
  sseSend(res, { type: 'thread', messages: t.messages });
  req.on('close', () => {
    clearInterval(ping);
    const s = studentConns.get(cid);
    if (s) { s.delete(res); if (!s.size) studentConns.delete(cid); }
  });
}

export function studentAsks(user, text) {
  const clean = String(text || '').slice(0, 500).trim();
  if (!clean) throw Object.assign(new Error('Empty message.'), { status: 400 });
  const t = getThread(user.id, String(user.name || 'Dalta').slice(0, 40).trim() || 'Dalta');
  const msg = { id: ++chatSeq, from: 'student', text: clean, ts: Date.now() };
  t.messages.push(msg);
  t.unread += 1;
  if (t.messages.length > 200) t.messages.shift();
  toStudent(user.id, { type: 'msg', message: msg });
  toTeachers({ type: 'msg', cid: user.id, name: t.name, message: msg, unread: t.unread });
}

export function teacherReplies(cid, text) {
  const clean = String(text || '').slice(0, 500).trim();
  const t = threads.get(String(cid || ''));
  if (!t || !clean) throw Object.assign(new Error('Bad reply.'), { status: 400 });
  const msg = { id: ++chatSeq, from: 'teacher', text: clean, ts: Date.now() };
  t.messages.push(msg);
  toStudent(t.cid, { type: 'msg', message: msg });
  toTeachers({ type: 'msg', cid: t.cid, name: t.name, message: msg });
}

export function teacherRead(cid) {
  const t = threads.get(String(cid || ''));
  if (t) { t.unread = 0; toTeachers({ type: 'read', cid: t.cid }); }
}

export function teacherBroadcasts(text) {
  const clean = String(text || '').slice(0, 500).trim();
  if (!clean) throw Object.assign(new Error('Empty message.'), { status: 400 });
  const msg = { id: ++chatSeq, from: 'teacher', text: clean, ts: Date.now(), broadcast: true };
  for (const cid of studentConns.keys()) getThread(cid);
  for (const t of threads.values()) { t.messages.push(msg); if (t.messages.length > 200) t.messages.shift(); }
  toAllStudents({ type: 'msg', message: msg });
  toTeachers({ type: 'broadcast', message: msg });
}

export function teacherHighlights(text, name) {
  const clean = String(text || '').slice(0, 300).trim();
  if (!clean) throw Object.assign(new Error('Empty.'), { status: 400 });
  toAllStudents({ type: 'highlight', text: clean, name: String(name || '').slice(0, 40).trim(), at: Date.now() });
}

/* ---- one session at a time, but its state belongs to a class ---------- */
const classSessions = new Map();
function stash(classId) {
  classSessions.set(classId || '', { currentPhrase, phraseResults, present: [...presentStudents.entries()], threads: [...threads.entries()] });
}
function restore(classId) {
  const saved = classSessions.get(classId || '');
  currentPhrase = saved?.currentPhrase || { id: 0, show: false, irish: '', english: '', phonetic: '' };
  phraseResults = saved?.phraseResults || { id: 0, passed: new Set(), skipped: new Set() };
  presentStudents.clear(); for (const [k, v] of (saved?.present || [])) presentStudents.set(k, v);
  threads.clear(); for (const [k, v] of (saved?.threads || [])) threads.set(k, v);
}

/* The room the session lands in: the session's own link when one is set,
   otherwise the first class's link from Class setup. */
export async function sessionWebinar() {
  if (access.joinUrl) {
    // The link and passcode the teacher gave are sent as they are: a stale
    // pwd= from the class's old link, carried over to help, refused every
    // join once the webinar's passcode was taken off.
    const parsed = parseWebinar(access.joinUrl, access.joinNote);
    if (parsed.webinarId) return { ...parsed, source: 'session' };
  }
  const klass = await liveClass(access.classIds[0]);
  return { webinarId: klass?.webinarId || null, webinarPwd: klass?.webinarPwd || '', source: klass?.webinarId ? 'class' : 'none' };
}

export async function sessionSummary() {
  const classes = (await Promise.all(access.classIds.map((id) => liveClass(id)))).filter(Boolean);
  return {
    mode: access.mode,
    classId: access.classIds[0] || '',
    classIds: access.classIds,
    classLabel: classes.map((k) => k.label).join(', '),
    classLabels: classes.map((k) => ({ id: k.id, label: k.label })),
    joinUrl: access.joinUrl,
    joinNote: access.joinNote,
    webinar: await sessionWebinar(),
    live: isLive(),
    sessionId: isLive() ? access.sessionId : null,
    startedAt: isLive() && access.startedAt ? access.startedAt.toISOString() : null,
    meetingId: access.meetingId,
    // The host's door, only while this process remembers it.
    startUrl: isLive() && access.meetingId ? hostStartUrl : '',
  };
}

/* One press: the meeting made (or the teacher's own link taken as given), the
   session pointed at it for the classes chosen, and the clock started. */
export async function goLive({ mode, classIds, joinUrl, joinNote, topic } = {}) {
  await setSession({ mode, classIds, joinUrl: joinUrl === undefined ? '' : joinUrl, joinNote: joinNote === undefined ? '' : joinNote });
  if (!access.joinUrl) {
    const { zoomConfigured, createInstantMeeting } = await import('../zoom.js');
    if (!zoomConfigured()) {
      throw Object.assign(new Error('Paste the Zoom link you are hosting, or connect the Zoom account under Feedback drafting so the portal can start the meeting for you.'), { status: 503 });
    }
    const { getZoomConfig } = await import('../settings.js');
    const { hostEmail } = await getZoomConfig();
    const made = await createInstantMeeting({ topic, host: hostEmail || 'me' });
    access.joinUrl = made.joinUrl;
    access.joinNote = made.passcode ? `Passcode ${made.passcode}` : '';
    access.meetingId = made.id;
    hostStartUrl = made.startUrl;
  } else {
    access.meetingId = '';
    hostStartUrl = '';
  }
  access.startedAt = new Date();
  /* A session still open from before (Go live twice, or a server that went
     down mid-class) ends before this one starts, so no row runs for ever. */
  await closeSessionRow();
  await query(`UPDATE live_sessions SET ended_at = LEAST(now(), started_at + interval '5 hours') WHERE ended_at IS NULL`);
  const made = await one('INSERT INTO live_sessions(class_ids, join_url, started_at) VALUES ($1,$2,$3) RETURNING id',
    [access.classIds, access.joinUrl, access.startedAt]);
  access.sessionId = made?.id || null;
  currentPrompt = null;
  await saveAccess();
  return sessionSummary();
}

/* The session over: the meeting the portal made is ended on Zoom too, the
   link is cleared, the classes and the access setting are kept for next time. */
/* The session row is closed wherever the session ends: End session, a fresh
   Go live, or the link being changed under a live one. Open checks close
   with it and students outside the Zoom hear that the class is over. */
async function closeSessionRow() {
  const sid = access.sessionId;
  if (!sid) return;
  await query('UPDATE live_sessions SET ended_at=now() WHERE id=$1 AND ended_at IS NULL', [sid]);
  await query('UPDATE live_prompts SET closed_at=now() WHERE session_id=$1 AND closed_at IS NULL', [sid]);
  if (currentPrompt) { broadcastToStudents({ type: 'prompt-close', id: currentPrompt.id }); currentPrompt = null; }
  broadcastToStudents({ type: 'ended', sessionId: sid });
  access.sessionId = null;
}
export async function endLive() {
  let ended = true;
  if (access.meetingId) {
    try { const { endMeeting } = await import('../zoom.js'); await endMeeting(access.meetingId); }
    catch (error) { ended = false; console.error('could not end the Zoom meeting', error?.message); }
  }
  await closeSessionRow();
  access.joinUrl = ''; access.joinNote = ''; access.meetingId = ''; access.startedAt = null; access.sessionId = null; hostStartUrl = '';
  await saveAccess();
  // The last phrase does not stay on screen over an empty stage.
  if (currentPhrase.show) pushPhrase({ show: false });
  return { ...(await sessionSummary()), zoomEnded: ended };
}

/* ---- what the teacher asks the room ---------------------------------- */
/* One open prompt at a time: an understanding check (yes or not yet), a
   rating out of ten, a pop quiz of a few typed answers, or how the class
   was. It goes to students on the phrase stream, answers come back one at a
   time and are written as events, and the teacher's console is kept up to
   date over its own stream. The quiz answers never leave the server: the
   student's typed answer is checked here. */
let currentPrompt = null;
function broadcastToStudents(obj) { const f = sseFrame(obj); for (const l of listeners) if (l.who === 'student') sseWrite(l.res, f); }
export function publicPrompt(p) {
  return {
    id: p.id, kind: p.kind, topic: p.topic, createdAt: p.created_at,
    questions: (p.questions || []).map((q, i) => ({ index: i, q: q.q })),
  };
}
async function openPromptFor(sessionId) {
  return one('SELECT * FROM live_prompts WHERE session_id=$1 AND closed_at IS NULL ORDER BY created_at DESC LIMIT 1', [sessionId]);
}
export function cleanQuestions(input) {
  return (Array.isArray(input) ? input : []).slice(0, 8).map((q) => ({
    q: String(q?.q || '').slice(0, 300).trim(),
    answers: String(q?.answers ?? q?.a ?? '').split(/[|/;,]/).map((a) => a.trim()).filter(Boolean).slice(0, 10).map((a) => a.slice(0, 120)),
  })).filter((q) => q.q && q.answers.length);
}
export async function createPrompt({ kind, topic, questions }, user) {
  if (!access.sessionId || !isLive()) throw Object.assign(new Error('Go live first: a check goes to the students in the room.'), { status: 409 });
  if (!['understand', 'rating', 'quiz', 'enjoy'].includes(kind)) throw Object.assign(new Error('Unknown kind of check.'), { status: 400 });
  const cleanTopic = String(topic || '').slice(0, 200).trim();
  const qs = kind === 'quiz' ? cleanQuestions(questions) : [];
  if (kind === 'quiz' && !qs.length) throw Object.assign(new Error('Add at least one question with an answer.'), { status: 400 });
  if (currentPrompt && !currentPrompt.closed_at) await closePrompt(currentPrompt.id);
  const row = await one(
    'INSERT INTO live_prompts(session_id, kind, topic, questions) VALUES ($1,$2,$3,$4::jsonb) RETURNING *',
    [access.sessionId, kind, cleanTopic, JSON.stringify(qs)]);
  currentPrompt = row;
  broadcastToStudents({ type: 'prompt', prompt: publicPrompt(row) });
  await pushPromptStats(row.id);
  return publicPrompt(row);
}
export async function closePrompt(id) {
  if (!isUuid(id)) return { ok: true, closed: false };
  const row = await one('UPDATE live_prompts SET closed_at=now() WHERE id=$1 AND closed_at IS NULL RETURNING *', [id]);
  if (currentPrompt && currentPrompt.id === id) currentPrompt = null;
  broadcastToStudents({ type: 'prompt-close', id });
  if (row) await pushPromptStats(row.id);
  return { ok: true, closed: Boolean(row) };
}

/* A typed quiz answer against the teacher's answers. Case, fadas and
   punctuation are forgiven, so are one letter's worth of typo in a word of
   six or more; a wrong word is wrong. */
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
function editDistance(a, b) {
  if (a === b) return 0;
  const v = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    let prev = v[0]; v[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) { const cur = v[j + 1]; v[j + 1] = Math.min(v[j] + 1, v[j + 1] + 1, prev + (a[i] === b[j] ? 0 : 1)); prev = cur; }
  }
  return v[b.length];
}
export function answerMatches(answer, accepted) {
  const given = fold(answer);
  if (!given) return false;
  return (accepted || []).some((a) => {
    const want = fold(a);
    if (!want) return false;
    if (given === want) return true;
    return want.length >= 6 && editDistance(given, want) <= 1;
  });
}

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
async function recentSession(id) {
  if (!isUuid(id)) return null;
  const row = await one(`SELECT id FROM live_sessions WHERE id=$1 AND (ended_at IS NULL OR ended_at > now() - interval '4 hours')`, [String(id)]);
  return row ? row.id : null;
}
export async function respond(user, body) {
  const promptId = String(body?.promptId || '');
  const kind = String(body?.kind || '');
  /* How the class was, and ideas for it, come from the student's own screen
     when the host ends the class, with no prompt behind them. They belong to
     the session all the same. */
  if (!promptId && (kind === 'enjoy' || kind === 'idea')) {
    /* The host ends the webinar, the console ends the session a moment
       later, and the student is still choosing a number. The page says
       which session it means, and a session that ended in the last few
       hours still takes the answer. */
    const sessionId = await recentSession(body?.sessionId) || access.sessionId;
    if (!sessionId) return { ok: true, stale: true };
    if (kind === 'enjoy') { const score = Math.max(1, Math.min(10, Number(body?.score) || 0)); if (!score) return { ok: false, error: 'Pick a number.' }; await logEvent(user.id, 'enjoy', { score, name: user.name }, sessionId); }
    else { const text = String(body?.text || '').slice(0, 1200).trim(); if (!text) return { ok: true, empty: true }; await logEvent(user.id, 'idea', { text, name: user.name }, sessionId); }
    return { ok: true };
  }
  const prompt = currentPrompt && currentPrompt.id === promptId ? currentPrompt : (isUuid(promptId) ? await one('SELECT * FROM live_prompts WHERE id=$1', [promptId]) : null);
  if (!prompt) return { ok: false, error: 'That check is gone.' };
  if (prompt.closed_at) return { ok: false, error: 'That check has closed.' };
  if (prompt.kind === 'understand') {
    const yes = Boolean(body?.yes);
    await logEvent(user.id, 'understand', { promptId, topic: prompt.topic, yes, name: user.name }, prompt.session_id);
    await pushPromptStats(prompt.id);
    return { ok: true };
  }
  if (prompt.kind === 'rating' || prompt.kind === 'enjoy') {
    const score = Math.max(1, Math.min(10, Number(body?.score) || 0));
    if (!score) return { ok: false, error: 'Pick a number.' };
    await logEvent(user.id, prompt.kind, { promptId, topic: prompt.topic, score, name: user.name }, prompt.session_id);
    await pushPromptStats(prompt.id);
    return { ok: true };
  }
  if (prompt.kind === 'quiz') {
    const index = Number(body?.index);
    const q = (prompt.questions || [])[index];
    if (!q) return { ok: false, error: 'No such question.' };
    const answer = String(body?.answer || '').slice(0, 300);
    const correct = answerMatches(answer, q.answers);
    await logEvent(user.id, 'quiz_answer', { promptId, index, answer, correct, name: user.name }, prompt.session_id);
    const last = index === prompt.questions.length - 1;
    if (last) {
      const mine = await query(`SELECT DISTINCT ON (payload->>'index') payload FROM live_events WHERE session_id=$1 AND student_id=$2 AND kind='quiz_answer' AND payload->>'promptId'=$3 ORDER BY payload->>'index', at DESC`, [prompt.session_id, user.id, promptId]);
      const right = mine.rows.filter((r) => r.payload.correct).length;
      await logEvent(user.id, 'quiz_done', { promptId, correct: right, total: prompt.questions.length, name: user.name }, prompt.session_id);
    }
    await pushPromptStats(prompt.id);
    return { ok: true, correct, expected: correct ? null : q.answers[0] };
  }
  return { ok: false, error: 'Unknown kind of check.' };
}

/* What the console shows while a check is open, and the results after. */
export async function promptResults(id) {
  if (!isUuid(id)) return null;
  const prompt = await one('SELECT * FROM live_prompts WHERE id=$1', [id]);
  if (!prompt) return null;
  const rows = (await query(
    `SELECT e.kind, e.payload, e.at, e.student_id, u.name FROM live_events e LEFT JOIN users u ON u.id=e.student_id
     WHERE e.session_id=$1 AND e.payload->>'promptId'=$2 ORDER BY e.at`, [prompt.session_id, id])).rows;
  const present = presentStudents.size;
  const out = { id, kind: prompt.kind, topic: prompt.topic, open: !prompt.closed_at, createdAt: prompt.created_at, closedAt: prompt.closed_at, inRoom: present, responded: 0 };
  if (prompt.kind === 'understand') {
    const latest = new Map(); for (const r of rows) if (r.kind === 'understand') latest.set(r.student_id, r);
    const yes = [...latest.values()].filter((r) => r.payload.yes), no = [...latest.values()].filter((r) => !r.payload.yes);
    Object.assign(out, { responded: latest.size, yes: yes.length, no: no.length, notYet: no.map((r) => r.name || r.payload.name).sort(), understood: yes.map((r) => r.name || r.payload.name).sort() });
  } else if (prompt.kind === 'rating' || prompt.kind === 'enjoy') {
    const latest = new Map(); for (const r of rows) if (r.kind === prompt.kind) latest.set(r.student_id, r);
    const scores = [...latest.values()].map((r) => Number(r.payload.score));
    const dist = Array.from({ length: 10 }, (_, i) => scores.filter((s) => s === i + 1).length);
    Object.assign(out, { responded: latest.size, average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null, distribution: dist,
      low: [...latest.values()].filter((r) => Number(r.payload.score) <= 5).map((r) => ({ name: r.name || r.payload.name, score: Number(r.payload.score) })).sort((a, b) => a.score - b.score) });
  } else if (prompt.kind === 'quiz') {
    const byStudent = new Map();
    for (const r of rows) {
      if (r.kind !== 'quiz_answer') continue;
      const s = byStudent.get(r.student_id) || { name: r.name || r.payload.name, answers: new Map() };
      s.answers.set(Number(r.payload.index), { answer: r.payload.answer, correct: Boolean(r.payload.correct) });
      byStudent.set(r.student_id, s);
    }
    const total = (prompt.questions || []).length;
    const questions = (prompt.questions || []).map((q, i) => {
      const given = [...byStudent.values()].map((s) => s.answers.get(i)).filter(Boolean);
      const wrong = {}; for (const g of given) if (!g.correct) wrong[g.answer] = (wrong[g.answer] || 0) + 1;
      return { index: i, q: q.q, answer: q.answers[0], answered: given.length, correct: given.filter((g) => g.correct).length,
        commonWrong: Object.entries(wrong).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([answer, n]) => ({ answer, n })) };
    });
    const students = [...byStudent.values()].map((s) => ({ name: s.name, answered: s.answers.size, correct: [...s.answers.values()].filter((a) => a.correct).length, total, done: s.answers.size >= total }))
      .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));
    Object.assign(out, { responded: students.length, total, finished: students.filter((s) => s.done).length,
      completion: Math.round((students.filter((s) => s.done).length / Math.max(present, students.length, 1)) * 100),
      correctPct: students.length && total ? Math.round((students.reduce((a, s) => a + s.correct, 0) / (students.length * total)) * 100) : 0,
      questions, students });
  }
  // The room count lags a reconnect; nobody answers from outside the room.
  out.inRoom = Math.max(present, out.responded);
  return out;
}
/* Answers arrive in bursts; the console is told once a quarter second about
   every check that changed in that time, oldest first, so the figures for a
   check that just closed never land after the one that replaced it. */
const promptStatsPending = new Set();
let promptStatsTimer = null;
async function pushPromptStats(id) {
  promptStatsPending.add(id);
  if (promptStatsTimer) return;
  promptStatsTimer = setTimeout(async () => {
    promptStatsTimer = null;
    const ids = [...promptStatsPending]; promptStatsPending.clear();
    for (const pid of ids) {
      try { const r = await promptResults(pid); if (r) toTeachers({ type: 'promptstats', results: r }); } catch (error) { console.error('prompt stats', error?.message); }
    }
  }, 250);
}

const sessionKey = (ids) => [...ids].sort().join(',');

export async function setSession({ mode, classId, classIds, joinUrl, joinNote }) {
  const nextMode = mode === 'entitled' ? 'entitled' : 'open';
  const wanted = Array.isArray(classIds) ? classIds : (classId !== undefined ? [classId] : access.classIds);
  const nextClasses = [...new Set(wanted.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 50);
  for (const id of nextClasses) {
    if (!(await liveClass(id))) throw Object.assign(new Error('That class does not exist.'), { status: 400 });
  }
  const nextUrl = joinUrl === undefined ? access.joinUrl : String(joinUrl || '').trim().slice(0, 500);
  if (nextUrl && !parseWebinar(nextUrl).webinarId) {
    throw Object.assign(new Error('That does not look like a Zoom link. It should carry the meeting id, like https://us06web.zoom.us/j/88408476378'), { status: 400 });
  }
  const nextNote = joinNote === undefined ? access.joinNote : String(joinNote || '').trim().slice(0, 200);
  if (sessionKey(nextClasses) !== sessionKey(access.classIds)) {
    stash(sessionKey(access.classIds));
    restore(sessionKey(nextClasses));
    broadcastPhrase();
  }
  access.mode = nextMode;
  access.classIds = nextClasses;
  if (nextUrl !== access.joinUrl) { await closeSessionRow(); access.meetingId = ''; access.startedAt = null; hostStartUrl = ''; }
  access.joinUrl = nextUrl;
  access.joinNote = nextNote;
  await saveAccess();
  classCache.clear();
  return sessionSummary();
}
