import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retryable, RETRY_FAILED_FOR_MS } from '../src/zoomimport.js';

/* A class recording that did not arrive.
   ------------------------------------------------------------------
   The recording of 9 November 2026 never reached the course. Sending it to
   Bunny failed in its first second ("duplex option is required when sending a
   body"), and having failed it could never be tried again: the row that marks
   a recording as taken stayed behind, so the sweep and the Import button both
   answered that it had already been brought across. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const bunny = read('../src/bunny.js');
const zoomImport = read('../src/zoomimport.js');
const server = read('../server.js');

test('a recording is sent to Bunny as a stream, and Node is told so', () => {
  const upload = bunny.slice(bunny.indexOf('export async function uploadVideo'), bunny.indexOf('export async function deleteVideo'));
  assert.match(upload, /duplex: 'half'/);
  // The helper every request goes through has to pass it on. Dropping it here is what broke the upload.
  const call = bunny.slice(bunny.indexOf('async function call('), bunny.indexOf('export async function createVideo'));
  assert.match(call, /\{ method = 'GET', body, headers = \{\}, raw = false, duplex \} = \{\}/);
  assert.match(call, /\.\.\.\(duplex \? \{ duplex \} : \{\}\),/);
});

test('a failed import is tried again for half a day, then left for a person', () => {
  const ended = new Date('2026-11-16T21:20:00Z');
  assert.equal(retryable(ended, ended.getTime() + 60 * 60 * 1000), true, 'the next hourly sweep takes it up');
  assert.equal(retryable(ended, ended.getTime() + RETRY_FAILED_FOR_MS - 1), true);
  assert.equal(retryable(ended, ended.getTime() + RETRY_FAILED_FOR_MS), false);
  // A week-old failure may have been put in the course by hand since; a second copy would be worse than none.
  assert.equal(retryable(ended, ended.getTime() + 7 * 24 * 60 * 60 * 1000), false);
  assert.equal(retryable(null), false);

  const sweep = zoomImport.slice(zoomImport.indexOf('export async function importWatched'));
  assert.match(sweep, /if \(failed && !retryable\(recording\.attemptEndedAt\)\) \{ skipped \+= 1; continue; \}/);
  assert.match(sweep, /retry: failed \}\);/);
  // Taken up in one statement, so two sweeps cannot both have it.
  assert.match(zoomImport, /UPDATE zoom_imports SET status='uploading', error=NULL, started_at=now\(\), finished_at=NULL\s+WHERE zoom_uuid=\$1 AND zoom_file_id=\$2 AND status='failed' RETURNING \*/);
  // Pressing Import on a failed recording is asking for another go.
  assert.match(read('../src/routes/admin.js'), /title: parsed\.data\.title,\s+\/\/ Pressing Import on a recording that failed is asking for it to be tried again\.\s+retry: true,/);
});

test('an upload cut off by a restart is handed back, and a failure leaves nothing behind on Bunny', () => {
  assert.match(zoomImport, /export async function releaseInterruptedImports\(\)/);
  assert.match(zoomImport, /SET status='failed', error='Interrupted when the portal restarted\. It will be tried again\.', finished_at=now\(\)\s+WHERE status='uploading'/);
  const start = server.slice(server.indexOf('async function start()'));
  assert.ok(start.indexOf('await releaseInterruptedImports()') < start.indexOf('startZoomScheduler();'), 'before the sweep can run');
  // The reserved video goes if the upload did not finish, but never once a lesson points at it.
  assert.match(zoomImport, /if \(videoId && !lessonMade\) await deleteVideo\(videoId\)\.catch\(\(\) => \{\}\);/);
});
