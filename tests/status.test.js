import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceStatus, homeworkStatus, checkinStatus, parseAttendanceMinutes, studentProgress } from '../src/status.js';

test('attendance uses camera only for attended live', () => {
  assert.deepEqual(attendanceStatus({ status: 'live' }), { tone: 'green', icon: 'camera', label: 'Attended live' });
  for (const status of ['partial','missed','recording','unknown']) {
    assert.deepEqual(attendanceStatus({ status }), { tone: 'red', icon: 'x', label: 'Did not attend live' });
  }
});

test('homework statuses match the product specification', () => {
  const future = { deadline_at: new Date(Date.now() + 60_000).toISOString() };
  const past = { deadline_at: new Date(Date.now() - 60_000).toISOString() };
  assert.deepEqual(homeworkStatus({ submission: { status: 'submitted' }, assignment: future }), { tone: 'orange', icon: 'book', label: 'Submitted' });
  assert.deepEqual(homeworkStatus({ submission: { status: 'returned' }, assignment: future }), { tone: 'green', icon: 'book', label: 'Feedback sent' });
  assert.deepEqual(homeworkStatus({ submission: null, assignment: future }), { tone: 'grey', icon: 'book', label: 'Not submitted' });
  assert.deepEqual(homeworkStatus({ submission: null, assignment: past }), { tone: 'red', icon: 'x', label: 'Past deadline' });
});

test('check-in statuses match the product specification', () => {
  const future = { checkin_due_at: new Date(Date.now() + 60_000).toISOString() };
  const past = { checkin_due_at: new Date(Date.now() - 60_000).toISOString() };
  assert.deepEqual(checkinStatus({ checkin: { status: 'submitted' }, week: future }), { tone: 'orange', icon: 'talk', label: 'Submitted' });
  assert.deepEqual(checkinStatus({ checkin: { status: 'returned' }, week: future }), { tone: 'green', icon: 'talk', label: 'Feedback sent' });
  assert.deepEqual(checkinStatus({ checkin: null, week: future }), { tone: 'grey', icon: 'talk', label: 'Not submitted' });
  assert.deepEqual(checkinStatus({ checkin: null, week: past }), { tone: 'red', icon: 'x', label: 'Past deadline' });
});

test('attendance duration parsing handles Zoom-style exports', () => {
  assert.equal(parseAttendanceMinutes('75'), 75);
  assert.equal(parseAttendanceMinutes('01:15:30'), 76);
  assert.equal(parseAttendanceMinutes('45:00'), 45);
  assert.equal(parseAttendanceMinutes('1 hr 20 min'), 80);
});

test('drafts do not count towards what has been handed in', () => {
  const progress = studentProgress({
    checkins: [{ status: 'draft' }, { status: 'submitted' }],
    homework: [{ status: 'draft' }],
  });
  assert.equal(progress.checkins, 1);
  assert.equal(progress.homework, 0);
  assert.equal(progress.total, 1);
});

test('milestones report the next marker and only fire on the exact total', () => {
  const counts = (checkins, homework) => studentProgress({
    checkins: Array.from({ length: checkins }, () => ({ status: 'submitted' })),
    homework: Array.from({ length: homework }, () => ({ status: 'submitted' })),
  });
  assert.deepEqual(
    (({ total, next, toNext, justHit }) => ({ total, next, toNext, justHit }))(counts(2, 1)),
    { total: 3, next: 5, toNext: 2, justHit: 3 },
  );
  assert.equal(counts(2, 2).justHit, null, 'four is not a milestone');
  assert.equal(counts(0, 0).next, 1);
  assert.equal(counts(1, 0).justHit, 1, 'the very first piece of work is a milestone');
});
