// Notes: every written lesson in one place, the way Simple Study lists notes. The lessons for each
// exam section, the grammar course by group, and the oral guide.
import { useEffect, useState } from "react";
import { ArrowRight } from "@/components/app/ic";
import { motion } from "motion/react";
import { Link } from "react-router";
import { topicIcon } from "@/components/app/app-sidebar";
import { DuoButton } from "@/components/app/duo";
import { DuoMegaphone, DuoPencil } from "@/components/app/duo-icons";
import { Empty, Page, PageHeader, reveal } from "@/components/app/page-parts";
import { SOON } from "@/lib/soon";
import { BookOpen01 } from "@/components/app/ic";
import { type Lesson, NAV, loadLessons, navName } from "@/lib/data";
import { type Grammar, loadGrammar } from "@/lib/extra";

export const NotesPage = () => {
    const [lessons, setLessons] = useState<Record<string, Lesson[]> | null>(null);
    const [grammar, setGrammar] = useState<Grammar | null>(null);
    useEffect(() => {
        loadLessons().then(setLessons);
        loadGrammar().then(setGrammar);
    }, []);
    const slugs = NAV.flatMap((g) => g.items.flatMap((i) => (i[3] ? i[3].map((c) => c[0]) : [i[0]])));
    const topics = slugs.filter((s) => lessons?.[s]?.length);
    if (SOON.notes)
        return (
            <Page wide>
                <PageHeader title="Notes" sub="Short, clear notes for every part of the exam: how each section works, what the examiner wants, the words and grammar to have ready." />
                <Empty icon={BookOpen01} title="No notes yet" note="Coming soon." />
            </Page>
        );
    return (
        <Page wide>
            <PageHeader title="Notes" sub="Short, clear notes for every part of the exam: how each section works, what the examiner wants, the words and grammar to have ready." />
            <section className="mb-12">
                <h2 className="mb-4 text-xl font-bold text-primary">By section</h2>
                {!lessons ? (
                    <p className="py-10 text-center text-sm text-tertiary">Loading…</p>
                ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {topics.map((slug, i) => {
                            const Icon = topicIcon(slug);
                            const list = lessons[slug];
                            return (
                                <motion.li key={slug} {...reveal(Math.min(i, 6))}>
                                    <Link to={`/t/${slug}/lessons`} className="group flex h-full flex-col rounded-2xl border-2 border-secondary border-b-4 bg-primary p-5 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                                        <div className="flex items-start gap-3">
                                            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary">
                                                <Icon aria-hidden="true" className="size-7" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-md font-bold text-primary">{navName(slug).replace(/\s*\(.*\)$/, "")}</p>
                                                <p className="text-sm text-tertiary">{list.length} notes · {list.reduce((n, l) => n + l.minutes, 0)} min</p>
                                            </div>
                                        </div>
                                        <ul className="mt-4 flex flex-col gap-1.5">
                                            {list.slice(0, 3).map((l) => (
                                                <li key={l.id} className="truncate text-sm text-secondary">
                                                    {l.title.split(" (")[0]}
                                                </li>
                                            ))}
                                            {list.length > 3 && <li className="text-sm font-semibold text-quaternary">and {list.length - 3} more</li>}
                                        </ul>
                                    </Link>
                                </motion.li>
                            );
                        })}
                    </ul>
                )}
            </section>
            <section className="mb-12">
                <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-primary">Grammar</h2>
                        <p className="mt-1 text-md text-tertiary">The tenses, the mutations, numbers, prepositions and the genitive, one lesson at a time.</p>
                    </div>
                    <DuoButton color="ghost" size="xs" href="/grammar" iconTrailing={ArrowRight}>
                        All grammar
                    </DuoButton>
                </div>
                {!grammar ? (
                    <p className="py-10 text-center text-sm text-tertiary">Loading…</p>
                ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {grammar.groups.map((g, i) => (
                            <motion.li key={g.id} {...reveal(Math.min(i, 6))}>
                                <Link to={`/grammar/${g.lessons[0]?.slug ?? ""}`} className="group flex h-full gap-3 rounded-2xl border-2 border-secondary border-b-4 bg-primary p-5 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary">
                                        <DuoPencil aria-hidden="true" className="size-7" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-md font-bold text-primary">{g.en}</span>
                                        <span lang="ga" className="block text-sm text-tertiary">
                                            {g.ga}
                                        </span>
                                        <span className="mt-1.5 block text-xs font-bold text-quaternary">{g.lessons.length} lessons</span>
                                    </span>
                                </Link>
                            </motion.li>
                        ))}
                    </ul>
                )}
            </section>
            <section>
                <Link to="/oral" className="group flex items-center gap-4 rounded-2xl border-2 border-brand bg-brand-primary p-5 outline-focus-ring transition duration-100 ease-linear hover:bg-brand-primary/70 focus-visible:outline-2">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-brand bg-primary">
                        <DuoMegaphone aria-hidden="true" className="size-8" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block duo-label text-brand-secondary">An Bhéaltriail</span>
                        <span className="block text-md font-bold text-primary">The oral, part by part: conversation topics, Sraith Pictiúr and the poems</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="size-5 text-fg-brand-primary transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
            </section>
        </Page>
    );
};
