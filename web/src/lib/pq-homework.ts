// Past questions set as homework: which ones, for which class, and how many have handed them in.
// For the teacher only. The list comes from /api/admin/pq-homework, which a student's sign-in cannot
// reach, and nothing here is asked for unless the person signed in is a teacher.
import { useEffect, useSyncExternalStore } from "react";
import { api, useMe } from "@/lib/portal";

/** One time a past question was set: the homework it is in, the class, the deadline, who has done it. */
export type PqSet = { assignmentId: string; title: string; classId: string; className: string; deadlineAt: string; done: number; students: number; marked?: number; average?: number | null; outOf?: number | null };
export type PqAssignment = PqSet & { questions: number };
type State = { byQuestion: Record<string, PqSet[]>; assignments: PqAssignment[] };

let state: State | undefined;
let pending: Promise<State> | null = null;
const subs = new Set<() => void>();

export const loadPqHomework = (force = false) => {
    if (state && !force) return Promise.resolve(state);
    pending ??= api<State>("/api/admin/pq-homework")
        .then((d) => {
            state = { byQuestion: d.byQuestion || {}, assignments: d.assignments || [] };
            subs.forEach((f) => f());
            return state;
        })
        .finally(() => {
            pending = null;
        });
    return pending;
};

/** What has been set, for a teacher; undefined for anybody else and while it loads. */
export const usePqHomework = () => {
    const me = useMe();
    const teacher = me?.role === "admin";
    const v = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state);
    useEffect(() => {
        if (teacher && !state && !pending) loadPqHomework().catch(() => undefined);
    }, [teacher]);
    return teacher ? v : undefined;
};

/** "Fri 20 Nov, 23:55" in Irish time, which is the time a deadline is set in. */
export const dueLabel = (iso: string) =>
    new Date(iso).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Dublin" }).replace(/,/g, "");
