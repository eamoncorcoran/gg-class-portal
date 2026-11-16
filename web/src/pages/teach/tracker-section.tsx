// /teach/tracker/:id. The weekly tracker for one class: a row per student, a column per week with
// attendance, check-in and homework cells, the engagement panel above it and the review drawer and
// student profile hanging off it. Ported from the old hub's adminTrackerView and bindAdminView.
import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { SearchLg } from "@/components/app/ic";
import { api, useAdminBootstrap, useApi } from "@/lib/portal";
import { initials } from "@/lib/hub";
import {
    type Attendance,
    type CellState,
    type Checkin,
    type Engagement,
    type EngagementItem,
    type FeedbackReadReport,
    type Homework,
    type ReviewKey,
    type Tone,
    type Tracker,
    type TrackerMaps,
    type TrackerStudent,
    type Week,
    adminTrackerState,
    assignmentClosed,
    buildReviewQueue,
    errMsg,
    fmtDate,
    fmtWeek,
    recordForReview,
    trackerMaps,
    visibleWeeks,
} from "@/lib/teach";
import { cx } from "@/utils/cx";
import { CellIcon, Meter, NoteIcon, Pill, ReviewDrawer, SubHead, TextLink } from "./review-drawer";
import { StudentProfileDrawer } from "./student-profile";

const TONE_ICON: Record<Tone, string> = {
    grey: "bg-secondary text-fg-quaternary",
    plain: "bg-transparent text-fg-tertiary",
    orange: "bg-warning-primary text-warning-primary",
    green: "bg-success-primary text-success-primary",
    red: "bg-error-primary text-error-primary",
};

/** One status tile: a 32px icon over a single line of label text. `hint` becomes the hover tooltip. */
const StatusIcon = ({ state }: { state: CellState }) => {
    const I = CellIcon[state.icon];
    return (
        <>
            <span className={cx("flex size-8 items-center justify-center rounded-lg", TONE_ICON[state.tone])}>
                <I className="size-4.5" />
            </span>
            <span className="max-w-16 truncate text-[10px] leading-3 font-bold text-quaternary" title={state.hint || state.label}>
                {state.label}
            </span>
        </>
    );
};

const Stat = ({ label, value, note, tone }: { label: string; value: ReactNode; note: string; tone?: "warning" | "accent" }) => (
    <div className={cx("rounded-2xl border-2 p-4", tone === "warning" ? "border-warning-solid/40 bg-warning-primary" : tone === "accent" ? "border-brand bg-brand-primary" : "border-secondary bg-primary")}>
        <p className="duo-label text-quaternary">{label}</p>
        <p className="mt-1 text-display-xs font-bold text-primary tabular-nums">{value}</p>
        <p className="text-xs text-tertiary">{note}</p>
    </div>
);

type Filter = "all" | "attention" | "missing";

export const TrackerSection = () => {
    const { id: classId } = useParams();
    const boot = useAdminBootstrap();
    const [params, setParams] = useSearchParams();
    const tracker = useApi<Tracker>(classId ? `/api/admin/tracker/${classId}` : null);
    const engagement = useApi<Engagement>(classId ? `/api/admin/engagement/${classId}` : null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [review, setReview] = useState<{ queue: ReviewKey[]; index: number } | null>(null);
    const [report, setReport] = useState<FeedbackReadReport | null>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const profileId = params.get("student");
    const openStudent = useCallback(
        (id: string | null) => {
            setParams(
                (p) => {
                    const n = new URLSearchParams(p);
                    if (id) n.set("student", id);
                    else n.delete("student");
                    return n;
                },
                { replace: true },
            );
        },
        [setParams],
    );

    useEffect(() => {
        if (tracker.error) toast(tracker.error.message);
    }, [tracker.error]);
    useEffect(() => {
        setReview(null);
        setSearch("");
        setFilter("all");
    }, [classId]);

    /* useApi keeps the previous class's payload until the new one arrives, so a tracker for class A
       would briefly draw under class B's heading. Only rows for this class count. */
    const t = tracker.data && tracker.data.class.id === classId ? tracker.data : undefined;
    const engagementData = engagement.data && (!engagement.data.class || engagement.data.class.id === classId) ? engagement.data : undefined;
    const maps = useMemo(() => (t ? trackerMaps(t) : null), [t]);
    const { weeks, currentWeekId } = useMemo(() => (t ? visibleWeeks(t) : { weeks: [] as Week[], currentWeekId: undefined }), [t]);

    /* ---- review drawer plumbing ---- */
    const openReview = useCallback(
        (key: ReviewKey) => {
            if (!t) return;
            if (key.type === "attendance") return setReview({ queue: [key], index: 0 });
            const queue = buildReviewQueue(t, key.type, key.weekId, key.assignmentId);
            const found = queue.findIndex((k) => k.studentId === key.studentId);
            /* A cell with nothing in it (missed, open) is not in the queue of submissions. The old
               screen still opened that student, so it goes first and Next moves on to the work. */
            if (found < 0) return setReview({ queue: [key, ...queue], index: 0 });
            setReview({ queue, index: found });
        },
        [t],
    );

    /* Everything handed in and not yet returned, oldest week first then by name: one queue to work
       through with the keyboard. */
    const unmarked = useMemo((): ReviewKey[] => {
        if (!t) return [];
        const weekStart = new Map(t.weeks.map((w) => [w.id, w.week_start]));
        const name = new Map(t.students.map((s) => [s.id, s.name.trim().toLowerCase()]));
        const keys: ReviewKey[] = [];
        for (const c of t.checkins) if (c.status === "submitted") keys.push({ type: "checkin", studentId: c.student_id, weekId: c.week_id });
        for (const h of t.homework) {
            if (h.status !== "submitted") continue;
            const a = t.assignments.find((x) => x.id === h.assignment_id);
            if (a?.week_id) keys.push({ type: "homework", studentId: h.student_id, weekId: a.week_id, assignmentId: a.id });
        }
        return keys.sort((x, y) => (weekStart.get(x.weekId) || "").localeCompare(weekStart.get(y.weekId) || "") || (name.get(x.studentId) || "").localeCompare(name.get(y.studentId) || "") || x.type.localeCompare(y.type));
    }, [t]);
    const reviewAll = () => {
        if (unmarked.length) setReview({ queue: unmarked, index: 0 });
    };

    if (!classId) return <p className="text-md text-tertiary">Pick a class on the left.</p>;
    if (!t || !maps) return tracker.error ? <p className="text-md text-tertiary">That class could not be loaded.</p> : <p className="text-sm text-quaternary">Loading the tracker…</p>;

    const tz = t.class.timezone || "Europe/Dublin";
    const submittedCheckins = t.checkins.filter((r) => r.status === "submitted").length;
    const submittedHomework = t.homework.filter((r) => r.status === "submitted").length;
    const liveCount = t.attendance.filter((r) => r.status === "live").length;
    const toReview = submittedCheckins + submittedHomework;

    const rowFlags = (student: TrackerStudent) => {
        const hasAttention = weeks.some((w) => {
            const as = maps.assignmentsByWeek.get(w.id) || [];
            return maps.checkins.get(`${student.id}:${w.id}`)?.status === "submitted" || as.some((a) => maps.homework.get(`${student.id}:${a.id}`)?.status === "submitted");
        });
        const hasMissing = weeks.some((w) => {
            const as = maps.assignmentsByWeek.get(w.id) || [];
            return (Date.now() > new Date(w.checkin_due_at).getTime() && !maps.checkins.get(`${student.id}:${w.id}`)) || as.some((a) => assignmentClosed(a) && !maps.homework.get(`${student.id}:${a.id}`));
        });
        return { attention: hasAttention && !student.withdrawn_at, missing: hasMissing && !student.withdrawn_at };
    };
    const query = search.toLowerCase().trim();
    const visible = t.students.filter((s) => {
        if (!`${s.name} ${s.email}`.toLowerCase().includes(query)) return false;
        if (filter === "all") return true;
        const f = rowFlags(s);
        return filter === "attention" ? f.attention : f.missing;
    });

    const activeKey = review ? review.queue[review.index] : null;
    const record = activeKey ? recordForReview(t, activeKey) : null;

    const patchRow = (type: "checkin" | "homework" | "attendance", row: Checkin | Homework | Attendance) =>
        tracker.set((prev) => {
            if (!prev) return prev!;
            if (type === "checkin") {
                const r = row as Checkin;
                const has = prev.checkins.some((x) => x.id === r.id);
                return { ...prev, checkins: has ? prev.checkins.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [...prev.checkins, r] };
            }
            if (type === "homework") {
                const r = row as Homework;
                const has = prev.homework.some((x) => x.id === r.id);
                return { ...prev, homework: has ? prev.homework.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [...prev.homework, r] };
            }
            const r = row as Attendance;
            const i = prev.attendance.findIndex((x) => x.student_id === r.student_id && x.week_id === r.week_id);
            const attendance = i >= 0 ? prev.attendance.map((x, j) => (j === i ? r : x)) : [...prev.attendance, r];
            return { ...prev, attendance };
        });

    const refetch = async () => {
        const fresh = await api<Tracker>(`/api/admin/tracker/${classId}`);
        tracker.set(fresh);
        engagement.reload().catch(() => undefined);
        return fresh;
    };

    /* Repaint the tracker straight away so the cell you just replied to turns green, then re-resolve
       the queue against the new rows rather than leaving it pointing at the old ones. */
    const onSubmitted = async () => {
        if (!review) return;
        const current = review.index;
        const remaining = review.queue.filter((_, i) => i !== current);
        let fresh: Tracker;
        try {
            fresh = await refetch();
        } catch (e) {
            toast(errMsg(e));
            return;
        }
        const queue = remaining.filter((k) => {
            const r = recordForReview(fresh, k);
            return r && (k.type === "checkin" ? r.checkin : r.homework);
        });
        if (queue.length) setReview({ queue, index: Math.min(current, queue.length - 1) });
        else setReview(null);
    };
    const onAttendanceSaved = async () => {
        setReview(null);
        try {
            await refetch();
        } catch (e) {
            toast(errMsg(e));
        }
    };

    /* ---- the "Feedback opened" report, run on this class ---- */
    const openReport = async () => {
        try {
            setReport(await api<FeedbackReadReport>(`/api/admin/reports/feedback-read/${classId}`));
        } catch (e) {
            toast(errMsg(e));
        }
    };

    return (
        <>
            <SectionHead
                kicker="Class workspace"
                title={t.class.label}
                sub={`A separate weekly tracker for this class. Times shown in ${tz}.`}
                actions={
                    <>
                        <DuoButton size="sm" isDisabled={!unmarked.length} onPress={reviewAll}>
                            {unmarked.length ? `Review All Unmarked (${unmarked.length})` : "Nothing Unmarked"}
                        </DuoButton>
                        <DuoButton color="secondary" size="sm" onPress={openReport}>
                            Feedback Opened
                        </DuoButton>
                        <DuoButton color="secondary" size="sm" href="/teach/attendance">
                            Upload Attendance
                        </DuoButton>
                        <DuoButton size="sm" href={`/teach/calendar?class=${classId}&new=1`}>
                            Assign Homework
                        </DuoButton>
                    </>
                }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Students" value={t.students.length} note="Active in this class" />
                <Stat label="Check-ins to review" value={submittedCheckins} note="Ready for teacher review" tone={submittedCheckins ? "warning" : undefined} />
                <Stat label="Homework to review" value={submittedHomework} note="Awaiting teacher feedback" tone={submittedHomework ? "warning" : undefined} />
                <Stat label="Live attendance records" value={liveCount} note="Across visible weeks" tone="accent" />
            </div>

            {engagementData && <EngagementPanel data={engagementData} tz={tz} onStudent={openStudent} />}

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border-2 border-secondary bg-primary p-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="flex items-center gap-2 rounded-xl border-2 border-secondary px-3 py-2 text-sm">
                        <SearchLg aria-hidden="true" className="size-4 text-fg-quaternary" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students" aria-label="Search students" className="w-full bg-transparent font-medium text-primary outline-hidden placeholder:text-placeholder/80 sm:w-44" />
                    </label>
                    <Segmented
                        label="Filter students"
                        value={filter}
                        onChange={setFilter}
                        items={[
                            { id: "all", label: "All" },
                            { id: "attention", label: `Needs review${toReview ? ` (${toReview})` : ""}` },
                            { id: "missing", label: "Missing" },
                        ]}
                    />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {!visible.length && <span className="text-sm text-tertiary">No students match this view.</span>}
                    <DuoButton color="ghost" size="xs" className="ml-auto" onPress={() => scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: "smooth" })}>
                        Jump to Latest Week
                    </DuoButton>
                </div>
            </div>

            <section className="mt-4 rounded-2xl border-2 border-secondary bg-primary">
                <div ref={scroller} className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                        <thead>
                            <tr>
                                <th scope="col" className="sticky left-0 z-10 w-36 max-w-36 border-r border-b-2 border-secondary bg-primary px-2 py-3 text-left duo-label text-quaternary md:w-auto md:min-w-56 md:max-w-none md:border-r-0 md:px-4">
                                    Student
                                </th>
                                {weeks.map((w) => (
                                    <WeekHead key={w.id} week={w} maps={maps} current={w.id === currentWeekId} tz={tz} />
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((s) => (
                                <StudentRow key={s.id} student={s} weeks={weeks} maps={maps} currentWeekId={currentWeekId} onReview={openReview} onOpen={openStudent} />
                            ))}
                        </tbody>
                    </table>
                </div>
                <Legend />
            </section>

            {record && review && (
                <ReviewDrawer
                    tracker={t}
                    drafting={boot?.drafting}
                    record={record}
                    queue={review.queue}
                    index={review.index}
                    onIndex={(i) => setReview((r) => (r ? { ...r, index: i } : r))}
                    onClose={() => setReview(null)}
                    patchRow={patchRow}
                    onSubmitted={onSubmitted}
                    onAttendanceSaved={onAttendanceSaved}
                />
            )}
            <StudentProfileDrawer studentId={profileId} onClose={() => openStudent(null)} />
            <FeedbackReadDialog report={report} onClose={() => setReport(null)} onStudent={openStudent} tz={tz} />
        </>
    );
};

/* Column headings. The three per-week actions are labelled with their own icon rather than a
   repeated block of uppercase words: the same camera, speech and book glyphs appear in the cells
   below and are explained in the legend. */
const WeekHead = ({ week, maps, current, tz }: { week: Week; maps: TrackerMaps; current: boolean; tz: string }) => {
    const assignments = maps.assignmentsByWeek.get(week.id) || [];
    const columns = [{ icon: "camera" as const, label: "Attendance" }, { icon: "talk" as const, label: "Check-in" }, ...assignments.map((a) => ({ icon: "book" as const, label: a.title }))];
    return (
        <th scope="col" className={cx("border-b-2 border-l border-secondary px-2 py-2 text-left align-bottom", current && "bg-brand-primary/60")}>
            <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap text-primary" title={`Week beginning ${fmtDate(`${String(week.week_start).slice(0, 10)}T12:00:00Z`, { timeZone: "UTC" })}`}>
                {fmtWeek(week.week_start)}
                {current && <Pill tone="green">Now</Pill>}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold whitespace-nowrap text-quaternary">Check-in due {fmtDate(week.checkin_due_at, { time: true, weekday: true, dateStyle: "short" }, tz)}</div>
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${columns.length}, 4.5rem)` }}>
                {columns.map((c, i) => {
                    const I = CellIcon[c.icon];
                    return (
                        <span key={i} role="img" className="flex justify-center text-fg-quaternary" title={c.label} aria-label={c.label}>
                            <I className="size-4" />
                        </span>
                    );
                })}
            </div>
        </th>
    );
};

/* Memoised: 107 rows of 36 buttons redraw on every keystroke in the search box otherwise. The
   callbacks it is given are stable, so only a changed tracker or a changed week list repaints it. */
const StudentRow = memo(({ student, weeks, maps, currentWeekId, onReview, onOpen }: { student: TrackerStudent; weeks: Week[]; maps: TrackerMaps; currentWeekId?: string; onReview: (k: ReviewKey) => void; onOpen: (id: string) => void }) => {
    const gone = Boolean(student.withdrawn_at);
    const name = student.name.trim();
    return (
        <tr className={cx(gone && "opacity-60")}>
            <th scope="row" className="sticky left-0 z-10 w-36 max-w-36 border-r border-b border-secondary bg-primary px-1 py-1.5 text-left md:w-auto md:max-w-none md:border-r-0 md:px-2">
                <button type="button" onClick={() => onOpen(student.id)} title={`Open ${name}'s profile and notes`} className="group flex w-full max-w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left md:gap-3 md:px-2 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                    <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-brand-solid text-xs font-bold text-white md:flex">{initials(name)}</span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-sm font-bold text-primary">
                            {name}
                            {gone && <Pill tone="red">Withdrawn</Pill>}
                        </span>
                        <span className="hidden truncate text-xs text-quaternary md:block">{gone ? `Left ${fmtDate(student.withdrawn_at)}` : student.email}</span>
                    </span>
                    <NoteIcon className="size-4 shrink-0 text-fg-quaternary opacity-0 transition group-hover:opacity-100" />
                </button>
            </th>
            {weeks.map((w) => {
                const assignments = maps.assignmentsByWeek.get(w.id) || [];
                const weekLabel = fmtWeek(w.week_start);
                const cells: { state: CellState; key: ReviewKey }[] = [
                    { state: adminTrackerState("attendance", maps.attendance.get(`${student.id}:${w.id}`)), key: { type: "attendance", studentId: student.id, weekId: w.id } },
                    { state: adminTrackerState("checkin", maps.checkins.get(`${student.id}:${w.id}`), w.checkin_due_at, null, w), key: { type: "checkin", studentId: student.id, weekId: w.id } },
                    ...assignments.map((a) => ({
                        state: adminTrackerState("homework", maps.homework.get(`${student.id}:${a.id}`), a.reopened_until || a.deadline_at, a),
                        key: { type: "homework" as const, studentId: student.id, weekId: w.id, assignmentId: a.id },
                    })),
                ];
                return (
                    <td key={w.id} className={cx("border-b border-l border-secondary px-2 py-1.5 align-top", w.id === currentWeekId && "bg-brand-primary/40")}>
                        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cells.length}, 4.5rem)` }}>
                            {cells.map((c, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => onReview(c.key)}
                                    aria-label={`${name}, week of ${weekLabel}: ${c.state.hint || c.state.label}`}
                                    className={cx("flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-1.5 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2", c.state.attention ? "border-warning-solid/60" : "border-transparent")}
                                >
                                    <StatusIcon state={c.state} />
                                </button>
                            ))}
                        </div>
                    </td>
                );
            })}
        </tr>
    );
});

const LegendKey = ({ tone, icon, label }: { tone: Tone; icon: keyof typeof CellIcon; label: string }) => {
    const I = CellIcon[icon];
    return (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-tertiary">
            <span className={cx("flex size-6 items-center justify-center rounded-md", TONE_ICON[tone])}>
                <I className="size-3.5" />
            </span>
            {label}
        </span>
    );
};
const Legend = () => (
    <div className="flex flex-col gap-2 border-t-2 border-secondary px-4 py-3 md:flex-row md:gap-8">
        <div className="flex flex-wrap items-center gap-3">
            <span className="duo-label text-quaternary">Columns</span>
            <LegendKey tone="plain" icon="camera" label="Attendance" />
            <LegendKey tone="plain" icon="talk" label="Check-in" />
            <LegendKey tone="plain" icon="book" label="Homework" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <span className="duo-label text-quaternary">Status</span>
            <LegendKey tone="grey" icon="book" label="Open" />
            <LegendKey tone="orange" icon="book" label="Needs your review" />
            <LegendKey tone="green" icon="book" label="Returned" />
            <LegendKey tone="red" icon="x" label="Missed or absent" />
        </div>
    </div>
);

/* How the class is actually going: how many are still on it, and how much of the work that was
   genuinely due has come in. Both figures ignore weeks that were switched off and people who have
   left, because counting either would flatter the number into meaning nothing. */
const EngagementPanel = ({ data, tz, onStudent }: { data: Engagement; tz: string; onStudent: (id: string) => void }) => {
    const { people, expected, retention, completion, withdrawals } = data;
    return (
        <section className="mt-6 rounded-2xl border-2 border-secondary bg-primary">
            <div className="border-b-2 border-secondary px-5 py-4">
                <h2 className="text-lg font-bold text-primary">How the class is going</h2>
                <p className="text-sm text-tertiary">Weeks you switched off and students who have withdrawn are left out of both figures.</p>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2">
                <div>
                    <p className="text-display-xs font-bold text-primary tabular-nums">{retention === null ? "—" : `${retention}%`}</p>
                    <p className="duo-label text-quaternary">Still on the course</p>
                    <div className="my-2">
                        <Meter value={retention} good={retention !== null && retention >= 80} />
                    </div>
                    <p className="text-xs text-tertiary">
                        {people.active} of {people.total} student{people.total === 1 ? "" : "s"}
                        {people.withdrawn ? ` · ${people.withdrawn} withdrawn` : ""}
                    </p>
                </div>
                <div>
                    <p className="text-display-xs font-bold text-primary tabular-nums">{completion === null ? "—" : `${completion}%`}</p>
                    <p className="duo-label text-quaternary">Work submitted</p>
                    <div className="my-2">
                        <Meter value={completion} good={completion !== null && completion >= 70} />
                    </div>
                    <p className="text-xs text-tertiary">
                        {expected.submitted} of {expected.expected} due so far · {expected.checkins_due} check-in{expected.checkins_due === 1 ? "" : "s"} and {expected.assignments_due} assignment{expected.assignments_due === 1 ? "" : "s"} released
                    </p>
                </div>
                <ItemBreakdown items={data.items || []} tz={tz} onStudent={onStudent} />
                {withdrawals.length > 0 && (
                    <div className="md:col-span-2">
                        <p className="duo-label text-quaternary">Withdrawals</p>
                        <ul className="mt-2 flex flex-col gap-1.5">
                            {withdrawals.slice(0, 5).map((w) => (
                                <li key={w.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                                    <TextLink onPress={() => onStudent(w.student_id)}>{w.name}</TextLink>
                                    <span className="text-secondary">{w.reason}</span>
                                    <small className="text-xs text-quaternary">{fmtDate(w.submitted_at, {}, tz)}</small>
                                </li>
                            ))}
                        </ul>
                        {withdrawals.length > 5 && <p className="mt-1 text-xs text-tertiary">and {withdrawals.length - 5} more</p>}
                    </div>
                )}
            </div>
        </section>
    );
};

const itemName = (item: EngagementItem) => (item.kind === "homework" ? `Homework · ${item.label}` : `Check-in · week of ${fmtWeek(item.weekStart)}${item.label ? ` (${item.label})` : ""}`);

/* The headline figure averages the whole term, so a week where half the class vanished disappears
   into it. This answers the narrower question instead: of this one check-in, or this one
   assignment, who actually did it. */
const ItemBreakdown = ({ items, tz, onStudent }: { items: EngagementItem[]; tz: string; onStudent: (id: string) => void }) => {
    const key = (i: EngagementItem) => `${i.kind}:${i.id}`;
    const [chosenKey, setChosenKey] = useState<string | null>(null);
    if (!items.length) return null;
    const chosen = items.find((i) => key(i) === chosenKey) || items[0];
    const outstanding = chosen.missing || [];
    return (
        <div className="rounded-2xl border-2 border-secondary p-4 md:col-span-2">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="duo-label text-quaternary">One check-in or assignment at a time</p>
                <DuoSelect label="Choose a check-in or assignment" value={key(chosen)} onChange={setChosenKey} items={items.map((i) => ({ id: key(i), label: itemName(i) }))} className="md:w-96" />
            </div>
            <div className="mt-4 grid gap-5 md:grid-cols-[14rem_1fr]">
                <div>
                    <p className="text-display-xs font-bold text-primary tabular-nums">{chosen.rate === null ? "—" : `${chosen.rate}%`}</p>
                    <p className="text-xs text-tertiary">
                        {chosen.submitted} of {chosen.expected} submitted{chosen.dueAt ? ` · due ${fmtDate(chosen.dueAt, { time: true }, tz)}` : ""}
                    </p>
                    <div className="mt-2">
                        <Meter value={chosen.rate} good={chosen.rate !== null && chosen.rate >= 70} />
                    </div>
                </div>
                <div>
                    {outstanding.length ? (
                        <>
                            <p className="duo-label text-quaternary">Still to submit ({outstanding.length})</p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                                {outstanding.map((p) => (
                                    <TextLink key={p.id} onPress={() => onStudent(p.id)}>
                                        {p.name.trim()}
                                    </TextLink>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="rounded-xl bg-success-primary px-3 py-2 text-sm font-bold text-success-primary">Everyone has submitted this one.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

/* Feedback is only worth writing if it gets read. Nothing about this is visible to students: they
   are told when new feedback arrives, never that opening it is recorded. */
const FeedbackReadDialog = ({ report, onClose, onStudent, tz }: { report: FeedbackReadReport | null; onClose: () => void; onStudent: (id: string) => void; tz: string }) => {
    if (!report) return null;
    const { totals, students, unopened } = report;
    const wait =
        totals.medianHoursToOpen === null
            ? ""
            : totals.medianHoursToOpen < 1
              ? "Typically opened within the hour."
              : totals.medianHoursToOpen < 48
                ? `Typically opened after about ${totals.medianHoursToOpen} hours.`
                : `Typically opened after about ${Math.round(totals.medianHoursToOpen / 24)} days.`;
    const copy = async () => {
        const lines = [
            `Feedback opened: ${report.class.label}`,
            `${totals.opened} of ${totals.returned} opened (${totals.rate ?? 0}%)`,
            "",
            ...students.map((r) => `${r.name}: ${r.opened} of ${r.returned}${r.rate === null ? "" : ` (${r.rate}%)`}`),
            ...(unopened.length ? ["", "Never opened:", ...unopened.map((r) => `${r.name}: ${r.title}`)] : []),
        ].join("\n");
        try {
            await navigator.clipboard.writeText(lines);
            toast("Report copied");
        } catch {
            toast("Could not copy");
        }
    };
    const pick = (id: string) => {
        onClose();
        onStudent(id);
    };
    return (
        <DuoDialog open onClose={onClose} title="Feedback opened" sub={`${report.class.label} · run ${fmtDate(report.generatedAt, { time: true }, tz)}`} className="max-w-3xl max-h-[90dvh] overflow-y-auto">
            {totals.returned === 0 ? (
                <div className="py-8 text-center">
                    <h3 className="text-lg font-bold text-primary">Nothing returned yet</h3>
                    <p className="mt-1 text-sm text-tertiary">This report fills in once you have returned feedback to somebody.</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div>
                            <p className="text-display-sm font-bold text-primary tabular-nums">{totals.rate}%</p>
                            <p className="duo-label text-quaternary">Opened</p>
                        </div>
                        <div className="flex-1">
                            <Meter value={totals.rate} good={totals.rate !== null && totals.rate >= 70} />
                            <p className="mt-2 text-sm text-tertiary">
                                {totals.opened} of {totals.returned} returned pieces have been opened. {wait}
                            </p>
                        </div>
                    </div>
                    <SubHead>By student</SubHead>
                    <div className="overflow-x-auto rounded-2xl border-2 border-secondary">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="duo-label text-quaternary">
                                    <th className="px-3 py-2 text-left">Student</th>
                                    <th className="px-3 py-2 text-left">Opened</th>
                                    <th className="px-3 py-2 text-left">Rate</th>
                                    <th className="px-3 py-2 text-left">Last opened</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((r) => (
                                    <tr key={r.id} className={cx("border-t border-secondary", r.withdrawn && "opacity-60")}>
                                        <td className="px-3 py-2">
                                            <TextLink onPress={() => pick(r.id)}>{r.name.trim()}</TextLink>
                                            {r.withdrawn && (
                                                <Pill tone="red" className="ml-1.5">
                                                    Withdrawn
                                                </Pill>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-secondary tabular-nums">
                                            {r.opened} of {r.returned}
                                        </td>
                                        <td className="px-3 py-2">{r.rate === null ? <span className="text-quaternary">—</span> : <Pill tone={r.rate >= 70 ? "green" : r.rate === 0 ? "red" : "orange"}>{r.rate}%</Pill>}</td>
                                        <td className="px-3 py-2 text-xs text-quaternary">{r.lastOpened ? fmtDate(r.lastOpened, {}, tz) : "Never"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {unopened.length ? (
                        <>
                            <SubHead>Never opened ({unopened.length})</SubHead>
                            <div className="overflow-x-auto rounded-2xl border-2 border-secondary">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="duo-label text-quaternary">
                                            <th className="px-3 py-2 text-left">Student</th>
                                            <th className="px-3 py-2 text-left">Piece</th>
                                            <th className="px-3 py-2 text-left">Returned</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {unopened.map((r, i) => (
                                            <tr key={i} className="border-t border-secondary">
                                                <td className="px-3 py-2">
                                                    <TextLink onPress={() => pick(r.studentId)}>{r.name.trim()}</TextLink>
                                                </td>
                                                <td className="px-3 py-2 text-secondary">
                                                    {r.title}
                                                    <span className="text-xs text-quaternary"> · {r.kind === "checkin" ? "check-in" : "homework"}</span>
                                                </td>
                                                <td className="px-3 py-2 text-xs text-quaternary">{fmtDate(r.returnedAt, {}, tz)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <p className="mt-4 rounded-xl bg-success-primary px-3 py-2 text-sm font-bold text-success-primary">Everything you have returned has been opened.</p>
                    )}
                </>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={copy}>
                    Copy as Text
                </DuoButton>
                <DuoButton size="sm" onPress={onClose}>
                    Done
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
