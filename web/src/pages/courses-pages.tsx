// Courses: the class recordings in the order we taught them (one lesson per week of the plan), and
// the on-demand phrase practice. A course page is the player with the contents down the side.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Play, PlayCircle } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";
import { Link, useParams } from "react-router";
import { DuoButton, DuoProgress } from "@/components/app/duo";
import { DuoBooks, DuoBubbles } from "@/components/app/duo-icons";
import { Page, PageHeader } from "@/components/app/page-parts";
import { toast } from "@/components/app/toast";
import { type Course, type Lesson, type Phrase, findLesson, fmtDur, fmtShort, initials, lessonsOf, useHub } from "@/lib/hub";
import { say } from "@/lib/sfx";
import { get, set, useStore } from "@/lib/store";
import { cx } from "@/utils/cx";
import { NotFound } from "./not-found";

const useProgress = () => useStore((s) => s.hubProgress);
const markDone = (id: string, on: boolean) => set("hubProgress", { ...get().hubProgress, [id]: { ...get().hubProgress[id], done: on ? Date.now() : undefined } });
const pct = (c: Course, p: Record<string, { done?: number }>) => {
    const ls = lessonsOf(c);
    return ls.length ? Math.round((100 * ls.filter((l) => p[l.id]?.done).length) / ls.length) : 0;
};

const CourseCard = ({ c }: { c: Course }) => {
    const p = useProgress();
    const ls = lessonsOf(c);
    const done = ls.filter((l) => p[l.id]?.done).length;
    const resume = ls.find((l) => !p[l.id]?.done && l.video) ?? ls[0];
    return (
        <li>
            <Link to={`/courses/${c.id}${resume ? `/${resume.id}` : ""}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border-2 border-secondary border-b-4 bg-primary outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                <div className="relative flex aspect-[2/1] items-center justify-center bg-linear-to-br from-brand-600 to-brand-900">
                    {c.cover ? <img src={c.cover} alt="" className="absolute inset-0 size-full object-cover" /> : <span className="text-display-md font-black text-white/90">{initials(c.title)}</span>}
                    {c.onDemand && <span className="absolute top-3 left-3 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold tracking-wide text-brand-700 uppercase">On-demand</span>}
                    <span className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-white/95 text-brand-700 shadow transition group-hover:scale-105">
                        <Play aria-hidden="true" className="size-4 translate-x-px fill-current" />
                    </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-lg font-bold text-primary">{c.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-tertiary">{c.description}</p>
                    <div className="mt-auto pt-5">
                        <div className="mb-2 flex items-center justify-between text-xs font-bold text-tertiary">
                            <span>
                                {ls.length} {ls.length === 1 ? "lesson" : "lessons"}
                            </span>
                            <span className="text-brand-secondary">{pct(c, p)}% complete</span>
                        </div>
                        <DuoProgress value={pct(c, p)} className="h-3" />
                        <p className="mt-2 text-xs text-quaternary">
                            {done} of {ls.length} done
                        </p>
                    </div>
                </div>
            </Link>
        </li>
    );
};

export const CoursesPage = () => {
    const hub = useHub();
    if (!hub) return <Page>{null}</Page>;
    return (
        <Page wide>
            <PageHeader icon={<DuoBooks aria-hidden="true" className="size-14" />} kicker={hub.klass.name} title="Courses" sub="Every class recording, in the order we taught them, with what each week covered and the homework that went with it." />
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {hub.courses.map((c) => (
                    <CourseCard key={c.id} c={c} />
                ))}
            </ul>
        </Page>
    );
};

/** The practice player: the video pauses on each phrase; hear it, say it, carry on. */
const PracticePlayer = ({ phrases, videoUrl }: { phrases: Phrase[]; videoUrl?: string }) => {
    const vid = useRef<HTMLVideoElement>(null);
    const [cur, setCur] = useState<Phrase | null>(null);
    const [shown, setShown] = useState<Set<string>>(new Set());
    const [reveal, setReveal] = useState(false);
    useEffect(() => {
        const v = vid.current;
        if (!v) return;
        const tick = () => {
            if (v.paused) return;
            const p = phrases.find((x) => !shown.has(x.id) && v.currentTime >= x.at);
            if (p) {
                v.pause();
                setCur(p);
                setReveal(false);
                setShown(new Set([...shown, p.id]));
            }
        };
        v.addEventListener("timeupdate", tick);
        return () => v.removeEventListener("timeupdate", tick);
    }, [phrases, shown]);
    const go = () => {
        setCur(null);
        vid.current?.play();
    };
    return (
        <div className="relative overflow-hidden rounded-2xl border-2 border-secondary bg-black">
            {videoUrl ? <video ref={vid} src={videoUrl} controls playsInline className="aspect-video w-full" /> : <div className="flex aspect-video items-center justify-center text-sm text-white/70">No video for this practice yet</div>}
            {cur && (
                <div className="absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-black/80 to-transparent p-4 pt-16">
                    <div className="w-full max-w-md rounded-2xl border-2 border-secondary bg-primary p-5 shadow-xl duration-200 animate-in slide-in-from-bottom-2">
                        <p className="duo-label text-brand-secondary">Say it</p>
                        <p lang="ga" className="mt-1 text-display-xs font-bold text-primary">
                            {cur.irish}
                        </p>
                        {cur.phonetic && <p className="mt-1 text-sm font-semibold text-quaternary">{cur.phonetic}</p>}
                        <p className={cx("mt-2 text-md text-secondary transition", !reveal && "blur-sm select-none")}>{cur.english}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <DuoButton size="sm" color="secondary" onPress={() => say(cur.irish, "ga")}>
                                Hear it
                            </DuoButton>
                            {!reveal && (
                                <DuoButton size="sm" color="ghost" onPress={() => setReveal(true)}>
                                    Show English
                                </DuoButton>
                            )}
                            <DuoButton size="sm" onPress={go} iconTrailing={ArrowRight} className="ml-auto">
                                Continue
                            </DuoButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/** What plays at the top of a lesson: an embed, a Zoom link card, a file, the practice player, or "not yet". */
const Player = ({ l }: { l: Lesson }) => {
    const v = l.video;
    const past = l.recordedOn && +new Date(l.recordedOn) < Date.now();
    if (!v)
        return (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border-2 border-secondary bg-linear-to-br from-brand-600 to-brand-900 p-6 text-center text-white">
                <PlayCircle aria-hidden="true" className="size-12 opacity-90" />
                <p className="text-lg font-bold">{past ? "Recording not uploaded yet" : "Recorded after the class"}</p>
                <p className="max-w-sm text-sm text-white/80">{past ? "This week's recording has not been added to the hub yet. The topics and homework are below." : `This class is on ${l.recordedOn ? fmtShort(new Date(l.recordedOn)) : "the way"}. The recording lands here afterwards.`}</p>
            </div>
        );
    if (v.type === "iframe") return <iframe title={l.title} src={v.src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="aspect-video w-full rounded-2xl border-2 border-secondary bg-black" />;
    if (v.type === "file") return <video src={v.src} controls playsInline className="aspect-video w-full rounded-2xl border-2 border-secondary bg-black" />;
    if (v.type === "practice") return <PracticePlayer phrases={v.phrases} videoUrl={v.videoUrl} />;
    return (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border-2 border-secondary bg-secondary p-6 text-center">
            <p className="text-lg font-bold text-primary">This class was recorded on Zoom</p>
            {v.passcode && (
                <p className="text-sm text-tertiary">
                    Passcode <span className="font-mono font-bold text-primary">{v.passcode}</span>
                </p>
            )}
            <a href={v.src} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-[50px] items-center rounded-2xl border-2 border-transparent border-b-4 border-b-brand-700 bg-brand-500 px-4 text-[15px] font-bold tracking-[0.8px] text-white uppercase">
                Watch the recording
            </a>
        </div>
    );
};

/** The contents down the side: each term folds, lessons numbered, ticked when done. */
const Contents = ({ c, current }: { c: Course; current: string }) => {
    const p = useProgress();
    const ls = lessonsOf(c);
    const done = ls.filter((l) => p[l.id]?.done).length;
    return (
        <aside className="rounded-2xl border-2 border-secondary bg-primary">
            <div className="border-b-2 border-secondary p-4">
                <p className="text-md font-bold text-primary">{c.title}</p>
                <p className="mt-1 text-xs font-semibold text-tertiary">
                    {done} of {ls.length} done
                </p>
                <DuoProgress value={ls.length ? (100 * done) / ls.length : 0} className="mt-2 h-2.5" />
            </div>
            {c.modules.map((m) => (
                <Fold key={m.id} title={m.title} open={m.lessons.some((l) => l.id === current)} count={m.lessons.length}>
                    <ul>
                        {m.lessons.map((l) => {
                            const on = l.id === current;
                            const ok = !!p[l.id]?.done;
                            return (
                                <li key={l.id}>
                                    <Link to={`/courses/${c.id}/${l.id}`} aria-current={on ? "page" : undefined} className={cx("flex items-center gap-3 border-l-4 px-4 py-2.5 text-sm outline-focus-ring transition duration-100 ease-linear focus-visible:-outline-offset-2 focus-visible:outline-2", on ? "border-brand bg-brand-primary" : "border-transparent hover:bg-primary_hover")}>
                                        <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", ok ? "bg-brand-solid text-white" : "bg-secondary text-tertiary")}>{ok ? <Check className="size-3.5" aria-hidden="true" /> : (l.week ?? ls.indexOf(l) + 1)}</span>
                                        <span className={cx("min-w-0 flex-1 truncate font-semibold", on ? "text-brand-secondary" : "text-secondary")}>{l.title}</span>
                                        <span className="shrink-0 text-xs text-quaternary">{l.video ? fmtDur(l.durationSeconds) : l.recordedOn && +new Date(l.recordedOn) < Date.now() ? "no video" : "soon"}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </Fold>
            ))}
        </aside>
    );
};
const Fold = ({ title, count, open: start, children }: { title: string; count: number; open: boolean; children: React.ReactNode }) => {
    const [open, setOpen] = useState(start);
    useEffect(() => {
        if (start) setOpen(true);
    }, [start]);
    return (
        <section className="border-b-2 border-secondary last:border-b-0">
            <AriaButton onPress={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left outline-focus-ring hover:bg-primary_hover focus-visible:-outline-offset-2 focus-visible:outline-2">
                <span className="flex-1 duo-label text-quaternary">{title}</span>
                <span className="text-xs text-quaternary">{count}</span>
                <ChevronDown aria-hidden="true" className={cx("size-4 text-fg-quaternary transition-transform", open && "-scale-y-100")} />
            </AriaButton>
            {open && <div className="pb-2">{children}</div>}
        </section>
    );
};

export const CoursePage = () => {
    const { id = "", lesson } = useParams();
    const hub = useHub();
    const p = useProgress();
    if (!hub) return <Page>{null}</Page>;
    const c = hub.courses.find((x) => x.id === id);
    if (!c) return <NotFound />;
    const ls = lessonsOf(c);
    const l = (lesson && findLesson(hub, lesson)?.lesson) || ls.find((x) => !p[x.id]?.done && x.video) || ls[0];
    if (!l) return <NotFound />;
    const i = ls.indexOf(l);
    const next = ls[i + 1];
    const done = !!p[l.id]?.done;
    return (
        <Page wide>
            <div className="mb-6">
                <DuoButton color="ghost" size="sm" href="/courses" iconLeading={ArrowLeft}>
                    All courses
                </DuoButton>
            </div>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0">
                    <Player key={l.id} l={l} />
                    <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                            {l.week && <p className="duo-label text-brand-secondary">Week {l.week}</p>}
                            <h1 className="mt-1 text-display-xs font-bold tracking-tight text-primary">{l.title}</h1>
                            <p className="mt-1.5 text-sm text-tertiary">
                                {l.name && !/^(Ceacht|Week|Lesson|Seachtain)\s*\d+$/i.test(l.name.trim()) ? `${l.name} · ` : ""}
                                {l.video ? fmtDur(l.durationSeconds) : "No recording yet"}
                            </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                            <DuoButton size="sm" color={done ? "secondary" : "primary"} iconLeading={Check} onPress={() => (markDone(l.id, !done), toast(done ? "Marked as not done" : "Marked as complete"))}>
                                {done ? "Completed" : "Mark as complete"}
                            </DuoButton>
                            {next && (
                                <DuoButton size="sm" color="secondary" href={`/courses/${c.id}/${next.id}`} iconTrailing={ArrowRight}>
                                    Next lesson
                                </DuoButton>
                            )}
                        </div>
                    </div>
                    {l.topics && l.topics.length > 0 && (
                        <section className="mt-8">
                            <h2 className="duo-label text-quaternary">In this class</h2>
                            <p className="mt-2 max-w-2xl text-md leading-8 text-secondary">{l.topics.map((t) => t.title).join(" · ")}</p>
                        </section>
                    )}
                    {l.notes && (
                        <section className="mt-8">
                            <h2 className="duo-label text-quaternary">Notes</h2>
                            <p className="mt-2 max-w-2xl text-md leading-8 whitespace-pre-line text-secondary">{l.notes}</p>
                        </section>
                    )}
                    {l.video?.type === "practice" && (
                        <section className="mt-8 rounded-2xl border-2 border-secondary bg-primary p-5">
                            <h2 className="flex items-center gap-2 duo-label text-quaternary">
                                <DuoBubbles aria-hidden="true" className="size-5" /> Phrases in this lesson
                            </h2>
                            <ul className="mt-3 divide-y-2 divide-secondary">
                                {l.video.phrases.map((ph) => (
                                    <li key={ph.id} className="flex items-center gap-3 py-2.5">
                                        <span className="min-w-0 flex-1">
                                            <span lang="ga" className="block text-md font-bold text-primary">
                                                {ph.irish}
                                            </span>
                                            <span className="block text-sm text-tertiary">
                                                {ph.english}
                                                {ph.phonetic ? ` · ${ph.phonetic}` : ""}
                                            </span>
                                        </span>
                                        <DuoButton size="xs" color="ghost" onPress={() => say(ph.irish, "ga")}>
                                            Hear it
                                        </DuoButton>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
                <Contents c={c} current={l.id} />
            </div>
        </Page>
    );
};
