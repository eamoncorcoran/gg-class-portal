// The real hub's API, reached through the dev proxy (/api/auth, /api/student, /api/admin and the
// media routes go to the hub on :3121; the session cookie is shared because both are localhost).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type Me = {
    id: string;
    name: string;
    email: string;
    role: "admin" | "student";
    hasAvatar?: boolean;
    mustChangePassword?: boolean;
    mustSetAvatar?: boolean;
    isSuperAdmin?: boolean;
    /** a student's course types, by the classes they are in: "irish_for_primary", "hibernia" */
    courseTypes?: string[];
    /** every course this student has is on demand (Hibernia): the hub is Courses and the private line, nothing else */
    coursesOnly?: boolean;
};
/** The kinds of course a class can be, as the teacher sees them. */
export const COURSE_TYPES = [
    { key: "irish_for_primary", label: "Irish for Primary Teaching" },
    { key: "hibernia", label: "Hibernia" },
] as const;
export const courseTypeLabel = (key?: string | null) => COURSE_TYPES.find((t) => t.key === key)?.label ?? "No class";
/** A student who sees only their courses (Hibernia). */
export const isCoursesOnly = (me: Me | null | undefined) => Boolean(me && me.role === "student" && me.coursesOnly);

let me: Me | null | undefined; // undefined = not asked yet, null = signed out
let pending: Promise<Me | null> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const api = async <T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> => {
    const { json, ...rest } = init ?? {};
    const res = await fetch(path, {
        credentials: "include",
        ...rest,
        headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if (res.status === 401) {
        if (me) (me = null), emit();
        throw Object.assign(new Error("Sign in to the hub first."), { status: 401 });
    }
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return { error: text }; } })() : {};
    if (!res.ok) throw Object.assign(new Error((data && (data.error || data.message)) || `Request failed (${res.status})`), { status: res.status, data });
    return data as T;
};

export const loadMe = () =>
    (pending ??= api<{ user: Me }>("/api/auth/me")
        .then((d) => (me = d.user))
        .catch(() => (me = null))
        .finally(() => {
            pending = null;
            emit();
        }));
/** Who is signed in to the hub: undefined while asking, null when nobody. */
export const useMe = () => {
    const v = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => me);
    useEffect(() => {
        if (me === undefined && !pending) loadMe();
    }, []);
    return v;
};
export const refreshMe = () => ((me = undefined), loadMe());
export const signOut = async () => {
    try {
        await api("/api/auth/logout", { method: "POST" });
    } finally {
        me = null;
        emit();
    }
};
export const PORTAL_ORIGIN = "http://localhost:3121";

/* ---- shared data helpers for the ported hub screens ---- */

/** A 428 from the hub means the student has no photo yet; every screen sends them to Account to add one. */
export const isAvatarRequired = (e: unknown) => (e as { status?: number; data?: { code?: string } })?.status === 428 && (e as { data?: { code?: string } }).data?.code === "avatar_required";

/** Multipart upload (files) to the hub; the browser sets the boundary, so no content-type header. */
export const upload = <T = unknown>(path: string, form: FormData, method: "POST" | "PUT" = "POST") => api<T>(path, { method, body: form });

/** Fetch a hub endpoint once per dependency change. `path` null = do not fetch yet. */
export const useApi = <T,>(path: string | null, deps: unknown[] = []): { data: T | undefined; error: Error | null; loading: boolean; reload: () => Promise<void>; set: (next: T | ((prev: T | undefined) => T)) => void } => {
    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(Boolean(path));
    const tick = useRef(0);
    const reload = useCallback(async () => {
        if (!path) return;
        const n = ++tick.current;
        setLoading(true);
        try {
            const d = await api<T>(path);
            if (n === tick.current) {
                setData(d);
                setError(null);
            }
        } catch (e) {
            if (n === tick.current) setError(e as Error);
        } finally {
            if (n === tick.current) setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, ...deps]);
    // a new path is a new resource: drop the old one so a page never shows the previous id's data under the new heading
    const lastPath = useRef(path);
    useEffect(() => {
        if (lastPath.current !== path) {
            lastPath.current = path;
            setData(undefined);
            setError(null);
        }
        if (!path) {
            setLoading(false);
            return;
        }
        reload();
    }, [reload, path]);
    return { data, error, loading, reload, set: (next) => setData((prev) => (typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next)) };
};

export type AdminClass = { id: string; programme_name: string; day_of_week: number; start_time: string; timezone?: string; has_community?: boolean; archived?: boolean; course_type?: string; [k: string]: unknown };
export type AdminBootstrap = { classes: AdminClass[]; liveRoom?: boolean; drafting?: Record<string, boolean> | null };
let adminBoot: AdminBootstrap | undefined;
let adminPending: Promise<AdminBootstrap> | null = null;
const adminSubs = new Set<() => void>();
export const loadAdminBootstrap = (force = false) => {
    if (adminBoot && !force) return Promise.resolve(adminBoot);
    return (adminPending ??= api<AdminBootstrap>("/api/admin/bootstrap")
        .then((d) => (adminBoot = d))
        .finally(() => {
            adminPending = null;
            adminSubs.forEach((f) => f());
        }));
};
/** The teacher's bootstrap (classes, live room on/off, drafting switches), shared by every console section. */
export const useAdminBootstrap = () => {
    const v = useSyncExternalStore((f) => (adminSubs.add(f), () => adminSubs.delete(f)), () => adminBoot);
    useEffect(() => {
        if (!adminBoot && !adminPending) loadAdminBootstrap().catch(() => undefined);
    }, []);
    return v;
};

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** "Monday · 19:00" from a class row. */
export const classSlot = (k: { day_of_week: number; start_time: string }) => `${DAY_NAMES[k.day_of_week] ?? ""} · ${String(k.start_time).slice(0, 5)}`;

/* ---- the student's bootstrap, shared (sidebar, live room, home) ---- */
export type StudentBootstrap = { liveClassroom?: boolean; liveNow?: boolean; hasCommunity?: boolean; communityUnread?: number; notifications?: number; class?: { label?: string; programme_name?: string; [k: string]: unknown } | null; nextClass?: { live?: boolean; [k: string]: unknown } | null; [k: string]: unknown };
let studentBoot: StudentBootstrap | undefined;
let studentPending: Promise<StudentBootstrap> | null = null;
const studentSubs = new Set<() => void>();
export const loadStudentBootstrap = (force = false) => {
    if (studentBoot && !force) return Promise.resolve(studentBoot);
    return (studentPending ??= api<StudentBootstrap>("/api/student/bootstrap")
        .then((d) => (studentBoot = d))
        .finally(() => {
            studentPending = null;
            studentSubs.forEach((f) => f());
        }));
};
/** The signed-in student's bootstrap (undefined until loaded, or for anyone who is not a student). */
export const useStudentBootstrap = () => {
    const me = useMe();
    const v = useSyncExternalStore((f) => (studentSubs.add(f), () => studentSubs.delete(f)), () => studentBoot);
    useEffect(() => {
        if (me?.role === "student" && !studentBoot && !studentPending) loadStudentBootstrap().catch(() => undefined);
    }, [me?.role]);
    return me?.role === "student" ? v : undefined;
};

/* ---- is the teacher live right now? ---- */
/* Asked of the hub every quarter minute while a page that shows the way into the class is open and
   the tab is in view. The join button is drawn only from this answer, so nobody can press their way
   into a dark room before the class starts, and nobody has to reload to get in once it has. */
let liveNow: boolean | undefined;
const liveSubs = new Set<() => void>();
let liveWatchers = 0;
let livePoll: number | null = null;
const LIVE_POLL_MS = 15000;
const checkLive = async () => {
    if (document.visibilityState === "hidden") return;
    try {
        const d = await api<{ liveNow?: boolean }>("/api/live/status");
        const next = Boolean(d.liveNow);
        if (next !== liveNow) {
            liveNow = next;
            liveSubs.forEach((f) => f());
        }
    } catch {
        /* a blip: the last answer stands until the next ask */
    }
};
const onLiveVisible = () => {
    if (document.visibilityState === "visible") checkLive();
};
/** Whether the live class is really on right now (polled). For a student that is their own class;
   for a teacher it is the room itself. This is what the wording goes by ("Live now", the red dot),
   so it is never true just because of who is looking: a teacher who has not pressed Go live is
   told the class is not on, the same as everybody else. */
export const useLiveNow = () => {
    const me = useMe();
    const v = useSyncExternalStore((f) => (liveSubs.add(f), () => liveSubs.delete(f)), () => liveNow);
    const student = me?.role === "student";
    const watching = student || me?.role === "admin";
    useEffect(() => {
        if (!watching) return;
        liveWatchers += 1;
        if (liveWatchers === 1) {
            checkLive();
            livePoll = window.setInterval(checkLive, LIVE_POLL_MS);
            document.addEventListener("visibilitychange", onLiveVisible);
        }
        return () => {
            liveWatchers -= 1;
            if (liveWatchers === 0) {
                if (livePoll) window.clearInterval(livePoll);
                livePoll = null;
                document.removeEventListener("visibilitychange", onLiveVisible);
            }
        };
    }, [watching]);
    if (!watching) return false;
    return v ?? (student ? Boolean(studentBoot?.liveNow) : false);
};

/** Whether to draw the way into the room. A student gets it once the class is on. A teacher always
   has it, because they are the one who starts the class. Kept apart from useLiveNow so that giving
   the teacher the door never makes a page say the class is live. */
export const useCanJoinLive = () => {
    const me = useMe();
    const live = useLiveNow();
    return me?.role === "admin" ? true : live;
};
