// Private messages: one long conversation between each student and the teacher. The hub keeps it;
// this file is the types, and the count of unread messages that the header and the console show.
import { useEffect, useSyncExternalStore } from "react";
import { api, upload, useMe } from "./portal";

export type MessageFile = { id: string; kind: "file" | "voice"; name: string; mime: string; size: number; seconds: number; url: string };
export type Message = { id: string; fromTeacher: boolean; senderName: string; body: string; createdAt: string; readAt: string | null; files: MessageFile[] };
/** What is being sent: words, files picked from the device, and (the teacher only) a voice note just recorded. */
export type Outgoing = { body: string; files: File[]; voice: { blob: Blob; seconds: number; fileName: string } | null };
export type Teacher = { name: string; firstName: string; avatar?: string };
export type StudentThread = { teacher: Teacher; messages: Message[] };
export type TeacherThread = { student: { id: string; name: string; email: string; avatar?: string; className: string | null; active: boolean }; messages: Message[] };
export type Conversation = { studentId: string; name: string; email: string; avatar?: string; className: string | null; active: boolean; lastBody: string; lastAt: string; lastFromTeacher: boolean; unread: number; /** "irish_for_primary" or "hibernia", by their class */ courseType?: string | null; /** the teacher marked it unread to come back to; students never see this */ markedUnread?: boolean };
export type Inbox = { unread: number; conversations: Conversation[]; students: { id: string; name: string; className: string | null; courseType?: string | null }[] };

export const MESSAGE_MAX = 5000;
export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;
/* What each side may attach. The hub decides again when the file arrives, by what the file is. */
export const STUDENT_ACCEPT = ".pdf,.doc,.docx";
export const TEACHER_ACCEPT = ".pdf,.doc,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.mp3,.m4a,.txt";
export const fileSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);

/** Sends a message to `path`: plain JSON when it is only words, a form when anything is attached. */
export const sendMessage = async (path: string, out: Outgoing): Promise<Message> => {
    if (!out.files.length && !out.voice) return (await api<{ message: Message }>(path, { method: "POST", json: { body: out.body } })).message;
    const form = new FormData();
    form.append("body", out.body);
    for (const f of out.files) form.append("files", f, f.name);
    if (out.voice) {
        form.append("voice", out.voice.blob, out.voice.fileName);
        form.append("voiceSeconds", String(Math.round(out.voice.seconds)));
    }
    return (await upload<{ message: Message }>(path, form)).message;
};

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
        // An administrator who is not the lead teacher has no private messages to count.
        if (!me || (me.role === "admin" && !me.isSuperAdmin)) return;
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
    }, [me?.id, me?.role, me?.isSuperAdmin]);
    return me && !(me.role === "admin" && !me.isSuperAdmin) ? v : 0;
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
