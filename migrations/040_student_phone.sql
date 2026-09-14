BEGIN;

-- A phone number on the student, for the teacher.
--
-- Not asked of the student and not shown to them: this is a contact detail the
-- office holds, the same as the postal address beside it, and the portal has no
-- feature that needs a student to see their own number back.
--
-- Stored as it was given rather than normalised into one format. Irish numbers
-- are written half a dozen ways, 087 389 9460 and +353 87 389 9460 among them,
-- and a number reformatted into something the owner does not recognise is
-- harder to check against a list than one left alone.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone text;

COMMIT;
