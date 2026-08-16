import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByWeek, MATERIAL_KINDS } from '../src/materials.js';

const row = (id, weekStart, position = 0) => ({ id, week_id: weekStart ? `w-${weekStart}` : null, week_start: weekStart, position });

test('course-wide material is separated from the weeks', () => {
  const { courseWide, weeks } = groupByWeek([
    row('syllabus', null),
    row('week3', '2026-07-27'),
    row('glossary', null),
  ]);
  assert.deepEqual(courseWide.map((item) => item.id), ['syllabus', 'glossary']);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekStart, '2026-07-27');
});

test('weeks read newest first', () => {
  const { weeks } = groupByWeek([
    row('a', '2026-07-13'),
    row('b', '2026-08-03'),
    row('c', '2026-07-27'),
  ]);
  assert.deepEqual(weeks.map((week) => week.weekStart), ['2026-08-03', '2026-07-27', '2026-07-13']);
});

test('several items in one week stay together', () => {
  const { weeks } = groupByWeek([
    row('notes', '2026-08-03'),
    row('recording', '2026-08-03'),
  ]);
  assert.equal(weeks.length, 1);
  assert.deepEqual(weeks[0].items.map((item) => item.id), ['notes', 'recording']);
});

test('an empty library groups into nothing rather than throwing', () => {
  const { courseWide, weeks } = groupByWeek([]);
  assert.deepEqual(courseWide, []);
  assert.deepEqual(weeks, []);
});

test('only the three known kinds are offered', () => {
  assert.deepEqual([...MATERIAL_KINDS], ['file', 'link', 'loom']);
});
