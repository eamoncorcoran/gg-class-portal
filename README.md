# Gaeilgeoir Guides Class Portal V35


A private internal SaaS application for managing Gaeilgeoir Guides classes, student accounts, weekly attendance, check-ins, homework, deadlines, reminders and returned teacher feedback.

## What is included

### Authentication and student access

- No public sign-up route
- Administrators create or import every student account
- A cryptographically strong temporary password is generated for each student
- The temporary password is emailed automatically
- Students must set their own password on first login
- Password reset emails expire after one hour
- Password changes invalidate the student's other sessions
- Rolling secure sessions keep active students signed in across browser restarts
- Passwords are hashed with Node's scrypt implementation
- Session and reset tokens are stored as SHA-256 hashes, never as plaintext

### Separate class operations

Each class has its own:

- Weekly tracker
- Student list
- Attendance imports
- Friday check-ins
- Homework assignments
- Submission review queue
- Reminder emails

Default intended class names include:

- Irish for Primary Teaching | Monday | 19:00
- Irish for Primary Teaching | Thursday | 19:00

### Student tracker rules

Each tile is one 32px icon over one line of label. Colour carries the state, the
icon carries the column, and the label names it in a word.

#### Attendance, camera icon

| Tile | Administrator | Student |
| --- | --- | --- |
| Green camera | `Live` | `Live` |
| Red X | `Not live` | `Not live` |
| Grey camera | `No record` | `No record` |

Watching the recording does not count as live attendance. A week with nothing
uploaded reads as `No record` rather than as an absence.

#### Weekly check-in, speech icon, and homework, book icon

| Tile | Administrator | Student |
| --- | --- | --- |
| Grey | `Open` | `To do` |
| Grey, past a soft deadline | `Open, late` | `Open, late` |
| Orange | `To review` or `Draft ready` | — |
| Green | `Returned` | `Submitted`, then `Returned` |
| Red X | `Missed` | `Missed` |
| Dashed outline | — | `None set`, no homework that week |

Orange is the administrator's colour and means *this is waiting on you*. Students
never see it: from their side handing work in is a good outcome, so it is green
and the label carries the difference between `Submitted` and `Returned`. Returned
work also shows a counted badge until they open it.

Opening any submitted or returned item shows the student **what they sent** —
their answers, and any files they uploaded — alongside the feedback.

Cells waiting on a teacher reply carry a warm background tint, so the review
queue is visible at a glance without reading a single label. Newly returned
feedback carries a counted badge, which clears the moment the student opens it.

All deadlines are shown in the class timezone, whichever timezone the person
reading them happens to be in.

### Weekly check-ins

- Created automatically for each teaching week
- Released to students every Friday at 2:00pm in the class timezone, per week overridable
- Future weeks are not shown to students
- Required answers:
  - Attendance or recording status
  - Material reviewed
  - Understanding score
  - Confidence score
  - Weekly win
- Optional support request
- Drafts save during completion
- OpenAI drafts a teacher response only after submission
- Missing check-ins never receive an AI draft

### Homework

- Multiple rolling questions
- Required and optional questions
- Embedded question images
- Loom video embeds
- Downloadable resource files
- Same-tab completion flow
- Automatic draft saving
- Students can leave and continue later
- Hard deadlines
- Administrator reopening controls
- OpenAI feedback is created only after final submission
- Missing homework keeps both feedback fields blank

Homework feedback contains:

1. Irish Corrections using An Caighdeán Oifigiúil
2. Friendly general teacher feedback

### Uploaded homework

Each assignment decides whether it takes files, and which formats. Anything
uploaded is read into text on arrival, so a photo of handwritten Irish goes
through the same corrections as anything typed in:

| Format | How it is read |
| --- | --- |
| Photos and images | The vision model transcribes it exactly, mistakes included — correcting at this stage would hide the errors being marked |
| PDF | The same model, which takes a PDF directly |
| Word `.docx` | Unzipped and read locally, no model call |
| Plain text | Read as-is |

Reading never blocks a submission. If it fails the file is still saved and you
still see it; only the automatic draft goes without it. In the review drawer each
file opens, with the transcription behind a *What was read from it* disclosure —
worth checking, because it is what the corrections were generated from.

Uploaded work and voice notes are stored **outside** the publicly served uploads
directory (`PRIVATE_UPLOAD_DIR`) and reached only through authenticated routes.

### Voice

Two separate features, one recorder.

**Dictation.** A *Dictate* button sits above every feedback box, the check-in reply
and the private student notes. Speak, press stop, and the finished text lands at
your cursor. The pipeline is the same one the VoiceKey keyboard uses, so both
tools write in the same voice:

```text
recording -> gpt-4o-transcribe -> gpt-4.1-mini cleanup -> text
```

The speech model is chosen for accuracy on accents and Irish terms; the cleanup
model is chosen for grammar. If cleanup fails or times out, the raw transcript is
inserted rather than nothing — a teacher can fix punctuation far more easily than
re-record a paragraph.

The Irish corrections box dictates in **light** mode: punctuation and casing only.
The cleanup model is explicitly forbidden from changing, translating or
"correcting" any Irish wording, because that box *is* the teaching.

A personal dictionary of course terms — TEG B2, An Caighdeán Oifigiúil, an tuiseal
ginideach and so on — is sent to both models, which is what stops "teg be two"
coming back as anything else. Edit it under **OpenAI & prompts**.

**Voice notes.** A recording attached to returned feedback. Record it in the review
drawer, play it back, re-record or remove it. The student hears it above the
written feedback. A voice note can carry the whole reply, so the written boxes may
be left empty.

Recordings are never served from the public uploads path. They are written to disk
under a random name and streamed through an authenticated route that checks the
caller on every request: an administrator may play any note, a student may play
only the notes on their own returned work, and everyone else gets 403.

Recording needs HTTPS (or localhost) and a browser with `MediaRecorder` — Chrome,
Edge, Firefox and Safari 14.3+. Where it is unavailable the buttons hide
themselves rather than failing on click.

### Student notes

Click any student on the tracker or the roster to open their profile: live
attendance rate, submissions, average understanding and confidence, last login,
and a running log of private notes. Notes can be pinned, dictated, and are never
visible to the student.

### Managing the weekly check-ins

Check-ins are not an unstoppable weekly machine. **Weekly check-ins** in the
sidebar lists every teaching week for a class, and each one carries its own:

- **switch** — turn a week off entirely and no check-in is expected. Christmas
  week, a reading week, any week you simply do not want to ask. The tracker shows
  `Off` rather than a miss.
- **opening and closing time** — the default is Friday 2pm to Sunday 8pm, but any
  week can be moved.
- **hard or soft deadline** — a hard deadline closes the form. A **soft** one keeps
  accepting late check-ins and the tracker shows `Open, late` instead of `Missed`.
- **note** — a label like "Christmas week" for your own reference.

Weeks can be switched on or off in bulk, because a mid-term break is rarely one
week.

### Building a term of check-ins

**Create check-ins** on the Weekly check-ins screen lays out a whole run at once:

1. Pick the first and last week.
2. Set when each one opens to students and when it closes. The default is
   **Friday 2pm to Sunday 8pm** in the class timezone. Students cannot see a
   check-in before it opens.
3. The screen then lists every week it will create. Untick any you do not want —
   a mid-term break, Christmas week — and those weeks are created switched off,
   so they stay on the tracker as teaching weeks with nothing asked of anyone.
4. Nothing is written until you press Create.

Weeks outside the range are left completely alone, so building next term does not
disturb the one already running.

### Chasing a missing check-in or homework

Click any cell on the tracker with nothing in it. Instead of an empty feedback
form you get the state of play — whether the deadline has passed, whether the
student started a draft, when they were last reminded — and a **Send a reminder**
button.

The email opens prefilled and editable, and can be dictated. It refuses to send
if the student has in fact already submitted. The wording you start from lives on
the Email reminders screen, alongside the automatic deadline sequence, and is
separate from it: the sequence fires on a schedule and never repeats, this is you
deciding to reach out.

### Planning homework

The Homework screen is a month calendar. Teaching weeks are tinted, so a week
with nothing set says **No homework this week** rather than looking like missing
data — not every week has homework, and the calendar should show that on purpose.

- click any day to create homework due that day, with the deadline prefilled
- click an assignment to edit it
- filter by class, or switch to a list view for the full set of actions

### Removing homework and classes

Nothing destructive happens without the numbers first.

- **Archive** takes an assignment out of the tracker and out of what students
  see, and keeps every submission and every piece of feedback. This is almost
  always the right choice for work that has already been handed in. Archived
  assignments can be restored.
- **Delete** removes the assignment and all of its submissions. The confirmation
  states exactly how many submissions will go and how many already have feedback,
  and offers archiving instead. The API refuses the delete unless the caller
  passes the submission count back, so it cannot happen by accident.
- **Deleting a class** removes its weeks, attendance, check-ins, assignments and
  submissions. The students themselves are kept and simply end up unassigned. The
  same count-back confirmation applies.

### Getting deadlines into a calendar

Two ways, from **Add to calendar**:

- a one-off `.ics` download for a single assignment
- a private subscription link, which is the useful one: the calendar app re-reads
  it, so a moved deadline or a new assignment appears without anyone adding it
  again

The subscription link is the credential — calendar apps fetch with no cookies —
so it is unguessable, scoped to one person, and can be reset from the same screen,
which revokes every existing subscription. An administrator's feed carries every
published deadline; a student's carries only their own outstanding work, and drops
anything they have already handed in.

### Leaving the course

Students reach settings by clicking their name in the top right. Inside, behind
**Options** and then **Stepping Back**, is the **Course withdrawal form**. It is one page, and only the first question —
the main reason — is required. Everything else (ratings for the course, the
teaching and the materials, the pace, what worked, what to change, whether they
would recommend it) is optional.

Submitting it:

- records the withdrawal and the answers
- **stops reminders, nudges and new work** reaching them
- closes submissions for them, while leaving every piece of work and feedback
  they already have exactly where it is
- marks them **Withdrawn** on your tracker, where their row stays visible but
  stops competing for your attention

Their answers appear on their profile, and the class list of withdrawals appears
on the tracker.

### How the class is going

A panel on the class tracker carries two figures, and is explicit about what it
counted:

- **Still on the course** — the share of enrolled students who have not withdrawn.
- **Work submitted** — the share of everything genuinely due so far that has come
  in. "Due so far" means released check-ins on weeks that were switched **on**,
  plus published assignments past their visible date.

Weeks you switched off and students who have left are excluded from both. That
matters: leaving a withdrawn student's unsubmitted work in the denominator would
make the completion figure drift down for a reason that has nothing to do with
the people still on the course.

### Administrator review workflow

- Clear states: generating, AI drafted, teacher edited and returned
- Left and right arrows move through submitted work
- Enter submits feedback
- Shift + Enter adds a new line
- Returned feedback can still be edited and updated
- Missing work never creates a teacher reply

### Email workflows

- Student account invitation
- Temporary password
- First-login password change
- Forgotten-password reset
- Password-change confirmation
- Due tomorrow reminder
- Due in two hours reminder
- Due in 30 minutes reminder
- GoHighLevel webhook, SMTP or console delivery
- Editable templates and test-email controls

### Class setup

**Classes & students → Class setup** holds everything about one class in one
place.

**Whether it has a board.** Not every group wants a community. A class set up
without one never shows Community in its students' menu, and the routes behind
it refuse as well — hiding a button is not the same as closing a door. Anything
already posted is kept and comes back if the board is turned on again.

**Which courses it carries.** A course used to belong to one class or to all of
them, which could not express two groups out of three. Courses and classes are
now many-to-many: tick the courses a class is enrolled in, or mark a course
*open to every class* if it is taught identically everywhere.

**Extra sessions.** A second evening that week, a catch-up, a class that moved.
Each carries its own date, length and — where the room differs — its own link.
Whichever comes first, the extra sitting or the weekly slot, is the one students
are shown, and a session with its own link uses that instead of the class link.
Cancelling keeps the row, struck through, so it is clear it was called off
rather than never entered.

**Recordings watched.** How far each student in the class has got through the
class recordings they can see, across every course rather than one at a time.

### The weekly class link

**Classes & students → Class setup** takes a join address and an optional note.
Students then see a banner on every screen, and the wording changes as the class
approaches:

| When | What it reads |
| --- | --- |
| Most of the week | `Next class Mon 17 Aug, 19:00` |
| Inside twelve hours | `Starts in 4 hours` |
| From the start time until two hours later | `Happening now` |

The button is there whenever a link is set, not only near the hour — somebody
checking on a Sunday to find the room should not be told to come back tomorrow.
Clearing the address removes the banner rather than leaving a button that goes
nowhere.

Nothing about the schedule is stored week by week. The class already carries a
day, a time and a timezone, so the next sitting is worked out from those; there
is no weekly field to forget to fill in. A single session that moves to a
different room can override the link on its own week, and every other week falls
back to the class link. Times resolve in the **class** timezone, so a student
reading from abroad is still told when the Dublin class starts.

### Courses

**Courses** is where the class recordings live. A course holds sections, a
section holds lessons, and a lesson is a recording with the notes that go with
it. Students get a shelf of course cards showing how far through each one they
are; opening a course puts them back at the first lesson they have not finished.

The lesson page is the shape people know from every course platform: the
recording large at the top, the title and notes under it, and the contents beside
it with a tick against everything already watched.

**Marking progress.** Every lesson has a **Mark as complete** button that toggles
both ways — pressing it again marks the lesson not complete. A lesson watched
past nine tenths ticks itself, because that is what finishing a lesson means and
nobody should have to remember to press a button afterwards; the button is still
there for anybody who wants to mark it early or undo it.

Progress belongs to the student who made it. This sounds obvious and is the thing
course platforms get wrong: a `complete` flag on the lesson row means the first
person to finish a lesson marks it finished for everybody. `tests/courses.test.js`
holds that line.

A course scoped to one class is seen only by that class; a course left open is
seen by every class, which is what a course taught identically to the Monday and
Thursday groups needs. Draft courses and draft lessons are the administrator's
alone.

#### Where the video lives

**A Zoom recording cannot be embedded.** Webinar and meeting recordings share the
same playback infrastructure, Zoom serves those pages with framing blocked, and
there is no embed product for them. Zoom also is not a library: cloud recording
is a paid feature with a few gigabytes per licence, and a year of weekly
90-minute classes is tens of gigabytes, so the files have to move off Zoom
whatever else is decided.

Recordings therefore live on **Bunny Stream**, and a lesson stores a provider and
a reference rather than being tied to one host:

| Provider | What it is for |
| --- | --- |
| `bunny` | The default. Adaptive streaming, so a student on weak mobile data gets a lower bitrate rather than a spinning wheel, and playback links can be signed |
| `youtube` | Embedded through `youtube-nocookie`. An unlisted video is not a private one, so this is for public material only |
| `loom` | Loom share links |
| `mp4` | A file served from this application |

Pasting a whole link or a bare id both work, and a link that does not match the
host chosen is refused rather than saved and left to render as an empty box.

**Signed playback.** With `BUNNY_TOKEN_KEY` set, every playback URL is minted per
request with a signature and a six-hour expiry. Nothing in the database is a
working link, and a URL forwarded outside the class stops working rather than
merely being hard to guess. Without the key playback still works, but a copied
link keeps working — the interface says so rather than letting you assume
otherwise.

### Importing from Zoom

Class ends, Zoom finishes processing, the recording appears in the portal as a
draft lesson with its date and length already filled in.

**Nothing imports because it merely exists.** A Zoom account carries one-to-ones,
test calls and meetings that have no business on a class portal, so the default
is that every recording is listed and ignored. Two ways to say otherwise:

1. **Press Import** on a recording in the list and choose the section it belongs
   in. This is the whole of it for most people.
2. **Name a webinar** as one that should always come across. A recurring class
   keeps the same webinar id every week, so naming it once is enough. Marking it
   as automatic is a separate switch — naming a webinar is not the same as
   agreeing that every future recording should arrive unread.

An imported lesson arrives **unpublished**, carrying whatever the meeting happened
to be called and no notes. That is not something to put in front of a class
unread, so it waits for you.

**The copy on Zoom is never touched.** The Zoom app is given read scopes only.
Until an import has demonstrably worked Zoom holds the only copy, and nothing in
this application has permission to change that.

#### Setting it up

**A Zoom Server-to-Server OAuth app**, created at `marketplace.zoom.us`, with the
recording read scopes. Put its credentials in `ZOOM_ACCOUNT_ID`,
`ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET`.

**A Bunny Stream library.** Its id and API key go in `BUNNY_LIBRARY_ID` and
`BUNNY_API_KEY`; the token authentication key in `BUNNY_TOKEN_KEY`.

**The webhook, optionally.** Point Zoom's `recording.completed` event at
`/api/zoom/webhook` and set the same secret in `ZOOM_WEBHOOK_SECRET`. This is the
only route in the application with no session behind it, so its signature check
is the whole of its security: it is verified against the raw bytes Zoom sent
before anything is read out of the body, a missing secret refuses every request
rather than accepting them, and even a validly signed event cannot import a
webinar that has not been named for it.

Without the webhook an hourly sweep does the same job a little later. With it,
the sweep stays on as a safety net for the times the webhook did not arrive.




### The class board

**Class board** is one feed per class. A question about Monday's lesson is noise
to the Thursday group, so the feeds are separate and a student can only ever
reach the feed of the class they are in.

The layout is the one people know from every community tool: a composer at the
top, category tabs under it, and a column of posts showing who wrote it, when,
how many likes and comments it has, and who spoke last. A side column carries the
class card and the month's most active members.

- **The composer** is a box, not a button — a box already sitting there gets
  noticeably more posts than a button labelled *Start a post*
- **Categories** — General, Questions, Wins and Resources by default, editable
  per class. Deleting one leaves its posts alone; they become uncategorised
- **Reactions** on posts and comments — 👍 ❤️ 🎉 😂 😮 🙏 💪 🤔. A fixed list
  rather than an open emoji keyboard: eight covers what people want to say
  without words, and the server rejects anything outside it. Only reactions
  somebody has actually used are shown, because a row of eight grey zeroes reads
  as a chore and the same row with two live counts reads as a room.
  **One each** — choosing a different emoji replaces the one you had rather than
  adding to it, so the count under an emoji is always a count of people. Choosing
  the same one again clears it
- **Sorting** — **Latest** by publication date, or **Hot**, which is comments
  decayed by age on a day-and-a-half half-life. Eight comments this morning
  should outrank twelve from last month, because the question the sort answers is
  *where is the conversation*, not *what was popular once*. Likes stay out of it:
  they measure approval, and this is measuring activity
- **Comments** open in a drawer, so reading three posts does not cost three
  scroll positions

#### Attachments

| Kind | Who can add it | How it is added |
| --- | --- | --- |
| PDF or Word `.docx` | Administrator only | Drop it on the composer, or click to choose |
| YouTube | Anyone | Paste the link into the post |
| Loom | Anyone | Paste the link into the post |
| GIF | Anyone | The GIF button in the composer |

**Videos have no field of their own.** Paste a YouTube or Loom link into what you
are already typing and the player appears underneath, in the feed and inside the
post alike. The link is then taken out of the text, because leaving both means
the same URL twice: once as a wall of characters and once as the thing it
actually is. Text either side of it is untouched, and anything that is not
recognisably one of those two providers stays as ordinary readable text rather
than being handed to an iframe. YouTube is embedded through `youtube-nocookie`,
so a class board is not setting advertising cookies on students.

**File uploads are the administrator's alone.** The class feed should not be a
route by which arbitrary files arrive on the server, so students have no upload
control at all — they can paste video links and pick GIFs, neither of which
touches the disk.

What a file *is* is read from its first bytes rather than taken from what the
browser called it. A PDF dragged out of some file managers arrives labelled
`application/octet-stream`, and every Office document is a zip — trusting the
label meant refusing perfectly good documents while accepting anything renamed
to `.pdf`. Uploads are capped at 40MB, and going over says so plainly instead of
failing with a generic error.

GIF search needs a `GIPHY_API_KEY`. Signing up at
[developers.giphy.com](https://developers.giphy.com) is free and takes no card;
the key it issues is rate limited to 100 calls an hour, which a class of forty
will not come near — and identical searches are answered from a ten-minute
server-side cache, so the trending grid everybody sees on opening the picker
usually costs nothing at all. Giphy will consider an application for a
higher-volume key, but for a group this size there is no reason to make one.

Without a key the picker says so rather than offering a button that returns
nothing. The search is proxied through the server because the content security
policy pins outbound connections to this origin — loosening it for one third
party would loosen it for every script on the page — and because an API key
belongs on a server.

#### Scheduling

Any post can be given a time instead of going out immediately. Until then it sits
in your feed, hatched and marked **Scheduled**, invisible to students and silent:
it raises nobody's unread badge until the moment it appears. No job runs to
release it — every read already filters on the clock — so a scheduled post cannot
be missed by a worker that was not running.

#### Moderation

Pin a post to the top, close it to new comments, or remove a post or a single
comment. Removal is a soft delete: students stop seeing it immediately, you keep
seeing it greyed with a way back, and the surrounding comments keep their shape
rather than becoming answers to nothing. Every use is recorded in the audit log.
A closed post still takes a comment from you, because closing a conversation
usually means having the last word in it.

**The badge** counts posts and comments written by somebody else since that
person last opened the feed, and opening the feed clears it. Your own message
never comes back at you as something new to read. Likes deliberately do not raise
it: a badge that fires on a like turns the feed into a slot machine.

**Most active this month** counts posts and comments *written*, not likes
collected, and leaves the teacher out. Ranking by likes rewards the popular post;
ranking by contribution rewards turning up. A feed where the teacher is
permanently first is a noticeboard.

Withdrawn students keep reading and lose posting, like everywhere else.

### Scheduling a term of posts

Writing next term's twelve posts one at a time through the composer is the job
this replaces. The planning already happens in a spreadsheet, so the spreadsheet
is what it takes.

**Community → Scheduled** shows what is queued, drawn as a calendar month by
month — a term is planned in months, and the empty days are the point when you
are looking for the week you forgot. Times are shown in the **class** timezone,
not the reader's, so a teacher checking from abroad sees the hour the post
actually goes out.

**Download template** gives a CSV with the columns filled in and three example
rows, dated from next week, using this class's own categories.

**Import a spreadsheet** reads the file and shows every row back before writing
anything — a bad date in row nine should not leave eight posts on the board and
a half-finished import. Each row is either going in or it is not, and it says
which:

| Column | Accepts |
| --- | --- |
| Date | `25/12/2026 09:00`, `25/12/2026`, `2026-12-25T09:00`. Day-first. Times read as the class timezone. |
| Title | Required. |
| Body | Required. Commas and line breaks are fine inside quotes. |
| Category | Optional, but must already exist on this board. |
| Pinned | `yes` / `no`. |

Column headings are matched however they are capitalised, and the common
alternatives work too — `When` for Date, `Subject` for Title, `Message` for
Body, `Section` for Category. Row numbers in the preview count the header as
line 1, so they agree with what the spreadsheet shows.

A row with a date already gone by is not refused; it is flagged as publishing at
once. Rows with real problems are skipped and named. The import is one
transaction, so a failure halfway leaves the board exactly as it was.

### Profile pictures

Every student created from now on is asked for a photograph on the way in, after
they set their password and before they reach the portal. It is not skippable and
not buried in settings: a feed of faces only works if everybody has one, and the
only moment everybody reliably passes through is the first login.

Students already on the course when this shipped are left alone. Pulling the
portal out from under somebody mid-term to demand a photograph would be a poor
trade.

Pictures are stored under a random name outside the public uploads directory and
served through an authenticated route, like every other file belonging to a
student. Anybody signed in can see anybody else's, which is the point; nobody
signed out can see any of them. A picture that fails to load falls back to
initials rather than leaving a broken image in the middle of the feed.

### What students never see

Feedback is drafted by a model and then read, edited and approved by a teacher
before it is returned. By the time it reaches a student it is the teacher's
reply, and that is how it is presented — with no seam showing.

- The **Dictate** button renders for administrators only. The gate is inside the
  button itself rather than at each call site, so putting one on a student screen
  is not possible by accident
- The `ai_feedback`, `ai_corrections` and `ai_general_feedback` columns are
  stripped from every student-facing response, and `feedback_state` collapses to
  `pending` or `returned`. The interface hiding them would not be enough — the
  network tab is one keystroke away
- No student-facing copy mentions drafting, models or OpenAI

`tests/student-privacy.test.js` holds all three in place and fails if a student
route starts returning a raw row.

## Local deployment with Docker

### 1. Create the environment file

```bash
cp .env.example .env
```

Generate a secret encryption key:

```bash
node scripts/generate-key.js
```

Copy the result into `APP_ENCRYPTION_KEY`.

Set `APP_URL` to the exact URL used to open the application.

### 2. Start PostgreSQL and the application

```bash
docker compose up --build -d
```

The container automatically runs database migrations before starting.

### 3. Create the administrator

```bash
docker compose exec \
  -e ADMIN_NAME="Éamon Corcoran" \
  -e ADMIN_EMAIL="your@email.com" \
  -e ADMIN_PASSWORD="ReplaceWithAStrongPassword!" \
  app npm run create-admin
```

### 4. Add the initial class groups

Either use the Classes & Students screen, or run:

```bash
docker compose exec app npm run seed-demo
```

Open:

```text
http://localhost:3000
```

## Standard Node deployment

Requirements:

- Node.js 22+
- PostgreSQL 16+
- HTTPS in production

```bash
npm install
npm run migrate
npm run create-admin
npm start
```

## Render deployment

The included `render.yaml` creates:

- One Docker web service
- One PostgreSQL database
- Persistent environment variables

After deploying:

1. Set `APP_URL` to the public HTTPS URL.
2. Set `APP_ENCRYPTION_KEY`.
3. Add an OpenAI key either as `OPENAI_API_KEY` or in the administrator settings screen.
4. Configure SMTP or the GoHighLevel email webhook.
5. Run the create-admin command from the Render shell.
6. Send a test invitation and password-reset email.
7. Upload one test attendance CSV.
8. Submit and return one test check-in and homework assignment.

## OpenAI

The application uses the Responses API with structured JSON output.

The OpenAI key is used only by the server. It is never returned to the browser. A key saved through the administrator screen is encrypted using AES-256-GCM and `APP_ENCRYPTION_KEY`.

The default model is configurable with:

```text
OPENAI_MODEL=gpt-5.6
```

It can also be changed from the administrator settings.

Set this to a model your OpenAI account actually has access to, then press **Test
connection** on the OpenAI & prompts screen before inviting students. A model name
the account cannot use fails at the first real submission, not at save time, and
the check-in or homework is then marked `Draft failed`. The submission itself is
never lost, and the draft can be retried from the review drawer.

## Email configuration

### Console mode

Useful for development. Emails are printed to server logs.

```text
EMAIL_PROVIDER=console
```

### GoHighLevel webhook

```text
EMAIL_PROVIDER=ghl_webhook
GHL_EMAIL_WEBHOOK_URL=https://...
```

The webhook receives:

- Recipient
- Subject
- Plain-text body
- HTML body
- Email metadata

### SMTP

```text
EMAIL_PROVIDER=smtp
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
```

## Student CSV format

See `examples/students.csv`.

Required headings:

```text
Name,Email,Class
```

The Class value should match the full class label, for example:

```text
Irish for Primary Teaching | Monday | 19:00
```

You may also choose a default class during import.

## Attendance CSV support

The importer matches by email first, then exact name.

It supports durations such as:

- `75`
- `45:00`
- `01:15:30`
- `1 hr 20 min`

See `examples/attendance.csv`.

## Security controls

- HTTP-only session cookies
- Secure cookies in production
- SameSite=Lax
- Rolling persistent sessions
- Rate limits on login and password reset
- Same-origin checks on state-changing requests
- Helmet security headers and Content Security Policy
- No public registration endpoint
- Strong password policy
- scrypt password hashing
- Hashed session and reset tokens
- One-hour reset-token expiry
- Encrypted stored secrets
- Upload size limits
- Upload MIME allowlist
- Non-executable document delivery
- Administrator audit logs

See `SECURITY.md`.

## Validation

```bash
npm run check           # syntax check every JavaScript file
npm test                # unit tests
npm run build:preview   # regenerate preview.html from public/
```

Unit tests cover temporary-password strength, password hashing and verification,
token hashing, the exact tracker status rules, Zoom-style attendance duration
parsing, and that `date` columns survive the round trip to the browser as
calendar days.

Set `RUN_DB_TESTS=1` to include the tests that need a database.

### End-to-end smoke test

Against a running server, this drives a complete teaching week over the real HTTP
API: sign-in, student invitation, first-login password change, check-in, homework,
returned feedback, attendance, settings, reminders and audit.

```bash
BASE_URL=http://localhost:3000 SMOKE_ADMIN_EMAIL=you@example.com SMOKE_ADMIN_PASSWORD='...' npm run smoke
```

It creates one throwaway student and one throwaway assignment and removes both
afterwards. Run it against staging after every deploy.

The GitHub Actions workflow provisions PostgreSQL, applies migrations, checks that
`preview.html` is in sync with `public/`, and runs the tests.

## Important production note

This is a deployment-ready application package, but no new system can honestly be described as battle-tested until it has been run with real users, real email delivery, production storage, monitoring and backups. Complete the launch checklist in `DEPLOYMENT_CHECKLIST.md`, run a limited pilot class first, and review the audit and error logs before opening it to every student.

## Editing the interface

`preview.html` is generated, not hand-written. It inlines the real
`public/styles.css`, `public/preview-mock.js` and `public/app.js` so the preview
runs the same screens and handlers as the deployed application, against an
in-browser mock API instead of PostgreSQL.

Edit the files in `public/`, then:

```bash
npm run build:preview
```

Never edit `preview.html` directly. CI fails if it is out of sync.

Preview data lives in browser storage until you select Reset data. The preview
has no Content-Security-Policy and no real database, so always confirm anything
security- or data-shaped against a running server rather than the preview alone.


## V16 changes

### Weekly tracker

- rebuilt as its own layout with fixed icon and label rows, so every tile in a
  row shares a baseline whatever the label says
- one short label per state, the same vocabulary for administrators and students
- column headings use the camera, speech and book icons rather than repeating
  three uppercase words for every week
- week headings show the check-in deadline in the class timezone, and the
  current week is marked
- cells waiting on a teacher reply carry a warm tint
- the legend explains the columns and the colours separately
- the student tracker is a responsive grid of week cards rather than one very
  wide table row, which previously overflowed and clipped its labels on any
  narrow screen
- more than one assignment in the same teaching week now renders a column each
  instead of silently hiding all but the last

### Correctness

- `date` columns are read as calendar days. They were being parsed into
  timestamps shifted by the server timezone, which made every week label on the
  administrator tracker fail to render against a real database
- the Content-Security-Policy allows the computed style attributes the interface
  sets, which were being dropped in production: rolling-form progress bars,
  Loom embeds and legend colours all rendered blank or collapsed
- unmatched `/api` paths return JSON rather than the application shell
- all deadlines are read and written in the class timezone
- arrow-key navigation in the review drawer survives typing in a feedback box
- soft deadlines read as open rather than missed while the server still accepts
  submissions
- the calendar colours its events by status, can be paged by month, and buckets
  deadlines by the class timezone
- the attendance drawer edits minutes and internal notes, not just status
- failed AI drafts can be regenerated from the review drawer
- resending an invitation revokes the sessions that used the old password
- saving email settings no longer resets the SMTP port and TLS setting
- toggles render as switches; the markup they needed was missing everywhere
- the health endpoint reports the running version

### Build

- `npm install` works from a clean checkout; `zod` and the OpenAI client had
  incompatible version ranges and installation failed outright
- `package-lock.json` is committed and the Docker image builds with `npm ci`
- `preview.html` is generated from `public/` by `npm run build:preview`
- `.gitignore` keeps `.env`, uploads and local database data out of the repository
- `npm run smoke` drives the whole workflow over the real HTTP API


## V17 changes

- **Dictation** in every feedback box, the check-in reply and student notes, using
  the VoiceKey pipeline and prompt, with a raw-transcript fallback
- **Voice notes** attached to returned feedback, served through an authenticated
  route with per-student access checks
- **Student profile and private notes**, reachable by clicking any student
- **Student weekly tracker** stacked one week per row, newest first, with the
  current week marked
- **Overdue** split out of Upcoming work; submitted work no longer appears in
  either, because it is not work to do
- **Logo** replaced with the Gaeilgeoir Guides mark plus the product name


## V18 changes

- **Homework is a calendar.** Teaching weeks are drawn in behind the deadlines, and
  a week with nothing set is labelled rather than left ambiguous. Click a day to
  set homework; click an assignment to edit it. A list view keeps the full actions.
- **Delete and archive** for both assignments and classes, with the impact stated
  first and archiving offered as the non-destructive alternative.
- **Calendar subscription** per person, plus per-assignment `.ics` downloads.
- **Invitation emails** rewritten: the sign-in link, the address and the temporary
  password appear both in the styled block and as plain text, because mail clients
  strip styling and phones will not let students copy from a button. The Classes
  and students screen now warns, permanently, when email is still in test mode and
  invitations are not actually being delivered.
- Returned-feedback markers on the student tracker are a counted badge that clears
  the moment the feedback is opened, and item names stay in the normal text colour.


## V19 changes

- **Weekly check-in control.** Every week has its own switch, times, and hard or
  soft deadline, individually or in bulk. A soft deadline is honoured by the
  student form as well as the tracker.
- **One-off reminders.** Clicking a cell with nothing in it now shows why it is
  empty and offers a prefilled, editable, dictatable email. Refused once the
  student has submitted, and it records when they were last chased.
- **The sign-in page speaks to students**, who are most of the people using it:
  what the portal is, what they do on it, then the seanfhocal.
- The student cell on the tracker shows it can be opened rather than only
  revealing that on hover.


## V20 changes

- **Create a term of check-ins in one pass**: a date range, the weekly opening and
  closing times, and a per-week tick list so exceptions are set before anything is
  written.
- **The default release is Friday 2pm**, corrected from 3pm.
- **Old preview data no longer breaks the preview.** The browser keeps its
  database between visits, so anyone carrying an older one was missing collections
  added since — clicking a student threw "Cannot read properties of undefined".
  Stored data is now reconciled against the current shape on load, which also
  covers every future addition.


## V21 changes

- **Returned feedback turns the tracker green immediately.** It used to wait until
  the review queue emptied, so working through a batch left every finished cell
  still showing orange.
- **Course withdrawal form** under Settings, deliberately tucked away. Submitting
  it stops reminders, nudges and new work, and marks the student as withdrawn on
  the tracker without hiding anything they did.
- **How the class is going**: retention and work-submitted figures on the class
  tracker, both excluding switched-off weeks and withdrawn students.
- The student account screen is now **Settings**, holding the password, the
  calendar subscription and the withdrawal form.


## V22 changes

- **Homework can accept file uploads**, per assignment, with the formats you choose
  and a limit on how many. Uploads are read into text on arrival and feed the
  Irish corrections.
- **Student work and voice notes are no longer in the public uploads directory.**
  They were reachable by URL without signing in — unguessable, but public. They
  now live in `PRIVATE_UPLOAD_DIR` and are served only through authenticated
  routes. Files written before this change are still read from the old location.
- **Settings moved out of the student sidebar** to the name in the top right, and
  the withdrawal form now sits two disclosures deep under Options → Stepping Back.
- **The student calendar subscription is gone**; the administrator feed stays.
- **A week with no homework says so** on the student tracker rather than quietly
  dropping the column, which made an empty week look like a loading failure.


## V23 changes

- **Students can see what they submitted.** Opening a submitted or returned
  check-in or assignment now shows their own answers and uploaded files, not just
  a confirmation banner.
- **Submitted is green on the student tracker**, not orange. Orange belongs to the
  administrator's tracker, where it means the work is waiting on you. `Submitted`
  and `Returned` are both green and told apart by the label, with the counted
  badge on returned work until it is opened.

## V28 changes

Three additions, all of which sit alongside the existing work rather than
changing it. Nothing about check-ins, homework, attendance or feedback moved.

- **The weekly class link.** A join address on the class, shown to students as a
  banner whose wording tightens as the class approaches. Worked out from the day,
  time and timezone the class already carries, so there is no weekly field to
  keep filling in. A single week can override the link; every other week falls
  back to the class one.
- **The class board.** One feed per class in the shape people know from Skool:
  composer, category pills, post cards with likes and comment counts, a drawer
  for comments, and a side column with the class card and the month's most
  active members. Pin, close and reversible removal for the administrator, and an
  unread badge that only counts what somebody else wrote.

Also in this release:

- A drawer opened without a footer no longer prints the word `undefined` along
  its bottom edge. This affected any future drawer whose actions sit inline in
  the body, which is how the board reads.
- `tests/classtime.test.js` and `tests/community.test.js` cover the new logic. The board tests need a database
  and run under `RUN_DB_TESTS=1` like the other database tests.
- The preview mock carries its own copy of the next-class calculation, and
  `tests/preview-mock.test.js` now holds it level with the server's, the same way
  it already does for student progress.
- Migrations `009_class_join_link`, `010_materials`, `011_community` and
  `012_community_feed`.

## V29 changes

The board became a proper feed, the course materials library was withdrawn, and
the portal was renamed.

- **Course materials is gone.** Everything it held belongs either on the
  assignment it supports or in a post on the feed, which is where people look.
  Migration `013` drops the table; uploaded files stay on disk.
- **Attachments on posts.** PDFs (administrator), Loom videos and GIFs (anyone).
  Loom plays inside the post rather than sending somebody to another tab, and
  GIFs play in the feed.
- **A GIF picker**, proxied through the server so the content security policy
  stays shut and the API key stays server-side. Needs `GIPHY_API_KEY`.
- **Scheduled posts.** Give a post a time and it stays invisible and silent until
  then. No worker involved: every read filters on the clock.
- **Latest and Hot** replace newest and top-by-likes. Hot is comments decayed
  against recency.
- **Profile pictures**, required of every new student on first login and used
  everywhere the feed shows a face.
- **A visual pass over the whole feed** — one continuous surface with hairline
  separators rather than a stack of identical floating cards, stronger headline
  typography, and quieter chrome.
- **Renamed to Class Portal**, in the interface, the emails and the calendar
  feed.
- **Nothing about AI reaches a student.** Dictation is gated inside the button
  itself, and the drafting columns and the `ai_drafted` state are stripped from
  every student-facing payload rather than merely hidden on screen.

Migrations `013_feed_attachments_avatars` and `014_gif_attachments`. New tests:
`tests/student-privacy.test.js`, plus scheduling, attachment, Hot-ranking and
like coverage in `tests/community.test.js`.

## V30 changes

- **Emoji reactions** replace the single heart. Eight to choose from, one click
  each, counted per emoji with your own highlighted. Migration `015` keeps every
  existing like as the heart it already was.
- **YouTube**, alongside Loom — and neither has a field any more. Paste the link
  into the body of the post and the player appears; the link leaves the text.
  Migration `016` allows the new attachment kind.
- **The member count** is gone from the community side card.

`tests/videolinks.test.js` covers every YouTube shape people actually paste —
`youtu.be`, `watch?v=`, `shorts`, `live`, extra query parameters, the same video
twice — and confirms that a Vimeo or ordinary link is left alone.

## V31 changes

- **One reaction each.** Holding several at once turned the row into a
  scoreboard — five chips on a post four people had seen — and left no way to
  read at a glance how many had actually responded. Migration `017` keeps
  everybody's most recent choice and narrows the key back.
- **One user section.** The name and avatar sat in both the sidebar footer and
  the top bar; the sidebar copy is gone and account settings open from the chip
  in the top right.

## V32 changes

- **Word documents.** Posts now take a `.docx` as well as a PDF.
- **Uploads that were being refused now work.** The type was taken from what the
  browser claimed rather than from the file, so a PDF labelled
  `application/octet-stream` — which is how one arrives out of several file
  managers — was rejected before it reached the route that would have accepted
  it. The first bytes decide instead: `%PDF` for a PDF, a zip signature plus a
  `.docx` extension for Word. A file renamed to `.pdf` is still refused.
- **An oversized file says so.** Multer's own errors carry a code rather than a
  status, so they were falling through as "Something went wrong" — which tells
  the person uploading nothing and invites them to try the same file again. The
  cap is now 40MB and the message names it.

## V33 changes

- **Posting with a file attached failed.** An uploaded document comes back as a
  path under `/uploads` rather than a full web address, and the attachment
  schema demanded a complete URL — so the whole body failed to validate and the
  error said *Give the post a title and a message*, sending you back to a form
  that was already filled in. Uploaded paths are accepted now, `javascript:` and
  `data:` addresses are not, and a genuine attachment problem says it is an
  attachment problem.
- **A proper file uploader**, in the Untitled UI shape the rest of the interface
  already borrows from: a dashed drop zone that takes drag-and-drop or a click,
  then a row per file with its format on a coloured badge, its size, a real
  progress bar while it uploads and a tick when it lands. Files can be removed
  before posting, several can go at once, and one that is too large is refused
  on the spot with the reason on the row rather than after a minute of uploading.

## V34 changes

- **Courses.** Class recordings arranged into sections and lessons, with a
  player page, notes, handouts and per-student progress. Students mark a lesson
  complete or not complete, and a lesson watched past nine tenths ticks itself.
  Course cards show how far through each one somebody is, and opening a course
  resumes at the first lesson they have not finished.
- **The video host is a field, not an assumption.** Bunny Stream, YouTube, Loom
  or a file we serve — chosen per lesson. Zoom recordings cannot be embedded, so
  the file has to live somewhere that will play it, and which somewhere is a
  decision about cost and about mobile data rather than one for the schema.
- **Courses in both navigations**, including the bar at the bottom on a phone.

Migration `018_courses`. New tests: `tests/courses.test.js` and
`tests/lessonvideo.test.js`.

## V35 changes

- **Recordings come across from Zoom by themselves.** A Server-to-Server OAuth
  app lists what is on the account; pressing Import brings one over to Bunny
  Stream and creates a draft lesson with its date and length filled in. A
  recurring webinar can be named once and its recordings then arrive on their
  own.
- **Nothing imports because it merely exists.** A Zoom account holds
  one-to-ones and test calls; every recording is listed and ignored until told
  otherwise, and marking a webinar as automatic is a separate switch from
  naming it.
- **Signed playback.** With a Bunny token key set, every playback URL is minted
  per request with a six-hour expiry, so a forwarded link stops working. Nothing
  stored in the database is a working link.
- **The Zoom copy is never touched.** Read scopes only.
- **The webhook is signature-verified against the raw bytes**, refuses
  everything when no secret is set, and cannot import a webinar nobody asked
  for even when the signature is good.

Migration `019_zoom_import`. New tests: `tests/zoom.test.js` and
`tests/bunny.test.js`.
