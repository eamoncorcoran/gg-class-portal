/**
 * What the live classroom knows about a class: its label and the Zoom webinar
 * behind its join link.
 *
 * Each class's Zoom link already lives in Class setup, so the webinar id and
 * passcode are read out of that rather than kept in a second place that could
 * disagree with it.
 */
import { query } from '../db.js';

/**
 * Zoom writes webinar links as /w/<id> and meeting links as /j/<id>, either
 * with ?pwd= on the end. The passcode is often in the class note instead, as
 * "Passcode: 975967", which is what students are shown, so it is read from
 * there too. Spaces inside an id are how Zoom prints them on screen.
 */
export function parseWebinar(joinUrl, joinNote = '') {
  const url = String(joinUrl || '');
  const id = (/\/(?:w|j)\/(\d[\d ]{7,14})/.exec(url) || [])[1]?.replace(/\s+/g, '') || null;
  const pwdFromUrl = (/[?&]pwd=([^&#]+)/.exec(url) || [])[1] || null;
  const pwdFromNote = (/pass\s*code\s*[:\-]?\s*([^\s·|,;]+)/i.exec(String(joinNote || '')) || [])[1] || null;
  return { webinarId: id, webinarPwd: pwdFromUrl || pwdFromNote || '' };
}

/* Zoom insists on an email for a webinar attendee and refuses the join
   outright ("Fail to join the meeting.", code 200) when the address carries
   a plus tag, which is how Eamon's own test accounts are made. The address
   only ever appears in Zoom's attendee report, so a student with such an
   address is sent the plain mailbox behind it, and anything stranger still
   gets a portal address that cannot be refused. */
const ZOOM_EMAIL = /^[A-Za-z0-9._-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export function zoomEmailFor(email, id) {
  const raw = String(email || '').trim();
  if (ZOOM_EMAIL.test(raw)) return raw;
  const untagged = raw.replace(/\+[^@]*@/, '@');
  if (ZOOM_EMAIL.test(untagged)) return untagged;
  return 'student-' + String(id || 'guest').replace(/[^a-z0-9]/gi, '').slice(0, 32).toLowerCase() + '@hub.gaeilgeoirguides.com';
}

export function classForLive(row) {
  if (!row) return null;
  const day = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Number(row.day_of_week)] || '';
  const { webinarId, webinarPwd } = parseWebinar(row.join_url, row.join_note);
  return {
    id: row.id,
    label: `${row.programme_name} | ${day} | ${String(row.start_time || '').slice(0, 5)}`,
    programme: row.programme_name,
    webinarId, webinarPwd,
    joinUrl: row.join_url || null,
  };
}

export async function liveClasses() {
  const rows = (await query(
    'SELECT * FROM classes WHERE active=true ORDER BY programme_name, day_of_week, start_time')).rows;
  return rows.map(classForLive);
}

export async function liveClass(classId) {
  if (!classId) return null;
  const row = (await query('SELECT * FROM classes WHERE id=$1', [classId])).rows[0];
  return classForLive(row);
}

/** The active classes a student is in, as ids. */
export async function studentClassIds(studentId) {
  const rows = (await query(
    `SELECT cs.class_id FROM class_students cs JOIN classes c ON c.id=cs.class_id
     WHERE cs.student_id=$1 AND cs.active=true AND c.active=true`, [studentId])).rows;
  return rows.map((row) => row.class_id);
}
