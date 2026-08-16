import pg from 'pg';
import { config } from './config.js';

/* A `date` column is a calendar day, not an instant. Left alone, node-postgres
   turns `week_start` into a Date at the *server's* local midnight, which then
   serialises to JSON as a shifted timestamp — so the same teaching week reads as
   a different day depending on where the process runs, and the browser cannot
   parse it as a date at all. Handing back the raw 'YYYY-MM-DD' string keeps a
   calendar day a calendar day the whole way through. */
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

const { Pool } = pg;
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function one(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] ?? null;
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
