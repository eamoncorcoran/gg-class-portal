// Class setup: the join link, the term dates, every class date in the term with its on/recorded/
// moved/off switch, the board switch, the courses the class carries, extra sessions and who has
// watched the recordings. Ported from the old hub's openClassSetupModal and its session rows.
import { type ReactNode, useEffect, useState } from "react";
import { askConfirm } from "@/components/app/confirm";
import { TEXTAREA_CLASS } from "@/components/app/dictation";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { DAY_NAMES, api, useApi } from "@/lib/portal";
import { type ClassSession, type ClassSetup, type DateChange, type DateChangeKind, classDatesFor, classLabel, errMsg, fromZonedInput, holidaysInWeek, mondayOf, toZonedInput } from "@/lib/teach";
import { cx } from "@/utils/cx";
import { Pill } from "./review-drawer";

const Block = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="border-t-2 border-secondary pt-5 first:border-t-0 first:pt-0">
        <h3 className="mb-3 text-md font-bold text-primary">{title}</h3>
        {children}
    </section>
);
const Note = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cx("text-xs leading-5 text-quaternary", className)}>{children}</p>;
const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
    <div className={className}>
        <FieldLabel>{label}</FieldLabel>
        {children}
    </div>
);
const INPUT = cx(TEXTAREA_CLASS, "py-2.5 text-sm");

type Change = { kind: Exclude<DateChangeKind, "running">; movedTo: string | null };

export const ClassSetupDialog = ({ classId, onClose, onSaved }: { classId: string | null; onClose: () => void; onSaved: () => void | Promise<void> }) => {
    const setup = useApi<ClassSetup>(classId ? `/api/admin/classes/${classId}/setup` : null);
    const [form, setForm] = useState({ joinUrl: "", joinNote: "", startsOn: "", endsOn: "", hasCommunity: true, courseIds: new Set<string>() });
    const [changes, setChanges] = useState<Map<string, Change>>(new Map());
    const [saving, setSaving] = useState(false);
    const klass = setup.data?.class;

    useEffect(() => {
        if (setup.error) toast(setup.error.message);
    }, [setup.error]);
    // Filled from the server once; later reloads (after a session change) must not undo edits.
    const [seeded, setSeeded] = useState<string | null>(null);
    useEffect(() => {
        if (!setup.data || seeded === setup.data.class.id) return;
        const k = setup.data.class;
        setForm({
            joinUrl: k.join_url || "",
            joinNote: k.join_note || "",
            startsOn: String(k.starts_on || "").slice(0, 10),
            endsOn: String(k.ends_on || "").slice(0, 10),
            hasCommunity: Boolean(k.has_community),
            courseIds: new Set(setup.data.courses.filter((c) => c.enrolled && !c.open_to_all).map((c) => c.id)),
        });
        setChanges(new Map(setup.data.dateChanges.map((c) => [String(c.onDate).slice(0, 10), { kind: c.kind, movedTo: c.movedTo }])));
        setSeeded(k.id);
    }, [setup.data, seeded]);
    useEffect(() => {
        if (!classId) setSeeded(null);
    }, [classId]);

    if (!classId) return null;
    const tz = klass?.timezone || "Europe/Dublin";
    const dates = klass?.starts_on && klass?.ends_on ? classDatesFor(klass) : [];

    const save = async () => {
        if (!klass) return;
        /* Checked before anything is written. A week marked as moved with no date would leave students
           with a changed week and no answer about when it is, and saving the rest of the form around it
           would leave the screen half saved. */
        const list: DateChange[] = dates.length ? [...changes.entries()].map(([onDate, c]) => ({ onDate, kind: c.kind, movedTo: c.kind === "moved" ? c.movedTo : null })) : [];
        const homeless = list.find((c) => c.kind === "moved" && !c.movedTo);
        if (homeless) {
            document.querySelector<HTMLInputElement>(`[data-date-moved="${homeless.onDate}"]`)?.focus();
            toast("Give the moved class a new date and time.");
            return;
        }
        setSaving(true);
        try {
            await api(`/api/admin/classes/${classId}`, {
                method: "PATCH",
                json: {
                    joinUrl: form.joinUrl.trim(),
                    joinNote: form.joinNote.trim(),
                    hasCommunity: form.hasCommunity,
                    startsOn: form.startsOn || null,
                    endsOn: form.endsOn || null,
                    // Courses open to every class are ticked and disabled, so they never appear here.
                    courseIds: [...form.courseIds],
                },
            });
            /* Sent whole, after the class itself, because the term dates decide which dates exist at
               all; saving the skips first could file them against a term that is about to change. */
            if (dates.length) await api(`/api/admin/classes/${classId}/date-changes`, { method: "PUT", json: { changes: list } });
            toast("Class saved");
            await onSaved();
            onClose();
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setSaving(false);
        }
    };

    const running = dates.length - [...changes.values()].filter((c) => c.kind !== "moved").length;
    // Today where the class is, not where the browser is: a Dublin Monday is still "coming" at 2am Dublin time whatever the Mac's clock says.
    const today = toZonedInput(new Date(), tz).slice(0, 10);

    return (
        <DuoDialog open onClose={onClose} title="Class setup" sub={klass ? classLabel(klass) : "Loading…"} className="max-w-3xl max-h-[92dvh] overflow-y-auto">
            {!setup.data || !klass ? (
                <p className="text-sm text-quaternary">Loading…</p>
            ) : (
                <div className="flex flex-col gap-5">
                    <Block title="Class link">
                        <Field label="Join address">
                            <input type="url" value={form.joinUrl} onChange={(e) => setForm({ ...form, joinUrl: e.target.value })} placeholder="https://us02web.zoom.us/j/..." aria-label="Join address" className={INPUT} />
                        </Field>
                        <Field label="Note, optional" className="mt-3">
                            <input maxLength={200} value={form.joinNote} onChange={(e) => setForm({ ...form, joinNote: e.target.value })} placeholder="Passcode 4821" aria-label="Note" className={INPUT} />
                        </Field>
                        <Note className="mt-2">Students see a Join button on every page as soon as this is set, with a countdown from twelve hours before the class and until two hours after it starts. Clearing the address removes the banner rather than leaving a button that goes nowhere.</Note>
                    </Block>

                    <Block title="When the course runs">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="First day">
                                <input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} aria-label="First day" className={INPUT} />
                            </Field>
                            <Field label="Last day">
                                <input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} aria-label="Last day" className={INPUT} />
                            </Field>
                        </div>
                        <Note className="mt-2">Weekly check-ins are only created inside these dates. Without them the portal makes weeks around today, which is how a course set up in August ends up showing students weeks in August.</Note>
                    </Block>

                    <Block title="Class dates">
                        <Note>Every {DAY_NAMES[klass.day_of_week] || "week"} in the term. Switch off the weeks the class does not meet. Bank holidays and mid-terms are marked, but the decision is yours.</Note>
                        {!klass.starts_on || !klass.ends_on ? (
                            <Note className="mt-2">Set the first and last day of the course above, and every class date appears here.</Note>
                        ) : !dates.length ? (
                            <Note className="mt-2">No class dates fall inside those dates.</Note>
                        ) : (
                            <>
                                <ul className="mt-3 flex flex-col gap-1.5">
                                    {dates.map((date) => (
                                        <DateRow key={date} date={date} klass={klass} tz={tz} change={changes.get(date)} past={date < today} onChange={(c) => setChanges((m) => {
                                            const n = new Map(m);
                                            if (c) n.set(date, c);
                                            else n.delete(date);
                                            return n;
                                        })} />
                                    ))}
                                </ul>
                                <Note className="mt-2">
                                    <strong className="text-primary">{running}</strong> of {dates.length} weeks running live.
                                </Note>
                            </>
                        )}
                    </Block>

                    <Block title="Community">
                        <Checkbox label="This class has a board" isSelected={form.hasCommunity} onChange={(v) => setForm({ ...form, hasCommunity: v })} />
                        <Note className="mt-2">Turned off, Community disappears from these students’ menu entirely. Anything already posted is kept and comes back if it is turned on again.</Note>
                    </Block>

                    <Block title="Courses">
                        {setup.data.courses.length ? (
                            <div className="flex flex-col gap-2">
                                {setup.data.courses.map((c) => (
                                    <Checkbox
                                        key={c.id}
                                        isSelected={c.open_to_all || form.courseIds.has(c.id)}
                                        isDisabled={c.open_to_all}
                                        onChange={(v) =>
                                            setForm((f) => {
                                                const s = new Set(f.courseIds);
                                                if (v) s.add(c.id);
                                                else s.delete(c.id);
                                                return { ...f, courseIds: s };
                                            })
                                        }
                                        label={
                                            <span className="flex items-center gap-2">
                                                {c.title}
                                                {c.open_to_all && <Pill>Every class</Pill>}
                                            </span>
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <Note>No courses yet.</Note>
                        )}
                    </Block>

                    <Block title="Extra sessions">
                        <Note>A second evening that week, a catch-up, a moved class. Whichever comes first, this or the weekly slot, is the one students are shown, and a session with its own link uses that instead of the class link.</Note>
                        <Sessions classId={classId} sessions={setup.data.sessions} tz={tz} onChanged={() => setup.reload()} />
                    </Block>

                    <Block title="Recordings watched">
                        {setup.data.recordings.length ? (
                            <div className="overflow-x-auto rounded-2xl border-2 border-secondary">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="duo-label text-quaternary">
                                            <th className="px-3 py-2 text-left">Student</th>
                                            <th className="px-3 py-2 text-left">Watched</th>
                                            <th className="px-3 py-2 text-left"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {setup.data.recordings.map((r) => (
                                            <tr key={r.id} className="border-t border-secondary">
                                                <td className="px-3 py-2 font-semibold text-primary">{r.name.trim()}</td>
                                                <td className="px-3 py-2 text-secondary tabular-nums">
                                                    {r.completed_count} of {r.lesson_count}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                                                            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${r.percent}%` }} />
                                                        </div>
                                                        <b className="text-xs text-secondary tabular-nums">{r.percent}%</b>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <Note>Nobody is in this class yet, or it has no recordings.</Note>
                        )}
                    </Block>

                    <div className="flex flex-col-reverse gap-2 border-t-2 border-secondary pt-5 sm:flex-row sm:justify-end">
                        <DuoButton color="secondary" size="sm" onPress={onClose}>
                            Close
                        </DuoButton>
                        <DuoButton size="sm" onPress={save} isDisabled={saving}>
                            Save
                        </DuoButton>
                    </div>
                </div>
            )}
        </DuoDialog>
    );
};

/* One week, and what is happening to it. Four states rather than a switch, because a week that is
   off, a week replaced by a recording and a week that has moved are three different messages to a
   student, not one absence with a note attached. */
const DateRow = ({ date, klass, tz, change, past, onChange }: { date: string; klass: ClassSetup["class"]; tz: string; change?: Change; past: boolean; onChange: (c: Change | null) => void }) => {
    const kind: DateChangeKind = change?.kind || "running";
    const marks = holidaysInWeek(mondayOf(date)).filter((m) => m.date === date);
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    const said = {
        running: `${String(klass.start_time).slice(0, 5)} · as usual`,
        skipped: "No class this week",
        recorded: "Pre-recorded. Students watch the recording",
        moved: change?.movedTo ? `Moved to ${new Date(change.movedTo).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}` : "Moved. Needs a new date",
    }[kind];
    return (
        <li className={cx("flex flex-col gap-2 rounded-2xl border-2 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center", kind === "running" ? "border-secondary" : kind === "skipped" ? "border-secondary bg-secondary" : kind === "moved" ? "border-blue-200 bg-blue-50" : "border-secondary bg-secondary_subtle", past && "opacity-70")}>
            <div className="min-w-0 flex-1">
                <strong className="block text-sm font-bold text-primary">{day}</strong>
                <span className="block text-xs text-tertiary">{said}</span>
            </div>
            {marks.length > 0 && <Pill tone="orange">{marks.map((m) => m.name).join(" · ")}</Pill>}
            <Segmented
                label={`What happens on ${day}`}
                size="xs"
                value={kind}
                onChange={(k) => onChange(k === "running" ? null : { kind: k, movedTo: k === "moved" ? change?.movedTo || null : null })}
                items={[
                    { id: "running", label: "On" },
                    { id: "recorded", label: "Recorded" },
                    { id: "moved", label: "Moved" },
                    { id: "skipped", label: "Off" },
                ]}
            />
            {kind === "moved" && (
                <div className="w-full sm:basis-full">
                    <FieldLabel>New date and time</FieldLabel>
                    <input
                        type="datetime-local"
                        autoFocus={!change?.movedTo}
                        data-date-moved={date}
                        aria-label={`New date and time for ${day}`}
                        value={change?.movedTo ? toZonedInput(change.movedTo, tz) : ""}
                        onChange={(e) => onChange({ kind: "moved", movedTo: e.target.value ? fromZonedInput(e.target.value, tz) : null })}
                        className={INPUT}
                    />
                </div>
            )}
        </li>
    );
};

/* An extra sitting, past or future. A cancelled one stays on the list, struck through, so it is
   clear it was called off rather than never entered. Editing happens in the row it is already in. */
type SessionForm = { startsAt: string; durationMinutes: string; label: string; joinUrl: string };
const EMPTY: SessionForm = { startsAt: "", durationMinutes: "90", label: "", joinUrl: "" };

/* datetime-local wants the wall clock at the class, not at whoever is looking. Built from the parts
   rather than by slicing an ISO string, which would show UTC. */
const localFor = (iso: string, tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        .formatToParts(new Date(iso))
        .reduce<Record<string, string>>((all, p) => ({ ...all, [p.type]: p.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
};

const SessionFields = ({ form, setForm, onSubmit, submitLabel, onCancel }: { form: SessionForm; setForm: (f: SessionForm) => void; onSubmit: () => void; submitLabel: string; onCancel?: () => void }) => (
    <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
        }}
    >
        <Field label="Date and time">
            <input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} aria-label="Date and time" className={INPUT} />
        </Field>
        <Field label="Minutes">
            <input type="number" min={15} max={480} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} aria-label="Minutes" className={INPUT} />
        </Field>
        <Field label="Label, optional">
            <input maxLength={120} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Catch-up session" aria-label="Label" className={INPUT} />
        </Field>
        <Field label="Link, optional">
            <input type="url" value={form.joinUrl} onChange={(e) => setForm({ ...form, joinUrl: e.target.value })} placeholder="Leave empty to use the class link" aria-label="Link" className={INPUT} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
            {onCancel && (
                <DuoButton color="secondary" size="xs" onPress={onCancel}>
                    Cancel
                </DuoButton>
            )}
            <DuoButton color={onCancel ? "primary" : "secondary"} size="xs" type="submit">
                {submitLabel}
            </DuoButton>
        </div>
    </form>
);

const Sessions = ({ classId, sessions, tz, onChanged }: { classId: string; sessions: ClassSession[]; tz: string; onChanged: () => Promise<void> | void }) => {
    const [add, setAdd] = useState<SessionForm>(EMPTY);
    const [editing, setEditing] = useState<{ id: string; form: SessionForm } | null>(null);

    const body = (f: SessionForm) => ({
        /* Read as the class's wall clock, not the browser's, so a session added from anywhere but
           Ireland lands at the right hour. */
        startsAt: fromZonedInput(f.startsAt, tz),
        durationMinutes: Number(f.durationMinutes) || 90,
        label: f.label.trim(),
        joinUrl: f.joinUrl.trim(),
    });
    const create = async () => {
        if (!add.startsAt) return toast("Pick a date and time.");
        try {
            await api(`/api/admin/classes/${classId}/sessions`, { method: "POST", json: body(add) });
            setAdd(EMPTY);
            await onChanged();
            toast("Session added");
        } catch (e) {
            toast(errMsg(e));
        }
    };
    const patch = async (id: string, json: unknown, msg?: string) => {
        try {
            await api(`/api/admin/classes/${classId}/sessions/${id}`, { method: "PATCH", json });
            await onChanged();
            if (msg) toast(msg);
        } catch (e) {
            toast(errMsg(e));
        }
    };
    const saveEdit = async () => {
        if (!editing) return;
        if (!editing.form.startsAt) return toast("Pick a date and time.");
        await patch(editing.id, body(editing.form), "Session updated");
        setEditing(null);
    };
    const remove = async (id: string) => {
        if (!(await askConfirm({ title: "Delete this session?", message: "Students will no longer see it.", confirmLabel: "Delete", danger: true }))) return;
        try {
            await api(`/api/admin/classes/${classId}/sessions/${id}`, { method: "DELETE" });
            await onChanged();
        } catch (e) {
            toast(errMsg(e));
        }
    };

    return (
        <>
            {sessions.length ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                    {sessions.map((s) => {
                        if (editing?.id === s.id) {
                            return (
                                <li key={s.id} className="rounded-2xl border-2 border-brand bg-brand-primary/40 p-3">
                                    <SessionFields form={editing.form} setForm={(f) => setEditing({ id: s.id, form: f })} onSubmit={saveEdit} submitLabel="Save" onCancel={() => setEditing(null)} />
                                </li>
                            );
                        }
                        const when = new Date(s.starts_at);
                        const past = when.getTime() < Date.now();
                        // The class timezone, so somebody setting this up from abroad reads the hour their students turn up at.
                        const day = when.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
                        const time = when.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", timeZone: tz });
                        return (
                            <li key={s.id} className={cx("flex flex-col gap-2 rounded-2xl border-2 border-secondary px-3 py-2 sm:flex-row sm:items-center", past && "opacity-70")}>
                                <div className={cx("min-w-0 sm:w-40", s.cancelled && "line-through")}>
                                    <strong className="block text-sm font-bold text-primary">{day}</strong>
                                    <span className="block text-xs text-tertiary">
                                        {time} · {s.duration_minutes} min
                                    </span>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-secondary">
                                    {s.label && <span className="truncate">{s.label}</span>}
                                    {s.join_url && <Pill tone="green">Own link</Pill>}
                                    {s.cancelled && <Pill>Cancelled</Pill>}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <DuoButton
                                        color="secondary"
                                        size="xs"
                                        onPress={() => setEditing({ id: s.id, form: { startsAt: localFor(s.starts_at, tz), durationMinutes: String(s.duration_minutes), label: s.label || "", joinUrl: s.join_url || "" } })}
                                    >
                                        Edit
                                    </DuoButton>
                                    {s.cancelled ? (
                                        <DuoButton color="secondary" size="xs" onPress={() => patch(s.id, { cancelled: false })}>
                                            Restore
                                        </DuoButton>
                                    ) : (
                                        <DuoButton color="secondary" size="xs" onPress={() => patch(s.id, { cancelled: true })}>
                                            Cancel
                                        </DuoButton>
                                    )}
                                    <DuoButton color="danger" size="xs" onPress={() => remove(s.id)}>
                                        Delete
                                    </DuoButton>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <Note className="mt-3">No extra sessions.</Note>
            )}
            <div className="mt-3 rounded-2xl border-2 border-dashed border-secondary p-3">
                <SessionFields form={add} setForm={setAdd} onSubmit={create} submitLabel="Add Session" />
            </div>
        </>
    );
};
