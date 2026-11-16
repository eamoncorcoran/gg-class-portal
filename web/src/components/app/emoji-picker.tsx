// Emoji, for anybody writing anything. No library and no image set: these are characters, grouped the
// way people look for them and searchable by the words somebody would type. The most recently used
// are kept on this device (localStorage "gg-recent-emoji"), as in the old app.
import { useEffect, useRef, useState } from "react";
import { cx } from "@/utils/cx";

export const EMOJI_GROUPS: { name: string; items: [string, string][] }[] = [
    {
        name: "Smileys",
        items: [
            ["😀", "grin happy smile"], ["😄", "happy smile laugh"], ["😅", "sweat relief phew nervous"],
            ["😂", "laugh crying funny"], ["🙂", "smile slight"], ["😉", "wink"],
            ["😊", "blush happy warm"], ["🥰", "love hearts adore"], ["😍", "love heart eyes"],
            ["🤔", "thinking wonder hmm"], ["😬", "grimace awkward yikes"], ["😴", "sleep tired"],
            ["😭", "crying sob"], ["😱", "shock scream"], ["🥳", "party celebrate"],
            ["😇", "angel innocent"], ["🙃", "upside down"], ["😌", "relieved calm"],
        ],
    },
    {
        name: "Gestures",
        items: [
            ["👍", "thumbs up yes good"], ["👏", "clap well done applause"], ["🙏", "thanks please pray"],
            ["💪", "strong muscle effort"], ["🤝", "handshake agree"], ["👋", "wave hello hi"],
            ["✌️", "peace victory"], ["🤞", "fingers crossed luck"], ["👌", "ok perfect"],
            ["🫶", "heart hands love"],
        ],
    },
    {
        name: "Hearts and marks",
        items: [
            ["❤️", "heart love red"], ["💚", "green heart"], ["✨", "sparkles nice"],
            ["🎉", "party celebrate congratulations"], ["⭐", "star"], ["🔥", "fire great"],
            ["✅", "tick done correct"], ["❌", "cross wrong no"], ["❓", "question"],
            ["❗", "exclamation important"],
        ],
    },
    {
        name: "Course",
        items: [
            ["📚", "books study reading"], ["✏️", "pencil write homework"], ["📝", "note writing exam"],
            ["🎧", "headphones listening audio"], ["🗣️", "speaking oral talk"], ["📖", "book reading"],
            ["🍀", "clover luck irish"], ["☘️", "shamrock irish ireland"], ["🇮🇪", "ireland flag irish"],
            ["⏰", "clock time deadline"], ["📅", "calendar date"], ["🎓", "graduate exam course"],
        ],
    },
];

const KEY = "gg-recent-emoji";
export const recentEmoji = (): string[] => {
    try {
        return (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).slice(0, 12);
    } catch {
        return [];
    }
};
export const rememberEmoji = (emoji: string) => {
    try {
        localStorage.setItem(KEY, JSON.stringify([emoji, ...recentEmoji().filter((e) => e !== emoji)].slice(0, 12)));
    } catch {
        /* private browsing; the picker still works, it just forgets. */
    }
};

/**
 * The picker, drawn as a popover inside a `relative` parent (above the button by default). The caller
 * inserts the emoji at the cursor; this only picks and remembers. Closes on Escape or a click outside.
 * Never wider than the parent: inside the thread dialog's reply box on a phone the parent is under
 * 300px, and the modal clips anything that pokes out, so the grid fits as many columns as there is room for.
 */
export const EmojiPicker = ({ onPick, onClose, below, className }: { onPick: (emoji: string) => void; onClose: () => void; below?: boolean; className?: string }) => {
    const [term, setTerm] = useState("");
    const box = useRef<HTMLDivElement>(null);
    const recent = recentEmoji();
    useEffect(() => {
        const click = (e: MouseEvent) => {
            if (!box.current?.contains(e.target as Node)) onClose();
        };
        const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        const t = setTimeout(() => document.addEventListener("click", click), 0);
        document.addEventListener("keydown", key);
        return () => {
            clearTimeout(t);
            document.removeEventListener("click", click);
            document.removeEventListener("keydown", key);
        };
    }, [onClose]);
    const q = term.trim().toLowerCase();
    const groups = [...(recent.length ? [{ name: "Recent", items: recent.map((e) => [e, ""] as [string, string]) }] : []), ...EMOJI_GROUPS]
        .map((g) => ({ ...g, items: g.items.filter(([, words]) => !q || words.includes(q)) }))
        .filter((g) => g.items.length);
    return (
        <div ref={box} onClick={(e) => e.stopPropagation()} className={cx("absolute left-0 z-30 w-[min(320px,calc(100vw-32px))] max-w-[calc(100%-16px)] rounded-2xl border-2 border-secondary bg-primary p-2 shadow-lg duration-150 animate-in fade-in zoom-in-95", below ? "top-full mt-1.5" : "bottom-full mb-1.5", className)}>
            <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search" aria-label="Search emoji" autoFocus className="mb-2 w-full rounded-xl border-2 border-secondary bg-primary px-3 py-1.5 text-sm font-medium text-primary outline-hidden focus:border-brand" />
            <div className="max-h-64 overflow-y-auto">
                {groups.map((g) => (
                    <div key={g.name}>
                        <h5 className="px-1 pt-1.5 pb-1 duo-label text-quaternary">{g.name}</h5>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-0.5">
                            {g.items.map(([emoji, words]) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    title={(words || "").split(" ")[0]}
                                    onClick={() => {
                                        rememberEmoji(emoji);
                                        onPick(emoji);
                                    }}
                                    className="flex size-8 items-center justify-center rounded-lg text-lg transition duration-100 ease-linear hover:bg-secondary"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
                {groups.length === 0 && <p className="px-1 py-3 text-center text-sm text-tertiary">Nothing matching that.</p>}
            </div>
        </div>
    );
};

/** Puts `s` in at the cursor of a textarea-backed value, and asks for the cursor to land after it. */
export const insertAtCursor = (el: HTMLTextAreaElement | null, value: string, s: string): { next: string; at: number } => {
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    return { next: value.slice(0, start) + s + value.slice(end), at: start + s.length };
};
