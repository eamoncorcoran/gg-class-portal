BEGIN;

/* Drafting moves from OpenAI to Claude, and the voice moves out of the textarea.
   ------------------------------------------------------------------
   The check-in and community prompts were three sentences of generic
   instruction typed into a settings box, which is why every draft came back
   sounding like a support desk rather than like Éamon. The voice now lives in
   src/draftprompts.js, measured from 362 replies he actually sent students, and
   is not editable from the browser: a stray edit should not be able to undo it.

   What is left on the screen is a notes field for each, appended after the voice
   rather than in place of it, for the things that change between terms.

   The two old prompts are moved aside rather than dropped. They no longer do
   anything, and leaving them in place would have shown text on the settings page
   that had stopped having any effect, which is worse than losing them. They stay
   under `retired` so the original wording can still be read back if it is ever
   wanted. The homework prompts are untouched: corrections are a marking standard
   he tunes, not a voice. */
UPDATE app_settings
SET value =
  (value - 'checkinPrompt' - 'communityReplyPrompt')
  || jsonb_build_object(
       'checkinNotes', COALESCE(value->>'checkinNotes', ''),
       'communityNotes', COALESCE(value->>'communityNotes', ''),
       'retired', COALESCE(value->'retired', '{}'::jsonb) || jsonb_build_object(
         'checkinPrompt', COALESCE(value->>'checkinPrompt', ''),
         'communityReplyPrompt', COALESCE(value->>'communityReplyPrompt', '')
       )
     ),
    updated_at = now()
WHERE key = 'prompts';

/* The Claude key lives in its own settings row, encrypted the same way the
   OpenAI one is. Created empty so the settings screen has something to read
   before anybody has saved a key; the row being present is not the same as
   being configured, which is decided by the key inside it. */
INSERT INTO app_settings(key, value, updated_at)
VALUES ('anthropic', jsonb_build_object('model', 'claude-opus-5'), now())
ON CONFLICT (key) DO NOTHING;

COMMIT;
