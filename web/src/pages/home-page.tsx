// Overview: what this is, search, where you left off, every topic by paper, and the exam years.
import { type FC, useEffect, useState } from "react";
import { ArrowRight, CheckCircle, ChevronRight, SearchLg } from "@/components/app/ic";
import { DuoHeadphones, DuoPencil } from "@/components/app/duo-icons";
import { Link, useNavigate } from "react-router";
import { SampleCard } from "@/components/app/question-card";
import { Page } from "@/components/app/page-parts";
import { topicIcon } from "@/components/app/app-sidebar";
import { Badge } from "@/components/base/badges/badges";
import { DuoButton } from "@/components/app/duo";
import { InputBase, TextField } from "@/components/base/input/input";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { D, NAV, type Lesson, checkable, label, loadLessons, navName, qsOfYear, samplesOf, topic, yearKey, yearKeys, yearName } from "@/lib/data";
import { SUBJECT } from "@/lib/explainers";
import { Explainer } from "./topic-page";
import { DuoBooks, DuoMegaphone } from "@/components/app/duo-icons";
import { Play } from "@/components/app/ic";
import { useStore } from "@/lib/store";

export const SearchForm = ({ initial = "", autoFocus }: { initial?: string; autoFocus?: boolean }) => {
    const nav = useNavigate();
    const [v, setV] = useState(initial);
    return (
        <form
            role="search"
            className="flex max-w-xl flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
                e.preventDefault();
                nav(`/search/${encodeURIComponent(v.trim())}`);
            }}
        >
            <TextField aria-label="Search past papers" value={v} onChange={setV} size="md" className="flex-1" autoFocus={autoFocus}>
                <InputBase icon={SearchLg} placeholder="Search a word or theme, e.g. Markievicz" />
            </TextField>
            <DuoButton type="submit" size="md">
                Search
            </DuoButton>
        </form>
    );
};

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

export const HomePage = () => {
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
    // popular lessons: the first lesson of each topic that has them
    const [lessons, setLessons] = useState<Record<string, Lesson[]> | null>(null);
    useEffect(() => {
        loadLessons().then(setLessons);
    }, []);
    const popular = lessons ? Object.entries(lessons).filter(([, l]) => l.length).slice(0, 6).map(([slug, l]) => ({ slug, lesson: l[0], count: l.length })) : [];

    return (
        <Page>
            <header className="border-b-2 border-secondary pb-12">
                <div>
                <p className="duo-label text-brand-secondary">Leaving Certificate · Higher Level</p>
                <h1 className="mt-3 text-display-sm font-bold tracking-tight text-primary md:text-display-md">Irish past papers</h1>
                <div className="mt-4 mb-10">
                    <Explainer slug="subject" given={SUBJECT} fallback={`${total} State exam questions from ${years.at(-1)!.slice(0, 4)} to ${latest}, each beside its official marking scheme. Play the real recordings, write on the paper and check your answers.`} />
                </div>
                <SearchForm />
                </div>
            </header>

            {popular.length > 0 && (
                <Section title="Popular lessons" sub="Short guides for each part of the exam, with the facts picked out" action={<DuoButton color="ghost" size="xs" href="/grammar" iconTrailing={ArrowRight}>Grammar course</DuoButton>}>
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {popular.map(({ slug, lesson, count }) => {
                            const Icon = topicIcon(slug);
                            return (
                                <li key={slug}>
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
                        })}
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
            )}

            {recent.length > 0 && (
                <Section title="Continue where you left off">
                    <ul className="grid gap-3 md:grid-cols-3">
                        {recent.map((q) => (
                            <li key={q.id}>
                                <Link
                                    to={`/q/${q.id}`}
                                    className="flex h-full flex-col gap-1 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary outline-focus-ring transition duration-200 ease-out ring-inset hover:-translate-y-0.5 hover:shadow-md hover:ring-primary focus-visible:outline-2"
                                >
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
                            return (
                                <li key={slug}>
                                    <Link
                                        to={`/t/${slug}`}
                                        className="group flex items-center gap-4 px-4 py-4 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 md:px-6 md:py-5"
                                    >
                                        {(() => {
                                            const Icon = topicIcon(slug);
                                            return (
                                                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary transition duration-150 ease-out group-hover:border-brand">
                                                    <Icon aria-hidden="true" className="size-7" />
                                                </span>
                                            );
                                        })()}
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
                        <Link
                            key={k}
                            to={`/year/${k}`}
                            className="flex h-10 items-center gap-1.5 rounded-xl border-2 border-secondary border-b-4 bg-primary px-3.5 text-sm font-bold text-secondary tabular-nums outline-focus-ring active:translate-y-0.5 active:border-b-2 transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2"
                            aria-label={`${yearName(k)}, ${qsOfYear(k).length} questions`}
                        >
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
        </Page>
    );
};
