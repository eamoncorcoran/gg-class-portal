// The script of a listening recording, under its player: every word lights up as it is spoken, and
// any word can be tapped for what it means, what it is in the dictionary and what it is doing in
// its sentence, the way a word in HeyRua opens. The script, the timings and the glosses come ready
// made in /aural/<year>_<cuid>.json (built from the SEC marking scheme and the recording itself).
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { ChevronDown, Play, X } from "@/components/app/ic";
import { cx } from "@/utils/cx";

type Line = { speaker: string | null; from: number; to: number };
type Part = { title: string | null; lines: Line[] };
type Piece = { title: string; dialect: string; parts: Part[] };
type Gloss = { lit: string; meaning: string; ctx: string };
export type Script = {
    year: string;
    cuid: string;
    pieces: Piece[];
    words: string[];
    /** per word, the spans [start, end] in seconds, one for each time the piece is read */
    times: number[][][];
    gloss?: (Gloss | null)[];
};
type Span = { s: number; e: number; i: number };

const cache = new Map<string, Promise<Script | null>>();
const load = (url: string) => {
    if (!cache.has(url))
        cache.set(
            url,
            fetch(url, { credentials: "same-origin" })
                .then((r) => (r.ok ? (r.json() as Promise<Script>) : null))
                .catch(() => null),
        );
    return cache.get(url)!;
};

/** /aud/2024_A.mp3 → /aural/2024_A.json */
export const scriptUrlFor = (audioSrc: string) => audioSrc.replace(/^\/?aud\//, "/aural/").replace(/\.mp3$/i, ".json");

/** The word being spoken at `t`: the last one to have started, as long as it has not been over for a while. */
const wordAt = (spans: Span[], t: number) => {
    let lo = 0,
        hi = spans.length - 1,
        found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (spans[mid].s <= t) {
            found = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    if (found < 0) return -1;
    const span = spans[found];
    return t <= span.e + 0.35 ? span.i : -1;
};

const Label = ({ children }: { children: string }) => <p className="text-[11px] font-bold tracking-wide text-quaternary uppercase">{children}</p>;

export const AuralScript = ({ src, audioRef }: { src: string; audioRef: RefObject<HTMLAudioElement | null> }) => {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<Script | null | undefined>(undefined);
    const [current, setCurrent] = useState(-1);
    const [picked, setPicked] = useState<number | null>(null);
    const box = useRef<HTMLDivElement>(null);
    const stopAt = useRef<number | null>(null);
    const url = scriptUrlFor(src);

    useEffect(() => {
        if (!open || data !== undefined) return;
        load(url).then(setData);
    }, [open, url, data]);

    /* Every spoken span in time order, so the word under the playhead is a binary search. */
    const spans = useMemo(() => {
        if (!data) return [] as Span[];
        const all: Span[] = [];
        data.times.forEach((list, i) => list.forEach(([s, e]) => all.push({ s, e, i })));
        return all.sort((a, b) => a.s - b.s);
    }, [data]);

    /* Follow the recording while the panel is open: a frame loop while it plays, one read when it moves. */
    useEffect(() => {
        if (!open || !data) return;
        let raf = 0;
        let last = -1;
        const tick = () => {
            const a = audioRef.current;
            if (a) {
                if (stopAt.current !== null && a.currentTime >= stopAt.current) {
                    a.pause();
                    stopAt.current = null;
                }
                const i = wordAt(spans, a.currentTime);
                if (i !== last) {
                    last = i;
                    setCurrent(i);
                }
                if (!a.paused) raf = requestAnimationFrame(tick);
            }
        };
        const start = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(tick);
        };
        const once = () => {
            cancelAnimationFrame(raf);
            tick();
        };
        const a = audioRef.current;
        a?.addEventListener("play", start);
        a?.addEventListener("seeked", once);
        a?.addEventListener("pause", once);
        once();
        return () => {
            cancelAnimationFrame(raf);
            a?.removeEventListener("play", start);
            a?.removeEventListener("seeked", once);
            a?.removeEventListener("pause", once);
        };
    }, [open, data, spans, audioRef]);

    /* Keep the lit word in view inside the panel (never scrolling the page itself). */
    useEffect(() => {
        const el = box.current;
        if (!el || current < 0) return;
        const w = el.querySelector<HTMLElement>(`[data-w="${current}"]`);
        if (!w) return;
        const top = w.offsetTop - el.offsetTop;
        if (top < el.scrollTop + 24 || top > el.scrollTop + el.clientHeight - 48) el.scrollTo({ top: top - el.clientHeight / 2, behavior: "smooth" });
    }, [current]);

    useEffect(() => {
        if (picked === null) return;
        const close = (e: Event) => {
            if (e instanceof KeyboardEvent && e.key !== "Escape") return;
            if (e instanceof PointerEvent && (e.target as HTMLElement).closest("[data-gloss]")) return;
            setPicked(null);
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", close);
        };
    }, [picked]);

    const playWord = (i: number) => {
        const a = audioRef.current;
        const span = data?.times[i]?.[0];
        if (!a || !span) return;
        document.querySelectorAll("audio").forEach((x) => x !== a && x.pause());
        stopAt.current = span[1] + 0.05;
        a.currentTime = Math.max(0, span[0] - 0.05);
        a.play();
    };

    return (
        <div className="mb-4 -mt-2">
            <AriaButton
                onPress={() => setOpen(!open)}
                aria-expanded={open}
                className="inline-flex items-center gap-0.5 text-sm font-bold text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2"
            >
                {open ? "Hide the script" : "Show the script"}
                <ChevronDown aria-hidden="true" className={cx("size-4 stroke-[2.5px] transition-transform duration-200 ease-out", open && "-scale-y-100")} />
            </AriaButton>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="relative mt-3 rounded-xl border-2 border-secondary bg-primary">
                            {data === undefined && <p className="px-4 py-6 text-center text-sm text-tertiary">Loading the script…</p>}
                            {data === null && <p className="px-4 py-6 text-center text-sm text-tertiary">The script for this recording isn't ready yet.</p>}
                            {data && (
                                <>
                                    <p className="border-b-2 border-secondary px-4 py-2 text-xs text-tertiary">
                                        The words light up as they are spoken. <b className="font-bold text-secondary">Tap any word</b> for what it means.
                                    </p>
                                    <div ref={box} className="relative max-h-[24rem] overflow-y-auto px-4 py-3 text-[15px] leading-7 text-primary">
                                        {data.pieces.map((p, pi) => (
                                            <section key={pi} className={cx(pi > 0 && "mt-5")}>
                                                <h4 className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-primary">
                                                    {p.title}
                                                    <span className="text-xs font-semibold text-tertiary">{p.dialect}</span>
                                                </h4>
                                                {p.parts.map((part, ki) => (
                                                    <div key={ki} className="mt-1.5">
                                                        {part.title && <h5 className="mt-2 text-xs font-bold text-tertiary italic">{part.title}</h5>}
                                                        {part.lines.map((l, li) => (
                                                            <p key={li} className={cx("mt-1", l.speaker && "pl-3 -indent-3")}>
                                                                {l.speaker && <b className="mr-1 font-bold text-secondary">{l.speaker}:</b>}
                                                                {data.words.slice(l.from, l.to).map((w, k) => {
                                                                    const i = l.from + k;
                                                                    return (
                                                                        <span key={i} className="inline">
                                                                            <button
                                                                                type="button"
                                                                                data-w={i}
                                                                                aria-pressed={picked === i}
                                                                                onClick={() => setPicked(picked === i ? null : i)}
                                                                                className={cx(
                                                                                    "-mx-0.5 rounded-[4px] px-0.5 outline-focus-ring transition-colors duration-100 ease-linear hover:bg-secondary focus-visible:outline-2",
                                                                                    current === i && "bg-brand-solid text-white hover:bg-brand-solid",
                                                                                    picked === i && current !== i && "bg-brand-primary text-brand-primary",
                                                                                )}
                                                                            >
                                                                                {w}
                                                                            </button>{" "}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </p>
                                                        ))}
                                                    </div>
                                                ))}
                                            </section>
                                        ))}
                                    </div>
                                    {picked !== null && <GlossCard data={data} i={picked} box={box} onPlay={() => playWord(picked)} onClose={() => setPicked(null)} />}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/** The small card that opens under a tapped word. It sits inside the panel, under the word, and never off its edge. */
const GlossCard = ({ data, i, box, onPlay, onClose }: { data: Script; i: number; box: RefObject<HTMLDivElement | null>; onPlay: () => void; onClose: () => void }) => {
    const g = data.gloss?.[i];
    const word = data.words[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    useEffect(() => {
        const el = box.current;
        const w = el?.querySelector<HTMLElement>(`[data-w="${i}"]`);
        if (!el || !w) return;
        const place = () => {
            const r = w.getBoundingClientRect();
            const p = el.parentElement!.getBoundingClientRect();
            const width = Math.min(300, p.width - 16);
            const left = Math.min(Math.max(8, r.left - p.left), p.width - width - 8);
            setPos({ top: r.bottom - p.top + 6, left });
        };
        place();
        el.addEventListener("scroll", place);
        return () => el.removeEventListener("scroll", place);
    }, [i, box]);
    if (!pos) return null;
    return (
        <div
            data-gloss
            role="dialog"
            aria-label={`${word}, meaning`}
            className="absolute z-20 w-[min(300px,calc(100%-16px))] rounded-xl border-2 border-secondary bg-primary p-4 text-left shadow-lg duration-150 animate-in fade-in zoom-in-95"
            style={{ top: pos.top, left: pos.left }}
        >
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-lg leading-tight font-bold text-primary">{word}</p>
                    {g?.lit && <p className="mt-1 text-md font-bold text-brand-secondary">{g.lit}</p>}
                </div>
                <AriaButton
                    onPress={onPlay}
                    aria-label={`Play ${word}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-brand-secondary outline-focus-ring transition duration-100 ease-linear hover:bg-brand-secondary focus-visible:outline-2 pressed:scale-95"
                >
                    <Play aria-hidden="true" className="ml-0.5 size-4 fill-current" />
                </AriaButton>
                <AriaButton onPress={onClose} aria-label="Close" className="-mt-1 -mr-1 flex size-7 items-center justify-center rounded-full text-fg-quaternary outline-focus-ring hover:bg-secondary hover:text-fg-secondary focus-visible:outline-2">
                    <X aria-hidden="true" className="size-4" />
                </AriaButton>
            </div>
            {g ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-secondary pt-3">
                    {g.meaning && (
                        <div>
                            <Label>Meaning</Label>
                            <p className="mt-0.5 text-sm leading-6 text-primary">{g.meaning}</p>
                        </div>
                    )}
                    {g.ctx && (
                        <div>
                            <Label>In this sentence</Label>
                            <p className="mt-0.5 text-sm leading-6 text-primary">{g.ctx}</p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="mt-3 border-t border-secondary pt-3 text-sm text-tertiary">No note for this word yet.</p>
            )}
        </div>
    );
};
