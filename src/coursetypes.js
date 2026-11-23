/**
 * Course types: what kind of course a class is, and what that means for the
 * students in it.
 *
 * Irish for Primary Teaching is the taught class: a weekly class, check-ins,
 * homework, the board, past questions and papers. Hibernia is an on-demand
 * course: its students see their course and the private line to the teacher,
 * and nothing else. They are kept apart on purpose. A Hibernia course is linked
 * to the Hibernia class only, so nobody in the taught class is enrolled in it,
 * and the reverse.
 */
import { query } from './db.js';

export const COURSE_TYPES = [
  { key: 'irish_for_primary', label: 'Irish for Primary Teaching', onDemand: false },
  { key: 'hibernia', label: 'Hibernia', onDemand: true },
];
export const COURSE_TYPE_KEYS = COURSE_TYPES.map((t) => t.key);
export const ON_DEMAND_TYPES = COURSE_TYPES.filter((t) => t.onDemand).map((t) => t.key);
export const courseTypeLabel = (key) => COURSE_TYPES.find((t) => t.key === key)?.label || key;
export const isOnDemand = (key) => ON_DEMAND_TYPES.includes(key);

/** SQL: this class is taught (has a timetable, weeks, a board). `alias` is the classes alias. */
export const taughtClass = (alias = 'c') => `${alias}.course_type NOT IN (${ON_DEMAND_TYPES.map((t) => `'${t}'`).join(',')})`;

/* What a student may see, by the classes they are enrolled in.

   Asked on every past-question file through the wall, so the answer is kept for
   half a minute. Enrolling or withdrawing somebody takes effect within that. */
const REMEMBER_MS = 30 * 1000;
const remembered = new Map();

export async function studentAccess(userId) {
  const now = Date.now();
  const hit = remembered.get(userId);
  if (hit && now - hit.at < REMEMBER_MS) return hit.value;
  const rows = (await query(
    `SELECT DISTINCT c.id, c.course_type FROM class_students cs JOIN classes c ON c.id=cs.class_id
     WHERE cs.student_id=$1 AND cs.active=true AND c.active=true`,
    [userId],
  )).rows;
  const courseTypes = [...new Set(rows.map((r) => r.course_type))];
  const value = {
    classIds: rows.map((r) => r.id).sort(),
    courseTypes,
    /* Courses only: every class they are in is on demand. A student in no class
       at all keeps the ordinary hub, as before; one in both kinds keeps it too. */
    coursesOnly: courseTypes.length > 0 && courseTypes.every(isOnDemand),
  };
  if (remembered.size > 5000) remembered.clear();
  remembered.set(userId, { at: now, value });
  return value;
}

/** After an enrolment changes, so the next request sees it at once. */
export function forgetAccess(userId) {
  if (userId) remembered.delete(userId); else remembered.clear();
}
