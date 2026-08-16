BEGIN;

-- A teacher can leave a spoken reply as well as, or instead of, written feedback.
-- One recording per piece of returned work, stored on disk and served through an
-- authenticated route rather than from the public uploads path.

ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS teacher_audio_path text,
  ADD COLUMN IF NOT EXISTS teacher_audio_mime text,
  ADD COLUMN IF NOT EXISTS teacher_audio_seconds integer,
  ADD COLUMN IF NOT EXISTS teacher_audio_recorded_at timestamptz;

ALTER TABLE homework_submissions
  ADD COLUMN IF NOT EXISTS teacher_audio_path text,
  ADD COLUMN IF NOT EXISTS teacher_audio_mime text,
  ADD COLUMN IF NOT EXISTS teacher_audio_seconds integer,
  ADD COLUMN IF NOT EXISTS teacher_audio_recorded_at timestamptz;

-- Dictation settings and the two cleanup prompts, following the same shape as the
-- existing seeded prompts so they are editable from the administrator screen.
INSERT INTO app_settings(key,value)
VALUES
('dictation', jsonb_build_object(
  'transcribeModel', 'gpt-4o-transcribe',
  'cleanupModel', 'gpt-4.1-mini',
  'language', 'auto',
  'dictionary', jsonb_build_array(
    'Gaeilgeoir Guides', 'An Caighdeán Oifigiúil', 'TEG B1', 'TEG B2',
    'Leaving Certificate Irish', 'Hibernia', 'an tuiseal ginideach',
    'an modh coinníollach', 'an aimsir chaite', 'an aimsir láithreach',
    'an aimsir fháistineach', 'séimhiú', 'urú', 'Gaeltacht', 'Gaeilge'
  )
)),
('voicePrompts', jsonb_build_object(
  'cleanupPrompt', 'You turn raw speech transcripts into text the speaker would have typed themselves. This text is a teacher''s feedback to an adult Irish-language learner.
Rules:
- Remove fillers (um, uhm, uh, ah, er, you know, like) and accidental repetitions.
- Honor self-corrections, keeping only the final intent: "wednesday oh I mean thursday" -> "Thursday".
- If the speaker spells a word letter by letter, correct the word to that spelling and DELETE the whole spelling phrase from the output. Spelled-out letters must never appear in the output.
- When the speaker asks for emoji, insert fitting emoji instead of the words.
- Never put a comma before a name at the end of a sentence: write "you''re so right Emma", not "you''re so right, Emma".
- Fully correct the English: grammar, tense, subject-verb agreement, word choice, casing, punctuation and speech-recognition mistakes. Correctness beats keeping words verbatim.
- Leave Irish words, phrases and quoted student wording exactly as spoken. Never translate them and never "correct" Irish the teacher is quoting.
- Sound human, never AI-generated: keep the speaker''s rhythm and warmth. Never add greetings, sign-offs, hedges or content they did not say.
- If the speech implies a list or steps, format it as a list.
- FORMATTING: break anything longer than about three sentences into paragraphs of one to three sentences, separated by a BLANK LINE. Start a new paragraph at each shift in thought: the opening reaction, then each new point, then the closing line. A short message stays as one paragraph.
- The terms below are frequently misheard by speech recognition. Repair any close-sounding variant to the correct term, for example "TGB2" or "teg be two" -> "TEG B2", and "leaving civic Irish" -> "Leaving Certificate Irish". Fix the spelling, keep the sentence.
- Known names and terms: {{dictionary}}
Finally, reread your cleaned text as one whole message and repair anything still ungrammatical or unclear, while keeping it sounding like the speaker typed it.
Output ONLY the cleaned text, nothing else.',
  'lightPrompt', 'Add punctuation and casing to this raw speech transcript and remove fillers (um, uh, ah).
This is a list of Irish-language corrections written by a teacher. Never change, translate or "correct" any Irish wording, and never alter the student wording being quoted. Preserve line breaks and the "Correction:" structure exactly.
Never put a comma before a name at the end of a sentence.
Known names and terms: {{dictionary}}
Change nothing else. Output ONLY the corrected text.'
))
ON CONFLICT (key) DO NOTHING;

COMMIT;
