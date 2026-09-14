/**
 * Teaching plans.
 *
 * A plan is what a course is meant to cover, week by week, and a record of what
 * has been. It belongs to the teacher: students never see it, and there is no
 * route on their side that returns one.
 *
 * The shape comes from the planner this was built to replace, which is a bank of
 * topics arranged into weeks, with a line of homework and a line of notes
 * against each week.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, query, transaction } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The plan that ships with the portal, ready to be brought into a course. */
export async function packagedPlan() {
  const raw = await fs.readFile(path.join(here, '..', 'data', 'irish-primary-teaching-plan.json'), 'utf8');
  return JSON.parse(raw);
}

/**
 * Bring a plan into a course.
 *
 * Refuses when one is already there rather than merging. A merge would have to
 * guess which of two similarly named weeks is the same week, and guessing wrong
 * loses the record of what was covered, which is the only thing here that cannot
 * be recreated from the file.
 */
export async function importPlan({ courseId, title, plan, actorId }) {
  const existing = await one('SELECT id FROM course_plans WHERE course_id=$1', [courseId]);
  if (existing) {
    throw Object.assign(new Error('This course already has a plan. Remove it first to bring in a new one.'), { status: 409 });
  }

  return transaction(async (client) => {
    const created = await client.query(
      `INSERT INTO course_plans(course_id,title,starts_on,break_start,break_end,created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [courseId, title, plan.calendar?.startDate || null,
       plan.calendar?.breakStart || null, plan.calendar?.breakEnd || null, actorId],
    );
    const planRow = created.rows[0];

    for (const [index, week] of (plan.weeks || []).entries()) {
      const weekRow = await client.query(
        `INSERT INTO plan_weeks(plan_id,position,name,homework,notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [planRow.id, index, week.name || `Week ${index + 1}`,
         week.homework || null, week.notes || null],
      );
      for (const [spot, topic] of (week.topics || []).entries()) {
        await client.query(
          'INSERT INTO plan_items(week_id,position,title,category) VALUES ($1,$2,$3,$4)',
          [weekRow.rows[0].id, spot, topic.title, topic.category || null],
        );
      }
    }
    return planRow;
  });
}

/** The whole plan, arranged the way it is read. */
export async function getPlan(courseId) {
  const plan = await one(
    `SELECT p.*, c.title course_title FROM course_plans p
     JOIN courses c ON c.id=p.course_id WHERE p.course_id=$1`,
    [courseId],
  );
  if (!plan) return null;

  const rows = await query(
    `SELECT w.id week_id, w.position week_position, w.name, w.homework, w.notes,
            i.id item_id, i.position item_position, i.title, i.category,
            i.done_at, u.name done_by_name
     FROM plan_weeks w
     LEFT JOIN plan_items i ON i.week_id=w.id
     LEFT JOIN users u ON u.id=i.done_by
     WHERE w.plan_id=$1
     ORDER BY w.position, i.position`,
    [plan.id],
  );

  const weeks = [];
  for (const row of rows.rows) {
    let week = weeks.find((item) => item.id === row.week_id);
    if (!week) {
      week = { id: row.week_id, position: row.week_position, name: row.name,
        homework: row.homework, notes: row.notes, items: [] };
      weeks.push(week);
    }
    // A week with no topics comes back as one row with nothing in the item half.
    if (row.item_id) {
      week.items.push({
        id: row.item_id, position: row.item_position, title: row.title,
        category: row.category, doneAt: row.done_at, doneBy: row.done_by_name,
      });
    }
  }

  const items = weeks.flatMap((week) => week.items);
  return {
    ...plan,
    weeks,
    progress: { total: items.length, done: items.filter((item) => item.doneAt).length },
  };
}

/** Tick or untick one scheduled item. */
export async function setItemDone({ itemId, done, actorId }) {
  return one(
    `UPDATE plan_items SET done_at=$1, done_by=$2 WHERE id=$3
     RETURNING id, title, done_at`,
    [done ? new Date().toISOString() : null, done ? actorId : null, itemId],
  );
}

/** Every course, and whether it has a plan, for the picker. */
export async function coursesWithPlans() {
  const result = await query(
    `SELECT c.id, c.title, c.published,
            p.id plan_id, p.title plan_title,
            (SELECT count(*)::int FROM plan_items i
              JOIN plan_weeks w ON w.id=i.week_id WHERE w.plan_id=p.id) total,
            (SELECT count(*)::int FROM plan_items i
              JOIN plan_weeks w ON w.id=i.week_id WHERE w.plan_id=p.id AND i.done_at IS NOT NULL) done
     FROM courses c
     LEFT JOIN course_plans p ON p.course_id=c.id
     ORDER BY c.position, c.created_at`,
  );
  return result.rows;
}
