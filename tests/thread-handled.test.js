import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { forStudentView } from '../src/community.js';

/* The teacher's open/closed tick on a board post.
   ------------------------------------------------------------------
   A private note for the teacher: dealt with, or still needing a look. It is
   not the lock (`locked`), which students notice. A student never receives it,
   and a student writing in a closed conversation opens it again. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('a student’s copy of a post never carries the teacher’s tick', () => {
  const out = forStudentView({ id: 'x', title: 'Hi', handled_at: '2026-11-21T10:00:00Z', ai_draft: 'secret', locked: false });
  assert.equal('handled_at' in out, false);
  assert.equal('ai_draft' in out, false);
  assert.equal(out.locked, false);
  const student = read('../src/routes/student.js');
  assert.match(student, /res\.status\(201\)\.json\(forStudentView\(row\)\)/, 'the post a student has just written comes back stripped too');
  assert.doesNotMatch(read('../src/routes/hub.js'), /handled/);
});

test('a student writing in a closed conversation reopens it; the teacher writing does not', () => {
  const community = read('../src/community.js');
  assert.match(community, /handled_at = CASE WHEN EXISTS \(SELECT 1 FROM users WHERE id=\$2 AND role='student'\) THEN NULL ELSE handled_at END/);
});

test('the teacher sets it through the same PATCH as pin and lock, and the column exists', () => {
  const admin = read('../src/routes/admin.js');
  assert.match(admin, /handled: z\.boolean\(\)\.optional\(\)/);
  assert.match(admin, /handled_at=\$4/);
  assert.match(read('../migrations/066_thread_handled.sql'), /ADD COLUMN IF NOT EXISTS handled_at timestamptz/);
});
