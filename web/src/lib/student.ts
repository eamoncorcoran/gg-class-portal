// The student's side of the hub: the shape of GET /api/student/bootstrap and the small pure helpers
// the old app.js used to turn rows into tracker states ("To do", "Missed", "Returned"...). Ported
// line for line from public/app.js so the new tracker says exactly what the old one said.

export type Tone = "grey" | "orange" | "green" | "red" | "blue";
export type StatusIconName = "camera" | "talk" | "book" | "x";
export type StatusState = { tone: Tone; icon: StatusIconName; label: string; hint: string; unread?: boolean };

export type Week = {
    id: string;
    class_id: string;
    /** a calendar day, "2026-07-20" (older rows may carry a full timestamp) */
    week_start: string;
    checkin_enabled: boolean;
    checkin_release_at: string | null;
    checkin_due_at: string;
    checkin_hard_deadline?: boolean | null;
    checkin_available?: boolean;
    join_url?: string | null;
};

export type Attendance = { week_id: string; status: "live" | "unknown" | "absent" | string };

export type VoiceNote = { url: string; mime: string; seconds: number; recordedAt: string | null };

export type CheckinAnswers = { attendance?: string; reviewed?: string; understanding?: number; confidence?: number; weeklyWin?: string; support?: string };
export type Checkin = {
    id: string;
    week_id: string;
    status: "draft" | "submitted" | "returned";
    answers: CheckinAnswers | null;
    submitted_at?: string | null;
    feedback_read_at: string | null;
    teacher_feedback?: string | null;
    ai_feedback?: string | null;
    voice_note?: VoiceNote | null;
};

export type Question = { id: string; position: number; prompt: string; imageUrl: string | null; required: boolean };
export type Resource = { id: string; fileName: string; fileUrl: string; mimeType: string | null; file_name?: string; file_url?: string };
export type Dialect = { key: string; label: string | null };
export type Assignment = {
    id: string;
    week_id: string | null;
    title: string;
    kind: "written" | "listening" | string;
    deadline_at: string;
    reopened_until: string | null;
    hard_deadline: boolean | null;
    instructions?: string | null;
    loom_url?: string | null;
    questions: Question[];
    resources: Resource[];
    allow_uploads?: boolean;
    accepted_file_types?: string[] | null;
    max_files?: number | null;
    uploads_required?: boolean;
    listening_text?: string | null;
    listening_text_shown?: boolean;
};
/** GET /api/student/assignments/:id adds the open flags and the ready dialects (older payloads sent bare keys). */
export type AssignmentDetail = Assignment & { open: boolean; hardDeadline: boolean; acceptsLate: boolean; dialects?: (string | Dialect)[] };

export type HomeworkFile = { id: string; fileName: string; mimeType: string | null; sizeBytes: number; extractionState: "done" | "failed" | "pending" | string };
export type Mark = { position?: number; awarded: number; available: number };
export type Homework = {
    id: string;
    assignment_id: string;
    status: "draft" | "submitted" | "returned";
    answers: string[] | null;
    current_question?: number | null;
    submitted_late?: boolean;
    feedback_read_at: string | null;
    teacher_corrections?: string | null;
    teacher_general_feedback?: string | null;
    ai_corrections?: string | null;
    ai_general_feedback?: string | null;
    teacher_score?: number | null;
    teacher_max?: number | null;
    teacher_marks?: Mark[] | null;
    voice_note?: VoiceNote | null;
    files?: HomeworkFile[];
};

export type NextClass = { startsAt: string; timezone: string; minutesAway: number; live: boolean; soon: boolean; joinUrl: string | null; note: string | null; movedFrom?: string | null; weekStart?: string };
export type ThisWeek = { kind: "skipped" | "recorded" | "moved" | string; reason: string; movedTo: string | null };
export type ClassDate = { onDate: string; kind: "running" | "moved" | "recorded" | "skipped" | "extra" | string; at: string; minutes?: number; label?: string; reason?: string; joinUrl?: string | null };
export type Progress = { checkins: number; homework: number; total: number; next: number | null; toNext: number; towards: number; justHit: number | null };
export type Dismissal = { kind: "checkin" | "homework"; refId: string };

export type StudentClass = { id: string; programme_name: string; day_of_week: number; start_time: string; timezone?: string | null; label: string; join_url?: string | null; join_note?: string | null; has_community?: boolean; enrolled_at?: string | null };

export type StudentBootstrap = {
    student: { id: string; name: string; email: string; role: string };
    class: StudentClass | null;
    nextClass?: NextClass | null;
    classDates?: ClassDate[];
    thisWeek?: ThisWeek | null;
    hasCommunity?: boolean;
    liveClassroom?: boolean;
    liveReady?: boolean;
    liveNow?: boolean;
    weeks: Week[];
    attendance: Attendance[];
    checkins: Checkin[];
    assignments: Assignment[];
    homework: Homework[];
    notifications: number;
    enrolledAt?: string | null;
    progress?: Progress;
    dismissals?: Dismissal[];
    withdrawnAt: string | null;
    addressNeeded: boolean;
    serverNow?: string;
};

export const FALLBACK_TIMEZONE = "Europe/Dublin";
export const classTimezone = (data?: StudentBootstrap | null) => data?.class?.timezone || FALLBACK_TIMEZONE;

/** Formats a duration the way a voice message does: 0:07, 1:24. */
export const fmtDuration = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export type FmtDateOptions = { time?: boolean; weekday?: boolean; dateStyle?: "short" | "medium" | "long"; timeOnly?: boolean; timeZone?: string };
/* Intl refuses to mix the dateStyle/timeStyle shorthands with individual components, so the weekday
   variant spells every field out. */
export const fmtDate = (value: string | number | Date | null | undefined, options: FmtDateOptions = {}, tz = FALLBACK_TIMEZONE) => {
    if (!value) return ""; // the old app printed a dash here; the house rule is no em dashes in UI text
    const timeZone = options.timeZone || tz;
    if (options.timeOnly) return new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(value));
    const format: Intl.DateTimeFormatOptions = options.weekday
        ? {
              weekday: "short",
              day: "numeric",
              month: "short",
              ...(options.dateStyle === "short" ? {} : { year: "numeric" }),
              ...(options.time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
          }
        : { dateStyle: options.dateStyle || "medium", ...(options.time ? { timeStyle: "short" } : {}) };
    // en-IE puts a comma after the weekday, which reads badly next to the one before the time:
    // "Sun, 19 Jul, 20:00" becomes "Sun 19 Jul, 20:00".
    return new Intl.DateTimeFormat("en-IE", { ...format, timeZone }).format(new Date(value)).replace(/^(\p{L}{2,4}),\s/u, "$1 ");
};

/* week_start is a calendar day ("2026-07-20"). Older records may still arrive as a full timestamp,
   so take the date part either way and read it as UTC noon, which keeps the day stable everywhere. */
export const fmtWeek = (value: string | null | undefined) => {
    if (!value) return "";
    const day = String(value).slice(0, 10);
    const date = new Date(`${day}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};

/** The hour, as somebody would say it: "7pm" rather than "19:00", "7.30pm" rather than "19:30". */
export const plainHour = (value: string | number | Date, timeZone = FALLBACK_TIMEZONE) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value)).map((p) => [p.type, p.value]));
    const hour24 = Number(parts.hour) % 24;
    const minute = Number(parts.minute);
    const hour12 = hour24 % 12 || 12;
    const suffix = hour24 < 12 ? "am" : "pm";
    return minute ? `${hour12}.${String(minute).padStart(2, "0")}${suffix}` : `${hour12}${suffix}`;
};

/* Anywhere in the line, not only at the start: a class note is usually written as a sentence,
   "7pm Irish · Passcode: 975967". The code stops at the next separator. */
export const passcodeOnly = (note: string | null | undefined) => {
    const text = String(note || "").trim();
    const match = /pass\s*code\s*[:\-]?\s*([^\s·|,;]+)/i.exec(text);
    return match ? match[1].trim() : text;
};

/* "Starts in 1 hours" was showing for the whole hour before every class, which is the hour the
   banner matters most. */
export const hoursOrMinutes = (minutes: number) => {
    if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
    const hours = Math.round(minutes / 60);
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
};

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] as string);
/** The teacher's **bold**, *italic* and line breaks, as HTML. Everything else is escaped first. */
export const richText = (value: string | null | undefined) =>
    escapeHtml(String(value ?? ""))
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/\n/g, "<br>");

export const fmtBytes = (bytes: number | null | undefined) => {
    if (!bytes) return "";
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const effectiveDeadline = (assignment: Pick<Assignment, "deadline_at" | "reopened_until">) => {
    const deadline = new Date(assignment.deadline_at).getTime();
    const reopened = assignment.reopened_until ? new Date(assignment.reopened_until).getTime() : 0;
    return Math.max(deadline, reopened || 0);
};

/* Work is still open when the deadline is soft, whatever the clock says. Showing it as missed while
   the server would still accept the submission is worse than showing it as late. */
export const assignmentClosed = (assignment: Pick<Assignment, "deadline_at" | "reopened_until" | "hard_deadline">, now = Date.now()) => assignment.hard_deadline !== false && now > effectiveDeadline(assignment);

export const attendanceState = (attendance: Attendance | undefined): StatusState => {
    if (attendance?.status === "live") return { tone: "green", icon: "camera", label: "Live", hint: "Attended live" };
    if (!attendance || attendance.status === "unknown") return { tone: "grey", icon: "camera", label: "No record", hint: "No attendance recorded for this week yet" };
    return { tone: "red", icon: "x", label: "Not live", hint: "Did not attend live. Watching the recording does not count." };
};

/* Student-facing colours. Orange is reserved for the teacher's own tracker, where it means "this is
   waiting on you". From a student's side, handing work in is a good outcome, so submitted is green
   and the label carries the difference. */
export const homeworkState = (submission: Homework | undefined, assignment: Assignment, now = Date.now()): StatusState => {
    // A soft deadline accepts late work and says so rather than hiding it.
    if (submission?.submitted_late && submission.status !== "draft") {
        return submission.status === "returned"
            ? { tone: "green", icon: "book", label: "Returned", hint: "Handed in late, and marked" }
            : { tone: "green", icon: "book", label: "Submitted late", hint: "Handed in after the deadline" };
    }
    if (submission?.status === "returned") return { tone: "green", icon: "book", label: "Returned", hint: "Corrections and feedback have been returned. Open it to read them." };
    if (submission?.status === "submitted") return { tone: "green", icon: "book", label: "Submitted", hint: "Submitted. Open it to see what you sent." };
    if (assignmentClosed(assignment, now)) return { tone: "red", icon: "x", label: "Missed", hint: "The deadline passed without a submission" };
    if (now > effectiveDeadline(assignment)) return { tone: "grey", icon: "book", label: "Open, late", hint: "Past the deadline but still accepting submissions" };
    return { tone: "grey", icon: "book", label: "To do", hint: "Open and not submitted yet" };
};

export const checkinState = (checkin: Checkin | undefined, week: Week, tz = FALLBACK_TIMEZONE, now = Date.now()): StatusState => {
    if (checkin?.status === "returned") return { tone: "green", icon: "talk", label: "Returned", hint: "Your teacher has replied. Open it to read the reply." };
    if (checkin?.status === "submitted") return { tone: "green", icon: "talk", label: "Submitted", hint: "Submitted. Open it to see what you sent." };
    if (week.checkin_enabled === false) return { tone: "grey", icon: "talk", label: "Off", hint: "No check-in was set for this week" };
    /* Before it opens it is still worth seeing, so it is on the calendar from the start of its week
       saying when it can be done rather than appearing out of nowhere on the Friday. */
    if (week.checkin_release_at && now < new Date(week.checkin_release_at).getTime()) {
        return { tone: "grey", icon: "talk", label: "Opens Friday", hint: `Opens ${fmtDate(week.checkin_release_at, { weekday: true, time: true, dateStyle: "short" }, tz)}` };
    }
    if (now > new Date(week.checkin_due_at).getTime()) {
        // A soft deadline keeps accepting late check-ins, so it is not a miss.
        return week.checkin_hard_deadline === false
            ? { tone: "grey", icon: "talk", label: "Open, late", hint: "Past the deadline but still accepting check-ins" }
            : { tone: "red", icon: "x", label: "Missed", hint: "The check-in deadline passed without a submission" };
    }
    return { tone: "grey", icon: "talk", label: "To do", hint: "Open and not submitted yet" };
};

/** The bootstrap's rows indexed the way the tracker reads them. */
export const studentMaps = (data: StudentBootstrap) => {
    const assignmentsByWeek = new Map<string, Assignment[]>();
    data.assignments.forEach((a) => {
        if (!a.week_id) return;
        assignmentsByWeek.set(a.week_id, [...(assignmentsByWeek.get(a.week_id) || []), a]);
    });
    return {
        attendance: new Map(data.attendance.map((r) => [r.week_id, r])),
        checkins: new Map(data.checkins.map((r) => [r.week_id, r])),
        homework: new Map(data.homework.map((r) => [r.assignment_id, r])),
        assignmentsByWeek,
    };
};

export const studentProgress = (data?: StudentBootstrap | null): Progress => data?.progress || { checkins: 0, homework: 0, total: 0, next: null, toNext: 0, towards: 0, justHit: null };

/** `kind:ref` for a dismissal: the week for a check-in, the assignment for homework. */
export const isDismissed = (data: StudentBootstrap, kind: Dismissal["kind"], refId: string) => (data.dismissals || []).some((row) => row.kind === kind && row.refId === refId);

export const DIALECT_LABELS: Record<string, string> = { connacht: "Connacht", munster: "Munster", ulster: "Ulster", standard: "Standard" };

/* What the tab says. The teacher's own label wins, so a recording can be tagged "Corca Dhuibhne" or
   named after the speaker. A single recording filed under standard means "no particular dialect",
   so it gets no tag at all unless the teacher wrote one. */
export const dialectTag = (entry: Dialect | undefined | null) => {
    if (!entry) return "";
    if (entry.label) return entry.label;
    if (entry.key === "standard") return "";
    return DIALECT_LABELS[entry.key] || entry.key;
};
export const normaliseDialects = (list: (string | Dialect)[] | undefined | null): Dialect[] => (Array.isArray(list) ? list : []).map((e) => (typeof e === "string" ? { key: e, label: null } : e));

export const homeworkHasIntro = (assignment: Pick<Assignment, "instructions"> | null | undefined) => Boolean(String(assignment?.instructions || "").trim());

export const CHECKIN_LABELS: Record<string, string> = {
    attendance: "Did you attend or watch this week's class?",
    reviewed: "Did you review this week's material?",
    understanding: "How well do you understand this week’s material?",
    confidence: "How confident are you feeling?",
    weeklyWin: "What's your weekly win?",
    support: "Anything you are struggling with?",
};

/** A week's class sitting, for the class-info dialog: the first sitting dated inside that week. */
export const sittingsForWeek = (dates: ClassDate[] | undefined, weekStart: string) => {
    const start = new Date(`${String(weekStart).slice(0, 10)}T00:00:00Z`).getTime();
    const end = start + 7 * 86400000;
    return (dates || []).filter((d) => {
        const t = new Date(`${d.onDate}T00:00:00Z`).getTime();
        return t >= start && t < end;
    });
};
