import test from 'node:test';
import assert from 'node:assert/strict';

test('database migrations create the core application tables', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const pg = await import('pg');
  // Read the connection string the same way the application does, so the test
  // works from a local .env file as well as from CI environment variables.
  const { config } = await import('../src/config.js');
  const pool = new pg.default.Pool({ connectionString: config.databaseUrl });
  try {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name=ANY($1::text[])`,
      [['users','sessions','classes','weeks','checkins','assignments','homework_submissions','app_settings',
        'discussion_threads','discussion_posts','discussion_reads','discussion_attachments']],
    );
    assert.equal(result.rows.length, 12);
  } finally {
    await pool.end();
  }
});

test('date columns come back as calendar days, not shifted timestamps', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  // week_start is a calendar day. If node-postgres parses it into a Date, the
  // value serialises to JSON shifted by the server's timezone and the browser
  // can no longer read it as a date at all, which breaks the weekly tracker.
  const { pool } = await import('../src/db.js');
  try {
    const { rows } = await pool.query(`SELECT '2026-07-20'::date week_start`);
    assert.equal(typeof rows[0].week_start, 'string');
    assert.equal(rows[0].week_start, '2026-07-20');
    assert.equal(JSON.parse(JSON.stringify(rows[0])).week_start, '2026-07-20');
  } finally {
    await pool.end();
  }
});
