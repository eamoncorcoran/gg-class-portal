// What the class board last looked like, kept while the app is open, and a way to start reading it
// before it is asked for. The Community page draws from here first and then reads the fresh copy, so
// arriving at the board (or coming back to it) shows the feed at once rather than a "Loading" line.
//
// It lives here, not in the page, so the menu can warm it when Community is hovered or touched
// without the menu having to load the page's code paths in a circle.
import { api } from "./portal";

/** One entry per view of the board, keyed by the address it was read from. The page knows the shape. */
export const boardCache = new Map<string, unknown>();

/* The class whose board the teacher sees, once it is known. */
let teacherClass: string | null = null;
export const teacherClassId = () => teacherClass;
export const setTeacherClassId = (id: string | null) => {
    teacherClass = id;
};

const going = new Map<string, Promise<unknown>>();
/** Starts reading the board if it has not been read yet. Safe to call as often as it is hovered. */
export const warmBoard = (role: "admin" | "student") => {
    const url = role === "student" ? "/api/student/community" : teacherClass ? `/api/admin/community/${teacherClass}` : null;
    if (!url || boardCache.has(url) || going.has(url)) return;
    going.set(
        url,
        api(url)
            .then((board) => boardCache.set(url, board))
            .catch(() => undefined) // no board, or signed out: the page will say so when it is opened
            .finally(() => going.delete(url)),
    );
};
