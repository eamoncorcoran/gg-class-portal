BEGIN;

-- A recording the teacher made, rather than one a machine read out.
--
-- Cheaper and better: a real speaker in a real dialect beats a synthesiser, and
-- a recording made once costs nothing every time it is played. Synthesis stays
-- as an option for anybody without a recording to hand.
ALTER TABLE listening_audio
  -- 'upload' | 'tts'
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tts',
  /* What the student is told they are listening to. The dialect key decides
     which tab it sits under; this is the words on the tab, so a recording can
     say "Corca Dhuibhne" or name the speaker rather than being labelled with
     the portal's own idea of the dialect. */
  ADD COLUMN IF NOT EXISTS label text,
  -- The name the file arrived with, so a teacher can tell two uploads apart.
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL;

/* Everything already in the table was synthesised, which is the default, so
   nothing needs backfilling. An upload has no text_hash: it is not derived from
   the story, so editing the story does not make the recording wrong in the way
   it makes a synthesised one wrong. */

COMMIT;
