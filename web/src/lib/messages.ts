// Private messages: one long conversation between each student and the teacher. The hub keeps it;
// this file is the types, and the count of unread messages that the header and the console show.
import { useEffect, useSyncExternalStore } from "react";
import { api, useMe } from "./portal";

export type Message = { id: string; fromTeacher: boolean; senderName: string; body: string; createdAt: string; readAt: string | null };
export type Teacher = { name: string; firstName: string; avatar?: string };
export type StudentThread = { teacher: Teacher; messages: Message[] };
export type TeacherThread = { student: { id: string; name: string; email: string; avatar?: string; className: string | null; active: boolean }; messages: Message[] };
export type Conversation = { studentId: string; name: string; email: string; avatar?: string; className: string | null; active: boolean; lastBody: string; lastAt: string; lastFromTeacher: boolean; unread: number };
export type Inbox = { unread: number; conversations: Conversation[]; students: { id: string; name: string; className: string | null }[] };

export const MESSAGE_MAX = 5000;

/* ---- how many are waiting to be read ---- */
let unread = 0;
let watchers = 0;
let timer: number | null = null;
let role: "admin" | "student" | null = null;
const subs = new Set<() => void>();
const UNREAD_POLL_MS = 60_000;

export const setUnread = (n: number) => {
    if (n === unread) return;
    unread = n;
    subs.forEach((f) => f());
};
export const checkUnread = async () => {
    if (!role || document.visibilityState === "hidden") return;
    try {
        const d = await api<{ unread: number }>(`/api/${role}/messages/unread`);
        setUnread(d.unread || 0);
    } catch {
        /* a blip: the last count stands */
    }
};

/** Unread private messages for whoever is signed in. Asked once a minute while the tab is in view. */
export const useUnreadMessages = () => {
    const me = useMe();
    const v = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => unread);
    useEffect(() => {
        if (!me) return;
        role = me.role;
        watchers += 1;
        if (watchers === 1) {
            checkUnread();
            timer = window.setInterval(checkUnread, UNREAD_POLL_MS);
            document.addEventListener("visibilitychange", checkUnread);
        }
        return () => {
            watchers -= 1;
            if (watchers === 0) {
                if (timer) window.clearInterval(timer);
                timer = null;
                document.removeEventListener("visibilitychange", checkUnread);
            }
        };
    }, [me?.id, me?.role]);
    return me ? v : 0;
};

/* ---- time, the way a conversation shows it ---- */
const TZ = "Europe/Dublin";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short" }).format(new Date(iso));
export const sameDay = (a: string, b: string) => dayKey(a) === dayKey(b);
/** "Today", "Yesterday", "Monday 16 November". */
export const dayLabel = (iso: string) => {
    const today = dayKey(new Date().toISOString());
    const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
    const k = dayKey(iso);
    if (k === today) return "Today";
    if (k === yesterday) return "Yesterday";
    const d = new Date(iso);
    const thisYear = d.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat("en-IE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", ...(thisYear ? {} : { year: "numeric" }) }).format(d);
};
export const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-IE", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).replace(/[\s.]/g, "").toLowerCase();
/** For the list of conversations: the time today, the day this week, otherwise the date. */
export const whenLabel = (iso: string) => {
    const d = new Date(iso);
    if (sameDay(iso, new Date().toISOString())) return timeLabel(iso);
    if (Date.now() - d.getTime() < 6 * 86400000) return new Intl.DateTimeFormat("en-IE", { timeZone: TZ, weekday: "short" }).format(d);
    return new Intl.DateTimeFormat("en-IE", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
};
