// Shared types for the teacher console's admin payloads, and the state helpers the tracker, review
// drawer, people screen and class setup all lean on. Ported from the old hub's app.js, so the
// statuses, colours and wording stay exactly as the teacher knows them.
import { type AdminClass, DAY_NAMES } from "@/lib/portal";

/* ---- rows as the server sends them ---- */

export type ClassRow = AdminClass & {
    label?: string;
    join_url?: string | null;
    join_note?: string | null;
    starts_on?: string | null;
    ends_on?: string | null;
    student_count?: number;
    active?: boolean;
};

export type Week = {
    id: string;
    class_id: string;
    week_start: string;
    checkin_enabled: boolean;
    checkin_release_at: string;
    checkin_due_at: string;
    checkin_hard_deadline: boolean | null;
    label: string | null;
    notes: string | null;
    join_url: string | null;
};

export type TrackerStudent = { id: string; name: string; email: string; withdrawn_at: string | null; withdrawal_reason: string | null };

export type AssignmentQuestion = { id: string; position: number; prompt: string; imageUrl: string | null; required: boolean; expectedAnswer: string | null; marks: number };
export type Assignment = {
    id: string;
    class_id: string;
    week_id: string | null;
    title: string;
    instructions: string;
    visible_at: string;
    deadline_at: string;
    hard_deadline: boolean | null;
    reopened_until: string | null;
    status: string;
    kind: "written" | "listening" | string;
    questions: AssignmentQuestion[];
    allow_uploads?: boolean;
};

export type AttendanceStatus = "live" | "partial" | "missed" | "recording" | "unknown";
export type Attendance = { id: string; week_id: string; student_id: string; status: AttendanceStatus; minutes: number; source: string; notes: string | null; updated_at: string };

export type VoiceNote = { url: string; mime: string; seconds: number; recordedAt: string };
export type FeedbackState = "none" | "generating" | "ai_drafted" | "teacher_edited" | "returned" | "failed";

export type CheckinAnswers = { support?: string; reviewed?: string; weeklyWin?: string; attendance?: string; confidence?: number | string; understanding?: number | string };
export type Checkin = {
    id: string;
    week_id: string;
    student_id: string;
    status: "draft" | "submitted" | "returned";
    answers: CheckinAnswers | null;
    submitted_at: string | null;
    ai_feedback: string | null;
    teacher_feedback: string | null;
    feedback_state: FeedbackState;
    feedback_returned_at: string | null;
    feedback_read_at: string | null;
    voice_note: VoiceNote | null;
};

export type HomeworkFile = { id: string; fileName: string; mimeType: string; sizeBytes: number; extractionState: string; extractedText: string | null };
export type Mark = { position: number; awarded: number; available: number; note: string };
export type Homework = {
    id: string;
    assignment_id: string;
    student_id: string;
    status: "draft" | "submitted" | "returned";
    answers: unknown[] | null;
    submitted_at: string | null;
    submitted_late: boolean | null;
    ai_corrections: string | null;
    ai_general_feedback: string | null;
    teacher_corrections: string | null;
    teacher_general_feedback: string | null;
    feedback_state: FeedbackState;
    ai_marks: Mark[] | null;
    ai_score: number | null;
    ai_max: number | null;
    teacher_marks: Mark[] | null;
    teacher_score: number | null;
    teacher_max: number | null;
    listening_dialect: string | null;
    listening_plays: number | null;
    files: HomeworkFile[];
    voice_note: VoiceNote | null;
};

export type Tracker = {
    class: ClassRow & { label: string };
    weeks: Week[];
    students: TrackerStudent[];
    assignments: Assignment[];
    attendance: Attendance[];
    checkins: Checkin[];
    homework: Homework[];
};

export type EngagementItem = { kind: "checkin" | "homework"; id: string; label: string | null; weekStart?: string; dueAt: string; expected: number; submitted: number; rate: number | null; missing: { id: string; name: string }[] };
export type Withdrawal = {
    id: string;
    student_id: string;
    class_id: string;
    reason: string;
    detail: string | null;
    overall_rating: number | null;
    teaching_rating: number | null;
    materials_rating: number | null;
    pace: string | null;
    what_worked: string | null;
    what_to_improve: string | null;
    would_recommend: string | null;
    may_contact: boolean;
    submitted_at: string;
    name?: string;
    email?: string;
};
export type Engagement = {
    class?: { id: string; label: string };
    people: { total: number; active: number; withdrawn: number };
    expected: { expected: number; submitted: number; checkins_due: number; assignments_due: number };
    retention: number | null;
    completion: number | null;
    items: EngagementItem[];
    withdrawals: Withdrawal[];
};

export type FeedbackReadReport = {
    class: { label: string };
    generatedAt: string;
    totals: { returned: number; opened: number; unopened: number; rate: number | null; medianHoursToOpen: number | null };
    students: { id: string; name: string; email: string; withdrawn: boolean; returned: number; opened: number; rate: number | null; lastOpened: string | null }[];
    unopened: { kind: "checkin" | "homework"; title: string; studentId: string; name: string; returnedAt: string }[];
};

export type StudentRow = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    active: boolean;
    must_change_password: boolean;
    last_login_at: string | null;
    class_id: string | null;
    programme_name: string | null;
    day_of_week: number | null;
    start_time: string | null;
    timezone: string | null;
    /** the type of the class they are in: "irish_for_primary" or "hibernia" */
    course_type?: string | null;
    classLabel: string | null;
};

export type NudgeSettings = { checkinSubject?: string; checkinBody?: string; homeworkSubject?: string; homeworkBody?: string };
export type Drafting = { corrections?: boolean; generalFeedback?: boolean; checkins?: boolean; board?: boolean };
export type Settings = { email?: { provider?: string; configured?: boolean }; nudge?: NudgeSettings; drafting?: Drafting };

export type Note = { id: string; student_id: string; author_id: string | null; body: string; pinned: boolean; created_at: string; updated_at: string; author_name: string | null };
export type ProfileStudent = {
    id: string;
    name: string;
    email: string;
    active: boolean;
    last_login_at: string | null;
    created_at: string;
    withdrawn_at: string | null;
    phone: string | null;
    address_line1: string | null;
    address_line2: string | null;
    address_county: string | null;
    eircode: string | null;
    address_updated_at: string | null;
    class_id: string | null;
    classLabel: string | null;
};
export type ProfileStats = { live_weeks: number; recorded_weeks: number; checkins_submitted: number; homework_submitted: number; avg_understanding: string | null; avg_confidence: string | null };
export type Profile = { student: ProfileStudent; notes: Note[]; stats: ProfileStats; withdrawal: Withdrawal | null };

export type ClassImpact = { class: { label: string }; students: number; assignments: number; weeks: number; checkins: number; submissions: number; attendance: number };
export type StudentImpact = {
    student: { id: string; name: string; email: string; withdrawn: boolean; classId: string | null; classLabel: string | null };
    checkins: number;
    submissions: number;
    files: number;
    attendance: number;
    posts: number;
    comments: number;
    notes: number;
    work: number;
};

export type ClassSession = { id: string; starts_at: string; duration_minutes: number; join_url: string | null; label: string | null; cancelled: boolean };
export type DateChangeKind = "running" | "skipped" | "recorded" | "moved";
export type DateChange = { onDate: string; kind: Exclude<DateChangeKind, "running">; movedTo: string | null; reason?: string };
export type SetupCourse = { id: string; title: string; open_to_all: boolean; enrolled: boolean };
export type RecordingRow = { id: string; name: string; lesson_count: number; completed_count: number; percent: number };
export type ClassSetup = { class: ClassRow & { label: string }; courses: SetupCourse[]; sessions: ClassSession[]; dateChanges: DateChange[]; recordings: RecordingRow[] };

export type ImportRow = { name?: string; email: string; phone?: string | null; status: string; error?: string; emailStatus?: string; was?: string | null };
export type ImportResult = { preview: boolean; total: number; created: number; updated: number; unchanged: number; notFound: number; duplicates: number; errors: number; results: ImportRow[] };
export type PhoneImportResult = {
    preview: boolean;
    unchanged: { name: string; email: string; phone: string }[];
    updated: { name: string; email: string; phone: string; was: string | null }[];
    unknown: { line: string; why: string }[];
    noPhone: { email: string }[];
    considered: number;
};

/* ---- labels and dates ---- */

export const classLabel = (row?: { label?: string; programme_name: string; day_of_week: number; start_time: string } | null) =>
    !row ? "" : row.label || `${row.programme_name} | ${DAY_NAMES[Number(row.day_of_week)]} | ${String(row.start_time).slice(0, 5)}`;

export const FALLBACK_TIMEZONE = "Europe/Dublin";

const timezoneOffsetMinutes = (date: Date, timeZone: string) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
};

/** ISO instant to the "YYYY-MM-DDTHH:mm" a datetime-local input expects, read in the class timezone. */
export const toZonedInput = (value: string | Date, timeZone = FALLBACK_TIMEZONE) => {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(date.getTime() + timezoneOffsetMinutes(date, timeZone) * 60000).toISOString().slice(0, 16);
};

/** The reverse: a wall-clock value typed into a datetime-local input, read in the class timezone. */
export const fromZonedInput = (text: string, timeZone = FALLBACK_TIMEZONE) => {
    const naive = new Date(`${text}:00Z`).getTime();
    if (!Number.isFinite(naive)) return new Date().toISOString();
    let instant = naive - timezoneOffsetMinutes(new Date(naive), timeZone) * 60000;
    instant = naive - timezoneOffsetMinutes(new Date(instant), timeZone) * 60000;
    return new Date(instant).toISOString();
};

export type FmtOptions = { time?: boolean; weekday?: boolean; dateStyle?: "short" | "medium" | "long"; timeZone?: string; timeOnly?: boolean };
/* Building an Intl.DateTimeFormat is the slow part of formatting, and the tracker formats a few
   thousand dates per paint, so each distinct set of options is built once and kept. */
const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (options: Intl.DateTimeFormatOptions) => {
    const key = JSON.stringify(options);
    let f = formatters.get(key);
    if (!f) formatters.set(key, (f = new Intl.DateTimeFormat("en-IE", options)));
    return f;
};
/* Intl refuses to mix the dateStyle/timeStyle shorthands with individual components, so the
   weekday variant spells every field out. */
export const fmtDate = (value: string | Date | null | undefined, options: FmtOptions = {}, zone = FALLBACK_TIMEZONE) => {
    if (!value) return "—";
    const timeZone = options.timeZone || zone;
    if (options.timeOnly) return formatter({ hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(value));
    const format: Intl.DateTimeFormatOptions = options.weekday
        ? { weekday: "short", day: "numeric", month: "short", ...(options.dateStyle === "short" ? {} : { year: "numeric" }), ...(options.time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}) }
        : { dateStyle: options.dateStyle || "medium", ...(options.time ? { timeStyle: "short" } : {}) };
    // en-IE puts a comma after the weekday, which reads badly next to the one before the time.
    return formatter({ ...format, timeZone }).format(new Date(value)).replace(/^(\p{L}{2,4}),\s/u, "$1 ");
};

/* week_start is a calendar day ("2026-07-20"). Older records may still arrive as a full timestamp,
   so take the date part either way and read it as UTC noon, which keeps the day stable everywhere. */
export const fmtWeek = (value: string | null | undefined) => {
    if (!value) return "";
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    return formatter({ day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};

/** Formats a duration the way a voice message does: 0:07, 1:24. */
export const fmtDuration = (seconds: number | null | undefined) => {
    const total = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export const fmtBytes = (bytes: number | null | undefined) => (!bytes ? "" : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export const DIALECT_LABELS: Record<string, string> = { connacht: "Connacht", munster: "Munster", ulster: "Ulster", standard: "Standard" };

export const firstName = (name: string) => name.trim().split(" ")[0] || name;

/* ---- tracker state ---- */

export type Tone = "grey" | "orange" | "green" | "red" | "plain";
export type TrackerIcon = "camera" | "talk" | "book" | "x";
export type CellState = { tone: Tone; icon: TrackerIcon; label: string; hint?: string; attention?: boolean };

export const effectiveDeadline = (a: Assignment) => {
    const deadline = new Date(a.deadline_at).getTime();
    const reopened = a.reopened_until ? new Date(a.reopened_until).getTime() : 0;
    return Math.max(deadline, reopened || 0);
};

/* Work is still open when the deadline is soft, whatever the clock says. Showing it as missed while
   the server would still accept the submission is worse than showing it as late. */
export const assignmentClosed = (a: Assignment, now = Date.now()) => a.hard_deadline !== false && now > effectiveDeadline(a);

export const attendanceState = (attendance?: Attendance | null): CellState => {
    if (attendance?.status === "live") return { tone: "green", icon: "camera", label: "Live", hint: "Attended live" };
    if (!attendance || attendance.status === "unknown") return { tone: "grey", icon: "camera", label: "No record", hint: "No attendance recorded for this week yet" };
    return { tone: "red", icon: "x", label: "Not live", hint: "Did not attend live. Watching the recording does not count." };
};

export type ReviewType = "attendance" | "checkin" | "homework";

export const adminTrackerState = (type: ReviewType, record: Attendance | Checkin | Homework | null | undefined, deadline?: string, assignment: Assignment | null = null, week: Week | null = null): CellState => {
    // Work handed in after a soft deadline is marked so it can be seen at a glance.
    if (type === "homework" && (record as Homework | undefined)?.submitted_late && record?.status !== "draft") {
        return record?.status === "returned"
            ? { tone: "green", icon: "book", label: "Returned", hint: "Handed in late" }
            : { tone: "orange", icon: "book", label: "To review, late", hint: "Handed in after the deadline" };
    }
    if (type === "attendance") return attendanceState(record as Attendance | undefined);
    const icon: TrackerIcon = type === "homework" ? "book" : "talk";
    const noun = type === "homework" ? "Homework" : "Check-in";
    const row = record as Checkin | Homework | null | undefined;
    if (row?.status === "returned") return { tone: "green", icon, label: "Returned", hint: `${noun} feedback has been returned to the student` };
    if (row?.status === "submitted") {
        return row.feedback_state === "ai_drafted"
            ? { tone: "orange", icon, label: "Draft ready", hint: `${noun} submitted. An AI draft is ready for you to edit and return.`, attention: true }
            : { tone: "orange", icon, label: "To review", hint: `${noun} submitted and waiting for your reply`, attention: true };
    }
    if (assignment && !assignmentClosed(assignment)) {
        return Date.now() > effectiveDeadline(assignment)
            ? { tone: "grey", icon, label: "Open, late", hint: "Past the deadline but still accepting submissions" }
            : { tone: "grey", icon, label: "Open", hint: `${noun} open and not submitted yet` };
    }
    if (week && week.checkin_enabled === false) return { tone: "grey", icon, label: "Off", hint: "No check-in was set for this week" };
    if (week && week.checkin_hard_deadline === false && deadline && Date.now() > new Date(deadline).getTime()) {
        return { tone: "grey", icon, label: "Open, late", hint: "Past the deadline but still accepting check-ins" };
    }
    if (deadline && Date.now() > new Date(deadline).getTime()) return { tone: "red", icon: "x", label: "Missed", hint: `The deadline passed with no ${noun.toLowerCase()}` };
    return { tone: "grey", icon, label: "Open", hint: `${noun} open and not submitted yet` };
};

export type TrackerMaps = { attendance: Map<string, Attendance>; checkins: Map<string, Checkin>; homework: Map<string, Homework>; assignmentsByWeek: Map<string, Assignment[]> };
export const trackerMaps = (t: Tracker): TrackerMaps => {
    const attendance = new Map(t.attendance.map((r) => [`${r.student_id}:${r.week_id}`, r]));
    const checkins = new Map(t.checkins.map((r) => [`${r.student_id}:${r.week_id}`, r]));
    const homework = new Map(t.homework.map((r) => [`${r.student_id}:${r.assignment_id}`, r]));
    // A week can carry more than one assignment. Keeping a list rather than a single value stops
    // the second one disappearing from the tracker entirely.
    const assignmentsByWeek = new Map<string, Assignment[]>();
    for (const a of t.assignments) {
        if (!a.week_id) continue;
        assignmentsByWeek.set(a.week_id, [...(assignmentsByWeek.get(a.week_id) || []), a]);
    }
    return { attendance, checkins, homework, assignmentsByWeek };
};

/** The weeks the tracker shows, and which one is "now". */
export const visibleWeeks = (t: Tracker) => {
    const thisMonday = toZonedInput(new Date(), t.class.timezone || FALLBACK_TIMEZONE).slice(0, 10);
    /* A coming week shows once homework filed in it is open: homework sits in the week of its
       deadline, and one set early and due a fortnight out is being handed in long before its week. */
    const openedWeeks = new Set(t.assignments.filter((a) => a.week_id && new Date(a.visible_at) <= new Date()).map((a) => a.week_id));
    const weeks = t.weeks.filter((w) => String(w.week_start).slice(0, 10) <= thisMonday || new Date(w.checkin_release_at) <= new Date() || openedWeeks.has(w.id));
    const currentWeekId = [...weeks].reverse().find((w) => String(w.week_start).slice(0, 10) <= thisMonday)?.id || weeks.at(-1)?.id;
    return { weeks, currentWeekId };
};

/* ---- the review drawer's record ---- */

/** Which cell was opened: the keys, re-resolved against the tracker whenever it reloads. */
export type ReviewKey = { type: ReviewType; studentId: string; weekId: string; assignmentId?: string };
export type ReviewRecord = {
    type: ReviewType;
    student: TrackerStudent;
    week: Week;
    attendance: Attendance | null;
    checkin: Checkin | null;
    assignment: Assignment | null;
    homework: Homework | null;
};

export const recordForReview = (t: Tracker, key: ReviewKey): ReviewRecord | null => {
    const student = t.students.find((r) => r.id === key.studentId);
    const week = t.weeks.find((r) => r.id === key.weekId);
    if (!student || !week) return null;
    const attendance = t.attendance.find((r) => r.student_id === key.studentId && r.week_id === key.weekId) || null;
    const checkin = t.checkins.find((r) => r.student_id === key.studentId && r.week_id === key.weekId) || null;
    const assignment = key.assignmentId ? t.assignments.find((r) => r.id === key.assignmentId) || null : null;
    // A homework cell whose assignment has gone (archived or deleted since the tracker loaded) has
    // nothing to show; the drawer reads assignment fields without checking, so refuse here instead.
    if (key.type === "homework" && !assignment) return null;
    const homework = assignment ? t.homework.find((r) => r.student_id === key.studentId && r.assignment_id === assignment.id) || null : null;
    return { type: key.type, student, week, attendance, checkin, assignment, homework };
};

/** Every student with a submitted piece of this kind for this week or assignment, in tracker order. */
export const buildReviewQueue = (t: Tracker, type: ReviewType, weekId: string, assignmentId?: string): ReviewKey[] =>
    t.students
        .map((s) => ({ key: { type, studentId: s.id, weekId, assignmentId } as ReviewKey, rec: recordForReview(t, { type, studentId: s.id, weekId, assignmentId }) }))
        .filter(({ rec }) => (type === "checkin" ? rec?.checkin && rec.checkin.status !== "draft" : rec?.homework && rec.homework.status !== "draft"))
        .map(({ key }) => key);

/* Which of the drafts are switched on, for one kind of work. `null` from the bootstrap means the
   server did not say, and is read as on. */
export const draftingFor = (drafting: Drafting | null | undefined, kind: "checkin" | "homework" | "board") => {
    if (!drafting) return { on: true, correctionsOnly: false };
    if (kind === "checkin") return { on: Boolean(drafting.checkins), correctionsOnly: false };
    if (kind === "board") return { on: Boolean(drafting.board), correctionsOnly: false };
    return { on: Boolean(drafting.corrections || drafting.generalFeedback), correctionsOnly: Boolean(drafting.corrections && !drafting.generalFeedback) };
};

/* ---- class dates and holidays (class setup) ---- */

const PUBLIC_HOLIDAYS = [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-02", name: "St Brigid's Day" },
    { date: "2026-03-17", name: "St Patrick's Day" },
    { date: "2026-04-06", name: "Easter Monday" },
    { date: "2026-05-04", name: "May Bank Holiday" },
    { date: "2026-06-01", name: "June Bank Holiday" },
    { date: "2026-08-03", name: "August Bank Holiday" },
    { date: "2026-10-26", name: "October Bank Holiday" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2026-12-26", name: "St Stephen's Day" },
    { date: "2026-12-28", name: "St Stephen's Day (substitute)" },
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-02-01", name: "St Brigid's Day" },
    { date: "2027-03-17", name: "St Patrick's Day" },
    { date: "2027-03-29", name: "Easter Monday" },
    { date: "2027-05-03", name: "May Bank Holiday" },
    { date: "2027-06-07", name: "June Bank Holiday" },
    { date: "2027-08-02", name: "August Bank Holiday" },
    { date: "2027-10-25", name: "October Bank Holiday" },
    { date: "2027-12-25", name: "Christmas Day" },
    { date: "2027-12-26", name: "St Stephen's Day" },
    { date: "2027-12-27", name: "Christmas Day (substitute)" },
    { date: "2027-12-28", name: "St Stephen's Day (substitute)" },
];
/* Ranges are inclusive at both ends. Indicative only. */
const SCHOOL_HOLIDAYS = [
    { from: "2026-10-26", to: "2026-10-30", name: "October mid-term" },
    { from: "2026-12-23", to: "2027-01-05", name: "Christmas holidays" },
    { from: "2027-02-15", to: "2027-02-19", name: "February mid-term" },
    { from: "2027-03-26", to: "2027-04-05", name: "Easter holidays" },
    { from: "2027-06-01", to: "2027-06-11", name: "State examinations" },
];

const datesBetween = (from: string, to: string) => {
    const days: string[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
};
const addDays = (date: string, days: number) => {
    const cursor = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
    cursor.setUTCDate(cursor.getUTCDate() + days);
    return cursor.toISOString().slice(0, 10);
};
type HolidayMark = { kind: "public" | "school"; name: string; date: string };
let holidayCache: Map<string, Omit<HolidayMark, "date">[]> | null = null;
const holidayIndex = () => {
    if (holidayCache) return holidayCache;
    const index = new Map<string, Omit<HolidayMark, "date">[]>();
    const add = (date: string, entry: Omit<HolidayMark, "date">) => index.set(date, [...(index.get(date) || []), entry]);
    for (const h of PUBLIC_HOLIDAYS) add(h.date, { kind: "public", name: h.name });
    for (const h of SCHOOL_HOLIDAYS) for (const d of datesBetween(h.from, h.to)) add(d, { kind: "school", name: h.name });
    for (const entries of index.values()) entries.sort((a, b) => (a.kind === "public" ? -1 : 1) - (b.kind === "public" ? -1 : 1));
    return (holidayCache = index);
};
/** What falls in the week beginning on a given Monday. */
export const holidaysInWeek = (weekStart: string): HolidayMark[] => {
    const index = holidayIndex();
    const found: HolidayMark[] = [];
    const seen = new Set<string>();
    for (const date of datesBetween(weekStart, addDays(weekStart, 6))) {
        for (const entry of index.get(date) || []) {
            const key = `${entry.kind}:${entry.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            found.push({ ...entry, date });
        }
    }
    return found;
};

/** The Monday of the week a date falls in. */
export const mondayOf = (date: string) => {
    const at = new Date(`${date}T12:00:00Z`);
    at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
    return at.toISOString().slice(0, 10);
};

/** Every date the weekly class falls on, between the first and last day. */
export const classDatesFor = (klass: { starts_on?: string | null; ends_on?: string | null; day_of_week: number }) => {
    const dates: string[] = [];
    // Stepped at midday UTC so a summer-time boundary cannot skip or repeat one.
    const cursor = new Date(`${String(klass.starts_on).slice(0, 10)}T12:00:00Z`);
    const end = new Date(`${String(klass.ends_on).slice(0, 10)}T12:00:00Z`);
    const wanted = Number(klass.day_of_week);
    while (((cursor.getUTCDay() + 6) % 7) + 1 !== wanted) cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor <= end && dates.length < 200) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return dates;
};

/** The error message off anything thrown, for toast(). */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
