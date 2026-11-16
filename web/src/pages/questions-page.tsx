// Past questions: every State exam question by topic (Paper 1, Paper 2), the exam years, and under
// its own tab the lessons for each topic. Notes and guides, the oral, quizzes and exams hang off it.
import { type FC, useEffect, useState } from "react";
import { ArrowRight, BookOpen01, CheckCircle, ChevronRight, Play } from "@/components/app/ic";
import { DuoBook, DuoBooks, DuoBulb, DuoHeadphones, DuoMegaphone, DuoPencil, DuoQuestion } from "@/components/app/duo-icons";
import { Link } from "react-router";
import { SampleCard } from "@/components/app/question-card";
import { Empty, Page } from "@/components/app/page-parts";
import { topicIcon } from "@/components/app/app-sidebar";
import { Badge } from "@/components/base/badges/badges";
import { DuoButton } from "@/components/app/duo";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { D, NAV, type Lesson, checkable, label, loadLessons, navName, qsOfYear, samplesOf, topic, yearKey, yearKeys, yearName } from "@/lib/data";
import { SUBJECT } from "@/lib/explainers";
import { useStore } from "@/lib/store";
import { cx } from "@/utils/cx";
import { SOON } from "@/lib/soon";
import { SearchForm } from "./home-page";
import { Explainer } from "./topic-page";

const Section = ({ icon, title, sub, action, children }: { icon?: FC<{ className?: string }>; title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) => (
    <section className="mt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
            <div className="flex items-center gap-4">
                {icon && (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary">
                        {(() => {
                            const I = icon;
                            return <I aria-hidden="true" className="size-7" />;
                        })()}
                    </span>
                )}
                <div>
                    <h2 className="text-xl font-bold text-primary">{title}</h2>
                    {sub && <p className="mt-1 text-md text-tertiary">{sub}</p>}
                </div>
            </div>
            {action}
        </div>
        {children}
    </section>
);

/** The three big tabs under the header: by topic, lessons, notes and guides. */
const Parts = ({ cur }: { cur: "topics" | "lessons" | "notes" }) => {
    const items = [
        { id: "topics", label: "Questions by topic", icon: DuoBooks, href: "/questions" },
        { id: "lessons", label: "Lessons", icon: DuoBulb, href: "/questions/lessons" },
        { id: "notes", label: "Notes & guides", icon: DuoBook, href: "/notes" },
    ] as const;
    return (
        <nav aria-label="Parts" className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
            {items.map((it) => {
                const on = it.id === cur;
                return (
                    <Link key={it.id} to={it.href} aria-current={on ? "page" : undefined} className={cx("group flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 duo-label outline-focus-ring transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-row sm:gap-2.5 sm:py-3.5", on ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary text-secondary hover:bg-primary_hover hover:text-primary")}>
                        <it.icon aria-hidden="true" className="size-7" />
                        <span className="text-center">{it.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
};

const LessonCard = ({ slug, lesson, count }: { slug: string; lesson: Lesson; count: number }) => {
    const Icon = topicIcon(slug);
    return (
        <li>
            <Link to={`/t/${slug}/lessons/${lesson.id}`} className="group flex h-full gap-4 rounded-2xl border-2 border-secondary border-b-4 bg-primary p-4 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                <span className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-linear-to-br from-brand-600 to-brand-900">
                    <Icon aria-hidden="true" className="absolute -right-2 -bottom-3 size-14 opacity-25" />
                    <span className="relative flex size-8 items-center justify-center rounded-full bg-white/95 text-brand-700 shadow">
                        <Play aria-hidden="true" className="size-4 translate-x-px fill-current" />
                    </span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block duo-label text-brand-secondary">{navName(slug).replace(/\s*\(.*\)$/, "")}</span>
                    <span className="mt-1 line-clamp-2 text-md leading-snug font-bold text-primary">{lesson.title.split(" (")[0]}</span>
                    <span className="mt-1.5 block text-xs font-semibold text-quaternary">
                        {lesson.minutes} min · {count} lessons in this course
                    </span>
                </span>
            </Link>
        </li>
    );
};

export const QuestionsPage = ({ view = "topics" }: { view?: "topics" | "lessons" }) => {
    const checks = useStore((s) => s.checks);
    const recentIds = useStore((s) => s.recent);
    const years = yearKeys();
    const latest = years.find((k) => !k.endsWith("D"))!;
    const live = D().topics.filter((t) => !t.course2027);
    const total = live.reduce((n, t) => n + t.questions.length, 0);
    const recent = recentIds.map((id) => D().q[id]).filter(Boolean).slice(0, 3);
    const featured = Object.values(D().q)
        .filter((q) => yearKey(q) === latest)
        .flatMap((q) => samplesOf(q).map((s) => ({ q, s })))
        .slice(0, 8);
    const [lessons, setLessons] = useState<Record<string, Lesson[]> | null>(null);
    useEffect(() => {
        loadLessons().then(setLessons);
    }, []);
    const withLessons = lessons ? Object.entries(lessons).filter(([, l]) => l.length).map(([slug, l]) => ({ slug, lessons: l })) : [];

    return (
        <Page>
            <header className="border-b-2 border-secondary pb-10">
                <div className="flex items-start gap-5">
                    <DuoQuestion aria-hidden="true" className="hidden size-14 shrink-0 md:block" />
                    <div className="min-w-0 flex-1">
                        <h1 className="text-display-sm font-bold tracking-tight text-primary md:text-display-md">Past questions</h1>
                        <div className="mt-4">
                            <Explainer slug="subject" given={SUBJECT} fallback={`${total} State exam questions from ${years.at(-1)!.slice(0, 4)} to ${latest}, each beside its official marking scheme. Play the real recordings, write on the paper and check your answers.`} />
                        </div>
                    </div>
                </div>
                <div className="mt-8">
                    <SearchForm />
                </div>
                <Parts cur={view} />
            </header>

            {view === "lessons" && SOON.notes ? (
                <Empty icon={BookOpen01} title="No notes yet" note="Coming soon." />
            ) : view === "lessons" ? (
                <>
                    <Section title="Lessons by topic" sub="Short guides for each part of the exam, with the facts picked out" action={<DuoButton color="ghost" size="xs" href="/grammar" iconTrailing={ArrowRight}>Grammar course</DuoButton>}>
                        {!lessons ? (
                            <p className="py-10 text-center text-sm text-tertiary">Loading lessons…</p>
                        ) : (
                            <ul className="grid gap-4 sm:grid-cols-2">
                                {withLessons.map(({ slug, lessons: l }) => (
                                    <LessonCard key={slug} slug={slug} lesson={l[0]} count={l.length} />
                                ))}
                            </ul>
                        )}
                    </Section>
                    <Section title="Beyond the written paper">
                        <ul className="grid gap-4 sm:grid-cols-2">
                            <li>
                                <Link to="/oral" className="group flex h-full items-center gap-4 rounded-2xl border-2 border-brand bg-brand-primary p-4 outline-focus-ring transition duration-100 ease-linear hover:bg-brand-primary/70 focus-visible:outline-2">
                                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-brand bg-primary">
                                        <DuoMegaphone aria-hidden="true" className="size-8" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block duo-label text-brand-secondary">40% of the exam</span>
                                        <span className="block text-sm font-bold text-primary">An Bhéaltriail: the oral, part by part</span>
                                    </span>
                                </Link>
                            </li>
                            <li>
                                <Link to="/grammar" className="group flex h-full items-center gap-4 rounded-2xl border-2 border-secondary bg-primary p-4 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2">
                                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary">
                                        <DuoBooks aria-hidden="true" className="size-8" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block duo-label text-brand-secondary">38 lessons</span>
                                        <span className="block text-sm font-bold text-primary">Grammar: tenses, mutations, numbers and more</span>
                                    </span>
                                </Link>
                            </li>
                        </ul>
                    </Section>
                </>
            ) : (
                <>
                    {recent.length > 0 && (
                        <Section title="Continue where you left off">
                            <ul className="grid gap-3 md:grid-cols-3">
                                {recent.map((q) => (
                                    <li key={q.id}>
                                        <Link to={`/q/${q.id}`} className="flex h-full flex-col gap-1 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary outline-focus-ring transition duration-200 ease-out ring-inset hover:-translate-y-0.5 hover:shadow-md hover:ring-primary focus-visible:outline-2">
                                            <span className="text-xs font-medium text-tertiary">
                                                {navName(D().topicOf[q.id])} · {yearName(yearKey(q))}
                                            </span>
                                            <span className="text-sm font-semibold text-primary">{label(q)}</span>
                                            {checks[q.id] && (
                                                <span className="mt-1 flex items-center gap-1 text-xs font-medium text-success-primary">
                                                    <CheckCircle aria-hidden="true" className="size-3.5" /> Checked
                                                </span>
                                            )}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    {NAV.map((g) => (
                        <Section key={g.group} icon={g.group === "Paper 1" ? DuoHeadphones : DuoPencil} title={g.group} sub={g.sub}>
                            <ul className="divide-y-2 divide-secondary overflow-hidden rounded-2xl border-2 border-secondary bg-primary">
                                {g.items.flatMap((i) => (i[3] ? [["", i[1], "", []] as const, ...i[3]] : [i])).map(([slug, en, ga]) => {
                                    if (!slug)
                                        return (
                                            <li key={`h-${en}`} className="bg-secondary_subtle px-4 py-2 duo-label text-quaternary md:px-6">
                                                {en}
                                            </li>
                                        );
                                    const t = topic(slug);
                                    if (!t) return null;
                                    const ys = t.questions.map((x) => x.year);
                                    const done = t.questions.filter((q) => checks[q.id]).length;
                                    const Icon = topicIcon(slug);
                                    return (
                                        <li key={slug}>
                                            <Link to={`/t/${slug}`} className="group flex items-center gap-4 px-4 py-4 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 md:px-6 md:py-5">
                                                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary transition duration-150 ease-out group-hover:border-brand">
                                                    <Icon aria-hidden="true" className="size-7" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-md font-semibold text-primary">{en.replace(/\s*\(.*\)$/, "")}</span>
                                                    <span lang="ga" className="block truncate text-sm text-tertiary">
                                                        {ga}
                                                        <span lang="en" className="md:hidden">
                                                            {" "}· {Math.min(...ys)}–{Math.max(...ys)}
                                                        </span>
                                                    </span>
                                                </span>
                                                {done ? (
                                                    <span className="hidden items-center gap-2 text-sm text-tertiary md:flex">
                                                        <ProgressBarBase value={done} max={t.questions.length} className="h-1.5 w-14" />
                                                        {done} checked
                                                    </span>
                                                ) : checkable(t.questions[0]) ? (
                                                    <Badge size="sm" type="pill-color" color="success" className="max-md:hidden">
                                                        Auto-marked
                                                    </Badge>
                                                ) : null}
                                                <span className="hidden w-24 text-right text-sm text-tertiary tabular-nums md:block">
                                                    {Math.min(...ys)}–{Math.max(...ys)}
                                                </span>
                                                <ChevronRight aria-hidden="true" className="size-5 text-fg-quaternary transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-fg-quaternary_hover" />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Section>
                    ))}

                    <Section title="Exam years" sub="Every question from one sitting, across all topics" action={<DuoButton color="ghost" size="xs" href="/years" iconTrailing={ArrowRight}>All years</DuoButton>}>
                        <div className="flex flex-wrap gap-2">
                            {years.map((k) => (
                                <Link key={k} to={`/year/${k}`} className="flex h-10 items-center gap-1.5 rounded-xl border-2 border-secondary border-b-4 bg-primary px-3.5 text-sm font-bold text-secondary tabular-nums outline-focus-ring ring-inset transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2" aria-label={`${yearName(k)}, ${qsOfYear(k).length} questions`}>
                                    {k.slice(0, 4)}
                                    {k.endsWith("D") && <span className="text-xs font-medium text-warning-primary">deferred</span>}
                                </Link>
                            ))}
                        </div>
                    </Section>

                    {featured.length > 0 && (
                        <Section title={`H1 sample answers, ${latest}`} sub="Model answers with examiner notes" action={<DuoButton color="ghost" size="xs" href="/t/write/samples" iconTrailing={ArrowRight}>All samples</DuoButton>}>
                            <div className="grid snap-x auto-cols-[15rem] grid-flow-col gap-4 overflow-x-auto pb-2 scrollbar-hide">
                                {featured.map(({ q, s }) => (
                                    <SampleCard key={`${q.id}${s.letter}`} q={q} s={s} />
                                ))}
                            </div>
                        </Section>
                    )}
                </>
            )}
        </Page>
    );
};
