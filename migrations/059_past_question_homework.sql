BEGIN;

/* A past question set as homework.
   ------------------------------------------------------------------
   The teacher is looking at a past exam question, a reading comprehension say,
   and sets it for a class with a deadline. It is an assignment like any other:
   on the calendar, in the reminders, in the review queue. What makes it
   different is where it is done, which is on the past paper itself, with the
   answers typed into the paper's own spaces and marked there.

   So an assignment can name the past questions it is made of, and a submission
   keeps what the student typed into each space and how each was marked, beside
   the plain-text answers every submission has. */
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS pq_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS pq_result jsonb;

COMMIT;
