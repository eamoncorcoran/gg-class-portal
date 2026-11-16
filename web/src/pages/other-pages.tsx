// The smaller pages: one question, exam years, one year, saved, search, and building/sitting an exam.
import { useEffect, useMemo, useState } from "react";
import { BookOpen01, BookmarkCheck, Grid01, List, SearchLg } from "@/components/app/ic";
import { Link, useParams } from "react-router";
import { QuestionCard } from "@/components/app/question-card";
import { Empty, JumpBar, Page, PageHeader } from "@/components/app/page-parts";
import { DuoButton } from "@/components/app/duo";
import { D, label, navName, qsOfYear, yearKeys, yearName } from "@/lib/data";
import { groupByTopic, searchExtras, searchQuestions, searchTopics, searchYears } from "@/lib/search";
import { topicIcon } from "@/components/app/app-sidebar";
import { remember, useStore } from "@/lib/store";
import { SearchForm } from "./home-page";
import { NotFound } from "./not-found";

export const QuestionPage = () => {
    const { id = "" } = useParams();
    const q = D().q[id];
    useEffect(() => {
        if (q) remember(q.id);
    }, [q]);
    if (!q) return <NotFound />;
    const slug = D().topicOf[id];
    return (
        <Page>
            <PageHeader
                kicker={`${navName(slug)} · ${yearName(`${q.year}${q.deferred ? "D" : ""}`)}`}
                title={label(q)}
                actions={
                    <DuoButton color="secondary" size="sm" href={`/t/${slug}`} iconLeading={List}>
                        All {navName(slug).toLowerCase()} questions
                    </DuoButton>
                }
            />
            <QuestionCard q={q} />
        </Page>
    );
};

export const YearsPage = () => (
    <Page>
        <PageHeader title="Exam years" sub="Pick a sitting to see every question from it, across all topics." />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {yearKeys().map((k) => (
                <li key={k}>
                    <Link
                        to={`/year/${k}`}
                        className="flex flex-col rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2"
                    >
                        <span className="text-xl font-semibold text-primary tabular-nums">{k.slice(0, 4)}</span>
                        <span className="text-sm text-tertiary">
                            {k.endsWith("D") ? "Deferred" : "June"} · {qsOfYear(k).length} questions
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    </Page>
);

export const YearPage = () => {
    const { key = "" } = useParams();
    const qs = qsOfYear(key);
    if (!qs.length) return <NotFound />;
    const byTopic = D()
        .topics.filter((t) => !t.course2027)
        .map((t) => ({ t, qs: t.questions.filter((q) => qs.includes(q)) }))
        .filter((x) => x.qs.length);
    return (
        <Page>
            <PageHeader kicker="Exam year" title={`${key.slice(0, 4)} Leaving Certificate${key.endsWith("D") ? " (deferred)" : ""}`} sub={`${qs.length} questions from this sitting, grouped by topic.`} />
            <div className="sticky top-16 z-20 -mx-4 mb-8 border-b-2 border-secondary bg-primary/95 px-4 backdrop-blur-md md:-mx-8 md:px-8">
                <JumpBar label="Jump to a topic" items={byTopic.map(({ t }) => ({ id: `y-${t.slug}`, label: navName(t.slug) }))} />
            </div>
            {byTopic.map(({ t, qs }) => (
                <section key={t.slug} id={`y-${t.slug}`} className="mb-12 scroll-mt-40">
                    <h2 className="mb-4 text-xl font-semibold text-primary">{navName(t.slug)}</h2>
                    {qs.map((q) => (
                        <QuestionCard key={q.id} q={q} />
                    ))}
                </section>
            ))}
        </Page>
    );
};

export const SavedPage = () => {
    const ids = useStore((s) => s.saved);
    const list = ids.map((id) => D().q[id]).filter(Boolean);
    return (
        <Page>
            <PageHeader title="Saved" sub={list.length ? `${list.length} question${list.length === 1 ? "" : "s"} saved for revision.` : undefined} />
            {list.length ? (
                list.map((q) => <QuestionCard key={q.id} q={q} />)
            ) : (
                <Empty icon={BookmarkCheck} title="Nothing saved yet" note="Press Save on any question to keep it here for revision.">
                    <DuoButton href="/" iconLeading={Grid01}>
                        Browse topics
                    </DuoButton>
                </Empty>
            )}
        </Page>
    );
};

export const SearchPage = () => {
    const { term = "" } = useParams();
    const q = term.trim();
    const topics = useMemo(() => searchTopics(q), [q]);
    const extras = useMemo(() => [...searchYears(q), ...searchExtras(q)], [q]);
    const hits = useMemo(() => searchQuestions(q), [q]);
    const groups = useMemo(() => groupByTopic(hits), [hits]);
    const [shown, setShown] = useState(40);
    useEffect(() => setShown(40), [q]);
    const nothing = q && !topics.length && !extras.length && !hits.length;
    let left = shown;
    return (
        <Page wide>
            <PageHeader title={q ? `“${term}”` : "Search"} sub={q ? `${topics.length ? `${topics.length} topic${topics.length === 1 ? "" : "s"} and ` : ""}${hits.length} question${hits.length === 1 ? "" : "s"} across every past paper.` : "Topics in Irish or English, every question and marking scheme, any exam year."}>
                <div className="mt-6">
                    <SearchForm key={term} initial={term} autoFocus={!term} />
                </div>
                {!q && <p className="mt-3 text-sm text-tertiary">Try fógra, announcement, aiste, léamhthuiscint, prose, Géibheann, or a year like 2024.</p>}
            </PageHeader>

            {nothing && <Empty icon={SearchLg} title="No results" note={`Nothing matches “${term}”. Try an Irish or English word for the topic, a word from the question, or an exam year.`} />}

            {(topics.length > 0 || extras.length > 0) && (
                <section className="mb-10">
                    <h2 className="mb-3 duo-label text-quaternary">Topics</h2>
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {topics.map((t) => {
                            const Icon = topicIcon(t.slug);
                            return (
                                <li key={t.slug}>
                                    <Link to={t.href} className="flex h-full items-center gap-3 rounded-2xl border-2 border-secondary border-b-4 bg-primary p-4 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                                        <Icon aria-hidden="true" className="size-9 shrink-0" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-md font-bold text-primary">{t.name}</span>
                                            <span className="block truncate text-sm text-tertiary">{t.irish} · {t.group}</span>
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                        {extras.map((e) => (
                            <li key={e.href}>
                                <Link to={e.href} className="flex h-full items-center gap-3 rounded-2xl border-2 border-secondary border-b-4 bg-primary p-4 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                                    <span className="min-w-0">
                                        <span className="block truncate text-md font-bold text-primary">{e.title}</span>
                                        <span className="block truncate text-sm text-tertiary">{e.sub}</span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {groups.map((g) => {
                if (left <= 0) return null;
                const list = g.list.slice(0, left);
                left -= list.length;
                return (
                    <section key={g.slug} className="mb-10">
                        <div className="mb-3 flex items-baseline justify-between gap-3">
                            <h2 className="text-lg font-bold text-primary">
                                <Link to={`/t/${g.slug}`} className="hover:underline">{g.name}</Link>
                                <span className="ml-2 text-sm font-semibold text-quaternary">{g.list.length} question{g.list.length === 1 ? "" : "s"}</span>
                            </h2>
                            {g.irish && <span className="text-sm text-tertiary">{g.irish}</span>}
                        </div>
                        <div className="flex flex-col gap-4">
                            {list.map((h) => (
                                <QuestionCard key={h.q.id} q={h.q} />
                            ))}
                        </div>
                    </section>
                );
            })}
            {hits.length > shown && (
                <div className="flex justify-center">
                    <DuoButton color="secondary" onPress={() => setShown((n) => n + 40)}>
                        Show More ({hits.length - shown} more)
                    </DuoButton>
                </div>
            )}
        </Page>
    );
};

/* ---------------- exam ---------------- */
export const LevelPage = () => {
    const { level = "" } = useParams();
    const name = level === "foundation" ? "Foundation" : "Ordinary";
    return (
        <Page>
            <PageHeader kicker="Leaving Certificate" title={`Irish, ${name} Level`} />
            <Empty icon={BookOpen01} title={`${name} Level papers are on the way`} note="Every Higher Level question is ready now, with the official marking schemes and recordings.">
                <DuoButton href="/">
                    Browse Higher Level
                </DuoButton>
            </Empty>
        </Page>
    );
};
