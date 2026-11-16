// /teach/calendar: the old hub's "assignments" view. Classes, check-ins, mock oral days and homework
// deadlines on one month grid (or as a list), with drag-to-move, create/edit/import, archive, reopen,
// delete and the calendar subscription. Sub-state lives in the query string: ?view=list&month=2026-11
// &class=<id>&archived=1.
import { type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { Calendar, ChevronLeft, ChevronRight, Edit01, Grid01 } from "@/components/app/ic";
import { Empty } from "@/components/app/page-parts";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { Toggle } from "@/components/base/toggle/toggle";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { api, useAdminBootstrap } from "@/lib/portal";
import {
    type AdminClassRow,
    type Assignment,
    type AssignmentImpact,
    CLASS_KIND_LABEL,
    type CalendarFeed,
    type ClassSitting,
    FIELD_CLASS,
    type ImportResult,
    type MockOralAdmin,
    type MovePrevious,
    type MoveResult,
    type TeachingWeek,
    assignmentClosed,
    classLabel,
    classTimezone,
    fmtDate,
    fromZonedInput,
    passcodeOnly,
    plural,
    timezoneAbbreviation,
    toZonedInput,
    zonedDateParts,
} from "@/lib/teach-calendar";
import { cx } from "@/utils/cx";
import { AssignmentDialog } from "./assignment-form";
import { BulkRenderDialog, ImportDialog } from "./assignment-import";

type Dialog =
    | { kind: "form"; assignment: Assignment | null; defaultClassId?: string | null; prefill?: string | null }
    | { kind: "import" }
    | { kind: "bulk"; classId: string; count: number }
    | { kind: "classInfo"; sitting: ClassSitting }
    | { kind: "delete"; id: string; impact: AssignmentImpact }
    | { kind: "subscribe"; feed: CalendarFeed }
    | { kind: "reopen"; id: string };

/** A plain anchor styled as the secondary small button: for downloads the proxy serves with the cookie. */
const LinkButton = ({ href, children, download, primary, external }: { href: string; children: ReactNode; download?: boolean; primary?: boolean; external?: boolean }) => (
    <a
        href={href}
        download={download}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={cx(
            "inline-flex h-10.5 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-b-4 px-3.5 text-[13px] leading-none font-bold tracking-[0.8px] uppercase transition duration-100 ease-linear select-none active:translate-y-0.5 active:border-b-2",
            primary ? "border-transparent border-b-brand-700 bg-brand-500 text-white hover:brightness-105" : "border-secondary bg-primary text-brand-secondary hover:bg-primary_hover",
        )}
    >
        {children}
    </a>
);

export const CalendarSection = () => {
    const navigate = useNavigate();
    const boot = useAdminBootstrap();
    const [params, setParams] = useSearchParams();
    /* The month grid is a 700px thing; on a phone the list is the view that can be read, so it is the
       default there and the grid is a choice. Either can still be asked for by name in the URL. */
    const wide = useBreakpoint("md");
    const defaultView = wide ? "calendar" : "list";
    const viewParam = params.get("view");
    const view = viewParam === "list" || viewParam === "calendar" ? viewParam : defaultView;
    const monthParam = params.get("month"); // YYYY-MM
    const filter = params.get("class") || "";
    const showArchived = params.get("archived") === "1";
    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        setParams(next, { replace: true });
    };

    const [assignments, setAssignments] = useState<Assignment[] | null>(null);
    const [weeks, setWeeks] = useState<TeachingWeek[]>([]);
    const [classes, setClasses] = useState<AdminClassRow[]>([]);
    const [sittings, setSittings] = useState<ClassSitting[]>([]);
    const [mockOrals, setMockOrals] = useState<MockOralAdmin | null>(null);
    const [dialog, setDialog] = useState<Dialog | null>(null);
    /* The tracker's "Assign homework" arrives as ?new=1&class=<id>: open the form for that class straight away. */
    const wantNew = params.get("new") === "1";
    useEffect(() => {
        if (!wantNew) return;
        setDialog({ kind: "form", assignment: null, defaultClassId: filter || null });
        const next = new URLSearchParams(params);
        next.delete("new");
        setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wantNew]);

    /* The mock oral days ride along. They are an extra on this screen, so a failure there leaves the
       calendar standing without them. Flipping the archived toggle twice quickly starts two loads;
       only the latest one is allowed to land, or the list could end up showing the wrong set. */
    const loadTick = useRef(0);
    const load = useCallback(async () => {
        const tick = ++loadTick.current;
        try {
            const query = showArchived ? "?includeArchived=true" : "";
            const [a, w, c, d, m] = await Promise.all([
                api<Assignment[]>(`/api/admin/assignments${query}`),
                api<TeachingWeek[]>("/api/admin/teaching-weeks"),
                api<AdminClassRow[]>("/api/admin/classes"),
                api<ClassSitting[]>("/api/admin/class-dates"),
                api<MockOralAdmin>("/api/mock-oral/admin").catch(() => null),
            ]);
            if (tick !== loadTick.current) return;
            setAssignments(a);
            setWeeks(w);
            setClasses(c);
            setSittings(d);
            setMockOrals(m);
        } catch (e) {
            toast((e as Error).message);
            setAssignments((cur) => cur ?? []);
        }
    }, [showArchived]);
    useEffect(() => {
        load();
    }, [load]);

    // Deadlines are formatted in the class zone: the filtered class, or the first class.
    const tz = classTimezone(classes.find((k) => k.id === filter)?.timezone || classes[0]?.timezone);
    const visible = useMemo(() => (assignments ?? []).filter((row) => !filter || row.class_id === filter), [assignments, filter]);
    const archivedCount = visible.filter((row) => row.status === "archived").length;

    /* ---- actions shared by both views ---- */
    const openEdit = (a: Assignment) => setDialog({ kind: "form", assignment: a });
    const archive = async (a: Assignment) => {
        const archived = a.status === "archived";
        try {
            await api(`/api/admin/assignments/${a.id}/archive`, { method: "POST", json: { archived: !archived } });
            await load();
            toast(archived ? "Assignment restored" : "Assignment archived");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    /* Deleting takes the students' work with it, so the count comes first and archive is offered as the
       thing you probably meant. */
    const confirmDelete = async (id: string) => {
        try {
            const impact = await api<AssignmentImpact>(`/api/admin/assignments/${id}/impact`);
            setDialog({ kind: "delete", id, impact });
        } catch (e) {
            toast((e as Error).message);
        }
    };
    /* Subscribing beats downloading: the calendar app re-reads the feed, so a moved deadline or a new
       assignment turns up without anyone adding it again. */
    const openSubscribe = async () => {
        try {
            setDialog({ kind: "subscribe", feed: await api<CalendarFeed>("/api/admin/calendar-feed") });
        } catch (e) {
            toast((e as Error).message);
        }
    };

    /* Dragging an assignment to another day. The deadline lands on the day it was dropped on, at the
       time it already had; the maths is the server's, in the class's timezone. A drag is easy to do by
       accident, so the toast carries an Undo, which is the same move back to the day it came from. */
    const undoMove = async (assignmentId: string, previous: MovePrevious) => {
        try {
            const result = await api<MoveResult>(`/api/admin/assignments/${assignmentId}/move`, { method: "PATCH", json: { restore: previous } });
            await load();
            toast(`Put back to ${fmtDate(result.reopened_until || result.deadline_at, { weekday: true, time: true, dateStyle: "short", timeZone: tz })}`);
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const moveAssignment = async (assignmentId: string, onDate: string, fromDate: string | null) => {
        try {
            const result = await api<MoveResult>(`/api/admin/assignments/${assignmentId}/move`, { method: "PATCH", json: { onDate, ...(fromDate ? { fromDate } : {}) } });
            if (!result.moved) return;
            await load();
            const when = fmtDate(result.reopened_until || result.deadline_at, { weekday: true, time: true, dateStyle: "short", timeZone: tz });
            toast(`Moved to ${when}${result.keptVisible ? ". Students could already see it, so it stays visible" : ""}`, () => undoMove(assignmentId, result.previous));
        } catch (e) {
            toast((e as Error).message);
        }
    };

    const onImported = async (classId: string, result: ImportResult) => {
        await load();
        /* A term of listening activities arrives with no audio, and rendering them one dialog at a time is
           the work the import just removed. */
        if (result.listening) setDialog({ kind: "bulk", classId, count: result.listening });
    };

    return (
        <>
            <SectionHead
                kicker="Coursework"
                title="Calendar"
                sub="Classes, check-ins and homework, week by week. Click a class for its link, a day to set homework, an assignment to edit it."
                actions={
                    <>
                        <DuoButton color="secondary" size="sm" iconLeading={Calendar} onPress={openSubscribe}>
                            Add to calendar
                        </DuoButton>
                        <DuoButton color="secondary" size="sm" onPress={() => setDialog({ kind: "import" })}>
                            Import a spreadsheet
                        </DuoButton>
                        <DuoButton size="sm" onPress={() => setDialog({ kind: "form", assignment: null })}>
                            Create assignment
                        </DuoButton>
                    </>
                }
            />

            <div className="mb-5 flex flex-col gap-3 rounded-2xl border-2 border-secondary bg-primary p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Segmented
                        label="Calendar or list"
                        value={view}
                        onChange={(v) => setParam("view", v === defaultView ? null : v)}
                        items={[
                            { id: "calendar", label: <span className="flex items-center gap-1.5"><Calendar aria-hidden="true" className="size-4" />Calendar</span>, aria: "Calendar" },
                            { id: "list", label: <span className="flex items-center gap-1.5"><Grid01 aria-hidden="true" className="size-4" />List</span>, aria: "List" },
                        ]}
                    />
                    <DuoSelect label="Class filter" value={filter || "all"} onChange={(id) => setParam("class", id === "all" ? null : id)} items={[{ id: "all", label: "All classes" }, ...classes.map((k) => ({ id: k.id, label: classLabel(k) }))]} className="min-w-56" />
                </div>
                <Toggle isSelected={showArchived} onChange={(on) => setParam("archived", on ? "1" : null)} label={`Show archived${archivedCount ? ` (${archivedCount})` : ""}`} />
            </div>

            {assignments === null ? (
                <p className="text-sm text-quaternary">Loading the calendar…</p>
            ) : view === "list" ? (
                <ListView assignments={visible} tz={tz} onEdit={openEdit} onReopen={(id) => setDialog({ kind: "reopen", id })} onArchive={archive} onDelete={confirmDelete} />
            ) : (
                <MonthView
                    assignments={visible}
                    weeks={weeks}
                    sittings={sittings}
                    mockOrals={mockOrals}
                    filter={filter}
                    tz={tz}
                    monthParam={monthParam}
                    setMonth={(m) => setParam("month", m)}
                    onEdit={openEdit}
                    onAdd={(iso) => setDialog({ kind: "form", assignment: null, defaultClassId: filter || null, prefill: `${iso}T18:00` })}
                    onMove={moveAssignment}
                    onSitting={(s) => setDialog({ kind: "classInfo", sitting: s })}
                    onCheckin={(week) => navigate(`/teach/checkins?class=${week.class_id}`)}
                    onMockOral={(id) => {
                        // The chip can be at the foot of the month; the day starts at its top.
                        navigate(`/teach/mock-orals/${id}`);
                        window.scrollTo(0, 0);
                    }}
                />
            )}

            {dialog?.kind === "form" && <AssignmentDialog assignment={dialog.assignment} classes={classes} defaultClassId={dialog.defaultClassId} prefillDeadline={dialog.prefill} timezone={classTimezone(classes.find((k) => k.id === (dialog.assignment?.class_id || dialog.defaultClassId))?.timezone || tz)} onClose={() => setDialog(null)} onSaved={load} />}
            {dialog?.kind === "import" && <ImportDialog classes={classes} timezone={tz} onClose={() => setDialog(null)} onImported={onImported} />}
            {dialog?.kind === "bulk" && <BulkRenderDialog classId={dialog.classId} count={dialog.count} onClose={() => setDialog(null)} />}
            {dialog?.kind === "classInfo" && <ClassInfoDialog sitting={dialog.sitting} liveRoom={Boolean(boot?.liveRoom)} onClose={() => setDialog(null)} />}
            {dialog?.kind === "delete" && <DeleteDialog id={dialog.id} impact={dialog.impact} onClose={() => setDialog(null)} onDone={load} />}
            {dialog?.kind === "subscribe" && <SubscribeDialog feed={dialog.feed} onClose={() => setDialog(null)} />}
            {dialog?.kind === "reopen" && <ReopenDialog id={dialog.id} tz={tz} onClose={() => setDialog(null)} onDone={load} />}
        </>
    );
};

/* ------------------------------------------------------------------ the month grid */

type Chip = { key: string; node: ReactNode };

const chipBase = "flex w-full min-w-0 flex-col items-start rounded-md px-1.5 py-0.5 text-left text-[11px] leading-4 outline-focus-ring hover:brightness-95 focus-visible:outline-2";
const ChipBody = ({ time, title }: { time: string; title: string }) => (
    <>
        {time && <span className="block text-[11px] font-semibold opacity-80 md:text-[10px]">{time}</span>}
        <span className="block w-full truncate font-bold">{title}</span>
    </>
);
const SITTING_TONE: Record<ClassSitting["kind"], string> = {
    running: "bg-brand-500 text-white",
    extra: "bg-brand-500 text-white",
    moved: "bg-blue-500 text-white",
    recorded: "bg-blue-100 text-blue-800",
    skipped: "bg-secondary text-quaternary line-through",
};

const MonthView = ({
    assignments,
    weeks,
    sittings,
    mockOrals,
    filter,
    tz,
    monthParam,
    setMonth,
    onEdit,
    onAdd,
    onMove,
    onSitting,
    onCheckin,
    onMockOral,
}: {
    assignments: Assignment[];
    weeks: TeachingWeek[];
    sittings: ClassSitting[];
    mockOrals: MockOralAdmin | null;
    filter: string;
    tz: string;
    monthParam: string | null;
    setMonth: (m: string | null) => void;
    onEdit: (a: Assignment) => void;
    onAdd: (iso: string) => void;
    onMove: (id: string, onDate: string, fromDate: string | null) => Promise<void>;
    onSitting: (s: ClassSitting) => void;
    onCheckin: (w: TeachingWeek) => void;
    onMockOral: (id: string) => void;
}) => {
    const cursor = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? new Date(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)) - 1, 1) : new Date();
    const year = cursor.getFullYear(),
        month = cursor.getMonth();
    const first = new Date(year, month, 1),
        days = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const today = zonedDateParts(new Date(), tz);
    const step = (n: number) => {
        if (!n) return setMonth(null);
        const next = new Date(year, month + n, 1);
        setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    };

    const [dragging, setDragging] = useState<{ id: string; fromDate: string } | null>(null);
    const [over, setOver] = useState<string | null>(null);

    // Which calendar days belong to a teaching week, for the shading. Two classes can share the same
    // dates, so each day collects every week covering it.
    const teachingWeeks = weeks.filter((week) => !filter || week.class_id === filter);
    const teachingDays = new Set<number>();
    teachingWeeks.forEach((week) => {
        const start = new Date(`${String(week.week_start).slice(0, 10)}T12:00:00Z`);
        for (let i = 0; i < 7; i += 1) {
            const day = new Date(start.getTime() + i * 86400000);
            if (day.getUTCFullYear() === year && day.getUTCMonth() === month) teachingDays.add(day.getUTCDate());
        }
    });

    const events = new Map<number, Chip[]>();
    const add = (day: number, chip: Chip) => events.set(day, [...(events.get(day) || []), chip]);

    /* Mock oral days, first on their day because they take the whole of it. A day kept to certain
       classes drops out when another class is being looked at. */
    (mockOrals?.days || [])
        .filter((day) => !filter || !day.classIds || day.classIds.includes(filter))
        .forEach((day) => {
            const [onYear, onMonth, onDay] = String(day.date).split("-").map(Number);
            if (onYear !== year || onMonth - 1 !== month) return;
            const status = day.past ? "Finished" : day.bookingOpen ? "Booking open" : day.booked ? "Booking closed" : "Not open yet";
            add(onDay, {
                key: `oral-${day.id}`,
                node: (
                    <button type="button" onClick={() => onMockOral(day.id)} className={cx(chipBase, "bg-orange-100 text-orange-800", !(day.bookingOpen && !day.past) && "opacity-70")} title={`${day.label}: ${day.booked} of ${day.capacity} places booked (${day.percent}%) with ${plural(day.examiners, "examiner")}. ${status}.`}>
                        <ChipBody time={`${day.booked} of ${day.capacity} booked`} title={day.label} />
                    </button>
                ),
            });
        });

    /* The classes themselves. Drawn from the worked-out sittings, so a moved class sits at its new time
       and a cancelled one is struck through rather than quietly missing. */
    sittings
        .filter((s) => !filter || s.classId === filter)
        .forEach((s) => {
            const when = zonedDateParts(s.at, s.timezone || tz);
            if (when.year !== year || when.month !== month) return;
            const off = s.kind === "skipped";
            const label = s.kind === "extra" ? s.label || "Extra class" : s.classLabel.split(" | ")[0];
            add(when.day, {
                key: `class-${s.classId}-${s.at}`,
                node: (
                    <button type="button" onClick={() => onSitting(s)} className={cx(chipBase, SITTING_TONE[s.kind] || SITTING_TONE.running)} title={`${s.classLabel}: ${CLASS_KIND_LABEL[s.kind] || s.kind}`}>
                        <ChipBody time={off ? "" : fmtDate(s.at, { timeOnly: true, timeZone: s.timezone || tz })} title={label} />
                    </button>
                ),
            });
        });

    /* Check-ins, which close on a day of their own. Named by class: three groups can have a check-in
       closing at the same minute. */
    teachingWeeks
        .filter((week) => week.checkin_enabled !== false)
        .forEach((week) => {
            const when = zonedDateParts(week.checkin_due_at, tz);
            if (when.year !== year || when.month !== month) return;
            const whose = String(week.classLabel || "").split(" | ")[0];
            add(when.day, {
                key: `checkin-${week.id}`,
                node: (
                    <button type="button" onClick={() => onCheckin(week)} className={cx(chipBase, "bg-warning-primary text-warning-primary")} title={`${whose}: check-in closes ${fmtDate(week.checkin_due_at, { time: true, weekday: true, dateStyle: "short", timeZone: tz })}`}>
                        <ChipBody time={fmtDate(week.checkin_due_at, { timeOnly: true, timeZone: tz })} title={`Check-in${filter ? "" : `: ${whose}`}`} />
                    </button>
                ),
            });
        });

    assignments.forEach((a) => {
        // In the assignment's own class zone, not whichever class was last opened.
        const zone = a.timezone || tz;
        const at = a.reopened_until || a.deadline_at;
        const when = zonedDateParts(at, zone);
        if (when.year !== year || when.month !== month) return;
        const closed = assignmentClosed(a);
        const tone = a.status === "archived" ? "bg-secondary text-quaternary" : closed ? "bg-error-primary text-error-primary" : "bg-success-primary text-success-primary";
        const draggable = a.status !== "archived";
        const iso = `${when.year}-${String(when.month + 1).padStart(2, "0")}-${String(when.day).padStart(2, "0")}`;
        add(when.day, {
            key: `a-${a.id}`,
            node: (
                <button
                    type="button"
                    onClick={() => onEdit(a)}
                    draggable={draggable}
                    onDragStart={(e: DragEvent) => {
                        if (!draggable) return;
                        e.dataTransfer.effectAllowed = "move";
                        // The day it is being dragged from, as drawn, travels with it.
                        e.dataTransfer.setData("text/plain", `assignment:${a.id}:${iso}`);
                        setDragging({ id: a.id, fromDate: iso });
                    }}
                    onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                    }}
                    className={cx(chipBase, tone, draggable && "cursor-grab active:cursor-grabbing", dragging?.id === a.id && "opacity-50")}
                    title={`${a.title}: due ${fmtDate(at, { time: true, weekday: true, dateStyle: "short", timeZone: zone })}${draggable ? ". Drag to another day to move it." : ""}`}
                >
                    <ChipBody time={fmtDate(at, { timeOnly: true, timeZone: zone })} title={a.title} />
                </button>
            ),
        });
    });

    const cells: ReactNode[] = [];
    for (let i = 0; i < offset; i += 1) cells.push(<div key={`e${i}`} className="min-h-24 border-r border-b border-secondary bg-secondary_subtle" />);
    for (let day = 1; day <= days; day += 1) {
        const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const isToday = today.year === year && today.month === month && today.day === day;
        const teaching = teachingDays.has(day);
        cells.push(
            <div
                key={iso}
                onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOver(iso);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((cur) => (cur === iso ? null : cur));
                }}
                onDrop={async (e) => {
                    const payload = e.dataTransfer.getData("text/plain") || "";
                    if (!payload.startsWith("assignment:")) return;
                    e.preventDefault();
                    setOver(null);
                    setDragging(null);
                    const [, assignmentId, fromDate] = payload.split(":");
                    if (fromDate === iso) return;
                    await onMove(assignmentId, iso, fromDate || null);
                }}
                className={cx("group/day flex min-h-24 flex-col gap-0.5 border-r border-b border-secondary p-1 md:p-1.5", teaching && "bg-brand-primary/30", over === iso && "bg-brand-primary ring-2 ring-brand ring-inset")}
            >
                <div className="mb-0.5 flex items-center justify-between">
                    <span className={cx("flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums", isToday ? "bg-brand-solid text-white" : "text-secondary")}>{day}</span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdd(iso);
                        }}
                        title={`Set homework due ${fmtDate(`${iso}T12:00:00Z`, { timeZone: "UTC" })}`}
                        aria-label={`Set homework due on ${day}`}
                        className="-my-1.5 -mr-1 flex size-9 items-center justify-center rounded-full text-lg font-bold text-quaternary opacity-60 transition duration-100 ease-linear group-hover/day:opacity-100 hover:bg-brand-primary hover:text-brand-secondary md:my-0 md:mr-0 md:size-6 md:text-sm"
                    >
                        +
                    </button>
                </div>
                {(events.get(day) || []).map((c) => (
                    <div key={c.key}>{c.node}</div>
                ))}
            </div>,
        );
    }

    const Swatch = ({ cls }: { cls: string }) => <span aria-hidden="true" className={cx("size-2.5 rounded-sm", cls)} />;
    return (
        <section aria-label="Assignment calendar" className="rounded-2xl border-2 border-secondary bg-primary">
            <div className="flex items-center justify-between gap-2 border-b-2 border-secondary px-4 py-3">
                <h2 className="text-lg font-bold text-primary">{new Intl.DateTimeFormat("en-IE", { month: "long", year: "numeric" }).format(first)}</h2>
                <div className="flex items-center gap-1">
                    <DuoButton color="ghost" size="xs" ariaLabel="Previous month" iconLeading={ChevronLeft} onPress={() => step(-1)} />
                    <DuoButton color="ghost" size="xs" onPress={() => step(0)}>
                        Today
                    </DuoButton>
                    <DuoButton color="ghost" size="xs" ariaLabel="Next month" iconLeading={ChevronRight} onPress={() => step(1)} />
                </div>
            </div>
            <div className="overflow-x-auto">
                <div className="min-w-[700px] md:min-w-[640px]">
                    <div className="grid grid-cols-7 border-b-2 border-secondary">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                            <div key={d} className="py-2 text-center duo-label text-quaternary">
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">{cells}</div>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 text-xs font-semibold text-tertiary">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="duo-label text-quaternary">Deadlines</span>
                    <span className="flex items-center gap-1.5"><Swatch cls="bg-success-solid" />Open</span>
                    <span className="flex items-center gap-1.5"><Swatch cls="bg-error-solid" />Closed</span>
                    <span className="flex items-center gap-1.5"><Swatch cls="bg-tertiary" />Archived</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className="duo-label text-quaternary">Weeks</span>
                    <span className="flex items-center gap-1.5"><Swatch cls="bg-brand-200" />Teaching week</span>
                </div>
                {(mockOrals?.days || []).length > 0 && (
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="duo-label text-quaternary">Mock orals</span>
                        <span className="flex items-center gap-1.5"><Swatch cls="bg-orange-300" />Mock oral day</span>
                    </div>
                )}
            </div>
        </section>
    );
};

/* ------------------------------------------------------------------ the list */

const ListView = ({ assignments, tz, onEdit, onReopen, onArchive, onDelete }: { assignments: Assignment[]; tz: string; onEdit: (a: Assignment) => void; onReopen: (id: string) => void; onArchive: (a: Assignment) => void; onDelete: (id: string) => void }) => {
    if (!assignments.length) return <Empty icon={Calendar} title="No homework yet" note="Create the first assignment, or click a day on the calendar." />;
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {assignments.map((a) => {
                const archived = a.status === "archived";
                const closed = assignmentClosed(a);
                return (
                    <article key={a.id} className={cx("rounded-2xl border-2 border-secondary bg-primary p-5", archived && "opacity-70")}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-primary">
                                    {a.title}
                                    {archived && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 align-middle text-[11px] font-bold text-tertiary">Archived</span>}
                                </h3>
                                <p className="text-sm text-tertiary">{a.classLabel || ""}</p>
                            </div>
                            <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", archived ? "bg-secondary text-tertiary" : closed ? "bg-error-primary text-error-primary" : "bg-success-primary text-success-primary")}>
                                {fmtDate(a.reopened_until || a.deadline_at, { time: true, weekday: true, dateStyle: "short", timeZone: a.timezone || tz })}
                            </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-bold text-tertiary">
                            <span className="rounded-full bg-secondary px-2.5 py-1">{a.questions?.length || 0} questions</span>
                            <span className="rounded-full bg-secondary px-2.5 py-1">{a.resources?.length || 0} files</span>
                            <span className="rounded-full bg-secondary px-2.5 py-1">{a.hard_deadline ? "Hard deadline" : "Open submissions"}</span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <DuoButton color="secondary" size="sm" iconLeading={Edit01} onPress={() => onEdit(a)}>
                                Edit
                            </DuoButton>
                            {a.hard_deadline && !archived && (
                                <DuoButton color="secondary" size="sm" onPress={() => onReopen(a.id)}>
                                    Reopen
                                </DuoButton>
                            )}
                            <LinkButton href={`/api/admin/assignments/${a.id}/calendar.ics`} download>
                                <Calendar aria-hidden="true" className="size-4.5" />
                                .ics
                            </LinkButton>
                            <DuoButton color="secondary" size="sm" onPress={() => onArchive(a)}>
                                {archived ? "Restore" : "Archive"}
                            </DuoButton>
                            <DuoButton color="danger" size="sm" onPress={() => onDelete(a.id)}>
                                Delete
                            </DuoButton>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

/* ------------------------------------------------------------------ dialogs */

/* One class, opened from the calendar. The thing somebody wants from a calendar entry at ten to seven
   is the link, so it is a button rather than a line of text to copy. The passcode is beside it. A
   cancelled week still opens, and says it is cancelled. */
const ClassInfoDialog = ({ sitting, liveRoom, onClose }: { sitting: ClassSitting; liveRoom: boolean; onClose: () => void }) => {
    const navigate = useNavigate();
    const zone = sitting.timezone || "Europe/Dublin";
    const when = new Date(sitting.at).toLocaleString("en-IE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: zone });
    const running = ["running", "moved", "extra"].includes(sitting.kind);
    const passcode = sitting.note ? passcodeOnly(sitting.note) : "";
    const Row = ({ k, v }: { k: string; v: ReactNode }) => (
        <div className="flex gap-4 border-b border-secondary py-2 text-sm last:border-0">
            <dt className="w-24 shrink-0 font-bold text-quaternary">{k}</dt>
            <dd className="text-primary">{v}</dd>
        </div>
    );
    return (
        <DuoDialog open onClose={onClose} title={sitting.classLabel.split(" | ")[0]} sub={CLASS_KIND_LABEL[sitting.kind] || "Class"}>
            {sitting.reason && <p className="mb-3 text-md text-secondary">{sitting.reason}</p>}
            <dl>
                <Row k="When" v={when} />
                <Row k="Timezone" v={zone} />
                {sitting.minutes ? <Row k="Length" v={`${sitting.minutes} minutes`} /> : null}
                {running && passcode && <Row k="Passcode" v={<code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono">{passcode}</code>} />}
                {running && !sitting.joinUrl && <Row k="Link" v="No class link set" />}
            </dl>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
                {/* The live section reads the class from ?classId=, not from the route's :id. */}
                {liveRoom && (
                    <DuoButton color="secondary" size="sm" onPress={() => (onClose(), navigate(`/teach/live?tab=console&classId=${encodeURIComponent(sitting.classId)}`))}>
                        Open teacher console
                    </DuoButton>
                )}
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Close
                </DuoButton>
                <DuoButton color="secondary" size="sm" onPress={() => (onClose(), navigate(`/teach/people?setup=${sitting.classId}`))}>
                    Class setup
                </DuoButton>
                {running && sitting.joinUrl && (
                    <LinkButton href={sitting.joinUrl} primary external>
                        Open the class
                    </LinkButton>
                )}
            </div>
        </DuoDialog>
    );
};

const DeleteDialog = ({ id, impact, onClose, onDone }: { id: string; impact: AssignmentImpact; onClose: () => void; onDone: () => Promise<void> }) => {
    const { submissions, returned, drafts, assignment } = impact;
    const archiveInstead = async () => {
        try {
            await api(`/api/admin/assignments/${id}/archive`, { method: "POST", json: { archived: true } });
            onClose();
            await onDone();
            toast("Assignment archived, submissions kept");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const del = async () => {
        try {
            await api(`/api/admin/assignments/${id}?confirmSubmissions=${submissions}`, { method: "DELETE" });
            onClose();
            await onDone();
            toast("Assignment deleted");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title={`Delete “${assignment.title}”?`} sub="This cannot be undone.">
            {submissions ? (
                <>
                    <div className="rounded-2xl border-2 border-error-subtle bg-error-primary p-4 text-sm text-error-primary">
                        <strong>{plural(submissions, "student submission")} will be deleted permanently.</strong>
                        {returned ? ` ${returned} of ${returned === 1 ? "them has" : "them have"} already had feedback returned.` : ""}
                    </div>
                    <p className="mt-3 text-sm text-quaternary">Archiving keeps the work and the feedback, and removes the assignment from the tracker and from what students see. That is usually what you want.</p>
                </>
            ) : (
                <p className="text-sm text-quaternary">Nothing has been submitted{drafts ? `, though ${drafts} student${drafts === 1 ? " has" : "s have"} an unfinished draft` : ""}. This assignment can be deleted cleanly.</p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                {submissions > 0 && (
                    <DuoButton color="secondary" size="sm" onPress={archiveInstead}>
                        Archive instead
                    </DuoButton>
                )}
                <DuoButton color="danger" size="sm" onPress={del}>
                    {submissions ? `Delete and remove ${plural(submissions, "submission")}` : "Delete"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

const SubscribeDialog = ({ feed, onClose }: { feed: CalendarFeed; onClose: () => void }) => {
    const [url, setUrl] = useState(feed.url);
    const webcal = url.replace(/^https?:/, "webcal:");
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            toast("Link copied");
        } catch {
            (document.getElementById("feed-url") as HTMLInputElement | null)?.select();
            toast("Press Cmd+C to copy");
        }
    };
    const rotate = async () => {
        if (!(await askConfirm({ title: "Reset your calendar link?", message: "Any calendar already subscribed stops updating until you add the new link. Use this if you think someone else has the old one.", confirmLabel: "Reset link", danger: true }))) return;
        try {
            const next = await api<CalendarFeed>("/api/admin/calendar-feed/rotate", { method: "POST" });
            setUrl(next.url);
            toast("Link reset. Re-add it in your calendar app.");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title="Add deadlines to your calendar" sub="Subscribe once and it stays up to date on its own." className="max-w-lg">
            <p className="text-sm text-quaternary">This link is private to you. Anyone who has it can read your deadlines, so treat it like a password.</p>
            <div className="mt-4">
                <FieldLabel>Your calendar link</FieldLabel>
                <input id="feed-url" readOnly value={url} aria-label="Your calendar link" className={cx(FIELD_CLASS, "text-sm")} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <DuoButton color="secondary" size="sm" onPress={copy}>
                    Copy link
                </DuoButton>
                <LinkButton href={webcal} primary>
                    Open in your calendar app
                </LinkButton>
            </div>
            <h3 className="mt-6 text-md font-bold text-primary">How to add it</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-secondary">
                <li>
                    <strong>iPhone or Mac:</strong> tap <em>Open in your calendar app</em>, or Calendar, File, New Calendar Subscription and paste the link.
                </li>
                <li>
                    <strong>Google Calendar:</strong> Other calendars, From URL, paste the link.
                </li>
                <li>
                    <strong>Outlook:</strong> Add calendar, Subscribe from web, paste the link.
                </li>
            </ul>
            <p className="mt-3 text-sm text-quaternary">Calendar apps refresh on their own schedule, often only every few hours. The feed carries every published deadline across your classes.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <DuoButton color="danger" size="sm" onPress={rotate}>
                    Reset link
                </DuoButton>
                <DuoButton size="sm" onPress={onClose}>
                    Done
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

const ReopenDialog = ({ id, tz, onClose, onDone }: { id: string; tz: string; onClose: () => void; onDone: () => Promise<void> }) => {
    const [until, setUntil] = useState(toZonedInput(new Date(Date.now() + 2 * 86400000), tz));
    const go = async () => {
        try {
            await api(`/api/admin/assignments/${id}/reopen`, { method: "POST", json: { reopenedUntil: fromZonedInput(until, tz) } });
            onClose();
            await onDone();
            toast("Assignment reopened");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title="Reopen assignment" sub="Set a new closing time for students who still need to submit.">
            <FieldLabel>Reopen until</FieldLabel>
            <input type="datetime-local" aria-label="Reopen until" value={until} onChange={(e) => setUntil(e.target.value)} className={FIELD_CLASS} />
            <p className="mt-1.5 text-sm text-quaternary">
                Times are {tz} ({timezoneAbbreviation(tz)}).
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={go}>
                    Reopen assignment
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
