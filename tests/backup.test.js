import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { runBackup, expiredBackups, backupNames } from '../src/backup.js';

/* pg_dump is not installed on every machine this suite runs on, and installing
   Postgres to test a backup would be a strange price to pay. These put a
   stand-in on the PATH instead: what is under test is the part written here —
   streaming the dump into gzip, what happens when it fails, whether a broken
   run leaves behind a file that looks like a good backup, and the pruning. */
async function inScratch({ dump, keepDays = 14, withUploads = true }, body) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gg-backup-'));
  const bin = path.join(root, 'bin');
  const directory = path.join(root, 'backups');
  const uploads = path.join(root, 'uploads-private');
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, 'pg_dump'), dump, { mode: 0o755 });
  if (withUploads) {
    await fs.mkdir(uploads, { recursive: true });
    await fs.writeFile(path.join(uploads, 'homework-abc.txt'), 'a student answer');
  }

  const realPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${realPath}`;
  const options = {
    directory, keepDays,
    databaseUrl: 'postgres://irrelevant/because-pg_dump-is-a-stub',
    fileDirs: withUploads ? [uploads] : [path.join(root, 'nothing-here')],
  };
  try {
    await body({ options, directory, root });
  } finally {
    process.env.PATH = realPath;
    await fs.rm(root, { recursive: true, force: true });
  }
}

const AT = new Date('2026-08-16T03:15:00Z');

test('backup filenames sort by date and say what they hold', () => {
  const names = backupNames(AT);
  assert.equal(names.database, 'gg-2026-08-16T0315-database.sql.gz');
  assert.equal(names.files, 'gg-2026-08-16T0315-files.tar.gz');
});

test('a good dump is streamed into a gzip file that still decompresses', async () => {
  await inScratch({ dump: '#!/bin/sh\necho "CREATE TABLE users (id uuid);"\n' }, async ({ options, directory }) => {
    const summary = await runBackup({ now: AT, ...options });
    assert.deepEqual(summary.errors, []);
    assert.equal(summary.database.name, 'gg-2026-08-16T0315-database.sql.gz');

    const sql = zlib.gunzipSync(await fs.readFile(path.join(directory, summary.database.name))).toString();
    assert.match(sql, /CREATE TABLE users/, 'the dump survives the round trip');
  });
});

test('the student files are archived alongside the database', async () => {
  await inScratch({ dump: '#!/bin/sh\necho "-- dump"\n' }, async ({ options, directory }) => {
    const summary = await runBackup({ now: AT, ...options });
    assert.ok(summary.files, 'a files archive was recorded');
    assert.ok(summary.files.bytes > 0);
    assert.ok((await fs.readdir(directory)).includes(summary.files.name));
  });
});

test('a failed dump reports why and leaves nothing that looks like a backup', async () => {
  const dump = '#!/bin/sh\necho "could not connect to server" >&2\nexit 1\n';
  await inScratch({ dump }, async ({ options, directory }) => {
    const summary = await runBackup({ now: AT, ...options });
    assert.equal(summary.database, null, 'no database backup is claimed');
    assert.match(summary.errors.join(' '), /could not connect to server/, 'the real reason is passed through');
    assert.ok(!(await fs.readdir(directory)).some((name) => name.endsWith('database.sql.gz')),
      'a half-written dump must not be left sitting there looking like a backup');
  });
});

test('a missing pg_dump says so rather than taking the process down', async () => {
  // An empty file is not executable as a program, which is the closest stand-in
  // for the binary being absent that does not depend on the host.
  await inScratch({ dump: '' }, async ({ options }) => {
    const summary = await runBackup({ now: AT, ...options });
    assert.equal(summary.database, null);
    assert.equal(summary.errors.length, 1, 'one clear error, and no crash');
    assert.ok(summary.files, 'the files half still ran');
  });
});

test('backups past the retention window are removed, newer ones are not', async () => {
  await inScratch({ dump: '#!/bin/sh\necho "-- dump"\n', keepDays: 14 }, async ({ options, directory }) => {
    await fs.mkdir(directory, { recursive: true });
    const old = 'gg-2026-07-01T0315-database.sql.gz';
    const recent = 'gg-2026-08-14T0315-database.sql.gz';
    for (const name of [old, recent, 'notes.txt']) await fs.writeFile(path.join(directory, name), 'x');

    const summary = await runBackup({ now: AT, ...options });
    assert.ok(summary.removed.includes(old), 'the six-week-old backup goes');
    assert.ok(!summary.removed.includes(recent), 'two days old stays');
    assert.ok((await fs.readdir(directory)).includes('notes.txt'), 'files that are not backups are left alone');
  });
});

test('nothing is pruned when the run produced nothing', async () => {
  await inScratch({ dump: '#!/bin/sh\nexit 1\n', keepDays: 1, withUploads: false }, async ({ options, directory }) => {
    await fs.mkdir(directory, { recursive: true });
    const old = 'gg-2020-01-01T0315-database.sql.gz';
    await fs.writeFile(path.join(directory, old), 'the last good backup');

    const summary = await runBackup({ now: AT, ...options });
    assert.deepEqual(summary.removed, [], 'a failing run must not delete its way through the good backups');
    assert.ok((await fs.readdir(directory)).includes(old));
  });
});

test('only real backup filenames are considered for pruning', () => {
  const names = ['gg-2020-01-01T0315-database.sql.gz', 'gg-2020-01-01T0315-files.tar.gz',
    'notes.txt', 'gg-nonsense-database.sql.gz', 'dump.sql'];
  assert.deepEqual(expiredBackups(names, 14, AT),
    ['gg-2020-01-01T0315-database.sql.gz', 'gg-2020-01-01T0315-files.tar.gz']);
});
