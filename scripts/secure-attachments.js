/**
 * Moves board and lesson attachments out of the public uploads directory.
 *
 * They were written there originally, which meant a PDF posted to a private
 * class board was readable by anybody who ended up with the address. New ones
 * are written privately; this moves the ones already on disk and repoints their
 * rows at the authenticated route.
 *
 * Safe to run more than once: a row already pointing at the media route is
 * skipped, and a file already moved is not moved again.
 *
 *   node scripts/secure-attachments.js
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool, query } from '../src/db.js';
import { config } from '../src/config.js';

async function move(storedName) {
  if (!storedName) return false;
  const name = path.basename(storedName);
  const from = path.join(config.uploadDir, name);
  const to = path.join(config.privateUploadDir, name);
  try { await fs.access(to); return true; } catch { /* not moved yet */ }
  try { await fs.rename(from, to); return true; }
  catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`  file missing on disk, row repointed anyway: ${name}`);
      return true;
    }
    throw error;
  }
}

async function secure(table, kind) {
  const rows = await query(
    `SELECT id, stored_name, url FROM ${table}
     WHERE stored_name IS NOT NULL AND url NOT LIKE '/api/media/%'`,
  );
  let moved = 0;
  for (const row of rows.rows) {
    await move(row.stored_name);
    await query(`UPDATE ${table} SET url=$1 WHERE id=$2`,
      [`/api/media/attachment/${kind}/${row.id}`, row.id]);
    moved += 1;
  }
  console.log(`${table}: ${moved} attachment(s) moved behind authentication`);
}

await fs.mkdir(config.privateUploadDir, { recursive: true });
await secure('discussion_attachments', 'post');
await secure('lesson_attachments', 'lesson');
await pool.end();
