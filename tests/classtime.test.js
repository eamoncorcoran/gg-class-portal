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

/* A term, and the weeks inside it the class does not meet.
   ------------------------------------------------------------------
   The next class was worked out from a day and a time alone, which describes
   most weeks and not the ones that matter. It counted down to a class on the
   31st of August for a course beginning on the 7th of September, and it would
   have counted down just as confidently to the October bank holiday. */

const TERM = {
  day_of_week: 1, start_time: '19:00', timezone: 'Europe/Dublin',
  starts_on: '2026-09-07', ends_on: '2027-06-01',
};
const on = (iso) => DateTime.fromISO(iso, { zone: 'Europe/Dublin' });
const dublin = (result) => (result
  ? DateTime.fromISO(result.startsAt).setZone('Europe/Dublin').toFormat('yyyy-LL-dd HH:mm')
  : null);

test('there is no class before the course begins', () => {
  // This is the bug as reported: a Monday in August, for a course starting in September.
  assert.equal(dublin(nextClassAt(TERM, on('2026-08-27T10:00'))), '2026-09-07 19:00');
  assert.equal(dublin(nextClassAt(TERM, on('2026-06-01T10:00'))), '2026-09-07 19:00');
});

test('there is no class after the course ends', () => {
  assert.equal(nextClassAt(TERM, on('2027-07-01T10:00')), null);
  // The last sitting inside the term is still offered.
  assert.equal(dublin(nextClassAt(TERM, on('2027-05-30T10:00'))), '2027-05-31 19:00');
});

test('a skipped week is stepped over, not counted down to', () => {
  const skips = [{ skip_on: '2026-10-26' }];
  assert.equal(dublin(nextClassAt(TERM, on('2026-10-20T10:00'), skips)), '2026-11-02 19:00');
  // And from inside the skipped week itself.
  assert.equal(dublin(nextClassAt(TERM, on('2026-10-26T10:00'), skips)), '2026-11-02 19:00');
});

test('consecutive skips are stepped over together', () => {
  // A fortnight off at Christmas is two rows, not one.
  const skips = ['2026-12-21', '2026-12-28', '2027-01-04'].map((skip_on) => ({ skip_on }));
  assert.equal(dublin(nextClassAt(TERM, on('2026-12-15T10:00'), skips)), '2027-01-11 19:00');
});

test('plain dates work as well as rows, since both reach this', () => {
  assert.equal(dublin(nextClassAt(TERM, on('2026-10-20T10:00'), ['2026-10-26'])), '2026-11-02 19:00');
});

test('a class with no term set behaves exactly as it did', () => {
  const { starts_on: _s, ends_on: _e, ...noTerm } = TERM;
  const next = nextClassAt(noTerm, on('2026-08-27T10:00'));
  assert.equal(dublin(next), '2026-08-31 19:00', 'without a term the next Monday is still the answer');
});

test('a term entirely skipped does not spin', () => {
  /* Every week off is nonsense, but a search that walks forward one week at a
     time has to be bounded or a nonsense configuration hangs the request. */
  const skips = [];
  const cursor = new Date('2026-09-07T12:00:00Z');
  while (cursor < new Date('2027-06-01T12:00:00Z')) {
    skips.push({ skip_on: cursor.toISOString().slice(0, 10) });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  const started = Date.now();
  nextClassAt(TERM, on('2026-09-01T10:00'), skips);
  assert.ok(Date.now() - started < 500, 'the search must be bounded');
});

/* Three things happen to a week, and only one is an absence. */

test('a pre-recorded week has no live class, so it is stepped over', () => {
  const changes = [{ on_date: '2026-09-14', kind: 'recorded' }];
  assert.equal(dublin(nextClassAt(TERM, on('2026-09-08T10:00'), changes)), '2026-09-21 19:00');
});

test('a moved week still happens, at the hour it moved to', () => {
  const changes = [{ on_date: '2026-09-14', kind: 'moved', moved_to: '2026-09-17T18:00:00Z' }];
  const next = nextClassAt(TERM, on('2026-09-08T10:00'), changes);
  assert.equal(dublin(next), '2026-09-17 19:00');
  assert.equal(next.movedFrom, '2026-09-14', 'the banner should be able to say it moved');
});

test('once a moved class is over, the next one is the following week', () => {
  const changes = [{ on_date: '2026-09-14', kind: 'moved', moved_to: '2026-09-17T18:00:00Z' }];
  assert.equal(dublin(nextClassAt(TERM, on('2026-09-18T10:00'), changes)), '2026-09-21 19:00');
});

test('a move out of a week that is otherwise skipped is followed, not lost', () => {
  /* The stepping happens first, so a move has to be applied after it or the
     week it moved out of would be stepped past and the move forgotten. */
  const changes = [
    { on_date: '2026-09-14', kind: 'moved', moved_to: '2026-09-16T18:00:00Z' },
    { on_date: '2026-09-21', kind: 'skipped' },
  ];
  assert.equal(dublin(nextClassAt(TERM, on('2026-09-08T10:00'), changes)), '2026-09-16 19:00');
});

test('a moved class is still on for the two hours after it starts', () => {
  const changes = [{ on_date: '2026-09-14', kind: 'moved', moved_to: '2026-09-17T18:00:00Z' }];
  const during = nextClassAt(TERM, on('2026-09-17T19:30'), changes);
  assert.equal(dublin(during), '2026-09-17 19:00', 'a class half an hour in has not finished');
  assert.equal(during.live, true);
});

test('a move with nowhere to move to does not put a class back on that day', () => {
  /* The database refuses this now, but a row that predates the constraint must
     not take the banner down — and it must not answer with the original day
     either. Whatever else the row means, it says the Monday class is not
     happening as scheduled, and sending students to one that may not run is the
     worse of the two mistakes. */
  const changes = [{ on_date: '2026-09-14', kind: 'moved', moved_to: null }];
  assert.equal(dublin(nextClassAt(TERM, on('2026-09-08T10:00'), changes)), '2026-09-21 19:00');
});

/* Every sitting, for the calendar.
   ------------------------------------------------------------------
   Built from the same three inputs as the banner — the weekly slot, the term
   and the changes — so the two cannot disagree about which Monday is on. */

test('the calendar lists every sitting, with what happened to each', async () => {
  const { classSittings } = await import('../src/classtime.js');
  const klass = { ...TERM, ends_on: '2026-10-12' };
  const sittings = classSittings(klass, {
    changes: [
      { on_date: '2026-09-14', kind: 'recorded' },
      { on_date: '2026-09-21', kind: 'moved', moved_to: '2026-09-24T19:00:00Z' },
      { on_date: '2026-10-05', kind: 'skipped' },
    ],
    sessions: [
      { starts_at: '2026-09-30T18:00:00Z', duration_minutes: 60, label: 'Catch-up', cancelled: false },
      { starts_at: '2026-10-07T18:00:00Z', cancelled: true },
    ],
  });

  assert.deepEqual(sittings.map((row) => `${row.onDate} ${row.kind}`), [
    '2026-09-07 running',
    '2026-09-14 recorded',
    '2026-09-21 moved',
    '2026-09-28 running',
    '2026-09-30 extra',
    '2026-10-05 skipped',
    '2026-10-12 running',
  ]);

  // A moved sitting is plotted where it happens, not where it would have been.
  const moved = sittings.find((row) => row.kind === 'moved');
  assert.equal(DateTime.fromISO(moved.at).setZone('Europe/Dublin').toFormat('ccc d LLL HH:mm'), 'Thu 24 Sep 20:00');

  // A week that is off keeps its slot so it can be drawn struck through rather
  // than silently missing from the month.
  const off = sittings.find((row) => row.kind === 'skipped');
  assert.equal(DateTime.fromISO(off.at).setZone('Europe/Dublin').toFormat('ccc d LLL HH:mm'), 'Mon 5 Oct 19:00');

  // A cancelled extra session is not a class.
  assert.equal(sittings.filter((row) => row.kind === 'extra').length, 1);
});

test('the calendar stays inside the term', async () => {
  const { classSittings } = await import('../src/classtime.js');
  const sittings = classSittings(TERM);
  assert.equal(sittings.at(0).onDate, '2026-09-07', 'nothing before the first day');
  assert.ok(sittings.at(-1).onDate <= '2027-06-01', 'nothing after the last');
});

test('a class with no day or time has no sittings rather than throwing', async () => {
  const { classSittings } = await import('../src/classtime.js');
  assert.deepEqual(classSittings({ timezone: 'Europe/Dublin' }), []);
  assert.deepEqual(classSittings(null), []);
});
