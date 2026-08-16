import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DateTime } from 'luxon';
import { studentProgress } from '../src/status.js';
import { nextClassAt } from '../src/classtime.js';

/* The preview has to carry its own copy of this, because it runs with no server
   behind it. Two copies drift, and the drift is invisible until the preview
   shows a student something the real portal never would. This holds them level. */
function previewProgressFromMock(now) {
  const source = fs.readFileSync(new URL('../public/preview-mock.js', import.meta.url), 'utf8');
  const start = source.indexOf('const PREVIEW_MILESTONES=');
  const end = source.indexOf('function json(data, status=200)');
  assert.ok(start !== -1 && end > start, 'previewProgress is no longer where this test expects it');
  return new Function('RealDate', 'PREVIEW_NOW', `${source.slice(start, end)}; return previewProgress;`)(Date, now);
}

test('the preview mock reports the same progress as the server', () => {
  const previewProgress = previewProgressFromMock(Date.now());
  const cases = [
    { name: 'nothing done yet', checkins: [], homework: [] },
    { name: 'drafts are not submissions', checkins: [{ status: 'draft' }], homework: [] },
    { name: 'landing exactly on a milestone', checkins: [{ status: 'submitted' }], homework: [{ status: 'submitted' }, { status: 'returned' }] },
    { name: 'between two milestones', checkins: [{ status: 'submitted' }, { status: 'returned' }], homework: [{ status: 'submitted' }, { status: 'submitted' }] },
    { name: 'the very first piece of work', checkins: [{ status: 'submitted' }], homework: [] },
  ];
  for (const item of cases) {
    assert.deepEqual(
      previewProgress(item.checkins, item.homework),
      studentProgress({ checkins: item.checkins, homework: item.homework }),
      `preview and server disagree: ${item.name}`,
    );
  }
});

/* The preview carries its own copy of the next-class calculation for the same
   reason it carries its own progress: there is no server behind it. This holds
   the two level at the instant the preview is frozen at. */
function previewNextClassFromMock() {
  const source = fs.readFileSync(new URL('../public/preview-mock.js', import.meta.url), 'utf8');
  const start = source.indexOf('function previewNextClass(');
  const end = source.indexOf('const originalFetch=');
  assert.ok(start !== -1 && end > start, 'previewNextClass is no longer where this test expects it');
  const previewNow = new Date('2026-08-09T15:00:00Z').getTime();
  return new Function('RealDate', 'PREVIEW_NOW', `${source.slice(start, end)}; return previewNextClass;`)(Date, previewNow);
}

test('the preview mock finds the same next class as the server', () => {
  const previewNextClass = previewNextClassFromMock();
  const now = DateTime.fromISO('2026-08-09T15:00:00Z', { zone: 'utc' });
  for (const klass of [
    { day_of_week: 1, start_time: '19:00', timezone: 'Europe/Dublin', join_url: 'https://zoom.example/a', join_note: 'Passcode' },
    { day_of_week: 4, start_time: '19:00', timezone: 'Europe/Dublin', join_url: null, join_note: null },
    { day_of_week: 7, start_time: '10:30', timezone: 'Europe/Dublin', join_url: null, join_note: null },
  ]) {
    const preview = previewNextClass(klass);
    const server = nextClassAt(klass, now);
    assert.equal(preview.startsAt, server.startsAt, `start disagrees for day ${klass.day_of_week}`);
    assert.equal(preview.live, server.live, `live disagrees for day ${klass.day_of_week}`);
    assert.equal(preview.soon, server.soon, `soon disagrees for day ${klass.day_of_week}`);
  }
});
