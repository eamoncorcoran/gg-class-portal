// My exams: build an exam the way Studyclix does (name it, pick topics or hand-picked questions,
// years, how many, a time limit), keep a list of them, sit one against the clock and get it marked.
// Drawn in the Duolingo desktop manner: chunky bordered cards, bold caps labels, flat colour icons.
import { useEffect, useMemo, useState } from "react";
import { DuoDialog, DuoInput } from "@/components/app/duo-dialog";
import { api } from "@/lib/classroom";
import { ArrowDown, ArrowUp, Check, Clock, Edit03, FileCheck02, FilterLines, Grid01, Play, Plus, Printer, Shuffle01, Trash01, X } from "@/components/app/ic";
import { motion } from "motion/react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoClipboard } from "@/components/app/duo-icons";
import { openScheme, printExam } from "@/components/app/overlays";
import { Empty, Page, PageHeader, reveal } from "@/components/app/page-parts";
import { checkQuestion, QuestionCard } from "@/components/app/question-card";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { D, NAV, type Question, checkable, isAural, navName, paperOf, topic } from "@/lib/data";
import { type SavedExam, get, set, uid, useStore } from "@/lib/store";
import { useLoadedFor } from "@/lib/use-loaded";
import { cx } from "@/utils/cx";
import { NotFound } from "./not-found";

// read when a page renders, never at import time: the data arrives after the bundle
const topicsList = () => NAV.flatMap((g) => g.items.map((i) => i[0])).filter((s) => topic(s) && !topic(s)!.course2027);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------------- marks and minutes per question (by section) ---------------- */

export const marksOf = (q: Question) => {
    if (q.marks) return q.marks; // other subjects carry the marks printed on the paper
    const t = D().topicOf[q.id] || "";
    return t.startsWith("aural") ? 20 : t === "write" ? 100 : t === "reading-comprehension" ? 50 : 30;
};
export const minutesOf = (q: Question) => {
    if (q.marks) return Math.min(60, Math.max(4, Math.round(q.marks * 0.45))); // a Leaving Cert paper runs at roughly 0.4 to 0.5 minutes a mark
    const t = D().topicOf[q.id] || "";
    return t.startsWith("aural") ? 8 : t === "write" ? 75 : t === "reading-comprehension" ? 25 : 20;
};
export const roundMins = (m: number) => (m <= 0 ? 0 : Math.max(5, Math.round(m / 5) * 5));

const Chips = <K extends string>(p: { label: string; value: K; onChange: (k: K) => void; items: { id: K; label: string }[] }) => (
    <Segmented ghost size="sm" itemClassName="px-3 py-2 duo-label tracking-normal" {...p} />
);

/** Every question in the bank, newest first, with the fields the filters need. */
const bank = () =>
    Object.values(D().q)
        .filter((q) => !topic(D().topicOf[q.id])?.course2027)
        .sort((a, b) => b.year - a.year || Number(a.deferred) - Number(b.deferred) || a.title.localeCompare(b.title));

type Filters = { paper: "all" | "Paper 1" | "Paper 2"; topics: string[]; years: number[]; status: "all" | "checked" | "unanswered"; audio: "all" | "listening" | "written"; saved: "all" | "saved" | "unsaved" };
const NONE: Filters = { paper: "all", topics: [], years: [], status: "all", audio: "all", saved: "all" };

/** The filter sheet, as Simple Study lays it out: paper, topic, year, status, audio, saved, then Apply. */
const FilterSheet = ({ open, onClose, value, onApply }: { open: boolean; onClose: () => void; value: Filters; onApply: (f: Filters) => void }) => {
    const [f, setF] = useState(value);
    useEffect(() => setF(value), [value, open]);
    const years = useMemo(() => [...new Set(Object.values(D().q).map((q) => q.year))].sort((a, b) => b - a), []);
    const TOPICS = topicsList();
    const Chip = ({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) => (
        <button type="button" aria-pressed={on} onClick={onPress} className={cx("rounded-xl border-2 px-3 py-1.5 text-sm font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2", on ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary text-secondary hover:bg-primary_hover")}>
            {children}
        </button>
    );
    const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
    const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <div>
            <p className="mb-2 duo-label text-quaternary">{label}</p>
            <div className="flex flex-wrap gap-2">{children}</div>
        </div>
    );
    return (
        <DuoDialog open={open} onClose={onClose} title="Filter questions" className="max-w-2xl">
            <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
                <Group label="Exam paper">
                    {(["all", "Paper 1", "Paper 2"] as const).map((p) => (
                        <Chip key={p} on={f.paper === p} onPress={() => setF({ ...f, paper: p })}>
                            {p === "all" ? "All" : p}
                        </Chip>
                    ))}
                </Group>
                <Group label="Topic">
                    <Chip on={!f.topics.length} onPress={() => setF({ ...f, topics: [] })}>
                        All
                    </Chip>
                    {TOPICS.map((s) => (
                        <Chip key={s} on={f.topics.includes(s)} onPress={() => setF({ ...f, topics: toggle(f.topics, s) })}>
                            {navName(s).replace(/\s*\(.*\)$/, "")}
                        </Chip>
                    ))}
                </Group>
                <Group label="Exam year">
                    <Chip on={!f.years.length} onPress={() => setF({ ...f, years: [] })}>
                        All
                    </Chip>
                    {years.map((y) => (
                        <Chip key={y} on={f.years.includes(y)} onPress={() => setF({ ...f, years: toggle(f.years, y) })}>
                            {y}
                        </Chip>
                    ))}
                </Group>
                <Group label="Question status">
                    {(["all", "checked", "unanswered"] as const).map((p) => (
                        <Chip key={p} on={f.status === p} onPress={() => setF({ ...f, status: p })}>
                            {p === "all" ? "All" : p === "checked" ? "Checked" : "Unanswered"}
                        </Chip>
                    ))}
                </Group>
                <Group label="Audio">
                    {(["all", "listening", "written"] as const).map((p) => (
                        <Chip key={p} on={f.audio === p} onPress={() => setF({ ...f, audio: p })}>
                            {p === "all" ? "All" : p === "listening" ? "Listening" : "Written"}
                        </Chip>
                    ))}
                </Group>
                <Group label="Saved questions">
                    {(["all", "saved", "unsaved"] as const).map((p) => (
                        <Chip key={p} on={f.saved === p} onPress={() => setF({ ...f, saved: p })}>
                            {p === "all" ? "All" : p === "saved" ? "Saved" : "Unsaved"}
                        </Chip>
                    ))}
                </Group>
            </div>
            <div className="mt-5 flex gap-2">
                <DuoButton color="ghost" size="sm" onPress={() => setF(NONE)}>
                    Clear
                </DuoButton>
                <DuoButton className="ml-auto" size="sm" onPress={() => (onApply(f), onClose())}>
                    Apply
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

const applyFilters = (list: Question[], f: Filters, saved: string[], checks: Record<string, unknown>) =>
    list.filter((q) => {
        const slug = D().topicOf[q.id] || "";
        if (f.paper !== "all" && paperOf(slug) !== f.paper) return false;
        if (f.topics.length && !f.topics.some((t) => slug === t || slug.startsWith(t + "-"))) return false;
        if (f.years.length && !f.years.includes(q.year)) return false;
        if (f.status === "checked" && !checks[q.id]) return false;
        if (f.status === "unanswered" && checks[q.id]) return false;
        if (f.audio === "listening" && !isAural(q)) return false;
        if (f.audio === "written" && isAural(q)) return false;
        if (f.saved === "saved" && !saved.includes(q.id)) return false;
        if (f.saved === "unsaved" && saved.includes(q.id)) return false;
        return true;
    });

/** One question in the feed: its line, marks, Add or Remove, then the paper itself and the scheme link. */
const FeedCard = ({ q, on, onToggle, i }: { q: Question; on: boolean; onToggle: () => void; i: number }) => {
    const imgs = q.strips?.length ? q.strips[0].images : q.question;
    const [more, setMore] = useState(false);
    const shown = more ? imgs : imgs.slice(0, 1);
    return (
        <motion.li {...reveal(Math.min(i, 5))} className={cx("overflow-hidden rounded-2xl border-2 bg-primary transition-colors duration-150", on ? "border-brand" : "border-secondary")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <Link to={`/q/${q.id}`} className="min-w-0 flex-1 text-md font-bold text-primary hover:underline max-sm:basis-full sm:truncate">
                    {q.title}
                </Link>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">{marksOf(q)} marks</span>
                {q.audio && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-tertiary">Recording</span>}
                <DuoButton size="xs" color={on ? "secondary" : "primary"} iconLeading={on ? X : Plus} onPress={onToggle} className={cx("max-sm:ml-auto", on && "border-brand bg-brand-primary")}>
                    {on ? "Remove" : "Add"}
                </DuoButton>
            </div>
            <div className="border-t-2 border-secondary bg-secondary_subtle px-4 py-3">
                <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border-2 border-secondary bg-white">
                    {shown.map((im, n) => (
                        <img key={n} src={im.src} width={im.w} height={im.h} loading="lazy" alt="" className="block h-auto w-full" />
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {imgs.length > 1 && (
                        <DuoButton color="ghost" size="xs" onPress={() => setMore(!more)}>
                            {more ? "Show less" : `Show the whole question (${imgs.length} parts)`}
                        </DuoButton>
                    )}
                    {q.markingScheme.length > 0 && (
                        <DuoButton color="ghost" size="xs" iconLeading={FileCheck02} onPress={() => openScheme(q)}>
                            View marking scheme
                        </DuoButton>
                    )}
                </div>
            </div>
        </motion.li>
    );
};

/* ---------------- the builder, the way Simple Study lays it out ---------------- */

export const NewExamPage = () => {
    const { id } = useParams();
    const [sp] = useSearchParams();
    const nav = useNavigate();
    const existing = useStore((s) => s.exams.find((e) => e.id === id));
    const picked = useStore((s) => s.exam);
    const saved = useStore((s) => s.saved);
    const checks = useStore((s) => s.checks);

    const [name, setName] = useState(existing?.name ?? "");
    const [ids, setIds] = useState<string[]>(existing?.ids ?? (sp.get("from") === "picked" ? picked.filter((x) => D().q[x]) : []));
    const [note, setNote] = useState(existing?.instructions ?? "");
    const [showNote, setShowNote] = useState(!!existing?.instructions);
    const [timer, setTimer] = useState<"auto" | "0" | "30" | "60" | "90" | "120">(existing ? (existing.mins ? "auto" : "0") : "auto");
    const [filters, setFilters] = useState<Filters>(NONE);
    const [filterOpen, setFilterOpen] = useState(false);
    const [view, setView] = useState<"list" | "chosen">("list");
    const [limit, setLimit] = useState(30);
    const [tried, setTried] = useState(false);

    const all = useMemo(bank, []);
    const feed = useMemo(() => applyFilters(all, filters, saved, checks), [all, filters, saved, checks]);
    const chosen = ids.map((x) => D().q[x]).filter(Boolean) as Question[];
    const marks = chosen.reduce((n, q) => n + marksOf(q), 0);
    const suggested = roundMins(chosen.reduce((n, q) => n + minutesOf(q), 0));
    const mins = timer === "auto" ? suggested : +timer;
    const topicsIn = [...new Set(chosen.map((q) => D().topicOf[q.id]))];
    const active = Object.entries(filters).filter(([k, v]) => (Array.isArray(v) ? v.length : v !== "all") && k).length;
    const ok = name.trim() && chosen.length > 0;

    const toggle = (qid: string) => setIds(ids.includes(qid) ? ids.filter((x) => x !== qid) : [...ids, qid]);
    const move = (i: number, d: number) => {
        const a = [...ids];
        [a[i], a[i + d]] = [a[i + d], a[i]];
        setIds(a);
    };
    const addRandom = (n: number) => {
        const pool = feed.filter((q) => !ids.includes(q.id)).map((q) => q.id);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        setIds([...ids, ...pool.slice(0, n)]);
        toast(`Added ${Math.min(n, pool.length)} questions`);
    };
    const save = (share = false) => {
        setTried(true);
        if (!ok) return;
        const exam: SavedExam = { id: existing?.id ?? uid(), name: name.trim(), ids, mins, topics: topicsIn, shuffle: false, created: existing?.created ?? Date.now(), instructions: note.trim() || undefined, result: existing?.result };
        set("exams", [exam, ...get().exams.filter((e) => e.id !== exam.id)]);
        if (sp.get("from") === "picked") set("exam", []);
        toast(existing ? "Exam updated" : "Exam saved");
        nav(`/exam/${exam.id}${share ? "?share=1" : ""}`);
    };

    const Stat = ({ icon: I, children }: { icon: React.FC<{ className?: string }>; children: React.ReactNode }) => (
        <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold text-secondary">
            <I aria-hidden="true" className="size-4.5 text-fg-brand-primary" />
            {children}
        </div>
    );

    return (
        <Page wide>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="min-w-0 flex-1">
                    <p className="mb-1.5 duo-label text-quaternary">
                        Exam title <span className="text-error-primary">*</span>
                    </p>
                    <DuoInput ariaLabel="Exam title" value={name} onChange={setName} placeholder="e.g. Listening mock, Christmas revision" maxLength={60} autoFocus={!existing} className={cx(tried && !name.trim() && "border-error-500")} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <DuoButton color="ghost" href="/exam" className="max-sm:order-last max-sm:w-full">
                        Cancel
                    </DuoButton>
                    <DuoButton onPress={() => save()} isDisabled={!ok && tried} className="max-sm:flex-1">
                        {existing ? "Save changes" : "Save exam"}
                    </DuoButton>
                </div>
            </div>
            {tried && !ok && <p className="mt-2 text-sm font-semibold text-error-primary">{!name.trim() ? "Give the exam a title." : "Add at least one question."}</p>}

            {/* the strip: what you have so far */}
            <div className="mt-5 grid grid-cols-2 divide-secondary rounded-2xl border-2 border-secondary bg-primary sm:grid-cols-4 sm:divide-x-2">
                <Stat icon={FileCheck02}>{plural(chosen.length, "question")}</Stat>
                <Stat icon={Grid01}>{plural(topicsIn.length, "topic")}</Stat>
                <Stat icon={Clock}>{mins ? `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)}h ` : ""}${mins % 60 ? `${mins % 60}m` : ""}`.trim() : "No timer"}</Stat>
                <Stat icon={Check}>{marks} marks</Stat>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-2">
                    <span className="duo-label text-quaternary">Timer</span>
                    <Chips
                        label="Time limit"
                        value={timer}
                        onChange={setTimer}
                        items={[
                            { id: "auto", label: suggested ? `Suggested ${suggested}m` : "Suggested" },
                            { id: "0", label: "None" },
                            { id: "30", label: "30m" },
                            { id: "60", label: "60m" },
                            { id: "90", label: "90m" },
                            { id: "120", label: "2h" },
                        ]}
                    />
                </div>
                {showNote ? null : (
                    <DuoButton color="ghost" size="xs" iconLeading={Plus} onPress={() => setShowNote(true)}>
                        Add instructions for students
                    </DuoButton>
                )}
            </div>
            {showNote && (
                <div className="mt-3">
                    <DuoInput ariaLabel="Instructions" multiline value={note} onChange={setNote} placeholder="Printed under the title and shown to a class you share it with. e.g. Answer every question. Listening: play the recording once only." maxLength={600} />
                </div>
            )}

            {/* the feed */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-primary">{view === "list" ? `${feed.length} questions available` : `${plural(chosen.length, "question")} chosen`}</h2>
                <div className="ml-auto flex items-center gap-2">
                    {view === "list" && (
                        <DuoButton color="ghost" size="sm" iconLeading={Shuffle01} onPress={() => addRandom(10)} isDisabled={!feed.some((q) => !ids.includes(q.id))}>
                            Add 10 at random
                        </DuoButton>
                    )}
                    <DuoButton color="secondary" size="sm" iconLeading={FilterLines} onPress={() => setFilterOpen(true)} className={cx(active && "border-brand bg-brand-primary")}>
                        Filters{active ? ` · ${active}` : ""}
                    </DuoButton>
                </div>
            </div>

            {view === "list" ? (
                <>
                    <ul className="mt-4 flex flex-col gap-4">
                        {feed.slice(0, limit).map((q, i) => (
                            <FeedCard key={q.id} q={q} i={i} on={ids.includes(q.id)} onToggle={() => toggle(q.id)} />
                        ))}
                    </ul>
                    {feed.length > limit && (
                        <div className="mt-5 flex justify-center">
                            <DuoButton color="secondary" onPress={() => setLimit(limit + 30)}>
                                Show {Math.min(30, feed.length - limit)} more
                            </DuoButton>
                        </div>
                    )}
                    {!feed.length && <p className="mt-6 rounded-2xl border-2 border-dashed border-secondary p-8 text-center text-sm text-tertiary">No questions match these filters.</p>}
                </>
            ) : chosen.length ? (
                <ol className="mt-4 overflow-hidden rounded-2xl border-2 border-secondary bg-primary">
                    {chosen.map((q, i) => (
                        <li key={q.id} className="flex items-center gap-3 border-b-2 border-secondary py-2.5 pr-3 pl-4 last:border-b-0">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white tabular-nums">{i + 1}</span>
                            <Link to={`/q/${q.id}`} className="min-w-0 flex-1 truncate text-sm font-bold text-primary hover:underline">
                                {q.title}
                            </Link>
                            <span className="text-xs font-bold text-quaternary tabular-nums">{marksOf(q)} marks</span>
                            <ButtonUtility color="tertiary" size="xs" icon={ArrowUp} tooltip="Move up" isDisabled={!i} onPress={() => move(i, -1)} />
                            <ButtonUtility color="tertiary" size="xs" icon={ArrowDown} tooltip="Move down" isDisabled={i === chosen.length - 1} onPress={() => move(i, 1)} />
                            <ButtonUtility color="tertiary" size="xs" icon={Trash01} tooltip="Remove" onPress={() => toggle(q.id)} />
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="mt-6 rounded-2xl border-2 border-dashed border-secondary p-8 text-center text-sm text-tertiary">Nothing chosen yet. Press Add on any question in the list.</p>
            )}

            {/* the floating toggle, as on Simple Study */}
            <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-5">
                <Segmented
                    size="md"
                    label="View"
                    value={view}
                    onChange={setView}
                    items={[
                        { id: "list", label: "Question list" },
                        { id: "chosen", label: `Chosen · ${chosen.length}` },
                    ]}
                    className="shadow-xl"
                    itemClassName="px-5 py-2.5 duo-label tracking-normal"
                />
            </div>
            <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} value={filters} onApply={(f) => (setFilters(f), setLimit(30))} />
        </Page>
    );
};

/* ---------------- the list ---------------- */

const examMeta = (e: SavedExam) => `${plural(e.ids.length, "question")} · ${e.mins ? `${e.mins} min` : "no timer"}`;

const ExamRow = ({ e }: { e: SavedExam }) => {
    const nav = useNavigate();
    useLoadedFor(e.ids);
    const qs = e.ids.map((id) => D().q[id]).filter(Boolean);
    const pct = e.result && e.result.total ? Math.round((100 * e.result.got) / e.result.total) : null;
    return (
        <li className="flex flex-col gap-4 rounded-2xl border-2 border-secondary bg-primary p-5 sm:flex-row sm:items-center sm:gap-5">
            <DuoClipboard aria-hidden="true" className="size-12 shrink-0" />
            <div className="min-w-0 flex-1">
                <Link to={`/exam/${e.id}`} className="text-lg font-bold text-primary hover:underline">
                    {e.name}
                </Link>
                <p className="text-sm text-tertiary">
                    {examMeta(e)}
                    {e.topics.length ? ` · ${e.topics.map((s) => navName(s).replace(/\s*\(.*\)$/, "")).join(", ")}` : " · hand-picked"}
                </p>
                <p className="mt-1.5">
                    {e.result ? (
                        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", pct !== null && pct >= 70 ? "bg-success-primary text-success-primary" : pct !== null && pct >= 40 ? "bg-warning-primary text-warning-primary" : "bg-error-primary text-error-primary")}>
                            <Check aria-hidden="true" className="size-3.5 stroke-[3px]" />
                            {e.result.got} / {e.result.total} marks{pct !== null ? ` (${pct}%)` : ""}
                        </span>
                    ) : (
                        <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-tertiary">Not sat yet</span>
                    )}
                </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <ButtonUtility color="tertiary" size="sm" icon={Printer} tooltip="Print" onPress={() => printExam(e, qs)} />
                <ButtonUtility color="tertiary" size="sm" icon={Edit03} tooltip="Edit" onPress={() => nav(`/exam/${e.id}/edit`)} />
                <ButtonUtility
                    color="tertiary"
                    size="sm"
                    icon={Trash01}
                    tooltip="Delete"
                    onPress={() => {
                        const was = get().exams;
                        set("exams", was.filter((x) => x.id !== e.id));
                        toast("Exam deleted", () => set("exams", was));
                    }}
                />
                <DuoButton size="sm" href={`/exam/${e.id}`} className="max-sm:w-full sm:ml-1">
                    {e.result ? "Sit again" : "Start"}
                </DuoButton>
            </div>
        </li>
    );
};

export const MyExamsPage = () => {
    const exams = useStore((s) => s.exams);
    const run = useStore((s) => s.examRun);
    const picked = useStore((s) => s.exam.length);
    if (run) return <ExamRunView />;
    return (
        <Page>
            <PageHeader
                title="My exams"
                sub="Build an exam from any mix of topics and years, set the clock, then get every answer marked against the scheme."
                actions={
                    <DuoButton href="/exam/new" iconLeading={Plus}>
                        Create a new exam
                    </DuoButton>
                }
            />
            {picked > 0 && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-brand bg-brand-primary px-5 py-4">
                    <p className="text-sm font-bold text-brand-secondary">You have {plural(picked, "hand-picked question")} waiting.</p>
                    <DuoButton size="sm" color="secondary" href="/exam/new?from=picked">
                        Make an exam from them
                    </DuoButton>
                </div>
            )}
            {exams.length ? (
                <ul className="flex flex-col gap-4">
                    {exams.map((e) => (
                        <ExamRow key={e.id} e={e} />
                    ))}
                </ul>
            ) : (
                <Empty icon={Clock} title="No exams yet" note="Create one from the topics you want to test, or press Add to exam on questions as you browse and build it from those.">
                    <DuoButton href="/exam/new">
                        Create your first exam
                    </DuoButton>
                </Empty>
            )}
        </Page>
    );
};

/* ---------------- one exam: order, start, sit ---------------- */

export const ExamDetailPage = () => {
    const { id = "" } = useParams();
    const e = useStore((s) => s.exams.find((x) => x.id === id));
    const run = useStore((s) => s.examRun);
    useLoadedFor(e?.ids ?? []);
    if (run && run.examId === id) return <ExamRunView />;
    if (!e) return <NotFound />;
    const qs = e.ids.map((qid) => D().q[qid]).filter(Boolean) as Question[];

    const update = (patch: Partial<SavedExam>) => set("exams", get().exams.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));
    const move = (i: number, d: number) => {
        const ids = [...e.ids];
        [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
        update({ ids });
    };
    const start = () => {
        const s = get();
        const answers = { ...s.answers }, checks = { ...s.checks };
        e.ids.forEach((qid) => (delete answers[qid], delete checks[qid]));
        set("answers", answers);
        set("checks", checks);
        set("examRun", { end: e.mins ? Date.now() + e.mins * 60000 : 0, ids: [...e.ids], done: false, examId: e.id });
        scrollTo(0, 0);
    };

    return (
        <Page>
            <PageHeader
                kicker="My exams"
                title={e.name}
                sub={`${examMeta(e)}${e.result ? ` · last result ${e.result.got} / ${e.result.total} marks` : ""}`}
                actions={
                    <div className="flex items-center gap-2">
                        <ButtonUtility color="tertiary" size="sm" icon={Printer} tooltip="Print" onPress={() => printExam(e, qs)} />
                        <DuoButton color="secondary" size="sm" href={`/exam/${e.id}/edit`} iconLeading={Edit03}>
                            Edit
                        </DuoButton>
                        <DuoButton size="sm" onPress={start} iconLeading={Play}>
                            {e.result ? "Sit again" : "Start exam"}
                        </DuoButton>
                    </div>
                }
            />
            {e.instructions && (
                <p className="mb-5 rounded-2xl bg-secondary px-5 py-4 text-sm whitespace-pre-wrap text-secondary">
                    <span className="duo-label text-quaternary">Instructions · </span>
                    {e.instructions}
                </p>
            )}
            <section aria-labelledby="eq" className="overflow-hidden rounded-2xl border-2 border-secondary bg-primary">
                <div className="flex items-center justify-between border-b-2 border-secondary px-5 py-3.5">
                    <h2 id="eq" className="duo-label text-quaternary">
                        Questions in order
                    </h2>
                    <span className="text-sm font-bold text-tertiary tabular-nums">{qs.length}</span>
                </div>
                <ol className="divide-y-2 divide-secondary">
                    {qs.map((q, i) => (
                        <li key={q.id} className="flex items-center gap-3 py-2.5 pr-3 pl-5">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary tabular-nums">{i + 1}</span>
                            <Link to={`/q/${q.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-primary hover:underline">
                                {q.title} <span className="font-normal text-quaternary">· {q.year}{q.deferred ? " deferred" : ""}</span>
                            </Link>
                            <ButtonUtility color="tertiary" size="xs" icon={ArrowUp} tooltip="Move up" isDisabled={!i} onPress={() => move(i, -1)} />
                            <ButtonUtility color="tertiary" size="xs" icon={ArrowDown} tooltip="Move down" isDisabled={i === qs.length - 1} onPress={() => move(i, 1)} />
                            <ButtonUtility
                                color="tertiary"
                                size="xs"
                                icon={Trash01}
                                tooltip="Remove"
                                onPress={() => {
                                    const was = e.ids;
                                    update({ ids: was.filter((x) => x !== q.id) });
                                    toast("Question removed", () => update({ ids: was }));
                                }}
                            />
                        </li>
                    ))}
                </ol>
            </section>
        </Page>
    );
};

const Timer = ({ end, done, onEnd }: { end: number; done: boolean; onEnd: () => void }) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (done || !end) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [done, end]);
    const left = end ? Math.max(0, end - now) : 1;
    useEffect(() => {
        if (end && !done && !left) onEnd();
    }, [left, done, end]);
    return (
        <span role="timer" aria-label="Time left" className="text-display-xs font-bold text-white tabular-nums">
            {done ? "Finished" : !end ? "No timer" : `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`}
        </span>
    );
};

/** Sitting an exam: a dark bar with the clock, then every question card in order. Homework
 * (examId "hw:<assignment>") is handed in to the class server once it is marked. */
export const ExamRunView = ({ onClosed }: { onClosed?: () => void } = {}) => {
    const run = useStore((s) => s.examRun)!;
    const hw = run.examId?.startsWith("hw:") ? run.examId.slice(3) : null;
    const [handing, setHanding] = useState(false);
    const checks = useStore((s) => s.checks);
    const exam = useStore((s) => s.exams.find((x) => x.id === run.examId));
    useLoadedFor(run.ids);
    const qs = run.ids.map((id) => D().q[id]).filter(Boolean) as Question[];
    const rs = qs.flatMap((q) => Object.values(checks[q.id]?.by || {}));
    const total = rs.reduce((n, r) => n + (r.max || 0), 0), got = rs.reduce((n, r) => n + (r.awarded || 0), 0);

    const finish = async () => {
        set("examRun", { ...run, done: true });
        await Promise.all(run.ids.filter((id) => checkable(D().q[id])).map(checkQuestion));
        const c = get().checks;
        const all = qs.flatMap((q) => Object.values(c[q.id]?.by || {}));
        const t = all.reduce((n, r) => n + (r.max || 0), 0), g = all.reduce((n, r) => n + (r.awarded || 0), 0);
        if (hw) {
            setHanding(true);
            const results = Object.fromEntries(qs.map((q) => [q.id, Object.values(c[q.id]?.by || {})]));
            const answers = Object.fromEntries(qs.map((q) => [q.id, get().answers[q.id] || {}]));
            await api.submit(hw, { answers, results, got: g, total: t, done: true }).then(() => toast("Marked and handed in"), (e) => toast(`Marked, but not handed in: ${e.message}`));
            setHanding(false);
        } else {
            if (run.examId) set("exams", get().exams.map((x) => (x.id === run.examId ? { ...x, result: { got: g, total: t, at: Date.now() } } : x)));
            toast("Exam marked");
        }
    };

    return (
        <Page>
            <div className="sticky top-20 z-10 mb-6 flex items-center gap-4 rounded-2xl bg-primary-solid py-2.5 pr-2.5 pl-5 shadow-lg">
                <Clock aria-hidden="true" className="size-5 text-white/70" />
                <Timer end={run.end} done={run.done} onEnd={finish} />
                <p className="flex-1 truncate text-sm font-semibold text-white/70 max-sm:hidden">
                    {exam?.name ?? (hw ? "Homework" : "Exam")} · {plural(qs.length, "question")}
                    {run.done && total ? ` · ${got} / ${total} marks` : ""}
                </p>
                {run.done ? (
                    <DuoButton size="sm" color="secondary" isDisabled={handing} onPress={() => (set("examRun", null), onClosed?.())} className="max-sm:ml-auto">
                        {handing ? "Handing in…" : "Close exam"}
                    </DuoButton>
                ) : (
                    <DuoButton size="sm" onPress={finish} className="max-sm:ml-auto">
                        Finish and mark
                    </DuoButton>
                )}
            </div>
            {qs.map((q) => (
                <QuestionCard key={q.id} q={q} exam={{ running: !run.done }} />
            ))}
        </Page>
    );
};
