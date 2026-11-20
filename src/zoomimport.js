import { one, query } from './db.js';
import { listRecordings, downloadRecording, zoomConfigured } from './zoom.js';
import { createVideo, deleteVideo, uploadVideo, videoStatus, bunnyConfigured } from './bunny.js';
import { config } from './config.js';
import { audit } from './audit.js';

/**
 * Zoom to Bunny to a lesson.
 *
 * The rule that matters: **nothing imports because it merely exists.** A Zoom
 * account carries one-to-ones, test calls and meetings that have no business on
 * a class portal. A recording comes across only when somebody presses Import on
 * it, or when its webinar has been named as one that always should.
 *
 * The copy on Zoom is never touched. Until an import has demonstrably worked,
 * Zoom holds the only copy, and nothing in here has permission to change that.
 */

/* Bunny is where a recording is moved to. Without it the recording is linked
   instead: a Zoom recording lesson with the share link and its passcode. */
export const importConfigured = () => zoomConfigured();

/** Everything on the account, marked with what has already been taken. */
export async function availableRecordings({ months = 3 } = {}) {
  const recordings = await listRecordings({ months });
  const seen = await query('SELECT zoom_uuid, zoom_file_id, status, lesson_id, error, finished_at FROM zoom_imports');
  const byKey = new Map(seen.rows.map((row) => [`${row.zoom_uuid}:${row.zoom_file_id}`, row]));
  const sources = await query('SELECT zoom_id, label, module_id, auto_import, auto_publish, class_id FROM zoom_sources');
  const byMeeting = new Map(sources.rows.map((row) => [String(row.zoom_id), row]));

  return recordings.map((recording) => {
    const record = byKey.get(`${recording.uuid}:${recording.fileId}`);
    const source = byMeeting.get(recording.meetingId);
    return {
      ...recording,
      importStatus: record?.status || null,
      lessonId: record?.lesson_id || null,
      error: record?.error || null,
      // When the last attempt ended, which is what decides whether a failure is tried again.
      attemptEndedAt: record?.finished_at || null,
      watched: Boolean(source),
      autoImport: Boolean(source?.auto_import),
      autoPublish: Boolean(source?.auto_publish),
      targetModuleId: source?.module_id || null,
      classId: source?.class_id || null,
    };
  });
}

/**
 * Brings one recording across.
 *
 * Written so that running it twice is harmless: the unique key on
 * (uuid, file id) is what stops the webhook and the scheduled sweep both
 * creating a lesson for the same class.
 */
/* `retry` takes up an import that failed. Without it a failure was final: the
   row that says "somebody has this one" stayed behind, so neither the hourly
   sweep nor the Import button could ever try that recording again. */
export async function importRecording({ recording, moduleId, actorId = null, title = null, publish = false, retry = false }) {
  if (!importConfigured()) {
    throw Object.assign(new Error('The Zoom account needs to be connected first, under Settings.'), { status: 503 });
  }
  const moving = bunnyConfigured();
  if (!moving && !recording.shareUrl) {
    throw Object.assign(new Error('Zoom has no share link for this recording yet, and there is no Bunny Stream library to move it to.'), { status: 409 });
  }
  if (!moduleId) {
    throw Object.assign(new Error('Choose the section this recording belongs in.'), { status: 400 });
  }

  const claim = await one(
    `INSERT INTO zoom_imports(zoom_uuid,zoom_file_id,zoom_meeting_id,topic,status,bytes)
     VALUES ($1,$2,$3,$4,'uploading',$5)
     ON CONFLICT (zoom_uuid, zoom_file_id) DO NOTHING
     RETURNING *`,
    [recording.uuid, recording.fileId, recording.meetingId, recording.topic, recording.fileSize || null],
  );
  let taken = claim;
  if (!taken && retry) {
    // In one statement, so two sweeps cannot both take up the same failure.
    taken = await one(
      `UPDATE zoom_imports SET status='uploading', error=NULL, started_at=now(), finished_at=NULL
       WHERE zoom_uuid=$1 AND zoom_file_id=$2 AND status='failed' RETURNING *`,
      [recording.uuid, recording.fileId],
    );
  }
  // Somebody, or something, got here first.
  if (!taken) {
    const existing = await one(
      'SELECT * FROM zoom_imports WHERE zoom_uuid=$1 AND zoom_file_id=$2',
      [recording.uuid, recording.fileId],
    );
    return { alreadyImported: true, record: existing };
  }

  let videoId = null;
  let lessonMade = false;
  try {
    const lessonTitle = title || recording.topic || 'Class recording';
    let provider = 'zoom', ref = recording.shareUrl, durationSeconds = recording.durationSeconds || null;
    if (moving) {
      videoId = await createVideo(lessonTitle);
      const { stream, size } = await downloadRecording(recording.downloadUrl);
      await uploadVideo(videoId, stream, size || recording.fileSize);
      /* Bunny reports a duration once it has finished encoding. Asking now
         usually returns nothing, so Zoom's own figure is used and the lesson is
         right either way. */
      const status = await videoStatus(videoId).catch(() => null);
      provider = 'bunny'; ref = `${config.bunny.libraryId}/${videoId}`;
      durationSeconds = status?.durationSeconds || durationSeconds;
    }

    const next = await one(
      'SELECT COALESCE(max(position),-1)+1 position FROM course_lessons WHERE module_id=$1',
      [moduleId],
    );
    const lesson = await one(
      `INSERT INTO course_lessons(module_id,title,notes,video_provider,video_ref,video_passcode,duration_seconds,recorded_on,published,position,zoom_link,zoom_link_passcode)
       VALUES ($1,$2,'',$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        moduleId, lessonTitle, provider, ref,
        provider === 'zoom' ? (recording.passcode || null) : null,
        durationSeconds,
        recording.startedAt ? String(recording.startedAt).slice(0, 10) : null,
        Boolean(publish),
        next.position,
        // The recording's own page on Zoom stays under the lesson, for when the player will not play.
        recording.shareUrl || null,
        recording.passcode || null,
      ],
    );
    lessonMade = true;

    await query(
      `UPDATE zoom_imports SET status='done', lesson_id=$1, finished_at=now() WHERE id=$2`,
      [lesson.id, taken.id],
    );
    await audit({
      actorId, action: 'zoom.recording_imported', entityType: 'lesson', entityId: lesson.id,
      metadata: { topic: recording.topic, meetingId: recording.meetingId, provider, published: Boolean(publish) },
    });
    /* Unpublished unless the webinar was marked to publish on arrival. An
       imported lesson carries whatever the meeting happened to be called and
       no notes, and that is not something to put in front of a class unread;
       a named class recording with its date for a title is. */
    return { lesson, videoId, published: Boolean(publish) };
  } catch (error) {
    /* The video reserved for an upload that did not finish is taken back, so a
       recording that is tried again does not leave an empty one behind each time. */
    if (videoId && !lessonMade) await deleteVideo(videoId).catch(() => {});
    await query(
      `UPDATE zoom_imports SET status='failed', error=$1, finished_at=now() WHERE id=$2`,
      [String(error.message).slice(0, 500), taken.id],
    );
    throw error;
  }
}

/* "Class recording, Monday 13 October 2026": the date is what a student
   looks for, not what the webinar happened to be called. */
export function recordingTitle(recording, source = {}) {
  const when = recording.startedAt ? new Intl.DateTimeFormat('en-IE', { dateStyle: 'full', timeZone: config.defaultTimezone }).format(new Date(recording.startedAt)) : '';
  const what = source.label ? String(source.label).trim() : 'Class recording';
  return when ? `${what}, ${when}` : what;
}

export const RETRY_FAILED_FOR_MS = 12 * 60 * 60 * 1000;
export function retryable(attemptEndedAt, now = Date.now()) {
  if (!attemptEndedAt) return false;
  const since = now - new Date(attemptEndedAt).getTime();
  return since >= 0 && since < RETRY_FAILED_FOR_MS;
}

/* An upload runs inside this server and cannot outlive it. So anything still
   marked "uploading" when the server starts was cut off by the restart, and
   left like that it would be skipped by every sweep from then on. Marked as a
   failure it is picked up again within the hour. */
export async function releaseInterruptedImports() {
  const released = await query(
    `UPDATE zoom_imports SET status='failed', error='Interrupted when the portal restarted. It will be tried again.', finished_at=now()
     WHERE status='uploading' RETURNING id`,
  );
  return released.rows.length;
}

/**
 * The sweep, and what the webhook calls.
 *
 * Only touches recordings whose webinar has been named for automatic import.
 * Everything else is left alone to be looked at.
 */
export async function importWatched({ meetingId = null, actorId = null } = {}) {
  if (!importConfigured()) return { imported: 0, skipped: 0, reason: 'not configured' };

  const sources = await query(
    `SELECT zoom_id, module_id, auto_publish, label, created_at FROM zoom_sources
     WHERE auto_import=true AND module_id IS NOT NULL ${meetingId ? 'AND zoom_id=$1' : ''}`,
    meetingId ? [String(meetingId)] : [],
  );
  if (!sources.rows.length) return { imported: 0, skipped: 0, reason: 'nothing set to import automatically' };

  const wanted = new Map(sources.rows.map((row) => [String(row.zoom_id), row]));
  const recordings = await availableRecordings({ months: 2 });

  let imported = 0;
  let skipped = 0;
  for (const recording of recordings) {
    const source = wanted.get(recording.meetingId);
    if (!source) { skipped += 1; continue; }
    /* Only classes taught after the rule was switched on come across by
       themselves. Earlier recordings are often already in the course, put
       there by hand, and are brought over with the Import button if wanted. */
    if (recording.startedAt && source.created_at && new Date(recording.startedAt) < new Date(source.created_at)) { skipped += 1; continue; }
    if (recording.importStatus === 'done' || recording.importStatus === 'uploading') { skipped += 1; continue; }
    /* A failure is tried again, hourly, for half a day: long enough to get past
       a restart or a bad evening at Zoom or Bunny. After that it is left for a
       person, who may by then have put the class in the course by hand, and a
       second copy arriving a week later would be worse than none. */
    const failed = recording.importStatus === 'failed';
    if (failed && !retryable(recording.attemptEndedAt)) { skipped += 1; continue; }
    try {
      await importRecording({ recording, moduleId: source.module_id, actorId, publish: Boolean(source.auto_publish), title: recordingTitle(recording, source), retry: failed });
      imported += 1;
    } catch (error) {
      // One bad recording must not stop the rest of the sweep.
      console.error('Zoom import failed', recording.uuid, error.message);
    }
  }
  return { imported, skipped };
}
