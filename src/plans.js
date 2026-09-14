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

/* Which half of the exam a topic belongs to.
   ------------------------------------------------------------------
   The planner this came from sorted topics into six sections of its own: Paper
   1, Irish Oral, Sraith Pictiúr, Poetry, Prós and Drama. Those fold onto the
   three the exam actually has.

   Sraith Pictiúr goes with the Oral because it is part of that exam rather than
   a paper. The literature, poetry, prose and the drama, is Paper 2. Everything
   else, course setup, grammar, the essay, listening, reading and exam
   technique, stays where the original put it, under Paper 1.

   A guess about somebody else's syllabus, so it is stored rather than computed
   and can be changed per topic afterwards. Léamhthuiscint in particular sits
   under Paper 1 here because that is where the original file had it. */
export const EXAM_GROUPS = Object.freeze(['Oral', 'Paper 1', 'Paper 2']);

export function examGroupFor(topic) {
  const category = topic?.category || '';
  const title = topic?.title || '';

  if (category === 'Oral' || category === 'Sraith Pictiúr') return 'Oral';
  if (category === 'Filíocht' || category === 'Prós' || category === 'Dordán') return 'Paper 2';

  // Revision named after a piece of literature belongs with that literature.
  if (/filíocht|poetry|prós|prose|dordán|literature/i.test(title)) return 'Paper 2';
  return 'Paper 1';
}

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

    /* The bank first, so the schedule can point at it. Everything the course
       covers, including the topics not yet placed in a week, which are the ones
       a list of topics exists to show. */
    const byTitle = new Map();
    for (const [index, topic] of (plan.topics || []).entries()) {
      const row = await client.query(
        `INSERT INTO plan_topics(plan_id,title,category,exam_group,position)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (plan_id, title) DO NOTHING
         RETURNING id, title`,
        [planRow.id, topic.title, topic.category || null,
         topic.group || examGroupFor(topic), index],
      );
      if (row.rows[0]) byTitle.set(row.rows[0].title, row.rows[0].id);
    }

    for (const [index, week] of (plan.weeks || []).entries()) {
      const weekRow = await client.query(
        `INSERT INTO plan_weeks(plan_id,position,name,homework,notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [planRow.id, index, week.name || `Week ${index + 1}`,
         week.homework || null, week.notes || null],
      );
      for (const [spot, topic] of (week.topics || []).entries()) {
        /* A week can schedule something that is not in the bank. It is kept as a
           scheduled item either way, with no topic behind it, rather than
           dropped for not being on a list. */
        let topicId = byTitle.get(topic.title) || null;
        if (!topicId) {
          const made = await client.query(
            `INSERT INTO plan_topics(plan_id,title,category,exam_group,position)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (plan_id, title) DO UPDATE SET title=EXCLUDED.title
             RETURNING id`,
            [planRow.id, topic.title, topic.category || null, examGroupFor(topic), 900 + spot],
          );
          topicId = made.rows[0]?.id || null;
          if (topicId) byTitle.set(topic.title, topicId);
        }
        await client.query(
          'INSERT INTO plan_items(week_id,position,title,category,topic_id) VALUES ($1,$2,$3,$4,$5)',
          [weekRow.rows[0].id, spot, topic.title, topic.category || null, topicId],
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

/**
 * Every topic the course covers, and where each one has landed.
 *
 * Grouped the way the exam is, and carrying the weeks each topic appears in,
 * because the question somebody actually has in front of this list is "what
 * still has no week". A topic can appear more than once, so the weeks come back
 * as a list rather than a number.
 */
export async function getTopics(courseId) {
  const plan = await one('SELECT id FROM course_plans WHERE course_id=$1', [courseId]);
  if (!plan) return null;

  const result = await query(
    `SELECT t.id, t.title, t.category, t.exam_group, t.position,
            w.name week_name, w.position week_position,
            i.done_at
     FROM plan_topics t
     LEFT JOIN plan_items i ON i.topic_id=t.id
     LEFT JOIN plan_weeks w ON w.id=i.week_id
     WHERE t.plan_id=$1
     ORDER BY t.position, t.title, w.position`,
    [plan.id],
  );

  const byId = new Map();
  for (const row of result.rows) {
    let topic = byId.get(row.id);
    if (!topic) {
      topic = {
        id: row.id, title: row.title, category: row.category,
        examGroup: row.exam_group || 'Paper 1', weeks: [], done: 0,
      };
      byId.set(row.id, topic);
    }
    if (row.week_name) {
      topic.weeks.push({ name: row.week_name, position: row.week_position });
      if (row.done_at) topic.done += 1;
    }
  }

  const topics = [...byId.values()];
  return {
    // Flat for the builder's bank, grouped for the topic list.
    topics,
    /* All three sections, always, even an empty one. A section that disappeared
       when its last topic was removed would take its "add a topic" button with
       it, and there would be no way back into it. */
    groups: EXAM_GROUPS.map((name) => ({
      name,
      topics: topics.filter((topic) => topic.examGroup === name),
    })),
    counts: {
      total: topics.length,
      scheduled: topics.filter((topic) => topic.weeks.length).length,
      unscheduled: topics.filter((topic) => !topic.weeks.length).length,
    },
  };
}

/** Put a topic into a week, at the end of it. */
export async function scheduleTopic({ weekId, topicId }) {
  const topic = await one(
    `SELECT t.id, t.title, t.category FROM plan_topics t
     JOIN plan_weeks w ON w.plan_id=t.plan_id
     WHERE t.id=$1 AND w.id=$2`,
    [topicId, weekId],
  );
  // The join is the check: a topic from another plan cannot be dropped in here.
  if (!topic) throw Object.assign(new Error('That topic is not part of this plan.'), { status: 404 });

  const next = await one(
    'SELECT COALESCE(max(position),-1)+1 position FROM plan_items WHERE week_id=$1', [weekId]);
  return one(
    `INSERT INTO plan_items(week_id,position,title,category,topic_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [weekId, next.position, topic.title, topic.category, topic.id],
  );
}

/**
 * Where an item sits after a drag.
 *
 * The whole week arrives rather than one position, the same way the course
 * reorder works: a list of ids is unambiguous, where a single move has to be
 * reasoned about against whatever the other rows are currently holding.
 */
export async function reorderWeek({ weekId, itemIds }) {
  return transaction(async (client) => {
    const own = await client.query('SELECT id FROM plan_items WHERE week_id=$1', [weekId]);
    const mine = new Set(own.rows.map((row) => row.id));
    for (const [index, id] of itemIds.entries()) {
      /* An id from another week is a move into this one, which is what a drag
         between weeks is. Anything belonging to another plan is refused by the
         join rather than quietly moved. */
      if (mine.has(id)) {
        await client.query('UPDATE plan_items SET position=$1 WHERE id=$2', [index, id]);
      } else {
        const moved = await client.query(
          `UPDATE plan_items i SET week_id=$1, position=$2
           FROM plan_weeks target, plan_weeks source
           WHERE i.id=$3 AND target.id=$1 AND source.id=i.week_id
             AND target.plan_id=source.plan_id
           RETURNING i.id`,
          [weekId, index, id],
        );
        if (!moved.rowCount) {
          throw Object.assign(new Error('That item belongs to a different plan.'), { status: 400 });
        }
      }
    }
    return { ok: true };
  });
}

/** Take an item out of a week. The topic stays in the bank. */
export async function unscheduleItem(itemId) {
  return one('DELETE FROM plan_items WHERE id=$1 RETURNING id, title', [itemId]);
}

/**
 * Put a topic into the bank without scheduling it.
 *
 * The bank is what the course covers; a week is where it is taught. A topic
 * added here appears in the topic list as "not scheduled" and in the builder as
 * something to drag, which is the point of it: a course grows a topic before it
 * has a week to put it in.
 */
export async function addTopic({ courseId, title, category, examGroup }) {
  const plan = await one('SELECT id FROM course_plans WHERE course_id=$1', [courseId]);
  if (!plan) throw Object.assign(new Error('This course has no plan yet.'), { status: 404 });

  const group = EXAM_GROUPS.includes(examGroup) ? examGroup : examGroupFor({ title, category });
  const next = await one(
    'SELECT COALESCE(max(position),-1)+1 position FROM plan_topics WHERE plan_id=$1', [plan.id]);
  const row = await one(
    `INSERT INTO plan_topics(plan_id,title,category,exam_group,position)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (plan_id,title) DO NOTHING RETURNING *`,
    [plan.id, title, category || null, group, next.position],
  );
  /* The unique index is what refuses a second copy. Two topics with the same
     name in one bank would be indistinguishable in the builder. */
  if (!row) throw Object.assign(new Error('That topic is already on this plan.'), { status: 409 });
  return row;
}

/** What removing a topic would cost: the weeks it is in, and the ticks on them. */
export async function topicCost(topicId) {
  return one(
    `SELECT t.id, t.title,
            count(i.id)::int scheduled,
            count(i.id) FILTER (WHERE i.done_at IS NOT NULL)::int done
     FROM plan_topics t LEFT JOIN plan_items i ON i.topic_id=t.id
     WHERE t.id=$1 GROUP BY t.id, t.title`,
    [topicId],
  );
}

/**
 * Take a topic off the course altogether, and out of every week it was in.
 *
 * Distinct from unscheduling, which takes it out of one week and leaves it in
 * the bank. Confirmed against the number of ticks it carries, the same way
 * removing a whole plan is: a tick is the one thing here that cannot be got
 * back from the file.
 */
export async function removeTopic({ topicId, confirmDone }) {
  const cost = await topicCost(topicId);
  if (!cost) return null;
  if (cost.done > 0 && Number(confirmDone) !== cost.done) {
    throw Object.assign(
      new Error(`${cost.title} is ticked off in ${cost.done} week${cost.done === 1 ? '' : 's'}. Removing it loses that record.`),
      { status: 409, done: cost.done },
    );
  }
  return transaction(async (client) => {
    /* The items go first and explicitly. The column is ON DELETE SET NULL, which
       is right for a topic being retired out from under weeks that were taught,
       but here the weeks are meant to go with it. */
    await client.query('DELETE FROM plan_items WHERE topic_id=$1', [topicId]);
    await client.query('DELETE FROM plan_topics WHERE id=$1', [topicId]);
    return { ok: true, title: cost.title, scheduled: cost.scheduled, done: cost.done };
  });
}

/** Move a topic to a different part of the exam. */
export async function setTopicGroup({ topicId, examGroup }) {
  if (!EXAM_GROUPS.includes(examGroup)) {
    throw Object.assign(new Error('That is not one of the exam sections.'), { status: 400 });
  }
  return one('UPDATE plan_topics SET exam_group=$1 WHERE id=$2 RETURNING id, title, exam_group',
    [examGroup, topicId]);
}
