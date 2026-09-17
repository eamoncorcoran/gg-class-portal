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
import { liveClass, studentClassIds } from './classes.js';
import { ttsFor } from './tts.js';

/* ---- who may join ------------------------------------------------------ */
export const access = { mode: 'open', classId: '' };

export async function loadAccess() {
  const row = await one('SELECT mode, class_id FROM live_access WHERE id=1');
  access.mode = row?.mode === 'entitled' ? 'entitled' : 'open';
  access.classId = row?.class_id || '';
  return access;
}
async function saveAccess() {
  await query('UPDATE live_access SET mode=$1, class_id=$2, updated_at=now() WHERE id=1', [access.mode, access.classId || null]);
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
  if (access.mode !== 'entitled' || !access.classId) return { ok: true };
  const ids = await classesOf(user.id);
  if (!ids.includes(access.classId)) return { ok: false, error: 'This live session is for a different class. Open it from your own course page.' };
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
  // Staggered, so thousands of clients do not all wake the process together.
  const ping = setInterval(() => sseWrite(res, ': ping\n\n'), 25000 + Math.floor(Math.random() * 10000));
  const done = () => { clearInterval(ping); listeners.delete(entry); if (cid) { dropPresence(cid); scheduleStats(); } };
  req.on('close', done);
  res.on('error', done);
}

export function recordResult(user, body) {
  const phraseId = Number(body?.phraseId) || 0;
  const result = body?.result === 'skipped' ? 'skipped' : 'passed';
  if (!phraseId || phraseId !== phraseResults.id) return { ok: true, stale: true };
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

export function roomStatus() {
  let students = 0;
  for (const l of listeners) if (l.who === 'student') students += 1;
  return { students, present: presentStudents.size, phrase: currentPhrase };
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

export async function sessionSummary() {
  const klass = await liveClass(access.classId);
  return { mode: access.mode, classId: access.classId || '', classLabel: klass?.label || '', webinar: klass ? { webinarId: klass.webinarId, webinarPwd: klass.webinarPwd } : { webinarId: null, webinarPwd: '' } };
}

export async function setSession({ mode, classId }) {
  const nextMode = mode === 'entitled' ? 'entitled' : 'open';
  const nextClass = String(classId || '').trim();
  if (nextClass && !(await liveClass(nextClass))) throw Object.assign(new Error('That class does not exist.'), { status: 400 });
  if (nextClass !== (access.classId || '')) {
    stash(access.classId);
    restore(nextClass);
    broadcastPhrase();
  }
  access.mode = nextMode;
  access.classId = nextClass;
  await saveAccess();
  classCache.clear();
  return sessionSummary();
}
