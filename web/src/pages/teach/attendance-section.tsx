// /teach/attendance: who was in the class. What Zoom saw, class by class (sync, fill in the past,
// who was there and matching an unplaced name to a student), and the CSV upload for a class with
// no Zoom link. A port of attendanceView, bindAttendance, renderZoomAttendance and
// openSittingPeople from the old app.js.
import { type FormEvent, useEffect, useRef, useState } from "react";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { toast } from "@/components/app/toast";
import { type AdminClass, DAY_NAMES, api, upload, useAdminBootstrap, useApi } from "@/lib/portal";
import {
    type AttendanceImportResult,
    type TrackerLite,
    type ZoomAttendance,
    type ZoomAttendanceClass,
    type ZoomIdentityResult,
    type ZoomSitting,
    type ZoomSyncResult,
    fmtDate,
    fmtWeek,
    plural,
} from "@/lib/teach-settings";
import { Chip, Field, Labelled, Notice, Quiet, SettingsCard, TableWrap, tdCls, thCls } from "./settings-cards";

/** "Programme | Monday | 19:00", as the old classLabel() built it. */
const classLabel = (k: AdminClass) => (typeof k.label === "string" && k.label) || `${k.programme_name} | ${DAY_NAMES[Number(k.day_of_week)]} | ${String(k.start_time).slice(0, 5)}`;

export const AttendanceSection = () => {
    const boot = useAdminBootstrap();
    const tz = boot?.classes[0]?.timezone;
    const zoom = useApi<ZoomAttendance>("/api/admin/zoom/attendance");
    const classes = useApi<AdminClass[]>("/api/admin/classes");
    const [syncingAll, setSyncingAll] = useState(false);
    const [people, setPeople] = useState<{ klass: ZoomAttendanceClass; sitting: ZoomSitting } | null>(null);
    const [imported, setImported] = useState<AttendanceImportResult | null>(null);

    // The header button: recent sittings of every active class.
    const syncAll = async () => {
        setSyncingAll(true);
        try {
            const result = await api<ZoomSyncResult>("/api/admin/zoom/attendance/sync", { method: "POST", json: { all: false } });
            const fresh = (result.classes || []).reduce((a, c) => a + (c.newSittings || 0), 0);
            toast(result.ok === false ? result.reason || "Zoom is not connected." : `${fresh} new ${plural(fresh, "sitting")} read from Zoom`);
            zoom.reload();
        } catch (e) {
            toast((e as Error).message);
        }
        setSyncingAll(false);
    };

    return (
        <>
            <SectionHead kicker="Attendance" title="Who was in the class" sub="Read from Zoom after every class, or uploaded as a CSV." />

            <div className="flex flex-col gap-6">
                <SettingsCard
                    id="zoom-attendance-card"
                    title="From Zoom"
                    sub="Each class’s Zoom link names its webinar. After every class Zoom’s report of who was there, and for how long, is read into the tracker: thirty minutes or more counts as live."
                    actions={
                        <DuoButton size="xs" color="secondary" onPress={syncAll} isDisabled={syncingAll}>
                            {syncingAll ? "Asking Zoom…" : "Sync New Sittings"}
                        </DuoButton>
                    }
                >
                    <ZoomPanel data={zoom.data} error={zoom.error} loading={zoom.loading} tz={tz} onChanged={zoom.reload} onPeople={(klass, sitting) => setPeople({ klass, sitting })} />
                </SettingsCard>

                <SettingsCard className="max-w-3xl" title="Attendance CSV" sub="For a class with no Zoom link, or a one-off. Students are matched by email first, then by exact name.">
                    <CsvForm classes={classes.data} onImported={setImported} />
                </SettingsCard>
            </div>

            {people && <SittingPeopleDialog klass={people.klass} sitting={people.sitting} tz={tz} onClose={() => setPeople(null)} onChanged={zoom.reload} />}

            <DuoDialog open={Boolean(imported)} onClose={() => setImported(null)} title="Attendance imported" sub={imported ? `${imported.rows.filter((r) => r.matched).length} students matched` : undefined} className="max-w-2xl">
                {imported && (
                    <>
                        <TableWrap>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-secondary">
                                        <th className={thCls}>Student</th>
                                        <th className={thCls}>Status</th>
                                        <th className={thCls}>Minutes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {imported.rows.map((row, i) => (
                                        <tr key={i} className="border-b border-secondary last:border-b-0">
                                            <td className={tdCls}>{row.name || row.email || "Unknown"}</td>
                                            <td className={tdCls}>{row.matched ? <Chip tone="green">{row.status}</Chip> : <Chip tone="red">Unmatched</Chip>}</td>
                                            <td className={tdCls}>{row.minutes ?? ""}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </TableWrap>
                        <div className="mt-6 flex justify-end">
                            <DuoButton size="sm" onPress={() => setImported(null)}>
                                Done
                            </DuoButton>
                        </div>
                    </>
                )}
            </DuoDialog>
        </>
    );
};

/* What Zoom saw, class by class: every sitting, who was placed, who was not. */
const ZoomPanel = ({ data, error, loading, tz, onChanged, onPeople }: { data: ZoomAttendance | undefined; error: Error | null; loading: boolean; tz?: string; onChanged: () => void; onPeople: (k: ZoomAttendanceClass, s: ZoomSitting) => void }) => {
    const [busy, setBusy] = useState<string | null>(null); // "<classId>:new" | "<classId>:all"

    if (!data && loading) return <Quiet>Asking the portal what Zoom has seen…</Quiet>;
    if (!data) return <Quiet>{error?.message || "Nothing came back."}</Quiet>;
    if (!data.configured)
        return (
            <Notice tone="warning" title="The Zoom account is not connected.">
                Under Settings, the Zoom account card takes the Account ID, Client ID and Client Secret of a Server-to-Server app. Once it is in, attendance reads itself after every class and the past can be filled in from here.
            </Notice>
        );
    if (!data.classes.length) return <Quiet>No class has a Zoom link yet. Put the webinar link in Class setup and its attendance can be read.</Quiet>;

    const sync = async (classId: string, all: boolean) => {
        const key = `${classId}:${all ? "all" : "new"}`;
        setBusy(key);
        try {
            const result = await api<ZoomSyncResult>("/api/admin/zoom/attendance/sync", { method: "POST", json: { classId, all } });
            if (result.ok === false) toast(result.reason || "Zoom is not connected.");
            else {
                const n = result.newSittings || 0;
                toast(`${n} new ${plural(n, "sitting")} read${result.errors?.length ? `, ${result.errors.length} could not be: ${result.errors[0]}` : ""}`);
            }
            onChanged();
        } catch (e) {
            toast((e as Error).message);
        }
        setBusy(null);
    };

    return (
        <div className="flex flex-col gap-6">
            {data.classes.map((klass) => {
                const last = klass.sittings[0];
                const unplaced = klass.sittings.reduce((a, s) => a + (s.unmatched || 0), 0);
                return (
                    <div key={klass.id} className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                                <p className="text-md font-bold text-primary">
                                    {klass.label}
                                    <span className="ml-2 text-sm font-medium text-quaternary">
                                        · {DAY_NAMES[klass.dayOfWeek] || ""} {String(klass.startTime || "").slice(0, 5)} · Zoom {klass.zoomIds.join(", ")}
                                        {klass.active ? "" : " · class not active"}
                                    </span>
                                </p>
                                <p className="text-sm text-tertiary">
                                    {klass.sittings.length ? (
                                        <>
                                            {klass.sittings.length} {plural(klass.sittings.length, "sitting")} on record, latest {fmtDate(last.startedAt, { dateStyle: "medium", timeZone: tz })}
                                            {unplaced ? (
                                                <>
                                                    , <b className="text-primary">{unplaced} {plural(unplaced, "name")} not placed</b>
                                                </>
                                            ) : null}
                                        </>
                                    ) : (
                                        "Nothing read from Zoom yet."
                                    )}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <DuoButton size="xs" color="secondary" onPress={() => sync(klass.id, false)} isDisabled={busy !== null}>
                                    {busy === `${klass.id}:new` ? "Asking Zoom…" : "Sync New"}
                                </DuoButton>
                                <span title="Every past sitting Zoom still has for this webinar">
                                    <DuoButton size="xs" color="secondary" onPress={() => sync(klass.id, true)} isDisabled={busy !== null}>
                                        {busy === `${klass.id}:all` ? "Asking Zoom…" : "Fill in the Past"}
                                    </DuoButton>
                                </span>
                            </div>
                        </div>
                        {klass.sittings.length > 0 && (
                            <TableWrap>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-secondary">
                                            <th className={thCls}>Sitting</th>
                                            <th className={thCls}>Length</th>
                                            <th className={thCls}>Week</th>
                                            <th className={thCls}>Placed</th>
                                            <th className={thCls}>Not placed</th>
                                            <th className={thCls}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {klass.sittings.map((s) => (
                                            <tr key={s.id} className="border-b border-secondary last:border-b-0">
                                                <td className={cxTd("whitespace-nowrap text-primary")}>{fmtDate(s.startedAt, { dateStyle: "medium", time: true, weekday: true, timeZone: tz })}</td>
                                                <td className={cxTd("whitespace-nowrap")}>{s.durationMinutes ? `${s.durationMinutes} min` : ""}</td>
                                                <td className={cxTd("whitespace-nowrap")}>{s.weekStart ? fmtWeek(s.weekStart) : <span className="text-quaternary">no teaching week</span>}</td>
                                                <td className={cxTd("tabular-nums")}>{s.matched}</td>
                                                <td className={cxTd("tabular-nums")}>{s.unmatched ? <b className="text-primary">{s.unmatched}</b> : "0"}</td>
                                                <td className={cxTd("text-right")}>
                                                    <DuoButton size="xs" color="secondary" onPress={() => onPeople(klass, s)}>
                                                        Who
                                                    </DuoButton>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </TableWrap>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
const cxTd = (extra: string) => `${tdCls} ${extra}`;

/* One sitting's people. The unplaced ones get a dropdown of the class, and a choice is
   remembered for every sitting before and after. */
const SittingPeopleDialog = ({ klass, sitting, tz, onClose, onChanged }: { klass: ZoomAttendanceClass; sitting: ZoomSitting; tz?: string; onClose: () => void; onChanged: () => void }) => {
    const roster = useApi<TrackerLite>(`/api/admin/tracker/${klass.id}`);
    const students = roster.data?.students ?? [];
    const [picks, setPicks] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState<number | null>(null);
    const people = [...sitting.people].sort((a, b) => (a.studentId ? 1 : 0) - (b.studentId ? 1 : 0) || b.minutes - a.minutes);

    const remember = async (i: number) => {
        const studentId = picks[i];
        if (!studentId) return toast("Choose the student first.");
        setSaving(i);
        try {
            const result = await api<ZoomIdentityResult>("/api/admin/zoom/attendance/identity", { method: "POST", json: { studentId, email: people[i].email || "", name: people[i].name || "" } });
            toast(`Remembered. ${result.placed} ${plural(result.placed, "sitting")} updated.`);
            onClose();
            onChanged();
        } catch (e) {
            toast((e as Error).message);
            setSaving(null);
        }
    };

    const options = [{ id: "", label: "Not a student" }, ...students.map((s) => ({ id: s.id, label: s.name }))];

    return (
        <DuoDialog open onClose={onClose} title={`${klass.label}, ${fmtDate(sitting.startedAt, { dateStyle: "medium", weekday: true, timeZone: tz })}`} sub={`${sitting.matched} placed, ${sitting.unmatched} not. Thirty minutes or more counts as live.`} className="max-w-3xl">
            <TableWrap className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-secondary">
                            <th className={thCls}>On Zoom as</th>
                            <th className={thCls}>Minutes</th>
                            <th className={thCls}>Student</th>
                        </tr>
                    </thead>
                    <tbody>
                        {people.map((p, i) => (
                            <tr key={i} className="border-b border-secondary last:border-b-0">
                                <td className={tdCls}>
                                    <span className="font-medium text-primary">{p.name || ""}</span>
                                    {p.email && <span className="block text-xs text-quaternary">{p.email}</span>}
                                </td>
                                <td className={cxTd("tabular-nums")}>{p.minutes}</td>
                                <td className={tdCls}>
                                    {p.studentId ? (
                                        p.studentName || ""
                                    ) : (
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                            <DuoSelect label="Student" value={picks[i] ?? ""} items={options} onChange={(id) => setPicks((prev) => ({ ...prev, [i]: id }))} className="min-w-44 py-1.5 text-sm" />
                                            <DuoButton size="xs" color="secondary" onPress={() => remember(i)} isDisabled={saving === i}>
                                                Remember
                                            </DuoButton>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableWrap>
            <div className="mt-6 flex justify-end">
                <DuoButton size="sm" onPress={onClose}>
                    Close
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* The CSV upload: class, teaching week (loaded from the class's tracker), the live threshold and the file.
   Field names are the ones the multer route reads: classId, weekId, liveThresholdMinutes, file. */
const CsvForm = ({ classes, onImported }: { classes: AdminClass[] | undefined; onImported: (r: AttendanceImportResult) => void }) => {
    const [classId, setClassId] = useState("");
    const [weekId, setWeekId] = useState("");
    const [threshold, setThreshold] = useState("30");
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!classId && classes?.[0]) setClassId(classes[0].id);
    }, [classes, classId]);
    const tracker = useApi<TrackerLite>(classId ? `/api/admin/tracker/${classId}` : null);
    const weeks = tracker.data?.weeks ?? [];
    useEffect(() => {
        // Keep a valid week chosen whenever the class (and so the week list) changes.
        if (weeks.length && !weeks.some((w) => w.id === weekId)) setWeekId(weeks[0].id);
    }, [weeks, weekId]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const file = fileRef.current?.files?.[0];
        if (!file) return toast("Choose an attendance CSV.");
        const fd = new FormData();
        fd.set("classId", classId);
        fd.set("weekId", weekId);
        fd.set("liveThresholdMinutes", threshold);
        fd.set("file", file);
        setBusy(true);
        try {
            const result = await upload<AttendanceImportResult>("/api/admin/attendance/import", fd);
            onImported(result);
            formRef.current?.reset();
        } catch (err) {
            toast((err as Error).message);
        }
        setBusy(false);
    };

    if (!classes) return <Quiet>Loading classes…</Quiet>;
    if (!classes.length) return <Quiet>No classes yet. Add a class first.</Quiet>;

    return (
        <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
            <Labelled label="Class">
                <DuoSelect label="Class" value={classId} items={classes.map((k) => ({ id: k.id, label: classLabel(k) }))} onChange={setClassId} className="w-full" />
            </Labelled>
            <Labelled label="Teaching week">
                {weeks.length ? (
                    <DuoSelect label="Teaching week" value={weekId} items={weeks.map((w) => ({ id: w.id, label: `Week of ${fmtWeek(w.week_start)}` }))} onChange={setWeekId} className="w-full" />
                ) : (
                    <Quiet>{tracker.loading ? "Loading weeks…" : "Choose a class first"}</Quiet>
                )}
            </Labelled>
            <Labelled label="Minutes required for attended live">
                <Field type="number" min={1} required value={threshold} onChange={setThreshold} ariaLabel="Minutes required for attended live" />
            </Labelled>
            <Labelled label="Attendance CSV">
                <input ref={fileRef} type="file" name="file" accept=".csv,text/csv" required aria-label="Attendance CSV" className="block w-full text-sm text-secondary file:mr-3 file:rounded-xl file:border-2 file:border-secondary file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-brand-secondary" />
            </Labelled>
            <div>
                <DuoButton type="submit" size="sm" isDisabled={busy || !weekId}>
                    {busy ? "Importing…" : "Import Attendance"}
                </DuoButton>
            </div>
        </form>
    );
};
