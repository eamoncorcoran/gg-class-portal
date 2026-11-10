import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TIMETABLE, SLOTS, SLOTS_PER_EXAMINER, capacity, percentBooked, lowestFreeExaminer,
  slotStartsAt, examinersNeeded, planMoves, reminderDue, validDate,
} from '../src/mockoral.js';

/* Mock oral booking.
   ------------------------------------------------------------------
   Every examiner works the same day: seventeen twenty minute orals around two
   breaks and a lunch. A student picks a time and is handed an examiner, so a
   time stays open until every examiner has it filled. These pin the day itself,
   the sums the teacher plans by, and when a reminder goes out. */

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const moduleSource = read('../src/mockoral.js');
const routes = read('../src/routes/mockoral.js');
const email = read('../src/email.js');
const app = read('../public/app.js');
const page = read('../public/mock-oral.js');
const migration58 = read('../migrations/058_mock_oral_public_booking.sql');
const server = read('../server.js');
const migration = read('../migrations/057_mock_orals.sql');

test('the day is exactly the examiners\' schedule', () => {
  const day = TIMETABLE.map((row) => (row.kind === 'oral'
    ? `${row.start}-${row.end} Oral ${row.slot}`
    : `${row.start}-${row.end} ${row.label}`));
  assert.deepEqual(day, [
    '09:00-09:20 Oral 1', '09:20-09:40 Oral 2', '09:40-10:00 Oral 3', '10:00-10:20 Oral 4', '10:20-10:40 Oral 5',
    '10:40-11:00 Break',
    '11:00-11:20 Oral 6', '11:20-11:40 Oral 7', '11:40-12:00 Oral 8', '12:00-12:20 Oral 9', '12:20-12:40 Oral 10',
    '12:40-13:40 Lunch',
    '13:40-14:00 Oral 11', '14:00-14:20 Oral 12', '14:20-14:40 Oral 13', '14:40-15:00 Oral 14', '15:00-15:20 Oral 15',
    '15:20-15:40 Break',
    '15:40-16:00 Oral 16', '16:00-16:20 Oral 17',
  ]);
});

test('nobody can book a break: a break is not a slot at all', () => {
  assert.equal(SLOTS.length, 17);
  assert.equal(SLOTS_PER_EXAMINER, 17);
  assert.ok(SLOTS.every((slot) => slot.kind === 'oral'));
  const breakStarts = TIMETABLE.filter((row) => row.kind === 'break').map((row) => row.start);
  assert.deepEqual(breakStarts, ['10:40', '12:40', '15:20']);
  for (const start of breakStarts) assert.ok(!SLOTS.some((slot) => slot.start === start), `${start} must not be bookable`);
  // A booking names a slot by number, and the number has to be one of the seventeen.
  assert.match(moduleSource, /if \(!SLOTS\[slot - 1\]\) fail\(400/);
  assert.match(routes, /const slot = z\.number\(\)\.int\(\)\.min\(1\)\.max\(SLOTS_PER_EXAMINER\)/);
  assert.match(migration, /slot integer NOT NULL CHECK \(slot BETWEEN 1 AND 17\)/);
});

test('how many students a day caters for is examiners times seventeen', () => {
  assert.equal(capacity(1), 17);
  assert.equal(capacity(10), 170);
  assert.equal(capacity(0), 0);
  assert.equal(percentBooked(0, 10), 0);
  assert.equal(percentBooked(85, 10), 50);
  assert.equal(percentBooked(170, 10), 100);
  assert.equal(percentBooked(1, 10), 1, 'one booking in 170 is not shown as 0%');
  assert.equal(percentBooked(169, 10), 99, 'and one place left is not shown as full');
  assert.equal(percentBooked(5, 0), 0);
});

test('a time stays open until every examiner has it filled', () => {
  assert.equal(lowestFreeExaminer([], 3), 1);
  assert.equal(lowestFreeExaminer([1], 3), 2);
  assert.equal(lowestFreeExaminer([1, 2], 3), 3);
  assert.equal(lowestFreeExaminer([1, 2, 3], 3), null, 'full only when all three are taken');
  assert.equal(lowestFreeExaminer([2, 3], 3), 1, 'a cancelled place with Examiner 1 is the next one given out');
  assert.equal(lowestFreeExaminer([1, 3], 3), 2);
  const ten = Array.from({ length: 9 }, (_, index) => index + 1);
  assert.equal(lowestFreeExaminer(ten, 10), 10, 'nine of ten taken is still open');
});

test('an oral starts at Irish time, summer or winter', () => {
  assert.equal(slotStartsAt('2027-03-13', 1).toISOString(), '2027-03-13T09:00:00.000Z'); // winter time
  assert.equal(slotStartsAt('2027-04-10', 1).toISOString(), '2027-04-10T08:00:00.000Z'); // summer time
  assert.equal(slotStartsAt('2027-03-13', 11).toISOString(), '2027-03-13T13:40:00.000Z');
  assert.equal(slotStartsAt('2027-03-13', 17).toISOString(), '2027-03-13T16:00:00.000Z');
  assert.ok(validDate('2027-03-13'));
  assert.ok(!validDate('2027-02-30'));
  assert.ok(!validDate('13/03/2027'));
});

test('dropping an examiner moves their students to a free one at the same time', () => {
  const bookings = [
    { id: 'a', slot: 1, examiner: 1 }, { id: 'b', slot: 1, examiner: 3 },
    { id: 'c', slot: 2, examiner: 3 }, { id: 'd', slot: 5, examiner: 2 },
  ];
  assert.equal(examinersNeeded(bookings), 2);
  assert.deepEqual(planMoves(bookings, 3), []);
  assert.deepEqual(planMoves(bookings, 2), [{ id: 'b', from: 3, to: 2 }, { id: 'c', from: 3, to: 1 }]);
  assert.equal(planMoves(bookings, 1), null, 'two students at 9:00 cannot share one examiner');
  assert.equal(examinersNeeded([]), 0);
});

test('reminders: the day before and an hour before, never twice, never on top of the confirmation', () => {
  const start = new Date('2027-03-13T10:20:00Z');
  const hoursBefore = (hours) => new Date(start.getTime() - hours * 3600 * 1000);
  const longAgo = hoursBefore(24 * 14);
  const booking = { startsAt: start, createdAt: longAgo, dayReminderFor: null, hourReminderFor: null };

  assert.equal(reminderDue(booking, hoursBefore(30)), null, 'too early');
  assert.equal(reminderDue(booking, hoursBefore(24)), 'day');
  assert.equal(reminderDue(booking, hoursBefore(10)), 'day', 'still owed if the first cycle was missed');
  assert.equal(reminderDue(booking, hoursBefore(2)), null, 'not a "tomorrow" email two hours out');
  assert.equal(reminderDue(booking, hoursBefore(1)), 'hour');
  assert.equal(reminderDue(booking, hoursBefore(0.2)), 'hour');
  assert.equal(reminderDue(booking, hoursBefore(0)), null, 'nothing once it has started');
  assert.equal(reminderDue(booking, hoursBefore(-1)), null);

  assert.equal(reminderDue({ ...booking, dayReminderFor: start }, hoursBefore(20)), null, 'sent once');
  assert.equal(reminderDue({ ...booking, hourReminderFor: start }, hoursBefore(0.5)), null, 'sent once');
  assert.equal(reminderDue({ ...booking, dayReminderFor: start }, hoursBefore(0.5)), 'hour');

  // The oral moved to another date: the reminders sent for the old time do not count.
  const old = new Date('2027-03-06T10:20:00Z');
  assert.equal(reminderDue({ ...booking, dayReminderFor: old, hourReminderFor: old }, hoursBefore(20)), 'day');

  // Booked this morning for this afternoon: the confirmation said it all.
  assert.equal(reminderDue({ ...booking, createdAt: hoursBefore(5) }, hoursBefore(4)), null);
  assert.equal(reminderDue({ ...booking, createdAt: hoursBefore(5) }, hoursBefore(1)), 'hour');
  assert.equal(reminderDue({ ...booking, createdAt: hoursBefore(1.5) }, hoursBefore(1)), null);
});

test('a reminder is claimed before it is sent and handed back if the send fails', () => {
  const body = moduleSource.slice(moduleSource.indexOf('export async function runMockOralReminders'));
  assert.match(body, /SET \$\{column\}=starts_at\s+WHERE id=\$1 AND status='booked' AND \$\{column\} IS DISTINCT FROM starts_at RETURNING id/);
  assert.match(body, /if \(!claimed\) continue;/);
  assert.match(body, /SET \$\{column\}=NULL WHERE id=\$1/);
  assert.match(read('../src/reminders.js'), /await runMockOralReminders\(\)/, 'and the scheduler runs it');
});

test('two students cannot be given the same seat, and one student cannot hold two', () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_seat\s+ON mock_oral_bookings\(day_id, slot, examiner\) WHERE status='booked'/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_student\s+ON mock_oral_bookings\(day_id, student_id\) WHERE status='booked'/);
  const book = moduleSource.slice(moduleSource.indexOf('export async function book'), moduleSource.indexOf('export async function cancel'));
  assert.match(book, /pg_advisory_xact_lock/);
  assert.match(book, /FROM mock_oral_days WHERE id=\$1 FOR UPDATE/);
  assert.match(book, /if \(!day\.booking_open\) fail\(409/, 'a student cannot book a day that is not open');
  assert.match(book, /error\.code === '23505'/);
});

test('a student can cancel only their own booking, and only before it starts', () => {
  const cancel = moduleSource.slice(moduleSource.indexOf('export async function cancel'), moduleSource.indexOf('function classLabel'));
  // Theirs by the private link from the emails, or by their portal account. Nothing else.
  assert.match(cancel, /const theirs = Boolean\(token\) \|\| \(found\?\.student_id && found\.student_id === actor\?\.id\);/);
  assert.match(cancel, /if \(!found \|\| \(!asTeacher && !theirs\)\) fail\(404/);
  assert.match(cancel, /!asTeacher && new Date\(found\.starts_at\) <= new Date\(\)/);
  assert.match(cancel, /sendMockOralCancelled/);
});

test('the teacher\'s routes are the teacher\'s, and every change is audited', () => {
  assert.match(server, /app\.use\('\/api\/mock-oral', mockOralRoutes\)/);
  assert.match(routes, /router\.use\(requireAuth\)/);
  const admin = [...routes.matchAll(/router\.(get|post|patch|put|delete)\('(\/admin[^']*)',\s*(\w+)/g)];
  assert.ok(admin.length >= 9, 'the admin routes are all here');
  for (const [, , path, guard] of admin) assert.equal(guard, 'requireAdmin', `${path} must be admin only`);
  for (const path of ['/book', '/cancel']) {
    assert.match(routes, new RegExp(`router\\.post\\('${path}', requireStudent`));
  }
  for (const action of ['mock_oral.booked', 'mock_oral.cancelled', 'mock_oral.day_created', 'mock_oral.day_updated', 'mock_oral.day_deleted']) {
    assert.ok(routes.includes(`'${action}'`), `${action} is audited`);
  }
});

test('every mock oral email exists, and a booking or a cancellation is never held back', () => {
  for (const name of ['sendMockOralConfirmation', 'sendMockOralCancelled', 'sendMockOralChanged', 'sendMockOralReminder', 'sendMockOralDetails']) {
    assert.match(email, new RegExp(`export async function ${name}\\(`));
  }
  assert.match(email, /priority: type === 'mock_oral_reminder' \? 'deadline' : 'transactional'/);
  // The button in every email opens that one booking, with no sign-in in the way.
  assert.match(email, /const url = oral\.manageUrl \|\| `\$\{config\.appUrl\}\/mock-oral`;/);
  assert.match(moduleSource, /manageUrl: row\.manage_token \? `\$\{config\.appUrl\}\/mock-oral\?b=\$\{row\.manage_token\}` : ''/);
  assert.ok(!/cancel in the portal/.test(email.slice(email.indexOf('const ORAL_ZONE'))), 'nobody is sent to the portal to cancel');
});

test('no em dashes in anything a student or the teacher reads', () => {
  const emailCopy = email.slice(email.indexOf('const ORAL_ZONE'));
  const screens = app.slice(app.indexOf('/* Mock orals'), app.indexOf('/* Admin */'));
  assert.ok(screens.length > 5000);
  for (const [name, text] of [['emails', emailCopy], ['screens', screens], ['module', moduleSource], ['routes', routes]]) {
    assert.ok(!text.includes('—'), `${name} must not contain an em dash`);
  }
});

test('the screens: a student sees times, not examiners, and a full time cannot be pressed', () => {
  const picker = page.slice(page.indexOf('function pickView'), page.indexOf('function detailsView'));
  // A time that is full or gone is not listed at all, so everything shown can be pressed.
  assert.match(picker, /day\.slots\.filter\(\(slot\) => !slot\.full && !slot\.past\)/);
  assert.ok(!/examiner/i.test(picker), 'which examiner is free is not the student\'s question');
  assert.match(app, /state\.studentData\?\.mockOral \? studentNavButton\('mockoral'/, 'the tab is only there when there is something to book or booked');
  assert.match(app, /adminNavButton\('mockorals', svg\.mic, 'Mock orals'\)/);
  // The server never tells a student who is with which examiner, only how full a time is.
  const view = moduleSource.slice(moduleSource.indexOf('function bookableDay'), moduleSource.indexOf('export async function book'));
  assert.match(view, /return \{ slot: slot\.slot, start: slot\.start, end: slot\.end, full, past \}/);
});

/* On the calendar.
   ------------------------------------------------------------------
   A mock oral is a date, so it belongs on the calendars people already look at:
   the student's month, the teacher's month and the feed either of them has
   subscribed to on their phone. */

test('the feed draws a mock oral as the twenty minutes it runs, not as a deadline', async () => {
  const { buildCalendar, mockOralEvent, mockOralDayEvent } = await import('../src/calendar.js');
  const startsAt = slotStartsAt('2026-12-05', 5); // 10:20am in Ireland, which is UTC in December
  const mine = mockOralEvent({ id: 'b1', starts_at: startsAt, examiner: 3, examiner_name: 'Niamh', examiner_link: 'https://zoom.us/j/1', created_at: new Date('2026-11-10T10:00:00Z') });
  assert.equal(mine.title, 'Mock oral with Examiner 3 (Niamh)');
  assert.equal(new Date(mine.start).toISOString(), '2026-12-05T10:20:00.000Z');
  assert.equal(new Date(mine.due).toISOString(), '2026-12-05T10:40:00.000Z');
  assert.match(mine.description, /https:\/\/zoom\.us\/j\/1/);
  assert.match(mine.description, /\?go=mockoral/);

  const day = mockOralDayEvent({ id: 'd1', on_date: '2026-12-05', examiners: 3, booked: 14, booking_open: true, created_at: new Date('2026-11-10T10:00:00Z') });
  assert.equal(new Date(day.start).toISOString(), '2026-12-05T09:00:00.000Z');
  assert.equal(new Date(day.due).toISOString(), '2026-12-05T16:20:00.000Z');
  assert.match(day.description, /14 of 51 places booked with 3 examiners/);

  const ics = buildCalendar({ name: 'x', description: 'y', events: [mine, day] });
  assert.match(ics, /DTSTART:20261205T102000Z/);
  assert.match(ics, /DTEND:20261205T104000Z/);
  assert.match(ics, /Your mock oral is tomorrow/);
  assert.doesNotMatch(ics, /is due tomorrow/);
  assert.doesNotMatch(ics, /—/);
});

test('a cancelled booking drops out of the feed, and the calendars point at the mock oral', () => {
  const calendar = read('../src/calendar.js');
  assert.match(calendar, /b\.student_id=\$1 AND b\.status='booked'/);
  assert.match(calendar, /b\.status='booked'\) booked/);

  // The student's month: their own time once booked, the open days until then.
  assert.match(app, /calendar-event is-oral booked" data-student-view="mockoral"/);
  assert.match(app, />Book mock oral</);
  assert.match(moduleSource, /\{ booked: false, days: open\.rows\.map/);
  // Cancelling puts the day back on the calendar as bookable.
  assert.match(app, /mockOral = \{ booked: false, days: \(state\.mockOral\.days \|\| \[\]\)\.map/);

  // The teacher's month: one chip a day, which opens that day.
  assert.match(app, /data-mock-oral-day="\$\{day\.id\}"/);
  assert.match(app, /state\.mockOralDayId = button\.dataset\.mockOralDay;/);
  assert.match(app, /api\('\/api\/mock-oral\/admin'\)\.catch\(\(\) => null\)/);
});

/* Booking from a link.
   ------------------------------------------------------------------
   Students are sent a link. They pick a time and type their name and email,
   with no sign-in, the way they would on any booking page. So the page is
   public, and what it can be asked for has to be nothing about anybody else. */

test('the booking page needs no sign-in, and gives away nothing about other people', () => {
  const open = routes.slice(routes.indexOf("router.get('/public'"), routes.indexOf('router.use(requireAuth)'));
  assert.ok(open.length > 500, 'the public routes sit above the sign-in wall');
  for (const route of ["router.get('/public'", "router.post('/public/book'", "router.get('/public/booking/:token'", "router.post('/public/booking/:token/cancel'"]) {
    assert.ok(open.includes(route), `${route} is open`);
  }
  assert.ok(!/requireAuth|requireStudent|requireAdmin/.test(open));
  // Booking and cancelling are paced, since each one sends an email.
  assert.match(open, /router\.post\('\/public\/book', bookingLimiter/);
  assert.match(open, /router\.post\('\/public\/booking\/:token\/cancel', bookingLimiter/);

  // What the page is told about a day: times and whether each is free. No names, no emails, no counts.
  const view = moduleSource.slice(moduleSource.indexOf('function bookableDay'), moduleSource.indexOf('export async function publicBooking'));
  assert.match(view, /return \{ slot: slot\.slot, start: slot\.start, end: slot\.end, full, past \}/);
  assert.ok(!/student_name|student_email|b\.name|b\.email|u\.email|u\.name/.test(view));
  // The only booking it will show is the one whose private token was given.
  const own = moduleSource.slice(moduleSource.indexOf('export async function publicBooking'), moduleSource.indexOf('export async function studentView'));
  assert.match(own, /WHERE b\.manage_token=\$1/);
  // And the page itself asks for nothing else.
  const asked = [...page.matchAll(/api\((?:'|`)(\/api\/[^'`$?]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(asked)].sort(), ['/api/mock-oral/public', '/api/mock-oral/public/book', '/api/mock-oral/public/booking/']);
  assert.ok(!page.includes('—'), 'no em dashes on the booking page');
});

test('a booking carries its own name and email, so no portal account is needed', () => {
  assert.match(migration58, /ALTER TABLE mock_oral_bookings ALTER COLUMN student_id DROP NOT NULL/);
  assert.match(migration58, /CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_email\s+ON mock_oral_bookings\(day_id, lower\(email\)\) WHERE status='booked' AND email IS NOT NULL/);
  assert.match(migration58, /CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_token/);
  const book = moduleSource.slice(moduleSource.indexOf('export async function book('), moduleSource.indexOf('export async function cancel'));
  // An email the portal knows is tied to that student; one it does not know still books.
  assert.match(book, /AND lower\(email\)=\$1`, \[typed\]\)\)\.rows\[0\] \|\| null/);
  assert.match(book, /\[dayId, student\?\.id \|\| null, contact\.name, contact\.email, randomToken\(24\)/);
  // One upcoming booking for a person, whichever way they are recognised.
  assert.match(book, /lower\(b\.email\)=\$1 OR \(\$2::uuid IS NOT NULL AND b\.student_id=\$2::uuid\)/);
  // A day kept to certain classes still is.
  assert.match(book, /if \(day\.class_ids\) \{/);
  // The name and email are checked before anything is written.
  assert.match(routes, /name: z\.string\(\)\.trim\(\)\.min\(2\)\.max\(80\)/);
  assert.match(routes, /email: z\.string\(\)\.trim\(\)\.toLowerCase\(\)\.email\(\)\.max\(200\)/);
  // Somebody with no portal account is still reminded.
  assert.match(moduleSource, /AND \(b\.student_id IS NULL OR \(u\.active=true AND u\.withdrawn_at IS NULL\)\)/);
});

test('one link for everybody: the page, the old link, the portal and the teacher all point at it', () => {
  assert.match(server, /app\.get\('\/mock-oral', /);
  assert.match(server, /if \(req\.query\.go === 'mockoral'\) return res\.redirect\(302, '\/mock-oral'\);/);
  assert.match(app, /<a class="calendar-event is-oral" href="\/mock-oral"/);
  assert.match(app, /<a class="task-bar mo-bar" href="\/mock-oral">/);
  assert.match(app, /id="mo-link-input" readonly value="\$\{escapeHtml\(`\$\{location\.origin\}\/mock-oral`\)\}"/);
  assert.match(page, /name="name" autocomplete="name"/);
  assert.match(page, /name="email" type="email"/);
});
