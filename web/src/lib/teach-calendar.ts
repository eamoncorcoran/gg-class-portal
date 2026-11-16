// Types and date helpers for the teacher's Calendar and Weekly check-ins sections, ported from the
// old hub's app.js (classTimezone, toZonedInput, fromZonedInput, fmtDate, fmtWeek and friends).
// Deadlines belong to the class, not to whoever happens to be looking at them, so everything is
// formatted in the class timezone: a teacher marking work abroad sees the same closing time as
// the students it applies to.
import { DAY_NAMES } from "@/lib/portal";

export const FALLBACK_TIMEZONE = "Europe/Dublin";

/* ---- payload shapes (see ~/gg-homework-portal/src/routes/admin.js) ---- */

export type AdminClassRow = {
    id: string;
    programme_name: string;
    day_of_week: number;
    start_time: string;
    timezone?: string | null;
    active?: boolean;
    join_url?: string | null;
    join_note?: string | null;
    has_community?: boolean;
    starts_on?: string | null;
    ends_on?: string | null;
    student_count?: number;
    label?: string;
};

export type AssignmentQuestion = {
    id?: string;
    position?: number;
    prompt: string;
    imageUrl?: string | null;
    required: boolean;
    expectedAnswer?: string | null;
    marks?: number | null;
};

export type AssignmentResource = { id?: string; fileName: string; fileUrl: string; mimeType?: string | null };

export type AssignmentKind = "written" | "listening";
export type FileTypeKey = "image" | "pdf" | "word" | "text";

export type Assignment = {
    id: string;
    class_id: string;
    week_id: string | null;
    title: string;
    instructions: string;
    loom_url: string | null;
    visible_at: string;
    deadline_at: string;
    hard_deadline: boolean;
    reopened_until: string | null;
    reminders_enabled: boolean;
    status: "draft" | "published" | "archived";
    allow_uploads: boolean;
    uploads_required: boolean;
    accepted_file_types: FileTypeKey[];
    max_files: number;
    kind: AssignmentKind;
    listening_text: string | null;
    listening_text_shown: boolean;
    programme_name?: string;
    day_of_week?: number;
    start_time?: string;
    timezone?: string | null;
    questions: AssignmentQuestion[];
    resources: AssignmentResource[];
    classLabel?: string;
};

/** What the create/edit form sends (POST /assignments, PUT /assignments/:id). */
export type AssignmentPayload = {
    classId: string;
    title: string;
    instructions: string;
    loomUrl: string | null;
    visibleAt: string;
    deadlineAt: string;
    hardDeadline: boolean;
    remindersEnabled: boolean;
    allowUploads: boolean;
    uploadsRequired: boolean;
    acceptedFileTypes: FileTypeKey[];
    maxFiles: number;
    status: Assignment["status"];
    questions: { prompt: string; imageUrl: string | null; required: boolean; expectedAnswer: string; marks: number }[];
    resources: AssignmentResource[];
    kind: AssignmentKind;
    listeningText: string;
    listeningTextShown: boolean;
};

export type TeachingWeek = {
    id: string;
    class_id: string;
    week_start: string;
    checkin_enabled: boolean;
    checkin_release_at: string;
    checkin_due_at: string;
    checkin_hard_deadline: boolean;
    label: string | null;
    notes: string | null;
    programme_name: string;
    day_of_week: number;
    start_time: string;
    timezone: string | null;
    classLabel: string;
};

export type SittingKind = "running" | "moved" | "recorded" | "skipped" | "extra";
export type ClassSitting = {
    onDate: string;
    kind: SittingKind;
    at: string;
    reason?: string;
    label?: string;
    minutes?: number;
    classId: string;
    classLabel: string;
    timezone: string | null;
    joinUrl: string | null;
    note: string | null;
};

export type MockOralDay = {
    id: string;
    date: string;
    number: number;
    label: string;
    examiners: number;
    bookingOpen: boolean;
    classIds: string[] | null;
    note: string;
    capacity: number;
    booked: number;
    free: number;
    percent: number;
    students: number;
    past: boolean;
};
export type MockOralAdmin = { slotsPerExaminer: number; maxExaminers: number; days: MockOralDay[]; classes: { id: string; label: string; students: number }[] };

export type DialectKey = "connacht" | "munster" | "ulster" | "standard";
export type ListeningDialect = {
    key: DialectKey;
    label: string;
    hint: string;
    state: "none" | "pending" | "ready" | "failed";
    error: string | null;
    voice: string | null;
    seconds: number | null;
    sizeBytes: number | null;
    source: "upload" | "synthesis" | null;
    tag: string | null;
    originalName: string | null;
    synthesisable: boolean;
    stale: boolean;
};
export type ListeningData = { provider: string; configured: boolean; standIn: boolean; dialects: ListeningDialect[] };
export type RenderResult = { results: { dialect: string; state: string; error?: string | null }[] };
export type RenderAllResult = { made: number; failed: { id?: string; title?: string; dialect?: string; error: string }[] };

export type ImportRow = {
    line: number;
    title: string;
    localVisible: string | null;
    localDeadline: string | null;
    opensAssumed?: boolean;
    past?: boolean;
    hardDeadline: boolean;
    kind: AssignmentKind;
    questions: string[];
    weekLabel: string | null;
    problems: string[];
};
export type ImportPreview = { timezone: string; rows: ImportRow[]; ready: number; problems: number; listening: number };
export type ImportResult = { created: number; listening: number; skipped: ImportRow[] };

export type MovePrevious = { deadlineAt: string; visibleAt: string | null; reopenedUntil: string | null; weekId: string | null };
export type MoveResult = Assignment & { moved: number; previousDay?: string; previous: MovePrevious; keptVisible?: boolean; restored?: boolean };

export type AssignmentImpact = { assignment: { id: string; title: string; status: string }; submissions: number; returned: number; drafts: number };
export type WeekImpact = { id: string; week_start: string; label: string | null; checkin_enabled: boolean; checkins: number; attendance: number; assignments: number; work: number };
export type CalendarFeed = { url: string; token: string };
export type UploadedFiles = { files: { fileName: string; mimeType: string; url: string }[] };

/* ---- constants ---- */

export const CLASS_KIND_LABEL: Record<SittingKind, string> = {
    running: "Class as usual",
    moved: "Moved to this time",
    recorded: "Pre-recorded this week",
    skipped: "No class this week",
    extra: "Extra class",
};

export const DIALECT_LABELS: Record<DialectKey, string> = { connacht: "Connacht", munster: "Munster", ulster: "Ulster", standard: "Standard" };
export const SYNTHESISABLE: DialectKey[] = ["connacht", "munster", "ulster"];

export const FILE_TYPE_CHOICES: { value: FileTypeKey; label: string; hint: string }[] = [
    { value: "image", label: "Photos and images", hint: "A photo or scan of handwritten work" },
    { value: "pdf", label: "PDF", hint: "Scans and exported documents" },
    { value: "word", label: "Word documents", hint: ".docx from Word, Pages or Google Docs" },
    { value: "text", label: "Plain text", hint: ".txt files" },
];

/** The chunky bordered field the old forms' inputs become (same look as DuoInput). */
export const FIELD_CLASS = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/80 focus:border-brand disabled:cursor-not-allowed disabled:opacity-50";
export const FIELD_COMPACT_CLASS = "rounded-xl border-2 border-secondary bg-primary px-3 py-2 text-sm font-medium text-primary outline-hidden transition duration-100 ease-linear focus:border-brand disabled:cursor-not-allowed disabled:opacity-50";

/* ---- timezone helpers ---- */

/** The class timezone to format in; the old app read it off the last-opened class, here the caller passes it. */
export const classTimezone = (tz?: string | null) => tz || FALLBACK_TIMEZONE;

export function timezoneOffsetMinutes(date: Date, timeZone: string) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
            .formatToParts(date)
            .map((part) => [part.type, part.value]),
    ) as Record<string, string>;
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** ISO instant to the "YYYY-MM-DDTHH:mm" a datetime-local input expects, read in the class timezone. */
export function toZonedInput(value: string | Date | null | undefined, timeZone: string = FALLBACK_TIMEZONE) {
    const date = value instanceof Date ? value : new Date(value ?? Date.now());
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() + timezoneOffsetMinutes(date, timeZone) * 60000).toISOString().slice(0, 16);
}

/** The reverse: a wall-clock value typed into a datetime-local input, read in the class timezone. */
export function fromZonedInput(text: string, timeZone: string = FALLBACK_TIMEZONE) {
    const naive = new Date(`${text}:00Z`).getTime();
    if (!Number.isFinite(naive)) return new Date().toISOString();
    let instant = naive - timezoneOffsetMinutes(new Date(naive), timeZone) * 60000;
    instant = naive - timezoneOffsetMinutes(new Date(instant), timeZone) * 60000;
    return new Date(instant).toISOString();
}

export type FmtDateOptions = { timeZone?: string; timeOnly?: boolean; weekday?: boolean; time?: boolean; dateStyle?: "short" | "medium" | "long" };

/* Intl refuses to mix the dateStyle/timeStyle shorthands with individual components, so the
   weekday variant spells every field out. */
export function fmtDate(value: string | Date | null | undefined, options: FmtDateOptions = {}) {
    if (!value) return "Not set";
    const timeZone = options.timeZone || FALLBACK_TIMEZONE;
    if (options.timeOnly) {
        return new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(value));
    }
    const format: Intl.DateTimeFormatOptions = options.weekday
        ? {
              weekday: "short",
              day: "numeric",
              month: "short",
              ...(options.dateStyle === "short" ? {} : { year: "numeric" }),
              ...(options.time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
          }
        : {
              dateStyle: options.dateStyle || "medium",
              ...(options.time ? { timeStyle: "short" } : {}),
          };
    // en-IE puts a comma after the weekday, which reads badly next to the one before the time:
    // "Sun, 19 Jul, 20:00" becomes "Sun 19 Jul, 20:00".
    return new Intl.DateTimeFormat("en-IE", { ...format, timeZone }).format(new Date(value)).replace(/^(\p{L}{2,4}),\s/u, "$1 ");
}

/* week_start is a calendar day ("2026-07-20"). Older records may still arrive as a full timestamp,
   so take the date part either way and read it as UTC noon, which keeps the day stable in every
   timezone. */
export function fmtWeek(value: string | null | undefined) {
    if (!value) return "";
    const day = String(value).slice(0, 10);
    const date = new Date(`${day}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export function timezoneAbbreviation(timeZone: string = FALLBACK_TIMEZONE) {
    const parts = new Intl.DateTimeFormat("en-IE", { timeZone, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
}

export function classLabel(row: { label?: string; programme_name: string; day_of_week: number; start_time: string } | null | undefined) {
    if (!row) return "";
    return row.label || `${row.programme_name} | ${DAY_NAMES[Number(row.day_of_week)]} | ${String(row.start_time).slice(0, 5)}`;
}

/** Calendar day for an instant, read in the class timezone rather than the viewer's. */
export function zonedDateParts(value: string | Date, timeZone: string = FALLBACK_TIMEZONE) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]),
    ) as Record<string, string>;
    return { year: Number(parts.year), month: Number(parts.month) - 1, day: Number(parts.day) };
}

/* ---- assignment state ---- */

export function effectiveDeadline(assignment: Pick<Assignment, "deadline_at" | "reopened_until">) {
    const deadline = new Date(assignment.deadline_at).getTime();
    const reopened = assignment.reopened_until ? new Date(assignment.reopened_until).getTime() : 0;
    return Math.max(deadline, reopened || 0);
}

/* Work is still open when the deadline is soft, whatever the clock says. Showing it as missed while
   the server would still accept the submission is worse than showing it as late. */
export function assignmentClosed(assignment: Pick<Assignment, "deadline_at" | "reopened_until" | "hard_deadline">, now = Date.now()) {
    return assignment.hard_deadline !== false && now > effectiveDeadline(assignment);
}

/* ---- small text helpers ---- */

/* A web address as somebody pasted it. A link copied out of a browser bar often arrives without
   its scheme, and the server quite reasonably refuses it as not a URL. Adding the https back is
   not a guess: there is nothing else it could have meant. */
export function tidyUrl(value: unknown) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/* The field has always been free text and people write "Passcode 4821" into it, so labelling it
   would otherwise read "Passcode: Passcode 4821". Anything that is not a passcode at all is left
   exactly as written. The code itself stops at the next separator. */
export function passcodeOnly(note: string | null | undefined) {
    const text = String(note || "").trim();
    const match = /pass\s*code\s*[:\-]?\s*([^\s·|,;]+)/i.exec(text);
    return match ? match[1].trim() : text;
}

export function fmtBytes(bytes: number | null | undefined) {
    if (!bytes) return "";
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const plural = (count: number, word: string, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

/* ---- holidays, for the check-in calendar ----
   Dates a class is unlikely to happen on. They are marks on a calendar and nothing more: nothing is
   switched off automatically, because a course that deliberately runs through a bank holiday is a
   normal thing and the portal should not overrule it.

   PUBLIC HOLIDAYS are fixed in law and are stated here with confidence. Where one falls at a weekend
   the substitute day is the one that is actually taken off, so both are listed.
   SCHOOL HOLIDAYS are indicative: the Department publishes standardised breaks but individual
   schools vary within them. Plain data so they can be corrected in one place. */

export const PUBLIC_HOLIDAYS: { date: string; name: string }[] = [
    // 2026
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
    // St Stephen's Day falls on a Saturday in 2026, so the Monday is the day off.
    { date: "2026-12-28", name: "St Stephen's Day (substitute)" },
    // 2027
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
    // Both fall at the weekend in 2027, so both are moved.
    { date: "2027-12-27", name: "Christmas Day (substitute)" },
    { date: "2027-12-28", name: "St Stephen's Day (substitute)" },
];

/* Ranges are inclusive at both ends. Indicative, per the note above. */
export const SCHOOL_HOLIDAYS: { from: string; to: string; name: string }[] = [
    { from: "2026-10-26", to: "2026-10-30", name: "October mid-term" },
    { from: "2026-12-23", to: "2027-01-05", name: "Christmas holidays" },
    { from: "2027-02-15", to: "2027-02-19", name: "February mid-term" },
    { from: "2027-03-26", to: "2027-04-05", name: "Easter holidays" },
    { from: "2027-06-01", to: "2027-06-11", name: "State examinations" },
];

export type HolidayMark = { kind: "public" | "school"; name: string };

/** Every date in a range, as YYYY-MM-DD. Stepped in UTC so a summer-time boundary cannot skip or repeat a day. */
export function datesBetween(from: string, to: string) {
    const days: string[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

/** One lookup from date to whatever is on it. A date can carry both, so the value is a list, public holiday first. */
export function holidayIndex() {
    const index = new Map<string, HolidayMark[]>();
    const add = (date: string, entry: HolidayMark) => {
        if (!index.has(date)) index.set(date, []);
        index.get(date)!.push(entry);
    };
    for (const holiday of PUBLIC_HOLIDAYS) add(holiday.date, { kind: "public", name: holiday.name });
    for (const holiday of SCHOOL_HOLIDAYS) for (const date of datesBetween(holiday.from, holiday.to)) add(date, { kind: "school", name: holiday.name });
    for (const entries of index.values()) entries.sort((a, b) => (a.kind === "public" ? -1 : 1) - (b.kind === "public" ? -1 : 1));
    return index;
}

export function addDays(date: string, days: number) {
    const cursor = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
    cursor.setUTCDate(cursor.getUTCDate() + days);
    return cursor.toISOString().slice(0, 10);
}

/** What falls in the week beginning on a given Monday, so a row can say "October bank holiday". */
export function holidaysInWeek(weekStart: string, index = holidayIndex()) {
    const found: (HolidayMark & { date: string })[] = [];
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
}

/** The Monday a date belongs to, which is how a week is keyed everywhere here. */
export function mondayOf(date: string) {
    return addDays(date, -((new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7));
}
