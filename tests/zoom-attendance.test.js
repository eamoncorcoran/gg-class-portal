import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Attendance read from Zoom, and recordings that land in the right course.
   ------------------------------------------------------------------
   Each class's Zoom link names its webinar; Zoom's report of a sitting is
   matched against the class and written as the week's attendance. What is
   pinned here: how a participant is matched (email, a remembered name, a
   name nobody else has), how spells in the room add up, that a hand-set row
   is never overwritten, that a watched webinar's section must belong to the
   class, and that the credentials live in Settings. */

const { matchStudent, aggregateParticipants, LIVE_MINUTES } = await import('../src/zoomattendance.js');
const { recordingTitle } = await import('../src/zoomimport.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const attendance = read('../src/zoomattendance.js');
const zoom = read('../src/zoom.js');
const hook = read('../src/routes/zoomhook.js');
const admin = read('../src/routes/admin.js');
const settingsRoutes = read('../src/routes/settings.js');
const migration = read('../migrations/054_zoom_attendance.sql');
const app = read('../public/app.js');
const scheduler = read('../src/zoomscheduler.js');

const roster = {
  students: [
    { id: 'a', name: 'Aoife Ní Bhriain', email: 'aoife+class@example.com', active: true, enrolled_at: '2026-09-01' },
    { id: 'b', name: 'Seán Ó Sé', email: 'sean@example.com', active: true, enrolled_at: '2026-09-01' },
    { id: 'c', name: 'Mary Byrne', email: 'mary@example.com', active: true, enrolled_at: '2026-09-01' },
    { id: 'd', name: 'Mary Byrne', email: 'mary.b@example.com', active: true, enrolled_at: '2026-09-01' },
  ],
  identities: new Map([['name:maire ni bhriain', 'a'], ['email:other@example.com', 'b']]),
};

test('a Zoom participant is matched by email, then a remembered name, then a name nobody else has', () => {
  assert.equal(matchStudent({ name: 'x', email: 'Sean@Example.com' }, roster)?.id, 'b', 'email, whatever the case');
  assert.equal(matchStudent({ name: 'x', email: 'aoife@example.com' }, roster)?.id, 'a', 'the plain mailbox of a plus-address');
  assert.equal(matchStudent({ name: 'x', email: 'other@example.com' }, roster)?.id, 'b', 'an email the teacher matched before');
  assert.equal(matchStudent({ name: 'Máire Ní Bhriain', email: '' }, roster)?.id, 'a', 'a name the teacher matched before, fadas or not');
  assert.equal(matchStudent({ name: 'seán ó sé', email: '' }, roster)?.id, 'b', 'the name itself when only one student carries it');
  assert.equal(matchStudent({ name: 'Mary Byrne', email: '' }, roster), null, 'two students with the name: nobody is guessed');
  assert.equal(matchStudent({ name: 'Nobody Here', email: 'nobody@example.com' }, roster), null);
});

test('spells in the room add up per person and the waiting room does not count', () => {
  const people = aggregateParticipants([
    { name: 'Aoife', email: 'aoife@example.com', seconds: 600, joinedAt: '2026-10-05T18:00:00Z', leftAt: '2026-10-05T18:10:00Z', status: 'in_meeting' },
    { name: 'Aoife', email: 'AOIFE@example.com', seconds: 1500, joinedAt: '2026-10-05T18:12:00Z', leftAt: '2026-10-05T18:37:00Z', status: 'in_meeting' },
    { name: 'Seán', email: '', seconds: 2400, joinedAt: '2026-10-05T18:01:00Z', leftAt: '2026-10-05T18:41:00Z', status: 'in_meeting' },
    { name: 'Seán', email: '', seconds: 300, joinedAt: '2026-10-05T17:55:00Z', leftAt: '2026-10-05T18:00:00Z', status: 'in_waiting_room' },
  ]);
  assert.equal(people.length, 2);
  const aoife = people.find((p) => p.email === 'aoife@example.com');
  assert.equal(aoife.minutes, 35);
  assert.equal(aoife.joinedAt, '2026-10-05T18:00:00Z');
  assert.equal(aoife.leftAt, '2026-10-05T18:37:00Z');
  assert.equal(people.find((p) => p.name === 'Seán').minutes, 40);
  assert.equal(LIVE_MINUTES, 30);
});

test('the week is written from every sitting in it, and a hand-set row is left alone', () => {
  assert.match(attendance, /SELECT participants FROM zoom_sittings WHERE class_id=\$1 AND week_id=\$2/);
  assert.match(attendance, /minutes >= liveMinutes \? 'live' : minutes > 0 \? 'partial' : 'missed'/);
  assert.match(attendance, /WHERE attendance\.source <> 'manual'/);
  // A student enrolled after the sitting is not marked missed for it.
  assert.match(attendance, /const onRoster = s\.active && \(!s\.enrolled_at \|\| new Date\(s\.enrolled_at\) < weekEnd\);/);
  // The host is not a student.
  assert.match(attendance, /\.filter\(\(p\) => !\(host && p\.email === host\)\)/);
});

test('Zoom is asked for past sittings webinar first, meetings second, uuids encoded as Zoom wants', () => {
  assert.match(zoom, /\/past_webinars\/\$\{id\}\/instances/);
  assert.match(zoom, /\/past_meetings\/\$\{id\}\/instances/);
  assert.match(zoom, /\/report\/\$\{kind === 'meeting' \? 'meetings' : 'webinars'\}\/\$\{encodeUuid\(uuid\)\}\/participants/);
  assert.match(zoom, /\(s\.startsWith\('\/'\) \|\| s\.includes\('\/\/'\)\) \? encodeURIComponent\(once\) : once/);
  assert.match(zoom, /next_page_token/);
  // The account's credentials come from Settings, the environment as fallback.
  assert.match(zoom, /import \{ getZoomApiConfig \} from '\.\/settings\.js'/);
  assert.match(zoom, /export async function refreshZoomApi\(\)/);
  assert.match(settingsRoutes, /router\.put\('\/zoomapi'/);
  assert.match(settingsRoutes, /await refreshZoomApi\(\);/);
  assert.match(read('../server.js'), /await refreshZoomApi\(\);\s*startZoomScheduler\(\);/);
});

test('the end of a webinar asks for its attendance, and the sweep catches what the webhook missed', () => {
  assert.match(hook, /payload\.event === 'webinar\.ended' \|\| payload\.event === 'meeting\.ended'/);
  assert.match(hook, /syncForZoomId\(zoomId\)/);
  assert.match(attendance, /export async function syncForZoomId\(zoomId, \{ delayMs = 10 \* 60 \* 1000 \}/);
  assert.match(scheduler, /await syncAttendance\(\)/);
});

test('the attendance routes are the teacher’s, and a watched webinar’s section must be the class’s own', () => {
  assert.match(admin, /router\.get\('\/zoom\/attendance'/);
  assert.match(admin, /router\.post\('\/zoom\/attendance\/sync'/);
  assert.match(admin, /router\.post\('\/zoom\/attendance\/identity'/);
  assert.match(admin, /router\.post\('\/zoom\/attendance\/rematch'/);
  assert.match(admin, /c\.class_id=\$2 OR EXISTS \(SELECT 1 FROM course_classes cc WHERE cc\.course_id=c\.id AND cc\.class_id=\$2\)/);
  assert.match(admin, /so its students would never see the recording/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS zoom_sittings/);
  assert.match(migration, /zoom_uuid text NOT NULL UNIQUE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS zoom_identities/);
  assert.match(migration, /ALTER TABLE zoom_sources ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false/);
});

test('a recording is linked where it cannot be moved, and a published one is titled with its date', () => {
  const imp = read('../src/zoomimport.js');
  assert.match(imp, /export const importConfigured = \(\) => zoomConfigured\(\);/);
  assert.match(imp, /const moving = bunnyConfigured\(\);/);
  assert.match(imp, /provider === 'zoom' \? \(recording\.passcode \|\| null\) : null/);
  assert.match(imp, /publish: Boolean\(source\.auto_publish\), title: recordingTitle\(recording, source\)/);
  assert.equal(recordingTitle({ startedAt: '2026-10-13T18:30:00Z' }, { label: 'Irish for Primary Teaching' }), 'Irish for Primary Teaching, Tuesday 13 October 2026');
  assert.equal(recordingTitle({ startedAt: null }, {}), 'Class recording');
  assert.match(zoom, /shareUrl: meeting\.share_url \|\| file\.play_url \|\| ''/);
});

test('the admin has the Zoom account card, the From Zoom attendance card and a class-aware import rule', () => {
  for (const id of ['zoomapi-account-id', 'zoomapi-client-id', 'zoomapi-client-secret', 'zoomapi-webhook-secret', 'test-zoomapi', 'zoom-attendance', 'zoom-att-sync', 'zi-rule-class']) {
    assert.ok(app.includes(`id="${id}"`), `#${id} is on the page`);
  }
  assert.match(app, /\/api\/admin\/zoom\/attendance\/identity/);
  assert.match(app, /autoPublish: form\.autoPublish\.checked/);
  assert.match(app, /if \(!status\.zoom\) \{/, 'the account alone is needed; Bunny is optional');
  // Nothing written for this lands with an em dash in it.
  const mine = app.slice(app.indexOf('function zoomAccountCard()'), app.indexOf('function dictationSettingsCard()')) + app.slice(app.indexOf('async function renderZoomAttendance()'), app.indexOf('function bindReminderSettings()'));
  assert.doesNotMatch(mine, /\u2014/, 'no em dashes in the new cards');
});
