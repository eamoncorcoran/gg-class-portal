import { DateTime } from 'luxon';

/* How long a class stays "on" for. Used only to decide whether the join button
   should read `Join now` rather than naming a day, so it is deliberately generous:
   somebody arriving twenty minutes late still wants the obvious button. */
export const CLASS_RUNS_FOR_MINUTES = 120;

/* Someone opening the portal on a Monday afternoon is far more likely to want
   tonight's class than to want to be told it starts in six hours. Inside this
   window the banner counts down; outside it, it names the day. */
export const SOON_WITHIN_HOURS = 12;

/**
 * When this class next meets.
 *
 * The class carries a day, a start time and a timezone, which is enough to work
 * out every future sitting without storing them. Times are resolved in the class
 * timezone rather than the reader's: a student checking from Boston should be
 * told the Dublin class starts at 19:00 Dublin time, and their own clock can do
 * the rest.
 *
 * Returns null only if the class is missing a day or a start time.
 */
export function nextClassAt(classRow, now = DateTime.utc()) {
  if (!classRow?.day_of_week || !classRow?.start_time) return null;
  const zone = classRow.timezone || 'Europe/Dublin';
  const [hour, minute] = String(classRow.start_time).split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const reference = (now.isLuxonDateTime ? now : DateTime.fromJSDate(new Date(now))).setZone(zone);
  const thisWeek = reference.startOf('week')
    .plus({ days: Number(classRow.day_of_week) - 1 })
    .set({ hour, minute, second: 0, millisecond: 0 });

  // A class that started an hour ago has not finished, so it is still the one to
  // point at. Only once it is properly over do we move to next week's.
  const endsAt = thisWeek.plus({ minutes: CLASS_RUNS_FOR_MINUTES });
  const starts = reference < endsAt ? thisWeek : thisWeek.plus({ weeks: 1 });

  const minutesAway = Math.round(starts.diff(reference, 'minutes').minutes);
  return {
    startsAt: starts.toUTC().toISO(),
    timezone: zone,
    minutesAway,
    live: minutesAway <= 0,
    soon: minutesAway > 0 && minutesAway <= SOON_WITHIN_HOURS * 60,
    // The Monday of the week this sitting belongs to, so a week-specific link can
    // be matched against it.
    weekStart: starts.startOf('week').toISODate(),
  };
}

/**
 * The link a student should be given for the next class.
 *
 * A week may override the class link — one session moved to a different room —
 * and otherwise the class link stands for the whole term.
 */
export function joinLinkFor(classRow, weeks = [], next = null) {
  const weekStart = next?.weekStart;
  const override = weekStart
    ? weeks.find((week) => String(week.week_start).slice(0, 10) === weekStart && week.join_url)
    : null;
  return override?.join_url || classRow?.join_url || null;
}
