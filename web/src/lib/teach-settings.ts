// The shapes behind the teacher console's settings screens: GET /api/settings and everything the
// Email reminders, Feedback drafting, Attendance and Administrators sections send or read back.
// Taken from src/routes/settings.js, src/routes/admin.js, src/zoomattendance.js and src/reminders.js
// in the hub, and checked against the live payloads.

/* ---- GET /api/settings ---- */

export type ReminderTemplate = { enabled?: boolean; subject?: string; body?: string };
export type ReminderTemplateKey = "tomorrow" | "twoHours" | "thirtyMinutes";
export type ReminderSettings = { enabled?: boolean } & Partial<Record<ReminderTemplateKey, ReminderTemplate>>;

export type EmailProvider = "console" | "ghl_webhook" | "smtp";
export type EmailSettings = {
    provider?: EmailProvider | string;
    fromName?: string;
    fromAddress?: string;
    replyTo?: string;
    webhookUrl?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    // The password never comes back; the server strips it.
    configured?: boolean;
};

export type NudgeSettings = { checkinSubject?: string; checkinBody?: string; homeworkSubject?: string; homeworkBody?: string };

export type PromptSettings = {
    correctionPrompt?: string;
    generalFeedbackPrompt?: string;
    checkinNotes?: string;
    communityNotes?: string;
    /** Wording a migration set aside; the server merges on save so it is never wiped. */
    retired?: Record<string, string>;
};

export type DraftingSwitches = { corrections: boolean; generalFeedback: boolean; checkins: boolean; board: boolean };

export type DictationLanguage = "auto" | "en" | "ga";
export type DictationSettings = { transcribeModel?: string; cleanupModel?: string; language?: DictationLanguage; dictionary?: string[] };
export type VoicePrompts = { cleanupPrompt?: string; lightPrompt?: string };

export type AnthropicStatus = { configured: boolean; model: string };
export type OpenAIStatus = { configured: boolean; model: string };
export type SpeechStatus = { azureConfigured: boolean; azureRegion: string; abairConfigured: boolean };
export type ZoomSdkStatus = { clientId: string; secretConfigured: boolean; configured: boolean; enabled: boolean; hostEmail: string; apiConfigured: boolean };
export type ZoomApiStatus = { accountId: string; clientId: string; secretConfigured: boolean; webhookConfigured: boolean; configured: boolean };
export type BunnyStatus = { libraryId: string; apiKeyConfigured: boolean; tokenKeyConfigured: boolean; configured: boolean };

export type TeachSettings = {
    anthropic: AnthropicStatus;
    openai: OpenAIStatus;
    speech: SpeechStatus;
    zoom: ZoomSdkStatus;
    zoomApi: ZoomApiStatus;
    bunny: BunnyStatus;
    email: EmailSettings;
    prompts: PromptSettings;
    drafting: DraftingSwitches;
    reminders: ReminderSettings;
    dictation: DictationSettings;
    voicePrompts: VoicePrompts;
    nudge: NudgeSettings;
};

/* ---- PUT bodies (a blank secret means "keep the one that is there", so those are sent as undefined) ---- */

export type RemindersPut = { enabled: boolean } & Record<ReminderTemplateKey, { enabled: boolean; subject: string; body: string }>;
export type EmailPut = {
    provider: string;
    fromName: string;
    fromAddress: string;
    replyTo: string;
    webhookUrl: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
};
export type NudgePut = Required<NudgeSettings>;
export type AnthropicPut = { apiKey?: string; model: string };
export type OpenAIPut = { apiKey?: string; model: string };
export type ZoomPut = { clientId: string; clientSecret?: string; enabled: boolean; hostEmail: string };
export type ZoomApiPut = { accountId: string; clientId: string; clientSecret?: string; webhookSecret?: string };
export type BunnyPut = { libraryId: string; apiKey?: string; tokenKey?: string };
export type SpeechPut = { azureKey?: string; azureRegion?: string; abairKey?: string };
export type DraftingPut = DraftingSwitches;
export type PromptsPut = { correctionPrompt: string; generalFeedbackPrompt: string; checkinNotes: string; communityNotes: string };
export type DictationPut = { transcribeModel: string; cleanupModel: string; language: DictationLanguage; dictionary: string[]; cleanupPrompt: string; lightPrompt: string };

/* ---- test results ---- */

export type ProbeResult = { ok: boolean; message: string };
export type ZoomTestResult = { sdk: ProbeResult; api: ProbeResult & { owner?: string } };
export type SpeechTestResult = { azure: ProbeResult; abair: ProbeResult };
export type BunnyTestResult = ProbeResult;
export type AnthropicTestResult = { ok: boolean; preview: string };
export type ZoomSaveResult = ZoomSdkStatus;

/* ---- email pause (GET/PUT /api/settings/email/pause) ---- */

export type EmailPauseState = {
    paused: boolean;
    until: string | null;
    reason: string | null;
    /** status -> count in the last 24 hours: sent, simulated, suppressed, failed */
    lastDay: Partial<Record<"sent" | "simulated" | "suppressed" | "failed", number>> & Record<string, number | undefined>;
    dailyCap: number;
    byKind: { priority: string; count: number }[];
    byDay: { day: string; sent: number; held: number }[];
};

/* ---- reminder audit (GET /api/settings/reminders/audit) ---- */

export type ReminderAuditRow = { what: string; name: string; email: string; sentAt: string; submittedAt: string | null; status: string; template: string; due: string };
export type ReminderAudit = {
    reverted: { homework: number; checkins: number };
    days: number;
    homework: { sent: number; alreadyDone: number };
    checkins: { sent: number; alreadyDone: number };
    doneAfterReminder: number;
    wrong: ReminderAuditRow[];
};

/* ---- check-in reminder by hand (GET checkin-preview, POST checkin-now, POST run) ---- */

export type CheckinPreview = {
    total: number;
    alreadyReminded: number;
    students: { name: string; email: string; week: string; closes: string; alreadyReminded: boolean }[];
};
export type CheckinNowResult = { sent: number; skipped: number; considered: number };

/* ---- attendance ---- */

export type AttendanceImportRow = { name?: string; email?: string; matched: boolean; status?: string; minutes?: number };
export type AttendanceImportResult = { rows: AttendanceImportRow[] };

export type ZoomPerson = { name: string | null; email: string | null; minutes: number; studentId: string | null; studentName: string | null };
export type ZoomSitting = {
    id: string;
    zoomId: string;
    kind: string;
    topic: string;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number | null;
    matched: number;
    unmatched: number;
    syncedAt: string | null;
    weekStart: string | null;
    people: ZoomPerson[];
};
export type ZoomAttendanceClass = {
    id: string;
    label: string;
    dayOfWeek: number;
    startTime: string;
    active: boolean;
    zoomId: string;
    zoomIds: string[];
    sittings: ZoomSitting[];
    lastSyncedAt: string | null;
};
export type ZoomAttendance = { configured: boolean; liveMinutes: number; classes: ZoomAttendanceClass[] };

/** POST /api/admin/zoom/attendance/sync: one class answers with its own totals, all classes with a list. */
export type ZoomSyncClassResult = { ok: boolean; reason?: string; classId?: string; label?: string; newSittings?: number; errors?: string[]; sittings?: number; matched?: number; unmatched?: number };
export type ZoomSyncResult = ZoomSyncClassResult & { classes?: ZoomSyncClassResult[] };
export type ZoomIdentityResult = { placed: number };

/** The bits of GET /api/admin/tracker/:classId the attendance screen reads. */
export type TrackerWeek = { id: string; week_start: string; label?: string | null };
export type TrackerStudent = { id: string; name: string; email: string; withdrawn_at?: string | null };
export type TrackerLite = { weeks: TrackerWeek[]; students: TrackerStudent[] };

/* ---- administrators ---- */

export type AdminRow = {
    id: string;
    name: string;
    email: string;
    active: boolean;
    is_super_admin: boolean;
    must_change_password: boolean;
    last_login_at: string | null;
    created_at: string;
};
export type AdminsResponse = { admins: AdminRow[]; me: string };
export type AdminCreated = { id: string; name: string; email: string; role: "admin"; is_super_admin: boolean; emailStatus: "sent" | "failed" };

/* ---- date helpers, as the old app.js formatted them ---- */

const FALLBACK_TIMEZONE = "Europe/Dublin";

/** fmtDate from the old app: en-IE, class timezone, "Sun 19 Jul, 20:00" style when weekday is asked for. */
export const fmtDate = (value: string | null | undefined, options: { time?: boolean; weekday?: boolean; dateStyle?: "short" | "medium" | "long"; timeZone?: string; timeOnly?: boolean } = {}) => {
    if (!value) return "";
    const timeZone = options.timeZone || FALLBACK_TIMEZONE;
    const d = new Date(value);
    if (options.timeOnly) return new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(d);
    const format: Intl.DateTimeFormatOptions = options.weekday
        ? {
              weekday: "short",
              day: "numeric",
              month: "short",
              ...(options.dateStyle === "short" ? {} : { year: "numeric" }),
              ...(options.time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
          }
        : { dateStyle: options.dateStyle || "medium", ...(options.time ? { timeStyle: "short" } : {}) };
    // en-IE puts a comma after the weekday, which reads badly next to the one before the time.
    return new Intl.DateTimeFormat("en-IE", { ...format, timeZone }).format(d).replace(/^(\p{L}{2,4}),\s/u, "$1 ");
};

/** week_start is a calendar day ("2026-07-20"); read as UTC noon so the day never shifts. */
export const fmtWeek = (value: string | null | undefined) => {
    if (!value) return "";
    const day = String(value).slice(0, 10);
    const date = new Date(`${day}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
