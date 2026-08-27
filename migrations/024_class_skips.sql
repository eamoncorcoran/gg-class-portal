/* Weeks the class does not meet.
   ------------------------------------------------------------------
   The weekly slot is worked out from a day and a time, which is right for most
   of the year and wrong for the handful of weeks that matter most: a bank
   holiday, a mid-term, the week somebody is away. Those were invisible — the
   banner counted down to a class that was not happening.

   One row per skipped date, rather than a flag on a generated week, because
   these are decisions about the calendar and they outlive any particular run of
   week rows. */
CREATE TABLE IF NOT EXISTS class_skips (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  skip_on date NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, skip_on)
);
