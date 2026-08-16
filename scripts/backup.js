/* Run a backup right now. Use it before an update, and once after deploying so
   you have seen it work rather than assuming it does. */
import { runBackup } from '../src/backup.js';
import { pool } from '../src/db.js';

const summary = await runBackup();
await pool.end();
// Any failure is worth a non-zero exit: a half-done backup should not look fine.
if (summary.errors.length || (!summary.database && !summary.files)) process.exit(1);
