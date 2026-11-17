// A topic: its name and what it is, three tabs (Questions, Lessons, Samples & Guides), then every
// State exam question grouped by year. The tabs, and the tools over the questions, stay pinned to the top.
import { useLayoutEffect, useRef, useState } from "react";
import { BookOpen01, Check, Feather, Grid01, Plus } from "@/components/app/ic";
import { ChevronDown } from "@/components/app/ic";
import { AnimatePresence, motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { Link, useParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoBulb, DuoCheckDoc, DuoQuestion } from "@/components/app/duo-icons";
import { Empty, Page, Pinned, YearGroups, reveal } from "@/components/app/page-parts";
import { SampleCard } from "@/components/app/question-card";
import { navName, samplesOf, topic } from "@/lib/data";
import { setBuilding, usePick } from "@/lib/pick";
import { useStore } from "@/lib/store";
import { toast } from "@/components/app/toast";
import { explainerOf } from "@/lib/explainers";
import { hi } from "@/lib/highlight";
import { cx } from "@/utils/cx";
import { LessonsTab } from "./lessons-tab";
import { SOON } from "@/lib/soon";
import { NotFound } from "./not-found";

/** The three tabs as one bar: equal thirds on a rule, the chosen one tinted with rounded shoulders and a brand line under it. */
const TopicTabs = ({ slug, tab, className }: { slug: string; tab: string; className?: string }) => {
    const items = [
        { id: "questions", label: "Questions", icon: DuoQuestion, href: `/t/${slug}` },
        { id: "lessons", label: "Lessons", icon: DuoBulb, href: `/t/${slug}/lessons` },
        { id: "samples", label: "Samples & Guides", icon: DuoCheckDoc, href: `/t/${slug}/samples` },
    ];
    return (
        <nav aria-label="Sections" className={cx("grid grid-cols-3 border-b-2 border-secondary", className)}>
            {items.map((it) => {
                const on = it.id === tab;
                return (
                    <Link
                        key={it.id}
                        to={it.href}
                        aria-current={on ? "page" : undefined}
                        className={cx(
                            "-mb-0.5 flex h-12 items-center justify-center gap-2.5 rounded-t-2xl border-b-[3px] px-2 text-center text-[13px] leading-tight font-bold outline-focus-ring transition duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 sm:h-14 sm:text-md",
                            on ? "border-brand bg-brand-primary text-brand-secondary" : "border-transparent text-tertiary hover:bg-primary_hover hover:text-primary",
                        )}
                    >
                        <it.icon aria-hidden="true" className={cx("size-6 shrink-0 max-sm:hidden", !on && "opacity-80")} />
                        {it.label}
                    </Link>
                );
            })}
        </nav>
    );
};

/** The facts worth a glance, pulled from the explainer's own words: paper, marks, weight, time. */
const facts = (x: { where: string; lead: string }) => {
    const text = `${x.lead} ${x.where}`;
    const grab = (rx: RegExp) => text.match(rx)?.[0];
    return [
        grab(/\bPaper [12]\b/),
        grab(/\b\d+ marks\b/),
        grab(/\b\d+%/),
        grab(/\b(?:about |roughly )?\d+ minutes\b/)?.replace(/^(about|roughly) /, "~"),
    ].filter(Boolean) as string[];
};

/** A heading in the notes, the Duolingo divider: grey caps centred between two grey rules. */
const NoteHead = ({ children }: { children: React.ReactNode }) => (
    <h3 className="flex items-center gap-4 text-center duo-label text-quaternary">
        <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
        {children}
        <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
    </h3>
);

/** One line about the section, then "Read more" unfolds the notes: where it sits, what to do, tips. One column, as long as it needs. */
export const Explainer = ({ slug, fallback, course2027, given }: { slug: string; fallback: string; course2027?: boolean; given?: ReturnType<typeof explainerOf> }) => {
    const [open, setOpen] = useState(false);
    const x = given ?? explainerOf(slug, course2027, navName(slug));
    if (!x) return <p className="mt-2 max-w-2xl text-md text-tertiary">{fallback}</p>;
    const chips = facts(x);
    return (
        <div className="mt-2 max-w-3xl">
            <p className="text-md text-tertiary">
                {x.lead}{" "}
                <AriaButton
                    onPress={() => setOpen(!open)}
                    aria-expanded={open}
                    className="inline-flex items-center gap-0.5 align-baseline text-md font-bold text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2"
                >
                    {open ? "Show less" : "Read more"}
                    <ChevronDown
                        aria-hidden="true"
                        className={cx("size-4 stroke-[2.5px] transition-transform duration-200 ease-out", open && "-scale-y-100")}
                    />
                </AriaButton>
            </p>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-7 pt-5 pb-2">
                            {chips.length > 0 && (
                                <ul className="flex flex-wrap gap-2" aria-label="At a glance">
                                    {chips.map((c) => (
                                        <li key={c} className="rounded-xl border-2 border-secondary px-3 py-1.5 text-sm font-bold text-secondary">
                                            {c}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <section>
                                <NoteHead>Where it appears</NoteHead>
                                <p className="mt-3 text-md leading-7 text-secondary">{hi(x.where)}</p>
                            </section>
                            <section>
                                <NoteHead>What you must do</NoteHead>
                                <p className="mt-3 text-md leading-7 text-secondary">{hi(x.task)}</p>
                            </section>
                            <section>
                                <NoteHead>Tips</NoteHead>
                                <ol className="mt-3 flex flex-col gap-3">
                                    {x.tips.map((t, i) => (
                                        <li key={t} className="flex gap-3.5 text-md leading-7 text-secondary">
                                            <span
                                                aria-hidden="true"
                                                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-brand-secondary tabular-nums"
                                            >
                                                {i + 1}
                                            </span>
                                            <span>{hi(t)}</span>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                            <p className="border-t-2 border-secondary pt-4 text-sm text-quaternary">{fallback}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Header = ({
    slug,
    name,
    sub,
    action,
    course2027,
}: {
    slug: string;
    name: string;
    sub: string;
    action?: React.ReactNode;
    course2027?: boolean;
}) => (
    <header className="mb-3 md:mb-4">
        <div className="flex gap-4 md:items-start md:gap-5">
            <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-primary md:text-display-sm">{name.replace(/\s*\(.*\)$/, "")}</h1>
                <Explainer slug={slug} fallback={sub} course2027={course2027} />
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    </header>
);

export const TopicPage = () => {
    const { slug = "", tab = "questions", item } = useParams();
    const t = topic(slug);
    const building = usePick((s) => s.building);
    const inExam = useStore((s) => s.exam.length);
    // switching tabs while scrolled: come back up to the tabs rather than land halfway down the new one
    const sentinel = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = sentinel.current;
        if (!el) return;
        const was = window.scrollY; // read before layout, so the browser hasn't clamped it yet
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (was > top + 8) window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
    }, [tab]);
    if (!t) return <NotFound />;

    if (t.course2027)
        return (
            <Page>
                <Header slug={slug} name={t.name} sub="New on the course for 2027." course2027 />
                <Empty
                    icon={Feather}
                    title="New on the course for 2027"
                    note="This text is examined for the first time in 2027, so there are no State exam questions on it yet."
                >
                    <DuoButton color="secondary" size="sm" href="/" iconLeading={Grid01}>
                        Browse other topics
                    </DuoButton>
                </Empty>
            </Page>
        );

    const samples = t.questions.flatMap((q) => samplesOf(q).map((s) => ({ q, s })));
    const aural = slug.startsWith("aural");
    const sub = aural
        ? `${t.questions.length} State exam questions, ${t.questions.filter((q) => q.audio).length} with the official recording cut to this section.`
        : slug === "write"
          ? "Essays, newspaper articles, stories and debates, each with the marking scheme."
          : `${t.questions.length} State exam questions, each with the official marking scheme.`;

    const tabs = (cls?: string) => <TopicTabs slug={slug} tab={tab} className={cls} />;
    // Pinned: the top bar scrolls away on this page, so the tabs take its place at the top of the screen.
    const stickyTabs = <Pinned className="mb-8">{tabs()}</Pinned>;
    return (
        <Page wide>
            <Header
                slug={slug}
                name={navName(slug)}
                sub={sub}
                action={
                    /* "Add to exam" is on no question until this is pressed. Pressing it puts the button on
                       every one; the bar at the foot of the screen keeps count and makes the exam. */
                    <DuoButton
                        color={building ? "primary" : "secondary"}
                        size="sm"
                        iconLeading={building ? Check : Plus}
                        onPress={() => {
                            setBuilding(!building);
                            toast(building ? "Finished choosing. Your exam is in the bar below." : "Press Add to exam on each question you want.");
                        }}
                    >
                        {building ? (inExam ? `Done choosing (${inExam})` : "Done choosing") : "Create exam"}
                    </DuoButton>
                }
            />
            <div ref={sentinel} aria-hidden="true" />
            {tab === "lessons" ? (
                <>
                    {stickyTabs}
                    <motion.div key="lessons" {...reveal(0)} className="min-h-dvh">
                        {SOON.notes ? <Empty icon={BookOpen01} title="No notes yet" note="Coming soon." /> : <LessonsTab slug={slug} current={item} />}
                    </motion.div>
                </>
            ) : tab === "samples" ? (
                <>
                    {stickyTabs}
                    <div className="min-h-dvh">
                        {SOON.samples || samples.length === 0 ? (
                            <Empty icon={BookOpen01} title="No samples yet" note="Coming soon." />
                        ) : (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
                                {samples.map(({ q, s }, i) => (
                                    <motion.div key={`${q.id}${s.letter}`} {...reveal(i)}>
                                        <SampleCard q={q} s={s} kind={`${q.year}${q.deferred ? " deferred" : ""} · ${s.form}`} />
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <YearGroups list={t.questions} head={tabs()} />
            )}
        </Page>
    );
};
