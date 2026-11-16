// One mock oral day: the header actions (edit, download, email details, open / close booking), the
// banners, the booking link, the four stats, and the examiner grid where a name opens the booking,
// Free books a student in, and an examiner heading sets their name and link. Ported from app.js
// (mockOralDayView, moChangeExaminers, moOpenBooking, moOpenFree, moOpenExaminer, bindMockOrals).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { askConfirm } from "@/components/app/confirm";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { ChevronLeft } from "@/components/app/ic";
import { toast } from "@/components/app/toast";
import { type MoBooking, type MoDayDetail, type MoOverview, moClock, moDate, moPlural, moWhen } from "@/lib/mock-oral";
import { api } from "@/lib/portal";
import { cx } from "@/utils/cx";
import { MockOralDayForm } from "./mock-orals-section";

const inputCls = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden focus:border-brand";

const Stat = ({ label, value, note, tone, children }: { label: string; value?: React.ReactNode; note?: React.ReactNode; tone?: "accent" | "warning"; children?: React.ReactNode }) => (
    <div className={cx("rounded-2xl border-2 p-4", tone === "accent" ? "border-brand bg-brand-primary" : tone === "warning" ? "border-warning-solid/40 bg-warning-primary" : "border-secondary bg-primary")}>
        <p className="duo-label text-quaternary">{label}</p>
        {children ?? <p className="mt-1 text-display-xs font-bold text-primary tabular-nums">{value}</p>}
        {note && <p className="mt-1 text-xs text-tertiary">{note}</p>}
    </div>
);

/* The first column stays put while the examiner columns scroll sideways on a phone. */
const TIME_COL = "sticky left-0 z-10 border-r border-secondary bg-primary";

export const MockOralDay = ({ dayId, overview, reloadOverview }: { dayId: string; overview: MoOverview; reloadOverview: () => Promise<void> }) => {
    const nav = useNavigate();
    const [detail, setDetail] = useState<MoDayDetail | null>(null);
    const [gone, setGone] = useState(false);
    const [editing, setEditing] = useState(false);
    const [booking, setBooking] = useState<MoBooking | null>(null);
    const [free, setFree] = useState<{ slot: number; examiner: number } | null>(null);
    const [examinerN, setExaminerN] = useState<number | null>(null);

    const load = () =>
        api<MoDayDetail>(`/api/mock-oral/admin/days/${dayId}`)
            .then(setDetail)
            // A day deleted in another tab leaves the list rather than an error.
            .catch(() => setGone(true));
    useEffect(() => {
        load();
    }, [dayId]);
    useEffect(() => {
        if (gone) nav("/teach/mock-orals", { replace: true });
    }, [gone]);
    const refresh = async () => {
        await Promise.all([load(), reloadOverview()]);
    };

    if (!detail) return <p className="text-sm text-quaternary">Loading…</p>;
    const { day, timetable, examiners, bookings, students } = detail;
    const at = new Map(bookings.map((b) => [`${b.slot}:${b.examiner}`, b]));
    const closed = !day.bookingOpen && !day.past;
    const link = `${location.origin}/mock-oral`;

    const changeExaminers = async (step: number) => {
        const next = day.examiners + step;
        if (next < 1 || next > overview.maxExaminers) return;
        if (step < 0) {
            // Asking "move them?" and then refusing is two steps to a no.
            if (next < (day.examinersNeeded ?? 0)) {
                toast(`You need at least ${moPlural(day.examinersNeeded!, "examiner")}: ${day.examinersNeeded} students are booked at the same time. Remove a booking first.`);
                return;
            }
            const moving = bookings.filter((b) => b.examiner > next);
            if (moving.length) {
                const sure = await askConfirm({
                    title: `Remove Examiner ${day.examiners}?`,
                    message: `${moPlural(moving.length, "student")} ${moving.length === 1 ? "is" : "are"} booked with Examiner ${day.examiners}. ${moving.length === 1 ? "They keep" : "They each keep"} the same time, move to another examiner, and are emailed.`,
                    confirmLabel: "Remove and move them",
                });
                if (!sure) return;
            }
        }
        try {
            const result = await api<{ changed: number }>(`/api/mock-oral/admin/days/${day.id}`, { method: "PATCH", json: { examiners: next } });
            if (result.changed) toast(`${moPlural(result.changed, "student")} moved to another examiner and emailed.`);
            await refresh();
        } catch (e) {
            toast((e as Error).message);
        }
    };

    const toggleBooking = async () => {
        const opening = !day.bookingOpen;
        const sure = await askConfirm(
            opening
                ? { title: "Open booking?", message: `Students will see ${moDate(day.date)} in the portal and can book one of ${day.capacity} places straight away.`, confirmLabel: "Open booking" }
                : { title: "Close booking?", message: "Nobody new can book. Students who are already booked keep their time and can still cancel.", confirmLabel: "Close booking" },
        );
        if (!sure) return;
        try {
            await api(`/api/mock-oral/admin/days/${day.id}`, { method: "PATCH", json: { bookingOpen: opening } });
            toast(opening ? "Booking is open." : "Booking is closed.");
            await refresh();
        } catch (e) {
            toast((e as Error).message);
        }
    };

    const emailDetails = async () => {
        const upcoming = bookings.filter((b) => new Date(b.startsAt).getTime() > Date.now());
        if (!upcoming.length) return toast("Nobody is booked for an oral still to come.");
        const used = new Set(upcoming.map((b) => b.examiner));
        const noLink = examiners.filter((x) => used.has(x.number) && !x.link).length;
        const sure = await askConfirm({
            title: "Email students their details?",
            message: `${moPlural(upcoming.length, "student")} will each get their date, time, examiner and link.${noLink ? ` ${moPlural(noLink, "examiner")} with bookings ${noLink === 1 ? "has" : "have"} no link yet, so those students get the details without one.` : ""}`,
            confirmLabel: `Email ${moPlural(upcoming.length, "student")}`,
        });
        if (!sure) return;
        try {
            const result = await api<{ emailed: number; students: number }>(`/api/mock-oral/admin/days/${day.id}/email-details`, { method: "POST" });
            toast(`Emailed ${result.emailed} of ${moPlural(result.students, "student")}.`);
        } catch (e) {
            toast((e as Error).message);
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(link);
            toast("Link copied");
        } catch {
            (document.getElementById("mo-link-input") as HTMLInputElement | null)?.select();
            toast("Press Cmd+C to copy");
        }
    };

    return (
        <>
            <Link to="/teach/mock-orals" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-brand-secondary hover:underline">
                <ChevronLeft aria-hidden="true" className="size-4" /> All mock oral days
            </Link>
            <SectionHead
                kicker="Mock orals"
                title={`${day.label}: ${moDate(day.date)}`}
                sub={day.past ? "This day is over." : day.bookingOpen ? "Booking is open. Students can pick a time now." : day.booked ? "Booking is closed. Nobody new can book." : "Booking is closed. Students cannot see this day yet."}
                actions={
                    <>
                        <DuoButton color="secondary" size="sm" onPress={() => setEditing(true)}>
                            Edit day
                        </DuoButton>
                        <a href={`/api/mock-oral/admin/days/${day.id}/export.csv`} download className="inline-flex h-10.5 items-center rounded-2xl border-2 border-b-4 border-secondary bg-primary px-3.5 text-[13px] font-bold tracking-[0.8px] text-brand-secondary uppercase hover:bg-primary_hover">
                            Download list
                        </a>
                        <DuoButton color="secondary" size="sm" onPress={emailDetails} isDisabled={!day.booked}>
                            Email students their details
                        </DuoButton>
                        {!day.past && (
                            <DuoButton color={day.bookingOpen ? "secondary" : "primary"} size="sm" onPress={toggleBooking}>
                                {day.bookingOpen ? "Close booking" : "Open booking"}
                            </DuoButton>
                        )}
                    </>
                }
            />

            {closed && (
                <div className="mb-5 rounded-2xl border-2 border-warning-solid/40 bg-warning-primary px-5 py-4 text-sm text-secondary">
                    {day.booked ? (
                        <>
                            <strong className="block text-primary">Booking is closed.</strong>
                            The {moPlural(day.booked, "student")} already booked {day.booked === 1 ? "keeps their time" : "keep their times"} and can still cancel. Open booking to let more students in.
                        </>
                    ) : (
                        <>
                            <strong className="block text-primary">Students cannot see this day yet.</strong>
                            Check the examiners below, then open booking.
                        </>
                    )}
                </div>
            )}

            {!day.past && (
                <div className="mb-5 flex flex-col gap-3 rounded-2xl border-2 border-secondary bg-primary p-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                        <strong className="block text-sm font-bold text-primary">Booking link for students</strong>
                        <span className="text-sm text-tertiary">{day.bookingOpen ? "Send this or put it in a post. They pick a time and type their name and email. No sign-in." : "This is the link to send. It shows this day once you open booking."}</span>
                    </div>
                    <input id="mo-link-input" readOnly value={link} aria-label="Booking link" className="w-full rounded-xl border-2 border-secondary bg-secondary px-3 py-2 text-sm font-medium text-secondary md:w-72" />
                    <DuoButton color="secondary" size="sm" onPress={copyLink}>
                        Copy link
                    </DuoButton>
                </div>
            )}

            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Examiners" tone="accent" note={`${overview.slotsPerExaminer} orals each${day.examinersNeeded ? ` · bookings so far need ${day.examinersNeeded}` : ""}`}>
                    <div className="mt-1 flex items-center gap-2">
                        <DuoButton color="secondary" size="xs" ariaLabel="One fewer examiner" isDisabled={day.examiners <= 1} onPress={() => changeExaminers(-1)}>
                            −
                        </DuoButton>
                        <span className="min-w-8 text-center text-display-xs font-bold text-primary tabular-nums">{day.examiners}</span>
                        <DuoButton color="secondary" size="xs" ariaLabel="One more examiner" isDisabled={day.examiners >= overview.maxExaminers} onPress={() => changeExaminers(1)}>
                            +
                        </DuoButton>
                    </div>
                </Stat>
                <Stat label="Students you can cater for" value={day.capacity} note={day.students ? `${moPlural(day.students, "student")} can book` : "places in the day"} />
                <Stat label="Booked" value={day.booked} note={`${day.free} places still free`} />
                <Stat label="Slots booked" value={`${day.percent}%`} tone={day.percent >= 90 ? "warning" : undefined}>
                    <p className="mt-1 text-display-xs font-bold text-primary tabular-nums">{day.percent}%</p>
                    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                        <i className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, day.percent)}%` }} />
                    </div>
                </Stat>
            </div>

            <section className="rounded-2xl border-2 border-secondary bg-primary">
                <div className="border-b-2 border-secondary px-5 py-4">
                    <h2 className="text-lg font-bold text-primary">Who is with which examiner</h2>
                    <p className="text-sm text-tertiary">Click a name to see or remove a booking. Click Free to book a student in yourself. Click an examiner to add their name and link.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-secondary bg-primary">
                                {/* The time stays put while the examiners scroll sideways on a phone. */}
                                <th scope="col" className={cx(TIME_COL, "px-3 py-2 text-left duo-label text-quaternary")}>
                                    Time
                                </th>
                                {examiners.map((x) => (
                                    <th key={x.number} scope="col" className="px-2 py-2 text-left">
                                        <button type="button" onClick={() => setExaminerN(x.number)} className="rounded-xl px-2 py-1 text-left outline-focus-ring hover:bg-secondary focus-visible:outline-2">
                                            <strong className="block text-sm font-bold text-primary">Examiner {x.number}</strong>
                                            <small className="block text-xs font-medium text-tertiary">
                                                {x.name || "Add name"} · {x.link ? "link added" : "no link yet"}
                                            </small>
                                            <small className="block text-xs text-quaternary">
                                                {x.booked} of {overview.slotsPerExaminer} booked
                                            </small>
                                        </button>
                                    </th>
                                ))}
                                <th scope="col" className="px-3 py-2 text-right duo-label text-quaternary">
                                    Left
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {timetable.map((row, i) => {
                                if (row.kind === "break")
                                    return (
                                        <tr key={`b${i}`} className="border-b border-secondary bg-secondary_subtle">
                                            <th scope="row" className={cx(TIME_COL, "px-3 py-2 text-left font-bold text-tertiary tabular-nums")}>
                                                {moClock(row.start)}
                                            </th>
                                            <td colSpan={examiners.length + 1} className="px-3 py-2 text-tertiary">
                                                {row.label} until {moClock(row.end)}. Nobody can book this.
                                            </td>
                                        </tr>
                                    );
                                let freeN = 0;
                                const cells = examiners.map((x) => {
                                    const b = at.get(`${row.slot}:${x.number}`);
                                    if (b)
                                        return (
                                            <td key={x.number} className="px-2 py-1.5">
                                                <button type="button" onClick={() => setBooking(b)} title={b.student.email} aria-label={`${b.student.name}, ${moClock(row.start)} with Examiner ${x.number}`} className="w-full truncate rounded-xl bg-brand-primary px-2.5 py-1.5 text-left text-sm font-bold text-brand-secondary outline-focus-ring hover:brightness-95 focus-visible:outline-2">
                                                    {b.student.name}
                                                </button>
                                            </td>
                                        );
                                    freeN += 1;
                                    return (
                                        <td key={x.number} className="px-2 py-1.5">
                                            <button type="button" onClick={() => setFree({ slot: row.slot, examiner: x.number })} aria-label={`Book a student in at ${moClock(row.start)} with Examiner ${x.number}`} className="w-full rounded-xl border-2 border-dashed border-secondary px-2.5 py-1.5 text-left text-sm font-semibold text-quaternary outline-focus-ring hover:border-primary hover:text-secondary focus-visible:outline-2">
                                                Free
                                            </button>
                                        </td>
                                    );
                                });
                                return (
                                    <tr key={row.slot} className="border-b border-secondary bg-primary">
                                        <th scope="row" className={cx(TIME_COL, "px-3 py-2 text-left font-bold text-secondary tabular-nums")}>
                                            {moClock(row.start)}
                                        </th>
                                        {cells}
                                        <td className={cx("px-3 py-2 text-right text-xs font-bold", freeN ? "text-tertiary" : "text-error-primary")}>{freeN ? `${freeN} free` : "Full"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <MockOralDayForm
                open={editing}
                onClose={() => setEditing(false)}
                data={overview}
                day={day}
                onSaved={(r) => {
                    if (r === "deleted") {
                        reloadOverview();
                        nav("/teach/mock-orals");
                    } else refresh();
                }}
            />
            {booking && <BookingDialog detail={detail} booking={booking} onClose={() => setBooking(null)} onChanged={refresh} />}
            {free && <FreeDialog detail={detail} slot={free.slot} examiner={free.examiner} students={students} onClose={() => setFree(null)} onChanged={refresh} />}
            {examinerN !== null && <ExaminerDialog detail={detail} number={examinerN} onClose={() => setExaminerN(null)} onChanged={refresh} />}
        </>
    );
};

/** A booking: who, when, with whom, and Remove. */
const BookingDialog = ({ detail, booking, onClose, onChanged }: { detail: MoDayDetail; booking: MoBooking; onClose: () => void; onChanged: () => Promise<void> }) => {
    const { day, timetable, examiners } = detail;
    const slot = timetable.find((r) => r.kind === "oral" && r.slot === booking.slot);
    const examiner = examiners.find((x) => x.number === booking.examiner);
    const remove = async () => {
        const first = booking.student.name.trim().split(" ")[0];
        const upcoming = new Date(booking.startsAt).getTime() > Date.now();
        const sure = await askConfirm({
            title: `Remove ${first}'s booking?`,
            message: upcoming ? `The place is freed up, and ${first} is emailed that it is cancelled and can book another time.` : "This oral is already over, so nobody is emailed.",
            confirmLabel: "Remove booking",
            danger: true,
        });
        if (!sure) return;
        try {
            await api(`/api/mock-oral/admin/bookings/${booking.id}`, { method: "DELETE" });
            onClose();
            toast(upcoming ? `Removed. ${first} has been emailed.` : "Removed.");
            await onChanged();
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title={booking.student.name} sub={booking.student.email}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="duo-label text-quaternary">Date</dt>
                <dd className="font-semibold text-primary">{moDate(day.date)}</dd>
                <dt className="duo-label text-quaternary">Time</dt>
                <dd className="font-semibold text-primary">{slot ? `${moClock(slot.start)} to ${moClock(slot.end)}` : ""}</dd>
                <dt className="duo-label text-quaternary">Examiner</dt>
                <dd className="font-semibold text-primary">
                    Examiner {booking.examiner}
                    {examiner?.name ? ` (${examiner.name})` : ""}
                </dd>
            </dl>
            <p className="mt-4 text-xs text-tertiary">
                Booked {moWhen(booking.bookedAt)}
                {booking.guest ? ". This email is not a portal account." : ""}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <DuoButton color="danger" size="sm" onPress={remove}>
                    Remove booking
                </DuoButton>
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Close
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/** Book a student into a free cell: search, then pick. */
const FreeDialog = ({ detail, slot, examiner, students, onClose, onChanged }: { detail: MoDayDetail; slot: number; examiner: number; students: MoDayDetail["students"]; onClose: () => void; onChanged: () => Promise<void> }) => {
    const { day, timetable } = detail;
    const row = timetable.find((r) => r.kind === "oral" && r.slot === slot);
    const [term, setTerm] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    const t = term.trim().toLowerCase();
    const rows = students.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(t));
    const pick = async (s: MoDayDetail["students"][number]) => {
        setBusy(s.id);
        try {
            const result = await api<{ emailed: boolean }>(`/api/mock-oral/admin/days/${day.id}/bookings`, { method: "POST", json: { studentId: s.id, slot, examiner } });
            onClose();
            toast(result.emailed ? `Booked. A confirmation has gone to ${s.email}.` : "Booked. The confirmation email could not be sent.");
            await onChanged();
        } catch (e) {
            setBusy(null);
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title="Book a student in" sub={`${moDate(day.date, true)}, ${row ? moClock(row.start) : ""} with Examiner ${examiner}`}>
            <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name or email" autoComplete="off" autoFocus aria-label="Search by name or email" className={inputCls} />
            <div className="mt-3 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
                {rows.length ? (
                    rows.map((s) => (
                        <button key={s.id} type="button" disabled={busy === s.id} onClick={() => pick(s)} className="rounded-xl border-2 border-secondary px-3 py-2 text-left outline-focus-ring hover:border-primary hover:bg-primary_hover focus-visible:outline-2 disabled:opacity-50">
                            <strong className="block text-sm font-bold text-primary">{s.name}</strong>
                            <small className="block truncate text-xs text-tertiary">{s.email}</small>
                        </button>
                    ))
                ) : (
                    <p className="py-4 text-center text-sm text-tertiary">Nobody matches. Every student who can book and is not listed already has a time.</p>
                )}
            </div>
            <div className="mt-5 flex justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/** An examiner's name and link. */
const ExaminerDialog = ({ detail, number, onClose, onChanged }: { detail: MoDayDetail; number: number; onClose: () => void; onChanged: () => Promise<void> }) => {
    const x = detail.examiners.find((e) => e.number === number);
    const [name, setName] = useState(x?.name ?? "");
    const [link, setLink] = useState(x?.link ?? "");
    const save = async () => {
        try {
            await api(`/api/mock-oral/admin/days/${detail.day.id}/examiners/${number}`, { method: "PUT", json: { name, link } });
            onClose();
            toast(`Examiner ${number} saved.`);
            await onChanged();
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title={`Examiner ${number}`} sub="The name and link go on each student's booking and in their emails.">
            <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    save();
                }}
            >
                <div>
                    <FieldLabel>
                        Name <span className="font-semibold normal-case tracking-normal text-quaternary">(optional)</span>
                    </FieldLabel>
                    <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Siobhán" aria-label="Examiner name" className={inputCls} />
                </div>
                <div>
                    <FieldLabel>
                        Link for their students to join <span className="font-semibold normal-case tracking-normal text-quaternary">(optional)</span>
                    </FieldLabel>
                    <input type="url" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" aria-label="Link for their students to join" className={inputCls} />
                </div>
                <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <DuoButton color="secondary" size="sm" onPress={onClose}>
                        Cancel
                    </DuoButton>
                    <DuoButton size="sm" type="submit">
                        Save
                    </DuoButton>
                </div>
            </form>
        </DuoDialog>
    );
};
