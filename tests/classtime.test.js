import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { nextClassAt, joinLinkFor, CLASS_RUNS_FOR_MINUTES } from '../src/classtime.js';

const MONDAY_CLASS = { day_of_week: 1, start_time: '19:00:00', timezone: 'Europe/Dublin' };
const at = (iso) => DateTime.fromISO(iso, { zone: 'utc' });

test('the next sitting is this week when the class has not happened yet', () => {
  // Sunday afternoon: the class is tomorrow evening.
  const next = nextClassAt(MONDAY_CLASS, at('2026-08-09T15:00:00Z'));
  assert.equal(next.startsAt, '2026-08-10T18:00:00.000Z'); // 19:00 Dublin, UTC+1 in August
  assert.equal(next.live, false);
  assert.equal(next.soon, false);
  assert.equal(next.weekStart, '2026-08-10');
});

test('a class that is under way still counts as the next one', () => {
  const next = nextClassAt(MONDAY_CLASS, at('2026-08-10T18:30:00Z'));
  assert.equal(next.live, true);
  assert.equal(next.startsAt, '2026-08-10T18:00:00.000Z');
});

test('once a class is over the next one is a week later', () => {
  const justAfter = at('2026-08-10T18:00:00Z').plus({ minutes: CLASS_RUNS_FOR_MINUTES + 1 });
  const next = nextClassAt(MONDAY_CLASS, justAfter);
  assert.equal(next.startsAt, '2026-08-17T18:00:00.000Z');
  assert.equal(next.live, false);
});

test('the countdown only starts inside twelve hours', () => {
  assert.equal(nextClassAt(MONDAY_CLASS, at('2026-08-10T07:00:00Z')).soon, true);  // 11 hours out
  assert.equal(nextClassAt(MONDAY_CLASS, at('2026-08-10T05:00:00Z')).soon, false); // 13 hours out
});

test('the class timezone decides the hour, not the reader', () => {
  // Winter: Dublin is on UTC, so the same 19:00 class is an hour later in UTC.
  const winter = nextClassAt(MONDAY_CLASS, at('2026-01-04T12:00:00Z'));
  assert.equal(winter.startsAt, '2026-01-05T19:00:00.000Z');
});

test('a class with no day or time has no next sitting', () => {
  assert.equal(nextClassAt({ start_time: '19:00:00' }), null);
  assert.equal(nextClassAt({ day_of_week: 1 }), null);
  assert.equal(nextClassAt(null), null);
});

test('a week may override the class link, otherwise the class link stands', () => {
  const klass = { join_url: 'https://zoom.example/term' };
  const next = { weekStart: '2026-08-10' };
  assert.equal(joinLinkFor(klass, [], next), 'https://zoom.example/term');
  assert.equal(
    joinLinkFor(klass, [{ week_start: '2026-08-10', join_url: 'https://zoom.example/one-off' }], next),
    'https://zoom.example/one-off',
  );
  // An override on a different week must not leak into this one.
  assert.equal(
    joinLinkFor(klass, [{ week_start: '2026-08-17', join_url: 'https://zoom.example/other' }], next),
    'https://zoom.example/term',
  );
  // A week row with no link of its own falls back rather than blanking the button.
  assert.equal(joinLinkFor(klass, [{ week_start: '2026-08-10', join_url: null }], next), 'https://zoom.example/term');
  assert.equal(joinLinkFor({ join_url: null }, [], next), null);
});
