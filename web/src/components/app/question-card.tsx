// One exam question: header and actions, the paper itself (typed on directly), checking, the official
// marking scheme and any H1 sample answers.
import { Fragment, useState } from "react";
import { AlertCircle, ArrowRight, Bookmark, Check, CheckSquare, ChevronDown, FileCheck02, InfoCircle, LayoutRight, Minus, Plus, Printer, Square, X } from "@/components/app/ic";
import { motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { Badge } from "@/components/base/badges/badges";
import { type Img, type Question, D, answerKeys, checkable, isAural, label, samplesOf } from "@/lib/data";
import { type Check as CheckT, type Result, type Verdict, get, set, setAnswer, toggleExam, toggleSaved, useStore } from "@/lib/store";
import { startPrinting, togglePick, usePick } from "@/lib/pick";
import { cx } from "@/utils/cx";
import { openSample, openScheme, printQuestions } from "./overlays";
import { SOON } from "@/lib/soon";
import { AnswerParts } from "./answer-parts";
import { AudioPlayer } from "./audio-player";
import { DuoButton } from "./duo";
import { Segmented } from "./segmented";
import { HomeworkTags, SetHomeworkButton } from "./set-homework";
import { toast } from "./toast";

// Every crop is drawn at one scale (K px per PDF point, Studyclix's text size), never stretched
const K = 1.6;

/* `fill` is the answer space once it has been marked: its border and its background take the
   verdict's colour, so the paper reads at a glance. */
const VERD: Record<Verdict, { icon: typeof Check; word: string; dot: string; soft: string; fill: string }> = {
    correct: { icon: Check, word: "Right", dot: "bg-success-solid", soft: "bg-success-secondary text-fg-success-primary", fill: "border-success bg-utility-success-50/70" },
    partial: { icon: HalfIcon, word: "Partly right", dot: "bg-warning-solid", soft: "bg-warning-secondary text-fg-warning-primary", fill: "border-warning bg-utility-warning-50/80" },
    wrong: { icon: X, word: "Wrong", dot: "bg-error-solid", soft: "bg-error-secondary text-fg-error-primary", fill: "border-error bg-utility-error-50/70" },
    blank: { icon: Minus, word: "Not answered", dot: "bg-fg-quaternary", soft: "bg-tertiary text-fg-quaternary", fill: "border-tertiary bg-secondary" },
};

/* How an answer space looks before it is marked: a white box with a soft green edge over the printed
   one, a darker edge under the mouse, and with the cursor a green edge with a pale halo. The same
   on the listening paper and under a reading comprehension, so a student learns it once. */
const SPACE =
    "border-2 border-brand-200 bg-white caret-brand-600 placeholder:text-quaternary/80 hover:border-brand-300 hover:bg-brand-25 focus:border-brand-500 focus:ring-4 focus:ring-brand-100";
function HalfIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <path d="M12 5a7 7 0 0 1 0 14z" fill="currentColor" />
        </svg>
    );
}
const rvId = (qid: string, key: string) => `rv-${qid}-${key.replace(/[^\w-]/g, "_")}`;

/** The status mark at the end of an answer space, with the marks it got; it jumps to that answer's feedback. */
const Mark = ({ qid, k, r, style, className }: { qid: string; k: string; r: Result; style?: React.CSSProperties; className?: string }) => {
    const v = VERD[r.verdict];
    const marks = r.max ? `${r.awarded}/${r.max}` : "";
    return (
        <AriaButton
            style={style}
            aria-label={`${v.word}${r.max ? `, ${r.awarded} of ${r.max} marks` : ""}. Go to feedback`}
            onPress={() => {
                const el = document.getElementById(rvId(qid, k));
                el?.scrollIntoView({ block: "center", behavior: "smooth" });
                el?.animate([{ backgroundColor: "var(--color-bg-brand-primary)" }, { backgroundColor: "transparent" }], { duration: 1400 });
            }}
            className={cx(
                // sized from the paper's width, so on a phone the pill shrinks with the print rather than cover it
                "absolute z-1 flex h-[1.8em] items-center justify-center gap-[0.35em] rounded-full text-[clamp(8px,1.25cqw,11px)] text-white shadow-sm ring-2 ring-white outline-focus-ring transition duration-100 ease-linear hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2",
                marks ? "px-[0.55em]" : "w-[1.8em]",
                v.dot,
                className,
            )}
        >
            <v.icon className="size-[1.1em] stroke-[3px]" />
            {marks && <span className="leading-none font-bold tabular-nums">{marks}</span>}
        </AriaButton>
    );
};

/* An answer space is drawn the size of the box printed on the paper, one line. An answer longer than
   that used to scroll inside it, so while it was being written only the last line could be seen and
   the rest was out of sight: a box that read "go leor fodair" held three lines nobody could see. While
   a space has the cursor it now grows to show everything in it, over the paper, and goes back to the
   printed box when the cursor leaves. */
const fit = (el: HTMLTextAreaElement | null, open: boolean) => {
    if (!el) return;
    // back to the printed box's own height (kept on the element: React does not set it again)
    el.style.height = el.dataset.h || "";
    el.style.lineHeight = "";
    if (el.scrollHeight <= el.clientHeight + 1) return;
    if (open) {
        el.style.height = `${el.scrollHeight + 4}px`;
        return;
    }
    /* At rest an answer longer than the box shows whole lines only, never a line cut through the
       middle: the lines are spaced so that a whole number of them fills the box exactly, and the
       next one starts below its edge. (Padding would not do: what overflows paints over padding.) */
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight);
    const inner = el.clientHeight - parseFloat(cs.paddingTop);
    if (line > 0 && inner > line) el.style.lineHeight = `${inner / Math.floor(inner / line)}px`;
};

/* The space sits a little outside the box printed on the paper, so its edge covers the printed line
   rather than drawing a second one inside it. */
const OUT = 2;

const PaperImage = ({ q, img, idx, maxpt, check }: { q: Question; img: Img; idx: number | "rc"; maxpt: number; check?: CheckT }) => {
    const answers = useStore((s) => s.answers[q.id]);
    return (
        <div className="relative mx-auto [&+&]:mt-1.5" style={{ width: `${(100 * (img.pt || maxpt)) / maxpt}%` }}>
            <img loading="lazy" src={img.src} width={img.w} height={img.h} alt={`Exam paper, ${q.title}`} className="h-auto w-full" />
            {(img.boxes || []).map((b, j) => {
                const key = `box${idx}-${j}`;
                const r = check?.by[key];
                // a box of more than one printed line carries its mark in the top corner, not mid-air
                const tall = (b[3] - b[1]) * img.h * ((img.pt || maxpt) / img.w) > 26;
                return (
                    <div key={key}>
                        <textarea
                            rows={1}
                            // an answer kept from before is trimmed to whole lines as soon as it is drawn
                            ref={(el) => { if (el && document.activeElement !== el) fit(el, false); }}
                            aria-label={`Answer space ${j + 1}`}
                            value={answers?.[key] || ""}
                            onChange={(e) => {
                                setAnswer(q.id, key, e.target.value);
                                fit(e.currentTarget, true);
                            }}
                            onFocus={(e) => fit(e.currentTarget, true)}
                            onBlur={(e) => fit(e.currentTarget, false)}
                            onKeyDown={(e) => {
                                // Enter moves on to the next space, like filling in the paper
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    const all = [...(e.currentTarget.closest("[data-paper]")?.querySelectorAll("textarea") || [])];
                                    (all[all.indexOf(e.currentTarget) + 1] as HTMLTextAreaElement | undefined)?.focus();
                                }
                            }}
                            placeholder="Type your answer"
                            data-h={`calc(${(b[3] - b[1]) * 100}% + ${2 * OUT}px)`}
                            className={cx(
                                "absolute resize-none overflow-hidden rounded-md px-2 pt-[3px] leading-tight text-primary outline-hidden transition duration-150 ease-out focus:z-10 focus:bg-primary focus:shadow-md focus:placeholder:text-transparent",
                                r ? cx("border-2 pr-[clamp(2.4rem,7cqw,4rem)]", VERD[r.verdict].fill) : SPACE,
                            )}
                            style={{
                                left: `calc(${b[0] * 100}% - ${OUT}px)`,
                                top: `calc(${b[1] * 100}% - ${OUT}px)`,
                                width: `calc(${(b[2] - b[0]) * 100}% + ${2 * OUT}px)`,
                                height: `calc(${(b[3] - b[1]) * 100}% + ${2 * OUT}px)`,
                                fontFamily: "Calibri, Carlito, 'Segoe UI', sans-serif",
                                fontSize: `min(${K * 10.5}px, ${(1050 / maxpt).toFixed(3)}cqw)`,
                            }}
                        />
                        {r && (
                            <Mark
                                qid={q.id}
                                k={key}
                                r={r}
                                className={cx("-translate-x-[calc(100%+6px)]", tall ? "translate-y-1.5" : "-translate-y-1/2")}
                                style={{ left: `${b[2] * 100}%`, top: tall ? `${b[1] * 100}%` : `${(b[1] + b[3]) * 50}%` }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

/** The paper on a light desk: crops at one scale, answer spaces laid over the printed boxes. */
const Paper = ({ q, check }: { q: Question; check?: CheckT }) => {
    const answers = useStore((s) => s.answers[q.id]);
    const strips = q.strips?.length ? q.strips : null;
    const all = strips ? strips.flatMap((s) => s.images) : q.question;
    const maxpt = Math.max(...all.map((i) => i.pt || 520));
    const f = q.paperFont;
    const parts = D().keys[q.id]?.parts || [];
    return (
        <div
            data-paper
            className="mx-auto max-w-full bg-white px-1 py-2 sm:px-3 [container-type:inline-size]"
            style={{ width: `calc(${maxpt * K}px + 48px)` }}
        >
            {!strips
                ? q.question.map((img, n) => <PaperImage key={n} q={q} img={img} idx={n} maxpt={maxpt} check={check} />)
                : strips.map((s, si) => (
                      <div key={si}>
                          {s.images.map((img, n) => (
                              <PaperImage key={n} q={q} img={img} idx="rc" maxpt={maxpt} check={check} />
                          ))}
                          {(s.parts || []).map((pid) => {
                              const part = parts.find((p) => p.id === pid);
                              if (!part || part.kind !== "short") return null;
                              const r = check?.by[pid];
                              return (
                                  <div key={pid} className="relative mt-0.5 mb-3 ml-[4%] w-[94%] sm:ml-[9%] sm:w-[88%]">
                                      <textarea
                                          rows={2}
                                          aria-label={`Answer to ${pid}`}
                                          placeholder={`Answer ${pid}`}
                                          value={answers?.[pid] || ""}
                                          onChange={(e) => setAnswer(q.id, pid, e.target.value)}
                                          className={cx(
                                              "block min-h-[2.2em] w-full resize-y rounded-md py-1.5 pr-10 pl-2.5 leading-snug text-black outline-hidden transition duration-150 ease-out focus:shadow-md",
                                              r ? cx("border-2 pr-[clamp(2.4rem,8cqw,5rem)]", VERD[r.verdict].fill) : SPACE,
                                          )}
                                          style={{
                                              fontFamily: f?.family || "Times New Roman, serif",
                                              fontSize: f ? `max(16px, min(${(f.size * K).toFixed(1)}px, ${((100 * f.size) / maxpt).toFixed(3)}cqw))` : 16,
                                          }}
                                      />
                                      {r && <Mark qid={q.id} k={pid} r={r} className="top-2.5 right-2.5" />}
                                  </div>
                              );
                          })}
                      </div>
                  ))}
            {/* other subjects: the markable parts listed under the paper */}
            {!strips && parts.length > 0 && !q.question.some((i) => i.boxes?.length) && <AnswerParts q={q} check={check} />}
        </div>
    );
};

const Audio = ({ q }: { q: Question }) => {
    if (!isAural(q)) return null;
    if (!q.audio)
        return (
            <div className="mb-4 flex items-start gap-3 rounded-xl border-2 border-dashed border-secondary px-4 py-3 text-sm text-tertiary">
                <InfoCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-quaternary" />
                The recording for {q.year}
                {q.deferred ? " (deferred)" : ""} isn't available yet. You can still read the questions and the marking scheme.
            </div>
        );
    const cuid = q.title.match(/Cuid ([ABC])/)?.[1] || "";
    return <AudioPlayer src={q.audio.src} title={`Cuid ${cuid} recording`} seconds={q.audio.seconds} meta={`official SEC audio, ${q.year}${q.deferred ? " deferred" : ""}`} />;
};

/* ---------------- checking ---------------- */
export async function checkQuestion(qid: string): Promise<string | null> {
    try {
        const r = await fetch("/api/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: qid, answers: get().answers[qid] || {} }),
        });
        const m = await r.json();
        if (!r.ok) throw new Error(m.error || "Marking failed");
        set("checks", { ...get().checks, [qid]: { by: Object.fromEntries(m.results.map((x: Result) => [x.key, x])), at: Date.now() } });
        return null;
    } catch (err) {
        const msg = (err as Error).message;
        return msg === "Failed to fetch" ? "Couldn't reach the marker. Check your connection and try again." : msg;
    }
}

/** Before any check: Clear once something is written, and Check answers that only turns green once it can do something. */
const CheckControls = ({ q }: { q: Question }) => {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const written = useStore((s) => Object.values(s.answers[q.id] || {}).some((v) => v.trim()));
    const run = async () => {
        setBusy(true);
        setErr(null);
        const e = await checkQuestion(q.id);
        setBusy(false);
        if (e) return setErr(e);
        const rs = Object.values(get().checks[q.id].by), mx = rs.reduce((n, x) => n + (x.max || 0), 0);
        toast(mx ? `Checked: ${rs.reduce((n, x) => n + (x.awarded || 0), 0)} of ${mx} marks` : "Checked");
    };
    const clear = () => {
        const had = get().answers[q.id];
        if (!had) return;
        const { [q.id]: _a, ...answers } = get().answers;
        set("answers", answers);
        toast("Answers cleared", () => set("answers", { ...get().answers, [q.id]: had }));
    };
    return (
        <>
            {written && (
                <DuoButton color="ghost" size="sm" onPress={clear}>
                    Clear
                </DuoButton>
            )}
            {/* While it marks, the button stays where it is and the size it was: the longer label and a
                line of explanation underneath used to push the pair down onto a row of their own. */}
            <DuoButton color={written ? "primary" : "muted"} size="sm" onPress={run} isDisabled={!written} isLoading={busy} className="min-w-[9.75rem]">
                {busy ? "Checking" : "Check answers"}
            </DuoButton>
            {busy && (
                <span role="status" aria-live="polite" className="sr-only">
                    Marking against the scheme. This takes a few seconds.
                </span>
            )}
            {err && (
                <p role="alert" className="flex w-full items-start gap-2 rounded-lg bg-error-primary px-3 py-2.5 text-sm font-medium text-error-primary ring-1 ring-error_subtle ring-inset">
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {err}
                </p>
            )}
        </>
    );
};

const CheckBar = ({ q, check }: { q: Question; check?: CheckT }) => {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [onlyMiss, setOnlyMiss] = useState(false);

    const run = async () => {
        setBusy(true);
        setErr(null);
        const e = await checkQuestion(q.id);
        setBusy(false);
        if (e) return setErr(e);
        const rs = Object.values(get().checks[q.id].by), mx = rs.reduce((n, x) => n + (x.max || 0), 0);
        toast(mx ? `Checked: ${rs.reduce((n, x) => n + (x.awarded || 0), 0)} of ${mx} marks` : "Checked");
    };
    const clear = () => {
        const s = get(), had = [s.answers[q.id], s.checks[q.id]] as const;
        if (!had[0] && !had[1]) return toast("Nothing to clear");
        const { [q.id]: _a, ...answers } = s.answers;
        const { [q.id]: _c, ...checks } = s.checks;
        set("answers", answers);
        set("checks", checks);
        setOnlyMiss(false);
        toast("Answers cleared", () => {
            if (had[0]) set("answers", { ...get().answers, [q.id]: had[0] });
            if (had[1]) set("checks", { ...get().checks, [q.id]: had[1] });
        });
    };

    const error = err && (
        <p role="alert" className="flex w-full items-start gap-2 rounded-lg bg-error-primary px-3 py-2.5 text-sm font-medium text-error-primary ring-1 ring-error_subtle ring-inset">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {err}
        </p>
    );

    if (!check) return null;

    const keys = answerKeys(q).filter(([k]) => check.by[k]);
    const rs = keys.map(([k]) => check.by[k]);
    const count = (v: Verdict) => rs.filter((r) => r.verdict === v).length;
    const got = rs.reduce((n, r) => n + (r.awarded || 0), 0), mx = rs.reduce((n, r) => n + (r.max || 0), 0);
    const miss = rs.length - count("correct");
    const parts = (["correct", "partial", "wrong", "blank"] as Verdict[]).map((v) => [count(v), v === "correct" ? "right" : VERD[v].word.toLowerCase(), v] as const).filter(([x]) => x);
    const answers = get().answers[q.id] || {};

    return (
        <section aria-label="Your results" className="border-t-2 border-secondary">
            <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:gap-6">
                <div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-display-sm font-semibold text-primary tabular-nums">{mx ? got : count("correct")}</span>
                        <span className="text-md font-medium text-tertiary">/ {mx || rs.length} {mx ? "marks" : "right"}</span>
                    </div>
                </div>
                <div className="min-w-0 flex-1">
                    <div role="img" aria-label={parts.map(([x, w]) => `${x} ${w}`).join(", ")} className="flex h-2 gap-0.5">
                        {rs.map((r, i) => (
                            <motion.span
                                key={i}
                                initial={{ scaleY: 0.2, opacity: 0 }}
                                animate={{ scaleY: 1, opacity: 1 }}
                                transition={{ delay: 0.04 * i, duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                                className={cx("flex-1 origin-bottom rounded-xs first:rounded-l-full last:rounded-r-full", VERD[r.verdict].dot)}
                            />
                        ))}
                    </div>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tertiary">
                        {parts.map(([x, w, v]) => (
                            <span key={w} className="flex items-center gap-1.5">
                                <span aria-hidden="true" className={cx("size-2 rounded-full", VERD[v].dot)} />
                                <span className="font-semibold text-secondary tabular-nums">{x}</span> {w}
                            </span>
                        ))}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {miss > 0 && (
                        <Segmented
                            label="Show"
                            value={onlyMiss ? "miss" : "all"}
                            onChange={(k) => setOnlyMiss(k === "miss")}
                            items={[
                                { id: "all", label: `All ${rs.length}` },
                                { id: "miss", label: `To fix ${miss}` },
                            ]}
                        />
                    )}
                    <DuoButton color="ghost" size="xs" onPress={clear}>
                        Clear
                    </DuoButton>
                    <DuoButton color="secondary" size="xs" isLoading={busy} onPress={run}>
                        {busy ? "Checking again" : "Check again"}
                    </DuoButton>
                </div>
                {error}
            </div>

            <ol className="border-t-2 border-secondary">
                {keys.map(([k, num, txt, section], i) => {
                    const r = check.by[k], v = VERD[r.verdict], mine = (answers[k] || "").trim();
                    if (onlyMiss && r.verdict === "correct") return null;
                    const head = section && section !== keys[i - 1]?.[3];
                    return (
                        <Fragment key={k}>
                        {head && (
                            <li aria-hidden="true" className="border-b-2 border-secondary bg-secondary_subtle px-4 py-2 text-xs font-semibold text-tertiary sm:px-6" lang="ga">
                                {section}
                            </li>
                        )}
                        <li id={rvId(q.id, k)} className="grid scroll-mt-40 grid-cols-[24px_minmax(0,1fr)_auto] gap-x-4 gap-y-3 border-b-2 border-secondary px-4 py-4 transition-colors duration-150 last:border-b-0 hover:bg-secondary_subtle sm:px-6">
                            <span className={cx("mt-0.5 flex size-6 items-center justify-center rounded-full", v.soft)}>
                                <v.icon aria-hidden="true" className="size-3.5 stroke-[2.5px]" />
                                <span className="sr-only">{v.word}</span>
                            </span>
                            <p className="text-sm text-tertiary">
                                {num && <span className="mr-2 font-semibold text-primary tabular-nums">{num}</span>}
                                <span lang="ga">{txt}</span>
                            </p>
                            <p className="text-sm whitespace-nowrap text-tertiary tabular-nums">
                                {r.max ? (
                                    <>
                                        <span className="text-md font-semibold text-primary">{r.awarded}</span>/{r.max}
                                    </>
                                ) : (
                                    v.word
                                )}
                            </p>
                            <div className="col-span-3 grid gap-3 sm:col-span-2 sm:col-start-2 sm:grid-cols-2">
                                <div>
                                    <p className="text-xs font-medium text-quaternary">You wrote</p>
                                    <p lang="ga" className={cx("mt-0.5 text-md", mine ? "text-primary" : "text-placeholder italic")}>
                                        {mine || "Nothing written"}
                                    </p>
                                </div>
                                {/* The scheme's own answer, under every answer: a right one too, so what a full-mark answer
                                    looks like is always there to compare with. */}
                                {r.expected && (
                                    <div className={cx("rounded-lg px-3 py-2", r.verdict === "correct" ? "bg-secondary_subtle" : "bg-success-primary")}>
                                        <p className={cx("text-xs font-medium", r.verdict === "correct" ? "text-quaternary" : "text-success-primary")}>Marking scheme</p>
                                        <p lang="ga" className="mt-0.5 text-md font-medium text-primary">
                                            {r.expected}
                                        </p>
                                    </div>
                                )}
                                {r.feedback && (r.verdict !== "correct" || /spelling|standard/i.test(r.feedback)) && <p className="text-sm text-tertiary sm:col-span-2">{r.feedback}</p>}
                            </div>
                        </li>
                        </Fragment>
                    );
                })}
            </ol>
        </section>
    );
};

/* ---------------- marking scheme ---------------- */
export const SchemeSheet = ({ q }: { q: Question }) =>
    q.markingScheme.length ? (
        // the scheme is drawn at the same scale as the paper (K px per PDF point), never shrunk to fit
        <div
            className="mx-auto max-w-full rounded-xl border-2 border-secondary bg-white px-3 pt-4 pb-5 sm:px-6 [container-type:inline-size]"
            style={{ width: `calc(${Math.max(...q.markingScheme.map((i) => i.pt || 570)) * K}px + 48px)` }}
        >
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-quaternary">
                <FileCheck02 aria-hidden="true" className="size-4" />
                Official marking scheme · State Examinations Commission {q.year}
                {q.deferred ? " (deferred)" : ""}
            </p>
            {q.markingScheme.map((i, n) => (
                <img key={n} loading="lazy" src={i.src} width={i.w} height={i.h} alt={`Marking scheme, ${q.title}`} className="mx-auto h-auto [&+&]:mt-2.5" style={{ width: `${(100 * (i.pt || 570)) / Math.max(...q.markingScheme.map((x) => x.pt || 570))}%` }} />
            ))}
        </div>
    ) : (
        <p className="flex items-start gap-3 rounded-xl border border-dashed border-primary px-4 py-3 text-sm text-tertiary">
            <InfoCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-quaternary" />
            The SEC didn't publish a marking scheme for this question ({q.year}
            {q.deferred ? " deferred" : ""}).
        </p>
    );

const Scheme = ({ q, controls }: { q: Question; controls?: React.ReactNode }) => {
    const [open, setOpen] = useState(false);
    return (
        // one footer row: the scheme on the left, checking on the right; the section turns the faintest grey while the scheme is out
        <div className={cx("border-t-2 border-secondary transition-colors duration-200", open && "bg-secondary")}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                <DuoButton color="secondary" size="sm" iconLeading={FileCheck02} onPress={() => setOpen(!open)} className="aria-expanded:border-brand aria-expanded:bg-brand-primary" ariaLabel={open ? "Hide marking scheme" : "Show marking scheme"}>
                    {open ? "Hide scheme" : "Marking scheme"}
                    <ChevronDown aria-hidden="true" className={cx("size-4.5 transition-transform duration-200 ease-out", open && "-scale-y-100")} />
                </DuoButton>
                <DuoButton color="ghost" size="sm" iconLeading={LayoutRight} onPress={() => openScheme(q)}>
                    Pop-up
                </DuoButton>
                {controls && <div className="flex flex-wrap items-center gap-3 sm:ml-auto">{controls}</div>}
            </div>
            {open && (
                <div id={`ms-${q.id}`} role="region" aria-label="Marking scheme" className="px-3 pb-6 duration-300 ease-out animate-in fade-in slide-in-from-top-1 sm:px-6">
                    <SchemeSheet q={q} />
                </div>
            )}
        </div>
    );
};

/* ---------------- sample answers ---------------- */
export const SampleCard = ({ q, s, kind }: { q: Question; s: ReturnType<typeof samplesOf>[number]; kind?: string }) => {
    const first = (s.paragraphs[0]?.chunks || []).map((c) => c.ga).join(" ");
    return (
        <AriaButton
            onPress={() => openSample(q.id, s.letter)}
            aria-label={`Open sample answer: ${s.title}`}
            className="group flex w-full shrink-0 snap-start flex-col overflow-hidden rounded-2xl border-2 border-secondary border-b-4 bg-primary text-left outline-focus-ring transition duration-200 ease-out hover:-translate-y-0.5 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 pressed:translate-y-0 pressed:shadow-xs"
        >
            <div aria-hidden="true" className="relative h-32 overflow-hidden bg-linear-to-b from-secondary to-secondary_subtle px-6 pt-5">
                <div className="h-40 rounded-t-lg bg-white px-4 py-3.5 shadow-md ring-1 ring-secondary transition-transform duration-300 ease-out group-hover:-translate-y-1">
                    <p className="mb-1.5 line-clamp-2 text-[8px] leading-[1.3] font-semibold text-primary">{s.title}</p>
                    <p className="text-[5.5px] leading-[1.6] text-tertiary">{first}</p>
                </div>
                <span className="absolute top-3 right-3 rounded-full bg-primary-solid px-2 py-0.5 text-xs font-semibold text-white shadow-sm">{s.grade}</span>
            </div>
            <div className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium text-quaternary">{kind || `Sample answer · ${s.form}`}</p>
                <p lang="ga" className="line-clamp-2 text-sm font-semibold text-primary">
                    {s.title}
                </p>
                <p lang="ga" className="line-clamp-2 text-sm text-tertiary">
                    {s.intro}
                </p>
                <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-brand-secondary transition-colors duration-150 group-hover:text-brand-secondary_hover">
                    Read answer
                    <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                </span>
            </div>
        </AriaButton>
    );
};

/* ---------------- the card ---------------- */
/* `hideYear` is for the lists that put the year in a heading above their questions: the year and
   "Deferred exam" badges would only say it twice there. Anywhere a question stands by itself
   (its own page, an exam, homework, saved) the badges are the only place the year is said. */
export const QuestionCard = ({ q, exam: inExam, hideYear }: { q: Question; exam?: { running: boolean }; hideYear?: boolean }) => {
    const saved = useStore((s) => s.saved.includes(q.id));
    const examed = useStore((s) => s.exam.includes(q.id));
    const check = useStore((s) => s.checks[q.id]);
    const printing = usePick((s) => s.printing);
    const picked = usePick((s) => s.ids.includes(q.id));
    const building = usePick((s) => s.building);
    const live = !inExam?.running;
    const samples = samplesOf(q);
    const toggleInExam = () => {
        const at = get().exam.indexOf(q.id);
        const on = toggleExam(q.id);
        toast(on ? `Added to your exam (${get().exam.length})` : "Removed from your exam", on ? undefined : () => { const e = [...get().exam]; e.splice(at, 0, q.id); set("exam", e); });
    };
    // the card's edge turns green while it is ticked for printing, or in the exam being put together
    const chosen = !inExam && ((printing && picked) || (building && examed));

    return (
        <article id={`q-${q.id}`} aria-labelledby={`qt-${q.id}`} className={cx("mb-6 scroll-mt-40 overflow-clip rounded-2xl border-2 bg-primary", chosen ? "border-brand" : "border-secondary")}>
            <header className="flex flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-start">
                <div className="min-w-0 flex-1">
                    <div className={cx("flex flex-wrap items-center gap-2", hideYear && !q.kinds?.length && "hidden")}>
                        {!hideYear && (
                            <Badge size="md" type="pill-color" color="brand">
                                {q.year}
                            </Badge>
                        )}
                        {!hideYear && q.deferred && (
                            <Badge size="md" type="pill-color" color="warning">
                                Deferred exam
                            </Badge>
                        )}
                        {(q.kinds || []).map((k) => (
                            <Badge key={k} size="md" type="pill-color" color="blue">
                                {k}
                            </Badge>
                        ))}
                    </div>
                    <h2 id={`qt-${q.id}`} className={cx("text-lg font-semibold text-primary", !(hideYear && !q.kinds?.length) && "mt-3")}>
                        {/* A title, not a link: the question is already open on the page it sits on. */}
                        {label(q)}
                    </h2>
                    {!inExam && <HomeworkTags q={q} />}
                </div>
                {printing && !inExam ? (
                    /* Choosing what to print: the card's own buttons step aside for one tick box. */
                    <div className="flex shrink-0 items-center">
                        <DuoButton color="secondary" size="sm" iconLeading={picked ? CheckSquare : Square} className={cx(picked && "border-brand bg-brand-primary")} onPress={() => togglePick(q.id)}>
                            {picked ? "Selected" : "Select"}
                        </DuoButton>
                    </div>
                ) : building && !inExam ? (
                    /* Putting an exam together: the other buttons step aside for one green "Add to exam",
                       which turns to a tick once the question is in. The bar at the foot of the screen goes on. */
                    <div className="flex shrink-0 items-center">
                        <DuoButton
                            color={examed ? "secondary" : "primary"}
                            size="sm"
                            iconLeading={examed ? Check : Plus}
                            className={cx(examed && "border-brand bg-brand-primary text-brand-secondary")}
                            onPress={toggleInExam}
                        >
                            {examed ? "Added" : "Add to exam"}
                        </DuoButton>
                    </div>
                ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {!inExam && <SetHomeworkButton q={q} />}
                        {/* Once this question is in an exam that hasn't been made yet. */}
                        {(building || examed) && (
                            <DuoButton
                                color="secondary"
                                size="sm"
                                iconLeading={examed ? Check : Plus}
                                className={cx(examed && "border-brand bg-brand-primary")}
                                onPress={toggleInExam}
                            >
                                {examed ? "In exam" : "Add to exam"}
                            </DuoButton>
                        )}
                        {/* Saving is a small thing: the icon alone, grey until it is on. Every button in this row is the one height, and the two icon buttons are the same square. */}
                        <DuoButton
                            color="secondary"
                            size="sm"
                            iconLeading={Bookmark}
                            ariaLabel={saved ? "Saved for revision. Press to remove" : "Save for revision"}
                            className={cx("w-10.5", saved ? "border-brand bg-brand-primary text-brand-secondary" : "text-quaternary")}
                            onPress={() => {
                                const on = toggleSaved(q.id);
                                toast(on ? "Saved for revision" : "Removed from saved", on ? undefined : () => toggleSaved(q.id));
                            }}
                        />
                        {/* In a list, print asks whether there are more to go with it. Sitting an exam or homework it prints this one, answers and all. */}
                        <DuoButton color="secondary" size="sm" iconLeading={Printer} ariaLabel="Print" className="w-10.5 text-quaternary" onPress={() => (inExam ? printQuestions([q], false, true) : startPrinting(q.id))} />
                    </div>
                )}
            </header>

            <div className="border-t-2 border-secondary px-3 py-5 sm:px-6">
                <div className="mx-auto max-w-full" style={{ width: `calc(${Math.max(...(q.strips?.length ? q.strips.flatMap((s) => s.images) : q.question).map((i) => i.pt || 520)) * K}px + 48px)` }}>
                    <Audio q={q} />
                    <Paper q={q} check={check} />
                </div>
            </div>

            {checkable(q) && live && <CheckBar q={q} check={check} />}
            {live && <Scheme q={q} controls={checkable(q) && !check ? <CheckControls q={q} /> : undefined} />}

            {!inExam && !SOON.samples && samples.length > 0 && (
                <div className="border-t-2 border-secondary px-4 py-5 sm:px-6">
                    <h3 className="mb-3 text-sm font-semibold text-primary">
                        H1 sample answers <span className="font-normal text-tertiary">({samples.length})</span>
                    </h3>
                    <div className="grid snap-x auto-cols-[15rem] grid-flow-col gap-3 overflow-x-auto pb-1 scrollbar-hide">
                        {samples.map((s) => (
                            <SampleCard key={s.letter} q={q} s={s} />
                        ))}
                    </div>
                </div>
            )}
        </article>
    );
};
