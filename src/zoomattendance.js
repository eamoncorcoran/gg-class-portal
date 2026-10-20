import { one, query } from './db.js';
import { config } from './config.js';
import { zoomConfigured, pastInstances, pastInstance, participantsReport, whoAmI } from './zoom.js';
import { parseWebinar } from './live/classes.js';
import { audit } from './audit.js';

/**
 * Attendance, read from Zoom.
 *
 * Each class's Zoom link names its webinar. Zoom keeps a report of who was in
 * every past sitting and for how long, and this reads that report into the
 * same attendance table the teacher used to fill by uploading a CSV.
 *
 * Who counts as present is decided by minutes, not by having clicked the
 * link: thirty minutes in the room is "live", a shorter spell is "partial",
 * and nobody on the roster that evening is "missed". A row the teacher set by
 * hand is never overwritten by Zoom.
 *
 * A sitting is kept whole, every participant Zoom saw, so a name the portal
 * could not place can be matched once and remembered, and the week's figures
 * worked out again without another trip to Zoom.
 */

export const LIVE_MINUTES = 30;
const RECENT_DAYS = 3;

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}@.\s]/gu, ' ').replace(/\s+/g, ' ').trim();
/* Zoom refuses a plus-address at the door, so a student may well have joined
   with the plain mailbox the portal sent for them. */
const plain = (email) => String(email || '').toLowerCase().trim().replace(/\+[^@]*@/, '@');
const localDate = (when) => new Intl.DateTimeFormat('en-CA', { timeZone: config.defaultTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(when));

/** The classes whose Zoom link names a webinar or meeting, with that id. */
export async function zoomClasses({ activeOnly = false } = {}) {
  const rows = (await query(
    `SELECT c.id, c.programme_name, c.day_of_week, c.start_time, c.join_url, c.join_note, c.active,
            COALESCE((SELECT json_agg(s.zoom_id) FROM zoom_sources s WHERE s.class_id=c.id), '[]'::json) source_ids
     FROM classes c ${activeOnly ? 'WHERE c.active=true' : ''} ORDER BY c.programme_name, c.day_of_week`)).rows;
  return rows.map((c) => {
    const linked = parseWebinar(c.join_url, c.join_note).webinarId;
    const ids = [...new Set([linked, ...(c.source_ids || [])].filter(Boolean).map(String))];
    return { id: c.id, label: c.programme_name, dayOfWeek: c.day_of_week, startTime: c.start_time, active: c.active, zoomId: linked || ids[0] || null, zoomIds: ids };
  }).filter((c) => c.zoomIds.length);
}

async function rosterFor(classId) {
  const students = (await query(
    `SELECT u.id, u.name, u.email, cs.active, cs.enrolled_at FROM class_students cs JOIN users u ON u.id=cs.student_id WHERE cs.class_id=$1`,
    [classId])).rows;
  const identities = students.length
    ? (await query('SELECT key, student_id FROM zoom_identities WHERE student_id = ANY($1::uuid[])', [students.map((s) => s.id)])).rows
    : [];
  return { students, identities: new Map(identities.map((i) => [i.key, i.student_id])) };
}

/* Email first, then a name the teacher matched before, then the name itself
   when exactly one student carries it. */
export function matchStudent(person, roster) {
  const byId = (id) => roster.students.find((s) => s.id === id) || null;
  const email = String(person.email || '').toLowerCase().trim();
  if (email) {
    const exact = roster.students.find((s) => String(s.email || '').toLowerCase() === email);
    if (exact) return exact;
    const remembered = roster.identities.get(`email:${email}`);
    if (remembered) return byId(remembered);
    const loose = roster.students.find((s) => plain(s.email) === plain(email));
    if (loose) return loose;
  }
  const name = fold(person.name);
  if (!name) return null;
  const remembered = roster.identities.get(`name:${name}`);
  if (remembered) return byId(remembered);
  const byName = roster.students.filter((s) => fold(s.name) === name);
  return byName.length === 1 ? byName[0] : null;
}

/* One line per person: spells in the room summed, the waiting room ignored. */
export function aggregateParticipants(rows) {
  const people = new Map();
  for (const r of rows) {
    if (r.status === 'in_waiting_room') continue;
    const key = String(r.email || '').toLowerCase().trim() || `name:${fold(r.name)}`;
    if (!key || key === 'name:') continue;
    const p = people.get(key) || { name: r.name || '', email: String(r.email || '').toLowerCase().trim(), seconds: 0, joinedAt: r.joinedAt, leftAt: r.leftAt };
    p.seconds += r.seconds || 0;
    if (r.joinedAt && (!p.joinedAt || r.joinedAt < p.joinedAt)) p.joinedAt = r.joinedAt;
    if (r.leftAt && (!p.leftAt || r.leftAt > p.leftAt)) p.leftAt = r.leftAt;
    if (!p.name && r.name) p.name = r.name;
    people.set(key, p);
  }
  return [...people.values()].map((p) => ({ ...p, minutes: Math.round(p.seconds / 60) }));
}

async function weekFor(classId, when) {
  const day = localDate(when);
  return one(
    `SELECT id, week_start FROM weeks WHERE class_id=$1 AND week_start <= $2::date AND week_start > ($2::date - interval '7 days')
     ORDER BY week_start DESC LIMIT 1`, [classId, day]);
}

let ownerEmail = null;
async function hostEmail() {
  if (ownerEmail !== null) return ownerEmail;
  try { ownerEmail = String((await whoAmI()).email || '').toLowerCase(); } catch { ownerEmail = ''; }
  return ownerEmail;
}

/* The participants of one sitting matched against the class, and written
   down with the sitting. */
async function placeParticipants(classId, people) {
  const roster = await rosterFor(classId);
  const host = await hostEmail();
  const participants = people
    .filter((p) => !(host && p.email === host))
    .map((p) => {
      const student = matchStudent(p, roster);
      return { name: p.name, email: p.email, minutes: p.minutes, joinedAt: p.joinedAt, leftAt: p.leftAt, studentId: student ? student.id : null, studentName: student ? student.name : null };
    });
  return { participants, matched: participants.filter((p) => p.studentId).length, unmatched: participants.filter((p) => !p.studentId).length };
}

/**
 * The week's attendance, from every sitting Zoom saw in it. Students on the
 * roster that week with nobody matching them are marked missed; a row the
 * teacher set by hand stays as it is.
 */
export async function writeWeekAttendance(classId, weekId, { liveMinutes = LIVE_MINUTES } = {}) {
  if (!weekId) return { written: 0 };
  const week = await one('SELECT id, week_start FROM weeks WHERE id=$1', [weekId]);
  if (!week) return { written: 0 };
  const sittings = (await query('SELECT participants FROM zoom_sittings WHERE class_id=$1 AND week_id=$2', [classId, weekId])).rows;
  const minutesBy = new Map();
  for (const s of sittings) for (const p of s.participants || []) if (p.studentId) minutesBy.set(p.studentId, (minutesBy.get(p.studentId) || 0) + (Number(p.minutes) || 0));
  const roster = await rosterFor(classId);
  const weekEnd = new Date(new Date(week.week_start).getTime() + 7 * 864e5);
  let written = 0;
  for (const s of roster.students) {
    const minutes = minutesBy.get(s.id) || 0;
    const onRoster = s.active && (!s.enrolled_at || new Date(s.enrolled_at) < weekEnd);
    if (!minutes && !onRoster) continue;
    const status = minutes >= liveMinutes ? 'live' : minutes > 0 ? 'partial' : 'missed';
    await query(
      `INSERT INTO attendance(week_id,student_id,status,minutes,source,updated_at) VALUES ($1,$2,$3,$4,'zoom',now())
       ON CONFLICT (week_id,student_id) DO UPDATE SET status=EXCLUDED.status, minutes=EXCLUDED.minutes, source='zoom', updated_at=now()
       WHERE attendance.source <> 'manual'`,
      [weekId, s.id, status, minutes]);
    written += 1;
  }
  return { written };
}

async function importSitting({ klass, zoomId, kind, instance, liveMinutes }) {
  const details = await pastInstance(instance.uuid, kind).catch(() => ({ topic: '', startedAt: instance.startedAt, endedAt: null, durationMinutes: null }));
  const rows = await participantsReport(instance.uuid, kind);
  const { participants, matched, unmatched } = await placeParticipants(klass.id, aggregateParticipants(rows));
  const startedAt = details.startedAt || instance.startedAt;
  const week = await weekFor(klass.id, startedAt);
  const row = await one(
    `INSERT INTO zoom_sittings(class_id, zoom_id, zoom_uuid, kind, topic, started_at, ended_at, duration_minutes, week_id, participants, matched, unmatched)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
     ON CONFLICT (zoom_uuid) DO UPDATE SET participants=EXCLUDED.participants, matched=EXCLUDED.matched, unmatched=EXCLUDED.unmatched,
       ended_at=EXCLUDED.ended_at, duration_minutes=EXCLUDED.duration_minutes, week_id=EXCLUDED.week_id, synced_at=now()
     RETURNING *`,
    [klass.id, String(zoomId), instance.uuid, kind, details.topic || '', startedAt, details.endedAt, details.durationMinutes, week?.id || null,
      JSON.stringify(participants), matched, unmatched]);
  if (week) await writeWeekAttendance(klass.id, week.id, { liveMinutes });
  return row;
}

/**
 * Brings a class's sittings across. Recent ones by default (the last few
 * days, for the sweep); everything Zoom still has with `all`, which is how
 * the past is filled in. A sitting already stored is left alone unless
 * `refresh` asks for it again.
 */
export async function syncClassAttendance(classId, { all = false, refresh = false, liveMinutes = LIVE_MINUTES, actorId = null } = {}) {
  if (!zoomConfigured()) return { ok: false, reason: 'Zoom is not connected.' };
  const klass = await one('SELECT * FROM classes WHERE id=$1', [classId]);
  if (!klass) throw Object.assign(new Error('That class does not exist.'), { status: 404 });
  const entry = (await zoomClasses()).find((c) => c.id === classId);
  if (!entry) return { ok: false, reason: 'This class has no Zoom link to read attendance from.' };

  const known = new Set((await query('SELECT zoom_uuid FROM zoom_sittings WHERE class_id=$1', [classId])).rows.map((r) => r.zoom_uuid));
  const since = all ? 0 : Date.now() - RECENT_DAYS * 864e5;
  const out = { ok: true, classId, newSittings: 0, errors: [] };
  for (const zoomId of entry.zoomIds) {
    let listing;
    try { listing = await pastInstances(zoomId); } catch (error) { out.errors.push(`${zoomId}: ${error.message}`); continue; }
    for (const instance of listing.instances) {
      if (known.has(instance.uuid) && !refresh) continue;
      if (new Date(instance.startedAt).getTime() < since) continue;
      try {
        await importSitting({ klass, zoomId, kind: listing.kind, instance, liveMinutes });
        out.newSittings += 1;
      } catch (error) {
        out.errors.push(`${localDate(instance.startedAt)}: ${error.message}`);
      }
    }
  }
  const totals = await one('SELECT count(*)::int sittings, COALESCE(sum(matched),0)::int matched, COALESCE(sum(unmatched),0)::int unmatched FROM zoom_sittings WHERE class_id=$1', [classId]);
  Object.assign(out, totals);
  if (actorId) await audit({ actorId, action: 'attendance.zoom_synced', entityType: 'class', entityId: classId, metadata: { all, newSittings: out.newSittings, errors: out.errors.length } });
  return out;
}

/** Every class with a Zoom link. The sweep and the "sync now" button. */
export async function syncAttendance({ all = false, actorId = null } = {}) {
  if (!zoomConfigured()) return { ok: false, reason: 'Zoom is not connected.', classes: [] };
  const results = [];
  for (const c of await zoomClasses({ activeOnly: true })) {
    try { results.push({ label: c.label, ...(await syncClassAttendance(c.id, { all, actorId })) }); }
    catch (error) { results.push({ label: c.label, classId: c.id, ok: false, reason: error.message }); }
  }
  return { ok: true, classes: results };
}

/** A webinar just ended: its class's attendance, once Zoom has the report. */
export async function syncForZoomId(zoomId, { delayMs = 10 * 60 * 1000 } = {}) {
  const classes = (await zoomClasses({ activeOnly: true })).filter((c) => c.zoomIds.includes(String(zoomId)));
  if (!classes.length) return;
  setTimeout(() => {
    for (const c of classes) syncClassAttendance(c.id).catch((error) => console.error('Zoom attendance after the webinar failed', error?.message));
  }, delayMs).unref?.();
}

/* The same sittings, matched again: after the teacher names somebody. */
export async function rematchSittings({ studentId = null, classId = null } = {}) {
  const rows = (await query(
    `SELECT id, class_id, week_id, participants FROM zoom_sittings WHERE unmatched > 0 ${classId ? 'AND class_id=$1' : ''} ORDER BY started_at DESC`,
    classId ? [classId] : [])).rows;
  const weeks = new Set();
  let placed = 0;
  for (const s of rows) {
    const roster = await rosterFor(s.class_id);
    let changed = false;
    const participants = (s.participants || []).map((p) => {
      if (p.studentId) return p;
      const student = matchStudent(p, roster);
      if (!student || (studentId && student.id !== studentId)) return p;
      changed = true; placed += 1;
      return { ...p, studentId: student.id, studentName: student.name };
    });
    if (!changed) continue;
    await query('UPDATE zoom_sittings SET participants=$1::jsonb, matched=$2, unmatched=$3 WHERE id=$4',
      [JSON.stringify(participants), participants.filter((p) => p.studentId).length, participants.filter((p) => !p.studentId).length, s.id]);
    if (s.week_id) weeks.add(`${s.class_id}:${s.week_id}`);
  }
  for (const key of weeks) { const [cid, wid] = key.split(':'); await writeWeekAttendance(cid, wid); }
  return { placed };
}

/** "That is Aoife": remembered for every sitting, past and future. */
export async function rememberIdentity({ studentId, email = '', name = '' }, actorId = null) {
  const keys = [];
  if (email) keys.push(`email:${String(email).toLowerCase().trim()}`);
  if (name && fold(name)) keys.push(`name:${fold(name)}`);
  if (!keys.length) throw Object.assign(new Error('Give the email or the name Zoom showed.'), { status: 400 });
  for (const key of keys) {
    await query('INSERT INTO zoom_identities(student_id, key) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET student_id=EXCLUDED.student_id', [studentId, key]);
  }
  const result = await rematchSittings({ studentId });
  if (actorId) await audit({ actorId, action: 'attendance.zoom_identity', entityType: 'user', entityId: studentId, metadata: { keys } });
  return result;
}

/** What the Attendance screen shows: each class, its sittings, who was unplaced. */
export async function attendanceOverview({ sittingsPerClass = 40 } = {}) {
  const classes = await zoomClasses();
  const out = [];
  for (const c of classes) {
    const sittings = (await query(
      `SELECT s.id, s.zoom_id, s.kind, s.topic, s.started_at, s.ended_at, s.duration_minutes, s.matched, s.unmatched, s.synced_at, s.participants, w.week_start
       FROM zoom_sittings s LEFT JOIN weeks w ON w.id=s.week_id WHERE s.class_id=$1 ORDER BY s.started_at DESC LIMIT $2`, [c.id, sittingsPerClass])).rows;
    out.push({
      ...c,
      sittings: sittings.map((s) => ({
        id: s.id, zoomId: s.zoom_id, kind: s.kind, topic: s.topic, startedAt: s.started_at, endedAt: s.ended_at, durationMinutes: s.duration_minutes,
        matched: s.matched, unmatched: s.unmatched, syncedAt: s.synced_at, weekStart: s.week_start,
        people: (s.participants || []).map((p) => ({ name: p.name, email: p.email, minutes: p.minutes, studentId: p.studentId, studentName: p.studentName })),
      })),
      lastSyncedAt: sittings[0]?.synced_at || null,
    });
  }
  return { configured: zoomConfigured(), liveMinutes: LIVE_MINUTES, classes: out };
}
