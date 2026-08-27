import { DateTime } from 'luxon';
import { query } from './db.js';

/* Students see a check-in from Friday afternoon and have until Sunday evening.
   Both are per-week overridable from the Weekly check-ins screen. */
export const CHECKIN_DEFAULTS = Object.freeze({
  releaseDay: 5, releaseHour: 10, releaseMinute: 0,   // Friday 10:00
  dueDay: 7, dueHour: 23, dueMinute: 45,              // Sunday 23:45
});

/** The release and due instants for one week, in the class timezone. */
export function checkinTimesFor(monday, options = {}) {
  const settings = { ...CHECKIN_DEFAULTS, ...options };
  const release = monday.plus({ days: settings.releaseDay - 1 })
    .set({ hour: settings.releaseHour, minute: settings.releaseMinute, second: 0, millisecond: 0 });
  const due = monday.plus({ days: settings.dueDay - 1 })
    .set({ hour: settings.dueHour, minute: settings.dueMinute, second: 0, millisecond: 0 });
  return { release, due };
}

export async function ensureWeeksForClass(classRow, count = 18) {
  const zone = classRow.timezone || 'Europe/Dublin';
  const monday = DateTime.now().setZone(zone).startOf('week');

  /* A term, where one is set, decides which weeks exist. Without it this ran
     from a fortnight ago to eighteen weeks out, which is a window around today
     rather than around the course — so a class set up in August showed students
     weeks in August, before anything had been taught.

     A class with no term keeps the old behaviour rather than losing its weeks. */
  const termStart = classRow.starts_on
    ? DateTime.fromJSDate(new Date(classRow.starts_on)).setZone(zone).startOf('week') : null;
  const termEnd = classRow.ends_on
    ? DateTime.fromJSDate(new Date(classRow.ends_on)).setZone(zone).endOf('week') : null;

  /* Start from the beginning of term rather than from today, so a course set up
     mid-year still gets the weeks it has already taught. */
  const first = termStart && termStart > monday.minus({ weeks: 2 }) ? termStart : monday.minus({ weeks: 2 });
  const weeks = termStart && termEnd
    ? Math.ceil(termEnd.diff(first, 'weeks').weeks) + 1
    : count + 2;

  const inserts = [];
  for (let i = 0; i < weeks; i += 1) {
    const week = first.plus({ weeks: i });
    if (termStart && week < termStart) continue;
    if (termEnd && week > termEnd) break;
    const { release, due } = checkinTimesFor(week);
    inserts.push(query(
      `INSERT INTO weeks(class_id,week_start,checkin_release_at,checkin_due_at)
       VALUES ($1,$2,$3,$4) ON CONFLICT (class_id,week_start) DO NOTHING`,
      [classRow.id, week.toISODate(), release.toUTC().toISO(), due.toUTC().toISO()],
    ));
  }
  await Promise.all(inserts);
}

/**
 * Lays out a run of check-ins between two dates.
 *
 * Weeks outside the range are left alone entirely, so building a term does not
 * disturb one already built. Weeks listed as exceptions are created but switched
 * off, which keeps the teaching week on the tracker while asking nothing of the
 * students that week.
 */
export async function scheduleCheckins(classRow, { startDate, endDate, skipWeekStarts = [], hardDeadline = true, ...times }) {
  const zone = classRow.timezone || 'Europe/Dublin';
  const first = DateTime.fromISO(startDate, { zone }).startOf('week');
  const last = DateTime.fromISO(endDate, { zone }).startOf('week');
  if (!first.isValid || !last.isValid) throw Object.assign(new Error('Enter a valid start and end date.'), { status: 400 });
  if (last < first) throw Object.assign(new Error('The end date must come after the start date.'), { status: 400 });
  if (last.diff(first, 'weeks').weeks > 104) throw Object.assign(new Error('That range covers more than two years.'), { status: 400 });

  const skip = new Set(skipWeekStarts.map((value) => String(value).slice(0, 10)));
  const weeks = [];
  for (let cursor = first; cursor <= last; cursor = cursor.plus({ weeks: 1 })) {
    const isoDate = cursor.toISODate();
    const { release, due } = checkinTimesFor(cursor, times);
    weeks.push({ isoDate, release, due, enabled: !skip.has(isoDate) });
  }

  let created = 0;
  for (const week of weeks) {
    const result = await query(
      `INSERT INTO weeks(class_id,week_start,checkin_release_at,checkin_due_at,checkin_enabled,checkin_hard_deadline)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (class_id,week_start) DO UPDATE
         SET checkin_release_at=EXCLUDED.checkin_release_at,
             checkin_due_at=EXCLUDED.checkin_due_at,
             checkin_enabled=EXCLUDED.checkin_enabled,
             checkin_hard_deadline=EXCLUDED.checkin_hard_deadline
       RETURNING (xmax = 0) AS inserted`,
      [classRow.id, week.isoDate, week.release.toUTC().toISO(), week.due.toUTC().toISO(), week.enabled, hardDeadline],
    );
    if (result.rows[0]?.inserted) created += 1;
  }
  return { total: weeks.length, created, updated: weeks.length - created, skipped: weeks.filter((week) => !week.enabled).length };
}

export async function ensureAllWeeks() {
  const result = await query('SELECT * FROM classes WHERE active=true');
  for (const row of result.rows) await ensureWeeksForClass(row);
}

/* Whether a check-in can be filled in, in one place.
   ------------------------------------------------------------------
   This existed twice and the two copies disagreed. What a student was offered
   asked only whether the check-in had opened; what the server accepted also
   required that it had not closed. So a week past its deadline still arrived
   marked available, the student answered six questions, pressed Submit, and the
   save was refused — the work gone, and nothing on the teacher's screen to say
   anybody had tried.

   Homework never had the problem because it shares one predicate between the
   two. Check-ins do now as well.

   Both forms below say the same thing, and the test in checkinwindow.test.js
   holds them to it. */
export function checkinOpen(week, now = Date.now()) {
  if (!week || week.checkin_enabled === false) return false;
  const at = now instanceof Date ? now.getTime() : now;
  if (new Date(week.checkin_release_at).getTime() > at) return false;
  // A soft deadline keeps accepting; only a hard one closes.
  if (week.checkin_hard_deadline === false) return true;
  return new Date(week.checkin_due_at).getTime() >= at;
}

/** The same rule as SQL, for the queries that have to ask it of many rows. */
export function checkinOpenSql(alias = '') {
  const column = (name) => (alias ? `${alias}.${name}` : name);
  return `(${column('checkin_enabled')} = true
    AND ${column('checkin_release_at')} <= now()
    AND (${column('checkin_hard_deadline')} = false OR ${column('checkin_due_at')} >= now()))`;
}
