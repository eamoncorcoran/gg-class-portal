import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { examGroupFor, EXAM_GROUPS } from '../src/plans.js';

/* The teaching plan.
   ------------------------------------------------------------------
   What a course is meant to cover, week by week, and a record of what has been.
   The ticks are the only thing here that cannot be recreated from the file that
   ships with it, so most of what is guarded is the ticks. */

const plans = fs.readFileSync(new URL('../src/plans.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
const student = fs.readFileSync(new URL('../src/routes/student.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const data = JSON.parse(fs.readFileSync(
  new URL('../data/irish-primary-teaching-plan.json', import.meta.url), 'utf8'));

const bodyOf = (source, name) => {
  const cut = source.slice(source.indexOf(name));
  return cut.slice(0, cut.indexOf('\n}'));
};

test('the plan that ships with the portal is intact', () => {
  assert.equal(data.weeks.length, 36);
  const scheduled = data.weeks.flatMap((week) => week.topics || []);
  assert.equal(scheduled.length, 84, 'the number of scheduled items should not drift silently');
  // The fadas are the thing most likely to be lost in a round trip through a file.
  const titles = scheduled.map((topic) => topic.title);
  assert.ok(titles.includes('Fáiltiú'));
  assert.ok(titles.includes('Úirchill an Chreagáin'));
  assert.ok(titles.includes('Sraith Pictiúr') || scheduled.some((t) => t.category === 'Sraith Pictiúr'));
});

test('a tickable item is a topic in a week, not a topic', () => {
  /* "Revision Week" is scheduled three times in this plan. Ticking a topic
     would tick every appearance of it at once. */
  const repeats = {};
  for (const week of data.weeks) {
    for (const topic of week.topics || []) {
      repeats[topic.title] = (repeats[topic.title] || 0) + 1;
    }
  }
  assert.ok(Object.values(repeats).some((count) => count > 1),
    'this plan schedules the same topic more than once, which is why items are per week');
  const migration = fs.readFileSync(
    new URL('../migrations/041_course_plans.sql', import.meta.url), 'utf8');
  assert.match(migration, /week_id uuid NOT NULL REFERENCES plan_weeks/,
    'an item belongs to a week');
});

test('the plan is rows, not a document', () => {
  /* A document would mean rewriting the whole plan to record one tick, and two
     people ticking at once would each save over the other. */
  const migration = fs.readFileSync(
    new URL('../migrations/041_course_plans.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS plan_items/);
  assert.doesNotMatch(migration, /data jsonb|plan jsonb/);
});

test('importing over an existing plan is refused rather than merged', () => {
  const body = bodyOf(plans, 'export async function importPlan');
  assert.match(body, /already has a plan/);
  /* A merge would have to guess which of two similarly named weeks is the same
     week, and guessing wrong loses the ticks. */
  assert.match(body, /status: 409/);
});

test('removing a plan with ticks on it has to be confirmed against the count', () => {
  const body = bodyOf(admin, "router.delete('/plans/:courseId'");
  assert.match(body, /confirmDone/);
  assert.match(body, /covered\.c > 0 && confirmed !== covered\.c/,
    'the number has to come back matching, not merely be present');
});

test('students cannot reach a plan at all', () => {
  /* Not hidden on the screen: absent from their half of the API. */
  assert.doesNotMatch(student, /plan/i, 'no student route may mention plans');
  assert.doesNotMatch(app, /api\/student\/plans/);
});

test('the checklist export is readable by a spreadsheet', () => {
  const body = bodyOf(admin, "router.get('/plans/:courseId/checklist.csv'");
  assert.match(body, /\\uFEFF/, 'these topic names are full of fadas');
  assert.match(body, /replace\(\/"\/g, '""'\)/);
  for (const column of ['Week', 'Topic', 'Category', 'Done', 'Date covered', 'Covered by']) {
    assert.ok(body.includes(`'${column}'`), `the checklist needs a ${column} column`);
  }
  /* Written against the week rather than the item, so repeating it on every row
     of that week would read as five different pieces of homework. */
  assert.match(body, /index === 0 \? \(week\.homework \|\| ''\) : ''/);
});

test('ticking redraws the counts, not the eighty rows under them', () => {
  assert.match(app, /async function refreshPlanCounts\(\)/);
  const body = bodyOf(app, 'async function refreshPlanCounts');
  assert.doesNotMatch(body, /loadAdmin\(\)/,
    'a full reload would scroll a long plan back to the top on every tick');
});

test('a week with nothing scheduled still appears', () => {
  const body = bodyOf(plans, 'export async function getPlan');
  /* The join returns one row with an empty item half for such a week, and
     dropping it would make the plan skip week numbers. */
  assert.match(body, /if \(row\.item_id\)/);
  assert.match(body, /LEFT JOIN plan_items/);
});

/* The builder and the topic list.
   ------------------------------------------------------------------
   The plan can be rearranged as well as ticked, so what is guarded here is the
   dragging: that a drag cannot move an item into somebody else's plan, that
   taking a topic out of a week does not lose the topic, and that everything a
   drag does can also be done without one. */

test('the topic bank arrives flat as well as grouped', () => {
  /* The builder lists every topic and filters client side; the topic view wants
     them in their three exam sections. Returning only the groups left the
     builder trying to filter undefined, which showed as an empty screen and a
     toast rather than as anything to do with topics. */
  const body = bodyOf(plans, 'export async function getTopics');
  assert.match(body, /\n    topics,/, 'the flat list is what the builder draws from');
  assert.match(body, /groups: EXAM_GROUPS\.map/);
});

test('every topic lands in one exam section', () => {
  /* The grouping is a guess made from the categories in the file, so what is
     guarded is that it is total: a topic that matched nothing would be missing
     from the topic list altogether rather than in the wrong part of it. */
  const seen = new Map();
  for (const topic of data.topics) {
    const group = examGroupFor(topic);
    assert.ok(EXAM_GROUPS.includes(group), `${topic.title} landed in ${group}`);
    seen.set(group, (seen.get(group) || 0) + 1);
  }
  assert.equal([...seen.values()].reduce((a, b) => a + b, 0), data.topics.length);
  // All three sections are populated, so none of them is an empty heading.
  for (const group of EXAM_GROUPS) assert.ok(seen.get(group) > 0, `${group} has no topics`);
  // The literature topics are the ones that would be most obviously wrong.
  assert.equal(examGroupFor({ category: 'Filíocht', title: 'Géibheann' }), 'Paper 2');
  assert.equal(examGroupFor({ category: 'Sraith Pictiúr', title: 'An Post' }), 'Oral');
  assert.equal(examGroupFor({ category: 'Grammar', title: 'Aimsir Chaite' }), 'Paper 1');
});

test('a guess at the exam section can be corrected', () => {
  const body = bodyOf(plans, 'export async function setTopicGroup');
  assert.match(body, /EXAM_GROUPS\.includes\(examGroup\)/, 'any string would break the grouping');
  assert.match(app, /data-topic-group=/, 'and it has to be changeable from the screen');
});

test('a drag cannot move an item into another course plan', () => {
  const body = bodyOf(plans, 'export async function reorderWeek');
  /* A week id and an item id both come from the browser, so the pairing is
     checked in the UPDATE rather than trusted. */
  assert.match(body, /target\.plan_id=source\.plan_id/);
  assert.match(body, /if \(!moved\.rowCount\)/, 'a refused move must not pass as done');
});

test('a topic dropped in has to belong to the plan it is dropped into', () => {
  const body = bodyOf(plans, 'export async function scheduleTopic');
  assert.match(body, /JOIN plan_weeks w ON w\.plan_id=t\.plan_id/);
  assert.match(body, /status: 404/);
});

test('taking a topic out of a week leaves the topic in the bank', () => {
  const body = bodyOf(plans, 'export async function unscheduleItem');
  assert.match(body, /DELETE FROM plan_items/);
  assert.doesNotMatch(body, /DELETE FROM plan_topics/, 'the bank is the course, not the schedule');
  const migration = fs.readFileSync(
    new URL('../migrations/042_plan_topic_bank.sql', import.meta.url), 'utf8');
  assert.match(migration, /topic_id uuid REFERENCES plan_topics\(id\) ON DELETE SET NULL/,
    'and deleting a topic must not take its ticked items with it');
});

test('everything a drag does can be done without dragging', () => {
  /* HTML5 dragging does nothing at all on a touch screen, so a plan built on a
     phone would otherwise be read only. */
  assert.match(app, /data-topic-add="/, 'a topic needs a week picker beside it');
  assert.match(app, /data-item-remove="/, 'and an item needs a way off the plan');
});

test('a drag redraws the builder, not the page', () => {
  assert.match(app, /async function refreshPlanBuilder\(\)/);
  const body = bodyOf(app, 'async function refreshPlanBuilder');
  assert.match(body, /window\.scrollY/, 'thirty six weeks is a long way back to the top');
  assert.match(body, /bindPlanBuilder\(\)/, 'the redrawn rows have to be draggable again');
});

test('the category colours match the names the stylesheet uses', () => {
  /* The stylesheet spells them .plan-cat.catoral, with no separator. Building
     the class as cat-oral matched nothing and every chip came out grey. */
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const body = bodyOf(app, 'function catClass');
  const built = body.match(/`cat(.*?)\$\{/);
  assert.ok(built, 'catClass builds the class name');
  assert.equal(built[1], '', 'no separator, because the stylesheet has none');
  for (const category of ['Oral', 'Grammar', 'Aiste']) {
    const name = `cat${category.toLowerCase()}`;
    assert.ok(css.includes(`.plan-cat.${name}`), `the stylesheet needs .plan-cat.${name}`);
  }
  assert.doesNotMatch(app, /plan-cat cat-\$\{/, 'the hyphenated form never matched');
});

test('the three ways of looking at a plan are one page, not three', () => {
  assert.match(app, /data-plan-mode="list"/);
  assert.match(app, /data-plan-mode="build"/);
  assert.match(app, /data-plan-mode="topics"/);
  /* Switching is a redraw of the same state, so a tick made in the checklist is
     already there in the builder. */
  const body = bodyOf(app, 'function planView');
  assert.match(body, /state\.planMode \|\| 'list'/, 'ticking off is the everyday view');
});

test('a plan imported before the topic bank existed gets one', () => {
  /* 042 made the table; a plan brought in between the two deploys had its weeks
     and its ticks and an empty bank, which reads as a builder with nothing to
     drag. Written out in full rather than gathered from the weeks, because the
     weeks do not know about the topics that are on the course but not yet
     scheduled, which are the ones worth looking at. */
  const backfill = fs.readFileSync(
    new URL('../migrations/043_backfill_plan_topics.sql', import.meta.url), 'utf8');
  const values = backfill.match(/^    \('/gm) || [];
  assert.equal(values.length, data.topics.length,
    'every packaged topic has to be in the backfill');
  assert.match(backfill, /ON CONFLICT \(plan_id, title\) DO NOTHING/,
    'running it twice must not double the bank');
  assert.match(backfill, /AND i\.topic_id IS NULL/,
    'and it must not re-point items that already know their topic');
  /* The fadas have to survive being written into SQL, and an apostrophe in a
     title would end the string early. */
  assert.ok(backfill.includes("'Fáiltiú'"), 'the Irish was mangled on the way in');
  for (const topic of data.topics) {
    const escaped = topic.title.replace(/'/g, "''");
    assert.ok(backfill.includes(`('${escaped}'`), `${topic.title} is missing from the backfill`);
  }
});
