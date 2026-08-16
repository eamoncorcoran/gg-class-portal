import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import cron from 'node-cron';
import { config } from './config.js';

/* A backup that only lives on the machine it protects is not a backup. This
   writes one locally every night; copying it off the server is step one of the
   restore instructions in LAUNCH.md.
 *
 * Two things are backed up, because the database alone is not the whole story:
 * the tables, and the files students uploaded, which live outside Postgres. */

const STAMP = /^gg-(\d{4}-\d{2}-\d{2}T\d{4})-(database\.sql\.gz|files\.tar\.gz)$/;

export function backupNames(when) {
  // Sortable, filename-safe, and readable at a glance in an ls.
  const stamp = when.toISOString().slice(0, 16).replace(/:/g, '').replace(/-(\d{2})T/, '-$1T');
  return { database: `gg-${stamp}-database.sql.gz`, files: `gg-${stamp}-files.tar.gz`, stamp };
}

/** Backups older than the retention window, oldest first. */
export function expiredBackups(fileNames, keepDays, now) {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return fileNames
    .filter((name) => STAMP.test(name))
    .filter((name) => {
      const stamp = name.match(STAMP)[1];
      // gg-2026-08-16T0315-... → 2026-08-16T03:15Z
      const iso = `${stamp.slice(0, 13)}:${stamp.slice(13, 15)}:00Z`;
      const at = new Date(iso).getTime();
      return Number.isFinite(at) && at < cutoff;
    })
    .sort();
}

/** Resolves on a clean exit, rejects with something worth reading otherwise. */
function exitOf(child, command, missingAdvice) {
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    child.on('error', (error) => reject(
      error.code === 'ENOENT' ? new Error(missingAdvice) : error));
    child.on('close', (code) => (code === 0
      ? resolve()
      : reject(new Error(`${command} exited with ${code}${stderr ? `: ${stderr.trim().slice(0, 400)}` : ''}`))));
  });
}

function run(command, args, missingAdvice) {
  const child = spawn(command, args);
  return exitOf(child, command, missingAdvice || `${command} is not installed.`);
}

/** pg_dump straight into a gzip file, so a large database never sits in memory. */
async function dumpDatabase(target, databaseUrl) {
  const child = spawn('pg_dump', ['--no-owner', '--no-privileges', '--format=plain', databaseUrl]);
  const exited = exitOf(child, 'pg_dump',
    'pg_dump is not installed, so the database was not backed up. On Debian: apt-get install postgresql-client');
  /* A missing binary rejects on the next tick, well before the await below.
     Without a handler in place by then Node treats it as unhandled and takes
     the whole process down. The rejection is still delivered to the await. */
  exited.catch(() => {});

  /* Await the exit either way: when pg_dump is the thing that failed, its
     message says so, where a broken-pipe error from the gzip side would not. */
  let writeError = null;
  await pipeline(child.stdout, zlib.createGzip({ level: 6 }), createWriteStream(target))
    .catch((error) => { writeError = error; });
  await exited;
  if (writeError) throw writeError;
}

/** The student work and voice notes, which are files on disk rather than rows. */
async function archiveFiles(target, wanted) {
  const present = [];
  for (const directory of wanted) {
    try { await fs.access(directory); present.push(directory); } catch { /* nothing there yet */ }
  }
  if (!present.length) return false;
  // -C so the archive holds "uploads-private/x" rather than the whole server path.
  const args = ['-czf', target];
  for (const directory of present) args.push('-C', path.dirname(directory), path.basename(directory));
  await run('tar', args, 'tar is not installed, so the uploaded files were not backed up.');
  return true;
}

/* Everything it needs is an argument with a configured default, so the whole
   thing can be pointed at a scratch directory in a test without going near the
   real one. */
export async function runBackup({
  now = new Date(),
  directory = config.backupDir,
  keepDays = config.backupKeepDays,
  databaseUrl = config.databaseUrl,
  fileDirs = [config.privateUploadDir, config.uploadDir],
} = {}) {
  await fs.mkdir(directory, { recursive: true });
  const names = backupNames(now);
  const summary = { stamp: names.stamp, database: null, files: null, removed: [], errors: [] };

  /* A half-written file left behind by a failed run looks exactly like a backup
     in an ls, which is the worst possible thing for it to look like. */
  const discard = (target) => fs.unlink(target).catch(() => {});

  try {
    const target = path.join(directory, names.database);
    try {
      await dumpDatabase(target, databaseUrl);
      summary.database = { name: names.database, bytes: (await fs.stat(target)).size };
    } catch (error) { await discard(target); throw error; }
  } catch (error) {
    summary.errors.push(`database: ${error.message}`);
  }

  try {
    const target = path.join(directory, names.files);
    try {
      if (await archiveFiles(target, fileDirs)) {
        summary.files = { name: names.files, bytes: (await fs.stat(target)).size };
      }
    } catch (error) { await discard(target); throw error; }
  } catch (error) {
    summary.errors.push(`files: ${error.message}`);
  }

  /* Only prune once something was written. Otherwise a run that fails every
     night would quietly delete its way through the good backups behind it. */
  if (summary.database || summary.files) {
    try {
      const expired = expiredBackups(await fs.readdir(directory), keepDays, now);
      for (const name of expired) {
        await fs.unlink(path.join(directory, name));
        summary.removed.push(name);
      }
    } catch (error) {
      summary.errors.push(`pruning: ${error.message}`);
    }
  }

  const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  const wrote = [summary.database && `database ${megabytes(summary.database.bytes)}`,
    summary.files && `files ${megabytes(summary.files.bytes)}`].filter(Boolean).join(', ');
  if (summary.errors.length) {
    console.error(`Backup ${names.stamp} had problems: ${summary.errors.join(' | ')}`);
  }
  if (wrote) {
    console.log(`Backup ${names.stamp} wrote ${wrote} to ${directory}${summary.removed.length ? `, removed ${summary.removed.length} past retention` : ''}`);
  }
  return summary;
}

export function startBackupScheduler() {
  if (!config.backupEnabled) return;
  cron.schedule(config.backupCron, () => runBackup().catch((error) => console.error('Backup failed', error)), { noOverlap: true });
  console.log(`Backups scheduled (${config.backupCron}), keeping ${config.backupKeepDays} days in ${config.backupDir}`);
}
