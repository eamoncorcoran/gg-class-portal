// Community: the class board, on the hub's own API. Everything the old app.js board did, for both
// roles: the feed with its filters and side column, the composer (categories, title, body with
// bold / italic / emoji, video previews, and for teachers files, videos to Bunny, dictation, pin,
// email the class and scheduling), the post opened in a wide dialog with the comments tree, inline
// replies, voice notes and the AI reply draft, and the teacher's moderation (edit, pin, close,
// schedule, remove, comment edit / remove), the scheduled-posts calendar and CSV import, and the
// categories dialog. The board itself is `CommunityBoard`; `CommunityPage` mounts it at /community and
// the teacher console's CommunitySection mounts it at /teach/community/:classId.
import { type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog as AriaDialog, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { useNavigate, useParams } from "react-router";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { EmojiPicker, insertAtCursor } from "@/components/app/emoji-picker";
import { Avatar } from "@/components/app/hub-parts";
import { Calendar, Check, CheckCircle, Edit05, Microphone01, Smile, Trash01, UploadCloud02, X } from "@/components/app/ic";
import { Page, PageHeader } from "@/components/app/page-parts";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import {
    type DraftAttachment,
    type Recording,
    MAX_ATTACHMENT_MB,
    acceptDocuments,
    acceptVideos,
    attachmentFormat,
    attachmentsForSave,
    audioFileName,
    draftKey,
    fileSize,
    fmtDuration,
    startRecording,
    uploadsInFlight,
    voiceSupported,
} from "@/components/app/tus-upload";
import { type Who, initials } from "@/lib/hub";
import { boardCache, setTeacherClassId, teacherClassId } from "@/lib/community-cache";
import { DAY_NAMES, api, upload, useAdminBootstrap, useCanJoinLive, useLiveNow, useMe, loadStudentBootstrap } from "@/lib/portal";
import { cx } from "@/utils/cx";

/* ---------- the hub's shapes ---------- */
type Author = { id: string; name: string; role: "admin" | "student"; avatar?: boolean };
type Reaction = { emoji: string; count: number; mine?: boolean };
type Attachment = { id?: string; kind: "gif" | "youtube" | "loom" | "file" | "bunny"; url: string; fileName?: string; mimeType?: string; sizeBytes?: number };
export type Thread = {
    id: string;
    class_id?: string;
    title: string;
    body: string;
    pinned: boolean;
    /** replies switched off for students (they see it as closed to new replies) */
    locked: boolean;
    /** the teacher's private tick: dealt with. Only ever present on the teacher's copy. */
    handled_at?: string | null;
    created_at: string;
    published_at?: string;
    edited_at?: string | null;
    deleted_at?: string | null;
    scheduled?: boolean;
    category_id?: string | null;
    category_name?: string | null;
    author: Author;
    attachments: Attachment[];
    comment_count: number;
    reactions: Reaction[];
    last_comment?: { id: string; name: string; at: string; avatar?: boolean } | null;
};
type Comment = { id: string; body: string; created_at: string; edited_at?: string | null; deleted_at?: string | null; parent_id?: string | null; author: Author; reactions: Reaction[]; voice_note?: { url: string; mime?: string; seconds?: number } | null };
type Category = { id: string; name: string; position: number; thread_count?: number };
type NextClass = { startsAt: string; timezone?: string; minutesAway: number; live: boolean; soon: boolean; joinUrl?: string | null; note?: string | null; isExtra?: boolean };
type Klass = { id?: string; programme_name: string; day_of_week: number; start_time: string; timezone?: string; label?: string };
export type Board = {
    threads: Thread[];
    categories: Category[];
    contributors: { id: string; name: string; posts: number; comments: number; total: number; avatar?: boolean }[];
    unread?: number;
    /** the teacher's board carries the class and its next sitting; a student gets them from the bootstrap */
    class?: Klass;
    nextClass?: NextClass | null;
    emailAudience?: number;
};
type StudentBoot = { class: Klass | null; nextClass: NextClass | null; withdrawnAt?: string | null; liveReady?: boolean; liveNow?: boolean };

/* What the board last looked like, kept for as long as the app is open.
   ------------------------------------------------------------------
   Coming back to Community, or closing a post, used to start from nothing: a
   "Loading" line, then the feed. Now the feed that was last on screen is drawn at
   once and the fresh one replaces it when it arrives, a moment later and without
   anything moving. The same for a post: it opens showing what the feed already
   holds of it, and its comments fill in. Hovering a post, or touching it, starts
   fetching it, so by the time it is pressed the comments are usually there.

   Nothing here is trusted over the server: every use is followed by a fresh read. */
type FullThread = Thread & { comments: Comment[] };
const boards = boardCache as Map<string, Board>; // kept in lib/community-cache so the menu can warm it
const threadCache = new Map<string, FullThread>();
const threadFetches = new Map<string, Promise<FullThread>>();
/** Reads one post with its comments, once at a time however many things ask, and keeps the answer. */
const fetchThread = (base: string, id: string, fresh = false) => {
    const key = `${base}:${id}`;
    // After something has been written (a comment, a reaction), an answer already on its way is from before it.
    let going = fresh ? undefined : threadFetches.get(key);
    if (!going) {
        going = api<FullThread>(`${base}/community/thread/${id}`)
            .then((full) => (threadCache.set(key, full), full))
            .finally(() => {
                if (threadFetches.get(key) === mine) threadFetches.delete(key);
            });
        const mine = going;
        threadFetches.set(key, going);
    }
    return going;
};
/** Started when a post is hovered or touched. A failure is nobody's business until the post is actually opened. */
const prefetchThread = (base: string, id: string) => {
    if (!threadCache.has(`${base}:${id}`)) fetchThread(base, id).catch(() => undefined);
};

const REACTIONS = ["👍", "❤️", "🎉", "😂", "😮", "🙏", "💪", "🤔"];
const LIKE = "👍";
const FALLBACK_TZ = "Europe/Dublin";

const who = (a?: Author | null): Who => ({ id: a?.id, name: a?.name || "Removed account", role: a?.role ?? "student", avatar: a?.id && a.avatar ? `/api/media/avatar/${a.id}` : undefined });

/* ---------- time, in the class timezone (deadlines belong to the class, not the reader) ---------- */
/* Postgres writes some timestamps with six fractional digits ("…42.092403+08:00", the last_comment
   stamp among them). Safari's Date parser only promises three, so the extras are trimmed first. */
const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(String(value).replace(/(\.\d{3})\d+/, "$1")));
const tzOffsetMinutes = (date: Date, timeZone: string) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
};
/** ISO instant to the "YYYY-MM-DDTHH:mm" a datetime-local input expects, read in the class timezone. */
const toZonedInput = (value: string | Date, timeZone: string) => {
    const date = toDate(value);
    return new Date(date.getTime() + tzOffsetMinutes(date, timeZone) * 60000).toISOString().slice(0, 16);
};
/** The reverse: a wall-clock value typed into a datetime-local input, read in the class timezone. */
const fromZonedInput = (text: string, timeZone: string) => {
    const naive = new Date(`${text}:00Z`).getTime();
    if (!Number.isFinite(naive)) return new Date().toISOString();
    let instant = naive - tzOffsetMinutes(new Date(naive), timeZone) * 60000;
    instant = naive - tzOffsetMinutes(new Date(instant), timeZone) * 60000;
    return new Date(instant).toISOString();
};
/** "Sun 19 Jul 2026, 20:00" (or without the year), in the class timezone. */
const fmtWhen = (value: string, timeZone: string, short = false) =>
    new Intl.DateTimeFormat("en-IE", { weekday: "short", day: "numeric", month: "short", ...(short ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(toDate(value)).replace(/^(\p{L}{2,4}),\s/u, "$1 ");
const timeAgo = (value?: string | null, timeZone = FALLBACK_TZ) => {
    if (!value) return "";
    const seconds = Math.round((Date.now() - toDate(value).getTime()) / 1000);
    if (seconds < 45) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d`;
    return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeZone }).format(toDate(value));
};
const scheduledFor = (value: string, timeZone: string) => {
    const minutes = Math.round((toDate(value).getTime() - Date.now()) / 60000);
    if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
    if (minutes < 60 * 24) return `in ${Math.round(minutes / 60)}h`;
    return fmtWhen(value, timeZone, true);
};
/** "40 minutes", "3 hours": enough precision for a countdown, no more. */
const relativeWhen = (minutes: number) => {
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
};
const passcodeOnly = (note: string) => {
    const text = String(note || "").trim();
    const match = /pass\s*code\s*[:\-]?\s*([^\s·|,;]+)/i.exec(text);
    return match ? match[1].trim() : text;
};

/* Mirrors src/videolinks.js. Anything not recognisably one of these two is refused rather than dropped into an iframe. */
const VIDEO_PATTERNS: [string, RegExp][] = [
    ["loom", /loom\.com\/(?:share|embed)\/([a-zA-Z0-9]{8,})/i],
    ["youtube", /youtube\.com\/watch\?(?:[^\s]*&)?v=([a-zA-Z0-9_-]{6,})/i],
    ["youtube", /youtu\.be\/([a-zA-Z0-9_-]{6,})/i],
    ["youtube", /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i],
    ["youtube", /youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/i],
];
const videoEmbed = (url: string) => {
    for (const [kind, pattern] of VIDEO_PATTERNS) {
        const m = String(url || "").match(pattern);
        if (m) return { kind, src: kind === "loom" ? `https://www.loom.com/embed/${m[1]}` : `https://www.youtube-nocookie.com/embed/${m[1]}` };
    }
    return null;
};
const videosIn = (text: string) => {
    const found: { kind: string; src: string }[] = [];
    for (const word of text.split(/\s+/)) {
        const v = videoEmbed(word);
        if (v && !found.some((f) => f.src === v.src)) found.push(v);
        if (found.length >= 3) break;
    }
    return found;
};
/** Bunny's embed code arrives with autoplay on; nothing on the board plays until it is clicked. */
const noAutoplay = (url: string) => {
    try {
        const u = new URL(url);
        u.searchParams.set("autoplay", "false");
        u.searchParams.set("preload", "false");
        return u.toString();
    } catch {
        return url;
    }
};
const VideoFrame = ({ v }: { v: { kind: string; src: string } }) => (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe src={v.src} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen loading="lazy" title={v.kind === "loom" ? "Loom video" : "YouTube video"} className="size-full" />
    </div>
);

/** `**bold**`, `*italic*` and line breaks, as the hub's richText. */
const Rich = ({ text, clamp, small }: { text: string; clamp?: boolean; small?: boolean }) => {
    const parts = text.split(/(\*\*[^*\n]+\*\*|(?<![*\w])\*[^*\n]+\*(?!\*))/g).filter(Boolean);
    return (
        <p className={cx("whitespace-pre-line text-secondary", small ? "text-[13.5px] leading-6" : "text-md leading-7", clamp && "line-clamp-3")}>
            {parts.map((p, i) =>
                p.startsWith("**") && p.endsWith("**") ? (
                    <strong key={i} className="font-bold text-primary">
                        {p.slice(2, -2)}
                    </strong>
                ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
                    <em key={i}>{p.slice(1, -1)}</em>
                ) : (
                    p
                ),
            )}
        </p>
    );
};

/* In the feed an attachment is a hint that there is more inside: a GIF plays, a video is a player
   (Bunny's, on an address the server signed for this reader), and a PDF is a line you can open. */
const Attachments = ({ list }: { list: Attachment[] }) =>
    list?.length ? (
        <div className="mt-3 flex flex-col gap-3">
            {list.map((a, i) => {
                if (a.kind === "gif") return <img key={i} src={a.url} alt="GIF" loading="lazy" className="max-w-[400px] rounded-xl border-2 border-secondary" />;
                if (a.kind === "bunny") {
                    if (!/^https:\/\/iframe\.mediadelivery\.net\//.test(a.url || "")) return null;
                    return (
                        <div key={i} className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                            <iframe src={noAutoplay(a.url)} allow="accelerometer; gyroscope; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" title={a.fileName || "Video"} className="size-full" />
                        </div>
                    );
                }
                if (a.kind === "loom" || a.kind === "youtube") {
                    const v = videoEmbed(a.url);
                    return v ? <VideoFrame key={i} v={v} /> : null;
                }
                return (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-3 self-start rounded-xl border-2 border-secondary px-3 py-2 text-sm font-bold text-primary hover:bg-primary_hover">
                        <span className="truncate">{a.fileName ?? "Document"}</span>
                        <em className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-quaternary uppercase not-italic">{attachmentFormat(a)}</em>
                    </a>
                );
            })}
        </div>
    ) : null;

/** The reaction row: 👍 always, the others as they appear, and the picker with the eight reactions. */
const Reactions = ({ type, id, given, base, size = "md", onChange }: { type: "thread" | "post"; id: string; given: Reaction[]; base: string; size?: "sm" | "md"; onChange?: (r: Reaction[]) => void }) => {
    const [list, setList] = useState(given);
    const [pick, setPick] = useState(false);
    useEffect(() => setList(given), [given]);
    useEffect(() => {
        if (!pick) return;
        const close = () => setPick(false);
        const t = setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
        return () => {
            clearTimeout(t);
            document.removeEventListener("click", close);
        };
    }, [pick]);
    const react = async (emoji: string) => {
        setPick(false);
        try {
            const r = await api<{ reactions: Reaction[] }>(`${base}/community/react/${type}/${id}`, { method: "POST", json: { emoji } });
            setList(r.reactions);
            onChange?.(r.reactions);
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const like = list.find((r) => r.emoji === LIKE);
    const rest = list.filter((r) => r.emoji !== LIKE);
    const pill = (r: Reaction | undefined, emoji: string) => (
        <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            aria-pressed={!!r?.mine}
            title={emoji === LIKE ? (like ? `${like.count} ${like.count === 1 ? "person likes" : "people like"} this` : "Like this") : `${r?.count ?? 0} ${r?.count === 1 ? "person" : "people"}`}
            className={cx("flex items-center gap-1 rounded-full border-2 outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2", size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-sm", r?.mine ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary bg-primary text-secondary hover:bg-primary_hover", emoji === LIKE && "min-w-11 justify-center")}
        >
            <span aria-hidden="true">{emoji}</span>
            {r && r.count > 0 && <b className="font-bold tabular-nums">{r.count}</b>}
        </button>
    );
    return (
        <div className="relative flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {pill(like, LIKE)}
            {rest.map((r) => pill(r, r.emoji))}
            <button type="button" onClick={() => setPick(!pick)} aria-label="Add a different reaction" aria-expanded={pick} className={cx("flex items-center justify-center rounded-full border-2 border-dashed border-secondary text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2", size === "sm" ? "size-7" : "size-8")}>
                <Smile aria-hidden="true" className="size-4" />
            </button>
            {pick && (
                <div className="absolute bottom-full left-0 z-20 mb-1.5 flex gap-0.5 rounded-full border-2 border-secondary bg-primary p-1 shadow-lg duration-150 animate-in fade-in zoom-in-95">
                    {REACTIONS.map((e) => (
                        <button key={e} type="button" onClick={() => react(e)} className="flex size-9 items-center justify-center rounded-full text-[19px] transition hover:scale-115 hover:bg-secondary">
                            {e}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/* The small text actions (Edit, Remove, Reply, "6 comments"): a 36px tap target drawn as plain text, the
   negative margins keeping the rows they sit in as tight as they were. */
const TEXT_BTN = "-my-2 inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-bold text-tertiary outline-focus-ring hover:bg-secondary hover:text-primary focus-visible:outline-2";

const Name = ({ a }: { a?: Author | null }) => (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-bold text-primary">
        <span className="truncate">{a?.name || "Removed account"}</span>
        {a?.role === "admin" && <i className="rounded-full bg-brand-solid px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase not-italic">Teacher</i>}
    </span>
);

/** One post in the feed. */
type ThreadChange = { pinned?: boolean; locked?: boolean; handled?: boolean };

/** The teacher's open/closed tick on a post. Students never see it: the column is stripped before their copy leaves the server. */
const HandledToggle = ({ t, onMod, size = "xs" }: { t: Thread; onMod: (change: ThreadChange) => void; size?: "xs" | "sm" }) => {
    const closed = Boolean(t.handled_at);
    return (
        <button
            type="button"
            onClick={() => onMod({ handled: !closed })}
            aria-pressed={closed}
            title={closed ? "Closed: dealt with. Press to reopen. It reopens itself if a student writes again." : "Close: mark as dealt with"}
            className={cx(
                "inline-flex items-center gap-1.5 rounded-full border-2 font-bold whitespace-nowrap outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                size === "xs" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
                closed ? "border-utility-success-200 bg-utility-success-50 text-utility-success-700 hover:bg-utility-success-100" : "border-secondary bg-primary text-tertiary hover:border-primary hover:text-primary",
            )}
        >
            <CheckCircle aria-hidden="true" className={cx(size === "xs" ? "size-3.5" : "size-4", closed ? "text-utility-success-600" : "text-fg-quaternary")} />
            {closed ? "Closed" : "Close"}
        </button>
    );
};

const PostCard = ({ t, base, admin, tz, onOpen, onMod }: { t: Thread; base: string; admin: boolean; tz: string; onOpen: () => void; onMod?: (change: ThreadChange) => void }) => (
    <article
        // About to be opened: start reading its comments now, so they are there when it is.
        onPointerEnter={() => prefetchThread(base, t.id)}
        onTouchStart={() => prefetchThread(base, t.id)}
        onClick={(e) => {
            // The like row and any attachment link live inside the card, so neither should also open it.
            if ((e.target as HTMLElement).closest("a,button,iframe")) return;
            onOpen();
        }}
        className={cx("cursor-pointer rounded-2xl border-2 border-secondary bg-primary px-5 py-4.5 outline-focus-ring transition duration-100 ease-linear hover:border-primary hover:shadow-sm", t.deleted_at && "opacity-60", t.scheduled && "border-dashed")}
    >
        <div className="flex items-start gap-3">
            <Avatar who={who(t.author)} />
            <div className="min-w-0 flex-1">
                <Name a={t.author} />
                <p className="text-xs text-tertiary">
                    {t.scheduled && t.published_at ? <b className="rounded-md bg-warning-primary px-1.5 py-0.5 text-warning-primary">Scheduled {scheduledFor(t.published_at, tz)}</b> : timeAgo(t.published_at || t.created_at, tz)}
                    {t.pinned ? <> · <b className="text-secondary">Pinned</b></> : ""}
                    {t.edited_at ? " · edited" : ""}
                    {t.locked && admin ? " · Replies off" : ""}
                    {t.deleted_at && admin ? <> · <b className="text-error-primary">Removed</b></> : ""}
                    {/* On a phone the category joins this line so the author's name is not squeezed by the chip. */}
                    {t.category_name ? <span className="sm:hidden"> · {t.category_name}</span> : ""}
                </p>
            </div>
            {t.category_name && <span className="hidden shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary sm:inline">{t.category_name}</span>}
        </div>
        <h3 className="mt-3 text-[17.5px] leading-snug font-bold text-primary">{t.title}</h3>
        <div className="mt-1.5">
            <Rich text={String(t.body || "").length > 300 ? String(t.body).slice(0, 300) + "…" : String(t.body || "")} clamp />
        </div>
        <Attachments list={t.attachments} />
        <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-secondary pt-3.5">
            <Reactions type="thread" id={t.id} given={t.reactions} base={base} />
            <button type="button" onClick={onOpen} className={cx(TEXT_BTN, "-mx-2 text-sm")}>
                {t.comment_count || 0} {t.comment_count === 1 ? "comment" : "comments"}
            </button>
            {t.last_comment && (
                <span className={cx("flex items-center gap-1.5 text-xs text-quaternary", !(admin && onMod) && "ml-auto")}>
                    <Avatar who={{ id: t.last_comment.id, name: t.last_comment.name, role: "student", avatar: t.last_comment.avatar ? `/api/media/avatar/${t.last_comment.id}` : undefined }} size="xs" />
                    Last comment {timeAgo(t.last_comment.at, tz)}
                </span>
            )}
            {admin && onMod && <span className="ml-auto"><HandledToggle t={t} onMod={onMod} /></span>}
        </div>
    </article>
);

/* ---------- writing tools: format bar, emoji, dictation, growing textarea ---------- */

/** Pressing bold on something already bold takes it off again, which is what the button appears to promise. */
const wrapSelection = (el: HTMLTextAreaElement, value: string, marker: string): { next: string; a: number; b: number } => {
    const start = el.selectionStart, end = el.selectionEnd;
    const chosen = value.slice(start, end), before = value.slice(0, start), after = value.slice(end);
    if (chosen && before.endsWith(marker) && after.startsWith(marker)) return { next: before.slice(0, -marker.length) + chosen + after.slice(marker.length), a: start - marker.length, b: end - marker.length };
    return { next: `${before}${marker}${chosen}${marker}${after}`, a: start + marker.length, b: end + marker.length };
};

/* Counted rather than measured: rows are a native property of a textarea and cannot be thrown off by
   whatever dialog the box sits in. Wrapping is estimated from the column width. */
const growRows = (el: HTMLTextAreaElement | null, value: string, min = 2, max = 14) => {
    const columns = Math.max(20, Math.floor((el?.clientWidth ?? 480) / 8) || 60);
    const lines = String(value || "").split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / columns)), 0);
    return Math.min(Math.max(lines, min), max);
};

/** The teacher's dictation button: record, then the hub transcribes and the words land at the cursor. */
const Dictate = ({ taRef, value, onChange }: { taRef: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void }) => {
    const [state, setState] = useState<"" | "recording" | "working">("");
    const [timer, setTimer] = useState("");
    const rec = useRef<Recording | null>(null);
    if (!voiceSupported()) return null;
    const toggle = async () => {
        if (state === "recording" && rec.current) {
            setState("working");
            setTimer("");
            try {
                const { blob, seconds } = await rec.current.stop();
                if (seconds < 0.6) throw new Error("That recording was too short.");
                const form = new FormData();
                form.append("audio", blob, audioFileName(blob));
                form.append("mode", "full");
                const result = await upload<{ text: string; cleaned?: boolean }>("/api/admin/dictate", form);
                if (result.text) {
                    const el = taRef.current;
                    const before = value.slice(0, el?.selectionStart ?? value.length);
                    const after = value.slice(el?.selectionEnd ?? value.length);
                    const needsGap = before.trim() && !/\n\s*$/.test(before);
                    const joined = `${before}${needsGap ? (before.endsWith(" ") ? "" : " ") : ""}${result.text}`;
                    onChange(joined + after);
                    requestAnimationFrame(() => {
                        el?.focus();
                        el?.setSelectionRange(joined.length, joined.length);
                    });
                }
                toast(result.cleaned ? "Dictation added" : "Dictation added without cleanup");
            } catch (e) {
                toast((e as Error).message);
            } finally {
                setState("");
                rec.current = null;
            }
            return;
        }
        if (state) return;
        try {
            rec.current = await startRecording({ onTick: (s) => setTimer(fmtDuration(s)) });
            setState("recording");
            setTimer("0:00");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <button type="button" onClick={toggle} title="Dictate this" aria-label={state === "recording" ? "Stop dictating" : "Dictate"} className={cx("flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold outline-focus-ring hover:bg-secondary focus-visible:outline-2", state === "recording" ? "bg-error-primary text-error-primary" : "text-tertiary")}>
            <span aria-hidden="true" className={cx("size-2.5 rounded-full", state === "recording" ? "animate-pulse bg-error-solid" : "hidden bg-fg-quaternary sm:inline")} />
            {/* On a phone the idle button is the icon alone, so the toolbar stays on one row. */}
            {!state && <Microphone01 aria-hidden="true" className="size-4 sm:hidden" />}
            <span className={cx(!state && "hidden sm:inline")}>{state === "working" ? "Transcribing" : state === "recording" ? "Stop" : "Dictate"}</span>
            {timer && <span className="tabular-nums">{timer}</span>}
        </button>
    );
};

/** A growing textarea with the B / I / emoji tools (Ctrl+B, Ctrl+I, Cmd+Enter to send, Escape to cancel). */
const Writer = ({ value, onChange, placeholder, autoFocus, onSubmit, submitLabel, onCancel, busy, dictate, taRef, trailing, below, submitDisabled, rows, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onSubmit?: () => void; submitLabel?: string; onCancel?: () => void; busy?: boolean; dictate?: boolean; taRef?: RefObject<HTMLTextAreaElement | null>; trailing?: ReactNode; below?: ReactNode; submitDisabled?: boolean; rows?: [number, number]; ariaLabel?: string }) => {
    const own = useRef<HTMLTextAreaElement>(null);
    const ta = taRef ?? own;
    const [emo, setEmo] = useState(false);
    const wrap = (mark: string) => {
        const el = ta.current;
        if (!el) return;
        const r = wrapSelection(el, value, mark);
        onChange(r.next);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(r.a, r.b);
        });
    };
    const insert = (s: string) => {
        const el = ta.current;
        const r = insertAtCursor(el, value, s);
        onChange(r.next);
        setEmo(false);
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(r.at, r.at);
        });
    };
    return (
        <div className="rounded-2xl border-2 border-secondary bg-primary transition focus-within:border-brand">
            <textarea
                ref={ta}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel ?? placeholder}
                autoFocus={autoFocus}
                rows={growRows(ta.current, value, rows?.[0], rows?.[1])}
                onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmit) {
                        e.preventDefault();
                        onSubmit();
                    }
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                        e.preventDefault();
                        wrap("**");
                    }
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
                        e.preventDefault();
                        wrap("*");
                    }
                    if (e.key === "Escape" && onCancel) {
                        e.preventDefault();
                        onCancel();
                    }
                }}
                className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-md leading-7 text-primary outline-hidden placeholder:text-placeholder/80"
            />
            {below}
            <div className="relative flex flex-wrap items-center gap-1 px-2 pb-2">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("**")} title="Bold (Ctrl+B)" className="size-8 rounded-lg text-sm font-black text-tertiary hover:bg-secondary" aria-label="Bold">
                    B
                </button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("*")} title="Italic (Ctrl+I)" className="size-8 rounded-lg text-sm font-bold text-tertiary italic hover:bg-secondary" aria-label="Italic">
                    I
                </button>
                {/* A phone keyboard has its own emoji; leaving this out there keeps the toolbar on one row. */}
                <button type="button" onClick={() => setEmo(!emo)} className="hidden size-8 items-center justify-center rounded-lg text-tertiary hover:bg-secondary sm:flex" aria-label="Add an emoji" title="Add an emoji" aria-expanded={emo}>
                    <Smile aria-hidden="true" className="size-4.5" />
                </button>
                {emo && <EmojiPicker onPick={insert} onClose={() => setEmo(false)} className="left-2" />}
                {dictate && <Dictate taRef={ta} value={value} onChange={onChange} />}
                {trailing}
                <span className="flex-1" />
                {onCancel && (
                    <DuoButton size="xs" color="ghost" onPress={onCancel}>
                        Cancel
                    </DuoButton>
                )}
                {onSubmit && submitLabel && (
                    <DuoButton size="xs" className="px-2.5 sm:px-3" onPress={onSubmit} isDisabled={busy || submitDisabled}>
                        {busy ? "Sending…" : submitLabel}
                    </DuoButton>
                )}
            </div>
        </div>
    );
};

/* ---------- the composer ---------- */

/** One row per attachment: the format as a badge, the name, the size, a progress bar while it goes up or a tick once it is there. */
const AttachmentRow = ({ item, onDrop }: { item: DraftAttachment; onDrop: () => void }) => {
    const format = attachmentFormat(item);
    const failed = Boolean(item.error);
    const uploading = !failed && item.progress != null && item.progress < 100;
    return (
        <div className={cx("flex items-center gap-3 rounded-xl border-2 px-3 py-2", failed ? "border-error bg-error-primary/40" : "border-secondary")}>
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-[10px] font-black text-quaternary">{item.kind === "gif" ? <img src={item.preview || item.url} alt="" className="size-full object-cover" /> : format}</span>
            <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-bold text-primary">{item.fileName || (item.kind === "gif" ? "GIF" : format)}</strong>
                <span className={cx("block truncate text-xs", failed ? "text-error-primary" : "text-tertiary")}>{failed ? item.error : item.sizeBytes ? fileSize(item.sizeBytes) : format}</span>
                {uploading && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${item.progress}%` }} />
                    </div>
                )}
            </div>
            {uploading ? <span className="text-xs font-bold text-tertiary tabular-nums">{item.progress}%</span> : failed ? null : <Check aria-hidden="true" className="size-4 text-fg-success-secondary" />}
            <button type="button" onClick={onDrop} aria-label={`Remove ${item.fileName || "attachment"}`} className="flex size-8 items-center justify-center rounded-lg text-fg-quaternary hover:bg-secondary hover:text-fg-secondary">
                <Trash01 aria-hidden="true" className="size-4" />
            </button>
        </div>
    );
};

type ComposerProps = { open: boolean; onClose: () => void; base: string; postPath: string; admin: boolean; board: Board | null; tz: string; editing?: Thread | null; onPosted: (id: string | null, edited: boolean) => void };

/** The composer: category (required when there are any), title, the post, and for teachers files, video, dictation, pin, email and scheduling. */
const Composer = ({ open, onClose, admin, board, tz, editing, postPath, onPosted }: ComposerProps) => {
    const me = useMe();
    const categories = board?.categories ?? [];
    const [cat, setCat] = useState("");
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [pinned, setPinned] = useState(false);
    const [notify, setNotify] = useState(false);
    const [when, setWhen] = useState("");
    const [scheduling, setScheduling] = useState(false);
    const [zone, setZone] = useState(false);
    const [over, setOver] = useState(false);
    const [list, setList] = useState<DraftAttachment[]>([]);
    const [busy, setBusy] = useState(false);
    const [missing, setMissing] = useState(false);
    const pdfInput = useRef<HTMLInputElement>(null);
    const videoInput = useRef<HTMLInputElement>(null);
    const editingNow = Boolean(editing);
    useEffect(() => {
        if (!open) return;
        /* Nothing preselected. The board's current filter is where somebody was reading, not where they
           mean to post. On an edit, what the post already holds sits in the list to keep or take off. */
        setCat(editing?.category_id || "");
        setTitle(editing?.title || "");
        setBody(editing?.body || "");
        setList((editing?.attachments || []).map((a) => ({ ...a, key: draftKey(), existing: true })));
        setPinned(false);
        setNotify(false);
        setWhen("");
        setScheduling(false);
        setZone(false);
        setMissing(false);
        setBusy(false);
    }, [open, editing]);

    const add = (row: DraftAttachment) => setList((l) => [...l, row]);
    const patch = (key: string, change: Partial<DraftAttachment>) => setList((l) => l.map((r) => (r.key === key ? { ...r, ...change } : r)));
    const videos = videosIn(body);
    const audience = board?.emailAudience ?? 0;

    const toggleSchedule = () => {
        if (scheduling) {
            setScheduling(false);
            setWhen("");
            return;
        }
        if (!when) {
            // Nine tomorrow morning in the class's time zone.
            const today = toZonedInput(new Date(), tz).slice(0, 10);
            setWhen(`${new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)}T09:00`);
        }
        setScheduling(true);
    };

    const post = async () => {
        // A video still going up has no address yet, and posting now would drop it.
        if (uploadsInFlight(list)) return toast("Wait for the upload to finish, then post.");
        const payload: Record<string, unknown> = { title: title.trim(), body: body.trim(), categoryId: cat || null, attachments: attachmentsForSave(list) };
        if (!payload.title || !payload.body) return toast("Give your post a line and a message.");
        /* Checked after the writing, so somebody who has typed a post is not stopped before they have said anything. */
        if (categories.length && !cat) {
            setMissing(true);
            return toast("Choose where this post belongs.");
        }
        setBusy(true);
        try {
            if (editing) {
                await api(`/api/admin/community/thread/${editing.id}/content`, { method: "PATCH", json: payload });
                onClose();
                toast("Post updated");
                onPosted(editing.id, true);
                return;
            }
            if (admin) {
                payload.pinned = pinned;
                payload.notifyEmail = notify;
                if (scheduling && when) {
                    const at = fromZonedInput(when, tz);
                    if (new Date(at).getTime() <= Date.now()) {
                        setBusy(false);
                        return toast("Pick a time in the future, or post it now.");
                    }
                    payload.publishedAt = at;
                }
            }
            const r = await api<{ id: string }>(postPath, { method: "POST", json: payload });
            onClose();
            /* Say whether it went out, and to how many. "Posted" alone leaves somebody who ticked the box wondering. */
            if (payload.notifyEmail && payload.publishedAt) toast("Scheduled. The class will be emailed when it appears");
            else if (payload.notifyEmail) toast(`Posted and emailed to ${audience} student${audience === 1 ? "" : "s"}`);
            else toast(payload.publishedAt ? "Scheduled" : "Posted");
            onPosted(r.id, false);
        } catch (e) {
            toast((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const onFormDrop = async (e: React.DragEvent) => {
        if (!admin || !e.dataTransfer?.files?.length) return;
        e.preventDefault();
        setOver(false);
        const dropped = [...e.dataTransfer.files];
        const vids = dropped.filter((f) => String(f.type || "").startsWith("video/"));
        const docs = dropped.filter((f) => !vids.includes(f));
        if (docs.length) {
            setZone(true);
            await acceptDocuments(docs, add, patch);
        }
        if (vids.length) await acceptVideos(vids, add, patch);
    };

    const tool = (label: string, on: boolean, onPress: () => void, children: ReactNode) => (
        <button type="button" onClick={onPress} title={label} aria-label={label} aria-pressed={on} className={cx("flex size-8 items-center justify-center rounded-lg hover:bg-secondary", on ? "bg-brand-primary text-brand-secondary" : "text-tertiary")}>
            {children}
        </button>
    );

    return (
        <DuoDialog open={open} onClose={onClose} title={me?.name ?? "Write to the class"} sub={editingNow ? "Editing this post" : "Write something to the class"} className="max-w-2xl">
            <form
                onSubmit={(e) => e.preventDefault()}
                onDragOver={(e) => admin && e.preventDefault()}
                onDrop={onFormDrop}
                className="flex flex-col gap-4"
            >
                {categories.length > 0 && (
                    <div className={cx("rounded-xl", missing && !cat && "bg-error-primary/40 p-2")}>
                        <FieldLabel>
                            Post in
                            {missing && !cat ? <span className="text-error-primary"> · pick one</span> : null}
                        </FieldLabel>
                        <div role="radiogroup" aria-label="Choose a category" className="flex flex-wrap gap-2">
                            {categories.map((c) => (
                                <button key={c.id} type="button" role="radio" aria-checked={cat === c.id} onClick={() => (setCat(c.id), setMissing(false))} className={cx("rounded-full border-2 px-3.5 py-1.5 text-[13px] font-bold transition duration-100 ease-linear", cat === c.id ? "border-brand bg-brand-solid text-white" : "border-secondary bg-primary text-secondary hover:bg-primary_hover")}>
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={200} autoComplete="off" aria-label="Title" autoFocus={!editing} className="w-full border-0 border-b-2 border-secondary bg-transparent px-1 py-2 text-[22px] font-bold text-primary outline-hidden placeholder:text-placeholder/60 focus:border-brand" />
                <Writer
                    value={body}
                    onChange={setBody}
                    placeholder="Write something… paste a YouTube or Loom link and it will play here"
                    onSubmit={post}
                    dictate={admin}
                    rows={[6, 18]}
                    trailing={
                        admin ? (
                            <>
                                {tool("Attach a file", zone, () => {
                                    if (!zone) {
                                        setZone(true);
                                        pdfInput.current?.click();
                                    } else setZone(false);
                                }, <UploadCloud02 aria-hidden="true" className="size-4.5" />)}
                                {tool("Upload a video", false, () => videoInput.current?.click(), <span className="text-[10px] font-black">VID</span>)}
                            </>
                        ) : null
                    }
                />
                {videos.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                        {videos.map((v) => (
                            <VideoFrame key={v.src} v={v} />
                        ))}
                    </div>
                )}
                {admin && (
                    <>
                        <input ref={pdfInput} type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={async (e) => {
                            const files = e.target.files;
                            if (files?.length) await acceptDocuments(files, add, patch);
                            e.target.value = "";
                        }} />
                        <input ref={videoInput} type="file" multiple accept="video/*,.mp4,.mov,.m4v,.webm" className="hidden" onChange={async (e) => {
                            const chosen = e.target.files ? [...e.target.files] : [];
                            e.target.value = "";
                            if (chosen.length) await acceptVideos(chosen, add, patch);
                        }} />
                        {/* The upload zone is folded away until asked for: an empty drop target took up half the dialog. */}
                        {zone && (
                            <label
                                onDragEnter={(e) => (e.preventDefault(), setOver(true))}
                                onDragOver={(e) => e.preventDefault()}
                                onDragLeave={() => setOver(false)}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOver(false);
                                    if (e.dataTransfer?.files?.length) await acceptDocuments(e.dataTransfer.files, add, patch);
                                }}
                                className={cx("flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm transition", over ? "border-brand bg-brand-primary" : "border-secondary hover:bg-primary_hover")}
                            >
                                <input type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={async (e) => {
                                    if (e.target.files?.length) await acceptDocuments(e.target.files, add, patch);
                                    e.target.value = "";
                                }} />
                                <UploadCloud02 aria-hidden="true" className="size-6 text-fg-quaternary" />
                                <span className="text-secondary">
                                    <b className="text-brand-secondary">Click to upload</b> or drag and drop
                                </span>
                                <span className="text-xs text-quaternary">PDF or Word document, up to {MAX_ATTACHMENT_MB}MB</span>
                            </label>
                        )}
                    </>
                )}
                {list.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {list.map((item) => (
                            <AttachmentRow key={item.key} item={item} onDrop={() => setList((l) => l.filter((r) => r.key !== item.key))} />
                        ))}
                    </div>
                )}
                {admin && !editingNow && scheduling && (
                    <div className="rounded-xl bg-secondary p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor="composer-when" className="text-sm font-bold text-primary">
                                Appears to students at
                            </label>
                            <input id="composer-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="rounded-xl border-2 border-secondary bg-primary px-3 py-1.5 text-sm font-medium text-primary outline-hidden focus:border-brand" />
                            <button type="button" onClick={toggleSchedule} aria-label="Do not schedule" className="flex size-8 items-center justify-center rounded-lg text-fg-quaternary hover:bg-primary">
                                <X aria-hidden="true" className="size-4" />
                            </button>
                        </div>
                        <p className="mt-1.5 text-xs text-tertiary">Times in {tz}. Until then it sits in your feed marked Scheduled, and nobody is notified.</p>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-secondary">
                    {admin && !editingNow && (
                        <>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-brand-600" /> Pin to the top
                            </label>
                            {audience ? (
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-brand-600" /> Email the class ({audience} student{audience === 1 ? "" : "s"})
                                </label>
                            ) : (
                                <span className="text-quaternary">Nobody on this class to email yet</span>
                            )}
                        </>
                    )}
                    <span className="flex-1" />
                    <DuoButton size="sm" color="secondary" onPress={onClose}>
                        Cancel
                    </DuoButton>
                    {admin && !editingNow && (
                        <DuoButton size="sm" color="secondary" onPress={toggleSchedule}>
                            {scheduling ? "Post now" : "Schedule"}
                        </DuoButton>
                    )}
                    <DuoButton size="sm" onPress={post} isDisabled={busy}>
                        {editingNow ? "Save changes" : scheduling ? "Schedule post" : "Post"}
                    </DuoButton>
                </div>
            </form>
        </DuoDialog>
    );
};

/* ---------- the thread dialog ---------- */

/** The comments of a thread, arranged one level deep. Anything whose parent has gone is drawn at the top level. */
const commentTree = (comments: Comment[]) => {
    const byParent = new Map<string | null, Comment[]>();
    const ids = new Set(comments.map((c) => c.id));
    for (const c of comments) {
        const parent = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
        byParent.set(parent, [...(byParent.get(parent) ?? []), c]);
    }
    return (byParent.get(null) ?? []).map((comment) => ({ comment, replies: byParent.get(comment.id) ?? [] }));
};

/* The drafted reply: written when the post is first opened and kept. It sits above the box rather than
   inside it, so using it is a choice. Teachers only; the field is stripped from student payloads. */
const ReplyDraft = ({ threadId, onUse }: { threadId: string; onUse: (draft: string) => void }) => {
    const [state, setState] = useState<"loading" | "again" | "off" | "none" | "drafted" | "failed" | "used">("loading");
    const [draft, setDraft] = useState("");
    const [err, setErr] = useState("");
    const load = useCallback(async (regenerate = false) => {
        setState(regenerate ? "again" : "loading");
        try {
            const r = await api<{ state: string; draft?: string }>(`/api/admin/community/thread/${threadId}/draft`, { method: "POST", json: { regenerate } });
            if (r.state === "off") return setState("off");
            if (r.state !== "drafted" || !r.draft) return setState("none");
            setDraft(r.draft);
            setState("drafted");
        } catch (e) {
            setErr((e as Error).message);
            setState("failed");
        }
    }, [threadId]);
    useEffect(() => {
        load();
    }, [load]);
    if (state === "off") return null;
    return (
        <div className="mx-5 mb-3 rounded-2xl border-2 border-dashed border-secondary bg-secondary_subtle px-4 py-3 text-sm md:mx-6">
            {state === "loading" || state === "again" ? (
                <p className="text-tertiary">{state === "again" ? "Drafting again…" : "Drafting a reply…"}</p>
            ) : state === "failed" ? (
                <p className="text-error-primary">{err}</p>
            ) : state === "none" ? (
                <p className="text-tertiary">
                    No draft this time. Write your own, or{" "}
                    <button type="button" onClick={() => load(true)} className="font-bold text-brand-secondary hover:underline">
                        try again
                    </button>
                    .
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="duo-label text-quaternary">{state === "used" ? "Moved into your comment below" : "Suggested reply"}</span>
                        {state === "drafted" && (
                            <span className="ml-auto flex gap-3">
                                <button type="button" onClick={() => (onUse(draft), setState("used"))} className="text-xs font-bold text-brand-secondary hover:underline">
                                    Edit this
                                </button>
                                <button type="button" onClick={() => load(true)} className="text-xs font-bold text-brand-secondary hover:underline">
                                    Draft again
                                </button>
                            </span>
                        )}
                    </div>
                    {state === "drafted" && <p className="mt-2 whitespace-pre-line leading-6 text-secondary">{draft}</p>}
                </>
            )}
        </div>
    );
};

/** Recording a reply, held in memory until the comment is sent: record, then press Comment. */
const ReplyRecorder = ({ pending, setPending }: { pending: { blob: Blob; seconds: number } | null; setPending: (p: { blob: Blob; seconds: number } | null) => void }) => {
    const rec = useRef<Recording | null>(null);
    const [recording, setRecording] = useState(false);
    const [tick, setTick] = useState("");
    if (!voiceSupported()) return null;
    const press = async () => {
        if (recording && rec.current) {
            const { blob, seconds } = await rec.current.stop();
            rec.current = null;
            setRecording(false);
            setTick("");
            if (seconds < 0.6) {
                setPending(null);
                return toast("That recording was too short.");
            }
            setPending({ blob, seconds: Math.round(seconds) });
            return;
        }
        try {
            rec.current = await startRecording({ onTick: (s) => setTick(fmtDuration(s)) });
            setRecording(true);
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <span className="flex items-center gap-2">
            <button type="button" onClick={press} aria-label={recording ? "Stop recording" : pending ? "Re-record the voice note" : "Record a voice note"} className={cx("flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold outline-focus-ring hover:bg-secondary focus-visible:outline-2", recording ? "bg-error-primary text-error-primary" : "text-tertiary")}>
                <span aria-hidden="true" className={cx("size-2.5 rounded-full", recording ? "animate-pulse bg-error-solid" : "bg-fg-quaternary", !recording && !pending && "hidden sm:inline")} />
                {!recording && !pending && <Microphone01 aria-hidden="true" className="size-4 sm:hidden" />}
                <span className={cx(!recording && !pending && "hidden sm:inline")}>{recording ? "Stop" : pending ? "Re-record" : "Voice note"}</span>
            </button>
            <span className="text-xs text-tertiary tabular-nums empty:hidden">
                {recording ? tick : pending ? (
                    <>
                        {fmtDuration(pending.seconds)} ready{" "}
                        <button type="button" onClick={() => setPending(null)} className="font-bold text-brand-secondary hover:underline">
                            remove
                        </button>
                    </>
                ) : null}
            </span>
        </span>
    );
};

/** Editing a comment in place: a small box rather than a dialog, because it is a repair rather than a decision. */
const CommentEditor = ({ original, onSave, onCancel }: { original: string; onSave: (body: string) => Promise<void>; onCancel: () => void }) => {
    const [v, setV] = useState(original);
    const [busy, setBusy] = useState(false);
    const ta = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        const el = ta.current;
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
    }, []);
    const save = async () => {
        const body = v.trim();
        if (!body) return toast("A comment cannot be empty.");
        if (body === original) return onCancel();
        setBusy(true);
        try {
            await onSave(body);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="mt-1">
            <textarea
                ref={ta}
                value={v}
                onChange={(e) => setV(e.target.value)}
                rows={3}
                aria-label="Edit the comment"
                onKeyDown={(e) => {
                    if (e.key === "Escape") (e.preventDefault(), onCancel());
                    // The same shortcut that sends a comment, so editing one feels like writing one.
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), save());
                }}
                className="w-full rounded-xl border-2 border-secondary bg-primary px-3 py-2 text-sm text-primary outline-hidden focus:border-brand"
            />
            <div className="mt-1.5 flex justify-end gap-2">
                <DuoButton size="xs" color="ghost" onPress={onCancel}>
                    Cancel
                </DuoButton>
                <DuoButton size="xs" onPress={save} isDisabled={busy}>
                    Save
                </DuoButton>
            </div>
        </div>
    );
};

/* Everything one comment card needs from the dialog. The card lives outside ThreadDialog on purpose:
   a component defined inside another is a new type on every render, so React unmounted and remounted
   the whole comments tree on each keystroke in a reply box, dropping focus and any open picker. */
type CommentShared = {
    admin: boolean;
    tz: string;
    base: string;
    canComment: boolean;
    editingComment: string | null;
    setEditingComment: (id: string | null) => void;
    to: string | null;
    setTo: (id: string | null) => void;
    inline: string;
    setInline: (v: string) => void;
    busy: boolean;
    sendInline: (parentId: string) => void;
    commentRemoval: (c: Comment) => void;
    saveComment: (c: Comment, body: string) => Promise<void>;
};

const CommentCard = ({ c, replies, shared }: { c: Comment; replies: Comment[]; shared: CommentShared }) => {
    const { admin, tz, base, canComment, editingComment, setEditingComment, to, setTo, inline, setInline, busy, sendInline, commentRemoval, saveComment } = shared;
    const removed = Boolean(c.deleted_at);
    return (
        <article data-comment={c.id} className={cx("flex gap-3", removed && "opacity-70")}>
            <Avatar who={who(c.author)} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                    <Name a={c.author} />
                    <span className="text-xs text-quaternary">
                        {timeAgo(c.created_at, tz)}
                        {c.edited_at ? " · edited" : ""}
                    </span>
                    {admin && !removed && editingComment !== c.id && (
                        <button type="button" onClick={() => setEditingComment(c.id)} className={TEXT_BTN}>
                            Edit
                        </button>
                    )}
                    {admin && (
                        <button type="button" onClick={() => commentRemoval(c)} className={TEXT_BTN}>
                            {removed ? "Restore" : "Remove"}
                        </button>
                    )}
                </div>
                {removed ? (
                    <p className="mt-1 text-sm text-quaternary italic">This comment was removed.</p>
                ) : editingComment === c.id ? (
                    <CommentEditor original={c.body} onSave={(body) => saveComment(c, body)} onCancel={() => setEditingComment(null)} />
                ) : (
                    <>
                        {c.body && (
                            <div className="mt-1">
                                <Rich text={c.body} small />
                            </div>
                        )}
                        {c.voice_note && (
                            <div className="mt-2 flex items-center gap-2">
                                <audio controls preload="none" src={c.voice_note.url} className="h-9 max-w-full" />
                                <span className="text-xs text-quaternary tabular-nums">{fmtDuration(c.voice_note.seconds)}</span>
                            </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <Reactions type="post" id={c.id} given={c.reactions} base={base} size="sm" />
                            {canComment && (
                                <button type="button" onClick={() => (setTo(c.id), setInline(""))} className={TEXT_BTN}>
                                    Reply
                                </button>
                            )}
                        </div>
                    </>
                )}
                {replies.length > 0 && (
                    <div className="mt-3 flex flex-col gap-3 border-l-2 border-secondary pl-3.5">
                        {replies.map((k) => (
                            <CommentCard key={k.id} c={k} replies={[]} shared={shared} />
                        ))}
                    </div>
                )}
                {to === c.id && (
                    <div className="mt-3">
                        <Writer value={inline} onChange={setInline} placeholder={`Reply to ${c.author?.name || "this comment"}`} autoFocus onSubmit={() => sendInline(c.id)} submitLabel="Reply" onCancel={() => setTo(null)} busy={busy} />
                    </div>
                )}
            </div>
        </article>
    );
};

type ThreadDialogProps = { id: string; base: string; admin: boolean; tz: string; withdrawn: boolean; draftingOn: boolean; version?: number; /** the post as the feed holds it, shown while its comments are read */ seed?: Thread; onClose: () => void; onChanged: () => void; onEdit: (t: Thread) => void };

/** The post, opened: a panel over the middle of the screen with the comments tree, inline replies and the reply box. */
const ThreadDialog = ({ id, base, admin, tz, withdrawn, draftingOn, version = 0, seed, onClose, onChanged, onEdit }: ThreadDialogProps) => {
    const me = useMe();
    /* Opens showing what is already in hand: the post as it was last read in full, or failing that
       the post as the feed holds it, with its comments to follow. `loaded` is false until the
       comments on screen are ones that were actually read for this post. */
    const kept = threadCache.get(`${base}:${id}`);
    const [t, setT] = useState<FullThread | null>(kept ?? (seed ? { ...seed, comments: [] } : null));
    const [loaded, setLoaded] = useState(Boolean(kept));
    const [err, setErr] = useState<string | null>(null);
    const [reply, setReply] = useState("");
    const [audio, setAudio] = useState<{ blob: Blob; seconds: number } | null>(null);
    const [to, setTo] = useState<string | null>(null);
    const [inline, setInline] = useState("");
    const [editingComment, setEditingComment] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const scrollTo = useRef<string | null>(null);
    const replyBox = useRef<HTMLTextAreaElement>(null);
    /* The first read may join one that hovering the card already started. Every read after that is
       asked for afresh, because it follows something being written. */
    const first = useRef(true);
    const load = useCallback(
        () =>
            fetchThread(base, id, !first.current)
                .then((full) => {
                    first.current = false;
                    setT(full);
                    setLoaded(true);
                })
                .catch((e) => setErr(e.message)),
        [base, id],
    );
    // `version` bumps when the composer saves an edit of this post, so the open dialog reads it back.
    useEffect(() => {
        load();
    }, [load, version]);
    useEffect(() => {
        // Keep the reader where they were rather than at the top of a long thread.
        if (t && scrollTo.current) {
            document.querySelector(`[data-comment="${scrollTo.current}"]`)?.scrollIntoView({ block: "center" });
            scrollTo.current = null;
        }
    }, [t]);
    const refresh = async () => {
        await load();
        onChanged();
    };

    const send = async () => {
        const body = reply.trim();
        // A voice note can carry the whole reply, so the box may be empty when there is a recording to send with it.
        if (!body && !audio) return toast("Write a comment, or record one.");
        setBusy(true);
        try {
            const c = await api<{ id: string }>(`${base}/community/thread/${id}/replies`, { method: "POST", json: { body: body || "🎧" } });
            if (audio) {
                const form = new FormData();
                form.append("audio", audio.blob, audioFileName(audio.blob));
                form.append("seconds", String(audio.seconds));
                await upload(`/api/admin/voice-note/comment/${c.id}`, form);
                setAudio(null);
            }
            setReply("");
            await refresh();
        } catch (e) {
            toast((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const sendInline = async (parentId: string) => {
        const body = inline.trim();
        if (!body) return toast("Write a reply before sending.");
        setBusy(true);
        try {
            const created = await api<{ id: string }>(`${base}/community/thread/${id}/replies`, { method: "POST", json: { body, parentId } });
            scrollTo.current = created?.id || parentId;
            setInline("");
            setTo(null);
            await refresh();
        } catch (e) {
            toast((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const mod = async (change: ThreadChange) => {
        try {
            await api(`/api/admin/community/thread/${id}`, { method: "PATCH", json: change });
            await refresh();
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const removal = async () => {
        if (!t) return;
        const removed = !t.deleted_at;
        if (removed && !(await askConfirm({ title: "Remove this post?", message: "Students stop seeing it immediately. The comments are kept and you can restore the whole post at any time.", confirmLabel: "Remove", danger: true }))) return;
        try {
            await api(`/api/admin/community/thread/${id}/removal`, { method: "POST", json: { removed } });
            await refresh();
            toast(removed ? "Post removed" : "Post restored");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const commentRemoval = async (c: Comment) => {
        try {
            await api(`/api/admin/community/post/${c.id}/removal`, { method: "POST", json: { removed: !c.deleted_at } });
            await refresh();
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const saveComment = async (c: Comment, body: string) => {
        try {
            await api(`/api/admin/community/post/${c.id}`, { method: "PATCH", json: { body } });
            setEditingComment(null);
            await refresh();
            toast("Comment updated");
        } catch (e) {
            toast((e as Error).message);
        }
    };

    const canComment = admin || (!!t && !t.locked && !withdrawn);
    const comments = t?.comments ?? [];

    const shared: CommentShared = { admin, tz, base, canComment, editingComment, setEditingComment, to, setTo, inline, setInline, busy, sendInline, commentRemoval, saveComment };

    return (
        <AriaModalOverlay isOpen onOpenChange={(o) => !o && onClose()} isDismissable className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/60 p-0 backdrop-blur-[2px] duration-200 animate-in fade-in sm:items-center sm:p-4">
            <AriaModal className="relative flex max-h-dvh w-full max-w-[860px] flex-col overflow-hidden rounded-t-3xl border-2 border-secondary bg-primary shadow-xl duration-200 animate-in slide-in-from-bottom-2 sm:max-h-[92dvh] sm:rounded-3xl sm:zoom-in-95">
                <AriaDialog aria-label={t?.title ?? "Post"} className="flex min-h-0 flex-1 flex-col outline-hidden">
                    <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full bg-primary/90 text-fg-quaternary shadow-xs ring-1 ring-secondary hover:text-fg-secondary">
                        <X aria-hidden="true" className="size-4.5" />
                    </button>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {!t ? (
                            <p className="p-10 text-center text-sm text-tertiary">{err ?? "Loading…"}</p>
                        ) : (
                            <>
                                {admin && (
                                    <div className="flex flex-wrap items-center gap-2 border-b-2 border-secondary bg-secondary_subtle px-5 py-2.5 pr-14 text-xs">
                                        <span className="hidden duo-label text-quaternary sm:inline">Teacher</span>
                                        <DuoButton size="xs" color="ghost" onPress={() => onEdit(t)}>
                                            Edit
                                        </DuoButton>
                                        <DuoButton size="xs" color="ghost" onPress={() => mod({ pinned: !t.pinned })}>
                                            {t.pinned ? "Unpin" : "Pin"}
                                        </DuoButton>
                                        {/* Replies off is the public lock students notice; Open/Closed on the right is the teacher's own tick. */}
                                        <DuoButton size="xs" color="ghost" onPress={() => mod({ locked: !t.locked })}>
                                            {t.locked ? "Turn replies on" : "Turn replies off"}
                                        </DuoButton>
                                        <DuoButton size="xs" color="ghost" onPress={() => setScheduleOpen(true)}>
                                            {t.scheduled ? "Reschedule" : "Schedule"}
                                        </DuoButton>
                                        <DuoButton size="xs" color={t.deleted_at ? "ghost" : "danger"} onPress={removal}>
                                            {t.deleted_at ? "Restore" : "Remove"}
                                        </DuoButton>
                                        <span className="ml-auto"><HandledToggle t={t} onMod={mod} /></span>
                                    </div>
                                )}
                                {t.scheduled && t.published_at && <p className="mx-5 mt-4 rounded-xl bg-warning-primary px-4 py-2 text-sm font-semibold text-warning-primary md:mx-6">Not visible to students yet. Appears {fmtWhen(t.published_at, tz)}.</p>}
                                <article className="px-5 pt-5 pb-4 md:px-6">
                                    <div className="flex items-start gap-3 pr-10">
                                        <Avatar who={who(t.author)} />
                                        <div className="min-w-0 flex-1">
                                            <Name a={t.author} />
                                            <p className="text-xs text-tertiary">
                                                {timeAgo(t.published_at || t.created_at, tz)}
                                                {t.category_name ? ` · ${t.category_name}` : ""}
                                                {t.edited_at ? " · edited" : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <h2 className="mt-4 text-[19px] leading-snug font-bold text-primary">{t.title}</h2>
                                    <div className="mt-2">
                                        <Rich text={t.body} />
                                    </div>
                                    <Attachments list={t.attachments} />
                                    <div className="mt-4 border-t border-secondary pt-3.5">
                                        <Reactions type="thread" id={t.id} given={t.reactions} base={base} onChange={onChanged} />
                                    </div>
                                </article>
                                <h4 className="px-5 pt-1 pb-2 text-sm font-bold text-primary md:px-6">
                                    {loaded ? comments.length : t.comment_count || 0} {(loaded ? comments.length : t.comment_count) === 1 ? "comment" : "comments"}
                                </h4>
                                <div className="flex flex-col gap-4 px-5 pb-5 md:px-6">
                                    {!loaded && (t.comment_count || 0) > 0 && <p className="text-sm text-tertiary">{err ?? "Loading the comments…"}</p>}
                                    {loaded && comments.length === 0 && <p className="text-sm text-tertiary">No comments yet. Be the first.</p>}
                                    {commentTree(comments).map(({ comment, replies }) => (
                                        <CommentCard key={comment.id} c={comment} replies={replies} shared={shared} />
                                    ))}
                                </div>
                                {/* No request when board drafting is known to be off: nothing would come back. */}
                                {admin && draftingOn && (
                                    <ReplyDraft
                                        threadId={t.id}
                                        onUse={(d) => {
                                            setReply(d);
                                            requestAnimationFrame(() => {
                                                const el = replyBox.current;
                                                el?.focus();
                                                // Cursor at the end, because the first thing anybody does is edit it.
                                                el?.setSelectionRange(el.value.length, el.value.length);
                                                el?.scrollIntoView({ block: "center", behavior: "smooth" });
                                            });
                                        }}
                                    />
                                )}
                            </>
                        )}
                    </div>
                    {t && (
                        <div className="border-t-2 border-secondary bg-primary px-5 py-3.5 md:px-6">
                            {!canComment ? (
                                <p className="py-2 text-center text-sm font-semibold text-tertiary">{withdrawn ? "You have withdrawn from this course, so posting is closed." : "This post has been closed to new comments."}</p>
                            ) : (
                                <div className="flex items-start gap-3">
                                    {me && <Avatar who={{ name: me.name, role: me.role, avatar: me.hasAvatar ? `/api/media/avatar/${me.id}` : undefined }} size="sm" className="mt-1" />}
                                    <div className="min-w-0 flex-1">
                                        <Writer taRef={replyBox} value={reply} onChange={setReply} placeholder="Write a comment" onSubmit={send} submitLabel="Comment" busy={busy} dictate={admin} submitDisabled={!reply.trim() && !audio} trailing={admin ? <ReplyRecorder pending={audio} setPending={setAudio} /> : null} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </AriaDialog>
            </AriaModal>
            {t && scheduleOpen && <ScheduleDialog thread={t} tz={tz} onClose={() => setScheduleOpen(false)} onSaved={refresh} />}
        </AriaModalOverlay>
    );
};

/** Schedule or reschedule one post. Setting a time in the past publishes it immediately. */
const ScheduleDialog = ({ thread, tz, onClose, onSaved }: { thread: Thread; tz: string; onClose: () => void; onSaved: () => Promise<void> }) => {
    const [when, setWhen] = useState(() => toZonedInput(thread.published_at || new Date(), tz));
    const save = async () => {
        if (!when) return toast("Pick a time.");
        try {
            await api(`/api/admin/community/thread/${thread.id}/schedule`, { method: "PATCH", json: { publishedAt: fromZonedInput(when, tz) } });
            onClose();
            await onSaved();
            toast("Schedule saved");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title={thread.scheduled ? "Reschedule" : "Schedule this post"} sub={`Times in ${tz}.`} className="z-[60]">
            <FieldLabel>Appears to students at</FieldLabel>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Appears to students at" className="w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden focus:border-brand" />
            <p className="mt-2 text-xs text-tertiary">Setting a time in the past publishes it immediately.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={save}>
                    Save
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* ---------- a term of posts in one go ---------- */
type Plan = { timezone: string; posts: { id: string; title: string; body: string; pinned: boolean; published_at: string; category_name?: string | null; category_id?: string | null }[] };
type Preview = { timezone: string; ready: number; problems: number; rows: { line: number; title: string; localWhen: string; categoryName: string | null; pinned: boolean; past: boolean; problems: string[] }[] };

/* Fetched rather than linked to. A plain download link would leave the page, and a failure would land
   somebody on a bare error rather than telling them what went wrong where they are. */
const downloadTemplate = async (classId: string) => {
    try {
        const response = await fetch(`/api/admin/community/${classId}/schedule-template`, { credentials: "same-origin" });
        if (!response.ok) throw new Error("The template could not be prepared.");
        const url = URL.createObjectURL(new Blob([await response.text()], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "scheduled-posts-template.csv";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
        toast((e as Error).message);
    }
};

/* Month by month, because a term is planned in months, read in the class timezone. */
const ScheduleCalendar = ({ plan, onOpen }: { plan: Plan; onOpen: (id: string) => void }) => {
    const zone = plan.timezone || FALLBACK_TZ;
    const inZone = (iso: string) => {
        const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(toDate(iso)).reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
        return { year: Number(p.year), month: Number(p.month), day: Number(p.day), time: `${p.hour}:${p.minute}` };
    };
    const byDay = new Map<string, (Plan["posts"][number] & { time: string })[]>();
    let earliest: number | null = null, latest: number | null = null;
    for (const post of plan.posts) {
        const at = inZone(post.published_at);
        const key = `${at.year}-${at.month}-${at.day}`;
        byDay.set(key, [...(byDay.get(key) ?? []), { ...post, time: at.time }]);
        const stamp = at.year * 12 + at.month;
        if (earliest === null || stamp < earliest) earliest = stamp;
        if (latest === null || stamp > latest) latest = stamp;
    }
    const months: { year: number; month: number }[] = [];
    for (let s = earliest!; s <= latest!; s += 1) months.push({ year: Math.floor((s - 1) / 12), month: ((s - 1) % 12) + 1 });
    return (
        <div className="flex flex-col gap-6">
            {months.map(({ year, month }) => {
                const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
                const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday-first
                return (
                    <section key={`${year}-${month}`}>
                        <h4 className="mb-2 text-md font-bold text-primary">{new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" })}</h4>
                        <div className="grid grid-cols-7 overflow-hidden rounded-2xl border-2 border-secondary">
                            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                                <div key={d} className="border-b border-secondary py-1.5 text-center duo-label text-quaternary">
                                    {d}
                                </div>
                            ))}
                            {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} className="min-h-14 border-b border-r border-secondary bg-secondary_subtle" />)}
                            {Array.from({ length: days }, (_, i) => {
                                const posts = byDay.get(`${year}-${month}-${i + 1}`) ?? [];
                                return (
                                    <div key={i} className={cx("min-h-14 border-b border-r border-secondary p-1", posts.length && "bg-brand-primary/40")}>
                                        <span className="text-[11px] font-bold text-quaternary tabular-nums">{i + 1}</span>
                                        {posts.map((p) => (
                                            <button key={p.id} type="button" onClick={() => onOpen(p.id)} title={p.title} className="mt-0.5 block w-full truncate rounded-md bg-brand-solid px-1.5 py-0.5 text-left text-[11px] leading-4 font-bold text-white hover:brightness-110">
                                                <b className="tabular-nums">{p.time}</b> {p.title}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

/** Two screens: what is already queued, and bringing in a file. Nothing is written until the file has been read back. */
const SchedulePlanDialog = ({ classId, onClose, onOpenThread, onImported }: { classId: string; onClose: () => void; onOpenThread: (id: string) => void; onImported: () => void }) => {
    const [plan, setPlan] = useState<Plan | null>(null);
    const [importing, setImporting] = useState(false);
    const [chosen, setChosen] = useState<File | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [previewErr, setPreviewErr] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [over, setOver] = useState(false);
    useEffect(() => {
        api<Plan>(`/api/admin/community/${classId}/scheduled`).then(setPlan).catch((e) => {
            toast(e.message);
            onClose();
        });
    }, [classId]);

    const read = async (file?: File | null) => {
        if (!file) return;
        setChosen(file);
        setPreview(null);
        setPreviewErr(null);
        setReading(true);
        const form = new FormData();
        form.append("file", file);
        try {
            setPreview(await upload<Preview>(`/api/admin/community/${classId}/schedule-preview`, form));
        } catch (e) {
            setPreviewErr((e as Error).message);
        } finally {
            setReading(false);
        }
    };
    const doImport = async () => {
        if (!chosen) return;
        const form = new FormData();
        form.append("file", chosen);
        setBusy(true);
        try {
            const result = await upload<{ created: number; skipped: unknown[] }>(`/api/admin/community/${classId}/schedule-import`, form);
            onClose();
            onImported();
            toast(`${result.created} post${result.created === 1 ? "" : "s"} scheduled${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}`);
        } catch (e) {
            setBusy(false);
            toast((e as Error).message);
        }
    };

    if (importing)
        return (
            <DuoDialog open onClose={onClose} title="Import scheduled posts" sub="One row per post. Nothing is written until you have seen what it read." className="max-w-3xl">
                <label
                    onDragEnter={(e) => (e.preventDefault(), setOver(true))}
                    onDragOver={(e) => (e.preventDefault(), setOver(true))}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setOver(false);
                        read(e.dataTransfer?.files?.[0]);
                    }}
                    className={cx("flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm transition", over ? "border-brand bg-brand-primary" : "border-secondary hover:bg-primary_hover")}
                >
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
                    <UploadCloud02 aria-hidden="true" className="size-6 text-fg-quaternary" />
                    <span className="text-secondary">
                        <b className="text-brand-secondary">Click to upload</b> or drag a CSV here
                    </span>
                    <span className="text-xs text-quaternary">Columns: Date, Title, Body, Category, Pinned</span>
                </label>
                <p className="mt-2 text-xs text-tertiary">
                    Dates can be written 25/12/2026 09:00 or 2026-12-25T09:00. A category must already exist. Not sure of the shape?{" "}
                    <button type="button" onClick={() => downloadTemplate(classId)} className="font-bold text-brand-secondary hover:underline">
                        Download the template
                    </button>
                    .
                </p>
                <div className="mt-4">
                    {reading && <p className="text-sm text-tertiary">Reading…</p>}
                    {previewErr && <p className="text-sm font-semibold text-error-primary">{previewErr}</p>}
                    {preview && (
                        <>
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                                <span className="font-bold text-success-primary">{preview.ready} ready</span>
                                {preview.problems ? <span className="font-bold text-error-primary">{preview.problems} with problems</span> : null}
                                <span className="text-xs text-tertiary">Times read as {preview.timezone}</span>
                            </div>
                            <div className="mt-2 overflow-x-auto rounded-2xl border-2 border-secondary">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-secondary duo-label text-quaternary">
                                            <th className="px-3 py-2 text-left">Row</th>
                                            <th className="px-3 py-2 text-left">When</th>
                                            <th className="px-3 py-2 text-left">Title</th>
                                            <th className="px-3 py-2 text-left">Category</th>
                                            <th className="px-3 py-2" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.rows.map((row) => (
                                            <tr key={row.line} className={cx("border-b border-secondary", row.problems.length && "bg-error-primary/30")}>
                                                <td className="px-3 py-2 tabular-nums">{row.line}</td>
                                                <td className="px-3 py-2">
                                                    {row.localWhen || "-"}
                                                    {row.past && !row.problems.length ? <b className="ml-1 text-xs text-warning-primary">publishes at once</b> : null}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {row.title || "-"}
                                                    {row.pinned ? <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-tertiary">Pinned</span> : null}
                                                </td>
                                                <td className="px-3 py-2">{row.categoryName || "-"}</td>
                                                <td className="px-3 py-2">{row.problems.length ? <span className="font-semibold text-error-primary">{row.problems.join("; ")}</span> : <span className="font-semibold text-success-primary">will be scheduled</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <DuoButton color="secondary" size="sm" onPress={() => setImporting(false)}>
                        Cancel
                    </DuoButton>
                    <DuoButton size="sm" onPress={doImport} isDisabled={busy || !preview || preview.ready === 0}>
                        {preview ? (preview.ready ? `Schedule ${preview.ready} post${preview.ready === 1 ? "" : "s"}` : "Nothing to import") : "Import"}
                    </DuoButton>
                </div>
            </DuoDialog>
        );

    return (
        <DuoDialog open onClose={onClose} title="Scheduled posts" sub={plan ? `Not yet visible to students. Times in ${plan.timezone}.` : "Loading…"} className="max-w-3xl">
            {plan &&
                (plan.posts.length ? (
                    <ScheduleCalendar plan={plan} onOpen={(id) => (onClose(), onOpenThread(id))} />
                ) : (
                    <div className="rounded-2xl border-2 border-dashed border-secondary p-6 text-center">
                        <strong className="block text-md font-bold text-primary">Nothing is queued</strong>
                        <span className="text-sm text-tertiary">Posts you schedule, one at a time or from a spreadsheet, wait here until their date.</span>
                    </div>
                ))}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Close
                </DuoButton>
                <DuoButton color="secondary" size="sm" onPress={() => downloadTemplate(classId)}>
                    Download template
                </DuoButton>
                <DuoButton size="sm" onPress={() => setImporting(true)}>
                    Import a spreadsheet
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/** Categories: what a post can be filed under. Deleting one leaves its posts where they are. */
const CategoriesDialog = ({ classId, categories, onClose, onChanged }: { classId: string; categories: Category[]; onClose: () => void; onChanged: () => Promise<void> }) => {
    const [name, setName] = useState("");
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const add = async () => {
        const n = name.trim();
        if (!n) return toast("Give the category a short name.");
        try {
            await api(`/api/admin/community/${classId}/categories`, { method: "POST", json: { name: n } });
            setName("");
            await onChanged();
            toast("Category added");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const rename = async () => {
        if (!renaming) return;
        const n = renaming.name.trim();
        if (!n) return toast("Give the category a short name.");
        try {
            await api(`/api/admin/community/categories/${renaming.id}`, { method: "PATCH", json: { name: n } });
            setRenaming(null);
            await onChanged();
            toast("Category renamed");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const remove = async (c: Category) => {
        try {
            await api(`/api/admin/community/categories/${c.id}`, { method: "DELETE" });
            await onChanged();
            toast("Category deleted");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const inputCls = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden focus:border-brand";
    return (
        <DuoDialog open onClose={onClose} title="Categories" sub="What a post can be filed under.">
            <div className="flex flex-col gap-2">
                {categories.length === 0 && <p className="text-sm text-tertiary">No categories yet.</p>}
                {categories.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-secondary px-3 py-2">
                        {renaming?.id === c.id ? (
                            <>
                                <input value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} maxLength={60} autoFocus aria-label="Category name" onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" ? setRenaming(null) : null)} className="min-w-0 flex-1 rounded-lg border-2 border-secondary px-2 py-1 text-sm font-bold text-primary outline-hidden focus:border-brand" />
                                <DuoButton size="xs" onPress={rename}>
                                    Save
                                </DuoButton>
                                <DuoButton size="xs" color="ghost" onPress={() => setRenaming(null)}>
                                    Cancel
                                </DuoButton>
                            </>
                        ) : (
                            <>
                                <strong className="min-w-0 flex-1 truncate text-sm font-bold text-primary">{c.name}</strong>
                                <span className="text-xs text-tertiary">
                                    {c.thread_count ?? 0} post{c.thread_count === 1 ? "" : "s"}
                                </span>
                                <DuoButton size="xs" color="ghost" onPress={() => setRenaming({ id: c.id, name: c.name })}>
                                    Rename
                                </DuoButton>
                                <DuoButton size="xs" color="danger" onPress={() => remove(c)}>
                                    Delete
                                </DuoButton>
                            </>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-5">
                <FieldLabel>Add a category</FieldLabel>
                <div className="flex gap-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Pronunciation" aria-label="Add a category" onKeyDown={(e) => e.key === "Enter" && add()} className={inputCls} />
                    <DuoButton size="sm" onPress={add}>
                        Add
                    </DuoButton>
                </div>
            </div>
            <p className="mt-3 text-xs text-tertiary">Deleting a category leaves its posts where they are; they simply become uncategorised.</p>
            <div className="mt-6 flex justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Done
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* ---------- the column beside the feed ---------- */
const SideCard = ({ title, children }: { title?: string; children: ReactNode }) => (
    <section className="rounded-2xl border-2 border-secondary bg-primary p-4">
        {title && <h2 className="mb-3 duo-label text-quaternary">{title}</h2>}
        {children}
    </section>
);

/* The next class, in the column, in the class timezone rather than the reader's. */
const SideNextClass = ({ next, liveReady }: { next: NextClass; liveReady?: boolean }) => {
    /* In the hub's own room, "live" is the teacher having gone live (polled), not the clock. */
    const on = useLiveNow() && Boolean(liveReady);
    // The door is the teacher's at any time; the word "now" is not.
    const canJoin = useCanJoinLive() && Boolean(liveReady);
    const live = liveReady ? on : next.live;
    const label = live ? "Happening now" : next.live ? "Starting shortly" : next.soon ? `Starts in ${relativeWhen(next.minutesAway)}` : toDate(next.startsAt).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "short", timeZone: next.timezone || FALLBACK_TZ });
    const note = next.note ? (/^pass\s*code/i.test(next.note) || !next.joinUrl ? `Passcode: ${passcodeOnly(next.note)}` : next.note) : null;
    return (
        <div className={cx("mt-3 flex items-center gap-3 rounded-xl px-3 py-2 text-sm", live ? "bg-brand-primary" : "bg-secondary")}>
            <div className="min-w-0 flex-1">
                <p className="duo-label text-quaternary">{next.isExtra ? "Extra session" : "Next class"}</p>
                <p className="mt-0.5 font-bold text-primary">{label}</p>
                {note && <p className="text-xs text-tertiary">{note}</p>}
            </div>
            {liveReady ? (
                canJoin ? (
                    <DuoButton size="xs" href="/live">
                        Join
                    </DuoButton>
                ) : (
                    <span role="status" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-dashed border-secondary px-2.5 text-[11px] font-bold tracking-[0.8px] text-quaternary uppercase select-none">
                        <span className="size-1.5 rounded-full bg-quaternary" aria-hidden="true" />
                        Not started
                    </span>
                )
            ) : next.joinUrl && (next.live || next.soon) ? (
                <a href={next.joinUrl} target="_blank" rel="noopener" className="inline-flex h-9 shrink-0 items-center rounded-2xl border-2 border-transparent border-b-4 border-b-brand-700 bg-brand-500 px-3 text-xs font-bold tracking-[0.8px] text-white uppercase hover:brightness-105">
                    Join
                </a>
            ) : null}
        </div>
    );
};

/* ---------- the board ---------- */
export type BoardHead = (ctx: { board: Board | null; reload: () => Promise<void>; openCategories: () => void; openSchedulePlan: () => void }) => ReactNode;

/**
 * The feed for one board. `classId` is required for a teacher (admin API), ignored for a student.
 * `openId` / `onOpen` say which post is open; the caller keeps that in the URL. `head` draws the page
 * header with the teacher's tools when the caller wants them there.
 */
const PAGE = 30;

export const CommunityBoard = ({ admin, classId, openId, onOpen, head }: { admin: boolean; classId?: string | null; openId: string | null; onOpen: (id: string | null) => void; head?: BoardHead }) => {
    const me = useMe();
    const adminBoot = useAdminBootstrap();
    const [board, setBoardState] = useState<Board | null>(null);
    const [boot, setBoot] = useState<StudentBoot | null>(null);
    const [err, setErr] = useState<{ message: string; status?: number } | null>(null);
    const [threadVersion, setThreadVersion] = useState(0);
    const [cat, setCat] = useState("");
    const [sort, setSort] = useState<"new" | "hot">("new");
    /* The teacher's Open/Closed view is remembered between visits: it is how the board is worked, not a one-off search. */
    const [state, setStateRaw] = useState<"" | "open" | "closed">(() => {
        try {
            const kept = localStorage.getItem("gg.board.state");
            return kept === "open" || kept === "closed" ? kept : "";
        } catch {
            return "";
        }
    });
    const setState = (next: "" | "open" | "closed") => {
        setStateRaw(next);
        try {
            localStorage.setItem("gg.board.state", next);
        } catch {
            /* a private window; the choice simply lasts the visit */
        }
    };
    /* The feed is drawn a page at a time (the board arrives whole, 100+ posts on an old class). A new
       filter or sort starts again from the top. Deep links are unaffected: the thread sheet loads its
       post by id, whether or not that post is among the cards on screen. */
    const [shown, setShown] = useState(PAGE);
    useEffect(() => setShown(PAGE), [classId, cat, sort, state]);
    const [composer, setComposer] = useState<{ open: boolean; editing: Thread | null }>({ open: false, editing: null });
    const [cats, setCats] = useState(false);
    const [plan, setPlan] = useState(false);
    const base = admin ? "/api/admin" : "/api/student";
    const listPath = admin ? (classId ? `/api/admin/community/${classId}` : null) : "/api/student/community";
    const klass = admin ? board?.class : boot?.class;
    const next = admin ? board?.nextClass : boot?.nextClass;
    const tz = klass?.timezone || FALLBACK_TZ;
    const draftingOn = !adminBoot?.drafting || Boolean(adminBoot.drafting.board);

    useEffect(() => {
        if (admin || !me) return;
        // The copy the menu already loaded, not a second request for the same thing.
        loadStudentBootstrap().then((b) => setBoot(b as unknown as StudentBoot)).catch(() => undefined);
    }, [admin, me?.id]);
    /* One address per view of the board (which class, which category, which order). What that view
       last showed is drawn straight away while the fresh copy is read. */
    const boardUrl = useMemo(() => {
        if (!listPath) return null;
        const q = new URLSearchParams();
        if (sort === "hot") q.set("sort", "hot");
        if (cat) q.set("categoryId", cat);
        return `${listPath}${q.toString() ? `?${q}` : ""}`;
    }, [listPath, sort, cat]);
    const wanted = useRef(boardUrl);
    wanted.current = boardUrl;
    useLayoutEffect(() => {
        const seen = boardUrl ? boards.get(boardUrl) : undefined;
        if (seen) setBoardState(seen);
    }, [boardUrl]);
    const load = useCallback(async () => {
        if (!me || !boardUrl) return;
        try {
            const b = await api<Board>(boardUrl);
            boards.set(boardUrl, b);
            // A slow answer for a view that has since been left (another category pressed) is kept but not drawn.
            if (wanted.current !== boardUrl) return;
            setBoardState(b);
            setErr(null);
            // Opening the board is what clears the badge, not opening each thread.
            if (!admin && b.unread) api("/api/student/community/read", { method: "POST", json: {} }).then(() => loadStudentBootstrap(true)).catch(() => undefined); // the sidebar badge follows
        } catch (e) {
            const failure = e as Error & { status?: number };
            setErr({ message: failure.message, status: failure.status });
        }
    }, [me?.id, boardUrl, admin]);
    // Filters redraw in place once the new list arrives; the posts on screen stay until then.
    useEffect(() => {
        load();
    }, [load]);

    const all = board?.threads ?? [];
    /* Filtered here rather than on the server: the board is one class's posts and already all in hand. Students never set this,
       and never could: their copy of a post does not carry handled_at. */
    const openCount = admin ? all.filter((t) => !t.handled_at && !t.deleted_at).length : 0;
    const closedCount = admin ? all.filter((t) => t.handled_at && !t.deleted_at).length : 0;
    const threads = admin && state ? all.filter((t) => (state === "closed" ? Boolean(t.handled_at) : !t.handled_at)) : all;
    const modThread = async (threadId: string, change: ThreadChange) => {
        try {
            await api(`/api/admin/community/thread/${threadId}`, { method: "PATCH", json: change });
            await load();
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const contributors = board?.contributors ?? [];

    const ctx = { board, reload: load, openCategories: () => setCats(true), openSchedulePlan: () => setPlan(true) };

    /* A student the server turns away (not in a class yet, or a class set up without a board) gets the
       old hub's quiet empty state rather than a red error box with no feed, filters or composer around it. */
    if (!admin && err?.status === 404) {
        const noClass = /not in a class/i.test(err.message);
        return (
            <>
                {head?.(ctx)}
                <div className="rounded-2xl border-2 border-dashed border-secondary p-8 text-center">
                    <h3 className="text-lg font-bold text-primary">{noClass ? "You are not in a class yet" : "No community board"}</h3>
                    <p className="mx-auto mt-1 max-w-md text-sm text-tertiary">{noClass ? "Your account is active but has not been added to a class group. Contact Gaeilgeoir Guides and they will add you." : "This class does not have a community board. Ask Gaeilgeoir Guides if you were expecting one."}</p>
                </div>
            </>
        );
    }

    return (
        <>
            {head?.(ctx)}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_276px]">
                <div className="flex min-w-0 flex-col gap-4">
                    {me && board && (
                        <button type="button" onClick={() => setComposer({ open: true, editing: null })} className="flex items-center gap-3 rounded-2xl border-2 border-secondary bg-primary px-4 py-3.5 text-left shadow-xs outline-focus-ring transition duration-100 ease-linear hover:border-primary hover:shadow-sm focus-visible:outline-2">
                            <Avatar who={{ name: me.name, role: me.role, avatar: me.hasAvatar ? `/api/media/avatar/${me.id}` : undefined }} />
                            <span className="flex-1 text-md text-placeholder">Write something to the class…</span>
                            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-solid text-white">
                                <Edit05 aria-hidden="true" className="size-5" />
                            </span>
                        </button>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex max-w-full gap-2 overflow-x-auto scrollbar-hide">
                            {[{ id: "", name: "All" }, ...(board?.categories ?? [])].map((c) => (
                                <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={cat === c.id} className={cx("shrink-0 rounded-full border-2 px-3.5 py-1.5 text-[13px] font-bold transition duration-100 ease-linear", cat === c.id ? "border-brand bg-brand-solid text-white" : "border-secondary bg-primary text-secondary hover:bg-primary_hover")}>
                                    {c.name}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {admin && (
                                <Segmented
                                    size="sm"
                                    label="Open or closed"
                                    value={state}
                                    onChange={setState}
                                    items={[
                                        { id: "", label: "All" },
                                        { id: "open", label: <>Open <span className="ml-0.5 text-[11px] font-bold tabular-nums opacity-70">{openCount}</span></>, aria: `Open, ${openCount}` },
                                        { id: "closed", label: <>Closed <span className="ml-0.5 text-[11px] font-bold tabular-nums opacity-70">{closedCount}</span></>, aria: `Closed, ${closedCount}` },
                                    ]}
                                />
                            )}
                            <Segmented size="sm" label="Sort" value={sort} onChange={setSort} items={[{ id: "new", label: "Latest" }, { id: "hot", label: "Hot" }]} />
                        </div>
                    </div>
                    {err ? (
                        <p className="rounded-2xl bg-error-primary p-4 text-sm font-semibold text-error-primary">{err.message}</p>
                    ) : !board ? (
                        <p className="py-16 text-center text-sm text-tertiary">Loading the board…</p>
                    ) : threads.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-secondary p-8 text-center">
                            {admin && state ? (
                                <>
                                    <h3 className="text-lg font-bold text-primary">{state === "open" ? "Nothing open" : "Nothing closed"}</h3>
                                    <p className="mt-1 text-sm text-tertiary">{state === "open" ? "Every post on this board is marked as dealt with. A post reopens itself when a student writes in it." : "Nothing is marked as dealt with yet. Press Open on a post once you have answered it."}</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-bold text-primary">{cat ? "Nothing here yet" : "No posts yet"}</h3>
                                    <p className="mx-auto mt-1 max-w-md text-sm text-tertiary">
                                        {admin
                                            ? "Start it off with something worth replying to: a question about the last class, or where to find this week’s notes. An empty feed stays empty until somebody goes first, and it is usually easier for that somebody to be you."
                                            : "Be the first. A question you think is too simple is usually the one three other people were also wondering about."}
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            {threads.slice(0, shown).map((t) => (
                                <PostCard key={t.id} t={t} base={base} admin={admin} tz={tz} onOpen={() => onOpen(t.id)} onMod={admin ? (change) => modThread(t.id, change) : undefined} />
                            ))}
                            {threads.length > shown && (
                                <DuoButton color="secondary" full onPress={() => setShown((n) => n + PAGE)}>
                                    Show More ({threads.length - shown} more)
                                </DuoButton>
                            )}
                        </>
                    )}
                </div>
                <aside className="flex min-w-0 flex-col gap-4">
                    <SideCard>
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-sm font-black text-white">{initials(klass?.programme_name || "GG")}</span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-primary">{klass?.programme_name || "Your class"}</p>
                                <p className="text-xs text-tertiary">{klass ? `${DAY_NAMES[klass.day_of_week]}s at ${String(klass.start_time).slice(0, 5)}` : ""}</p>
                            </div>
                        </div>
                        {next && <SideNextClass next={next} liveReady={boot?.liveReady} />}
                    </SideCard>
                    <SideCard title="Most active this month">
                        {contributors.length === 0 ? (
                            <p className="text-sm text-tertiary">Nobody has posted yet this month. Be the first.</p>
                        ) : (
                            <ol className="flex flex-col">
                                {contributors.map((l, i) => (
                                    <li key={l.id} className="flex items-center gap-3 py-1.5">
                                        <span className={cx("w-4 text-center text-xs font-black tabular-nums", i < 3 ? "text-warning-primary" : "text-quaternary")}>{i + 1}</span>
                                        <Avatar who={{ id: l.id, name: l.name, role: "student", avatar: l.avatar ? `/api/media/avatar/${l.id}` : undefined }} size="sm" />
                                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-primary">{l.name}</span>
                                        <span className="text-xs font-semibold text-tertiary">{l.total}</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </SideCard>
                </aside>
            </div>
            <Composer
                open={composer.open}
                onClose={() => setComposer((c) => ({ ...c, open: false }))}
                base={base}
                postPath={admin ? `/api/admin/community/${classId}/threads` : "/api/student/community/threads"}
                admin={admin}
                board={board}
                tz={tz}
                editing={composer.editing}
                onPosted={(id, edited) => {
                    load();
                    // The edited post is already open underneath, so the dialog is told to read it again.
                    if (id && edited) {
                        setThreadVersion((v) => v + 1);
                        onOpen(id);
                    }
                }}
            />
            {openId && me && (
                <ThreadDialog
                    key={openId}
                    id={openId}
                    base={base}
                    admin={admin}
                    tz={tz}
                    withdrawn={Boolean(boot?.withdrawnAt)}
                    draftingOn={draftingOn}
                    version={threadVersion}
                    seed={all.find((x) => x.id === openId)}
                    onClose={() => onOpen(null)}
                    onChanged={load}
                    onEdit={(t) => setComposer({ open: true, editing: t })}
                />
            )}
            {cats && classId && <CategoriesDialog classId={classId} categories={board?.categories ?? []} onClose={() => setCats(false)} onChanged={load} />}
            {plan && classId && <SchedulePlanDialog classId={classId} onClose={() => setPlan(false)} onOpenThread={(id) => onOpen(id)} onImported={load} />}
        </>
    );
};

/** /community and /community/:id: the signed-in person's board. A teacher here gets the active class's board. */
export const CommunityPage = () => {
    const me = useMe();
    const nav = useNavigate();
    const { id } = useParams();
    // The class whose board the teacher sees is found once and remembered, so coming back does not ask again.
    const [classId, setClassId] = useState<string | null>(teacherClassId());
    const [classesLoaded, setClassesLoaded] = useState(Boolean(teacherClassId()));
    const [err, setErr] = useState<string | null>(null);
    const admin = me?.role === "admin";

    useEffect(() => {
        if (!admin || teacherClassId()) return; // already found on an earlier visit
        api<{ id: string; active: boolean; has_community: boolean }[]>("/api/admin/classes")
            .then((list) => {
                const k = list.find((x) => x.active && x.has_community) ?? list.find((x) => x.has_community) ?? list[0];
                setTeacherClassId(k?.id ?? null);
                setClassId(k?.id ?? null);
                setClassesLoaded(true);
            })
            .catch((e) => setErr(e.message));
    }, [admin]);

    if (me === undefined) return <Page>{null}</Page>;
    if (!me)
        return (
            <Page>
                <PageHeader title="Community" sub="Post any questions you might have here." />
                <div className="rounded-2xl border-2 border-secondary bg-primary p-8 text-center">
                    <p className="text-lg font-bold text-primary">Sign in to see the class board</p>
                    <p className="mt-1 text-md text-tertiary">Your usual Gaeilgeoir Guides login.</p>
                    <div className="mt-5">
                        <DuoButton href="/signin?next=/community">Sign in</DuoButton>
                    </div>
                </div>
            </Page>
        );
    if (admin && classesLoaded && !classId)
        return (
            <Page>
                <PageHeader title="Community" sub="One feed per class. Pin, close, remove or schedule anything." />
                <p className="rounded-2xl border-2 border-dashed border-secondary p-8 text-center text-sm text-tertiary">No class has a board yet. Switch one on in the class setup under Classes & students.</p>
            </Page>
        );
    return (
        <Page wide>
            {err && <p className="mb-4 rounded-2xl bg-error-primary p-4 text-sm font-semibold text-error-primary">{err}</p>}
            <CommunityBoard
                admin={!!admin}
                classId={classId}
                openId={id ?? null}
                onOpen={(tid) => nav(tid ? `/community/${tid}` : "/community")}
                head={({ board, openCategories, openSchedulePlan }) => (
                    <PageHeader
                        kicker={board?.class?.programme_name}
                        title="Community"
                        sub={admin ? "One feed per class. Pin, close, remove or schedule anything." : "Post any questions you might have here."}
                        actions={
                            admin && classId ? (
                                <>
                                    <DuoButton size="sm" color="secondary" onPress={openCategories}>
                                        Categories
                                    </DuoButton>
                                    <DuoButton size="sm" color="secondary" iconLeading={Calendar} onPress={openSchedulePlan}>
                                        Scheduled
                                    </DuoButton>
                                </>
                            ) : undefined
                        }
                    />
                )}
            />
        </Page>
    );
};
