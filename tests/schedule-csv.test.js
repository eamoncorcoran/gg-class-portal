import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { DateTime } from 'luxon';

/* The CSV importer's parser, lifted out of the route so it can be exercised
   without a server or a database. A spreadsheet is written by a person on their
   own computer, so the dates arrive in whatever form that computer uses; this
   is the part most likely to quietly do the wrong thing. */
const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');

function loadParser() {
  const start = admin.indexOf('const SCHEDULE_COLUMNS');
  const end = admin.indexOf("/* A file to start from");
  assert.ok(start !== -1 && end > start, 'the schedule parser is no longer where this test expects it');
  const source = admin.slice(start, end);
  return new Function('parse', 'DateTime', `${source}; return { readScheduleCsv, parseScheduleDate };`)(parse, DateTime);
}

const CATEGORIES = [{ id: 'cat-general', name: 'General' }, { id: 'cat-q', name: 'Questions' }];
const ZONE = 'Europe/Dublin';

test('a date is read in the class timezone, whichever way it is written', () => {
  const { parseScheduleDate } = loadParser();
  // Same instant, four ways a spreadsheet might write it.
  for (const text of ['01/09/2026 09:00', '1/9/2026 09:00', '01-09-2026 09:00', '2026-09-01T09:00']) {
    const parsed = parseScheduleDate(text, ZONE);
    assert.ok(parsed?.isValid, `${text} was not read`);
    assert.equal(parsed.toUTC().toISO(), '2026-09-01T08:00:00.000Z', `${text} came out at the wrong instant`);
  }
  // Day-first, not month-first: 09/01 is January, not September.
  assert.equal(parseScheduleDate('09/01/2026 09:00', ZONE).month, 1);
  // Winter, so no summer-time hour to add.
  assert.equal(parseScheduleDate('01/12/2026 09:00', ZONE).toUTC().toISO(), '2026-12-01T09:00:00.000Z');
  assert.equal(parseScheduleDate('tuesday', ZONE), null);
  assert.equal(parseScheduleDate('', ZONE), null);
});

test('a good file is read row by row, with the spreadsheet line numbers', () => {
  const { readScheduleCsv } = loadParser();
  const rows = readScheduleCsv(
    'Date,Title,Body,Category,Pinned\n'
    + '01/09/2026 09:00,Week one,"Aimsir chaite, and the irregulars.",General,yes\n'
    + '08/09/2026 19:30,Week two,Bring your written piece.,Questions,no\n',
    { categories: CATEGORIES, timezone: ZONE },
  );
  assert.equal(rows.length, 2);
  // Header is line 1, so a person counting rows in a spreadsheet agrees with us.
  assert.deepEqual(rows.map((row) => row.line), [2, 3]);
  assert.deepEqual(rows.map((row) => row.problems), [[], []]);
  assert.equal(rows[0].title, 'Week one');
  // The comma inside the quotes stays inside the body.
  assert.equal(rows[0].body, 'Aimsir chaite, and the irregulars.');
  assert.equal(rows[0].pinned, true);
  assert.equal(rows[1].pinned, false);
  assert.equal(rows[0].categoryId, 'cat-general');
  assert.equal(rows[1].categoryId, 'cat-q');
  assert.equal(rows[0].publishedAt, '2026-09-01T08:00:00.000Z');
});

test('every kind of bad row is named rather than guessed at or dropped', () => {
  const { readScheduleCsv } = loadParser();
  const rows = readScheduleCsv(
    'Date,Title,Body,Category,Pinned\n'
    + 'tuesday,Bad date,Body here,General,no\n'
    + '22/09/2026,No such category,Body here,Nonsense,no\n'
    + '29/09/2026,,Body but no title,General,no\n'
    + '06/10/2026,Title but no body,,General,no\n'
    + ',No date at all,Body here,General,no\n',
    { categories: CATEGORIES, timezone: ZONE },
  );
  assert.equal(rows.length, 5, 'a bad row must still be reported, not silently dropped');
  assert.match(rows[0].problems[0], /could not be read/);
  assert.match(rows[1].problems[0], /no category called/);
  assert.deepEqual(rows[2].problems, ['no title']);
  assert.deepEqual(rows[3].problems, ['no message']);
  assert.deepEqual(rows[4].problems, ['no date']);
});

test('column names are matched however they are capitalised or worded', () => {
  const { readScheduleCsv } = loadParser();
  const rows = readScheduleCsv(
    'WHEN,Subject,Message,Section,Pin\n'
    + '01/09/2026 09:00,Week one,Body here,general,TRUE\n',
    { categories: CATEGORIES, timezone: ZONE },
  );
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].title, 'Week one');
  assert.equal(rows[0].body, 'Body here');
  assert.equal(rows[0].categoryId, 'cat-general', 'a category should match regardless of case');
  assert.equal(rows[0].pinned, true);
});

test('a date already gone by is flagged rather than refused', () => {
  const { readScheduleCsv } = loadParser();
  const rows = readScheduleCsv(
    'Date,Title,Body\n01/01/2020 09:00,Old one,Body here\n',
    { categories: CATEGORIES, timezone: ZONE },
  );
  // It is a legitimate thing to want — it publishes at once — so it goes in
  // with a note rather than being rejected.
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].past, true);
});

test('the import writes nothing until the preview has been seen', () => {
  // Both routes run the same parser, so what is previewed is what lands.
  const preview = admin.indexOf("schedule-preview");
  const write = admin.indexOf("schedule-import");
  assert.ok(preview !== -1 && write !== -1);
  const previewBody = admin.slice(preview, write);
  assert.doesNotMatch(previewBody, /INSERT INTO discussion_threads/,
    'the preview route must not write anything');
  const importBody = admin.slice(write, admin.indexOf("router.get('/community/:classId/scheduled'"));
  assert.match(importBody, /readScheduleCsv/, 'the import must use the same parser as the preview');
  assert.match(importBody, /await transaction\(/, 'the import must be one transaction');
  assert.match(importBody, /row\.problems\.length/, 'rows with problems must be skipped');
});
