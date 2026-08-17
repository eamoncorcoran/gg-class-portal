import { one, query } from './db.js';
import { listRecordings, downloadRecording, zoomConfigured } from './zoom.js';
import { createVideo, uploadVideo, videoStatus, bunnyConfigured } from './bunny.js';
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

export const importConfigured = () => zoomConfigured() && bunnyConfigured();

/** Everything on the account, marked with what has already been taken. */
export async function availableRecordings({ months = 3 } = {}) {
  const recordings = await listRecordings({ months });
  const seen = await query('SELECT zoom_uuid, zoom_file_id, status, lesson_id, error FROM zoom_imports');
  const byKey = new Map(seen.rows.map((row) => [`${row.zoom_uuid}:${row.zoom_file_id}`, row]));
  const sources = await query('SELECT zoom_id, label, module_id, auto_import FROM zoom_sources');
  const byMeeting = new Map(sources.rows.map((row) => [String(row.zoom_id), row]));

  return recordings.map((recording) => {
    const record = byKey.get(`${recording.uuid}:${recording.fileId}`);
    const source = byMeeting.get(recording.meetingId);
    return {
      ...recording,
      importStatus: record?.status || null,
      lessonId: record?.lesson_id || null,
      error: record?.error || null,
      watched: Boolean(source),
      autoImport: Boolean(source?.auto_import),
      targetModuleId: source?.module_id || null,
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
export async function importRecording({ recording, moduleId, actorId = null, title = null }) {
  if (!importConfigured()) {
    throw Object.assign(new Error('Zoom and Bunny Stream both need to be configured first.'), { status: 503 });
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
  // Somebody, or something, got here first.
  if (!claim) {
    const existing = await one(
      'SELECT * FROM zoom_imports WHERE zoom_uuid=$1 AND zoom_file_id=$2',
      [recording.uuid, recording.fileId],
    );
    return { alreadyImported: true, record: existing };
  }

  try {
    const lessonTitle = title || recording.topic || 'Class recording';
    const videoId = await createVideo(lessonTitle);
    const { stream, size } = await downloadRecording(recording.downloadUrl);
    await uploadVideo(videoId, stream, size || recording.fileSize);

    /* Bunny reports a duration once it has finished encoding. Asking now
       usually returns nothing, so Zoom's own figure is used and the lesson is
       right either way. */
    const status = await videoStatus(videoId).catch(() => null);

    const next = await one(
      'SELECT COALESCE(max(position),-1)+1 position FROM course_lessons WHERE module_id=$1',
      [moduleId],
    );
    const lesson = await one(
      `INSERT INTO course_lessons(module_id,title,notes,video_provider,video_ref,duration_seconds,recorded_on,published,position)
       VALUES ($1,$2,'','bunny',$3,$4,$5,false,$6) RETURNING *`,
      [
        moduleId, lessonTitle,
        `${config.bunny.libraryId}/${videoId}`,
        status?.durationSeconds || recording.durationSeconds || null,
        recording.startedAt ? String(recording.startedAt).slice(0, 10) : null,
        next.position,
      ],
    );

    await query(
      `UPDATE zoom_imports SET status='done', lesson_id=$1, finished_at=now() WHERE id=$2`,
      [lesson.id, claim.id],
    );
    await audit({
      actorId, action: 'zoom.recording_imported', entityType: 'lesson', entityId: lesson.id,
      metadata: { topic: recording.topic, meetingId: recording.meetingId },
    });
    /* Deliberately unpublished. An imported lesson carries whatever the meeting
       happened to be called and no notes, and that is not something to put in
       front of a class unread. */
    return { lesson, videoId, published: false };
  } catch (error) {
    await query(
      `UPDATE zoom_imports SET status='failed', error=$1, finished_at=now() WHERE id=$2`,
      [String(error.message).slice(0, 500), claim.id],
    );
    throw error;
  }
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
    `SELECT zoom_id, module_id FROM zoom_sources
     WHERE auto_import=true AND module_id IS NOT NULL ${meetingId ? 'AND zoom_id=$1' : ''}`,
    meetingId ? [String(meetingId)] : [],
  );
  if (!sources.rows.length) return { imported: 0, skipped: 0, reason: 'nothing set to import automatically' };

  const wanted = new Map(sources.rows.map((row) => [String(row.zoom_id), row.module_id]));
  const recordings = await availableRecordings({ months: 2 });

  let imported = 0;
  let skipped = 0;
  for (const recording of recordings) {
    const moduleId = wanted.get(recording.meetingId);
    if (!moduleId) { skipped += 1; continue; }
    if (recording.importStatus === 'done' || recording.importStatus === 'uploading') { skipped += 1; continue; }
    try {
      await importRecording({ recording, moduleId, actorId });
      imported += 1;
    } catch (error) {
      // One bad recording must not stop the rest of the sweep.
      console.error('Zoom import failed', recording.uuid, error.message);
    }
  }
  return { imported, skipped };
}
