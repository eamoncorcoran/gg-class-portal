import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { studentProgress } from '../src/status.js';

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
