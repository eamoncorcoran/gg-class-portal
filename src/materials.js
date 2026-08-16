import { query } from './db.js';

/* The course library: everything that belongs to a week but is not homework.
   Notes, slide decks, a recording, a link to a TG4 clip.

   Assignment resources already exist and are not this. Those support one piece of
   work and vanish from view when it is handed in. These stay put, which is what
   a student revising in May actually needs. */

export const MATERIAL_KINDS = Object.freeze(['file', 'link', 'loom']);

/**
 * Everything in one class library.
 *
 * Unpublished rows are the administrator's alone, so next week's notes can be
 * loaded in advance without appearing early.
 */
export async function listMaterials({ classId, publishedOnly = true }) {
  const result = await query(
    `SELECT m.*, w.week_start
     FROM materials m
     LEFT JOIN weeks w ON w.id=m.week_id
     WHERE m.class_id=$1 ${publishedOnly ? 'AND m.published=true' : ''}
     ORDER BY w.week_start NULLS FIRST, m.position, m.created_at`,
    [classId],
  );
  return result.rows;
}

/**
 * Groups a flat list into the sections the screen renders.
 *
 * Course-wide material comes first under its own heading, then each teaching week
 * newest first — a student looking for something is nearly always looking for the
 * most recent thing.
 */
export function groupByWeek(rows) {
  const courseWide = rows.filter((row) => !row.week_id);
  const byWeek = new Map();
  rows.filter((row) => row.week_id).forEach((row) => {
    const key = String(row.week_start || '').slice(0, 10);
    byWeek.set(key, [...(byWeek.get(key) || []), row]);
  });
  const weeks = [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, items]) => ({ weekStart, items }));
  return { courseWide, weeks };
}
