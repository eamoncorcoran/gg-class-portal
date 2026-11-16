// Home: the next class, this week's plan, the calendar, and the quickest ways into recordings,
// the board and the past questions.
import { ArrowRight, Play } from "@/components/app/ic";
import { DuoButton } from "@/components/app/duo";
import { NextClassBanner, useNow } from "@/components/app/hub-parts";
import { type Chip, HubCalendar } from "@/components/app/hub-calendar";
import { Page } from "@/components/app/page-parts";
import { type Hub, REC_COURSE, fmtShortDate, lastRecorded, lessonForWeek, onDay, thisWeek, useHub } from "@/lib/hub";
import { cx } from "@/utils/cx";

const CAT: Record<string, string> = { Grammar: "bg-blue-100 text-blue-800", Oral: "bg-orange-100 text-orange-800", Course: "bg-secondary text-secondary", Aiste: "bg-purple-100 text-purple-800", Filíocht: "bg-pink-100 text-pink-800", Prós: "bg-teal-100 text-teal-800", "Sraith Pictiúr": "bg-yellow-100 text-yellow-800", "Exam Skills": "bg-brand-100 text-brand-800", Revision: "bg-brand-100 text-brand-800", Dordán: "bg-indigo-100 text-indigo-800" };
export const TopicChip = ({ t }: { t: { title: string; category: string } }) => (
    <li className={cx("rounded-lg px-2 py-1 text-xs font-bold", CAT[t.category] ?? "bg-secondary text-secondary")}>
        {t.title}
        <span className="ml-1 font-semibold opacity-60">{t.category}</span>
    </li>
);


/** The plan as calendar chips, for anyone not signed in: class sittings, the break, check-in due dates and homework. */
export const planChips = (hub: Hub, now: Date): Chip[] => {
    const chips: Chip[] = hub.sittings.map((s) => ({
        date: s.date,
        cls: s.kind === "break" ? "is-class is-skipped" : `is-class is-${s.kind === "class" ? "running" : s.kind}`,
        label: s.kind === "class" ? "Class" : s.kind === "break" ? (s.label ?? "No class") : s.kind === "skipped" ? "No class" : s.kind === "recorded" ? "Pre-recorded" : s.kind === "moved" ? "Class (moved)" : (s.label ?? "Extra class"),
        title: s.reason ?? (s.week ? `Week ${s.week}` : undefined),
        href: s.kind === "class" || s.kind === "recorded" || s.kind === "moved" ? (s.date < now ? (s.week && lessonForWeek(hub, s.week) ? `/courses/${REC_COURSE}/${lessonForWeek(hub, s.week)!.id}` : undefined) : "/live") : s.kind === "extra" ? "/live" : undefined,
        order: 3,
    }));
    for (const c of hub.checkins) chips.push({ date: c.due, cls: +c.due < +now ? "grey" : "orange", label: "Check-in", order: 1 });
    for (const w of hub.weeks) if (w.homework.length) chips.push({ date: onDay(new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() + 6)), cls: "grey", label: "Homework", title: w.homework.join("; "), href: lessonForWeek(hub, w.n) ? `/courses/${REC_COURSE}/${w.lessonId}` : undefined, order: 2 });
    return chips;
};

export const HomePage = () => {
    const hub = useHub();
    const now = useNow();
    if (!hub) return <Page>{null}</Page>;
    const week = thisWeek(hub, now);
    const last = lastRecorded(hub, now);
    const hour = now.getHours();
    const greet = hour < 12 ? "Maidin mhaith" : hour < 18 ? "Tráthnóna maith" : "Oíche mhaith";

    return (
        <Page wide>
            <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="duo-label text-brand-secondary">{greet}</p>
                    <h1 className="mt-2 text-display-xs font-bold tracking-tight text-primary md:text-display-sm">Welcome back</h1>
                    <p className="mt-2 text-md text-tertiary">{hub.klass.name}</p>
                </div>
            </header>

            <NextClassBanner hub={hub} now={now} />


            <div className="mt-8 flex min-w-0 flex-col gap-8">
                    {/* this week */}
                    <section aria-labelledby="tw" className="rounded-2xl border-2 border-secondary bg-primary p-5 md:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="duo-label text-brand-secondary">This week · {fmtShortDate(week.start)}</p>
                                <h2 id="tw" className="mt-1 text-xl font-bold text-primary">
                                    Week {week.n}
                                </h2>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {lessonForWeek(hub, week.n) && (
                                    <DuoButton size="sm" color="secondary" href={`/courses/${REC_COURSE}/${week.lessonId}`} iconTrailing={ArrowRight}>
                                        This week's lesson
                                    </DuoButton>
                                )}
                                {last && (
                                    <DuoButton size="sm" href={`/courses/${REC_COURSE}/${last.id}`} iconLeading={Play}>
                                        Watch last class
                                    </DuoButton>
                                )}
                            </div>
                        </div>
                        {week.homework.length > 0 && (
                            <>
                                <p className="mt-5 duo-label text-quaternary">Homework</p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                    {week.homework.map((h) => (
                                        <li key={h} className="flex items-start gap-2 text-md text-secondary">
                                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-solid" aria-hidden="true" />
                                            {h}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </section>

                <HubCalendar hub={hub} now={now} fallback={planChips(hub, now)} />
            </div>
        </Page>
    );
};
