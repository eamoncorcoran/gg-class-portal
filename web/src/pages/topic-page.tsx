// A topic: header with your progress, three big tabs (Questions, Lessons, Samples & Guides), then
// every State exam question grouped by year with the year bar pinned above them.
import { useLayoutEffect, useRef, useState } from "react";
import { BookOpen01, Feather, Grid01, Printer } from "@/components/app/ic";
import { ChevronDown } from "@/components/app/ic";
import { AnimatePresence, motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { Link, useParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoBulb, DuoCheckDoc, DuoQuestion } from "@/components/app/duo-icons";
import { printQuestions } from "@/components/app/overlays";
import { Empty, Page, YearGroups, reveal } from "@/components/app/page-parts";
import { SampleCard } from "@/components/app/question-card";
import { navIrish, navName, paperOf, samplesOf, topic } from "@/lib/data";
import { explainerOf } from "@/lib/explainers";
import { hi } from "@/lib/highlight";
import { cx } from "@/utils/cx";
import { LessonsTab } from "./lessons-tab";
import { SOON } from "@/lib/soon";
import { NotFound } from "./not-found";

/** The three big tabs, Duolingo desktop style: chunky bordered cards, the chosen one tinted with a brand border. */
const TopicTabs = ({ slug, tab, className }: { slug: string; tab: string; className?: string }) => {
    const items = [
        { id: "questions", label: "Questions", icon: DuoQuestion, href: `/t/${slug}` },
        { id: "lessons", label: "Lessons", icon: DuoBulb, href: `/t/${slug}/lessons` },
        { id: "samples", label: "Samples & Guides", icon: DuoCheckDoc, href: `/t/${slug}/samples` },
    ];
    return (
        <nav aria-label="Sections" className={cx("grid grid-cols-3 gap-2 sm:gap-3", className)}>
            {items.map((it) => {
                const on = it.id === tab;
                return (
                    <Link
                        key={it.id}
                        to={it.href}
                        aria-current={on ? "page" : undefined}
                        className={cx(
                            "group flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 duo-label outline-focus-ring transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-row sm:gap-2.5 sm:py-3.5",
                            on
                                ? "border-brand bg-brand-primary text-brand-secondary"
                                : "border-secondary text-secondary hover:bg-primary_hover hover:text-primary",
                        )}
                    >
                        <it.icon
                            aria-hidden="true"
                            className={cx(
                                "size-7 transition duration-150 ease-out",
                                false,
                            )}
                        />
                        <span className="text-center">{it.label}</span>
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
    irish,
    sub,
    action,
    course2027,
}: {
    slug: string;
    name: string;
    irish: string;
    sub: string;
    action?: React.ReactNode;
    course2027?: boolean;
}) => (
    <header className="mb-3 md:mb-4">
        <div className="flex gap-4 md:items-start md:gap-5">
            <div className="min-w-0 flex-1">
                <p className="duo-label text-brand-secondary">{irish}</p>
                <h1 className="mt-1 text-xl font-bold text-primary md:mt-1.5 md:text-display-sm">{name.replace(/\s*\(.*\)$/, "")}</h1>
                <Explainer slug={slug} fallback={sub} course2027={course2027} />
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    </header>
);

export const TopicPage = () => {
    const { slug = "", tab = "questions", item } = useParams();
    const t = topic(slug);
    // switching tabs while scrolled: stay with the tabs pinned at the top, never jump back to the header
    const sentinel = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = sentinel.current;
        if (!el) return;
        const was = window.scrollY; // read before layout, so the browser hasn't clamped it yet
        const top = el.getBoundingClientRect().top + window.scrollY - 64;
        if (was > top + 8) window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
    }, [tab]);
    if (!t) return <NotFound />;

    if (t.course2027)
        return (
            <Page>
                <Header slug={slug} name={t.name} irish={t.irish} sub="New on the course for 2027." course2027 />
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
    const stickyTabs = <div className="sticky top-16 z-20 -mx-4 mb-8 bg-primary px-4 pt-2 pb-4 md:-mx-8 md:px-8">{tabs()}</div>;
    return (
        <Page wide>
            <Header
                slug={slug}
                name={navName(slug)}
                irish={[paperOf(slug), navIrish(slug) || t.irish].filter(Boolean).join(" · ")}
                sub={sub}
                action={
                    <DuoButton
                        color="secondary"
                        size="sm"
                        iconLeading={Printer}
                        onPress={() => printQuestions(t.questions, false, false)}
                        className="max-md:hidden"
                    >
                        Print all
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
                <YearGroups list={t.questions} head={tabs("pt-1")} />
            )}
        </Page>
    );
};
