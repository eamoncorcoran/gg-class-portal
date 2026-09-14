import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
