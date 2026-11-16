// Lessons for a topic (Studyclix calls this Boost): a reading pane on the left, the lesson list on
// the right, grouped under small headings.
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen01, Clock, Lightbulb02, Play } from "@/components/app/ic";
import { topicIcon } from "@/components/app/app-sidebar";
import { Link } from "react-router";
import { Empty } from "@/components/app/page-parts";
import { Badge } from "@/components/base/badges/badges";
import { DuoButton } from "@/components/app/duo";
import { D, type Lesson, loadLessons } from "@/lib/data";
import { hi } from "@/lib/highlight";
import { cx } from "@/utils/cx";

// Notes you can read at a glance: one idea per block, plenty of air, the facts in yellow.
const Block = ({ b }: { b: Lesson["body"][number] }) => {
    if ("h" in b)
        return (
            <h3 className="mt-14 mb-5 flex items-center gap-4 text-center duo-label text-quaternary first:mt-0">
                <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
                {b.h}
                <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
            </h3>
        );
    if ("list" in b)
        return (
            <ul className="my-7 flex flex-col gap-4">
                {b.list.map((x) => (
                    <li key={x} className="flex items-start gap-4 text-lg leading-8 text-secondary">
                        <span aria-hidden="true" className="mt-3.5 size-2 shrink-0 rounded-full bg-brand-500" />
                        <span>{hi(x, "yellow")}</span>
                    </li>
                ))}
            </ul>
        );
    if ("steps" in b)
        return (
            <ol className="my-7 flex flex-col gap-5">
                {b.steps.map((x, i) => (
                    <li key={x} className="flex items-start gap-4 text-lg leading-8 text-secondary">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white tabular-nums">{i + 1}</span>
                        <span>{hi(x, "yellow")}</span>
                    </li>
                ))}
            </ol>
        );
    if ("terms" in b)
        return (
            <dl className="my-7 overflow-hidden rounded-2xl border-2 border-secondary">
                {b.terms.map(([ga, en], i) => (
                    <div key={ga} className={cx("grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-x-6 px-5 py-3.5 text-md", i > 0 && "border-t-2 border-secondary")}>
                        <dt lang="ga" className="font-bold text-primary">
                            {ga}
                        </dt>
                        <dd className="text-tertiary">{en}</dd>
                    </div>
                ))}
            </dl>
        );
    if ("tip" in b)
        return (
            <aside className="my-9 flex gap-4 rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-5">
                <Lightbulb02 aria-hidden="true" className="mt-1 size-6 shrink-0 text-yellow-600" />
                <div>
                    <p className="duo-label text-yellow-700">Top tip</p>
                    <p className="mt-1.5 text-lg leading-8 text-yellow-950">{b.tip}</p>
                </div>
            </aside>
        );
    return <p className="my-6 text-lg leading-8 text-secondary">{hi(b.p, "yellow")}</p>;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The video at the top of a lesson: the recording when there is one, otherwise a coming-soon frame in the topic's colours. */
const LessonVideo = ({ lesson, slug }: { lesson: Lesson; slug: string }) => {
    const size = "lg" as const;
    const Icon = topicIcon(slug);
    const v = lesson.video;
    if (v?.src)
        return size === "lg" ? (
            <video controls preload="metadata" poster={v.poster} src={v.src} className="aspect-video w-full rounded-2xl border-2 border-secondary bg-black object-cover" />
        ) : (
            <img src={v.poster} alt="" className="aspect-video w-full rounded-lg object-cover" />
        );
    return (
        <div className={cx("relative flex aspect-video w-full items-center justify-center overflow-hidden bg-linear-to-br from-brand-700 via-brand-800 to-gray-900", size === "lg" ? "rounded-2xl border-2 border-secondary" : "rounded-lg")}>
            {size === "lg" && <Icon aria-hidden="true" className="absolute -right-6 -bottom-8 size-56 opacity-20" />}
            {v?.poster && <img src={v.poster} alt="" className="absolute inset-0 size-full object-cover opacity-60" />}
            <span className={cx("relative flex items-center justify-center rounded-full bg-white/95 text-brand-700 shadow-lg", size === "lg" ? "size-16" : "size-7")}>
                <Play aria-hidden="true" className={cx("translate-x-px fill-current", size === "lg" ? "size-7" : "size-3.5")} />
            </span>
            {size === "lg" && (
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-black/60 to-transparent p-5">
                    <div className="min-w-0">
                        <p className="duo-label text-white/70">Video lesson · {v?.seconds ? fmt(v.seconds) : "coming soon"}</p>
                        <p className="mt-1 truncate text-lg font-bold text-white">{lesson.title.split(" (")[0]}</p>
                    </div>
                </div>
            )}

        </div>
    );
};

/** The small preview in the lesson list: the poster or the topic gradient, one play button, nothing else. */
const LessonThumb = ({ lesson, on }: { lesson: Lesson; on: boolean }) => (
    <span className={cx("relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg border-2", on ? "border-brand" : "border-secondary")}>
        {lesson.video?.poster ? <img src={lesson.video.poster} alt="" className="absolute inset-0 size-full object-cover" /> : <span className="absolute inset-0 bg-linear-to-br from-brand-600 to-brand-900" />}
        <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/95 text-brand-700 shadow">
                <Play aria-hidden="true" className="size-3.5 translate-x-px fill-current" />
            </span>
        </span>
    </span>
);

export const LessonsTab = ({ slug, current }: { slug: string; current?: string }) => {
    const [all, setAll] = useState<Record<string, Lesson[]> | null>(null);
    useEffect(() => {
        loadLessons().then(setAll);
    }, []);
    if (!all) return <p className="py-16 text-center text-sm text-tertiary">Loading lessons…</p>;
    // the lessons were written for the Irish Higher topics; another subject's topic of the same slug has none yet
    const lessons = (D().subject === "irish" && D().level === "higher" && all[slug]) || [];
    if (!lessons.length)
        return (
            <Empty icon={BookOpen01} title="Lessons are on the way" note="Short guides and video lessons for this topic will appear here. The questions and marking schemes are ready now.">
                <DuoButton color="secondary" size="sm" href={`/t/${slug}`}>
                    Go to the questions
                </DuoButton>
            </Empty>
        );
    const lesson = lessons.find((l) => l.id === current) || lessons[0];
    const groups = [...new Set(lessons.map((l) => l.group))];
    const next = lessons[lessons.indexOf(lesson) + 1];

    return (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <article className="min-w-0">
                <LessonVideo lesson={lesson} slug={slug} />
                <div className="mt-5 flex items-center gap-2">
                    <Badge size="sm" type="pill-color" color={lesson.kind === "guide" ? "brand" : "blue"}>
                        {lesson.kind === "guide" ? "Guide" : "Tutorial"}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs font-medium text-tertiary">
                        <Clock aria-hidden="true" className="size-3.5" />
                        {lesson.minutes} min
                    </span>
                </div>
                <h2 className="mt-3 text-display-xs font-bold text-primary md:text-display-sm">{lesson.title.split(" (")[0]}</h2>
                {lesson.title.includes(" (") && <p className="mt-1 text-lg text-tertiary">{lesson.title.slice(lesson.title.indexOf(" (") + 2, -1)}</p>}
                <div className="mt-8 max-w-2xl">
                    {lesson.body.map((b, i) => (
                        <Block key={i} b={b} />
                    ))}
                </div>
                <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t-2 border-secondary pt-6">
                    <DuoButton color="ghost" size="sm" href={`/t/${slug}`} iconLeading={BookOpen01}>
                        Practise with the questions
                    </DuoButton>
                    {next && (
                        <DuoButton color="secondary" size="sm" href={`/t/${slug}/lessons/${next.id}`} iconTrailing={ArrowRight}>
                            Next: {next.title.split(" (")[0]}
                        </DuoButton>
                    )}
                </div>
            </article>
            <aside className="rounded-2xl border-2 border-secondary bg-primary p-4 lg:sticky lg:top-24">
                <p className="px-2 pb-1 duo-label text-quaternary">Lessons in this topic</p>
                {groups.map((g) => (
                    <div key={g} className="mt-4 first:mt-0">
                        <p className="px-2 pb-2 text-xs font-bold text-tertiary">{g}</p>
                        <ul className="flex flex-col gap-1.5">
                            {lessons
                                .filter((l) => l.group === g)
                                .map((l) => {
                                    const on = l.id === lesson.id;
                                    return (
                                        <li key={l.id}>
                                            <Link
                                                to={`/t/${slug}/lessons/${l.id}`}
                                                aria-current={on ? "page" : undefined}
                                                className={cx(
                                                    "flex items-center gap-3 rounded-xl border-2 p-2.5 outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                                                    on ? "border-brand bg-brand-primary" : "border-transparent hover:bg-primary_hover",
                                                )}
                                            >
                                                <LessonThumb lesson={l} on={on} />
                                                <span className="min-w-0 flex-1">
                                                    <span className={cx("block truncate text-sm font-bold", on ? "text-brand-secondary" : "text-primary")} title={l.title}>
                                                        {l.title.split(" (")[0]}
                                                    </span>
                                                    <span className="mt-1 block text-xs font-semibold text-quaternary">
                                                        {l.kind === "guide" ? "Guide" : "Video"} · {l.video?.seconds ? fmt(l.video.seconds) : `${l.minutes} min`}
                                                    </span>
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                        </ul>
                    </div>
                ))}
            </aside>
        </div>
    );
};
