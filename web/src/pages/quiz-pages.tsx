// Quizzes in the Duolingo manner: build one (tiles to pick from, or type the answer), play it with a
// progress bar, a Check button and the green or red footer, and share it with a class as homework.
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Edit03, Play, Plus, Share07, Trash01, X } from "@/components/app/ic";
import { AnimatePresence, motion } from "motion/react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useAccount } from "@/components/app/account";
import { DuoButton, DuoProgress } from "@/components/app/duo";
import { DuoDialog, DuoInput, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSparkle, DuoTarget } from "@/components/app/duo-icons";
import { DuoSelect } from "@/components/app/duo-select";
import { Page, PageHeader, reveal } from "@/components/app/page-parts";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { api, type ClassRow } from "@/lib/classroom";
import { type QuizItem, SAMPLE_ITEMS, blankItem, isRight, itemOk, tilesFor } from "@/lib/quiz";
import { type Quiz, get, set, uid, useStore } from "@/lib/store";
import { BANK, type BankQuiz, bankQuiz } from "@/lib/quiz-bank";
import { NAV } from "@/lib/data";
import { topicIcon } from "@/components/app/app-sidebar";
import { cx } from "@/utils/cx";
import { NotFound } from "./not-found";
import { BrilliantLesson } from "./lesson-player";

export type QuizResults = Record<string, { given: string; right: boolean }>;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------------- the player ---------------- */

/** One quiz, start to finish: progress on top, the question, the answer, Check, the verdict footer, then a summary. */
export const QuizPlayer = ({ items, title, onFinish, onClose, closeHref }: { items: QuizItem[]; title: string; onFinish: (r: QuizResults, got: number) => void; onClose?: () => void; closeHref?: string }) => {
    const [i, setI] = useState(0);
    const [pick, setPick] = useState("");
    const [typed, setTyped] = useState("");
    const [state, setState] = useState<"ask" | "right" | "wrong">("ask");
    const [results, setResults] = useState<QuizResults>({});
    const item = items[i];
    const over = i >= items.length;
    const given = item?.type === "choose" ? pick : typed;
    const tiles = useMemo(() => (item?.type === "choose" ? tilesFor(item) : []), [item]);

    const check = () => {
        if (!given.trim()) return;
        const right = isRight(item, given);
        setResults((r) => ({ ...r, [item.id]: { given, right } }));
        setState(right ? "right" : "wrong");
    };
    const next = () => {
        setState("ask");
        setPick("");
        setTyped("");
        setI(i + 1);
    };
    const got = Object.values(results).filter((r) => r.right).length;
    useEffect(() => {
        if (over) onFinish(results, got);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [over]);
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (over) return;
            if (e.key === "Enter") (state === "ask" ? check : next)();
            else if (state === "ask" && item.type === "choose" && /^[1-9]$/.test(e.key) && tiles[+e.key - 1]) setPick(tiles[+e.key - 1]);
        };
        addEventListener("keydown", key);
        return () => removeEventListener("keydown", key);
    });

    if (over) {
        const pct = Math.round((100 * got) / items.length);
        return (
            <div className="mx-auto max-w-xl py-10 text-center">
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
                    <DuoTarget aria-hidden="true" className="mx-auto size-28" />
                </motion.div>
                <h2 className="mt-6 text-display-sm font-bold text-primary">{pct === 100 ? "Perfect!" : pct >= 70 ? "Quiz complete!" : "Keep practising"}</h2>
                <p className="mt-2 text-md text-tertiary">{title}</p>
                <div className="mx-auto mt-8 grid max-w-sm grid-cols-2 gap-3">
                    <Stat label="Score" value={`${pct}%`} tone={pct >= 70 ? "brand" : "warning"} />
                    <Stat label="Correct" value={`${got} / ${items.length}`} tone="blue" />
                </div>
                <QuizReview items={items} results={results} className="mt-8 text-left" />
                <div className="mt-8 flex justify-center gap-3">
                    {onClose && (
                        <DuoButton color="secondary" onPress={onClose}>
                            Done
                        </DuoButton>
                    )}
                    {closeHref && (
                        <DuoButton color="secondary" href={closeHref}>
                            Done
                        </DuoButton>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-[70vh] flex-col">
            <div className="flex items-center gap-4">
                {onClose ? <ButtonUtility color="tertiary" size="sm" icon={X} tooltip="Quit" onPress={onClose} /> : closeHref ? <Link to={closeHref} aria-label="Quit" className="rounded-lg p-2 text-fg-quaternary hover:bg-secondary"><X className="size-5" /></Link> : null}
                <DuoProgress value={(100 * i) / items.length} />
                <span className="shrink-0 text-sm font-bold text-quaternary tabular-nums">
                    {i + 1} / {items.length}
                </span>
            </div>

            <AnimatePresence mode="wait">
                <motion.div key={item.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} className="mx-auto mt-10 w-full max-w-2xl flex-1">
                    <p className="duo-label text-quaternary">{item.type === "choose" ? "Choose the right answer" : "Type the answer"}</p>
                    <h2 className="mt-2 text-display-xs font-bold text-primary md:text-display-sm">{item.prompt}</h2>
                    {item.type === "choose" ? (
                        <div className="mt-8 grid gap-3 sm:grid-cols-2">
                            {tiles.map((t, n) => (
                                <button
                                    key={t}
                                    type="button"
                                    disabled={state !== "ask"}
                                    onClick={() => setPick(t)}
                                    className={cx(
                                        "flex items-center gap-4 rounded-2xl border-2 border-b-4 px-4 py-4 text-left text-md font-semibold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0.5 active:border-b-2 disabled:cursor-default",
                                        pick === t ? "border-blue-400 bg-blue-50 text-blue-700" : "border-secondary bg-primary text-secondary hover:bg-primary_hover",
                                        state !== "ask" && t === item.answer && "border-success-500 bg-success-primary text-success-primary",
                                        state === "wrong" && pick === t && t !== item.answer && "border-error-500 bg-error-primary text-error-primary",
                                    )}
                                >
                                    <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold tabular-nums", pick === t ? "border-blue-300 text-blue-600" : "border-secondary text-quaternary")}>{n + 1}</span>
                                    {t}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <textarea
                            aria-label="Your answer"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            readOnly={state !== "ask"}
                            autoFocus
                            rows={3}
                            placeholder="Type in Irish…"
                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && e.preventDefault()}
                            className={cx(
                                "mt-8 w-full resize-none rounded-2xl border-2 bg-secondary_subtle p-4 text-lg font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/70 focus:border-brand focus:bg-primary",
                                state === "right" ? "border-success-500" : state === "wrong" ? "border-error-500" : "border-secondary",
                            )}
                        />
                    )}
                </motion.div>
            </AnimatePresence>

            {/* the footer: plain with Check, or coloured with the verdict and Continue */}
            <div className={cx("-mx-4 mt-10 border-t-2 px-4 py-5 transition-colors duration-200 md:-mx-8 md:px-8", state === "right" ? "border-success-200 bg-success-primary" : state === "wrong" ? "border-error-200 bg-error-primary" : "border-secondary")}>
                <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-4">
                    {state === "ask" ? (
                        <>
                            <DuoButton color="secondary" onPress={() => { setResults((r) => ({ ...r, [item.id]: { given: "", right: false } })); setState("wrong"); }}>
                                Skip
                            </DuoButton>
                            <DuoButton className="ml-auto min-w-36" onPress={check} isDisabled={!given.trim()}>
                                Check
                            </DuoButton>
                        </>
                    ) : (
                        <>
                            <span className={cx("flex size-12 shrink-0 items-center justify-center rounded-full bg-white", state === "right" ? "text-success-primary" : "text-error-primary")}>
                                {state === "right" ? <Check className="size-7 stroke-[3px]" /> : <X className="size-7 stroke-[3px]" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className={cx("text-xl font-bold", state === "right" ? "text-success-primary" : "text-error-primary")}>{state === "right" ? ["Nicely done!", "Maith thú!", "Correct!", "Ar fheabhas!"][i % 4] : "Correct solution:"}</p>
                                {state === "wrong" && <p className="mt-0.5 text-md font-medium text-error-primary">{item.answer}</p>}
                            </div>
                            <DuoButton color={state === "right" ? "primary" : "danger"} className="min-w-36" onPress={next}>
                                Continue
                            </DuoButton>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone: "brand" | "warning" | "blue" }) => (
    <div className={cx("rounded-2xl border-2 p-1", tone === "brand" ? "border-brand bg-brand-500" : tone === "warning" ? "border-warning-400 bg-warning-solid" : "border-blue-400 bg-blue-500")}>
        <p className="py-1 duo-label text-white">{label}</p>
        <p className={cx("rounded-xl bg-primary py-3 text-display-xs font-bold tabular-nums", tone === "brand" ? "text-brand-secondary" : tone === "warning" ? "text-warning-primary" : "text-blue-600")}>{value}</p>
    </div>
);

/** Every item with what was given and what was right: for the end screen, the teacher and the student looking back. */
export const QuizReview = ({ items, results, className }: { items: QuizItem[]; results: QuizResults; className?: string }) => (
    <ol className={cx("flex flex-col gap-2", className)}>
        {items.map((it, n) => {
            const r = results[it.id];
            const ok = !!r?.right;
            return (
                <li key={it.id} className={cx("flex gap-3 rounded-2xl border-2 px-4 py-3", ok ? "border-success-200 bg-success-primary/40" : "border-error-200 bg-error-primary/40")}>
                    <span className={cx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white", ok ? "bg-success-solid" : "bg-error-solid")}>{ok ? <Check className="size-4 stroke-[3px]" /> : <X className="size-4 stroke-[3px]" />}</span>
                    <div className="min-w-0 flex-1 text-sm">
                        <p className="font-bold text-primary">
                            {n + 1}. {it.prompt}
                        </p>
                        <p className="mt-0.5 text-secondary">
                            {r?.given ? <>Answered <strong className="font-semibold">{r.given}</strong></> : <em>No answer</em>}
                            {!ok && <> · correct: <strong className="font-semibold text-success-primary">{it.answer}</strong></>}
                        </p>
                    </div>
                </li>
            );
        })}
    </ol>
);

/* ---------------- builder ---------------- */

const ItemEditor = ({ it, n, onChange, onRemove, onMove, first, last }: { it: QuizItem; n: number; onChange: (i: QuizItem) => void; onRemove: () => void; onMove: (d: number) => void; first: boolean; last: boolean }) => {
    const opts = it.options || ["", "", ""];
    return (
        <li className={cx("rounded-2xl border-2 bg-primary p-4 md:p-5", itemOk(it) ? "border-secondary" : "border-warning-300")}>
            <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white tabular-nums">{n + 1}</span>
                <Segmented
                    ghost
                    size="xs"
                    label="Question type"
                    value={it.type}
                    onChange={(t) => onChange({ ...it, type: t, options: t === "choose" ? it.options || ["", "", ""] : it.options })}
                    items={[
                        { id: "choose", label: "Tiles" },
                        { id: "type", label: "Type it" },
                        { id: "order", label: "Order" },
                    ]}
                    itemClassName="px-3 py-1.5 duo-label tracking-normal"
                />
                <div className="ml-auto flex items-center gap-1">
                    <ButtonUtility color="tertiary" size="xs" icon={ArrowUp} tooltip="Move up" isDisabled={first} onPress={() => onMove(-1)} />
                    <ButtonUtility color="tertiary" size="xs" icon={ArrowDown} tooltip="Move down" isDisabled={last} onPress={() => onMove(1)} />
                    <ButtonUtility color="tertiary" size="xs" icon={Trash01} tooltip="Remove" onPress={onRemove} />
                </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                    <FieldLabel>Question</FieldLabel>
                    <DuoInput ariaLabel={`Question ${n + 1}`} value={it.prompt} onChange={(v) => onChange({ ...it, prompt: v })} placeholder='e.g. Say "I was tired" in Irish' maxLength={200} />
                </div>
                <div>
                    <FieldLabel>Correct answer</FieldLabel>
                    <DuoInput ariaLabel={`Answer ${n + 1}`} value={it.answer} onChange={(v) => onChange({ ...it, answer: v })} placeholder="Bhí tuirse orm" maxLength={200} className="border-brand-300" />
                </div>
                {it.type === "choose" ? (
                    <div>
                        <FieldLabel>Wrong answers (tiles)</FieldLabel>
                        <div className="flex flex-col gap-2">
                            {opts.map((o, k) => (
                                <DuoInput key={k} ariaLabel={`Wrong answer ${k + 1}`} value={o} onChange={(v) => onChange({ ...it, options: opts.map((x, j) => (j === k ? v : x)) })} placeholder={`Wrong answer ${k + 1}`} maxLength={200} className="py-2" />
                            ))}
                        </div>
                    </div>
                ) : it.type === "order" ? (
                    <div>
                        <FieldLabel>Why (shown after the answer)</FieldLabel>
                        <DuoInput ariaLabel="Why" multiline value={it.why || ""} onChange={(v) => onChange({ ...it, why: v, words: it.answer.split(" ").filter(Boolean), art: "order" })} placeholder="The verb comes first, then who, then what." />
                    </div>
                ) : (
                    <div>
                        <FieldLabel>Also accept (optional, one per line)</FieldLabel>
                        <DuoInput ariaLabel="Other accepted answers" multiline value={(it.alts || []).join("\n")} onChange={(v) => onChange({ ...it, alts: v.split("\n") })} placeholder={"Bhí mé tuirseach"} />
                    </div>
                )}
            </div>
        </li>
    );
};

export const QuizBuilderPage = () => {
    const { id } = useParams();
    const [sp] = useSearchParams();
    const nav = useNavigate();
    const classId = sp.get("class");
    const existing = useStore((s) => s.quizzes.find((q) => q.id === id));
    const [name, setName] = useState(existing?.name ?? "");
    const [items, setItems] = useState<QuizItem[]>(existing?.items ?? [blankItem(uid())]);
    const [tried, setTried] = useState(false);
    const [busy, setBusy] = useState(false);
    const good = items.filter(itemOk);
    const ok = name.trim() && good.length > 0;

    const save = async () => {
        setTried(true);
        if (!ok) return;
        const quiz: Quiz = { id: existing?.id ?? uid(), name: name.trim(), items: good.map((i) => ({ ...i, options: i.options?.filter((o) => o.trim()), alts: i.alts?.filter((a) => a.trim()) })), created: existing?.created ?? Date.now(), result: existing?.result };
        set("quizzes", [quiz, ...get().quizzes.filter((q) => q.id !== quiz.id)]);
        if (classId) {
            setBusy(true);
            try {
                await api.assign(classId, "quiz", quiz.name, { name: quiz.name, items: quiz.items }, null);
                toast("Quiz saved and set as homework");
                nav(`/classes/${classId}`);
                return;
            } catch (e) {
                toast((e as Error).message);
            }
            setBusy(false);
        }
        toast(existing ? "Quiz updated" : "Quiz saved");
        nav("/quiz");
    };
    const edit = (n: number, it: QuizItem) => setItems(items.map((x, i) => (i === n ? it : x)));
    const move = (n: number, d: number) => {
        const a = [...items];
        [a[n], a[n + d]] = [a[n + d], a[n]];
        setItems(a);
    };

    return (
        <Page wide>
            <PageHeader kicker={classId ? "Homework for your class" : "Quizzes"} title={existing ? "Edit quiz" : "Make a quiz"} sub="Tiles to pick from or an answer to type, marked on the spot like a Duolingo lesson." />
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="flex flex-col gap-5">
                    <section className="rounded-2xl border-2 border-secondary bg-primary p-5 md:p-6">
                        <FieldLabel>Quiz name</FieldLabel>
                        <DuoInput ariaLabel="Quiz name" value={name} onChange={setName} placeholder="e.g. An Aimsir Chaite, week 3" maxLength={60} autoFocus={!existing} />
                        {tried && !name.trim() && <p className="mt-2 text-sm font-semibold text-error-primary">Give the quiz a name.</p>}
                    </section>
                    <ol className="flex flex-col gap-4">
                        {items.map((it, n) => (
                            <ItemEditor key={it.id} it={it} n={n} onChange={(x) => edit(n, x)} onRemove={() => setItems(items.filter((x) => x.id !== it.id))} onMove={(d) => move(n, d)} first={n === 0} last={n === items.length - 1} />
                        ))}
                    </ol>
                    <div className="flex flex-wrap gap-3">
                        <DuoButton color="secondary" size="sm" iconLeading={Plus} onPress={() => setItems([...items, blankItem(uid(), "choose")])}>
                            Add tiles question
                        </DuoButton>
                        <DuoButton color="secondary" size="sm" iconLeading={Plus} onPress={() => setItems([...items, blankItem(uid(), "type")])}>
                            Add typing question
                        </DuoButton>
                        {items.length === 1 && !items[0].prompt && (
                            <DuoButton color="ghost" size="sm" iconLeading={DuoSparkle as never} onPress={() => setItems(SAMPLE_ITEMS.map((i) => ({ ...i, id: uid() })))}>
                                Start from three samples
                            </DuoButton>
                        )}
                    </div>
                </div>
                <aside className="rounded-2xl border-2 border-secondary bg-primary p-6 lg:sticky lg:top-24">
                    <div className="flex items-center gap-3">
                        <DuoTarget aria-hidden="true" className="size-10" />
                        <div className="min-w-0">
                            <p className="truncate text-md font-bold text-primary">{name.trim() || "Your quiz"}</p>
                            <p className="text-sm text-tertiary">
                                {plural(good.length, "question")}
                                {good.length < items.length ? ` · ${items.length - good.length} unfinished` : ""}
                            </p>
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-tertiary">Unfinished questions (no prompt, answer or wrong tile) are left out when you save.</p>
                    <DuoButton full className="mt-5" onPress={save} isDisabled={busy || (tried && !ok)}>
                        {busy ? "Saving…" : classId ? "Save and set as homework" : existing ? "Save changes" : "Save quiz"}
                    </DuoButton>
                    <DuoButton full color="ghost" size="sm" className="mt-2" href={classId ? `/classes/${classId}` : "/quiz"}>
                        Cancel
                    </DuoButton>
                </aside>
            </div>
        </Page>
    );
};

/* ---------------- list and play ---------------- */

const ShareDialog = ({ quiz, onClose }: { quiz: { name: string; items: QuizItem[] }; onClose: () => void }) => {
    const [classes, setClasses] = useState<ClassRow[] | null>(null);
    const [kid, setKid] = useState("");
    const [due, setDue] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        api.teacher().then((t) => (setClasses(t.classes), setKid(t.classes[0]?.id || ""))).catch((e) => toast(e.message));
    }, []);
    const go = async () => {
        setBusy(true);
        try {
            await api.assign(kid, "quiz", quiz.name, { name: quiz.name, items: quiz.items }, due ? new Date(due + "T23:59").getTime() / 1000 : null);
            toast("Set as homework");
            onClose();
        } catch (e) {
            toast((e as Error).message);
        }
        setBusy(false);
    };
    return (
        <DuoDialog open onClose={onClose} title="Share with a class" sub={quiz.name}>
            {classes === null ? (
                <p className="text-sm text-tertiary">Loading your classes…</p>
            ) : classes.length === 0 ? (
                <p className="text-sm text-tertiary">
                    You have no classes yet.{" "}
                    <Link to="/classes" className="font-bold text-brand-secondary hover:underline">
                        Make one
                    </Link>
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    <div>
                        <FieldLabel>Class</FieldLabel>
                        <DuoSelect label="Class" value={kid} onChange={setKid} items={classes.map((k) => ({ id: k.id, label: k.name, note: plural(k.students, "student") }))} className="w-full" />
                    </div>
                    <div>
                        <FieldLabel>Due (optional)</FieldLabel>
                        <input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-2.5 text-md font-bold text-primary outline-hidden focus:border-brand" />
                    </div>
                    <DuoButton full onPress={go} isDisabled={busy || !kid}>
                        {busy ? "Sharing…" : "Set as homework"}
                    </DuoButton>
                </div>
            )}
        </DuoDialog>
    );
};

const Score = ({ r }: { r?: { got: number; total: number } }) => {
    const pct = r && r.total ? Math.round((100 * r.got) / r.total) : null;
    return pct !== null ? (
        <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold", pct >= 70 ? "bg-success-primary text-success-primary" : "bg-warning-primary text-warning-primary")}>Last {pct}%</span>
    ) : (
        <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-tertiary">Not played</span>
    );
};

/** A ready-made pack as a tile you tick: topic icon, name, blurb, count and your last score. */
const PackTile = ({ b, on, onToggle, i }: { b: BankQuiz; on: boolean; onToggle: () => void; i: number }) => {
    const r = useStore((s) => s.quizScores[b.id]);
    const Icon = b.topic === "general" ? DuoTarget : topicIcon(b.topic);
    return (
        <motion.li {...reveal(Math.min(i, 5))}>
            <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={onToggle}
                className={cx(
                    "group flex h-full w-full items-start gap-4 rounded-2xl border-2 p-5 text-left outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px",
                    on ? "border-brand bg-brand-primary" : "border-secondary bg-primary hover:bg-primary_hover",
                )}
            >
                <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-xl border-2 bg-primary", on ? "border-brand" : "border-secondary")}>
                    <Icon aria-hidden="true" className={cx("size-7 transition duration-150", !on && "opacity-70 saturate-50 group-hover:opacity-100 group-hover:saturate-100")} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className={cx("block text-md font-bold", on ? "text-brand-secondary" : "text-primary")}>{b.name}</span>
                    <span className="block text-sm text-tertiary">{b.sub}</span>
                    <span className="mt-2 flex items-center gap-2">
                        <Score r={r} />
                        <span className="text-xs font-bold text-quaternary">{plural(b.items.length, "question")}</span>
                    </span>
                </span>
                <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition duration-150", on ? "border-brand bg-brand-500 text-white" : "border-secondary bg-primary text-transparent")}>
                    <Check aria-hidden="true" className="size-4 stroke-[3px]" />
                </span>
            </button>
        </motion.li>
    );
};

const COUNTS = ["5", "10", "15", "20", "all"] as const;
type Count = (typeof COUNTS)[number];

/** Shuffle the chosen packs together and deal n questions. */
export const dealQuiz = (packIds: string[], n: number) => {
    const items = packIds.flatMap((id) => bankQuiz(id)?.items.map((it) => ({ ...it, id: `${id}:${it.id}` })) ?? []);
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return n ? items.slice(0, n) : items;
};

/** The quizzes home, Simple Study style: say how many questions, tick the packs, start. Your own quizzes sit underneath. */
export const QuizzesPage = () => {
    const quizzes = useStore((s) => s.quizzes);
    const acct = useAccount();
    const nav = useNavigate();
    const [count, setCount] = useState<Count>("10");
    const [packs, setPacks] = useState<string[]>([]);
    const [share, setShare] = useState<{ name: string; items: QuizItem[] } | null>(null);
    const teacher = acct?.role === "teacher";
    const groups = [...NAV.map((g) => ({ title: g.group, slugs: g.items.flatMap((i) => (i[3] ? i[3].map((c) => c[0]) : [i[0]])) })), { title: "The exam itself", slugs: ["general"] }]
        .map((g) => ({ ...g, quizzes: BANK.filter((b) => g.slugs.includes(b.topic)) }))
        .filter((g) => g.quizzes.length);
    const available = packs.reduce((n, id) => n + (bankQuiz(id)?.items.length ?? 0), 0);
    const n = count === "all" ? available : Math.min(+count, available);
    const toggle = (id: string) => setPacks(packs.includes(id) ? packs.filter((x) => x !== id) : [...packs, id]);
    const start = () => nav(`/quiz/play?packs=${packs.join(",")}&n=${count === "all" ? 0 : count}`);
    const mixName = packs.length === 1 ? bankQuiz(packs[0])!.name : `Mixed quiz (${plural(packs.length, "pack")})`;

    return (
        <Page wide>
            <PageHeader
                title="Quizzes"
                sub="Quick-fire practice in the Duolingo style. Choose how many questions, tick the packs you want, and go."
                actions={
                    <DuoButton color="secondary" href="/quiz/new" iconLeading={Plus}>
                        Make your own
                    </DuoButton>
                }
            />
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="flex flex-col gap-10">
                    <section className="rounded-2xl border-2 border-secondary bg-primary p-6">
                        <div className="flex flex-wrap items-center gap-5">
                            <div className="flex items-center gap-3">
                                <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">1</span>
                                <h2 className="text-lg font-bold text-primary">How many questions?</h2>
                            </div>
                            <Segmented ghost size="md" label="Number of questions" value={count} onChange={setCount} items={COUNTS.map((c) => ({ id: c, label: c === "all" ? "All" : c }))} itemClassName="px-4 py-2.5 duo-label" className="sm:ml-auto" />
                        </div>
                    </section>
                    <section>
                        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">2</span>
                            <h2 className="text-lg font-bold text-primary">Pick your packs</h2>
                            <span className="text-sm text-tertiary max-sm:basis-full">Tick as many as you like; the questions are mixed together.</span>
                        </div>
                        {groups.map((g) => {
                            const allOn = g.quizzes.every((b) => packs.includes(b.id));
                            return (
                                <div key={g.title} className="mb-10">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h3 className="duo-label text-quaternary">{g.title}</h3>
                                        <button type="button" onClick={() => setPacks(allOn ? packs.filter((id) => !g.quizzes.some((b) => b.id === id)) : [...new Set([...packs, ...g.quizzes.map((b) => b.id)])])} className="text-sm font-bold text-brand-secondary hover:underline">
                                            {allOn ? "Clear all" : "Select all"}
                                        </button>
                                    </div>
                                    <ul className="grid gap-4 sm:grid-cols-2">
                                        {g.quizzes.map((b, i) => (
                                            <PackTile key={b.id} b={b} i={i} on={packs.includes(b.id)} onToggle={() => toggle(b.id)} />
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </section>
                    <section>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="duo-label text-quaternary">Your own quizzes</h2>
                            <DuoButton color="ghost" size="xs" href="/quiz/new" iconLeading={Plus}>
                                Make a quiz
                            </DuoButton>
                        </div>
                        {quizzes.length ? (
                            <ul className="flex flex-col gap-4">
                                {quizzes.map((q) => (
                                    <li key={q.id} className="flex flex-col gap-4 rounded-2xl border-2 border-secondary bg-primary p-5 sm:flex-row sm:items-center sm:gap-5">
                                        <DuoTarget aria-hidden="true" className="size-11 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-md font-bold text-primary">{q.name}</p>
                                            <p className="text-sm text-tertiary">
                                                {plural(q.items.length, "question")} · {q.items.filter((i) => i.type === "choose").length} tiles, {q.items.filter((i) => i.type === "type").length} typed
                                            </p>
                                            <p className="mt-1.5">
                                                <Score r={q.result} />
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {teacher && <ButtonUtility color="tertiary" size="sm" icon={Share07} tooltip="Share with a class" onPress={() => setShare(q)} />}
                                            <ButtonUtility color="tertiary" size="sm" icon={Edit03} tooltip="Edit" onPress={() => nav(`/quiz/${q.id}/edit`)} />
                                            <ButtonUtility
                                                color="tertiary"
                                                size="sm"
                                                icon={Trash01}
                                                tooltip="Delete"
                                                onPress={() => {
                                                    const was = get().quizzes;
                                                    set("quizzes", was.filter((x) => x.id !== q.id));
                                                    toast("Quiz deleted", () => set("quizzes", was));
                                                }}
                                            />
                                            <DuoButton size="sm" href={`/quiz/${q.id}/play`} iconLeading={Play} className="ml-1">
                                                Play
                                            </DuoButton>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="rounded-2xl border-2 border-dashed border-secondary p-6 text-center">
                                <DuoSparkle aria-hidden="true" className="mx-auto size-9" />
                                <p className="mt-2 text-md font-bold text-primary">Nothing of your own yet</p>
                                <p className="mt-1 text-sm text-tertiary">A quiz takes a minute: a question, the right answer and a few wrong tiles.</p>
                            </div>
                        )}
                    </section>
                </div>

                <aside className="rounded-2xl border-2 border-secondary bg-primary p-6 lg:sticky lg:top-24">
                    <div className="flex items-center gap-3">
                        <DuoTarget aria-hidden="true" className="size-10" />
                        <div className="min-w-0">
                            <p className="truncate text-md font-bold text-primary">{packs.length ? mixName : "Your quiz"}</p>
                            <p className="text-sm text-tertiary">{packs.length ? `${plural(n, "question")} from ${plural(available, "available")}` : "Pick at least one pack"}</p>
                        </div>
                    </div>
                    {packs.length > 0 && (
                        <ul className="mt-4 flex flex-col gap-1.5 text-sm text-secondary">
                            {packs.map((id) => (
                                <li key={id} className="flex items-center gap-2">
                                    <Check aria-hidden="true" className="size-4 stroke-[3px] text-fg-brand-primary" />
                                    {bankQuiz(id)?.name}
                                </li>
                            ))}
                        </ul>
                    )}
                    <DuoButton full className="mt-5" onPress={start} isDisabled={!packs.length} iconLeading={Play}>
                        Start quiz
                    </DuoButton>
                    {teacher && (
                        <DuoButton full color="secondary" size="sm" className="mt-2" isDisabled={!packs.length} iconLeading={Share07} onPress={() => setShare({ name: mixName, items: dealQuiz(packs, count === "all" ? 0 : +count) })}>
                            Set as homework
                        </DuoButton>
                    )}
                </aside>
            </div>
            {share && <ShareDialog quiz={share} onClose={() => setShare(null)} />}
        </Page>
    );
};

export const QuizPlayPage = () => {
    const { id = "" } = useParams();
    const [sp] = useSearchParams();
    const mine = useStore((s) => s.quizzes.find((q) => q.id === id));
    const packs = (sp.get("packs") || "").split(",").filter(Boolean);
    const dealt = useMemo(() => (packs.length ? dealQuiz(packs, +(sp.get("n") || 0)) : null), [sp]);
    const quiz = mine ?? (id ? bankQuiz(id) : null) ?? (dealt ? { id: "mix", name: packs.length === 1 ? bankQuiz(packs[0])!.name : `Mixed quiz (${plural(packs.length, "pack")})`, items: dealt } : null);
    if (!quiz || !quiz.items.length) return <NotFound />;
    return (
        <BrilliantLesson
                items={quiz.items}
                title={quiz.name}
                closeHref="/quiz"
                onFinish={(_r, got) => {
                    const result = { got, total: quiz.items.length, at: Date.now() };
                    if (mine) set("quizzes", get().quizzes.map((q) => (q.id === quiz.id ? { ...q, result } : q)));
                    else if (packs.length === 1 || (id && bankQuiz(id))) set("quizScores", { ...get().quizScores, [packs[0] || id]: result });
                }}
            />
    );
};
