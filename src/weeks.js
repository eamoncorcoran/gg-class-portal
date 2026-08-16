import { DateTime } from 'luxon';
import { query } from './db.js';

/* Students see a check-in from Friday afternoon and have until Sunday evening.
   Both are per-week overridable from the Weekly check-ins screen. */
export const CHECKIN_DEFAULTS = Object.freeze({
  releaseDay: 5, releaseHour: 14, releaseMinute: 0,   // Friday 14:00
  dueDay: 7, dueHour: 20, dueMinute: 0,               // Sunday 20:00
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
  const inserts = [];
  for (let i = -2; i < count; i += 1) {
    const week = monday.plus({ weeks: i });
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
