import { query } from './db.js';
import { listRecordings, zoomConfigured } from './zoom.js';

/**
 * The Zoom share link under every lesson that came from a Zoom class.
 *
 * The recording plays inside the hub, but when that player will not play the
 * student needs somewhere else to go: the recording on Zoom's own page. New
 * imports and moves keep the link as they go; this fills it in for the lessons
 * made before it was kept, by asking Zoom for its recordings and matching them
 * to the import records by the recording's own ids. Nothing is overwritten:
 * a lesson that already has a link is left alone.
 */
export async function fillZoomLinks({ recordings = null, months = 12, q = query } = {}) {
  const missing = await q(
    `SELECT l.id, i.zoom_uuid, i.zoom_file_id
       FROM course_lessons l JOIN zoom_imports i ON i.lesson_id = l.id
      WHERE l.zoom_link IS NULL AND i.status = 'done'`,
  );
  if (!missing.rows.length) return { filled: 0, missing: 0 };
  if (!recordings) {
    if (!zoomConfigured()) return { filled: 0, missing: missing.rows.length, reason: 'Zoom is not connected' };
    recordings = await listRecordings({ months });
  }
  const byFile = new Map(recordings.map((r) => [`${r.uuid}:${r.fileId}`, r]));
  const byMeeting = new Map();
  for (const r of recordings) if (!byMeeting.has(r.uuid)) byMeeting.set(r.uuid, r);
  let filled = 0;
  for (const row of missing.rows) {
    const found = byFile.get(`${row.zoom_uuid}:${row.zoom_file_id}`) || byMeeting.get(row.zoom_uuid);
    if (!found?.shareUrl) continue;
    await q(
      'UPDATE course_lessons SET zoom_link=$2, zoom_link_passcode=$3 WHERE id=$1 AND zoom_link IS NULL',
      [row.id, found.shareUrl, found.passcode || null],
    );
    filled += 1;
  }
  return { filled, missing: missing.rows.length - filled };
}
