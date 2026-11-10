BEGIN;

/* Mock orals.
   ------------------------------------------------------------------
   A mock oral day is one date with a number of examiners working it. Every
   examiner runs the same timetable of twenty minute orals (the times, and the
   breaks between them, live in src/mockoral.js), so a day's capacity is simply
   examiners x orals.

   A student books a time, not an examiner. The portal gives them the lowest
   numbered examiner who is free at that time, so a time stays open until every
   examiner has it filled, and each booking carries the examiner number the
   teacher later sends a link for. */
CREATE TABLE IF NOT EXISTS mock_oral_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  on_date date NOT NULL UNIQUE,
  examiners integer NOT NULL CHECK (examiners BETWEEN 1 AND 40),
  -- Off until the teacher has finished setting the day up.
  booking_open boolean NOT NULL DEFAULT false,
  -- The classes that may book. NULL is every class.
  class_ids uuid[],
  -- A line for students: what to have ready, where it is.
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/* A name and a link for an examiner, when the teacher has them. An examiner
   with no row here is simply "Examiner 3". */
CREATE TABLE IF NOT EXISTS mock_oral_examiners (
  day_id uuid NOT NULL REFERENCES mock_oral_days(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number >= 1),
  name text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  PRIMARY KEY (day_id, number)
);

CREATE TABLE IF NOT EXISTS mock_oral_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id uuid NOT NULL REFERENCES mock_oral_days(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which oral of the day, 1 to 17. Breaks have no number, so cannot be booked.
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 17),
  examiner integer NOT NULL CHECK (examiner >= 1),
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled')),
  booked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  /* The start time each reminder was sent for. A day that is moved gets its
     reminders again, because the time they were sent for is no longer the time. */
  day_reminder_for timestamptz,
  hour_reminder_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One student per examiner per time, and one live booking per student per day.
-- Cancelled rows are kept as the record and sit outside both.
CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_seat
  ON mock_oral_bookings(day_id, slot, examiner) WHERE status='booked';
CREATE UNIQUE INDEX IF NOT EXISTS mock_oral_bookings_student
  ON mock_oral_bookings(day_id, student_id) WHERE status='booked';
CREATE INDEX IF NOT EXISTS mock_oral_bookings_upcoming
  ON mock_oral_bookings(starts_at) WHERE status='booked';

COMMIT;
