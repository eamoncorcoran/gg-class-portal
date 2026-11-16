// The Home calendar, the hub's own: a Monday-first month with the class sittings, check-in due dates,
// homework deadlines and mock oral days as chips, each opening what the hub opens. Signed in as a
// student it reads the hub's bootstrap; a teacher sees every class date and deadline; signed out it
// shows the plan.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/app/ic";
import { Link, useNavigate } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { type Hub, CLASS_MINUTES, REC_COURSE, TZ, dateKey, dayKey, fmtDay, fmtTime, lessonForWeek, lessonOnDay, onDay, wall } from "@/lib/hub";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { avatarHref } from "@/lib/account";
import { api, isAvatarRequired, loadStudentBootstrap, useMe } from "@/lib/portal";
import { cx } from "@/utils/cx";

type Sitting = { onDate: string; kind: "running" | "recorded" | "moved" | "skipped" | "extra"; at: string; reason?: string; minutes?: number; label?: string; joinUrl?: string; classLabel?: string };
type Boot = {
    class: { programme_name: string; timezone: string; join_url?: string; join_note?: string; start_time: string } | null;
    nextClass: { startsAt: string; joinUrl?: string; note?: string; live: boolean; soon: boolean } | null;
    classDates: Sitting[];
    weeks: { id: string; week_start: string; checkin_enabled: boolean; checkin_due_at: string | null; checkin_release_at: string | null; checkin_hard_deadline?: boolean }[];
    checkins: { week_id: string; status: string; feedback_state?: string }[];
    assignments: { id: string; title: string; deadline_at: string | null; reopened_until: string | null; visible_at: string | null }[];
    homework: { assignment_id: string; status: string; feedback_state?: string }[];
    mockOral: { bookings: { date: string; number: number; startsAt: string; examiner?: string }[]; days: string[]; numbers: Record<string, number> } | null;
    enrolledAt?: string | null;
    liveReady?: boolean;
};
export type Chip = { date: Date; cls: string; label: string; title?: string; onPress?: () => void; href?: string; order: number };

const tone = (done: boolean, returned: boolean, due: Date, now: Date) => (returned || done ? "green" : +due < +now ? "red" : +due - +now < 2 * 86400000 ? "orange" : "grey");
const KIND_LABEL: Record<Sitting["kind"], string> = { running: "Class", recorded: "Pre-recorded", moved: "Class (moved)", skipped: "No class", extra: "Extra class" };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** The month grid itself. */
const Grid = ({ chips, now, note }: { chips: Chip[]; now: Date; note?: React.ReactNode }) => {
    const [cur, setCur] = useState(() => {
        const w = wall(now);
        return new Date(w.getFullYear(), w.getMonth(), 1);
    });
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cur.getFullYear(), cur.getMonth(), i + 1))];
    while (cells.length % 7) cells.push(null);
    const byDay = new Map<string, Chip[]>();
    for (const c of chips) {
        const k = dayKey(c.date);
        byDay.set(k, [...(byDay.get(k) ?? []), c].sort((a, b) => a.order - b.order));
    }
    const move = (n: number) => setCur(new Date(cur.getFullYear(), cur.getMonth() + n, 1));
    /* On a phone the cells are too small for chips: each day shows dots, and the day you tap lists
       its items under the grid (today to begin with). */
    const wide = useBreakpoint("md");
    const todayKey = dayKey(now);
    const [picked, setPicked] = useState<string | null>(null);
    const inMonth = (k: string) => k.startsWith(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    const selected = picked && inMonth(picked) ? picked : inMonth(todayKey) ? todayKey : (cells.find((d) => d && byDay.has(dateKey(d))) ? dateKey(cells.find((d) => d && byDay.has(dateKey(d)))!) : null);
    const agenda = selected ? (byDay.get(selected) ?? []) : [];
    const chipEl = (c: Chip, j: number) =>
        c.href ? (
            <Link key={j} to={c.href} className={cx("cal-ev", c.cls)} title={c.title ?? c.label}>
                {c.label}
            </Link>
        ) : (
            <button key={j} type="button" onClick={c.onPress} className={cx("cal-ev", c.cls)} title={c.title ?? c.label} disabled={!c.onPress}>
                {c.label}
            </button>
        );
    return (
        <section aria-label="Calendar" className="rounded-2xl border-2 border-secondary bg-primary p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-md font-bold text-primary">{cur.toLocaleDateString("en-IE", { month: "long", year: "numeric" })}</h2>
                <div className="flex items-center gap-1.5">
                    <DuoButton color="secondary" size="xs" ariaLabel="Previous month" iconLeading={ChevronLeft} onPress={() => move(-1)} />
                    <DuoButton color="secondary" size="xs" onPress={() => setCur(new Date(wall(now).getFullYear(), wall(now).getMonth(), 1))}>
                        Today
                    </DuoButton>
                    <DuoButton color="secondary" size="xs" ariaLabel="Next month" iconLeading={ChevronRight} onPress={() => move(1)} />
                </div>
            </div>
            {note}
            <div className="cal-grid">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="cal-name">
                        {d}
                    </div>
                ))}
                {cells.map((d, i) => {
                    const evs = d ? (byDay.get(dateKey(d)) ?? []) : [];
                    const k = d ? dateKey(d) : "";
                    if (!wide)
                        return d ? (
                            <button key={i} type="button" onClick={() => setPicked(k)} aria-pressed={k === selected} aria-label={`${d.getDate()}${evs.length ? `, ${evs.length} item${evs.length === 1 ? "" : "s"}` : ""}`} className={cx("cal-day is-small", k === todayKey && "is-today", k === selected && "is-picked")}>
                                <span className="cal-number">{d.getDate()}</span>
                                <span className="cal-dots">
                                    {evs.slice(0, 3).map((c, j) => (
                                        <span key={j} className={cx("cal-dot", c.cls)} />
                                    ))}
                                </span>
                            </button>
                        ) : (
                            <div key={i} className="cal-day is-empty is-small" />
                        );
                    return (
                        <div key={i} className={cx("cal-day", !d && "is-empty", d && k === todayKey && "is-today")}>
                            {d && <span className="cal-number">{d.getDate()}</span>}
                            {evs.map(chipEl)}
                        </div>
                    );
                })}
            </div>
            {!wide && selected && (
                <div className="mt-3 md:hidden">
                    <p className="duo-label text-quaternary">{new Date(+selected.slice(0, 4), +selected.slice(5, 7) - 1, +selected.slice(8, 10)).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" })}</p>
                    {agenda.length ? <div className="cal-agenda mt-1.5 flex flex-col gap-1.5">{agenda.map(chipEl)}</div> : <p className="mt-1.5 text-sm text-tertiary">Nothing on this day.</p>}
                </div>
            )}
        </section>
    );
};

/** What the hub shows when you press a class chip: when, where, the passcode and the way in. */
const ClassInfo = ({ s, boot, onClose }: { s: Sitting; boot: Boot | null; onClose: () => void }) => {
    const nav = useNavigate();
    const klass = boot?.class;
    const titles: Record<Sitting["kind"], [string, string]> = {
        running: ["Class as usual", `Your weekly class, at the time it always runs.${klass ? ` Times shown in ${klass.timezone}.` : ""}`],
        moved: ["This class has moved", "This week's class is on a different day."],
        recorded: ["Pre-recorded this week", "There is no live class this week. The recording is in Courses."],
        skipped: ["No class this week", "There is no class this week."],
        extra: [s.label || "Extra class", "An additional session on top of the weekly class."],
    };
    const [title, body] = titles[s.kind];
    const when = new Date(s.at);
    const join = s.kind === "extra" ? s.joinUrl || boot?.nextClass?.joinUrl : s.kind === "running" || s.kind === "moved" ? klass?.join_url || boot?.nextClass?.joinUrl : undefined;
    const passcode = (klass?.join_note || "").match(/\d{4,}/)?.[0] ?? klass?.join_note;
    return (
        <DuoDialog open onClose={onClose} title={title} sub={`${fmtDay(when)} · ${fmtTime(when)}`}>
            <p className="text-md leading-7 text-secondary">{s.reason || body}</p>
            {s.kind !== "skipped" && (
                <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 rounded-xl bg-secondary p-4 text-sm">
                    <dt className="font-bold text-quaternary">When</dt>
                    <dd className="text-primary">
                        {fmtDay(when)}, {fmtTime(when)}
                    </dd>
                    {klass && (
                        <>
                            <dt className="font-bold text-quaternary">Timezone</dt>
                            <dd className="text-primary">{klass.timezone}</dd>
                        </>
                    )}
                    {s.minutes ? (
                        <>
                            <dt className="font-bold text-quaternary">Length</dt>
                            <dd className="text-primary">{s.minutes} minutes</dd>
                        </>
                    ) : null}
                    {join && passcode && !boot?.liveReady && (
                        <>
                            <dt className="font-bold text-quaternary">Passcode</dt>
                            <dd className="font-mono font-bold text-primary">{passcode}</dd>
                        </>
                    )}
                </dl>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Close
                </DuoButton>
                {s.kind === "recorded" ? (
                    <DuoButton size="sm" onPress={() => (onClose(), nav("/courses"))}>
                        Go to Courses
                    </DuoButton>
                ) : boot?.liveReady && s.kind !== "skipped" ? (
                    <DuoButton size="sm" onPress={() => (onClose(), nav("/live"))}>
                        Go to Live Class
                    </DuoButton>
                ) : join ? (
                    <DuoButton size="sm" onPress={() => window.open(join, "_blank", "noopener")}>
                        Join class
                    </DuoButton>
                ) : null}
            </div>
        </DuoDialog>
    );
};

export const HubCalendar = ({ hub, now, fallback }: { hub?: Hub; now: Date; fallback: Chip[] }) => {
    const me = useMe();
    const nav = useNavigate();
    const [boot, setBoot] = useState<Boot | null>(null);
    const [adminDates, setAdminDates] = useState<Sitting[] | null>(null);
    const [adminAssign, setAdminAssign] = useState<{ id: string; title: string; deadline_at: string | null }[]>([]);
    const [open, setOpen] = useState<Sitting | null>(null);
    const [err, setErr] = useState<string | null>(null);
    useEffect(() => {
        if (!me) return;
        let gone = false;
        if (me.role === "student") {
            loadStudentBootstrap(true)
                .then((b) => !gone && setBoot(b as unknown as Boot))
                .catch((e) => {
                    if (gone) return;
                    if (isAvatarRequired(e)) return nav(avatarHref("/"), { replace: true });
                    setErr(e.message);
                });
        } else {
            api<Sitting[]>("/api/admin/class-dates")
                .then((d) => !gone && setAdminDates(Array.isArray(d) ? d : []))
                .catch((e) => !gone && setErr(e.message));
            api<unknown>("/api/admin/assignments")
                .then((d) => !gone && setAdminAssign(Array.isArray(d) ? d : ((d as { assignments?: [] })?.assignments ?? [])))
                .catch(() => {});
        }
        return () => {
            gone = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me?.id, me?.role]);

    const chips: Chip[] = [];
    const sittingChip = (s: Sitting, onPress: () => void = () => setOpen(s)): Chip => ({ date: new Date(s.at), cls: `is-class is-${s.kind}`, label: s.kind === "extra" ? s.label || "Extra class" : KIND_LABEL[s.kind], title: `${s.kind === "extra" ? s.label || "Extra class" : KIND_LABEL[s.kind]} · ${hhmm(s.at)}${s.classLabel ? ` · ${s.classLabel}` : ""}`, onPress, order: 3 });
    /* A student pressing a class goes somewhere useful: the live class while it is still to come
       (or on now), that week's recording once it has passed. A day with no class explains itself. */
    const goSitting = (s: Sitting) => {
        if (s.kind === "skipped") return setOpen(s);
        const at = new Date(s.at);
        const over = +at + CLASS_MINUTES * 60000 < +now;
        if (!over) return nav("/live");
        const week = hub?.sittings.find((x) => dayKey(x.date) === dayKey(at))?.week;
        const lesson = hub ? (lessonOnDay(hub, at) ?? (week ? lessonForWeek(hub, week) : undefined)) : undefined;
        nav(lesson ? `/courses/${REC_COURSE}/${lesson.id}` : "/courses");
    };
    if (me?.role === "student" && boot) {
        for (const s of boot.classDates) chips.push(sittingChip(s, () => goSitting(s)));
        const enrolled = boot.enrolledAt ? new Date(boot.enrolledAt) : null;
        for (const w of boot.weeks) {
            if (!w.checkin_enabled || !w.checkin_due_at) continue;
            const due = new Date(w.checkin_due_at);
            const c = boot.checkins.find((x) => x.week_id === w.id);
            const returned = c?.feedback_state === "returned" || c?.status === "returned";
            const done = c?.status === "submitted" || returned;
            const t = tone(done, returned, due, now);
            if (t === "red" && enrolled && due < enrolled) continue;
            chips.push({ date: due, cls: t, label: returned ? "Check-in feedback" : t === "red" ? "Check-in missed" : "Check-in", onPress: () => nav(`/tracker?open=checkin:${w.id}`), order: 1 });
        }
        for (const a of boot.assignments) {
            const at = a.reopened_until || a.deadline_at;
            if (!at) continue;
            const due = new Date(at);
            const h = boot.homework.find((x) => x.assignment_id === a.id);
            const returned = h?.feedback_state === "returned" || h?.status === "returned";
            const done = h?.status === "submitted" || returned;
            const t = tone(done, returned, due, now);
            if (t === "red" && enrolled && due < enrolled) continue;
            chips.push({ date: due, cls: t, label: returned ? "Homework feedback" : t === "red" ? `${a.title} (missed)` : a.title, onPress: () => nav(`/tracker?open=homework:${a.id}`), order: 2 });
        }
        for (const b of boot.mockOral?.bookings ?? []) chips.push({ date: new Date(b.startsAt), cls: "is-oral booked", label: `Mock ${b.number} ${fmtTime(new Date(b.startsAt))}`, title: `Mock ${b.number}, booked. Open to see the details, cancel, or pick another day.`, href: `/mock-oral?day=${b.date}`, order: 0 });
        for (const d of boot.mockOral?.days ?? []) {
            if (boot.mockOral?.bookings.some((b) => b.date === d)) continue;
            const [y, m, dd] = d.split("-").map(Number);
            chips.push({ date: onDay(new Date(y, m - 1, dd)), cls: "is-oral", label: `Book Mock ${boot.mockOral?.numbers[d] ?? "oral"}`, href: `/mock-oral?day=${d}`, order: 0 });
        }
    } else if (me?.role === "admin" && adminDates) {
        for (const s of adminDates) chips.push(sittingChip(s));
        for (const a of adminAssign) if (a.deadline_at) chips.push({ date: new Date(a.deadline_at), cls: "orange", label: a.title, title: `Homework deadline · ${a.title}`, href: "/teach", order: 2 });
    } else {
        chips.push(...fallback);
    }

    const note = !me && me !== undefined ? (
        <p className="mb-3 rounded-xl bg-secondary px-3 py-2 text-sm text-tertiary">
            Showing the class plan.{" "}
            <Link to="/signin" className="font-bold text-brand-secondary hover:underline">
                Sign in
            </Link>{" "}
            to see your check-ins, homework and mock oral.
        </p>
    ) : err ? (
        <p className="mb-3 rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">{err}</p>
    ) : null;

    return (
        <>
            <Grid chips={chips} now={now} note={note} />
            {open && <ClassInfo s={open} boot={boot} onClose={() => setOpen(null)} />}
        </>
    );
};
