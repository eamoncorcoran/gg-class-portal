/**
 * iCalendar feeds.
 *
 * Two ways to get deadlines into a real calendar:
 *
 *  - a one-off .ics download for a single assignment, which the calendar app
 *    copies in and then forgets about
 *  - a subscribed feed, which the calendar app re-reads on its own schedule, so
 *    a reopened deadline or a new assignment turns up without anyone re-adding it
 *
 * Subscription is the useful one, and it is also the awkward one: calendar apps
 * fetch over plain HTTP with no cookies, so the URL itself has to be the
 * credential. Each person gets their own unguessable token which grants exactly
 * one thing — read access to their own deadlines — and which they can revoke by
 * generating a new one.
 */
import { DateTime } from 'luxon';
import { config } from './config.js';
import { one, query } from './db.js';
import { randomToken } from './security.js';

/** RFC 5545 wants CRLF, escaped commas and semicolons, and folded long lines. */
function escapeText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

function stamp(value) {
  return DateTime.fromJSDate(new Date(value)).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

/**
 * Builds the calendar document.
 *
 * Each deadline is a 30-minute event ending at the deadline rather than a
 * zero-length one, because a zero-length event is easy to miss in a week view,
 * and an alarm is attached 24 hours out to match the reminder emails.
 */
export function buildCalendar({ name, description, events }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gaeilgeoir Guides//Class Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `NAME:${escapeText(name)}`,
    `X-WR-CALDESC:${escapeText(description)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  for (const event of events) {
    const due = new Date(event.due);
    const start = new Date(due.getTime() - 30 * 60 * 1000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(event.updatedAt || new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(due)}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description || '')}`,
      ...(event.url ? [`URL:${escapeText(event.url)}`] : []),
      `CATEGORIES:${escapeText(event.category || 'Homework')}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT24H',
      `DESCRIPTION:${escapeText(`${event.title} is due tomorrow`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

export function assignmentEvent(assignment, { classLabel, includeInstructions = true } = {}) {
  const due = assignment.reopened_until && new Date(assignment.reopened_until) > new Date(assignment.deadline_at)
    ? assignment.reopened_until
    : assignment.deadline_at;
  const notes = [
    classLabel ? `Class: ${classLabel}` : '',
    includeInstructions && assignment.instructions ? assignment.instructions : '',
    assignment.reopened_until ? 'This assignment was reopened, so the closing time has moved.' : '',
    `Open it here: ${config.appUrl}/?assignment=${assignment.id}`,
  ].filter(Boolean).join('\n\n');
  return {
    uid: `assignment-${assignment.id}@gaeilgeoirguides`,
    title: assignment.title,
    description: notes,
    due,
    updatedAt: assignment.updated_at,
    url: `${config.appUrl}/?assignment=${assignment.id}`,
    category: 'Homework',
  };
}

export function checkinEvent(week, { classLabel } = {}) {
  return {
    uid: `checkin-${week.id}@gaeilgeoirguides`,
    title: 'Weekly check-in',
    description: [classLabel ? `Class: ${classLabel}` : '', `Open it here: ${config.appUrl}/`].filter(Boolean).join('\n\n'),
    due: week.checkin_due_at,
    updatedAt: week.created_at,
    url: config.appUrl,
    category: 'Check-in',
  };
}

/** Returns the caller's feed token, creating one the first time it is asked for. */
export async function ensureCalendarToken(userId) {
  const existing = await one('SELECT calendar_token FROM users WHERE id=$1', [userId]);
  if (existing?.calendar_token) return existing.calendar_token;
  const token = randomToken(24);
  await query('UPDATE users SET calendar_token=$1, updated_at=now() WHERE id=$2', [token, userId]);
  return token;
}

/** Revokes every existing subscription by issuing a new token. */
export async function rotateCalendarToken(userId) {
  const token = randomToken(24);
  await query('UPDATE users SET calendar_token=$1, updated_at=now() WHERE id=$2', [token, userId]);
  return token;
}

function classLabelOf(row) {
  const day = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Number(row.day_of_week)] || '';
  return `${row.programme_name} | ${day} | ${String(row.start_time).slice(0, 5)}`;
}

/**
 * Everything the holder of this token should see.
 *
 * An administrator gets every live deadline across every class. A student gets
 * only their own class, only released weeks, and nothing they have already
 * handed in — a calendar full of work you have finished is noise.
 */
export async function feedForUser(user) {
  if (user.role === 'admin') {
    const assignments = await query(
      `SELECT a.*, c.programme_name, c.day_of_week, c.start_time
       FROM assignments a JOIN classes c ON c.id=a.class_id
       WHERE a.status='published' AND a.deadline_at > now() - interval '90 days'
       ORDER BY a.deadline_at`,
    );
    return {
      name: 'Gaeilgeoir Guides deadlines',
      description: 'Homework deadlines across every class.',
      events: assignments.rows.map((row) => assignmentEvent(row, { classLabel: classLabelOf(row) })),
    };
  }

  const klass = await one(
    `SELECT c.* FROM classes c JOIN class_students cs ON cs.class_id=c.id
     WHERE cs.student_id=$1 AND cs.active=true AND c.active=true
     ORDER BY cs.enrolled_at DESC LIMIT 1`,
    [user.id],
  );
  if (!klass) return { name: 'Gaeilgeoir Guides deadlines', description: 'No class yet.', events: [] };

  const label = classLabelOf(klass);
  const [assignments, weeks] = await Promise.all([
    query(
      `SELECT a.* FROM assignments a
       LEFT JOIN homework_submissions hs ON hs.assignment_id=a.id AND hs.student_id=$2
       WHERE a.class_id=$1 AND a.status='published' AND a.visible_at<=now()
         AND COALESCE(hs.status,'draft')='draft'
         AND a.deadline_at > now() - interval '30 days'
       ORDER BY a.deadline_at`,
      [klass.id, user.id],
    ),
    query(
      `SELECT w.* FROM weeks w
       LEFT JOIN checkins ch ON ch.week_id=w.id AND ch.student_id=$2
       WHERE w.class_id=$1 AND w.checkin_enabled=true AND w.checkin_release_at<=now()
         AND COALESCE(ch.status,'draft')='draft'
         AND w.checkin_due_at > now() - interval '30 days'
       ORDER BY w.checkin_due_at`,
      [klass.id, user.id],
    ),
  ]);

  return {
    name: 'My Gaeilgeoir Guides deadlines',
    description: `Outstanding work for ${label}.`,
    events: [
      ...assignments.rows.map((row) => assignmentEvent(row, { classLabel: label })),
      ...weeks.rows.map((row) => checkinEvent(row, { classLabel: label })),
    ],
  };
}
