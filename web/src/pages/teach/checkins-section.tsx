// /teach/checkins: the old hub's checkinsView, checkinCalendar, checkinRow, the bulk schedule dialog
// and confirmDeleteWeek. Weekly check-ins are not automatic in the sense of unstoppable: every week
// has its own switch, its own opening and closing time, and its own choice of hard or soft deadline.
// Christmas week just gets turned off. Sub-state: ?class=<id>&view=calendar.
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { Calendar, Trash01 } from "@/components/app/ic";
import { Empty } from "@/components/app/page-parts";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Toggle } from "@/components/base/toggle/toggle";
import { DAY_NAMES, api } from "@/lib/portal";
import {
    type AdminClassRow,
    FIELD_CLASS,
    FIELD_COMPACT_CLASS,
    type TeachingWeek,
    type WeekImpact,
    classLabel,
    classTimezone,
    fmtWeek,
    fromZonedInput,
    holidayIndex,
    holidaysInWeek,
    mondayOf,
    plural,
    toZonedInput,
} from "@/lib/teach-calendar";
import { cx } from "@/utils/cx";

type Draft = { release: string; due: string; hard: "hard" | "soft"; label: string };
/* The two sticky columns: the tick box is a fixed 56px so the week column knows where to stop. */
const PICK_COL = "sticky left-0 z-10 w-14 min-w-14 bg-inherit px-2";
const WEEK_COL = "sticky left-14 z-10 border-r border-secondary bg-inherit";
/* A 20px box inside a 40px tap target. */
const PICK_BOX = "-m-2.5 p-2.5";
const draftOf = (week: TeachingWeek, tz: string): Draft => ({ release: toZonedInput(week.checkin_release_at, tz), due: toZonedInput(week.checkin_due_at, tz), hard: week.checkin_hard_deadline === false ? "soft" : "hard", label: week.label || "" });

export const CheckinsSection = () => {
    const [params, setParams] = useSearchParams();
    const classParam = params.get("class");
    const view = params.get("view") === "calendar" ? "calendar" : "list";
    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        setParams(next, { replace: true });
    };

    const [classes, setClasses] = useState<AdminClassRow[] | null>(null);
    const [weeks, setWeeks] = useState<TeachingWeek[] | null>(null);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [highlight, setHighlight] = useState<string | null>(null);
    const [schedule, setSchedule] = useState(false);

    useEffect(() => {
        api<AdminClassRow[]>("/api/admin/classes")
            .then(setClasses)
            .catch((e) => (toast((e as Error).message), setClasses([])));
    }, []);
    const classId = classParam || classes?.[0]?.id || null;
    const klass = classes?.find((row) => row.id === classId);
    const tz = classTimezone(klass?.timezone);

    const loadWeeks = useCallback(async () => {
        if (!classId) return setWeeks([]);
        try {
            setWeeks(await api<TeachingWeek[]>(`/api/admin/teaching-weeks?classId=${classId}`));
        } catch (e) {
            toast((e as Error).message);
            setWeeks((cur) => cur ?? []);
        }
    }, [classId]);
    useEffect(() => {
        if (classes) loadWeeks();
    }, [classes, loadWeeks]);

    const today = toZonedInput(new Date(), tz).slice(0, 10);
    const list = weeks ?? [];
    const upcoming = list.filter((week) => String(week.week_start).slice(0, 10) >= today).length;
    const off = list.filter((week) => week.checkin_enabled === false).length;

    const bulk = async (enabled: boolean) => {
        const weekIds = [...picked];
        if (!weekIds.length) return toast("Select some weeks first");
        try {
            const result = await api<{ updated: number }>("/api/admin/weeks/bulk-checkin", { method: "POST", json: { weekIds, enabled } });
            await loadWeeks();
            toast(`${plural(result.updated, "week")} turned ${enabled ? "on" : "off"}`);
        } catch (e) {
            toast((e as Error).message);
        }
    };

    // Toggling a week takes effect immediately; the times need an explicit save.
    const setEnabled = async (week: TeachingWeek, enabled: boolean) => {
        try {
            await api(`/api/admin/weeks/${week.id}/checkin`, { method: "PUT", json: { enabled } });
            await loadWeeks();
            toast(enabled ? "Check-in switched on" : "Check-in switched off for that week");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const saveWeek = async (week: TeachingWeek, d: Draft) => {
        try {
            await api(`/api/admin/weeks/${week.id}/checkin`, {
                method: "PUT",
                json: { releaseAt: fromZonedInput(d.release, tz), dueAt: fromZonedInput(d.due, tz), hardDeadline: d.hard === "hard", label: d.label.trim() || null },
            });
            toast("Week saved");
        } catch (e) {
            toast((e as Error).message);
        }
    };

    /* Deleting a week, as opposed to switching its check-in off. Off is the right answer for a bank
       holiday. Delete is for a week that should never have existed. Because the two are one click
       apart and only one of them is reversible, the confirmation says what is in the week and points
       back at the other option. */
    const deleteWeek = async (weekId: string) => {
        let impact: WeekImpact;
        try {
            impact = await api<WeekImpact>(`/api/admin/weeks/${weekId}/impact`);
        } catch (e) {
            return toast((e as Error).message);
        }
        if (impact.assignments > 0) {
            return toast(`This week still carries ${plural(impact.assignments, "assignment")}. Delete or move ${impact.assignments === 1 ? "it" : "them"} first.`);
        }
        const ok = await askConfirm({
            title: `Delete the week of ${fmtWeek(impact.week_start)}?`,
            message: impact.work
                ? `It holds ${plural(impact.checkins, "submitted check-in")} and ${plural(impact.attendance, "attendance record")}, and they go with it. This cannot be undone. Switching the check-in off instead keeps the week and everything in it.`
                : "Nothing has been submitted for this week, so nothing else goes with it.",
            confirmLabel: "Delete week",
            danger: true,
        });
        if (!ok) return;
        try {
            // The count is sent back so the server can refuse a stale confirmation.
            await api(`/api/admin/weeks/${weekId}?confirmWork=${impact.work}`, { method: "DELETE" });
            await loadWeeks();
            toast("Week deleted");
        } catch (e) {
            toast((e as Error).message);
        }
    };

    /* A day on the calendar is a way into its week, so clicking one goes back to the list with that row
       highlighted: the calendar answers "which weeks", the list is where they are changed. */
    const jumpToWeek = (weekId: string) => {
        setParam("view", null);
        setHighlight(weekId);
    };

    return (
        <>
            <SectionHead
                kicker="Weekly check-ins"
                title="Check-in schedule"
                sub={`Every week has its own switch and its own deadline. Times in ${tz}.`}
                actions={
                    <>
                        <DuoButton color="secondary" size="sm" onPress={() => bulk(false)}>
                            Turn off selected
                        </DuoButton>
                        <DuoButton color="secondary" size="sm" onPress={() => bulk(true)}>
                            Turn on selected
                        </DuoButton>
                        <DuoButton size="sm" onPress={() => setSchedule(true)} isDisabled={!classId}>
                            Create check-ins
                        </DuoButton>
                    </>
                }
            />

            <div className="mb-5 flex flex-col gap-3 rounded-2xl border-2 border-secondary bg-primary p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    {classes && classes.length > 0 && <DuoSelect label="Class" value={classId || ""} onChange={(id) => (setParam("class", id), setPicked(new Set()))} items={classes.map((row) => ({ id: row.id, label: classLabel(row) }))} className="min-w-64" />}
                    <span className="text-sm text-quaternary">
                        {list.length} weeks · {upcoming} still to come · {off} switched off
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Segmented
                        label="List or calendar"
                        value={view}
                        onChange={(v) => setParam("view", v === "calendar" ? "calendar" : null)}
                        items={[
                            { id: "list", label: "List" },
                            { id: "calendar", label: "Calendar" },
                        ]}
                    />
                    <DuoButton color="ghost" size="xs" onPress={() => setPicked(new Set())}>
                        Clear selection
                    </DuoButton>
                </div>
            </div>

            {weeks === null ? (
                <p className="text-sm text-quaternary">Loading the weeks…</p>
            ) : view === "calendar" ? (
                <CheckinCalendar weeks={list} today={today} onPick={jumpToWeek} />
            ) : (
                <WeekTable weeks={list} today={today} tz={tz} picked={picked} setPicked={setPicked} highlight={highlight} onEnabled={setEnabled} onSave={saveWeek} onDelete={deleteWeek} />
            )}

            <p className="mt-5 text-sm text-quaternary">
                A <strong>soft</strong> deadline keeps accepting check-ins after it closes, and the tracker shows them as “Open, late” rather than missed. A <strong>hard</strong> deadline closes the form. Switching a week off means no check-in is expected at all, and the tracker shows “Off”.
            </p>

            {schedule && classId && (
                <ScheduleDialog
                    classId={classId}
                    classTitle={klass ? classLabel(klass) : ""}
                    tz={tz}
                    onClose={() => setSchedule(false)}
                    onDone={loadWeeks}
                />
            )}
        </>
    );
};

/* ------------------------------------------------------------------ the list */

const WeekTable = ({
    weeks,
    today,
    tz,
    picked,
    setPicked,
    highlight,
    onEnabled,
    onSave,
    onDelete,
}: {
    weeks: TeachingWeek[];
    today: string;
    tz: string;
    picked: Set<string>;
    setPicked: (s: Set<string>) => void;
    highlight: string | null;
    onEnabled: (w: TeachingWeek, on: boolean) => void;
    onSave: (w: TeachingWeek, d: Draft) => Promise<void>;
    onDelete: (id: string) => void;
}) => {
    const all = weeks.length > 0 && weeks.every((w) => picked.has(w.id));
    const toggleAll = (on: boolean) => setPicked(on ? new Set(weeks.map((w) => w.id)) : new Set());
    const toggleOne = (id: string, on: boolean) => {
        const next = new Set(picked);
        if (on) next.add(id);
        else next.delete(id);
        setPicked(next);
    };
    const marks = useMemo(() => holidayIndex(), []);
    const head = "px-3 py-2 text-left font-bold";
    return (
        <div className="overflow-x-auto rounded-2xl border-2 border-secondary bg-primary">
            <table className="w-full min-w-[920px] text-sm">
                <thead className="duo-label text-quaternary">
                    <tr className="border-b border-secondary bg-primary">
                        {/* The tick and the week stay put while the times scroll sideways on a phone. */}
                        <th className={cx(head, PICK_COL)}>
                            <Checkbox size="md" className={PICK_BOX} isSelected={all} onChange={toggleAll} aria-label="Select every week" />
                        </th>
                        <th className={cx(head, WEEK_COL)}>Week</th>
                        <th className={head}>Check-in</th>
                        <th className={head}>Opens</th>
                        <th className={head}>Closes</th>
                        <th className={head}>Deadline</th>
                        <th className={head}>Note</th>
                        <th className={head} />
                    </tr>
                </thead>
                <tbody>
                    {weeks.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="p-6">
                                <Empty icon={Calendar} title="No weeks yet" note="Weeks are generated automatically once a class exists." />
                            </td>
                        </tr>
                    ) : (
                        weeks.map((week) => <WeekRow key={week.id} week={week} today={today} tz={tz} picked={picked.has(week.id)} onPick={(on) => toggleOne(week.id, on)} found={highlight === week.id} marks={holidaysInWeek(String(week.week_start).slice(0, 10), marks)} onEnabled={(on) => onEnabled(week, on)} onSave={(d) => onSave(week, d)} onDelete={() => onDelete(week.id)} />)
                    )}
                </tbody>
            </table>
        </div>
    );
};

const WeekRow = ({
    week,
    today,
    tz,
    picked,
    onPick,
    found,
    marks,
    onEnabled,
    onSave,
    onDelete,
}: {
    week: TeachingWeek;
    today: string;
    tz: string;
    picked: boolean;
    onPick: (on: boolean) => void;
    found: boolean;
    marks: { name: string }[];
    onEnabled: (on: boolean) => void;
    onSave: (d: Draft) => Promise<void>;
    onDelete: () => void;
}) => {
    const past = String(week.week_start).slice(0, 10) < today;
    const disabled = week.checkin_enabled === false;
    const [d, setD] = useState<Draft>(() => draftOf(week, tz));
    useEffect(() => setD(draftOf(week, tz)), [week, tz]);
    const ref = useRef<HTMLTableRowElement>(null);
    useEffect(() => {
        if (found) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [found]);
    return (
        <tr ref={ref} className={cx("border-b border-secondary last:border-0", found ? "bg-brand-primary ring-2 ring-brand ring-inset" : "bg-primary", past && "text-tertiary")}>
            <td className={cx("px-3 py-2", PICK_COL)}>
                <Checkbox size="md" className={PICK_BOX} isSelected={picked} onChange={onPick} aria-label={`Select week of ${fmtWeek(week.week_start)}`} />
            </td>
            <td className={cx("px-3 py-2 whitespace-nowrap", WEEK_COL)}>
                <strong className={past ? "text-tertiary" : "text-primary"}>{fmtWeek(week.week_start)}</strong>
                {past && <span className="ml-1 text-xs text-quaternary">· past</span>}
            </td>
            <td className="px-3 py-2">
                <Toggle isSelected={!disabled} onChange={onEnabled} label={disabled ? "Off" : "On"} className="min-h-10 items-center" />
            </td>
            <td className="px-3 py-2">
                <input type="datetime-local" aria-label="Opens" value={d.release} disabled={disabled} onChange={(e) => setD({ ...d, release: e.target.value })} className={FIELD_COMPACT_CLASS} />
            </td>
            <td className="px-3 py-2">
                <input type="datetime-local" aria-label="Closes" value={d.due} disabled={disabled} onChange={(e) => setD({ ...d, due: e.target.value })} className={FIELD_COMPACT_CLASS} />
            </td>
            <td className="px-3 py-2">
                <select aria-label="Deadline" value={d.hard} disabled={disabled} onChange={(e) => setD({ ...d, hard: e.target.value as Draft["hard"] })} className={FIELD_COMPACT_CLASS}>
                    <option value="hard">Hard</option>
                    <option value="soft">Soft</option>
                </select>
            </td>
            <td className="px-3 py-2">
                <input aria-label="Note" value={d.label} placeholder="e.g. Christmas week" onChange={(e) => setD({ ...d, label: e.target.value })} className={cx(FIELD_COMPACT_CLASS, "w-40")} />
                {marks.length > 0 && <span className="mt-1 block text-xs font-semibold text-warning-primary">{marks.map((m) => m.name).join(" · ")}</span>}
            </td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                    <DuoButton color="secondary" size="xs" onPress={() => onSave(d)}>
                        Save
                    </DuoButton>
                    <DuoButton color="danger" size="xs" ariaLabel="Delete this week" iconLeading={Trash01} onPress={onDelete} />
                </div>
            </td>
        </tr>
    );
};

/* ------------------------------------------------------------------ the term as a calendar
   The list is where a check-in is edited, but it cannot answer the question this screen is really for:
   which weeks should be switched off. That is a question about the shape of a term, so the same weeks
   are drawn as months with the bank holidays and the school breaks behind them. Nothing is switched
   off automatically. */
const CheckinCalendar = ({ weeks, today, onPick }: { weeks: TeachingWeek[]; today: string; onPick: (weekId: string) => void }) => {
    if (!weeks.length) return <Empty icon={Calendar} title="No weeks yet" note="Weeks are generated automatically once a class exists." />;
    const byWeekStart = new Map(weeks.map((week) => [String(week.week_start).slice(0, 10), week]));
    const marks = holidayIndex();
    const first = String(weeks[0].week_start).slice(0, 10);
    const last = String(weeks[weeks.length - 1].week_start).slice(0, 10);
    const months: { year: number; month: number }[] = [];
    const cursor = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
    const end = new Date(`${last.slice(0, 7)}-01T00:00:00Z`);
    while (cursor <= end) {
        months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const Key = ({ cls, children }: { cls: string; children: ReactNode }) => (
        <span className="flex items-center gap-1.5">
            <i aria-hidden="true" className={cx("inline-block size-2.5 rounded-full", cls)} />
            {children}
        </span>
    );
    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-tertiary">
                <Key cls="bg-success-solid">Check-in on</Key>
                <Key cls="bg-tertiary">Switched off</Key>
                <Key cls="bg-error-solid">Bank holiday</Key>
                <Key cls="bg-warning-solid">Likely school break</Key>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {months.map(({ year, month }) => {
                    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
                    const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday first.
                    return (
                        <section key={`${year}-${month}`} className="rounded-2xl border-2 border-secondary bg-primary p-3">
                            <h4 className="mb-2 font-bold text-primary">{new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" })}</h4>
                            <div className="grid grid-cols-7 gap-0.5">
                                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                                    <div key={i} className="py-1 text-center text-[10px] font-bold text-quaternary">
                                        {d}
                                    </div>
                                ))}
                                {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
                                {Array.from({ length: days }, (_, index) => {
                                    const date = `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
                                    const onDay = marks.get(date) || [];
                                    const bank = onDay.find((entry) => entry.kind === "public");
                                    const school = onDay.find((entry) => entry.kind === "school");
                                    // A week is owned by its Monday, so every day looks back to the Monday it belongs to.
                                    const week = byWeekStart.get(mondayOf(date));
                                    const state = week ? (week.checkin_enabled === false ? "off" : "on") : null;
                                    const Tag = week ? "button" : "div";
                                    return (
                                        <Tag
                                            key={date}
                                            type={week ? "button" : undefined}
                                            onClick={week ? () => onPick(week.id) : undefined}
                                            title={[bank?.name, school?.name].filter(Boolean).join(" · ")}
                                            className={cx(
                                                "flex min-h-11 flex-col items-center gap-0.5 rounded-lg p-1 text-xs",
                                                bank ? "bg-error-primary" : school ? "bg-warning-primary" : "",
                                                date === today && "ring-2 ring-brand",
                                                week && "cursor-pointer outline-focus-ring hover:bg-brand-primary focus-visible:outline-2",
                                            )}
                                        >
                                            <span className={cx("font-bold tabular-nums", bank ? "text-error-primary" : "text-secondary")}>{index + 1}</span>
                                            {state && <span aria-hidden="true" className={cx("size-2 rounded-full", state === "on" ? "bg-success-solid" : "bg-tertiary")} />}
                                            {bank && <span className="w-full truncate text-center text-[9px] leading-3 font-semibold text-error-primary">{bank.name.replace(" Bank Holiday", "").replace(" (substitute)", "*")}</span>}
                                        </Tag>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
            <p className="text-sm text-quaternary">Bank holidays are exact. School breaks are the usual pattern rather than any one school's calendar, worth checking against the Department's dates before a term is built on them. Click any day to jump to its week.</p>
        </section>
    );
};

/* ------------------------------------------------------------------ bulk schedule
   Build a term's worth of check-ins in one pass: pick the range and the weekly times, then look at
   exactly which weeks it will create and switch off the ones you do not want, before anything is
   written. */
const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7].map((value) => ({ id: String(value), label: DAY_NAMES[value] }));

/** Every Monday between the two dates, so the exceptions can be picked by eye. */
const scheduleWeeks = (start: string, end: string) => {
    if (!start || !end) return [];
    const toMonday = (value: string) => {
        const date = new Date(`${value}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        return date;
    };
    const first = toMonday(start),
        last = toMonday(end);
    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return [];
    const out: string[] = [];
    for (let cursor = first; cursor <= last && out.length <= 106; cursor = new Date(cursor.getTime() + 7 * 86400000)) out.push(cursor.toISOString().slice(0, 10));
    return out;
};

const ScheduleDialog = ({ classId, classTitle, tz, onClose, onDone }: { classId: string; classTitle: string; tz: string; onClose: () => void; onDone: () => Promise<void> }) => {
    const [start, setStart] = useState(toZonedInput(new Date(), tz).slice(0, 10));
    const [end, setEnd] = useState(toZonedInput(new Date(Date.now() + 12 * 7 * 86400000), tz).slice(0, 10));
    const [releaseDay, setReleaseDay] = useState("5");
    const [releaseTime, setReleaseTime] = useState("10:00");
    const [dueDay, setDueDay] = useState("7");
    const [dueTime, setDueTime] = useState("23:55");
    const [hard, setHard] = useState(true);
    const [skips, setSkips] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    const weeks = useMemo(() => scheduleWeeks(start, end), [start, end]);
    const dayLabel = (monday: string, day: number) => {
        const date = new Date(`${monday}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + day - 1);
        return new Intl.DateTimeFormat("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
    };
    const on = weeks.filter((week) => !skips.has(week)).length;

    const apply = async () => {
        if (!weeks.length) return toast("Choose a first and last week");
        const [releaseHour, releaseMinute] = (releaseTime || "10:00").split(":").map(Number);
        const [dueHour, dueMinute] = (dueTime || "23:55").split(":").map(Number);
        setBusy(true);
        try {
            const result = await api<{ created: number; updated: number; skipped: number }>(`/api/admin/classes/${classId}/checkin-schedule`, {
                method: "POST",
                json: { startDate: weeks[0], endDate: weeks[weeks.length - 1], skipWeekStarts: [...skips], releaseDay: Number(releaseDay), releaseHour, releaseMinute, dueDay: Number(dueDay), dueHour, dueMinute, hardDeadline: hard },
            });
            onClose();
            await onDone();
            toast(`${plural(result.created, "week")} created, ${result.updated} updated${result.skipped ? `, ${result.skipped} left switched off` : ""}`);
        } catch (e) {
            toast((e as Error).message);
            setBusy(false);
        }
    };

    return (
        <DuoDialog open onClose={onClose} title="Create check-ins" sub={classTitle} className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <FieldLabel>First week</FieldLabel>
                        <input type="date" aria-label="First week" value={start} onChange={(e) => setStart(e.target.value)} className={FIELD_CLASS} />
                    </div>
                    <div>
                        <FieldLabel>Last week</FieldLabel>
                        <input type="date" aria-label="Last week" value={end} onChange={(e) => setEnd(e.target.value)} className={FIELD_CLASS} />
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <FieldLabel>Opens to students</FieldLabel>
                        <div className="flex gap-2">
                            <DuoSelect label="Opens on" value={releaseDay} onChange={setReleaseDay} items={DAY_CHOICES} className="flex-1" />
                            <input type="time" aria-label="Opens at" value={releaseTime} onChange={(e) => setReleaseTime(e.target.value)} className={cx(FIELD_CLASS, "w-32")} />
                        </div>
                        <p className="mt-1.5 text-sm text-quaternary">Students cannot see a check-in before this.</p>
                    </div>
                    <div>
                        <FieldLabel>Closes</FieldLabel>
                        <div className="flex gap-2">
                            <DuoSelect label="Closes on" value={dueDay} onChange={setDueDay} items={DAY_CHOICES} className="flex-1" />
                            <input type="time" aria-label="Closes at" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={cx(FIELD_CLASS, "w-32")} />
                        </div>
                        <p className="mt-1.5 text-sm text-quaternary">Times are {tz}.</p>
                    </div>
                </div>
                <Toggle isSelected={hard} onChange={setHard} label="Hard deadline, the form closes when it is due" />
                <div>
                    <h3 className="text-md font-bold text-primary">Weeks this will create</h3>
                    <p className="mt-1 text-sm text-quaternary">Untick any week you do not want a check-in to go out. It stays on the tracker as a teaching week, but nothing is asked of the students.</p>
                </div>
                {!weeks.length ? (
                    <Empty icon={Calendar} title="No weeks in that range" note="Check the first and last week." />
                ) : weeks.length > 105 ? (
                    <div className="rounded-2xl border-2 border-error-subtle bg-error-primary p-4 text-sm font-semibold text-error-primary">That range covers more than two years. Choose a shorter run.</div>
                ) : (
                    <>
                        <p className="text-sm text-secondary">
                            <strong>{plural(on, "check-in")}</strong> across {plural(weeks.length, "week")}
                            {weeks.length - on ? ` · ${weeks.length - on} skipped` : ""}
                        </p>
                        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-2xl border-2 border-secondary p-2">
                            {weeks.map((week) => {
                                const skipped = skips.has(week);
                                return (
                                    <li key={week} className={cx("rounded-xl px-2 py-1.5", skipped && "opacity-60")}>
                                        <Toggle
                                            isSelected={!skipped}
                                            onChange={(on) =>
                                                setSkips((cur) => {
                                                    const next = new Set(cur);
                                                    if (on) next.delete(week);
                                                    else next.add(week);
                                                    return next;
                                                })
                                            }
                                            label={`Week of ${fmtWeek(week)}`}
                                            hint={skipped ? "No check-in this week" : `Opens ${dayLabel(week, Number(releaseDay))} at ${releaseTime} · closes ${dayLabel(week, Number(dueDay))} at ${dueTime}`}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>
            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton onPress={apply} isDisabled={busy}>
                    {busy ? "Creating…" : "Create check-ins"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
