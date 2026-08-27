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
export function nextClassAt(classRow, now = DateTime.utc(), skips = []) {
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
  let starts = reference < endsAt ? thisWeek : thisWeek.plus({ weeks: 1 });

  /* The day and the time describe most weeks and not the ones that matter. A
     term has a first and last day, and inside it there are weeks the class does
     not meet — a bank holiday, a mid-term. Without this the banner counted down
     to a class nobody was holding, which is worse than saying nothing.

     Skipped weeks are stepped over rather than reasoned about, and the search is
     bounded: a term of skips, or a course that has ended, must not spin. */
  const termStart = classRow.starts_on
    ? DateTime.fromJSDate(new Date(classRow.starts_on)).setZone(zone).startOf('day') : null;
  const termEnd = classRow.ends_on
    ? DateTime.fromJSDate(new Date(classRow.ends_on)).setZone(zone).endOf('day') : null;
  const skipped = new Set((skips || []).map((skip) =>
    String(skip.skip_on ?? skip).slice(0, 10)));

  if (termStart && starts < termStart) {
    // Before the course begins, the first class is the first sitting in term.
    const weeksAhead = Math.ceil(termStart.diff(starts, 'weeks').weeks);
    starts = starts.plus({ weeks: Math.max(weeksAhead, 0) });
    if (starts < termStart) starts = starts.plus({ weeks: 1 });
  }

  for (let guard = 0; guard < 60 && skipped.has(starts.toISODate()); guard += 1) {
    starts = starts.plus({ weeks: 1 });
  }

  // Past the end of the course there is no next class, and saying so is right.
  if (termEnd && starts > termEnd) return null;

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

/**
 * The next class, counting the occasional extra session.
 *
 * The weekly slot covers the ordinary week. Some weeks carry an extra evening,
 * and from a student's side that is simply the next class — so whichever comes
 * sooner wins, and the link travels with it rather than with the class.
 *
 * A cancelled session is skipped but not forgotten: it stays on the row so the
 * administrator can see they called it off.
 */
export function nextClassWithSessions(classRow, sessions = [], now = DateTime.utc(), skips = []) {
  const reference = (now.isLuxonDateTime ? now : DateTime.fromJSDate(new Date(now)));
  const recurring = nextClassAt(classRow, reference, skips);

  const upcoming = (sessions || [])
    .filter((session) => !session.cancelled)
    .map((session) => {
      const starts = DateTime.fromJSDate(new Date(session.starts_at)).setZone(classRow?.timezone || 'Europe/Dublin');
      const endsAt = starts.plus({ minutes: session.duration_minutes || CLASS_RUNS_FOR_MINUTES });
      return { session, starts, endsAt };
    })
    // Still to come, or under way — a class that began twenty minutes ago is
    // the one somebody is looking for.
    .filter((item) => reference < item.endsAt)
    .sort((a, b) => a.starts - b.starts)[0];

  if (!upcoming) return recurring;
  if (recurring && DateTime.fromISO(recurring.startsAt) <= upcoming.starts) return recurring;

  const minutesAway = Math.round(upcoming.starts.diff(reference, 'minutes').minutes);
  return {
    startsAt: upcoming.starts.toUTC().toISO(),
    timezone: classRow?.timezone || 'Europe/Dublin',
    minutesAway,
    live: minutesAway <= 0,
    soon: minutesAway > 0 && minutesAway <= SOON_WITHIN_HOURS * 60,
    weekStart: upcoming.starts.startOf('week').toISODate(),
    // An extra session brings its own link; without one it falls back to the
    // class link, which is usually the same room.
    sessionJoinUrl: upcoming.session.join_url || null,
    sessionLabel: upcoming.session.label || null,
    isExtra: true,
  };
}
