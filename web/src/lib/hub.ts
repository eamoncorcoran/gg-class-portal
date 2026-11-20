// The class hub's data: one JSON baked from the homework portal's database (tools/export-hub.mjs),
// plus the 36-week teaching plan, turned into a calendar, a course of class recordings and a board.
import { useSyncExternalStore } from "react";

export type Who = { id?: string; name: string; role: "admin" | "student"; avatar?: string };
export type Video =
    | { type: "iframe"; src: string }
    | { type: "link"; src: string; passcode?: string }
    | { type: "file"; src: string }
    | { type: "practice"; ref: string; title: string; phrases: Phrase[]; videoUrl?: string };
export type Phrase = { id: string; at: number; irish: string; english: string; phonetic?: string };
export type Topic = { title: string; category: string };
export type Lesson = {
    id: string;
    title: string;
    /** the title as the portal has it ("Ceacht 3"), when the shown title is the date */
    name?: string;
    notes: string;
    recordedOn?: string | null;
    durationSeconds: number;
    video: Video | null;
    /** the recording on Zoom's own page, for when the player will not play */
    zoomLink?: { url: string; passcode?: string };
    /** from the teaching plan: what the week covered and what was set */
    topics?: Topic[];
    homework?: string[];
    week?: number;
};
export type Module = { id: string; title: string; lessons: Lesson[] };
export type Course = { id: string; title: string; description: string; cover?: string; onDemand?: boolean; modules: Module[] };
export type Comment = { id: string; body: string; at: string; parentId?: string; author: Who; reactions: { emoji: string; count: number }[] };
export type Thread = {
    id: string;
    title: string;
    body: string;
    pinned: boolean;
    locked: boolean;
    category?: string;
    author: Who;
    at: string;
    edited?: string | null;
    attachments: { kind: string; url: string; fileName?: string; mime?: string; bytes?: number }[];
    reactions: { emoji: string; count: number }[];
    comments: Comment[];
};
export type Sitting = { date: Date; kind: "class" | "recorded" | "skipped" | "moved" | "extra" | "break"; week?: number; label?: string; reason?: string; joinUrl?: string };

type Raw = {
    exportedAt: string;
    class: { name: string; dayOfWeek: number; startTime: string; timezone: string; joinUrl?: string; joinNote?: string } | null;
    weeks: { week_start: string; checkin_enabled: boolean; checkin_release_at: string; checkin_due_at: string }[];
    dateChanges: { on_date: string; kind: "skipped" | "recorded" | "moved"; moved_to?: string; reason?: string }[];
    sessions: { starts_at: string; duration_minutes: number; join_url?: string; label?: string; cancelled: boolean }[];
    courses: Course[];
    community: { categories: string[]; threads: Thread[]; members: number };
    live: { id: string; title: string; course?: string; phrases: Phrase[]; videoUrl?: string }[];
    plan: { topics: Topic[]; weeks: { name: string; topics: Topic[]; homework: string; notes: string }[]; calendar: { startDate: string; breakStart: string; breakEnd: string } };
};

export type Hub = {
    klass: NonNullable<Raw["class"]>;
    /** every Monday a plan week starts on, with its class date */
    weeks: { n: number; start: Date; classAt: Date; topics: Topic[]; homework: string[]; notes: string; lessonId: string }[];
    sittings: Sitting[];
    checkins: { due: Date; weekStart: Date }[];
    courses: Course[];
    community: Raw["community"];
    live: Raw["live"];
    breaks: { from: Date; to: Date; label: string }[];
    members: number;
};

export const CLASS_MINUTES = 120;
export const REC_COURSE = "class-recordings";
export const PRACTICE_COURSE = "practice";
export const DAY = 86400000;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Key of the Irish day an instant falls on. */
export const dayKey = (d: Date) => dateKey(wall(d));
export const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
/* ---------- Irish time ----------
   Every class time is an Irish wall-clock time. Dates that stand for a moment (a sitting, a deadline)
   are real instants; the formatters below print them in Irish time wherever the reader is. Dates
   that stand for a day only (a plan week's Monday, a calendar cell) stay plain local-midnight Dates
   and go through dateKey / fmtShortDate, never through the instant formatters. */
export const TZ = "Europe/Dublin";
const tzParts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };
const partsOf = (d: Date): Parts => {
    const o: Record<string, number> = {};
    for (const x of tzParts.formatToParts(d)) if (x.type !== "literal") o[x.type] = +x.value;
    return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, mi: o.minute, s: o.second };
};
/** The Irish wall-clock of an instant, as a plain local Date (for day maths only). */
export const wall = (d: Date) => {
    const p = partsOf(d);
    return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
};
/** The instant at which a given Irish wall-clock time happens (y, m 1-12, d, h, mi). */
export const instantOf = (y: number, m: number, d: number, h = 0, mi = 0) => {
    const want = Date.UTC(y, m - 1, d, h, mi);
    let guess = new Date(want);
    for (let i = 0; i < 2; i++) {
        const p = partsOf(guess);
        guess = new Date(+guess - (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - want));
    }
    return guess;
};
/** The instant of an Irish wall-clock time given as a plain local Date (its fields are read, not its zone). */
export const instant = (w: Date) => instantOf(w.getFullYear(), w.getMonth() + 1, w.getDate(), w.getHours(), w.getMinutes());
/** Noon in Ireland on a day-only Date: a safe instant for placing a day-only thing on the calendar. */
export const onDay = (d: Date) => instantOf(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12);
/** Key of a day-only Date (its own fields). */
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A day-only Date from "YYYY-MM-DD"; a full timestamp is read as the Irish day it falls on. */
const local = (iso: string) => {
    if (iso.includes("T")) {
        const w = wall(new Date(iso));
        return new Date(w.getFullYear(), w.getMonth(), w.getDate());
    }
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
};
const lines = (s: string) => (s || "").split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);

/** A lesson is named by the day it was taught: "Monday 7 September". The portal's recorded date wins;
 *  a date written into the title ("Ceacht 9 Monday 9 Nov") is next; the plan week's class day is the fallback. */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const dateInTitle = (title: string, year: number) => {
    // "Ceacht 9 Monday 9 Nov": the first number-word pair is "9 Monday", so every pair is tried
    for (const m of title.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b/g)) {
        const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
        if (mi >= 0) return onDay(new Date(year, mi, Number(m[1])));
    }
    return null;
};
const lessonDate = (recordedOn: string | null | undefined, title: string, fallback: Date) => {
    const d = recordedOn ? (recordedOn.length <= 10 ? onDay(local(recordedOn)) : new Date(recordedOn)) : (dateInTitle(title, fallback.getFullYear()) ?? fallback);
    const p = { weekday: d.toLocaleDateString("en-IE", { weekday: "long", timeZone: TZ }), day: d.toLocaleDateString("en-IE", { day: "numeric", timeZone: TZ }), month: d.toLocaleDateString("en-IE", { month: "long", timeZone: TZ }) };
    return `${p.weekday} ${p.day} ${p.month}`;
};

/** Shape the export: the plan's weeks become the recordings course, the class's day gives each week its sitting. */
const shape = (r: Raw): Hub => {
    const klass = r.class ?? { name: "Irish for Primary Teaching", dayOfWeek: 7, startTime: "19:00:00", timezone: "Europe/Dublin" };
    const [hh, mm] = klass.startTime.split(":").map(Number);
    const start = local(r.plan.calendar.startDate);
    const brk = { from: local(r.plan.calendar.breakStart), to: local(r.plan.calendar.breakEnd), label: "Christmas break" };
    // the portal's record of changed sittings, by the day the class would have been on
    const changes = new Map(r.dateChanges.map((c) => [dayKey(local(c.on_date)), c]));
    // plan week N starts on the Nth teaching Monday: the break and any week the portal marks
    // skipped do not use up a plan week, they push the rest on
    const weeks: Hub["weeks"] = [];
    const skippedDays: { date: Date; reason?: string }[] = [];
    let monday = start;
    let guard = 0;
    for (let i = 0; i < r.plan.weeks.length && guard++ < 80; ) {
        const inBreak = monday >= brk.from && monday <= brk.to;
        const classDay = addDays(monday, klass.dayOfWeek - 1);
        const classAt = instantOf(classDay.getFullYear(), classDay.getMonth() + 1, classDay.getDate(), hh, mm);
        const c = changes.get(dateKey(classDay));
        if (inBreak || c?.kind === "skipped") {
            if (!inBreak) skippedDays.push({ date: classAt, reason: c?.reason });
            monday = addDays(monday, 7);
            continue;
        }
        const w = r.plan.weeks[i];
        weeks.push({ n: i + 1, start: monday, classAt, topics: w.topics, homework: lines(w.homework), notes: w.notes, lessonId: `wk-${i + 1}` });
        monday = addDays(monday, 7);
        i++;
    }
    // the portal's own lessons: which plan week each one belongs to, by its number, else its date, else its place
    const dbLessons = r.courses.flatMap((c) => c.modules.flatMap((m) => m.lessons)).filter((l) => l.video?.type !== "practice");
    const weekOf = (l: Lesson, i: number) => {
        const m = l.title.match(/(?:Ceacht|Week|Lesson|Seachtain)\s*(\d+)/i);
        if (m) return Number(m[1]);
        if (l.recordedOn) {
            const d = local(l.recordedOn);
            const w = weeks.find((w) => d >= w.start && d < addDays(w.start, 7));
            if (w) return w.n;
        }
        return i + 1;
    };
    const byWeek = new Map<number, Lesson[]>();
    dbLessons.forEach((l, i) => {
        const n = weekOf(l, i);
        byWeek.set(n, [...(byWeek.get(n) ?? []), l]);
    });
    const termOf = (d: Date) => (d < brk.from ? 0 : d < new Date(d.getFullYear(), 3, 1) ? 1 : 2);
    const termNames = ["Term 1: Foundations", "Term 2: The exam, part by part", "Term 3: Revision and the orals"];
    const modules: Module[] = termNames.map((t, i) => ({ id: `term-${i + 1}`, title: t, lessons: [] }));
    for (const w of weeks) {
        const real = byWeek.get(w.n) ?? [];
        if (real.length) w.lessonId = real[0].id;
        modules[termOf(w.start)].lessons.push(...real.map((l) => ({ ...l, name: l.title, title: lessonDate(l.recordedOn, l.title, w.classAt), week: w.n, recordedOn: l.recordedOn || dateInTitle(l.title, w.classAt.getFullYear())?.toISOString() || w.classAt.toISOString(), durationSeconds: l.durationSeconds || CLASS_MINUTES * 60, topics: w.topics, homework: w.homework, notes: l.notes || "" })));
    }
    // a lesson whose week is beyond the plan still shows, at the end
    for (const [n, list] of byWeek) if (!weeks.some((w) => w.n === n)) modules[2].lessons.push(...list);
    const recordings: Course = {
        id: REC_COURSE,
        title: r.courses[0]?.title || klass.name,
        description: r.courses[0]?.description || "Every class recording, in the order we taught them.",
        modules: modules.filter((m) => m.lessons.length),
    };
    const practice = r.courses.flatMap((c) => c.modules.flatMap((m) => m.lessons)).filter((l) => l.video?.type === "practice");
    const courses: Course[] = [recordings];
    if (practice.length) courses.push({ id: PRACTICE_COURSE, title: "Say it: phrase practice", description: "Short videos that pause on each phrase so you can say it back.", onDemand: true, modules: [{ id: "p", title: "Practice", lessons: practice }] });

    // sittings: the weekly class (on its moved day when the portal moved it), skipped days, break weeks, extra sessions
    const sittings: Sitting[] = weeks.map((w) => {
        const c = changes.get(dayKey(w.classAt));
        if (c?.kind === "moved" && c.moved_to) return { date: new Date(c.moved_to), week: w.n, kind: "moved", reason: c.reason || `Moved from ${fmtShort(w.classAt)}`, joinUrl: klass.joinUrl };
        return { date: w.classAt, week: w.n, kind: c?.kind === "recorded" ? "recorded" : "class", reason: c?.reason, joinUrl: klass.joinUrl };
    });
    for (const s of skippedDays) sittings.push({ date: s.date, kind: "skipped", reason: s.reason });
    for (let d = brk.from; d <= brk.to; d = addDays(d, 7)) {
        const bd = addDays(d, (klass.dayOfWeek - 1 - d.getDay() + 1 + 7) % 7);
        if (bd <= brk.to && !sittings.some((s) => dayKey(s.date) === dateKey(bd))) sittings.push({ date: onDay(bd), kind: "break", label: brk.label });
    }
    for (const s of r.sessions) if (!s.cancelled) sittings.push({ date: new Date(s.starts_at), kind: "extra", label: s.label || "Extra class", joinUrl: s.join_url || klass.joinUrl });
    sittings.sort((a, b) => +a.date - +b.date);
    const checkins = r.weeks.filter((w) => w.checkin_enabled && w.checkin_due_at).map((w) => ({ due: new Date(w.checkin_due_at), weekStart: local(w.week_start) }));
    const junk = (s: string) => !/\s/.test(s.trim()) && s.trim().length < 6 && !/[áéíóú]/i.test(s);
    return {
        klass,
        weeks,
        sittings,
        checkins,
        courses,
        community: { ...r.community, threads: r.community.threads.filter((t) => !(junk(t.title) && junk(t.body))).map((t) => ({ ...t, comments: t.comments.filter((c) => !junk(c.body)) })) },
        live: r.live,
        breaks: [brk],
        members: r.community.members,
    };
};

let hub: Hub | null = null;
let loading: Promise<Hub> | null = null;
const subs = new Set<() => void>();
/* The hub's live export, straight from the database, so dates, lessons and threads are never stale.
   There used to be a baked copy of it shipped with the app as a fallback for development; it held a
   real class's board and was readable by anybody, so it is gone. Signed out there is no hub to load. */
const fetchRaw = async (): Promise<Raw> => {
    const r = await fetch("/api/hub/export", { credentials: "include" });
    if (!r.ok) throw Object.assign(new Error(r.status === 401 ? "Sign in to the hub first." : `The hub could not be loaded (${r.status}).`), { status: r.status });
    return (await r.json()) as Raw;
};
export const loadHub = () => (loading ??= fetchRaw().then((raw: Raw) => ((hub = shape(raw)), subs.forEach((f) => f()), hub)));
/** Asks the hub again and swaps the answer in. A recording's address is signed for a few hours, so a
    page left open overnight holds a dead one; this fetches a fresh one. A failed fetch keeps what is there. */
let refreshing: Promise<void> | null = null;
export const refreshHub = () =>
    (refreshing ??= fetch("/api/hub/export", { credentials: "include" })
        .then(async (r) => {
            if (!r.ok) return;
            hub = shape((await r.json()) as Raw);
            subs.forEach((f) => f());
        })
        .catch(() => {})
        .finally(() => {
            refreshing = null;
        }));
/** The hub, or null until it has loaded (then the component re-renders). */
export const useHub = () => {
    if (!hub && !loading) loadHub();
    return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => hub);
};
export const H = () => hub!;

/* ---------- time helpers ---------- */
export const fmtDay = (d: Date) => d.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
export const fmtShort = (d: Date) => d.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
/** "7pm", "7:30pm": Irish time, 12-hour, the way the class is spoken of. */
export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ }).replace(":00", "").replace(/\s?(AM|PM)/i, (m) => m.trim().toLowerCase());
/** Day-only Dates (a week's Monday) print by their own fields, no zone. */
export const fmtShortDate = (d: Date) => d.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
export const fmtDur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h${s % 3600 >= 60 ? ` ${Math.round((s % 3600) / 60)}m` : ""}` : `${Math.max(1, Math.round(s / 60))} min`);
export const ago = (iso: string, now = Date.now()) => {
    const m = Math.max(0, Math.round((now - +new Date(iso)) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d}d`;
    if (d < 30) return `${Math.round(d / 7)}w`;
    return new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short", timeZone: TZ });
};

/** The class to show on the banner: the one running now, or the next one coming. */
export const nextClass = (h: Hub, now = new Date()) => {
    const live = h.sittings.filter((s) => s.kind === "class" || s.kind === "extra" || s.kind === "moved");
    const running = live.find((s) => +s.date <= +now && +now < +s.date + CLASS_MINUTES * 60000);
    const next = running ?? live.find((s) => +s.date > +now);
    if (!next) return null;
    const mins = Math.round((+next.date - +now) / 60000);
    return { ...next, live: !!running, soon: !running && mins <= 12 * 60, minutesAway: mins };
};
/** The plan week we are in (or the next one coming), for "this week" cards. */
export const thisWeek = (h: Hub, now = new Date()) => {
    const today = wall(now);
    return h.weeks.find((w) => +today < +addDays(w.start, 7)) ?? h.weeks.at(-1)!;
};
export const lastRecorded = (h: Hub, now = new Date()) => [...h.courses[0].modules.flatMap((m) => m.lessons)].filter((l) => l.video && l.recordedOn && +new Date(l.recordedOn) <= +now).at(-1);
/** The recording taught on the same Irish day as `d`, if there is one. */
export const lessonOnDay = (h: Hub, d: Date) => h.courses[0].modules.flatMap((m) => m.lessons).find((l) => l.recordedOn && dayKey(new Date(l.recordedOn)) === dayKey(d));
/** The lesson a plan week links to, if the portal has one for it. */
export const lessonForWeek = (h: Hub, n: number) => h.courses[0].modules.flatMap((m) => m.lessons).find((l) => l.week === n);
export const findLesson = (h: Hub, id: string) => {
    for (const c of h.courses) for (const m of c.modules) for (const l of m.lessons) if (l.id === id) return { course: c, module: m, lesson: l };
    return null;
};
export const lessonsOf = (c: Course) => c.modules.flatMap((m) => m.lessons);
export const initials = (name?: string | null) =>
    (name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");
