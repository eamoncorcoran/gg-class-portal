// Things that sit above the page: the marking scheme in its own movable window, the sample answer
// reader (an Untitled UI modal), and printing.
import { useEffect, useRef, useState } from "react";
import { CheckCircle, FileCheck02, InfoCircle, Minimize01, Expand01, Printer, X } from "@/components/app/ic";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Toggle } from "@/components/base/toggle/toggle";
import { type Question, D, navName, samplesOf, shortParts } from "@/lib/data";
import { get, set, useStore } from "@/lib/store";
import { cx } from "@/utils/cx";
import { SchemeSheet } from "./question-card";

let showScheme: (q: Question | null) => void = () => {};
let showSample: (v: { qid: string; letter: string } | null) => void = () => {};
export const openScheme = (q: Question) => showScheme(q);
export const openSample = (qid: string, letter: string) => showSample({ qid, letter });

/** The marking scheme in a window you can drag beside the question and resize; Escape closes it. */
export const SchemeWindow = () => {
    const [q, setQ] = useState<Question | null>(null);
    const [min, setMin] = useState(false);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const from = useRef<Element | null>(null);
    const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
    useEffect(() => {
        showScheme = (x) => {
            from.current = document.activeElement;
            setQ(x);
            setMin(false);
        };
    }, []);
    useEffect(() => {
        if (q) ref.current?.focus();
    }, [q]);
    if (!q) return null;
    const close = () => {
        setQ(null);
        (from.current as HTMLElement | null)?.focus?.();
    };

    return (
        <div
            ref={ref}
            role="dialog"
            aria-modal="false"
            aria-labelledby="scheme-title"
            tabIndex={-1}
            onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), close())}
            style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
            className={cx(
                "fixed z-40 flex flex-col overflow-hidden rounded-xl bg-secondary_subtle shadow-xl ring-1 ring-secondary_alt outline-focus-ring duration-200 animate-in fade-in slide-in-from-bottom-2 focus-visible:outline-2",
                "inset-x-2 bottom-20 h-[60vh] lg:inset-x-auto lg:top-24 lg:right-6 lg:bottom-auto lg:h-[min(76vh,820px)] lg:w-[min(600px,calc(100vw-48px))] lg:min-w-80 lg:resize",
                min && "h-auto! lg:h-auto! lg:resize-none",
            )}
        >
            <div
                className="flex shrink-0 cursor-default items-center gap-2 border-b-2 border-secondary bg-primary py-1.5 pr-1.5 pl-4 select-none lg:cursor-move"
                onPointerDown={(e) => {
                    if ((e.target as Element).closest("button") || innerWidth < 1024) return;
                    const r = ref.current!.getBoundingClientRect();
                    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    setPos({ x: Math.max(0, Math.min(innerWidth - 160, d.ox + e.clientX - d.sx)), y: Math.max(0, Math.min(innerHeight - 56, d.oy + e.clientY - d.sy)) });
                }}
                onPointerUp={() => (drag.current = null)}
            >
                <FileCheck02 aria-hidden="true" className="size-5 shrink-0 text-fg-quaternary" />
                <p id="scheme-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">
                    Marking scheme · {q.title}
                </p>
                <ButtonUtility color="tertiary" size="xs" icon={min ? Expand01 : Minimize01} tooltip={min ? "Expand" : "Minimise"} tooltipPlacement="bottom" onPress={() => setMin(!min)} />
                <ButtonUtility color="tertiary" size="xs" icon={X} tooltip="Close" tooltipPlacement="bottom" onPress={close} />
            </div>
            {!min && (
                <div className="flex-1 overflow-auto overscroll-contain p-3 sm:p-4">
                    <SchemeSheet q={q} />
                </div>
            )}
        </div>
    );
};

/** The H1 sample answer, as a long-form reader with examiner notes. */
export const SampleModal = () => {
    const [v, setV] = useState<{ qid: string; letter: string } | null>(null);
    const prefs = useStore((s) => s.artPrefs);
    useEffect(() => {
        showSample = setV;
    }, []);
    const q = v && D().q[v.qid];
    const r = q && samplesOf(q).find((x) => x.letter === v!.letter);
    const a = r?.assessment;
    const total = a ? a.stil + a.abhar + a.gaeilge : 0;
    const grade = total >= 90 ? "H1" : total >= 80 ? "H2" : total >= 70 ? "H3" : "H4";

    const Note = ({ title, children, good, icon }: { title: string; children: React.ReactNode; good?: boolean; icon?: boolean }) => (
        <aside className={cx("my-4 rounded-r-lg border-l-2 px-5 py-4", good ? "border-brand bg-brand-primary" : "border-primary bg-secondary")}>
            <p className="mb-1.5 text-xs font-medium text-quaternary">Examiner comment</p>
            <h4 className="mb-1.5 flex items-center gap-2 text-md font-semibold text-primary">
                {icon && <CheckCircle aria-hidden="true" className="size-5 text-fg-brand-primary" />}
                {title}
            </h4>
            <div className="space-y-2.5 text-md text-secondary">{children}</div>
        </aside>
    );

    return (
        <ModalOverlay isOpen={!!r} onOpenChange={(o) => !o && setV(null)} isDismissable>
            <Modal className="max-w-4xl sm:rounded-3xl max-sm:h-dvh max-sm:max-h-dvh! max-sm:rounded-none">
                <Dialog aria-label={r?.title || "Sample answer"} className="max-sm:h-dvh">
                    {r && q && a && (
                        <div id="art">
                            <div className="sticky top-0 z-10 flex items-center gap-1 border-b-2 border-secondary bg-primary/95 py-2.5 pr-2.5 pl-6 backdrop-blur">
                                <p className="flex flex-1 items-center gap-2 text-sm font-semibold text-secondary">
                                    <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs font-semibold text-brand-secondary">{grade}</span>
                                    Sample answer
                                </p>
                                <ButtonUtility
                                    color="tertiary"
                                    size="sm"
                                    icon={Printer}
                                    tooltip="Print"
                                    tooltipPlacement="bottom"
                                    onPress={() => printHTML(`<div class="pq">${document.getElementById("art-body")?.innerHTML || ""}</div>`)}
                                />
                                <ButtonUtility color="tertiary" size="sm" icon={X} tooltip="Close" tooltipPlacement="bottom" slot="close" onPress={() => setV(null)} />
                            </div>
                            <div id="art-body" className="mx-auto max-w-3xl px-5 pt-8 pb-14 sm:px-8">
                                <h1 lang="ga" className="text-display-xs font-semibold text-primary sm:text-display-sm">
                                    {r.title} | {r.form}
                                </h1>
                                <p className="mt-1 text-xl font-semibold text-brand-secondary">{grade} sample answer</p>
                                <p className="mt-3 text-sm text-tertiary">Model answer with examiner notes · {r.words} words</p>

                                <h3 className="mt-10 text-lg font-semibold text-primary">Question</h3>
                                <p className="mb-4 border-b-2 border-secondary pb-3 text-sm text-tertiary">
                                    {q.title} · title ({r.letter})
                                </p>
                                <div className="rounded-xl bg-white p-4 shadow-xs ring-1 ring-secondary">
                                    {q.question.map((i, n) => (
                                        <img key={n} src={i.src} alt={`Exam question, ${q.title}`} className="w-full" />
                                    ))}
                                </div>

                                <div className="mt-6 mb-4 flex flex-wrap gap-x-8 gap-y-4 rounded-xl border border-secondary px-5 py-4">
                                    <Toggle label="Examiner comments" isSelected={prefs.comments} onChange={(c) => set("artPrefs", { ...get().artPrefs, comments: c })} />
                                    <Toggle label="English translations" isSelected={prefs.gloss} onChange={(c) => set("artPrefs", { ...get().artPrefs, gloss: c })} />
                                </div>

                                {prefs.comments && (
                                    <>
                                        <Note title="How to approach this question">
                                            <p>{r.approach}</p>
                                            <ul className="list-disc space-y-1 pl-5">
                                                {r.approach_points.map((x) => (
                                                    <li key={x}>{x}</li>
                                                ))}
                                            </ul>
                                        </Note>
                                        <Note title="Good to know">
                                            <p>{r.good_to_know}</p>
                                        </Note>
                                    </>
                                )}

                                <h3 className="mt-10 text-lg font-semibold text-primary">Sample answer to title ({r.letter})</h3>
                                {r.paragraphs.map((p, i) => (
                                    <div key={i}>
                                        <p lang="ga" className="mt-5 text-lg leading-relaxed text-primary sm:px-6">
                                            {p.chunks.map((c, j) => (
                                                <span key={j}>
                                                    {c.highlight ? <mark className="rounded-sm bg-brand-secondary px-0.5 text-primary">{c.ga}</mark> : c.ga}
                                                    {c.en && prefs.gloss && (
                                                        <span lang="en" className="text-quaternary italic">
                                                            {" "}
                                                            ({c.en})
                                                        </span>
                                                    )}{" "}
                                                </span>
                                            ))}
                                        </p>
                                        {prefs.comments && (
                                            <Note title={p.comment_heading} good icon>
                                                <p>{p.comment}</p>
                                            </Note>
                                        )}
                                    </div>
                                ))}

                                <Note title="Overall assessment">
                                    <p>
                                        <b className="font-semibold text-primary">Ionramháil ábhair</b>
                                        <br />
                                        {a.abhar_comment}
                                    </p>
                                    <p>
                                        <b className="font-semibold text-primary">Cumas Gaeilge</b>
                                        <br />
                                        {a.gaeilge_comment}
                                    </p>
                                    <dl className="mt-3 grid grid-cols-3 gap-3 border-t-2 border-secondary pt-3 text-sm">
                                        {[
                                            ["Stíl", a.stil, 5],
                                            ["Ábhar", a.abhar, 15],
                                            ["Gaeilge", a.gaeilge, 80],
                                        ].map(([k, x, m]) => (
                                            <div key={k as string}>
                                                <dt className="text-tertiary">{k}</dt>
                                                <dd className="text-lg font-semibold text-primary tabular-nums">
                                                    {x}
                                                    <span className="text-sm font-normal text-tertiary">/{m}</span>
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                    <p className="font-semibold text-primary">
                                        Overall {total}/100 = {grade}
                                    </p>
                                </Note>

                                <p className="mt-6 flex gap-2.5 rounded-lg border border-secondary px-4 py-3 text-sm text-tertiary">
                                    <InfoCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                                    This sample answer and its examiner notes were drafted with AI and have not yet been reviewed by a teacher.
                                </p>
                            </div>
                        </div>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};

/* ---------------- print ---------------- */
export function printHTML(html: string) {
    const root = document.getElementById("print-root")!;
    root.innerHTML = html;
    const imgs = [...root.querySelectorAll("img")];
    imgs.forEach((i) => (i.loading = "eager"));
    Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r))))).then(() => window.print());
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const questionsHTML = (list: Question[], withScheme: boolean, withAnswers: boolean) => {
    const answers = get().answers;
    return (
        list
            .map(
                (q) => `<div class="pq"><h2>${esc(q.title)}</h2>${(q.strips?.length
                    ? q.strips.flatMap((s) => [
                          ...s.images.map((i) => `<img src="${i.src}">`),
                          ...(withAnswers ? (s.parts || []).filter((p) => shortParts(q.id).some((x) => x.id === p)).map((p) => `<div class="pbox">${esc(answers[q.id]?.[p] || "")}</div>`) : []),
                      ])
                    : q.question.map((i) => `<img src="${i.src}">`)
                ).join("")}${withScheme && q.markingScheme.length ? `<div class="pms"><h3>Marking scheme</h3>${q.markingScheme.map((i) => `<img src="${i.src}">`).join("")}</div>` : ""}</div>`,
            )
            .join("")
    );
};
export function printQuestions(list: Question[], withScheme: boolean, withAnswers: boolean) {
    printHTML(questionsHTML(list, withScheme, withAnswers));
}
/** An exam on paper: a cover with its name, what is in it, the teacher's instructions and lines for the student's name, then the questions. */
export function printExam(e: { name: string; mins: number; topics: string[]; instructions?: string }, qs: Question[]) {
    const meta = [`${qs.length} question${qs.length === 1 ? "" : "s"}`, e.mins ? `${e.mins} minutes` : "No time limit", e.topics.length ? e.topics.map((s) => navName(s)).join(", ") : "Hand-picked questions"];
    const years = [...new Set(qs.map((q) => q.year))].sort();
    printHTML(
        `<div class="pq pcover"><p class="pk">Leaving Certificate · Irish · Higher Level</p><h1>${esc(e.name)}</h1><p class="pmeta">${meta.map(esc).join(" · ")}${years.length ? ` · ${years[0]}${years.length > 1 ? ` to ${years[years.length - 1]}` : ""}` : ""}</p>` +
            (e.instructions ? `<div class="pins"><h3>Instructions</h3><p>${esc(e.instructions).replace(/\n/g, "<br>")}</p></div>` : "") +
            `<div class="plines"><p>Ainm: <span></span></p><p>Rang: <span></span></p><p>Dáta: <span></span></p></div>` +
            `<ol class="plist">${qs.map((q) => `<li>${esc(q.title)}</li>`).join("")}</ol></div>` +
            questionsHTML(qs, false, false),
    );
}
