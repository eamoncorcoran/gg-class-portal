/**
 * Bring the live classroom's lessons across from its JSON store.
 *
 *   node scripts/import-live-lessons.js ~/gg-live-dashboard/data/lessons.json ~/gg-live-dashboard/uploads
 *
 * Lessons keep their ids, so course lessons already filed as practice lessons
 * keep working. A lesson that already exists in the portal is updated. Videos
 * are copied into the portal's own video folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { pool, query, one } from '../src/db.js';
import { VIDEO_DIR, cleanPhrases } from '../src/live/lessons.js';

const [file, uploads] = process.argv.slice(2);
if (!file) { console.error('Usage: node scripts/import-live-lessons.js <lessons.json> [uploadsDir]'); process.exit(1); }
const lessons = JSON.parse(fs.readFileSync(file, 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let imported = 0, videos = 0;
for (const l of Array.isArray(lessons) ? lessons : []) {
  const id = String(l.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (!id) continue;
  let videoId = String(l.videoId || '').replace(/[^a-z0-9.-]/gi, '');
  if (videoId && uploads) {
    const src = path.join(uploads, videoId);
    if (fs.existsSync(src)) { fs.mkdirSync(VIDEO_DIR, { recursive: true }); fs.copyFileSync(src, path.join(VIDEO_DIR, videoId)); videos += 1; }
    else { console.warn(`  video missing for "${l.title}": ${videoId}`); videoId = ''; }
  } else if (videoId) videoId = '';
  // A course by id when the studio filed it so; otherwise by name, if the portal has one.
  let courseId = UUID.test(String(l.courseId || '')) ? l.courseId : null;
  if (courseId && !(await one('SELECT 1 FROM courses WHERE id=$1', [courseId]))) courseId = null;
  if (!courseId && l.course) courseId = (await one('SELECT id FROM courses WHERE lower(title)=lower($1)', [String(l.course)]))?.id || null;
  await query(
    `INSERT INTO live_lessons(id,title,course,course_id,video_id,video_type,phrases,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0))
     ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, course=EXCLUDED.course, course_id=COALESCE(EXCLUDED.course_id, live_lessons.course_id),
       video_id=EXCLUDED.video_id, video_type=EXCLUDED.video_type, phrases=EXCLUDED.phrases, updated_at=EXCLUDED.updated_at`,
    [id, String(l.title || 'Untitled lesson').slice(0, 120), String(l.course || '').slice(0, 120), courseId, videoId,
      String(l.videoType || '').slice(0, 60), JSON.stringify(cleanPhrases(l.phrases)), Number(l.createdAt) || Date.now(), Number(l.updatedAt) || Date.now()]);
  imported += 1;
  console.log(`  ${id}  ${l.title}  (${(l.phrases || []).length} phrases${videoId ? ', video' : ''}${courseId ? ', course ' + courseId.slice(0, 8) : ''})`);
}
console.log(`${imported} lesson(s) imported, ${videos} video(s) copied.`);
await pool.end();
