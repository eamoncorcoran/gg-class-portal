import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Files behind the authenticated media routes.
   ------------------------------------------------------------------
   Every lesson attachment returned 500 — to teachers as well as students, on
   every file ever attached to a lesson. The query asked `courses` for a
   class_id, which was true when a course belonged to one class and stopped
   being true when courses became many-to-many. The column went and the query
   did not, and nothing called the route, so nothing said so.

   The lesson is what comes back now, and who may open it is decided by the same
   rule the rest of the courses use. */

const media = fs.readFileSync(new URL('../src/routes/media.js', import.meta.url), 'utf8');
const courses = fs.readFileSync(new URL('../src/courses.js', import.meta.url), 'utf8');

test('no media query asks a course for a column it does not have', () => {
  /* courses has no class_id. Any join aliasing it and selecting class_id off
     that alias is the bug that was here, whatever it is renamed to. */
  const joins = [...media.matchAll(/JOIN\s+courses\s+(\w+)/gi)].map((match) => match[1]);
  for (const alias of joins) {
    assert.doesNotMatch(media, new RegExp(`\\b${alias}\\.class_id\\b`),
      `media.js selects ${alias}.class_id, and courses has no class_id`);
  }
});

test('lesson attachments are gated by the rule the courses themselves use', () => {
  assert.match(media, /import \{ studentCanSeeLesson \}/,
    'the shared rule has to be the one used');
  assert.match(media, /studentCanSeeLesson\(\{ lessonId:/,
    'and actually called, rather than reimplemented alongside');
  /* The rule it must agree with: published, and either open to everybody or
     offered to a class the student is on. Written once, in courses.js. */
  assert.match(courses, /open_to_all = true/);
  assert.match(courses, /course_classes cc/);
});

test('the board and the courses are gated by their own rules, not one blurred rule', () => {
  const route = media.slice(media.indexOf("router.get('/attachment/:kind/:id'"));
  const body = route.slice(0, route.indexOf('\n}));'));
  assert.match(body, /if \(row\.lesson_id\)/, 'a lesson is decided one way');
  assert.match(body, /class_students/, 'and a board post the other');
});
