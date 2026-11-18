import { one, query } from './db.js';
import { listRecordings, downloadRecording, zoomConfigured } from './zoom.js';
import { createVideo, deleteVideo, uploadVideo, bunnyConfigured, getBunnyVideo } from './bunny.js';
import { config } from './config.js';
import { audit } from './audit.js';

/**
 * A lesson's recording, moved from a Zoom link into the player.
 *
 * The early lessons of a course were added by hand, each one a link to the
 * recording on Zoom. Those open in a new tab on Zoom's page; a recording on
 * Bunny Stream plays inside the lesson, and is the one a student on a phone
 * can actually watch. This brings the older ones across.
 *
 * Three rules.
 *
 * The lesson is the lesson that is already there. Its title, notes, place in
 * the course and every student's progress on it stay exactly as they are; only
 * what it plays changes. Nothing new is added to the course.
 *
 * The lesson is switched only when the copy can be played. Until Bunny has
 * finished encoding, the lesson keeps its Zoom link, so nobody opens it to a
 * video that is still being prepared.
 *
 * The recording on Zoom is never touched, and what the lesson pointed at
 * before is kept in lesson_video_moves, so any of them can be put back.
 */

export const movesConfigured = () => zoomConfigured() && bunnyConfigured();

/* A recording shorter than this is a false start (somebody pressed record,
   stopped, and started again), not a class. */
const SHORTEST_CLASS_SECONDS = 10 * 60;

const dublinDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: config.defaultTimezone, dateStyle: 'short' }).format(new Date(iso));
const plainUrl = (url) => String(url || '').split('?')[0];

/**
 * Which Zoom recording belongs to which lesson.
 *
 * A pure function, so it can be tested without Zoom: it is the part that must
 * not be wrong. The link on a hand-made lesson is no use for this. Zoom issues
 * a new share address each time one is asked for, so the address on the lesson
 * and the address Zoom reports today are different strings for the same
 * recording. The matching goes by what does not change, strongest first:
 *
 *   import  the portal brought this recording in itself and wrote down which
 *           lesson it made
 *   date    the lesson says which day it was recorded
 *   time    the lesson's link carries the moment the recording started
 *   link    the two addresses do happen to be the same
 *   order   whatever is left in a section, oldest lesson to oldest class
 *           recording, and only when there are exactly as many of one as the
 *           other and the result runs in date order with the rest
 *
 * `lessons`: [{ id, moduleId, position, title, recordedOn, videoRef }]
 * `recordings`: what listRecordings returns
 * `sources`: [{ zoomId, moduleId }]  which webinar's recordings belong in which section
 * `imports`: [{ lessonId, uuid, fileId }]  recordings the portal brought in itself
 * `taken`: Set of "uuid:fileId" already playing in some other lesson
 */
export function matchRecordings({ lessons, recordings, sources, imports = [], taken = new Set() }) {
  const key = (r) => `${r.uuid}:${r.fileId}`;
  const meetingsOf = new Map();
  for (const source of sources) {
    if (!source.moduleId) continue;
    if (!meetingsOf.has(source.moduleId)) meetingsOf.set(source.moduleId, new Set());
    meetingsOf.get(source.moduleId).add(String(source.zoomId));
  }
  const out = new Map(lessons.map((lesson) => [lesson.id, { lessonId: lesson.id, recording: null, by: null, reason: null }]));
  const used = new Set(taken);
  const give = (lesson, recording, by) => {
    out.set(lesson.id, { lessonId: lesson.id, recording, by, reason: null });
    used.add(key(recording));
  };
  const free = (lesson) => !out.get(lesson.id).recording;

  const byModule = new Map();
  for (const lesson of lessons) {
    if (!byModule.has(lesson.moduleId)) byModule.set(lesson.moduleId, []);
    byModule.get(lesson.moduleId).push(lesson);
  }

  for (const [moduleId, group] of byModule) {
    const meetings = meetingsOf.get(moduleId);
    if (!meetings) {
      for (const lesson of group) out.get(lesson.id).reason = 'No Zoom webinar is set to feed this section, so there is nothing to match its lessons to.';
      continue;
    }
    const pool = recordings
      .filter((r) => meetings.has(String(r.meetingId)) && (r.durationSeconds || 0) >= SHORTEST_CLASS_SECONDS)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    const open = () => pool.filter((r) => !used.has(key(r)));
    const ordered = [...group].sort((a, b) => a.position - b.position);

    for (const lesson of ordered) {
      const record = imports.find((row) => row.lessonId === lesson.id);
      const hit = record && open().find((r) => r.uuid === record.uuid && r.fileId === record.fileId);
      if (hit) give(lesson, hit, 'import');
    }
    for (const lesson of ordered.filter(free)) {
      if (!lesson.recordedOn) continue;
      const day = String(lesson.recordedOn).slice(0, 10);
      const same = open().filter((r) => dublinDay(r.startedAt) === day);
      if (same.length === 1) give(lesson, same[0], 'date');
    }
    for (const lesson of ordered.filter(free)) {
      const at = Number(String(lesson.videoRef || '').match(/[?&]startTime=(\d{12,14})/)?.[1] || 0);
      if (!at) continue;
      const near = open().filter((r) => Math.abs(new Date(r.startedAt).getTime() - at) < 15 * 60 * 1000);
      if (near.length === 1) give(lesson, near[0], 'time');
    }
    for (const lesson of ordered.filter(free)) {
      const same = open().filter((r) => r.shareUrl && plainUrl(r.shareUrl) === plainUrl(lesson.videoRef));
      if (same.length === 1) give(lesson, same[0], 'link');
    }

    const left = ordered.filter(free);
    const spare = open();
    if (!left.length) continue;
    let paired = false;
    if (left.length === spare.length) {
      /* Lay the guess beside what is already certain and read down the section:
         the dates must only ever go forward. If they do not, the guess is wrong
         somewhere and none of it is used. */
      const trial = new Map(left.map((lesson, index) => [lesson.id, spare[index]]));
      const dates = ordered.map((lesson) => (trial.get(lesson.id) || out.get(lesson.id).recording)?.startedAt).filter(Boolean);
      const forward = dates.every((date, index) => index === 0 || dates[index - 1] < date);
      if (forward) {
        left.forEach((lesson, index) => give(lesson, spare[index], 'order'));
        paired = true;
      }
    }
    if (!paired) {
      const why = left.length === spare.length
        ? 'Its place in the section does not line up with the dates of the recordings.'
        : `There ${spare.length === 1 ? 'is 1 class recording' : `are ${spare.length} class recordings`} on Zoom not yet in a lesson and ${left.length} lesson${left.length === 1 ? '' : 's'} to match, so it is not certain which is which.`;
      for (const lesson of left) out.get(lesson.id).reason = why;
    }
  }
  return lessons.map((lesson) => out.get(lesson.id));
}

/** Every lesson still on a Zoom link, with the recording it would be moved from and how far along it is. */
export async function moveCandidates() {
  const lessons = (await query(
    `SELECT l.id, l.module_id, l.position, l.title, to_char(l.recorded_on,'YYYY-MM-DD') recorded_on, l.video_provider, l.video_ref, l.duration_seconds,
            m.title module_title, c.title course_title,
            v.status move_status, v.error move_error, v.started_at move_started_at, v.finished_at move_finished_at,
            v.zoom_started_at move_zoom_started_at, v.bytes move_bytes
     FROM course_lessons l
     JOIN course_modules m ON m.id=l.module_id
     JOIN courses c ON c.id=m.course_id
     LEFT JOIN lesson_video_moves v ON v.lesson_id=l.id
     WHERE l.video_provider='zoom' OR v.lesson_id IS NOT NULL
     ORDER BY c.position, m.position, l.position`,
  )).rows;
  const waiting = lessons.filter((lesson) => lesson.video_provider === 'zoom');

  let matches = new Map();
  let zoomError = null;
  if (waiting.length && movesConfigured()) {
    try {
      const [recordings, sources, imports, moved] = await Promise.all([
        listRecordings({ months: 12 }),
        query('SELECT zoom_id, module_id FROM zoom_sources'),
        query(`SELECT lesson_id, zoom_uuid, zoom_file_id FROM zoom_imports WHERE lesson_id IS NOT NULL`),
        query(`SELECT i.zoom_uuid, i.zoom_file_id FROM zoom_imports i JOIN course_lessons l ON l.id=i.lesson_id WHERE l.video_provider<>'zoom'
               UNION SELECT zoom_uuid, zoom_file_id FROM lesson_video_moves WHERE status='done'`),
      ]);
      const result = matchRecordings({
        lessons: waiting.map((l) => ({ id: l.id, moduleId: l.module_id, position: l.position, title: l.title, recordedOn: l.recorded_on || null, videoRef: l.video_ref })),
        recordings,
        sources: sources.rows.map((s) => ({ zoomId: s.zoom_id, moduleId: s.module_id })),
        imports: imports.rows.map((i) => ({ lessonId: i.lesson_id, uuid: i.zoom_uuid, fileId: i.zoom_file_id })),
        taken: new Set(moved.rows.map((row) => `${row.zoom_uuid}:${row.zoom_file_id}`)),
      });
      matches = new Map(result.map((row) => [row.lessonId, row]));
    } catch (error) {
      zoomError = error.message;
    }
  }

  return {
    configured: movesConfigured(),
    running: Boolean(working),
    zoomError,
    lessons: lessons.map((lesson) => {
      const match = matches.get(lesson.id);
      return {
        lessonId: lesson.id,
        title: lesson.title,
        course: lesson.course_title,
        section: lesson.module_title,
        onZoom: lesson.video_provider === 'zoom',
        recording: match?.recording ? {
          uuid: match.recording.uuid,
          fileId: match.recording.fileId,
          startedAt: match.recording.startedAt,
          durationSeconds: match.recording.durationSeconds,
          fileSize: match.recording.fileSize,
        } : null,
        matchedBy: match?.by || null,
        reason: match?.reason || null,
        move: lesson.move_status ? {
          status: lesson.move_status,
          error: lesson.move_error,
          startedAt: lesson.move_started_at,
          finishedAt: lesson.move_finished_at,
          recordedAt: lesson.move_zoom_started_at,
          bytes: lesson.move_bytes ? Number(lesson.move_bytes) : null,
        } : null,
      };
    }),
  };
}

/**
 * Queues the lessons asked for (or every one that has a match) and starts the
 * worker. Returns at once: nine class recordings take several minutes to copy
 * and longer to encode, which is no length for a web request to stay open.
 */
export async function startMoves({ lessonIds = null, actorId = null } = {}) {
  if (!movesConfigured()) {
    throw Object.assign(new Error('Connect the Zoom account and the Bunny Stream library first, under Settings.'), { status: 503 });
  }
  const state = await moveCandidates();
  if (state.zoomError) throw Object.assign(new Error(`Zoom could not be asked for its recordings: ${state.zoomError}`), { status: 502 });
  const wanted = state.lessons.filter((row) => row.onZoom && row.recording
    && (!lessonIds || lessonIds.includes(row.lessonId))
    && !['queued', 'copying', 'encoding'].includes(row.move?.status));
  let queued = 0;
  for (const row of wanted) {
    const lesson = await one('SELECT video_provider, video_ref, video_passcode FROM course_lessons WHERE id=$1', [row.lessonId]);
    if (!lesson || lesson.video_provider !== 'zoom') continue;
    await query(
      `INSERT INTO lesson_video_moves(lesson_id,zoom_uuid,zoom_file_id,zoom_started_at,previous_provider,previous_ref,previous_passcode,bytes,status,actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9)
       ON CONFLICT (lesson_id) DO UPDATE SET zoom_uuid=EXCLUDED.zoom_uuid, zoom_file_id=EXCLUDED.zoom_file_id,
         zoom_started_at=EXCLUDED.zoom_started_at, previous_provider=EXCLUDED.previous_provider, previous_ref=EXCLUDED.previous_ref,
         previous_passcode=EXCLUDED.previous_passcode, bytes=EXCLUDED.bytes, bunny_ref=NULL, status='queued', error=NULL,
         actor_id=EXCLUDED.actor_id, started_at=now(), finished_at=NULL
       WHERE lesson_video_moves.status IN ('failed','done')`,
      [row.lessonId, row.recording.uuid, row.recording.fileId, row.recording.startedAt, lesson.video_provider, lesson.video_ref, lesson.video_passcode, row.recording.fileSize || null, actorId],
    );
    queued += 1;
  }
  kick();
  return { queued };
}

/* One worker, one recording at a time: each is a few hundred megabytes passing
   through a small server, and two at once gains nothing but risk. */
let working = null;
function kick() {
  if (working) return;
  working = work()
    .catch((error) => console.error('Lesson video moves stopped', error))
    .finally(() => { working = null; });
}

const fail = (lessonId, error) => query(
  `UPDATE lesson_video_moves SET status='failed', error=$2, finished_at=now() WHERE lesson_id=$1`,
  [lessonId, String(error?.message || error).slice(0, 500)],
);

async function work() {
  let recordings = null;
  for (;;) {
    const row = await one(
      `UPDATE lesson_video_moves SET status='copying', started_at=now()
       WHERE lesson_id=(SELECT lesson_id FROM lesson_video_moves WHERE status='queued' ORDER BY zoom_started_at NULLS LAST LIMIT 1)
       RETURNING *`,
    );
    if (!row) break;
    let videoId = null;
    try {
      // Asked of Zoom here, not kept from the request: a download address is a credential.
      recordings ||= await listRecordings({ months: 12 });
      const recording = recordings.find((r) => r.uuid === row.zoom_uuid && r.fileId === row.zoom_file_id);
      if (!recording) throw new Error('That recording is no longer on the Zoom account.');
      const lesson = await one('SELECT title FROM course_lessons WHERE id=$1', [row.lesson_id]);
      if (!lesson) throw new Error('The lesson has been deleted.');
      const when = new Intl.DateTimeFormat('en-IE', { dateStyle: 'full', timeZone: config.defaultTimezone }).format(new Date(recording.startedAt));
      videoId = await createVideo(`${lesson.title}, ${when}`);
      await query('UPDATE lesson_video_moves SET bunny_ref=$2 WHERE lesson_id=$1', [row.lesson_id, `${config.bunny.libraryId}/${videoId}`]);
      const { stream, size } = await downloadRecording(recording.downloadUrl);
      await uploadVideo(videoId, stream, size || recording.fileSize);
      await query(`UPDATE lesson_video_moves SET status='encoding', bytes=COALESCE($2,bytes) WHERE lesson_id=$1`, [row.lesson_id, size || recording.fileSize || null]);
    } catch (error) {
      console.error('Lesson video move failed', row.lesson_id, error.message);
      if (videoId) await deleteVideo(videoId).catch(() => {});
      await fail(row.lesson_id, error);
    }
  }
  /* Then wait for Bunny. Checked every half minute for up to an hour and a
     half; whatever is still encoding after that is picked up by the hourly
     sweep, which calls finishMoves too. */
  for (let round = 0; round < 180; round += 1) {
    const left = await finishMoves();
    if (!left) break;
    await new Promise((resolve) => { setTimeout(resolve, 30 * 1000); });
    if ((await one(`SELECT 1 ok FROM lesson_video_moves WHERE status='queued' LIMIT 1`))) return work();
  }
  return undefined;
}

/**
 * Switches over every lesson whose copy has finished encoding. Returns how
 * many are still waiting.
 */
export async function finishMoves() {
  if (!bunnyConfigured()) return 0;
  const rows = (await query(`SELECT * FROM lesson_video_moves WHERE status='encoding' AND bunny_ref IS NOT NULL`)).rows;
  let waiting = 0;
  for (const row of rows) {
    const videoId = row.bunny_ref.split('/')[1];
    let video;
    try { video = await getBunnyVideo(videoId); } catch (error) { waiting += 1; console.error('Bunny status unreadable', videoId, error.message); continue; }
    if (video.failed) { await fail(row.lesson_id, new Error('Bunny Stream could not encode this recording.')); continue; }
    if (!video.playable) { waiting += 1; continue; }
    /* Only if the lesson still points where it did when the move began. If
       somebody has changed the lesson's video since, theirs stands. */
    const switched = await one(
      `UPDATE course_lessons SET video_provider='bunny', video_ref=$2, video_passcode=NULL,
              duration_seconds=COALESCE(NULLIF($3::int,0), duration_seconds), updated_at=now()
       WHERE id=$1 AND video_provider=$4 AND video_ref=$5 RETURNING id`,
      [row.lesson_id, row.bunny_ref, video.durationSeconds || 0, row.previous_provider, row.previous_ref],
    );
    if (!switched) {
      await fail(row.lesson_id, new Error('The lesson’s video was changed while the copy was being made, so the lesson was left as it is.'));
      continue;
    }
    await query(`UPDATE lesson_video_moves SET status='done', error=NULL, finished_at=now() WHERE lesson_id=$1`, [row.lesson_id]);
    await audit({
      actorId: row.actor_id, action: 'lesson.video_moved_to_bunny', entityType: 'lesson', entityId: row.lesson_id,
      metadata: { from: row.previous_ref, to: row.bunny_ref, zoomUuid: row.zoom_uuid },
    });
  }
  return waiting;
}

/* A copy runs inside this server and cannot outlive it. Anything that was
   mid-copy when the server stopped is marked failed, to be asked for again;
   it is not retried by itself, in case the copy is what stopped the server.
   What was only waiting its turn carries on. */
export async function resumeMoves() {
  const cut = (await query(
    `UPDATE lesson_video_moves SET status='failed', error='Interrupted when the portal restarted. Press the button to try it again.', finished_at=now()
     WHERE status='copying' RETURNING bunny_ref`,
  )).rows;
  for (const row of cut) {
    const videoId = row.bunny_ref?.split('/')[1];
    if (videoId && bunnyConfigured()) await deleteVideo(videoId).catch(() => {});
  }
  const pending = await one(`SELECT count(*)::int n FROM lesson_video_moves WHERE status IN ('queued','encoding')`);
  if (pending?.n && movesConfigured()) kick();
  return { interrupted: cut.length, pending: pending?.n || 0 };
}
