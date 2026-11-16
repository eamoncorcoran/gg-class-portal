// The classroom API (tools/classroom.py): classes, join codes, assignments and what students handed
// in. Teachers send their token as t, students theirs as s; both live in the store's account.
import type { QuizItem } from "./quiz";
import type { Result } from "./store";
import { get, set } from "./store";

export type ClassRow = { id: string; name: string; code: string; created: number; students: number; assignments: number };
export type Student = { id: string; name: string; joined: number; year?: string; subjects?: string[]; demo?: number };
/** one cell of the gradebook */
export type SubCell = { assignment_id: string; student_id: string; got: number; total: number; done: number; finished: number | null; started: number };
export type ExamPayload = { name: string; ids: string[]; mins: number; topics: string[]; instructions?: string };
export type QuizPayload = { name: string; items: QuizItem[] };
export type Assignment = {
    id: string;
    class_id: string;
    kind: "exam" | "quiz";
    title: string;
    payload: ExamPayload | QuizPayload;
    due: number | null;
    created: number;
    done: number;
    started: number;
    total: number;
};
/** What a student handed in: the exam's per-question results, or the quiz's answers. */
export type Submission = {
    id: string;
    answers: Record<string, unknown>;
    results: Record<string, Result[] | { given: string; right: boolean }>;
    got: number;
    total: number;
    done: number;
    started: number;
    finished: number | null;
};
/** one row of the teacher's homework hub: the assignment with its class name, no payload */
export type HomeworkRow = Omit<Assignment, "payload"> & { class_name: string };
export type Mine = { done: boolean; got: number; total: number; finished: number | null; started: number } | null;
export type StudentAssignment = Omit<Assignment, "payload" | "done" | "started" | "total"> & { mine: Mine };

export class ApiError extends Error {
    status: number;
    constructor(status: number, msg: string) {
        super(msg);
        this.status = status;
    }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).catch(() => null);
    if (!r) throw new ApiError(0, "Can't reach the server. Is it running?");
    const out = await r.json().catch(() => ({ error: "Bad reply from the server." }));
    if (!r.ok) {
        if (r.status === 401) set("account", null); // the token is gone server-side: sign in again
        throw new ApiError(r.status, out.error || "Something went wrong.");
    }
    return out as T;
}

const t = () => {
    const a = get().account;
    return a?.role === "teacher" ? a.token : "";
};
const s = () => {
    const a = get().account;
    return a?.role === "student" ? a.token : "";
};

export const api = {
    /* teacher */
    becomeTeacher: async (name: string) => {
        const r = await call<{ token: string; id: string; name: string }>("/api/teacher", { name });
        set("account", { role: "teacher", ...r });
        return r;
    },
    teacher: () => call<{ id: string; name: string; classes: ClassRow[] }>(`/api/teacher?t=${t()}`),
    createClass: (name: string) => call<ClassRow>("/api/classes", { t: t(), name }),
    deleteClass: (id: string) => call<{ ok: true }>("/api/classes/delete", { t: t(), id }),
    klass: (id: string) => call<{ class: ClassRow; students: Student[]; assignments: Assignment[]; submissions: SubCell[] }>(`/api/classes/${id}?t=${t()}`),
    profile: (id: string) => call<{ student: Student; class: ClassRow; assignments: (Assignment & { submission: Submission | null })[] }>(`/api/students/${id}?t=${t()}`),
    /** the teacher's own seat in a class, to see it the way a student does */
    demo: (classId: string) => call<{ token: string; student: { id: string; name: string }; class: { id: string; name: string } }>("/api/demo", { t: t(), classId }),
    lookup: (code: string) => call<{ class: { id: string; name: string; code: string; teacher: string } }>(`/api/join/${encodeURIComponent(code)}`),
    removeStudent: (id: string) => call<{ ok: true }>("/api/students/remove", { t: t(), id }),
    assign: (classId: string, kind: "exam" | "quiz", title: string, payload: ExamPayload | QuizPayload, due: number | null) =>
        call<Assignment>("/api/assignments", { t: t(), classId, kind, title, payload, due }),
    homework: () => call<{ homework: HomeworkRow[] }>(`/api/homework?t=${t()}`),
    updateAssignment: (id: string, patch: { due?: number | null; title?: string }) => call<Assignment>("/api/assignments/update", { t: t(), id, ...patch }),
    deleteAssignment: (id: string) => call<{ ok: true }>("/api/assignments/delete", { t: t(), id }),
    assignment: (id: string) => call<{ assignment: Assignment; class: ClassRow; students: (Student & { submission: Submission | null })[] }>(`/api/assignments/${id}?t=${t()}`),
    /* student */
    join: async (code: string, name: string, year = "", subjects: string[] = ["Irish"]) => {
        const r = await call<{ token: string; student: { id: string; name: string }; class: { id: string; name: string } }>("/api/join", { code, name, year, subjects });
        set("account", { role: "student", token: r.token, id: r.student.id, name: r.student.name, classId: r.class.id, className: r.class.name });
        return r;
    },
    student: () => call<{ student: Student; class: ClassRow; assignments: StudentAssignment[] }>(`/api/student?s=${s()}`),
    sit: (id: string) => call<{ assignment: Assignment; mine: Submission | null }>(`/api/assignments/${id}/sit?s=${s()}`),
    submit: (assignmentId: string, body: { answers: unknown; results: unknown; got: number; total: number; done: boolean }) => call<Submission>("/api/submit", { s: s(), assignmentId, ...body }),
};

export const signOut = () => (set("account", null), set("altAccount", null));

/** A teacher puts on the student hat for one class; the teacher identity waits in altAccount. */
export const viewAsStudent = async (classId: string) => {
    const me = get().account;
    if (me?.role !== "teacher") return;
    const r = await api.demo(classId);
    set("altAccount", me);
    set("account", { role: "student", token: r.token, id: r.student.id, name: r.student.name, classId: r.class.id, className: r.class.name });
};
export const backToTeacher = () => {
    const t = get().altAccount;
    if (t?.role === "teacher") (set("account", t), set("altAccount", null));
};
export const YEARS = ["5th Year", "6th Year", "Transition Year", "3rd Year", "Other"];
export const SUBJECTS = ["Irish", "English", "Maths", "French", "German", "Spanish", "History", "Geography", "Biology", "Chemistry", "Physics", "Business", "Accounting", "Economics", "Home Economics", "Art", "Music", "Agricultural Science", "Construction", "Engineering", "DCG", "Politics & Society", "Religion", "PE"];

/** Where a deadline sits: past, inside three days, further out, or none. */
export const dueBucket = (due: number | null): "overdue" | "soon" | "later" | "none" => {
    if (!due) return "none";
    const d = due * 1000 - Date.now();
    return d < 0 ? "overdue" : d < 3 * 86400000 ? "soon" : "later";
};
export const toDue = (date: string) => (date ? new Date(date + "T23:59").getTime() / 1000 : null);
export const fromDue = (due: number | null) => (due ? new Date(due * 1000).toISOString().slice(0, 10) : "");
export const fmtDue = (due: number | null) => {
    if (!due) return "No due date";
    const d = new Date(due * 1000);
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    const when = d.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
    return days < 0 ? `Was due ${when}` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due ${when}`;
};
export const fmtWhen = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
