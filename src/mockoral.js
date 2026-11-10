import { DateTime } from 'luxon';
import { config } from './config.js';
import { one, query, transaction } from './db.js';
import { randomToken } from './security.js';
import {
  sendMockOralCancelled, sendMockOralChanged, sendMockOralConfirmation,
  sendMockOralDetails, sendMockOralReminder,
} from './email.js';

/* Mock oral booking.
   ------------------------------------------------------------------
   Every examiner works the same day: seventeen orals of twenty minutes, with
   two breaks and lunch between them. The breaks are not orals, they have no
   number, and so there is nothing for a student to book in one.

   A student picks a time. The portal gives them the lowest numbered examiner
   who is free then, so a time stays open until every examiner has it filled,
   and "Examiner 3" means the same person all day. */
export const ORAL_ZONE = 'Europe/Dublin';
export const ORAL_MINUTES = 20;
export const MAX_EXAMINERS = 40;

const DAY_PLAN = [
  { orals: 5, from: '09:00' },
  { pause: 'Break', from: '10:40', minutes: 20 },
  { orals: 5, from: '11:00' },
  { pause: 'Lunch', from: '12:40', minutes: 60 },
  { orals: 5, from: '13:40' },
  { pause: 'Break', from: '15:20', minutes: 20 },
  { orals: 2, from: '15:40' },
];

const toMinutes = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const toClock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/* The day as rows, orals and breaks in order: what the teacher's grid draws. */
export const TIMETABLE = (() => {
  const rows = [];
  let slot = 0;
  for (const part of DAY_PLAN) {
    const from = toMinutes(part.from);
    if (part.pause) {
      rows.push({ kind: 'break', label: part.pause, start: part.from, end: toClock(from + part.minutes) });
      continue;
    }
    for (let index = 0; index < part.orals; index += 1) {
      slot += 1;
      rows.push({
        kind: 'oral', slot,
        start: toClock(from + index * ORAL_MINUTES),
        end: toClock(from + (index + 1) * ORAL_MINUTES),
      });
    }
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
})();

/* Only the orals: the seventeen times that can be booked. */
export const SLOTS = Object.freeze(TIMETABLE.filter((row) => row.kind === 'oral'));
export const SLOTS_PER_EXAMINER = SLOTS.length;

export function capacity(examiners) {
  return Math.max(0, Number(examiners) || 0) * SLOTS_PER_EXAMINER;
}

export function percentBooked(booked, examiners) {
  const places = capacity(examiners);
  return places ? Math.round((booked / places) * 100) : 0;
}

/* The examiner a new booking at one time goes to: the lowest number that is
   free. Null when every examiner has that time filled. */
export function lowestFreeExaminer(taken, examiners) {
  const busy = new Set(taken.map(Number));
  for (let number = 1; number <= examiners; number += 1) {
    if (!busy.has(number)) return number;
  }
  return null;
}

/* When an oral starts, as an instant. The date is a calendar day in Ireland. */
export function slotStartsAt(onDate, slot) {
  const info = SLOTS[slot - 1];
  if (!info) return null;
  return DateTime.fromISO(`${onDate}T${info.start}`, { zone: ORAL_ZONE }).toJSDate();
}

export function todayInIreland(now = new Date()) {
  return DateTime.fromJSDate(now, { zone: ORAL_ZONE }).toISODate();
}

export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && DateTime.fromISO(value, { zone: ORAL_ZONE }).isValid;
}

/* The fewest examiners a day's bookings can be fitted into: the busiest time
   decides it, because two students at one time need two examiners. */
export function examinersNeeded(bookings) {
  const perSlot = new Map();
  for (const booking of bookings) perSlot.set(booking.slot, (perSlot.get(booking.slot) || 0) + 1);
  return Math.max(0, ...perSlot.values());
}

/* Who has to move when a day drops to fewer examiners: anyone with an examiner
   who is going, into the lowest free number at the same time. */
export function planMoves(bookings, examiners) {
  const moves = [];
  const bySlot = new Map();
  for (const booking of bookings) {
    if (!bySlot.has(booking.slot)) bySlot.set(booking.slot, []);
    bySlot.get(booking.slot).push(booking);
  }
  for (const [, group] of bySlot) {
    const taken = group.filter((booking) => booking.examiner <= examiners).map((booking) => booking.examiner);
    for (const booking of group.filter((row) => row.examiner > examiners).sort((a, b) => a.examiner - b.examiner)) {
      const to = lowestFreeExaminer(taken, examiners);
      if (!to) return null; // More students at this time than examiners left.
      taken.push(to);
      moves.push({ id: booking.id, from: booking.examiner, to });
    }
  }
  return moves;
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

/* Which mock oral a day is: Mock 1, Mock 2 and so on, in date order through one
   school year (August to July), so next year's start again at Mock 1. It is
   what a student calls them, and it tells four near-identical bookings apart. */
const DAY_NUMBER = `(SELECT count(*)::int FROM mock_oral_days o
    WHERE o.on_date <= d.on_date
      AND date_trunc('year', o.on_date - interval '7 months') = date_trunc('year', d.on_date - interval '7 months'))`;
export const mockLabel = (number) => `Mock ${number}`;

const BOOKING_SELECT = `
  SELECT b.id, b.day_id, b.student_id, b.slot, b.examiner, b.starts_at, b.status, b.created_at,
         d.on_date, d.note, d.examiners, ${DAY_NUMBER} day_number,
         COALESCE(e.name,'') examiner_name, COALESCE(e.link,'') examiner_link,
         b.manage_token,
         COALESCE(NULLIF(b.name,''), u.name, '') student_name,
         COALESCE(NULLIF(b.email,''), u.email, '') student_email
  FROM mock_oral_bookings b
  JOIN mock_oral_days d ON d.id=b.day_id
  LEFT JOIN users u ON u.id=b.student_id
  LEFT JOIN mock_oral_examiners e ON e.day_id=b.day_id AND e.number=b.examiner`;

/* A booking as the emails and the student's page want it. */
function oralFrom(row) {
  const slot = SLOTS[row.slot - 1];
  return {
    id: row.id,
    dayId: row.day_id,
    date: row.on_date,
    number: row.day_number,
    label: mockLabel(row.day_number),
    slot: row.slot,
    start: slot.start,
    end: slot.end,
    startsAt: new Date(row.starts_at).toISOString(),
    minutes: ORAL_MINUTES,
    examiner: row.examiner,
    examinerName: row.examiner_name || '',
    link: row.examiner_link || '',
    note: row.note || '',
    /* Where this one booking can be seen and cancelled without signing in. The
       token in it is the booking's own, and only ever goes to whoever made it. */
    manageUrl: row.manage_token ? `${config.appUrl}/mock-oral?b=${row.manage_token}` : '',
  };
}

/* Whoever the booking is for. `id` is their portal account when the email they
   booked with is one the portal knows, and null when it is not. */
const studentFrom = (row) => ({ id: row.student_id || null, name: row.student_name, email: row.student_email });

async function bookingRow(id) {
  return one(`${BOOKING_SELECT} WHERE b.id=$1`, [id]);
}

/* An email that fails must not undo the booking it is about. The booking is
   the fact; the email is the telling of it, and the student's page says the
   same thing either way. */
async function tell(send, what) {
  try {
    const result = await send();
    return !result?.suppressed;
  } catch (error) {
    console.error(`Mock oral ${what} email failed: ${error.message}`);
    return false;
  }
}

/* Can this student book this day at all: are they in one of its classes. */
const ELIGIBLE = `EXISTS (
  SELECT 1 FROM class_students cs
  JOIN classes c ON c.id=cs.class_id AND c.active=true
  WHERE cs.student_id=$1 AND cs.active=true
    AND (d.class_ids IS NULL OR cs.class_id = ANY(d.class_ids)))`;

/* A booking still to come. It counts until the oral is over, not until it
   starts, so the page and the link are still there during it. */
const UPCOMING = `b.status='booked' AND b.starts_at > now() - interval '${ORAL_MINUTES} minutes'`;

/* ------------------------------------------------------------------ student */

/* Each mock oral day is its own event: a student books one time on every day
   they want to sit, so they can hold several bookings at once, one a day. This
   is the part of a day's query that leaves out the days they already have. */
const NOT_MINE = `NOT EXISTS (
  SELECT 1 FROM mock_oral_bookings m
  WHERE m.day_id=d.id AND m.student_id=$1 AND m.status='booked')`;

/* What the student's first load needs to know: is there anything to show in
   the navigation at all, which days they are booked on, and which they can
   still book. Null is "no mock orals for you", and the tab is simply not
   there. */
export async function studentMockOral(studentId) {
  const [mine, open] = await Promise.all([
    query(
      `SELECT b.starts_at, b.examiner, d.on_date, ${DAY_NUMBER} day_number FROM mock_oral_bookings b
       JOIN mock_oral_days d ON d.id=b.day_id
       WHERE b.student_id=$1 AND ${UPCOMING} ORDER BY b.starts_at`, [studentId]),
    /* The dates as well as the yes or no, so the calendar can mark each day. */
    query(
      `SELECT d.on_date, ${DAY_NUMBER} day_number FROM mock_oral_days d
       WHERE d.booking_open=true AND d.on_date >= $2::date AND ${ELIGIBLE} AND ${NOT_MINE}
       ORDER BY d.on_date`,
      [studentId, todayInIreland()]),
  ]);
  if (!mine.rows.length && !open.rows.length) return null;
  return {
    bookings: mine.rows.map((row) => ({
      date: row.on_date, number: row.day_number,
      startsAt: new Date(row.starts_at).toISOString(), examiner: row.examiner,
    })),
    days: open.rows.map((row) => row.on_date),
    // Which mock each of those open days is, by its date.
    numbers: Object.fromEntries(open.rows.map((row) => [row.on_date, row.day_number])),
  };
}

/* The days a signed-in student is already booked on, for the booking page. */
export async function bookedDayIds(studentId) {
  const rows = await query(
    `SELECT b.day_id FROM mock_oral_bookings b WHERE b.student_id=$1 AND ${UPCOMING}`, [studentId]);
  return rows.rows.map((row) => row.day_id);
}

/* How full each time on a day is, as one object keyed by the oral's number. */
const TAKEN = `COALESCE((SELECT json_object_agg(t.slot, t.n) FROM (
    SELECT slot, count(*)::int n FROM mock_oral_bookings
    WHERE day_id=d.id AND status='booked' GROUP BY slot) t), '{}'::json) taken`;

/* A day as somebody booking sees it: times, and whether each can still be had.
   Never who is in them, and never how many examiners there are. */
function bookableDay(day, now) {
  const slots = SLOTS.map((slot) => {
    const past = slotStartsAt(day.on_date, slot.slot) <= now;
    const full = (day.taken[slot.slot] || 0) >= day.examiners;
    return { slot: slot.slot, start: slot.start, end: slot.end, full, past };
  });
  return {
    id: day.id,
    date: day.on_date,
    number: day.day_number,
    label: mockLabel(day.day_number),
    slots,
    // Nothing left to pick: every time is either taken or gone.
    full: slots.every((slot) => slot.full || slot.past),
  };
}
const stillToCome = (day) => day.slots.some((slot) => !slot.past);

/* The booking page, which needs no sign-in: every day that is open. */
export async function publicView(now = new Date()) {
  const days = await query(
    `SELECT d.id, d.on_date, d.examiners, ${DAY_NUMBER} day_number, ${TAKEN}
     FROM mock_oral_days d
     WHERE d.booking_open=true AND d.on_date >= $1::date
     ORDER BY d.on_date`,
    [todayInIreland(now)],
  );
  return { days: days.rows.map((day) => bookableDay(day, now)).filter(stillToCome) };
}

/* One booking, found by the private token in its emails. */
export async function publicBooking(token, now = new Date()) {
  const row = await one(`${BOOKING_SELECT} WHERE b.manage_token=$1`, [token]);
  if (!row) return null;
  return {
    ...oralFrom(row),
    name: row.student_name,
    email: row.student_email,
    status: row.status,
    canCancel: row.status === 'booked' && new Date(row.starts_at) > now,
  };
}

/* The student's Mock oral page in the portal: every booking they hold, and the
   days they have not booked yet. */
export async function studentView(studentId, now = new Date()) {
  const [mine, days] = await Promise.all([
    query(`${BOOKING_SELECT} WHERE b.student_id=$1 AND ${UPCOMING} ORDER BY b.starts_at`, [studentId]),
    query(
      `SELECT d.id, d.on_date, d.examiners, ${DAY_NUMBER} day_number, ${TAKEN}
       FROM mock_oral_days d
       WHERE d.booking_open=true AND d.on_date >= $2::date AND ${ELIGIBLE} AND ${NOT_MINE}
       ORDER BY d.on_date`,
      [studentId, todayInIreland(now)],
    ),
  ]);
  return {
    bookings: mine.rows.map((row) => ({ ...oralFrom(row), canCancel: new Date(row.starts_at) > now })),
    days: days.rows.map((day) => bookableDay(day, now)).filter(stillToCome),
  };
}

/* Book a time.
   ------------------------------------------------------------------
   Three ways in. Somebody on the booking page types a name and an email and has
   no account in front of them; a student in the portal is already known; and
   the teacher places a student in a particular cell of the grid. `examiner` is
   only ever given by the teacher. Everybody else is given the lowest free. */
export async function book({ dayId, slot, studentId = null, name = '', email = '', examiner = null, actor = null }) {
  const asTeacher = actor?.role === 'admin';
  const typed = String(email || '').trim().toLowerCase();
  const ACTIVE_STUDENT = `SELECT id, name, email FROM users
    WHERE role='student' AND active=true AND withdrawn_at IS NULL`;
  let id;
  try {
    id = await transaction(async (client) => {
      /* Who this is. An email the portal knows is tied to that student, so the
         booking shows in their portal as well; a student who is signed in is
         tied to their own account whichever address they typed. */
      let student = null;
      if (studentId) {
        student = (await client.query(`${ACTIVE_STUDENT} AND id=$1`, [studentId])).rows[0];
        if (!student) fail(404, 'That student is not active in the portal.');
      } else {
        if (typed) student = (await client.query(`${ACTIVE_STUDENT} AND lower(email)=$1`, [typed])).rows[0] || null;
        if (!student && actor?.role === 'student') {
          student = (await client.query(`${ACTIVE_STUDENT} AND id=$1`, [actor.id])).rows[0] || null;
        }
      }
      const contact = {
        name: String(name || '').trim() || student?.name || '',
        email: typed || String(student?.email || '').toLowerCase(),
      };
      if (!contact.name || !contact.email) fail(400, 'Enter your name and your email address.');

      /* One person, one booking at a time: two tabs pressing Book at once wait
         here rather than both getting past the check below. */
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mock-oral:${contact.email}`]);
      /* And one booking into a day at a time, so two students after the last
         place at 10:20 cannot both be given it. */
      const day = (await client.query('SELECT * FROM mock_oral_days WHERE id=$1 FOR UPDATE', [dayId])).rows[0];
      if (!day) fail(404, 'That mock oral day is no longer there.');
      if (!SLOTS[slot - 1]) fail(400, 'Pick one of the times shown.');

      if (!asTeacher) {
        if (!day.booking_open) fail(409, 'Booking is not open for that day.');
        /* A day kept to certain classes needs to know who is asking, and the
           only way to know without a sign-in is the email the portal has. */
        if (day.class_ids) {
          const allowed = student && (await client.query(
            `SELECT 1 FROM mock_oral_days d WHERE d.id=$2 AND ${ELIGIBLE}`, [student.id, dayId])).rows[0];
          if (!allowed) fail(403, 'These mock orals are for certain classes. Book with the email address you use for the class portal.');
        }
      }

      const startsAt = slotStartsAt(day.on_date, slot);
      if (startsAt <= new Date()) fail(409, 'That time has already passed. Pick a later one.');

      /* One booking a day for a person. Each day is its own event, so a
         booking on another day is no reason to refuse this one. */
      const already = (await client.query(
        `SELECT b.id FROM mock_oral_bookings b
         WHERE b.day_id=$3 AND b.status='booked'
           AND (lower(b.email)=$1 OR ($2::uuid IS NOT NULL AND b.student_id=$2::uuid)) LIMIT 1`,
        [contact.email, student?.id || null, dayId])).rows[0];
      if (already) {
        fail(409, asTeacher
          ? 'That student already has a mock oral booked on this day. Remove it first to move them.'
          : 'You already have a mock oral booked on this day. To change the time, cancel it first with the button in your confirmation email.');
      }

      const taken = (await client.query(
        `SELECT examiner FROM mock_oral_bookings WHERE day_id=$1 AND slot=$2 AND status='booked'`,
        [dayId, slot])).rows.map((row) => row.examiner);
      let chosen = lowestFreeExaminer(taken, day.examiners);
      if (examiner !== null && examiner !== undefined) {
        if (examiner < 1 || examiner > day.examiners) fail(400, 'That examiner is not working this day.');
        if (taken.includes(examiner)) fail(409, 'That place has just been taken.');
        chosen = examiner;
      }
      if (!chosen) fail(409, 'That time has just filled up. Pick another one.');

      const inserted = await client.query(
        `INSERT INTO mock_oral_bookings(day_id,student_id,name,email,manage_token,slot,examiner,starts_at,booked_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [dayId, student?.id || null, contact.name, contact.email, randomToken(24), slot, chosen, startsAt, actor?.id || null]);
      return inserted.rows[0].id;
    });
  } catch (error) {
    // The unique indexes are the last line; they should never be what answers.
    if (error.code === '23505') fail(409, 'That place has just been taken. Pick another time.');
    throw error;
  }

  const row = await bookingRow(id);
  const oral = oralFrom(row);
  const emailed = await tell(() => sendMockOralConfirmation({ student: studentFrom(row), oral }), 'confirmation');
  return { booking: oral, student: studentFrom(row), emailed, token: row.manage_token };
}

/* Cancel one booking. Whoever made it may cancel it until it starts, in the
   portal or with the private link from its emails; the teacher may remove
   anybody's. Either way the place is free again at once. */
export async function cancel({ bookingId = null, token = null, actor = null }) {
  const asTeacher = actor?.role === 'admin';
  const row = await transaction(async (client) => {
    const found = token
      ? (await client.query('SELECT * FROM mock_oral_bookings WHERE manage_token=$1 FOR UPDATE', [token])).rows[0]
      : (await client.query('SELECT * FROM mock_oral_bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
    // The token is the proof on the booking page. In the portal it is the account.
    const theirs = Boolean(token) || (found?.student_id && found.student_id === actor?.id);
    if (!found || (!asTeacher && !theirs)) fail(404, 'That booking is no longer there.');
    if (found.status === 'cancelled') return null; // Pressed twice: already done, say nothing more.
    if (!asTeacher && new Date(found.starts_at) <= new Date()) {
      fail(409, 'Your mock oral has already started, so it can no longer be cancelled here.');
    }
    await client.query(
      `UPDATE mock_oral_bookings SET status='cancelled', cancelled_at=now(), cancelled_by=$2 WHERE id=$1`,
      [found.id, actor?.id || null]);
    return found;
  });
  if (!row) return { cancelled: false, emailed: false };

  const full = await bookingRow(row.id);
  const oral = oralFrom(full);
  /* No email about an oral that has already been and gone: the teacher tidying
     the grid afterwards should not write to anybody. */
  const upcoming = new Date(full.starts_at) > new Date();
  const emailed = upcoming && await tell(
    () => sendMockOralCancelled({ student: studentFrom(full), oral, by: asTeacher ? 'teacher' : 'student' }),
    'cancellation');
  return { cancelled: true, emailed, booking: oral, student: studentFrom(full) };
}

/* -------------------------------------------------------------------- admin */

function classLabel(klass) {
  const day = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][klass.day_of_week] || '';
  return [klass.programme_name, day, String(klass.start_time || '').slice(0, 5)].filter(Boolean).join(' | ');
}

/* Students who could book a day: active, in an active class the day is open to. */
const DAY_STUDENTS = `
  SELECT DISTINCT u.id, u.name, u.email
  FROM class_students cs
  JOIN classes c ON c.id=cs.class_id AND c.active=true
  JOIN users u ON u.id=cs.student_id AND u.role='student' AND u.active=true AND u.withdrawn_at IS NULL
  WHERE cs.active=true`;

function daySummary(day) {
  const booked = Number(day.booked) || 0;
  return {
    id: day.id,
    date: day.on_date,
    number: day.day_number,
    label: mockLabel(day.day_number),
    examiners: day.examiners,
    bookingOpen: day.booking_open,
    classIds: day.class_ids || null,
    note: day.note || '',
    capacity: capacity(day.examiners),
    booked,
    free: Math.max(0, capacity(day.examiners) - booked),
    percent: percentBooked(booked, day.examiners),
    students: Number(day.students) || 0,
    past: day.on_date < todayInIreland(),
  };
}

const DAY_SELECT = `
  SELECT d.*, ${DAY_NUMBER} day_number,
    (SELECT count(*)::int FROM mock_oral_bookings b WHERE b.day_id=d.id AND b.status='booked') booked,
    (SELECT count(*)::int FROM (${DAY_STUDENTS} AND (d.class_ids IS NULL OR cs.class_id = ANY(d.class_ids))) s) students
  FROM mock_oral_days d`;

export async function adminOverview() {
  const [days, classes] = await Promise.all([
    query(`${DAY_SELECT} ORDER BY d.on_date`),
    query(
      `SELECT c.id, c.programme_name, c.day_of_week, c.start_time,
              (SELECT count(*)::int FROM class_students cs
               JOIN users u ON u.id=cs.student_id AND u.role='student' AND u.active=true AND u.withdrawn_at IS NULL
               WHERE cs.class_id=c.id AND cs.active=true) students
       FROM classes c WHERE c.active=true ORDER BY c.programme_name, c.day_of_week, c.start_time`),
  ]);
  return {
    slotsPerExaminer: SLOTS_PER_EXAMINER,
    maxExaminers: MAX_EXAMINERS,
    days: days.rows.map(daySummary),
    classes: classes.rows.map((klass) => ({ id: klass.id, label: classLabel(klass), students: klass.students })),
  };
}

export async function adminDay(dayId) {
  const day = await one(`${DAY_SELECT} WHERE d.id=$1`, [dayId]);
  if (!day) fail(404, 'That mock oral day is no longer there.');
  const [bookings, examiners, students] = await Promise.all([
    query(`${BOOKING_SELECT} WHERE b.day_id=$1 AND b.status='booked' ORDER BY b.slot, b.examiner`, [dayId]),
    query('SELECT number, name, link FROM mock_oral_examiners WHERE day_id=$1', [dayId]),
    /* Who the teacher could still place by hand: anyone the day is open to who
       has no oral booked. */
    query(
      `SELECT s.id, s.name, s.email FROM (${DAY_STUDENTS} AND ($1::uuid[] IS NULL OR cs.class_id = ANY($1::uuid[]))) s
       WHERE NOT EXISTS (SELECT 1 FROM mock_oral_bookings b
                         WHERE b.student_id=s.id AND b.day_id=$2 AND b.status='booked')
       ORDER BY s.name`, [day.class_ids, dayId]),
  ]);
  const named = new Map(examiners.rows.map((row) => [row.number, row]));
  const perExaminer = new Map();
  for (const booking of bookings.rows) perExaminer.set(booking.examiner, (perExaminer.get(booking.examiner) || 0) + 1);

  return {
    day: { ...daySummary(day), examinersNeeded: examinersNeeded(bookings.rows) },
    timetable: TIMETABLE,
    examiners: Array.from({ length: day.examiners }, (_, index) => {
      const number = index + 1;
      return {
        number,
        name: named.get(number)?.name || '',
        link: named.get(number)?.link || '',
        booked: perExaminer.get(number) || 0,
      };
    }),
    bookings: bookings.rows.map((row) => ({
      id: row.id,
      slot: row.slot,
      examiner: row.examiner,
      startsAt: new Date(row.starts_at).toISOString(),
      bookedAt: new Date(row.created_at).toISOString(),
      student: studentFrom(row),
      // Booked with an email the portal does not know.
      guest: !row.student_id,
    })),
    students: students.rows,
  };
}

async function checkClasses(classIds) {
  if (!classIds) return null;
  if (!classIds.length) fail(400, 'Pick at least one class that can book, or choose every class.');
  const found = await query('SELECT id FROM classes WHERE id = ANY($1::uuid[])', [classIds]);
  if (found.rows.length !== new Set(classIds).size) fail(400, 'One of those classes is no longer there.');
  return [...new Set(classIds)];
}

export async function createDay({ date, examiners, classIds = null, note = '', actor }) {
  if (!validDate(date)) fail(400, 'Pick the date of the mock orals.');
  if (date < todayInIreland()) fail(400, 'That date has already passed.');
  const classes = await checkClasses(classIds);
  try {
    const row = await one(
      `INSERT INTO mock_oral_days(on_date,examiners,class_ids,note,created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [date, examiners, classes, note.trim(), actor.id]);
    return row.id;
  } catch (error) {
    if (error.code === '23505') fail(409, 'There is already a mock oral day on that date. Open it to change it.');
    throw error;
  }
}

/* Change a day. Two of the changes reach students who have already booked:
   moving the date moves every oral with it, and dropping examiners moves anyone
   who was with one of them. Both are told, after the change is safely saved. */
export async function updateDay({ dayId, patch, actor }) {
  const changed = [];
  try {
    await transaction(async (client) => {
      const day = (await client.query('SELECT * FROM mock_oral_days WHERE id=$1 FOR UPDATE', [dayId])).rows[0];
      if (!day) fail(404, 'That mock oral day is no longer there.');
      const live = (await client.query(
        `SELECT id, slot, examiner, starts_at FROM mock_oral_bookings WHERE day_id=$1 AND status='booked'`,
        [dayId])).rows;
      const before = new Map(live.map((row) => [row.id, { examiner: row.examiner, startsAt: row.starts_at }]));

      if (patch.examiners !== undefined && patch.examiners !== day.examiners) {
        if (patch.examiners < day.examiners) {
          const moves = planMoves(live, patch.examiners);
          if (!moves) {
            const need = examinersNeeded(live);
            fail(409, `You need at least ${need} examiner${need === 1 ? '' : 's'}: ${need} students are booked at the same time. Remove a booking first.`);
          }
          // Only ever into a number that is free, so no two bookings pass through one seat.
          for (const move of moves) {
            await client.query('UPDATE mock_oral_bookings SET examiner=$2 WHERE id=$1', [move.id, move.to]);
          }
        }
        await client.query('UPDATE mock_oral_days SET examiners=$2, updated_at=now() WHERE id=$1', [dayId, patch.examiners]);
      }

      if (patch.date !== undefined && patch.date !== day.on_date) {
        if (!validDate(patch.date)) fail(400, 'Pick the date of the mock orals.');
        if (patch.date < todayInIreland()) fail(400, 'That date has already passed.');
        await client.query('UPDATE mock_oral_days SET on_date=$2, updated_at=now() WHERE id=$1', [dayId, patch.date]);
        for (const row of live) {
          await client.query('UPDATE mock_oral_bookings SET starts_at=$2 WHERE id=$1',
            [row.id, slotStartsAt(patch.date, row.slot)]);
        }
      }

      if (patch.bookingOpen !== undefined) {
        await client.query('UPDATE mock_oral_days SET booking_open=$2, updated_at=now() WHERE id=$1', [dayId, patch.bookingOpen]);
      }
      if (patch.classIds !== undefined) {
        await client.query('UPDATE mock_oral_days SET class_ids=$2, updated_at=now() WHERE id=$1',
          [dayId, await checkClasses(patch.classIds)]);
      }
      if (patch.note !== undefined) {
        await client.query('UPDATE mock_oral_days SET note=$2, updated_at=now() WHERE id=$1', [dayId, patch.note.trim()]);
      }

      const after = (await client.query(
        `SELECT id, examiner, starts_at FROM mock_oral_bookings WHERE day_id=$1 AND status='booked'`, [dayId])).rows;
      for (const row of after) {
        const was = before.get(row.id);
        if (!was) continue;
        if (was.examiner !== row.examiner || new Date(was.startsAt).getTime() !== new Date(row.starts_at).getTime()) {
          changed.push({ id: row.id, was });
        }
      }
    });
  } catch (error) {
    if (error.code === '23505') fail(409, 'There is already a mock oral day on that date.');
    throw error;
  }

  let emailed = 0;
  for (const change of changed) {
    const row = await bookingRow(change.id);
    // An oral that has already happened is history; nobody is told it "moved".
    if (!row || new Date(row.starts_at) <= new Date()) continue;
    const was = { ...oralFrom(row), examiner: change.was.examiner, startsAt: new Date(change.was.startsAt).toISOString() };
    if (await tell(() => sendMockOralChanged({ student: studentFrom(row), oral: oralFrom(row), was }), 'change')) emailed += 1;
  }
  return { changed: changed.length, emailed, actorId: actor.id };
}

/* Take a day off altogether. Everyone still to sit an oral on it is told. */
export async function deleteDay({ dayId }) {
  const rows = await transaction(async (client) => {
    const day = (await client.query('SELECT id FROM mock_oral_days WHERE id=$1 FOR UPDATE', [dayId])).rows[0];
    if (!day) fail(404, 'That mock oral day is no longer there.');
    const booked = (await client.query(
      `${BOOKING_SELECT} WHERE b.day_id=$1 AND b.status='booked' AND b.starts_at > now()`, [dayId])).rows;
    await client.query('DELETE FROM mock_oral_days WHERE id=$1', [dayId]);
    return booked;
  });
  let emailed = 0;
  for (const row of rows) {
    if (await tell(() => sendMockOralCancelled({ student: studentFrom(row), oral: oralFrom(row), by: 'day' }), 'cancellation')) emailed += 1;
  }
  return { cancelled: rows.length, emailed };
}

export async function setExaminer({ dayId, number, name = '', link = '' }) {
  const day = await one('SELECT examiners FROM mock_oral_days WHERE id=$1', [dayId]);
  if (!day) fail(404, 'That mock oral day is no longer there.');
  if (number < 1 || number > day.examiners) fail(400, 'That examiner is not working this day.');
  const address = link.trim();
  if (address && !/^https?:\/\/\S+$/i.test(address)) fail(400, 'A link has to start with https://');
  await query(
    `INSERT INTO mock_oral_examiners(day_id,number,name,link) VALUES ($1,$2,$3,$4)
     ON CONFLICT (day_id,number) DO UPDATE SET name=EXCLUDED.name, link=EXCLUDED.link`,
    [dayId, number, name.trim(), address]);
}

/* Everyone booked on a day is sent their time, examiner and link: the email the
   teacher sends once the examiners' links are in. */
export async function emailDetails({ dayId }) {
  const rows = await query(
    `${BOOKING_SELECT} WHERE b.day_id=$1 AND b.status='booked' AND b.starts_at > now() ORDER BY b.slot, b.examiner`, [dayId]);
  let emailed = 0;
  for (const row of rows.rows) {
    if (await tell(() => sendMockOralDetails({ student: studentFrom(row), oral: oralFrom(row) }), 'details')) emailed += 1;
  }
  return { students: rows.rows.length, emailed };
}

function csvCell(value) {
  const text = String(value ?? '');
  // A leading = + - @ is a formula to a spreadsheet; a name is never one.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function dayCsv(dayId) {
  const detail = await adminDay(dayId);
  const examiner = new Map(detail.examiners.map((row) => [row.number, row]));
  const lines = [['Time', 'Examiner', 'Examiner name', 'Student', 'Email', 'Link'].join(',')];
  for (const booking of detail.bookings) {
    const slot = SLOTS[booking.slot - 1];
    const who = examiner.get(booking.examiner);
    lines.push([
      `${slot.start} to ${slot.end}`, `Examiner ${booking.examiner}`, who?.name || '',
      booking.student.name, booking.student.email, who?.link || '',
    ].map(csvCell).join(','));
  }
  return { date: detail.day.date, csv: `${lines.join('\n')}\n` };
}

/* ---------------------------------------------------------------- reminders */

const HOUR = 60 * 60 * 1000;

/* Which reminder a booking is due, if any, at this moment.
   ------------------------------------------------------------------
   Two reminders: the day before, and about an hour before. Each is skipped when
   the student booked so recently that the confirmation has only just told them
   the same thing. Pure, so the timings can be tested without a clock. */
export function reminderDue({ startsAt, createdAt, dayReminderFor, hourReminderFor }, now = new Date()) {
  const start = new Date(startsAt).getTime();
  const made = new Date(createdAt).getTime();
  const until = start - now.getTime();
  if (until <= 0 || until > 24 * HOUR) return null;
  const sentFor = (value) => value && new Date(value).getTime() === start;

  if (until <= HOUR) {
    if (sentFor(hourReminderFor) || made > start - 2 * HOUR) return null;
    return 'hour';
  }
  // Inside three hours the hour reminder is next; a "tomorrow" email now is noise.
  if (until <= 3 * HOUR) return null;
  if (sentFor(dayReminderFor) || made > start - 27 * HOUR) return null;
  return 'day';
}

/* Run from the reminder scheduler every few minutes. A reminder is claimed
   before it is sent, so two cycles can never send it twice, and handed back if
   the send fails or is held, so it is tried again while it is still due. */
export async function runMockOralReminders(now = new Date()) {
  const due = await query(
    `SELECT b.id, b.starts_at, b.created_at, b.day_reminder_for, b.hour_reminder_for
     FROM mock_oral_bookings b
     LEFT JOIN users u ON u.id=b.student_id
     WHERE b.status='booked' AND b.starts_at > $1 AND b.starts_at <= $1::timestamptz + interval '24 hours'
       -- Somebody with no portal account is reminded; a student who has left is not.
       AND (b.student_id IS NULL OR (u.active=true AND u.withdrawn_at IS NULL))`,
    [now]);
  let sent = 0;
  for (const booking of due.rows) {
    const when = reminderDue({
      startsAt: booking.starts_at, createdAt: booking.created_at,
      dayReminderFor: booking.day_reminder_for, hourReminderFor: booking.hour_reminder_for,
    }, now);
    if (!when) continue;
    const column = when === 'hour' ? 'hour_reminder_for' : 'day_reminder_for';
    const claimed = await one(
      `UPDATE mock_oral_bookings SET ${column}=starts_at
       WHERE id=$1 AND status='booked' AND ${column} IS DISTINCT FROM starts_at RETURNING id`, [booking.id]);
    if (!claimed) continue;

    const row = await bookingRow(booking.id);
    let held = false;
    let ok = false;
    try {
      const result = await sendMockOralReminder({ student: studentFrom(row), oral: oralFrom(row), when, now });
      held = Boolean(result?.suppressed);
      ok = !held;
    } catch (error) {
      console.error(`Mock oral reminder email failed: ${error.message}`);
    }
    if (ok) sent += 1;
    else await query(`UPDATE mock_oral_bookings SET ${column}=NULL WHERE id=$1`, [booking.id]);
    /* Sending is paused by hand: the rest would be held too, and asking for
       each of them every five minutes only fills the log. Next cycle asks again. */
    if (held) break;
  }
  return sent;
}
