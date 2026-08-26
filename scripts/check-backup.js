/* Prove the backup works, end to end, on demand.
   ------------------------------------------------------------------
   A backup nobody has ever restored is a hope, not a backup. This runs the real
   thing: takes tonight's backup now, pushes it off-site, reads it back, and
   says plainly what exists in both places. Run it after setting storage up, and
   again any time you want to be sure. */
import { runBackup } from '../src/backup.js';
import { offsiteConfigured, verifyOffsite, listBackups } from '../src/offsite.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log('\nWhere backups go');
line('On the server', config.backupDir);
line('Emailed to', config.backupEmailTo || 'nobody — set BACKUP_EMAIL_TO');

console.log('\nOff-site storage');
if (!offsiteConfigured()) {
  line('Status', 'NOT CONFIGURED — backups are on the server disk only.');
  line('', 'Set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_KEY_ID, BACKUP_S3_SECRET.');
} else {
  const check = await verifyOffsite();
  line('Endpoint', config.offsite.endpoint);
  line('Bucket', config.offsite.bucket);
  if (check.ok) line('Write and read back', 'OK');
  else { line('Write and read back', `FAILED — ${check.reason}`); process.exitCode = 1; }
}

console.log('\nTaking a backup now');
const summary = await runBackup();
line('Database', summary.database ? `${(summary.database.bytes / 1024 / 1024).toFixed(1)}MB${summary.database.offsite ? ' (off-site OK)' : ''}` : 'FAILED');
line('Files', summary.files ? `${(summary.files.bytes / 1024 / 1024).toFixed(1)}MB${summary.files.offsite ? ' (off-site OK)' : ''}` : 'none');
if (summary.emailed) {
  line('Emailed', `${summary.emailed.attached.length} attached${summary.emailed.dropped.length ? `, ${summary.emailed.dropped.join(', ')} TOO LARGE` : ''}`);
}
if (summary.errors.length) {
  console.log('\n  Problems:');
  summary.errors.forEach((problem) => console.log(`    - ${problem}`));
  process.exitCode = 1;
}

if (offsiteConfigured()) {
  try {
    const remote = await listBackups();
    console.log(`\nOff-site copies (${remote.length}), keeping ${config.backupKeepDays} days`);
    remote.slice(-6).forEach((name) => console.log(`  ${name}`));
  } catch (error) {
    console.log(`\n  Could not list off-site copies: ${error.message}`);
    process.exitCode = 1;
  }
}

console.log(`\nTo restore: gunzip the database dump and feed it to psql. See DEPLOY.md.\n`);
await pool.end();
