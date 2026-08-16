# V17 Test Report

Run against a real PostgreSQL 17 database and a running server.

| Suite | Result |
| --- | --- |
| `npm run check` | pass |
| `npm test` with `RUN_DB_TESTS=1` | 9 passed, 0 failed |
| `npm run smoke` | 75 checks passed, 0 failed |
| `npm run build:preview -- --check` | in sync |

## Voice notes

Verified against the running server with a real upload:

| Caller | Result |
| --- | --- |
| Administrator | 200, `audio/wav`, 8044 bytes |
| The student the feedback belongs to | 200 |
| A **different** student in the same class | **403** |
| Signed out | **401** |
| Range request (`bytes=0-99`) | 206, so players can scrub |
| A JSON file uploaded as audio | rejected, "That audio format is not supported." |

Also confirmed:

- the on-disk filename never appears in any API response; clients only ever see
  `/api/media/voice-note/<type>/<id>`
- a check-in returned with **empty** written feedback succeeds when a voice note is
  attached, and is refused when it is not
- replacing a voice note deletes the previous recording from disk
- an unreturned note is invisible to the student, because it is still a draft
- the student sees "Voice note from your teacher · 0:12" with a working player
  above the written feedback

## Dictation

The Browser pane blocks microphone access, so `getUserMedia` itself could not be
exercised here. Everything on either side of it was:

- the permission denial surfaces as "Microphone access was blocked. Allow it for
  this site in your browser settings, then try again." rather than a silent failure
- upload → transcribe → cleanup → insert returns 200 and drops the finished text in
  at the cursor, with a space added after existing text
- `light` mode returns corrections-shaped output and is wired to the Irish
  corrections box only; `full` mode is used everywhere else
- cleanup failure falls back to the raw transcript rather than losing the recording
- the buttons hide themselves entirely where `MediaRecorder` is unavailable

Dictation still needs a physical microphone and an OpenAI key to be exercised
end to end. Record one sentence into the check-in reply box on the deployed app
before relying on it in front of students.

## Student notes

- a note can be logged, pinned, edited and deleted
- the profile reports live-attendance rate, submissions, average understanding and
  confidence, and last login
- **a student requesting their own profile is refused** — notes are never exposed
  to the person they are about

## Interface

- the student weekly tracker renders one week per row, newest first, measured at
  four cards on four distinct rows, with exactly one marked as the current week
- submitted work no longer appears under Upcoming work
- past-deadline work appears under a separate red **Overdue** heading above
  Upcoming work, with a count
- the logo lockup renders on the sign-in panel, the sidebar and the boot screen,
  with a white chip behind the artwork on the dark ground
- every toggle renders as a switch

## Known gap

The permission model is still administrator and student only.
