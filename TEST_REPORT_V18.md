# V18 Test Report

Run against a real PostgreSQL 17 database and a running server.

| Suite | Result |
| --- | --- |
| `npm run check` | pass |
| `npm test` with `RUN_DB_TESTS=1` | 9 passed, 0 failed |
| `npm run smoke` | 103 checks passed, 0 failed |
| `npm run build:preview -- --check` | in sync |

## Deleting homework and classes

Nothing destructive succeeds without the numbers being passed back.

| Action | Result |
| --- | --- |
| Impact before deleting an assignment | reports submissions, returned, drafts |
| Delete without confirming the count | **409**, naming what would be lost |
| Archive | `status=archived` |
| Archived assignment in the default list | hidden |
| Archived assignment with `includeArchived=true` | listed |
| Archived assignment as seen by a student | gone |
| Restore | `status=published` |
| Class impact | students, weeks, assignments, attendance, check-ins, submissions |
| Delete a class holding work, unconfirmed | **409** |

## Homework calendar

Two bugs in my own first cut, both found in the browser and fixed:

1. With two classes sharing dates, the per-day teaching-week lookup kept only the
   last class, so one class's empty week hid the other's homework. Each day now
   collects every week covering it.
2. "No homework this week" keyed off the optional `week_id` link, so a week whose
   deadlines were visible on screen was still labelled empty. It now goes by
   where the deadline actually falls.

Verified after the fix: the week of 3 August carries deadlines on the 6th and 9th
and is not labelled; the weeks of the 10th and 17th are labelled once each, on the
Monday.

## Calendar subscription

Fetched exactly as a calendar app would, with no cookies:

| | Result |
| --- | --- |
| Administrator feed, anonymous fetch | 200, `text/calendar`, valid document |
| Student feed | only their own outstanding work |
| Two people's tokens | different |
| Guessed token | **404** |
| Short token | **404** |
| After resetting the link | old link **404** |
| Per-assignment `.ics` | 200, one `VEVENT`, CRLF endings |

## Invitations

The invitation email carries the sign-in link, the student's address and the
temporary password, in the styled block and again as plain text — mail clients
strip styling, and a phone will not let a student copy from a button.

Console mode is the silent failure: accounts are created, invitations are
"sent", and nothing arrives. The Classes and students screen now carries a
standing warning while email is in test mode, and creating a student says plainly
that no invitation was delivered. **This is the state the app ships in**, so set
up SMTP or the GoHighLevel webhook and send a test email before adding real
students.

## Interface

- returned-feedback markers are a counted badge that clears the moment the
  student opens the feedback, rather than on the next navigation
- item names on the student tracker stay in the normal text colour
- the sign-in copy is tightened and closes with the seanfhocal

## Known gap

The permission model is still administrator and student only.
