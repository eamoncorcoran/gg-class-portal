// A lesson the way Brilliant runs one. The whole screen: a thin progress bar with XP on top, one big
// white card with the question and its picture, Check that wakes once you answer, a green glow and
// confetti when you are right, a soft red one when you are not, "Why?" for the explanation. Rua the
// tutor lives in a column on the left that folds away on a handle and opens itself when it has
// something to say; it narrates each question, nudges you after a miss and answers what you type.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { Link } from "react-router";
import { Confetti } from "@/components/app/confetti";
import { Art } from "@/components/app/diagrams";
import { DuoDialog } from "@/components/app/duo-dialog";
import { type Mood, Rua } from "@/components/app/rua";
import { type QuizItem, isRight, tilesFor, wordsFor } from "@/lib/quiz";
import type { Step } from "@/lib/guided";
import { CellArt, CycleArt, DoublingArt, PHASES, PHASE_ORDER, type Phase } from "@/components/app/cell-art";
import { langOf, say, setMuted, sfx, stopSpeech } from "@/lib/sfx";
import { cx } from "@/utils/cx";
import type { QuizResults } from "./quiz-pages";

type Msg = { who: "rua" | "me"; text: string; tone?: "plain" | "warn" | "good" };
type SpeechRecognitionLike = { lang: string; start: () => void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/* ---------------- our own small icons ---------------- */
const I = {
    close: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-5", c)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
    flag: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-5", c)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4m0 0h12l-2.5 4L17 12H5" /></svg>,
    sound: (on: boolean, c = "") => (
        <svg viewBox="0 0 24 24" className={cx("size-5", c)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            {on ? <path d="M16 9a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12" /> : <path d="M17 9l4 6m0-6l-4 6" />}
        </svg>
    ),
    send: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="currentColor"><path d="M3 11.5 21 3l-8.5 18-2.3-7.2L3 11.5z" /></svg>,
    back: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>,
    fwd: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>,
    spark: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" /></svg>,
    bolt: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
    redo: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /></svg>,
    mic: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
    tick: (c = "") => <svg viewBox="0 0 24 24" className={cx("size-4", c)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>,
};

const ask = async (body: { question: string; item: QuizItem; given: string; answered: boolean }) => {
    const r = await fetch("/api/tutor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!r || !r.ok) return null;
    return ((await r.json()) as { text: string }).text;
};

const explain = (item: QuizItem) =>
    item.why ??
    (item.type === "choose"
        ? `The right answer is “${item.answer}”.${(item.options || []).filter(Boolean).length ? ` The others, ${(item.options || []).filter(Boolean).join(", ")}, do not fit the question.` : ""}`
        : item.type === "order"
          ? `The sentence runs “${item.answer}”: in Irish the verb comes first, then who, then the rest.`
          : `The answer is “${item.answer}”${item.alts?.length ? ` (also accepted: ${item.alts.join(", ")})` : ""}.`);

const PRAISE = ["That's it!", "Maith thú!", "Exactly.", "Ar fheabhas!", "Nicely done.", "Spot on."];
const readPref = (k: string, d: boolean) => {
    try {
        const v = localStorage.getItem("pq." + k);
        return v === null ? d : v === "1";
    } catch {
        return d;
    }
};
const writePref = (k: string, v: boolean) => {
    try {
        localStorage.setItem("pq." + k, v ? "1" : "0");
    } catch {
        /* fine */
    }
};

/** Brilliant's pill button: charcoal by default, green when the answer was right, grey asleep. */
const Pill = ({ children, onPress, tone = "dark", disabled, className, href }: { children: ReactNode; onPress?: () => void; tone?: "dark" | "green" | "ghost"; disabled?: boolean; className?: string; href?: string }) => {
    const cls = cx(
        "inline-flex h-13 min-w-44 items-center justify-center rounded-full px-8 text-md font-semibold outline-focus-ring transition-[background-color,transform,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px",
        disabled ? "cursor-not-allowed bg-[#EFEFEF] text-[#B5B5B5]" : tone === "green" ? "bg-[#47C25A] text-white shadow-[0_6px_0_#2E9A3F] hover:bg-[#3FB752] active:shadow-[0_2px_0_#2E9A3F]" : tone === "ghost" ? "bg-[#F0F0F0] text-[#1F1F1F] hover:bg-[#E6E6E6]" : "bg-[#333] text-white shadow-[0_6px_0_#111] hover:bg-[#2a2a2a] active:shadow-[0_2px_0_#111]",
        className,
    );
    return href ? (
        <Link to={href} className={cls}>
            {children}
        </Link>
    ) : (
        <AriaButton onPress={onPress} isDisabled={disabled} className={cls}>
            {children}
        </AriaButton>
    );
};

/** A teaching slide: title, picture (with its controls when it is interactive), a short text, Continue. */
/** A teaching slide: title, the controls for its picture (the cell itself lives above, so it morphs
 * from slide to slide), a short text. */
const Teach = ({ step, phase, onPhase }: { step: Extract<Step, { kind: "teach" }>; phase: Phase; onPhase: (p: Phase) => void }) => {
    const [hot, setHot] = useState<Phase | undefined>(undefined);
    const [playing, setPlaying] = useState(false);
    const [doubles, setDoubles] = useState(0);
    const cur = PHASES.find((p) => p.id === phase)!;
    const idx = PHASE_ORDER.indexOf(phase);
    useEffect(() => {
        if (!playing) return;
        if (idx >= PHASE_ORDER.length - 1) return setPlaying(false);
        const t = setTimeout(() => onPhase(PHASE_ORDER[idx + 1]), 1700);
        return () => clearTimeout(t);
    }, [playing, idx, onPhase]);
    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
            <h2 className="text-center text-2xl font-bold md:text-3xl">{step.title}</h2>
            {step.interactive === "phases" && (
                <div className="mt-6 w-full max-w-lg">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                if (idx >= PHASE_ORDER.length - 1) onPhase("interphase");
                                setPlaying((v) => !v);
                            }}
                            aria-label={playing ? "Pause" : "Play"}
                            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1F1F1F] text-white"
                        >
                            {playing ? <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg viewBox="0 0 24 24" className="size-4 translate-x-px" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>}
                        </button>
                        <input type="range" min={0} max={PHASE_ORDER.length - 1} step={1} value={idx} onChange={(e) => (setPlaying(false), onPhase(PHASE_ORDER[+e.target.value]))} aria-label="Scrub through the phases" className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[#E9E9E9] accent-[#1F1F1F]" />
                    </div>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                        {PHASES.map((p) => (
                            <button key={p.id} type="button" onClick={() => (setPlaying(false), onPhase(p.id))} className={cx("rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", phase === p.id ? "border-[#1F1F1F] bg-[#1F1F1F] text-white" : "border-[#E5E5E5] bg-white text-[#3C3C3C] hover:bg-[#F7F7F7]")}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <motion.p key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-4 text-center text-md leading-7 text-[#3C3C3C]">
                        <span className="font-bold text-[#1F1F1F]">{cur.label}</span> <span className="text-[#8A8A8A]">({cur.ga})</span>: {cur.blurb}
                    </motion.p>
                </div>
            )}
            {step.interactive === "cycle" && (
                <div className="mt-6 w-full">
                    <CycleArt hot={hot} />
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                        {PHASES.map((p) => (
                            <button key={p.id} type="button" onMouseEnter={() => setHot(p.id)} onFocus={() => setHot(p.id)} onClick={() => setHot(p.id)} className={cx("rounded-full border px-3 py-1 text-xs font-semibold transition", hot === p.id ? "border-[#1F1F1F] bg-[#1F1F1F] text-white" : "border-[#E5E5E5] text-[#3C3C3C] hover:bg-[#F7F7F7]")}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {step.art === "cycle" && !step.interactive && (
                <div className="mt-6 w-full">
                    <CycleArt />
                </div>
            )}
            {step.interactive === "doubling" && (
                <div className="mt-6 flex w-full flex-col items-center">
                    <DoublingArt n={doubles} />
                    <div className="mt-4 flex items-center gap-4">
                        <button type="button" onClick={() => (setDoubles((d) => Math.min(6, d + 1)), sfx.place())} disabled={doubles >= 6} className="rounded-full bg-[#1F1F1F] px-5 py-2.5 text-md font-semibold text-white disabled:bg-[#EFEFEF] disabled:text-[#B5B5B5]">
                            Divide
                        </button>
                        <motion.span key={doubles} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="text-xl font-bold tabular-nums">
                            {Math.min(64, 2 ** doubles)} {Math.min(64, 2 ** doubles) === 1 ? "cell" : "cells"}
                        </motion.span>
                        {doubles > 0 && (
                            <button type="button" onClick={() => setDoubles(0)} className="text-sm font-semibold text-[#8A8A8A] hover:underline">
                                Reset
                            </button>
                        )}
                    </div>
                    {doubles >= 6 && <p className="mt-2 text-sm text-[#8A8A8A]">Six divisions and we are already at 64. Forty or so more and you have a person.</p>}
                </div>
            )}
            <p className="mt-8 text-center text-lg leading-8 text-[#3C3C3C]">{step.text}</p>
            {step.bullets && (
                <ul className="mt-6 flex w-full max-w-lg flex-col gap-3">
                    {step.bullets.map((b, k) => (
                        <motion.li key={b} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + k * 0.08 }} className="flex items-start gap-3 text-md leading-7 text-[#3C3C3C]">
                            <span className="mt-2.5 size-2 shrink-0 rounded-full bg-[#31C457]" />
                            {b}
                        </motion.li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export const BrilliantLesson = ({ items = [], steps: stepsIn, title, onFinish, onClose, closeHref, defaultSide }: { items?: QuizItem[]; steps?: Step[]; title: string; onFinish: (r: QuizResults, got: number) => void; onClose?: () => void; closeHref?: string; defaultSide?: boolean }) => {
    const steps: Step[] = stepsIn ?? items.map((item) => ({ kind: "question" as const, item }));
    const questions = steps.filter((s) => s.kind === "question").length;
    const [i, setI] = useState(0);
    const [pick, setPick] = useState("");
    const [typed, setTyped] = useState("");
    const [placed, setPlaced] = useState<string[]>([]);
    const [wrongPicks, setWrongPicks] = useState<string[]>([]);
    const [state, setState] = useState<"ask" | "right" | "wrong" | "reveal">("ask");
    const [tries, setTries] = useState(0);
    const [results, setResults] = useState<QuizResults>({});
    const [xp, setXp] = useState(0);
    const [gain, setGain] = useState<{ n: number; k: number } | null>(null);
    const [burst, setBurst] = useState(0);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [draft, setDraft] = useState("");
    const [thinking, setThinking] = useState(false);
    const [voice, setVoice] = useState(() => readPref("voice", true));
    const [sound, setSound] = useState(() => readPref("sound", true));
    const [side, setSide] = useState(() => (defaultSide === undefined ? readPref("tutorSide", true) : defaultSide));
    const [listening, setListening] = useState(false);
    const [why, setWhy] = useState(false);
    const [mood, setMood] = useState<Mood>("idle");
    const chat = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const step = steps[i];
    const item = step?.kind === "question" ? step.item : (undefined as unknown as QuizItem);
    const teach = step?.kind === "teach";
    const over = i >= steps.length;
    // the one cell that morphs from slide to slide: which phase it should be in right now
    const [phasePick, setPhasePick] = useState<Phase | null>(null);
    const stepArt = step ? (step.kind === "teach" ? step.art : step.item.art) : undefined;
    const cellPhase: Phase | null = step?.kind === "teach" && step.interactive === "phases" ? (phasePick ?? "interphase") : stepArt?.startsWith("cell:") ? (stepArt.slice(5) as Phase) : null;
    const words = item?.type === "order" ? wordsFor(item) : [];
    const tiles = item?.type === "choose" ? tilesFor(item) : [];
    const given = item?.type === "choose" || item?.type === "tap" ? pick : item?.type === "order" ? placed.join(" ") : typed;
    const ready = item?.type === "order" ? placed.length === words.length : !!given.trim();
    const done = state === "right" || state === "reveal";

    useEffect(() => {
        setMuted(!sound);
    }, [sound]);
    useEffect(() => writePref("voice", voice), [voice]);
    useEffect(() => writePref("sound", sound), [sound]);
    useEffect(() => writePref("tutorSide", side), [side]);
    useEffect(() => () => stopSpeech(), []);

    const rua = (text: string, tone: Msg["tone"] = "plain", m: Mood = "talk") => {
        setMsgs((x) => [...x, { who: "rua", text, tone }]);
        setMood(m);
        if (voice) say(text, langOf(text)).then(() => setMood((cur) => (cur === "talk" ? "idle" : cur)));
        else setTimeout(() => setMood((cur) => (cur === "talk" ? "idle" : cur)), 1200);
    };

    // a new step: Rua reads the question, or the slide
    useEffect(() => {
        if (!step) return;
        setPick("");
        setTyped("");
        setPlaced([]);
        setWrongPicks([]);
        setState("ask");
        setTries(0);
        setMsgs([]);
        setPhasePick(null);
        if (step.kind === "teach") rua(i === 0 ? `${step.title}. ${step.text}` : step.text);
        else rua(i === 0 ? `Let's start. ${step.item.prompt}` : step.item.prompt);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [i]);
    useEffect(() => {
        chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: "smooth" });
    }, [msgs, thinking]);
    useEffect(() => {
        if (over) {
            sfx.fanfare();
            setBurst((b) => b + 1);
            setMood("happy");
            onFinish(results, Object.values(results).filter((r) => r.right).length);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [over]);

    const award = (n: number) => {
        setGain({ n, k: Date.now() });
        setTimeout(() => {
            setXp((x) => x + n);
            sfx.xp();
        }, 650);
    };

    const check = async () => {
        if (!item || !ready || state !== "ask") return;
        if (isRight(item, given)) {
            setState("right");
            sfx.right();
            setBurst((b) => b + 1);
            award(tries === 0 ? 15 : 5);
            setResults((r) => ({ ...r, [item.id]: { given, right: tries === 0 } }));
            rua(PRAISE[i % PRAISE.length], "good", "happy");
            return;
        }
        sfx.wrong();
        setTries((t) => t + 1);
        if (item.type === "type" || tries >= 1) {
            setState("reveal");
            setResults((r) => ({ ...r, [item.id]: { given, right: false } }));
            setSide(true);
            rua(`Not quite. The answer is “${item.answer}”.`, "warn", "sad");
            return;
        }
        setState("wrong");
        setSide(true); // the tutor opens up to help
        if (item.type === "choose" || item.type === "tap") setWrongPicks((w) => [...w, pick]);
        rua("Not quite.", "warn", "sad");
        setThinking(true);
        setMood("think");
        const hint = await ask({ question: "Give me a hint, not the answer.", item, given, answered: false });
        setThinking(false);
        if (hint) rua(hint);
        else setMood("idle");
        setState("ask");
        if (item.type === "choose" || item.type === "tap") setPick("");
        else setPlaced([]);
    };
    const next = () => {
        sfx.tap();
        setI(i + 1);
    };
    const send = async (text?: string) => {
        const q = (text ?? draft).trim();
        if (!q || thinking) return;
        setDraft("");
        setMsgs((m) => [...m, { who: "me", text: q }]);
        setThinking(true);
        setMood("think");
        const ctx: QuizItem = item ?? { id: "slide", type: "type", prompt: teach ? `${(step as Extract<Step, { kind: "teach" }>).title}: ${(step as Extract<Step, { kind: "teach" }>).text}` : "", answer: "", why: "" };
        const a = await ask({ question: q, item: ctx, given, answered: teach || state !== "ask" });
        setThinking(false);
        rua(a ?? "I can't reach my notes right now. Try Why? after you answer.");
    };

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (over) return;
            if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") return (e.preventDefault(), setSide(true), setTimeout(() => input.current?.focus(), 50));
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "v") return setVoice((v) => !v);
            if (e.key === "Enter") teach ? next() : state === "ask" ? check() : done ? next() : undefined;
            else if (!teach && state === "ask" && item.type === "choose" && /^[1-9]$/.test(e.key) && tiles[+e.key - 1] && !wrongPicks.includes(tiles[+e.key - 1])) (setPick(tiles[+e.key - 1]), sfx.tap());
        };
        addEventListener("keydown", key);
        return () => removeEventListener("keydown", key);
    });

    const last = msgs[msgs.length - 1];
    const glow = state === "right" ? "0 0 0 2px #47C25A, 0 30px 70px -24px rgba(71,194,90,.6)" : state === "reveal" || state === "wrong" ? "0 0 0 2px #FF6B6B, 0 30px 70px -24px rgba(255,107,107,.45)" : "0 0 0 1px #E5E5E5, 0 0 0 0 rgba(0,0,0,0)";
    const quit = onClose ? (
        <AriaButton onPress={onClose} aria-label="Quit lesson" className="rounded-full p-2 text-[#8A8A8A] outline-focus-ring hover:bg-[#F2F2F2] hover:text-[#1F1F1F] focus-visible:outline-2">
            {I.close()}
        </AriaButton>
    ) : (
        <Link to={closeHref ?? "/quiz"} aria-label="Quit lesson" className="rounded-full p-2 text-[#8A8A8A] outline-focus-ring hover:bg-[#F2F2F2] hover:text-[#1F1F1F] focus-visible:outline-2">
            {I.close()}
        </Link>
    );
    const bubble = (m: Msg, k: number) => (
        <motion.div key={k} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22 }} className={cx("max-w-[17rem] rounded-2xl border px-4 py-3 text-md leading-6", m.who === "me" ? "self-end border-[#D7D7D7] bg-[#F5F5F5] text-[#1F1F1F]" : m.tone === "warn" ? "border-[#F2D16B] bg-[#FFF8DB] font-semibold text-[#5C4A00]" : m.tone === "good" ? "border-[#9BE3A5] bg-[#EAF8EC] font-semibold text-[#1F7A2E]" : "border-[#E5E5E5] bg-white text-[#3C3C3C]")}>
            {m.text}
        </motion.div>
    );

    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-white text-[#1F1F1F]">
            {/* top bar */}
            <div className="flex h-16 shrink-0 items-center gap-4 px-4 md:px-8">
                {quit}
                <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#F2F2F2] text-[#1F1F1F]">{I.back()}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#E9E9E9]">
                        <motion.div className="h-full rounded-full bg-[#31C457]" initial={false} animate={{ width: `${over ? 100 : (100 * i) / steps.length}%` }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }} />
                    </div>
                    <span className="flex gap-1.5">
                        {[0, 1, 2].map((d) => (
                            <span key={d} className="size-2 rounded-full bg-[#E0E0E0]" />
                        ))}
                    </span>
                    <span className="text-[#BDBDBD]">{I.fwd()}</span>
                </div>
                <div className="relative flex items-center gap-3 text-md font-semibold tabular-nums">
                    <motion.span key={xp} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 14 }} className="flex items-center gap-1">
                        {xp} <span className="text-[#31C457]">{I.spark()}</span>
                    </motion.span>
                    <span className="text-[#C9D400]">{I.bolt()}</span>
                    <AnimatePresence>
                        {gain && (
                            <motion.span key={gain.k} initial={{ opacity: 0, y: 24, scale: 0.8 }} animate={{ opacity: 1, y: -6, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} onAnimationComplete={() => setTimeout(() => setGain(null), 300)} className="absolute right-6 -bottom-6 text-md font-bold text-[#31C457]">
                                +{gain.n}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="relative mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 gap-0 px-4 pb-4 md:px-8">
                {/* the tutor's column folds on the handle */}
                <AnimatePresence initial={false}>
                    {side && (
                        <motion.aside key="side" initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }} className="hidden min-h-0 shrink-0 flex-col overflow-hidden pr-4 lg:flex">
                            <div ref={chat} className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-y-auto pb-3 scrollbar-hide">
                                <AnimatePresence initial={false}>{msgs.map(bubble)}</AnimatePresence>
                                {thinking && (
                                    <div className="flex w-16 items-center justify-center gap-1 rounded-2xl border border-[#E5E5E5] px-4 py-3">
                                        {[0, 1, 2].map((d) => (
                                            <motion.span key={d} className="size-1.5 rounded-full bg-[#9A9A9A]" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: d * 0.2 }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-end gap-3">
                                <Rua mood={mood} className="size-16 shrink-0" />
                                <form
                                    className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#E5E5E5] bg-white py-1.5 pr-1.5 pl-4 shadow-sm"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        send();
                                    }}
                                >
                                    <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="How can I help?" aria-label="Ask Rua" className="min-w-0 flex-1 bg-transparent text-md outline-hidden placeholder:text-[#A0A0A0]" />
                                    <button
                                        type="button"
                                        aria-label="Speak to Rua"
                                        aria-pressed={listening}
                                        onClick={() => {
                                            const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
                                            if (!SR) return rua("This browser can't hear you, but you can type.");
                                            const r = new SR();
                                            r.lang = "en-IE";
                                            r.onresult = (e) => {
                                                const t = e.results[0][0].transcript;
                                                setListening(false);
                                                send(t);
                                            };
                                            r.onend = () => setListening(false);
                                            r.onerror = () => setListening(false);
                                            setListening(true);
                                            r.start();
                                        }}
                                        className={cx("flex size-9 items-center justify-center rounded-full transition", listening ? "bg-[#FF4B4B] text-white" : "text-[#8A8A8A] hover:bg-[#F2F2F2]")}
                                    >
                                        {I.mic()}
                                    </button>
                                    <button type="submit" aria-label="Send" disabled={!draft.trim() || thinking} className="flex size-9 items-center justify-center rounded-full bg-[#333] text-white transition disabled:bg-[#EFEFEF] disabled:text-[#B5B5B5]">
                                        {I.send()}
                                    </button>
                                </form>
                            </div>
                            <p className="mt-2 pl-20 text-xs text-[#A0A0A0]">
                                to type <kbd className="rounded border border-[#DADADA] px-1.5 font-sans">/</kbd> · for voice <kbd className="rounded border border-[#DADADA] px-1.5 font-sans">v</kbd>
                            </p>
                        </motion.aside>
                    )}
                </AnimatePresence>

                {/* the handle, as on Brilliant: a short bar at the card's edge */}
                <button type="button" onClick={() => setSide(!side)} aria-label={side ? "Hide the tutor" : "Show the tutor"} aria-expanded={side} className="group hidden shrink-0 items-center px-1 lg:flex">
                    <span className="block h-10 w-1.5 rounded-full bg-[#D9D9D9] transition group-hover:bg-[#8A8A8A]" />
                </button>

                {/* the card */}
                <motion.section animate={{ boxShadow: glow }} transition={{ duration: 0.35 }} className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-white">
                    <Confetti fire={burst} />
                    <div className="absolute top-5 left-5 z-10 flex flex-col gap-3 text-[#B5B5B5]">
                        <span title="Report a problem">{I.flag()}</span>
                        <AriaButton onPress={() => (setVoice(!voice), !voice ? undefined : stopSpeech())} aria-pressed={voice} aria-label="Narrator" className="rounded outline-focus-ring hover:text-[#1F1F1F] focus-visible:outline-2">
                            {I.sound(voice, voice ? "text-[#31C457]" : "")}
                        </AriaButton>
                        <AriaButton onPress={() => setSound(!sound)} aria-pressed={sound} aria-label="Sound effects" className="rounded text-xs font-bold outline-focus-ring hover:text-[#1F1F1F] focus-visible:outline-2">
                            {sound ? "SFX" : <s>SFX</s>}
                        </AriaButton>
                    </div>

                    {over ? (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
                                <Rua mood="happy" className="size-32" />
                            </motion.div>
                            <h2 className="mt-6 text-display-sm font-bold">Lesson complete</h2>
                            <p className="mt-2 text-md text-[#6B6B6B]">{title}</p>
                            <div className="mt-8 flex gap-4">
                                <div className="min-w-36 rounded-2xl border border-[#E5E5E5] px-6 py-4">
                                    <p className="text-xs font-bold tracking-wider text-[#8A8A8A] uppercase">XP earned</p>
                                    <p className="mt-1 flex items-center justify-center gap-1 text-display-xs font-bold text-[#31C457] tabular-nums">
                                        {xp} {I.spark("size-5")}
                                    </p>
                                </div>
                                <div className="min-w-36 rounded-2xl border border-[#E5E5E5] px-6 py-4">
                                    <p className="text-xs font-bold tracking-wider text-[#8A8A8A] uppercase">First try</p>
                                    <p className="mt-1 text-display-xs font-bold tabular-nums">
                                        {Object.values(results).filter((r) => r.right).length} / {questions}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-10">{onClose ? <Pill onPress={onClose}>Done</Pill> : <Pill href={closeHref ?? "/quiz"}>Done</Pill>}</div>
                        </div>
                    ) : (
                        <>
                            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-14 pb-6 md:px-10">
                                {cellPhase && (
                                    <motion.div layout className="relative mx-auto mb-6 w-full max-w-2xl">
                                        <CellArt phase={cellPhase} />
                                        {item?.type === "tap" && item.targets && (
                                            <svg viewBox="0 0 420 260" className="absolute inset-0 mx-auto h-auto w-full max-w-lg" style={{ left: 0, right: 0 }} aria-label="Tap a spot on the diagram">
                                                {item.targets.map((t) => {
                                                    const on = pick === t.id, dead = wrongPicks.includes(t.id), right = done && t.id === item.answer;
                                                    return (
                                                        <g key={t.id} onClick={() => !done && !dead && (setPick(t.id), sfx.tap())} className={cx(!done && !dead && "cursor-pointer")}>
                                                            <circle cx={t.cx} cy={t.cy} r={t.r + 6} fill="transparent" />
                                                            <motion.circle cx={t.cx} cy={t.cy} r={t.r} fill={right ? "rgba(71,194,90,.18)" : on ? "rgba(31,31,31,.08)" : dead ? "rgba(255,75,75,.10)" : "rgba(28,176,246,.06)"} stroke={right ? "#47C25A" : on ? "#1F1F1F" : dead ? "#FF6B6B" : "#1CB0F6"} strokeWidth={on || right ? 3 : 2} strokeDasharray={on || right || dead ? "0" : "6 5"} animate={!on && !done && !dead ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }} transition={{ duration: 1.6, repeat: Infinity }} />
                                                            {(on || right || dead) && (
                                                                <text x={t.cx} y={t.cy - t.r - 8} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill={right ? "#1F7A2E" : dead ? "#C0392B" : "#1F1F1F"}>
                                                                    {t.label}
                                                                </text>
                                                            )}
                                                        </g>
                                                    );
                                                })}
                                            </svg>
                                        )}
                                    </motion.div>
                                )}
                                <div>
                                    {teach ? (
                                        <motion.div key={`t${i}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                                            <Teach step={step as Extract<Step, { kind: "teach" }>} phase={cellPhase ?? "interphase"} onPhase={setPhasePick} />
                                        </motion.div>
                                    ) : (
                                    <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="mx-auto flex max-w-xl flex-col items-center">
                                        <p className="text-center text-lg font-semibold md:text-xl">{item.prompt}</p>
                                        {item.art && !item.art.startsWith("cell:") && (
                                            <div className="mt-8 w-full">
                                                <Art kind={item.art} item={item} revealed={done} />
                                            </div>
                                        )}

                                        {item.type === "choose" && (
                                            <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                                                {tiles.map((t, n) => {
                                                    const dead = wrongPicks.includes(t);
                                                    const on = pick === t;
                                                    const showRight = done && t === item.answer;
                                                    return (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            disabled={dead || done}
                                                            onClick={() => (setPick(t), sfx.tap())}
                                                            className={cx(
                                                                "relative flex min-h-16 items-center justify-center rounded-2xl border px-4 py-3 text-center text-md font-medium outline-focus-ring transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
                                                                showRight ? "border-[#47C25A] bg-[#EAF8EC] text-[#1F7A2E] shadow-[0_0_0_1px_#47C25A]" : on ? "border-[#1F1F1F] bg-[#F7F7F7] shadow-[0_0_0_1px_#1F1F1F]" : dead ? "border-[#E5E5E5] text-[#C4C4C4]" : "border-[#E5E5E5] bg-white hover:bg-[#FAFAFA] hover:shadow-[0_2px_8px_rgba(0,0,0,.06)]",
                                                            )}
                                                        >
                                                            {t}
                                                            {dead && <span className="absolute -top-2.5 -right-2.5 flex size-6 items-center justify-center rounded-full border border-[#E5E5E5] bg-white text-[#9A9A9A]">{I.close("size-3.5")}</span>}
                                                            {showRight && <span className="absolute -top-2.5 -right-2.5 flex size-6 items-center justify-center rounded-full bg-[#47C25A] text-white">{I.tick("size-3.5")}</span>}
                                                            <span className="sr-only">option {n + 1}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {item.type === "order" && (
                                            <div className="mt-8 w-full">
                                                <div className={cx("flex min-h-16 flex-wrap items-center gap-2 rounded-2xl border border-dashed px-3 py-3 transition-colors", done ? (state === "right" ? "border-[#47C25A] bg-[#EAF8EC]" : "border-[#FF6B6B] bg-[#FFF0F0]") : "border-[#D9D9D9]")}>
                                                    {placed.length === 0 && <span className="px-2 text-sm text-[#A0A0A0]">Tap the words in order</span>}
                                                    {placed.map((w, n) => (
                                                        <motion.button layout key={`${w}-${n}`} type="button" disabled={done} onClick={() => (setPlaced(placed.filter((_, k) => k !== n)), sfx.tap())} className="rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-md font-medium shadow-[0_2px_0_#E5E5E5]">
                                                            {w}
                                                        </motion.button>
                                                    ))}
                                                </div>
                                                <div className="mt-4 flex flex-wrap justify-center gap-2 rounded-2xl bg-[#F7F7F7] p-3">
                                                    {words.map((w, n) => {
                                                        const used = placed.filter((p) => p === w).length >= words.filter((x) => x === w).length;
                                                        return (
                                                            <button key={n} type="button" disabled={used || done} onClick={() => (setPlaced([...placed, w]), sfx.place())} className={cx("rounded-xl border px-3 py-2 text-md font-medium transition", used ? "border-transparent bg-[#ECECEC] text-transparent" : "border-[#E5E5E5] bg-white shadow-[0_2px_0_#E5E5E5] hover:bg-[#FAFAFA] active:translate-y-px active:shadow-none")}>
                                                                {w}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                {done && state !== "right" && <p className="mt-3 text-center text-md font-semibold text-[#1F7A2E]">{item.answer}</p>}
                                                {!done && placed.length > 0 && (
                                                    <div className="mt-3 flex justify-end">
                                                        <AriaButton onPress={() => (setPlaced([]), sfx.tap())} className="flex items-center gap-1.5 text-sm font-semibold hover:underline">
                                                            {I.redo()} Start over
                                                        </AriaButton>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {item.type === "tap" && <p className="mt-4 text-sm font-semibold text-[#8A8A8A]">{pick ? `You tapped ${item.targets?.find((t) => t.id === pick)?.label ?? "a spot"}.` : "Tap one of the marked spots on the picture."}</p>}
                                        {item.type === "type" && (
                                            <div className="mt-8 w-full">
                                                <input
                                                    aria-label="Your answer"
                                                    value={typed}
                                                    onChange={(e) => setTyped(e.target.value)}
                                                    readOnly={done}
                                                    autoFocus
                                                    placeholder={item.numeric ? "Type a number…" : "Type your answer…"}
                                                    inputMode={item.numeric ? "numeric" : undefined}
                                                    onKeyDown={(e) => e.key === "Enter" && (state === "ask" ? check() : next())}
                                                    className={cx("w-full rounded-2xl border bg-white px-5 py-4 text-center text-xl font-medium outline-hidden transition focus:border-[#1F1F1F]", state === "right" ? "border-[#47C25A] bg-[#EAF8EC]" : state === "reveal" ? "border-[#FF6B6B] bg-[#FFF0F0]" : "border-[#E5E5E5]")}
                                                />
                                                {state === "reveal" && <p className="mt-3 text-center text-md font-semibold text-[#1F7A2E]">{item.answer}</p>}
                                            </div>
                                        )}
                                    </motion.div>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center justify-center gap-3 px-6 pb-6">
                                {teach ? (
                                    <Pill onPress={next} className="min-w-64">
                                        Continue
                                    </Pill>
                                ) : null}
                                {!teach && done && (
                                    <Pill tone="ghost" onPress={() => setWhy(true)} className="min-w-0">
                                        Why?
                                    </Pill>
                                )}
                                {!teach && done && (
                                    <Pill tone={state === "right" ? "green" : "dark"} onPress={next} className="min-w-64">
                                        Continue
                                    </Pill>
                                )}
                                {!teach && !done && (
                                    <Pill onPress={check} disabled={!ready || state === "wrong"} className="min-w-64">
                                        Check
                                    </Pill>
                                )}
                            </div>
                        </>
                    )}
                </motion.section>
            </div>

            {/* the tutor when the column is folded, and on phones: Rua in the corner with the latest line */}
            {!over && last && (!side || true) && (
                <div className={cx("pointer-events-none absolute bottom-24 left-6 flex max-w-[22rem] items-end gap-3", side ? "lg:hidden" : "")}>
                    <Rua mood={mood} className="size-14" />
                    <motion.p key={msgs.length} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cx("max-w-[15rem] rounded-2xl border px-3 py-2 text-sm shadow-sm", last.tone === "warn" ? "border-[#F2D16B] bg-[#FFF8DB] text-[#5C4A00]" : last.tone === "good" ? "border-[#9BE3A5] bg-[#EAF8EC] text-[#1F7A2E]" : "border-[#E5E5E5] bg-white text-[#3C3C3C]")}>
                        {last.text}
                    </motion.p>
                </div>
            )}

            {why && item && !teach && (
                <DuoDialog open onClose={() => setWhy(false)} title="Explanation">
                    {item.art && (
                        <div className="rounded-2xl bg-[#F7F7F7] p-4">
                            <Art kind={item.art} item={item} revealed />
                        </div>
                    )}
                    <p className="mt-5 text-lg leading-8 text-[#3C3C3C]">{explain(item)}</p>
                </DuoDialog>
            )}
        </div>
    );
};
