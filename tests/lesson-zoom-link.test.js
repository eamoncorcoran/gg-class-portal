import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fillZoomLinks } from '../src/zoomlinks.js';

/* "Open Class via Zoom Link" under every lesson that came from a Zoom class.
   ------------------------------------------------------------------
   The recording plays inside the hub. When that player will not play, the
   student is given the recording's own page on Zoom, with its passcode. The
   link is kept on the lesson: the import and the move keep it as they go,
   and a sweep fills it in on lessons made before it was kept. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the lesson keeps the Zoom share link, from the import and from a move', () => {
  const migration = read('../migrations/064_lesson_zoom_links.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS zoom_link text/);
  assert.match(migration, /FROM lesson_video_moves m\s+WHERE m\.lesson_id = l\.id AND m\.previous_provider = 'zoom' AND l\.zoom_link IS NULL/);
  assert.match(read('../src/zoomimport.js'), /published,position,zoom_link,zoom_link_passcode\)/);
  assert.match(read('../src/lessonmoves.js'), /zoom_link=COALESCE\(zoom_link, \$6\)/);
});

test('the hub hands the link to somebody signed in, and the lesson page shows it under the player', () => {
  const hub = read('../src/routes/hub.js');
  assert.match(hub, /zoomLink: signedIn && l\.zoom_link \? \{ url: l\.zoom_link, passcode: l\.zoom_link_passcode \|\| undefined \} : undefined/);
  const page = read('../web/src/pages/courses-pages.tsx');
  assert.match(page, /\{l\.zoomLink && l\.video\?\.type !== "link" && <ZoomLinkRow link=\{l\.zoomLink\} \/>\}/, 'not shown twice on a lesson that is the Zoom link already');
  assert.match(page, /Open Class via Zoom Link/);
  assert.match(page, /target="_blank" rel="noreferrer"/);
});

test('the sweep matches lessons to recordings by the recording ids and never overwrites a link', async () => {
  const calls = [];
  const q = async (sql, params) => {
    calls.push([sql, params]);
    if (/SELECT l\.id, i\.zoom_uuid/.test(sql)) return { rows: [{ id: 'L1', zoom_uuid: 'u1', zoom_file_id: 'f1' }, { id: 'L2', zoom_uuid: 'u2', zoom_file_id: 'f9' }, { id: 'L3', zoom_uuid: 'u3', zoom_file_id: 'f3' }] };
    return { rows: [] };
  };
  const recordings = [
    { uuid: 'u1', fileId: 'f1', shareUrl: 'https://zoom.us/rec/share/one', passcode: 'abc' },
    { uuid: 'u2', fileId: 'f2', shareUrl: 'https://zoom.us/rec/share/two', passcode: '' },
  ];
  const out = await fillZoomLinks({ recordings, q });
  assert.deepEqual(out, { filled: 2, missing: 1 });
  const updates = calls.filter(([sql]) => /UPDATE course_lessons SET zoom_link/.test(sql));
  assert.equal(updates.length, 2);
  assert.match(updates[0][0], /WHERE id=\$1 AND zoom_link IS NULL/, 'a link already there stands');
  assert.deepEqual(updates[0][1], ['L1', 'https://zoom.us/rec/share/one', 'abc']);
  assert.deepEqual(updates[1][1], ['L2', 'https://zoom.us/rec/share/two', null], 'a recording of the same meeting matches by meeting when the file differs');
});
