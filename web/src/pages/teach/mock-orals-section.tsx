// Mock orals, teacher side: the list of days with meters and status pills, the add / edit / delete day
// form, and one day opened at /teach/mock-orals/:id (mock-oral-day.tsx). Ported 1:1 from app.js
// (mockOralsView, moSumHtml, openMockOralDayForm, bindMockOrals).
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { askConfirm } from "@/components/app/confirm";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { toast } from "@/components/app/toast";
import { type MoDay, type MoDayDetail, type MoOverview, moDate, moPlural } from "@/lib/mock-oral";
import { api, useApi } from "@/lib/portal";
import { cx } from "@/utils/cx";
import { MockOralDay } from "./mock-oral-day";

/** The horizontal "58% booked · 59 of 102 places" meter. */
export const MoMeter = ({ day, bare }: { day: MoDay; bare?: boolean }) => (
    <div className="min-w-0">
        <div role="img" aria-label={`${day.percent}% of places booked`} className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <i className={cx("block h-full rounded-full", day.percent >= 90 ? "bg-warning-solid" : "bg-brand-500")} style={{ width: `${Math.min(100, day.percent)}%` }} />
        </div>
        {!bare && (
            <p className="mt-1 text-xs text-tertiary">
                <strong className="text-primary">{day.percent}%</strong> booked · {day.booked} of {day.capacity} places
            </p>
        )}
    </div>
);

export const MoStatusPill = ({ day }: { day: MoDay }) => {
    if (day.past) return <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-tertiary">Finished</span>;
    return day.bookingOpen ? (
        <span className="shrink-0 rounded-full bg-success-primary px-2.5 py-1 text-[11px] font-bold text-success-primary">Booking open</span>
    ) : (
        <span className="shrink-0 rounded-full bg-warning-primary px-2.5 py-1 text-[11px] font-bold text-warning-primary">{day.booked ? "Booking closed" : "Not open yet"}</span>
    );
};

/* The one sum the whole setup turns on, worked out as the teacher types. */
const MoSum = ({ examiners, students, per }: { examiners: number; students: number; per: number }) => {
    if (!examiners) return <p className="text-sm text-tertiary">Enter how many examiners are working.</p>;
    const places = examiners * per;
    const need = Math.ceil(students / per);
    return (
        <div className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary">
            <p className="text-lg font-bold text-primary">
                {places} <span className="text-sm font-semibold text-tertiary">places</span>
            </p>
            <p>
                {moPlural(examiners, "examiner")} × {per} orals each
            </p>
            {students > 0 &&
                (places >= students ? (
                    <p className="mt-1 font-semibold text-success-primary">
                        Enough for all {moPlural(students, "student")} who can book, with {places - students} to spare.
                    </p>
                ) : (
                    <p className="mt-1 font-semibold text-error-primary">
                        Not enough for all {moPlural(students, "student")} who can book. You would need {moPlural(need, "examiner")}.
                    </p>
                ))}
        </div>
    );
};

const inputCls = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden focus:border-brand";

/** Add or edit a mock oral day. Saved = the new day's id (on create) or the edited day's; "deleted" after a delete. */
export const MockOralDayForm = ({ open, onClose, data, day, onSaved }: { open: boolean; onClose: () => void; data: MoOverview; day?: MoDay | null; onSaved: (result: "deleted" | string) => void }) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
    const [date, setDate] = useState("");
    const [examiners, setExaminers] = useState("");
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        setDate(day?.date || "");
        setExaminers(day?.examiners ? String(day.examiners) : "");
        setChosen(new Set(day?.classIds || data.classes.map((k) => k.id)));
        setNote(day?.note || "");
        setBusy(false);
    }, [open, day, data.classes]);

    const count = Math.max(0, Math.min(data.maxExaminers, Math.floor(Number(examiners) || 0)));
    const students = data.classes.filter((k) => chosen.has(k.id)).reduce((sum, k) => sum + k.students, 0);
    const step = (n: number) => setExaminers(String(Math.max(1, Math.min(data.maxExaminers, (Math.floor(Number(examiners)) || 0) + n))));

    const save = async () => {
        const n = Math.floor(Number(examiners));
        const picked = data.classes.filter((k) => chosen.has(k.id)).map((k) => k.id);
        if (!date) return toast("Pick the date of the mock orals.");
        if (!(n >= 1 && n <= data.maxExaminers)) return toast(`Enter a number of examiners from 1 to ${data.maxExaminers}.`);
        if (data.classes.length && !picked.length) return toast("Tick at least one class that can book.");
        const body = {
            date,
            examiners: n,
            // Every class ticked is "everyone", so a class added later is included too.
            classIds: !data.classes.length || picked.length === data.classes.length ? null : picked,
            note,
        };
        if (day && date !== day.date && day.booked) {
            const sure = await askConfirm({
                title: "Move the date?",
                message: `${moPlural(day.booked, "student")} ${day.booked === 1 ? "is" : "are"} already booked. Each keeps the same time and examiner, and is emailed the new date.`,
                confirmLabel: "Move and email them",
            });
            if (!sure) return;
        }
        setBusy(true);
        try {
            if (day) {
                const result = await api<{ changed: number }>(`/api/mock-oral/admin/days/${day.id}`, { method: "PATCH", json: body });
                toast(result.changed ? `Saved. ${moPlural(result.changed, "student")} emailed about the change.` : "Saved.");
                onClose();
                onSaved(day.id);
            } else {
                const created = await api<MoDayDetail>("/api/mock-oral/admin/days", { method: "POST", json: body });
                toast("Day added. Open booking when you are ready.");
                onClose();
                onSaved(created.day.id);
            }
        } catch (e) {
            setBusy(false);
            toast((e as Error).message);
        }
    };

    const remove = async () => {
        if (!day) return;
        const sure = await askConfirm({
            title: "Delete this day?",
            message: day.booked ? `${moPlural(day.booked, "booking")} will be cancelled, and each student is emailed that the day is not going ahead. This cannot be undone.` : "Nobody has booked yet. This cannot be undone.",
            confirmLabel: "Delete day",
            danger: true,
        });
        if (!sure) return;
        try {
            await api(`/api/mock-oral/admin/days/${day.id}`, { method: "DELETE" });
            onClose();
            toast("Day deleted.");
            onSaved("deleted");
        } catch (e) {
            toast((e as Error).message);
        }
    };

    return (
        <DuoDialog open={open} onClose={onClose} title={day ? "Edit mock oral day" : "Add a mock oral day"} sub={day ? moDate(day.date) : "Students cannot book until you open it."} className="max-w-lg">
            <form
                className="flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault();
                    save();
                }}
            >
                <div>
                    <FieldLabel>Date of the mock orals</FieldLabel>
                    <input type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date of the mock orals" className={inputCls} />
                </div>
                <div>
                    <FieldLabel>Number of examiners</FieldLabel>
                    <div className="flex items-center gap-2">
                        <DuoButton color="secondary" size="sm" ariaLabel="One fewer examiner" onPress={() => step(-1)}>
                            −
                        </DuoButton>
                        <input type="number" inputMode="numeric" min={1} max={data.maxExaminers} required value={examiners} onChange={(e) => setExaminers(e.target.value)} placeholder="0" aria-label="Number of examiners" className={cx(inputCls, "text-center")} />
                        <DuoButton color="secondary" size="sm" ariaLabel="One more examiner" onPress={() => step(1)}>
                            +
                        </DuoButton>
                    </div>
                    <div className="mt-3" aria-live="polite">
                        <MoSum examiners={count} students={students} per={data.slotsPerExaminer} />
                    </div>
                </div>
                {data.classes.length > 0 && (
                    <div>
                        <FieldLabel>Who can book</FieldLabel>
                        <div className="flex flex-col gap-2">
                            {data.classes.map((k) => (
                                <label key={k.id} className="flex items-center gap-3 rounded-xl border-2 border-secondary px-3 py-2 text-sm font-semibold text-secondary">
                                    <input
                                        type="checkbox"
                                        checked={chosen.has(k.id)}
                                        onChange={(e) => {
                                            const next = new Set(chosen);
                                            if (e.target.checked) next.add(k.id);
                                            else next.delete(k.id);
                                            setChosen(next);
                                        }}
                                        className="size-4 accent-brand-600"
                                    />
                                    <span className="min-w-0 flex-1 truncate">{k.label}</span>
                                    <small className="shrink-0 text-xs text-quaternary">{moPlural(k.students, "student")}</small>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                <div>
                    <FieldLabel>
                        Note for students <span className="font-semibold normal-case tracking-normal text-quaternary">(optional)</span>
                    </FieldLabel>
                    <textarea rows={2} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should know or have ready on the day." aria-label="Note for students" className={cx(inputCls, "resize-y")} />
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                    {day && (
                        <DuoButton color="danger" size="sm" onPress={remove}>
                            Delete day
                        </DuoButton>
                    )}
                    <span className="flex-1" />
                    <DuoButton color="secondary" size="sm" onPress={onClose}>
                        Cancel
                    </DuoButton>
                    <DuoButton size="sm" type="submit" isDisabled={busy}>
                        {day ? "Save changes" : "Add day"}
                    </DuoButton>
                </div>
            </form>
        </DuoDialog>
    );
};

const DayRow = ({ day, onOpen }: { day: MoDay; onOpen: () => void }) => (
    <button type="button" onClick={onOpen} aria-label={`${day.label}, ${moDate(day.date)}: ${moPlural(day.examiners, "examiner")}, ${day.percent}% of places booked`} className="grid w-full gap-3 rounded-2xl border-2 border-secondary bg-primary px-4 py-3.5 text-left outline-focus-ring transition duration-100 ease-linear hover:border-primary hover:shadow-sm focus-visible:outline-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center">
        <span className="min-w-0">
            <strong className="block truncate text-md font-bold text-primary">
                {day.label} · {moDate(day.date)}
            </strong>
            <small className="text-xs text-tertiary">
                {moPlural(day.examiners, "examiner")} · {day.capacity} places
            </small>
        </span>
        <MoMeter day={day} />
        <MoStatusPill day={day} />
    </button>
);

export const MockOralsSection = () => {
    const { id } = useParams();
    const nav = useNavigate();
    const { data, error, reload } = useApi<MoOverview>("/api/mock-oral/admin");
    const [form, setForm] = useState<{ open: boolean; day: MoDay | null }>({ open: false, day: null });
    useEffect(() => {
        if (error) toast(error.message);
    }, [error]);

    if (id && data) return <MockOralDay dayId={id} overview={data} reloadOverview={reload} />;
    if (!data) return <p className="text-sm text-quaternary">{error ? error.message : "Loading…"}</p>;

    const upcoming = data.days.filter((d) => !d.past);
    const past = data.days.filter((d) => d.past).reverse();
    const add = (
        <DuoButton size="sm" onPress={() => setForm({ open: true, day: null })}>
            Add a mock oral day
        </DuoButton>
    );
    return (
        <>
            <SectionHead kicker="Manage" title="Mock orals" sub="Set the date and the number of examiners. Students pick a time, and each booking is given an examiner." actions={add} />
            {upcoming.length ? (
                <div className="flex flex-col gap-3">
                    {upcoming.map((d) => (
                        <DayRow key={d.id} day={d} onOpen={() => nav(`/teach/mock-orals/${d.id}`)} />
                    ))}
                </div>
            ) : (
                <div className="rounded-2xl border-2 border-dashed border-secondary p-8 text-center">
                    <h3 className="text-lg font-bold text-primary">No mock oral day set up yet</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-tertiary">Add the date and how many examiners are working. You will see how many students you can cater for before anyone can book.</p>
                    <div className="mt-5 flex justify-center">{add}</div>
                </div>
            )}
            {past.length > 0 && (
                <>
                    <h2 className="mt-8 mb-3 duo-label text-quaternary">Finished</h2>
                    <div className="flex flex-col gap-3">
                        {past.map((d) => (
                            <DayRow key={d.id} day={d} onOpen={() => nav(`/teach/mock-orals/${d.id}`)} />
                        ))}
                    </div>
                </>
            )}
            <MockOralDayForm
                open={form.open}
                onClose={() => setForm((f) => ({ ...f, open: false }))}
                data={data}
                day={form.day}
                onSaved={(r) => {
                    reload();
                    if (r !== "deleted") nav(`/teach/mock-orals/${r}`);
                }}
            />
        </>
    );
};
