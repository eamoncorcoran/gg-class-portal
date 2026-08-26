/* When a course actually runs.
   ------------------------------------------------------------------
   Teaching weeks were generated from two weeks before today to eighteen weeks
   ahead, which has nothing to do with when the course starts. A class created in
   August showed students weeks in August, before anybody had taught anything.

   Both dates are nullable, because a class that has not been given a term should
   keep behaving as it did rather than suddenly having no weeks at all. */
ALTER TABLE classes ADD COLUMN IF NOT EXISTS starts_on date;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS ends_on date;
