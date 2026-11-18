// The teacher's Courses and Plans: the payload shapes the hub's /api/admin/courses*, /plans*,
// /plan-*, /zoom* and /live/practice-lessons routes return (see ~/gg-homework-portal/src/routes/admin.js
// and src/courses.js), plus the small helpers the old app.js had beside them.
import { api } from "@/lib/portal";

/* ---- courses ---- */

export type CourseClassRef = { id: string; programme_name: string; day_of_week: number; start_time: string };

/** One row of GET /api/admin/courses. */
export type CourseRow = {
    id: string;
    title: string;
    description: string | null;
    cover_url: string | null;
    published: boolean;
    position: number;
    open_to_all: boolean;
    lesson_count: number;
    module_count: number;
    on_demand?: boolean;
    class_id?: string | null;
    classes: CourseClassRef[];
};

export type VideoProvider = "bunny" | "youtube" | "loom" | "zoom" | "mp4" | "practice";

/** What the player gets: a Zoom door (link), an embed, a file we hold, or the studio's practice player. */
export type LessonVideo =
    | { type: "link"; provider: VideoProvider; src: string; passcode: string | null }
    | { type: "iframe"; provider: VideoProvider; src: string }
    | { type: "file"; provider: VideoProvider; src: string }
    | { type: "practice"; provider: VideoProvider; ref: string };

export type LessonAttachment = { id: string; url: string; fileName: string; mimeType: string; sizeBytes: number };

export type AdminLesson = {
    id: string;
    title: string;
    notes: string | null;
    published: boolean;
    recordedOn: string | null;
    durationLabel: string;
    durationSeconds: number | null;
    completed: boolean;
    lastPositionSeconds: number;
    attachments: LessonAttachment[];
    practice: boolean;
    video: LessonVideo | null;
    // What the administrator needs to edit it; never sent to a student.
    videoProvider: VideoProvider | null;
    videoRef: string | null;
    videoPasscode: string | null;
};

export type AdminModule = { id: string; title: string; position: number; lessons: AdminLesson[] };

/** GET /api/admin/courses/:id. */
export type AdminCourse = {
    id: string;
    title: string;
    description: string | null;
    cover_url: string | null;
    published: boolean;
    open_to_all: boolean;
    on_demand?: boolean;
    classes: CourseClassRef[];
    modules: AdminModule[];
    lessonCount: number;
    completedCount: number;
    percent: number;
    resumeLessonId: string | null;
};

export type CourseImpact = { modules: number; lessons: number; progress: number };
export type ModuleImpact = { id: string; title: string; lessons: number; progress: number };
export type ProgressRow = { id: string; name: string; withdrawn: boolean; completed_count: number; lesson_count: number; percent: number };

/** The whole shape of the course, which is what PUT /courses/:id/order expects. */
export type OrderShape = { id: string; lessons: string[] }[];

export const loadCourses = () => api<{ courses: CourseRow[] }>("/api/admin/courses").then((d) => d.courses);
export const loadCourse = (courseId: string) => api<AdminCourse>(`/api/admin/courses/${courseId}`);

export const allLessons = (course: AdminCourse | null | undefined): AdminLesson[] => (course?.modules ?? []).flatMap((m) => m.lessons);
export const currentOrder = (course: AdminCourse): OrderShape => course.modules.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id) }));

/** The hosts the lesson editor offers, in the order and wording the old modal used. */
export const PROVIDERS: { id: VideoProvider; label: string }[] = [
    { id: "bunny", label: "Bunny Stream" },
    { id: "youtube", label: "YouTube" },
    { id: "loom", label: "Loom" },
    { id: "zoom", label: "Zoom recording" },
    { id: "mp4", label: "A file on this server" },
    { id: "practice", label: "Practice lesson, from the studio" },
];

/* Which host a pasted link belongs to. The same rules as the server's detectVideoProvider, kept
   here so the dropdown can fill itself in as somebody types rather than only finding out on save. */
export const detectVideoHost = (value: string): VideoProvider | null => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    let host = "";
    try {
        host = new URL(raw).hostname.toLowerCase();
    } catch {
        host = "";
    }
    if (/(^|\.)zoom\.us$/.test(host)) return "zoom";
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
    if (/(^|\.)loom\.com$/.test(host)) return "loom";
    if (/(^|\.)mediadelivery\.net$/.test(host)) return "bunny";
    if (raw.startsWith("/uploads/") || /\.(mp4|m4v|webm|mov)(\?|$)/i.test(raw)) return "mp4";
    return null;
};

/* ---- the studio (practice lessons) ---- */

export type PracticeLesson = { id: string; title: string; course?: string | null; courseId?: string; phrases: number; hasVideo: boolean; videoUrl?: string };
export type PracticeVoice = { id: string; name: string; sample: string };
export type PracticePhrase = { id: string; irish: string; english?: string | null; at: number };
export type PracticeLessonData = { id: string; title?: string; phrases: PracticePhrase[] };

/* ---- plans ---- */

/** One row of GET /api/admin/plans: every course, with its plan if it has one. */
export type PlanSummary = { id: string; title: string; published: boolean; plan_id: string | null; plan_title: string | null; total: number; done: number };
export type PlanItem = { id: string; position: number; title: string; category: string | null; doneAt: string | null; doneBy: string | null };
export type PlanWeek = { id: string; position: number; name: string; homework: string | null; notes: string | null; items: PlanItem[] };
export type Plan = {
    id: string;
    course_id: string;
    title: string;
    starts_on: string | null;
    break_start: string | null;
    break_end: string | null;
    course_title: string;
    progress: { total: number; done: number };
    weeks: PlanWeek[];
};
export type TopicWeekRef = { name: string; position: number };
export type PlanTopic = { id: string; title: string; category: string | null; examGroup: string; weeks: TopicWeekRef[]; done: number };
export type TopicGroup = { name: string; topics: PlanTopic[] };
export type TopicBank = { counts: { total: number; scheduled: number; unscheduled: number }; topics: PlanTopic[]; groups: TopicGroup[] };
export type TopicCost = { id?: string; title: string; scheduled: number; done: number };
export const EXAM_GROUPS = ["Oral", "Paper 1", "Paper 2"];

export const loadPlan = (courseId: string) => api<Plan>(`/api/admin/plans/${courseId}`);
export const loadTopics = (courseId: string) => api<TopicBank>(`/api/admin/plans/${courseId}/topics`);
export const planPercent = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** The colour of a category chip. The old stylesheet keyed these on the category with its spaces and fadas stripped. */
export const catTone = (category: string | null | undefined) => {
    const key = String(category || "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
    switch (key) {
        case "oral":
            return "bg-blue-50 text-blue-800";
        case "grammar":
            return "bg-purple-50 text-purple-800";
        case "aiste":
            return "bg-orange-50 text-orange-800";
        case "sraithpictiur":
            return "bg-success-primary text-success-primary";
        case "filiocht":
        case "pros":
            return "bg-pink-50 text-pink-800";
        case "dordan":
            return "bg-indigo-50 text-indigo-800";
        case "examskills":
            return "bg-warning-primary text-warning-primary";
        case "revision":
            return "bg-secondary text-tertiary";
        default:
            return "bg-secondary text-tertiary";
    }
};

/* ---- Zoom import ---- */

export type ZoomStatus = { zoom: boolean; bunny: boolean; signedPlayback: boolean; ready: boolean };
export type ZoomRecording = {
    uuid: string;
    fileId: string;
    meetingId?: string;
    topic: string | null;
    startedAt: string;
    durationSeconds: number;
    fileSize: number;
    shareUrl?: string | null;
    importStatus: string | null;
    lessonId: string | null;
    error: string | null;
    watched: boolean;
    autoImport: boolean;
    autoPublish: boolean;
    targetModuleId: string | null;
    classId: string | null;
};
export type ZoomSource = {
    id: string;
    zoom_id: string;
    label: string | null;
    module_id: string | null;
    auto_import: boolean;
    auto_publish: boolean;
    class_id: string | null;
    module_title: string | null;
    course_title: string | null;
    class_label: string | null;
};
export type ZoomClass = { id: string; label: string; zoomId?: string | null; active?: boolean };
export type ZoomRecordings = { configured: boolean; recordings: ZoomRecording[]; sources: ZoomSource[]; classes?: ZoomClass[]; bunny?: boolean };
export type ZoomSweep = { imported?: number; reason?: string };

/* ---- small formatting helpers the old app had ---- */

export const initials = (name = "") =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** "Programme | Monday | 19:00", the way the old class picker named a class. */
export const classLabel = (row: { label?: string; programme_name: string; day_of_week: number; start_time: string }) =>
    row.label || `${row.programme_name} | ${DAY_NAMES[Number(row.day_of_week)] ?? ""} | ${String(row.start_time).slice(0, 5)}`;

/** Dates in Irish time, as the old fmtDate drew them ("14 Sept 2026", "14/09/2026", with the time when asked). */
export const fmtDate = (value: string | null | undefined, options: { dateStyle?: "full" | "medium" | "short"; time?: boolean } = {}) => {
    if (!value) return "";
    try {
        return new Intl.DateTimeFormat("en-IE", { dateStyle: options.dateStyle || "medium", ...(options.time ? { timeStyle: "short" } : {}), timeZone: "Europe/Dublin" }).format(new Date(value));
    } catch {
        return String(value);
    }
};

export const fmtBytes = (bytes: number | null | undefined) => {
    if (!bytes) return "";
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "0:07" from seconds, the way the practice phrase list shows where a phrase is in the video. */
export const fmtClock = (t: number | string | null | undefined) => {
    const n = Math.max(0, Math.round(Number(t) || 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
