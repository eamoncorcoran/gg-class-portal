# V16 Test Report

Everything below was run against a real PostgreSQL 17 database and a running
server, not against the browser preview. Several of the defects listed were
invisible in the preview precisely because the preview has no database and no
Content-Security-Policy.

## Automated

| Suite | Result |
| --- | --- |
| `npm run check` — syntax, every JS file | pass |
| `npm test` with `RUN_DB_TESTS=1` | 9 passed, 0 failed |
| `npm run smoke` — full workflow over HTTP | 60 checks passed, 0 failed |
| `npm run build:preview -- --check` | in sync |
| `npm ci` from a clean checkout | pass |

## Defects found and fixed

### Launch blockers

1. **`npm install` failed outright.** `zod@4` and `openai@5`'s peer range are
   incompatible, so a clean checkout could not install, and therefore the Docker
   image and any Render deploy could not build. Pinned `zod@^3.25.76`, which the
   OpenAI client accepts and which every validator in `src/` already targets.
   Committed `package-lock.json` and switched the Dockerfile to `npm ci`.

2. **The administrator tracker crashed against a real database.** `week_start` is
   a `date` column; node-postgres parsed it into a `Date` at the server's local
   midnight, which serialised to JSON as a shifted timestamp. Every `fmtWeek()`
   call then produced `Invalid Date` and the whole screen failed with
   "Invalid time value". Reproduced, fixed by reading `date` columns as plain
   `YYYY-MM-DD` strings, and covered by a regression test.

3. **The Content-Security-Policy silently dropped every inline style
   attribute.** Verified in the browser: an element with `style="width:123px"`
   computed to `0px`. In production this collapsed the rolling-form progress
   bars, the Loom embeds, question images and the legend colours. Added
   `style-src-attr`, leaving stylesheet loading restricted as before.

### Correctness

4. Arrow-key navigation in the review drawer stopped working after the first
   keystroke in a feedback box, because a one-shot listener was re-armed from
   inside its own handler and the early return skipped the re-arm. Now a single
   listener registered once. Verified by typing, blurring and paging both ways.
5. Deadlines rendered in the viewer's timezone rather than the class timezone,
   including the calendar's day bucketing, so a Sunday 20:00 Dublin deadline
   appeared on Monday from another timezone. All reads and writes now use the
   class timezone.
6. Soft deadlines showed as `Missed` while the server still accepted
   submissions.
7. A second assignment in the same teaching week vanished from the tracker.
8. Calendar events had no status colour at all: the stylesheet defined
   `.checkin`/`.homework`/`.returned` while the markup emitted tone classes.
9. The calendar could not be paged, so any deadline outside the current month
   was invisible.
10. The attendance drawer could only edit status, though the specification calls
    for minutes and internal notes.
11. Every toggle in the application was missing the element its stylesheet
    styles, so no switch rendered anywhere — the label sat inside a 36px box.
12. Saving email settings reset the SMTP port and turned implicit TLS off,
    because the interface never sent those fields and absent was read as off.
13. Resending an invitation changed the password but left existing sessions
    valid.
14. `/api/<unknown>` returned the application shell with status 200, so the
    browser reported a JSON parsing error instead of the real problem.
15. The health endpoint reported version `12.0.0`.
16. `/redraft` existed on the server but nothing called it, so a failed AI draft
    could not be retried. Now offered in the review drawer.
17. A dead search box in the top bar was replaced with the account control.
18. Students not yet assigned to a class saw an empty screen with no explanation.

## Weekly tracker

Measured in the browser rather than judged by eye.

- every status icon in a row shares one top offset; every label shares one top
  offset and one height
- row heights uniform at 81px
- every label is a single line drawn from a fixed vocabulary: `Live`,
  `Not live`, `No record`, `Open`, `Open, late`, `To review`, `Draft ready`,
  `Returned`, `Missed`
- three actions occupy three equal columns; a week with two assignments renders
  four
- the student tracker no longer overflows or clips at any width; verified at
  375px, 768px and 1440px

## Workflow, against a real database

Administrator sign-in, class and week generation, student creation with
duplicate-email refusal, invitation reset, first-login password change,
privilege separation, check-in draft and submission, teacher return,
notification and read receipt, homework publication, rolling completion,
required-question validation, submission, feedback return, post-return editing,
reopening, manual attendance with minutes and notes, email settings round trip,
test email, reminder cycle, audit log, sign-out and session invalidation.

## Deliberately not changed

The permission model still has exactly two roles, administrator and student.
Every administrator can reach the OpenAI key, email settings and audit log. A
limited teacher role should be added before a second staff member is given an
account.
