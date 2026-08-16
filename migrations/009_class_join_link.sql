BEGIN;

-- The weekly class link. Until now it lived in whatever email or message went out
-- that week, which meant a student hunting through their inbox at 18:58 on a
-- Monday. The class already knows its day, time and timezone, so the one thing
-- missing was the link itself.
--
-- Kept on the class rather than per week on purpose: a recurring Zoom meeting has
-- one link for the term, and asking for it again every week is a weekly chance to
-- forget. A week that genuinely needs a different link overrides it in `weeks`.
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS join_url text,
  -- Shown under the button. A room code, a dial-in, "we start at 19:05 this term".
  ADD COLUMN IF NOT EXISTS join_note text;

-- The exception, not the rule: one week moved to a different link.
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS join_url text;

COMMIT;
