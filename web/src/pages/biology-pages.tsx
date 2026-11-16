// Biology: the subject page with its guided lessons by topic, and the lesson itself running in the
// Brilliant-style player with the tutor's column closed to start.
import { ArrowRight, Clock } from "@/components/app/ic";
import { motion } from "motion/react";
import { Link, useParams } from "react-router";
import { CellArt } from "@/components/app/cell-art";
import { DuoButton } from "@/components/app/duo";
import { DuoBulb } from "@/components/app/duo-icons";
import { Page, PageHeader, reveal } from "@/components/app/page-parts";
import { BIOLOGY, guidedLesson } from "@/lib/guided";
import { get, set } from "@/lib/store";
import { cx } from "@/utils/cx";
import { BrilliantLesson } from "./lesson-player";
import { NotFound } from "./not-found";

export const BiologyHome = () => (
    <Page wide>
        <PageHeader kicker="Leaving Certificate · Higher Level" title="Biology" sub="Guided lessons that teach each concept the way a good tutor would: a picture you can play with, a few lines at a time, then questions to make it stick. Past papers for Biology are on the way." />
        <section className="mb-12 overflow-hidden rounded-3xl border-2 border-secondary bg-primary">
            <div className="grid items-center gap-6 p-6 md:grid-cols-[minmax(0,1fr)_22rem] md:p-8">
                <div>
                    <p className="duo-label text-brand-secondary">Start here</p>
                    <h2 className="mt-2 text-2xl font-bold text-primary">Mitosis</h2>
                    <p className="mt-2 max-w-lg text-md leading-7 text-tertiary">How one cell becomes two identical cells: the cell cycle, the four phases and cytokinesis, with a cell you can step through phase by phase.</p>
                    <div className="mt-5 flex items-center gap-3">
                        <DuoButton href="/biology/learn/mitosis" iconTrailing={ArrowRight}>
                            Start lesson
                        </DuoButton>
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-quaternary">
                            <Clock className="size-4" /> 8 min
                        </span>
                    </div>
                </div>
                <div className="rounded-2xl bg-secondary_subtle p-4">
                    <CellArt phase="metaphase" labels={false} />
                </div>
            </div>
        </section>
        {BIOLOGY.map((t, gi) => (
            <motion.section key={t.slug} id={t.slug} {...reveal(Math.min(gi, 6))} className="mb-12 scroll-mt-24">
                <div className="mb-4">
                    <h2 className="text-xl font-bold text-primary">{t.name}</h2>
                    <p className="mt-1 text-md text-tertiary">{t.sub}</p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {t.lessons.map((l) => {
                        const inner = (
                            <>
                                <span className={cx("flex size-12 shrink-0 items-center justify-center rounded-xl border-2", l.ready ? "border-secondary bg-primary" : "border-dashed border-secondary")}>
                                    <DuoBulb aria-hidden="true" className={cx("size-7", !l.ready && "opacity-40 saturate-0")} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={cx("block text-md font-bold", l.ready ? "text-primary" : "text-quaternary")}>{l.title}</span>
                                    <span className="mt-0.5 block text-sm text-tertiary">{l.sub}</span>
                                    <span className="mt-2 block text-xs font-bold text-quaternary">{l.ready ? `${l.steps.length} steps · ${l.minutes} min` : "Coming soon"}</span>
                                </span>
                            </>
                        );
                        return (
                            <li key={l.slug}>
                                {l.ready ? (
                                    <Link to={`/biology/learn/${l.slug}`} className="group flex h-full gap-4 rounded-2xl border-2 border-secondary border-b-4 bg-primary p-5 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                                        {inner}
                                    </Link>
                                ) : (
                                    <div className="flex h-full gap-4 rounded-2xl border-2 border-dashed border-secondary p-5">{inner}</div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </motion.section>
        ))}
    </Page>
);

export const GuidedLessonPage = () => {
    const { slug = "" } = useParams();
    const l = guidedLesson(slug);
    if (!l || !l.ready) return <NotFound />;
    return (
        <BrilliantLesson
            steps={l.steps}
            title={l.title}
            closeHref="/biology"
            defaultSide={false}
            onFinish={(_r, got) => set("quizScores", { ...get().quizScores, [`guided:${l.slug}`]: { got, total: l.steps.filter((s) => s.kind === "question").length, at: Date.now() } })}
        />
    );
};
