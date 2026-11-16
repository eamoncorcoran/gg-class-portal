// Everything a student does lives in this browser (localStorage, "pq." keys, the same keys the old
// page used, so nothing is lost in the move). A tiny store that React subscribes to.
import { useSyncExternalStore } from "react";
import type { QuizItem } from "./quiz";

export type Verdict = "correct" | "partial" | "wrong" | "blank";
export type Result = { key: string; verdict: Verdict; awarded: number; max: number; expected: string; feedback: string };
export type Check = { by: Record<string, Result>; at: number };
/** A running exam: examId is a saved exam's id, or "hw:<assignment id>" when it is homework. */
export type ExamRun = { end: number; ids: string[]; done: boolean; examId?: string } | null;
/** An exam the student built: its questions in order, a time limit (0 = none) and the last result. */
export type SavedExam = {
    id: string;
    name: string;
    ids: string[];
    mins: number;
    topics: string[];
    shuffle: boolean;
    created: number;
    instructions?: string;
    result?: { got: number; total: number; at: number };
};
/** A quiz built here: Duolingo-style items, played locally or shared with a class. */
export type Quiz = { id: string; name: string; items: QuizItem[]; created: number; result?: { got: number; total: number; at: number } };
/** Who this browser is: a teacher (owns classes) or a student (joined one class), or nobody yet. */
export type Account = { role: "teacher"; token: string; id: string; name: string } | { role: "student"; token: string; id: string; name: string; classId: string; className: string } | null;

type State = {
    saved: string[];
    exam: string[];
    answers: Record<string, Record<string, string>>;
    checks: Record<string, Check>;
    recent: string[];
    examRun: ExamRun;
    exams: SavedExam[];
    quizzes: Quiz[];
    quizScores: Record<string, { got: number; total: number; at: number }>;
    account: Account;
    /** the other hat: a teacher's demo-student identity (or the teacher while viewing as a student) */
    altAccount: Account;
    examName: string;
    examMins: number;
    side: boolean;
    artPrefs: { comments: boolean; gloss: boolean };
    /** the class hub: lesson progress, your own board posts and reactions, your name on the board */
    hubProgress: Record<string, { done?: number; pos?: number }>;
    hubThreads: HubThread[];
    hubComments: Record<string, HubComment[]>;
    hubReactions: Record<string, string>;
    hubName: string;
};
export type HubComment = { id: string; body: string; at: string; parentId?: string };
export type HubThread = { id: string; title: string; body: string; category?: string; at: string };

const read = <T>(k: string, d: T): T => {
    try {
        const v = localStorage.getItem("pq." + k);
        return v === null ? d : (JSON.parse(v) ?? d);
    } catch {
        return d;
    }
};
const write = (k: string, v: unknown) => {
    try {
        localStorage.setItem("pq." + k, JSON.stringify(v));
    } catch {
        /* private mode: the session still works, it just isn't remembered */
    }
};

let state: State = {
    saved: read("saved", []),
    exam: read("exam", []),
    answers: read("answers", {}),
    checks: read("checks", {}),
    recent: read("recent", []),
    examRun: read("examRun", null),
    exams: read("exams", []),
    quizzes: read("quizzes", []),
    quizScores: read("quizScores", {}),
    account: read("account", null),
    altAccount: read("altAccount", null),
    examName: read("examName", "Practice exam"),
    examMins: read("examMins", 50),
    side: read("side", true),
    artPrefs: read("artPrefs", { comments: true, gloss: true }),
    hubProgress: read("hubProgress", {}),
    hubThreads: read("hubThreads", []),
    hubComments: read("hubComments", {}),
    hubReactions: read("hubReactions", {}),
    hubName: read("hubName", ""),
};
const subs = new Set<() => void>();

export function set<K extends keyof State>(k: K, v: State[K]) {
    state = { ...state, [k]: v };
    write(k, v);
    subs.forEach((f) => f());
}
export const get = () => state;
export function useStore<T>(pick: (s: State) => T): T {
    return useSyncExternalStore(
        (f) => (subs.add(f), () => subs.delete(f)),
        () => pick(state),
    );
}

/* ---------------- actions ---------------- */
export const toggleSaved = (id: string) => {
    const on = !state.saved.includes(id);
    set("saved", on ? [...state.saved, id] : state.saved.filter((x) => x !== id));
    return on;
};
export const toggleExam = (id: string) => {
    const on = !state.exam.includes(id);
    set("exam", on ? [...state.exam, id] : state.exam.filter((x) => x !== id));
    return on;
};
export const setAnswer = (qid: string, key: string, v: string) => set("answers", { ...state.answers, [qid]: { ...state.answers[qid], [key]: v } });
export const remember = (id: string) => set("recent", [id, ...state.recent.filter((x) => x !== id)].slice(0, 6));
export const uid = () => Math.random().toString(36).slice(2, 10);
