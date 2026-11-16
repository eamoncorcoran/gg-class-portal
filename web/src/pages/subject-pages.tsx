// Every subject other than Irish Higher lives under /<subject>/<level>: the same topic, question, year
// and search pages as the Irish site, fed from site/subjects/<subject>/<level>/data.json, plus a
// home page built from the subject's category tree (sections of topics, in Studyclix's order).
import { type ReactNode, useEffect, useState } from "react";
import { ArrowRight, BookOpen01, ChevronRight, SearchLg } from "@/components/app/ic";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoBooks, DuoCheckDoc, DuoHeadphones, DuoPencil } from "@/components/app/duo-icons";
import { Empty, Page } from "@/components/app/page-parts";
import { Badge } from "@/components/base/badges/badges";
import { InputBase, TextField } from "@/components/base/input/input";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { D, LEVEL_LABEL, basePath, checkable, levelsOf, loadSubject, nav, qsOfYear, subjectInfo, topic, useSubjectStore, yearKeys, yearName } from "@/lib/data";
import { useStore } from "@/lib/store";
import { NotFound } from "./not-found";
import { QuestionPage, SearchPage, YearPage, YearsPage } from "./other-pages";
import { TopicPage } from "./topic-page";

/** Root links inside a subject ("/t/slug", "/q/id", "/year/2024", "/years", "/search/x") are rebased onto the subject's prefix. */
const ROOTED = /^\/(t|q|year|years|search)(\/|$)|^\/$/;
const LinkBase = ({ base, children }: { base: string; children: ReactNode }) => {
    const go = useNavigate();
    return (
        <div
            onClickCapture={(e) => {
                if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
                if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
                const href = a.getAttribute("href") || "";
                if (!ROOTED.test(href) || href.startsWith(base + "/") || href === base) return;
                e.preventDefault();
                e.stopPropagation();
                go(href === "/" ? base : base + href);
            }}
        >
            {children}
        </div>
    );
};

const Skeleton = () => (
    <Page>
        <div className="animate-pulse" aria-busy="true" aria-label="Loading the papers">
            <div className="h-4 w-40 rounded-md bg-secondary" />
            <div className="mt-4 h-10 w-80 rounded-md bg-secondary" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-2xl border-2 border-secondary" />
                ))}
            </div>
        </div>
    </Page>
);

const ComingSoon = ({ subject, level }: { subject: string; level: string }) => {
    const info = subjectInfo(subject);
    const other = levelsOf(subject).filter((l) => l !== level);
    return (
        <Page>
            <header className="mb-10 border-b-2 border-secondary pb-8">
                <p className="duo-label text-brand-secondary">Leaving Certificate · {LEVEL_LABEL[level] ?? level} Level</p>
                <h1 className="mt-2 text-display-xs font-bold tracking-tight text-primary md:text-display-sm">{info?.name ?? subject}</h1>
            </header>
            <Empty icon={BookOpen01} title={`${LEVEL_LABEL[level] ?? level} Level papers are on the way`} note="The State exam questions for this subject are being cut from the official papers and marking schemes.">
                <div className="flex flex-wrap gap-3">
                    {other.map((l) => (
                        <DuoButton key={l} color="secondary" size="sm" href={basePath(subject, l) || "/"}>
                            {LEVEL_LABEL[l]} Level
                        </DuoButton>
                    ))}
                    <DuoButton size="sm" href="/">
                        Irish past papers
                    </DuoButton>
                </div>
            </Empty>
        </Page>
    );
};

/** The subject's search box: sends the term to this subject's search page. */
const SubjectSearch = ({ base }: { base: string }) => {
    const go = useNavigate();
    const [v, setV] = useState("");
    return (
        <form
            role="search"
            className="flex max-w-xl flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
                e.preventDefault();
                if (v.trim()) go(`${base}/search/${encodeURIComponent(v.trim())}`);
            }}
        >
            <TextField aria-label="Search these papers" value={v} onChange={setV} size="md" className="flex-1">
                <InputBase icon={SearchLg} placeholder="Search a word or topic in the questions" />
            </TextField>
            <DuoButton type="submit" size="md">
                Search
            </DuoButton>
        </form>
    );
};

const Section = ({ icon: Icon, title, sub, action, children }: { icon?: typeof DuoBooks; title: string; sub?: string; action?: ReactNode; children: ReactNode }) => (
    <section className="mt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
            <div className="flex items-center gap-4">
                {Icon && (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary">
                        <Icon aria-hidden="true" className="size-7" />
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

/** The home of one subject and level: what it is, search, every topic by section, the exam years. */
export const SubjectHome = () => {
    const d = D();
    const info = subjectInfo(d.subject);
    const base = basePath(d.subject, d.level);
    const checks = useStore((s) => s.checks);
    const years = yearKeys();
    // a question filed under two topics is still one question
    const unique = [...new Map(d.topics.flatMap((t) => t.questions).map((q) => [q.id, q])).values()];
    const total = unique.length;
    const marked = unique.filter((q) => checkable(q)).length;
    const groups = nav();
    const first = years.at(-1)?.slice(0, 4), last = years.find((k) => !k.endsWith("D"))?.slice(0, 4);
    return (
        <Page>
            <header className="border-b-2 border-secondary pb-12">
                <p className="duo-label text-brand-secondary">Leaving Certificate · {LEVEL_LABEL[d.level] ?? d.level} Level</p>
                <h1 className="mt-3 text-display-sm font-bold tracking-tight text-primary md:text-display-md">{info?.name ?? d.subject} past papers</h1>
                <p className="mt-4 mb-10 max-w-3xl text-md text-tertiary">
                    {total} State exam questions from {first} to {last}, cut from the official papers and set beside their marking schemes.
                    {marked > 0 && ` ${marked} of them can be answered on the page and checked against the scheme.`}
                    {info?.aural && " Listening questions play the official recording."}
                </p>
                <SubjectSearch base={base} />
            </header>

            {groups.map((g, gi) => (
                <Section key={g.group || gi} icon={gi === 0 ? DuoBooks : info?.aural && /aural|listening/i.test(g.group) ? DuoHeadphones : DuoPencil} title={g.group || "Topics"} sub={g.sub || undefined}>
                    <ul className="divide-y-2 divide-secondary overflow-hidden rounded-2xl border-2 border-secondary bg-primary">
                        {g.items.map(([slug, en]) => {
                            const t = topic(slug);
                            if (!t || !t.questions.length) return null;
                            const ys = t.questions.map((x) => x.year);
                            const done = t.questions.filter((q) => checks[q.id]).length;
                            return (
                                <li key={slug}>
                                    <Link to={`${base}/t/${slug}`} className="group flex items-center gap-4 px-4 py-4 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 md:px-6 md:py-5">
                                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary transition duration-150 ease-out group-hover:border-brand">
                                            <DuoCheckDoc aria-hidden="true" className="size-7" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-md font-semibold text-primary">{en}</span>
                                            <span className="block truncate text-sm text-tertiary">
                                                {t.questions.length} question{t.questions.length === 1 ? "" : "s"}
                                                <span className="md:hidden"> · {Math.min(...ys)}–{Math.max(...ys)}</span>
                                            </span>
                                        </span>
                                        {done ? (
                                            <span className="hidden items-center gap-2 text-sm text-tertiary md:flex">
                                                <ProgressBarBase value={done} max={t.questions.length} className="h-1.5 w-14" />
                                                {done} checked
                                            </span>
                                        ) : t.questions.some(checkable) ? (
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

            <Section title="Exam years" sub="Every question from one sitting, across all topics" action={<DuoButton color="ghost" size="xs" href={`${base}/years`} iconTrailing={ArrowRight}>All years</DuoButton>}>
                <div className="flex flex-wrap gap-2">
                    {years.map((k) => (
                        <Link
                            key={k}
                            to={`${base}/year/${k}`}
                            className="flex h-10 items-center gap-1.5 rounded-xl border-2 border-secondary border-b-4 bg-primary px-3.5 text-sm font-bold text-secondary tabular-nums outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2"
                            aria-label={`${yearName(k)}, ${qsOfYear(k).length} questions`}
                        >
                            {k.slice(0, 4)}
                            {k.endsWith("D") && <span className="text-xs font-medium text-warning-primary">deferred</span>}
                        </Link>
                    ))}
                </div>
            </Section>
        </Page>
    );
};

/** /:subject/:level/*: loads that subject, makes it the current one and serves the shared pages under its prefix. */
export const SubjectArea = () => {
    const { subject = "", level = "" } = useParams();
    const [state, setState] = useState<"loading" | "ok" | "missing">(useSubjectStore(subject, level) ? "ok" : "loading");
    useEffect(() => {
        let on = true;
        if (!useSubjectStore(subject, level)) {
            setState("loading");
            loadSubject(subject, level).then((d) => on && setState(d ? "ok" : "missing"));
        } else setState("ok");
        return () => {
            on = false;
            useSubjectStore("irish", "higher"); // the root pages are the Irish site
        };
    }, [subject, level]);
    if (subject === "irish" && level === "higher") return <Navigate to="/" replace />;
    if (!subjectInfo(subject) || !levelsOf(subject).includes(level)) return <NotFound />;
    if (state === "loading") return <Skeleton />;
    if (state === "missing") return <ComingSoon subject={subject} level={level} />;
    useSubjectStore(subject, level);
    const base = basePath(subject, level);
    return (
        <LinkBase base={base}>
            <Routes>
                <Route index element={<SubjectHome />} />
                <Route path="t/:slug" element={<TopicPage />} />
                <Route path="t/:slug/:tab" element={<TopicPage />} />
                <Route path="t/:slug/:tab/:item" element={<TopicPage />} />
                <Route path="q/:id" element={<QuestionPage />} />
                <Route path="years" element={<YearsPage />} />
                <Route path="year/:key" element={<YearPage />} />
                <Route path="search/:term?" element={<SearchPage />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </LinkBase>
    );
};
