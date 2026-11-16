// Mock orals, as a student sees them (ported from loadMockOral, mockOralView, mockOralTicket and
// bindMockOralStudent, with the booking page's day-and-time picker from public/mock-oral.js folded
// in so there is one way to book and it happens here).
//
// Each mock oral day is its own event, so a student can hold a booking on every one of them: the
// ones they have booked show as tickets, and the days still open show under them, ready to book.
// ?day=YYYY-MM-DD opens the picker on that day, as the old link from a post or the calendar did.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Button as AriaButton } from "react-aria-components";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton, DuoCard } from "@/components/app/duo";
import { ArrowLeft, Calendar, Check, ChevronLeft, ChevronRight, Clock, Headphones01 } from "@/components/app/ic";
import { Empty, Page, PageHeader } from "@/components/app/page-parts";
import { toast } from "@/components/app/toast";
import { type MoBooking, type MoDay, type MockOralView, moClock, moDate, moDateNoYear } from "@/lib/account";
import { api, useApi, useMe } from "@/lib/portal";
import { cx } from "@/utils/cx";
import { SignInCard } from "./password-pages";

/* ---- one booking, as a ticket --------------------------------------------------------------- */

const Ticket = ({ booking, onCancel }: { booking: MoBooking; onCancel: (id: string) => void }) => (
    <DuoCard className="flex flex-col gap-5 p-6">
        <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-primary text-success-primary">
                <Check aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
                <p className="text-lg font-bold text-primary">{booking.label}: you are booked</p>
                <p className="text-sm text-tertiary">
                    {moDate(booking.date)} at {moClock(booking.start)}. The details were emailed to you.
                </p>
            </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
            {[
                ["Date", moDate(booking.date)],
                ["Time", `${moClock(booking.start)} to ${moClock(booking.end)}`],
                ["Examiner", `Examiner ${booking.examiner}${booking.examinerName ? ` (${booking.examinerName})` : ""}`],
            ].map(([dt, dd]) => (
                <div key={dt} className="rounded-2xl bg-secondary px-4 py-3">
                    <dt className="duo-label text-quaternary">{dt}</dt>
                    <dd className="mt-1 text-md font-bold text-primary">{dd}</dd>
                </div>
            ))}
        </dl>
        {booking.link ? (
            <div>
                <a href={booking.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-[50px] items-center justify-center rounded-2xl border-2 border-b-4 border-transparent border-b-brand-700 bg-brand-500 px-4 text-[15px] font-bold tracking-[0.8px] text-white uppercase hover:brightness-105 active:translate-y-0.5 active:border-b-2">
                    Join your mock oral
                </a>
            </div>
        ) : (
            <p className="text-sm text-tertiary">Your link to join will be sent to you before the day, and will show here.</p>
        )}
        {booking.note && <p className="rounded-xl bg-warning-primary px-4 py-3 text-sm font-semibold text-warning-primary">{booking.note}</p>}
        {booking.canCancel && (
            <div className="flex flex-col gap-3 border-t-2 border-secondary pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-tertiary">Cannot make it? Cancel so somebody else can have the place. You can then pick another time.</span>
                <DuoButton color="danger" size="sm" onPress={() => onCancel(booking.id)}>
                    Cancel Booking
                </DuoButton>
            </div>
        )}
    </DuoCard>
);

/* ---- the picker: a day, then a time (the booking page's pickView, for somebody signed in) ---- */

const Picker = ({ days, initial, onBooked, onBack }: { days: MoDay[]; initial: MoDay; onBooked: (v: MockOralView) => void; onBack: () => void }) => {
    const [dayId, setDayId] = useState(initial.id);
    const [slot, setSlot] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const day = days.find((d) => d.id === dayId) || days.find((d) => !d.full) || days[0];
    useEffect(() => {
        // The day asked for may have gone (filled, or cancelled) between loads.
        if (!days.some((d) => d.id === dayId)) setDayId(day.id);
    }, [days, dayId, day.id]);
    const times = day.slots.filter((s) => !s.full && !s.past);
    const chosen = times.find((s) => s.slot === slot) || null;

    // The month grid around the chosen day, stepping only between months that have an open day.
    const months = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 7)))].sort(), [days]);
    const monthKey = day.date.slice(0, 7);
    const at = months.indexOf(monthKey);
    const [year, month] = day.date.split("-").map(Number);
    const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const length = new Date(year, month, 0).getDate();
    const open = new Map(days.map((d) => [d.date, d]));
    const stepTo = (key: string | undefined) => {
        const first = key && days.find((d) => d.date.startsWith(key));
        if (first) {
            setDayId(first.id);
            setSlot(null);
        }
    };

    const book = async () => {
        if (!chosen || busy) return;
        setBusy(true);
        setError("");
        try {
            const done = await api<MockOralView>("/api/mock-oral/book", { method: "POST", json: { dayId: day.id, slot: chosen.slot } });
            toast(`You are booked for ${day.label}. A confirmation is on its way to your email.`);
            onBooked(done);
        } catch (e) {
            // Somebody may have got there first: show the message and let the list refresh behind it.
            setError((e as Error).message);
            setSlot(null);
            try {
                onBooked(await api<MockOralView>("/api/mock-oral"));
            } catch {
                /* the message above has said it */
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <DuoCard className="grid gap-6 p-0 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,260px)]">
            {/* what is being booked, said plainly and first: four near-identical days are easy to mix up */}
            <aside className="flex flex-col gap-4 border-b-2 border-secondary p-6 lg:border-r-2 lg:border-b-0">
                <AriaButton onPress={onBack} className="inline-flex w-fit items-center gap-1 text-sm font-bold text-tertiary outline-focus-ring hover:text-primary focus-visible:outline-2">
                    <ArrowLeft aria-hidden="true" className="size-4" /> Your mock orals
                </AriaButton>
                <div>
                    <p className="duo-label text-quaternary">You are booking</p>
                    <p className="mt-1 text-xl font-bold text-primary">{day.label}</p>
                    <p className="text-sm text-tertiary">{moDate(day.date)}</p>
                    {chosen && (
                        <p className="mt-2 text-md font-bold text-brand-secondary">
                            {moClock(chosen.start)} to {moClock(chosen.end)}
                        </p>
                    )}
                </div>
                <ul className="flex flex-col gap-2 text-sm text-secondary">
                    <li className="flex items-center gap-2">
                        <Clock aria-hidden="true" className="size-4 text-fg-quaternary" /> 20 minutes
                    </li>
                    <li className="flex items-start gap-2">
                        <Headphones01 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-quaternary" /> Online. Your link to join is emailed to you before the day.
                    </li>
                    <li className="flex items-center gap-2">
                        <Calendar aria-hidden="true" className="size-4 text-fg-quaternary" /> All times are Irish time.
                    </li>
                </ul>
            </aside>

            <div className="p-6">
                <h2 className="text-lg font-bold text-primary">{days.length > 1 ? "Pick your mock and a time" : "Pick a time"}</h2>
                {days.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {days.map((d) => (
                            <AriaButton
                                key={d.id}
                                aria-pressed={d.id === day.id}
                                onPress={() => {
                                    setDayId(d.id);
                                    setSlot(null);
                                }}
                                className={cx("flex flex-col items-start rounded-2xl border-2 px-3 py-2 text-left outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2", d.id === day.id ? "border-brand bg-brand-primary" : "border-secondary bg-primary hover:bg-primary_hover")}
                            >
                                <span className="text-sm font-bold text-primary">{d.label}</span>
                                <span className="text-xs text-tertiary">{moDate(d.date, true)}</span>
                                {d.full && <span className="text-xs font-bold text-quaternary">Full</span>}
                            </AriaButton>
                        ))}
                    </div>
                )}
                <div className="mt-5 flex items-center justify-between">
                    <strong className="text-md font-bold text-primary">{new Intl.DateTimeFormat("en-IE", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))}</strong>
                    <span className="flex gap-1">
                        <AriaButton aria-label="Earlier month" isDisabled={!months[at - 1]} onPress={() => stepTo(months[at - 1])} className="rounded-lg p-1 text-fg-quaternary outline-focus-ring hover:bg-secondary focus-visible:outline-2 disabled:opacity-40">
                            <ChevronLeft aria-hidden="true" className="size-5" />
                        </AriaButton>
                        <AriaButton aria-label="Later month" isDisabled={!months[at + 1]} onPress={() => stepTo(months[at + 1])} className="rounded-lg p-1 text-fg-quaternary outline-focus-ring hover:bg-secondary focus-visible:outline-2 disabled:opacity-40">
                            <ChevronRight aria-hidden="true" className="size-5" />
                        </AriaButton>
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-7 gap-1 text-center">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((n) => (
                        <span key={n} className="py-1 text-xs font-bold text-quaternary">
                            {n}
                        </span>
                    ))}
                    {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
                    {Array.from({ length }, (_, i) => i + 1).map((n) => {
                        const found = open.get(`${monthKey}-${String(n).padStart(2, "0")}`);
                        if (!found)
                            return (
                                <span key={n} className="py-2 text-sm text-quaternary/60 tabular-nums">
                                    {n}
                                </span>
                            );
                        const on = found.id === day.id;
                        return (
                            <AriaButton
                                key={n}
                                aria-pressed={on}
                                aria-label={`${moDate(found.date)}${found.full ? ", fully booked" : ""}`}
                                onPress={() => {
                                    setDayId(found.id);
                                    setSlot(null);
                                }}
                                className={cx(
                                    "mx-auto flex size-9 items-center justify-center rounded-full text-sm font-bold tabular-nums outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                                    on ? "bg-brand-solid text-white" : found.full ? "bg-secondary text-quaternary line-through" : "bg-brand-primary text-brand-secondary hover:bg-brand-secondary",
                                )}
                            >
                                {n}
                            </AriaButton>
                        );
                    })}
                </div>
            </div>

            <div className="border-t-2 border-secondary p-6 lg:border-t-0 lg:border-l-2">
                <h3 className="text-md font-bold text-primary">
                    {day.label}
                    <span className="block text-sm font-medium text-tertiary">{moDateNoYear(day.date)}</span>
                </h3>
                {error && (
                    <p role="alert" className="mt-3 rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">
                        {error}
                    </p>
                )}
                <div className="mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                    {!times.length ? (
                        <p className="text-sm text-tertiary">Every time on this day is taken. If somebody cancels, their time will show here.</p>
                    ) : (
                        times.map((s) =>
                            s.slot === slot ? (
                                <div key={s.slot} className="flex gap-2">
                                    <span className="flex flex-1 items-center justify-center rounded-2xl bg-secondary text-sm font-bold text-secondary">{moClock(s.start)}</span>
                                    <DuoButton size="sm" onPress={book} isDisabled={busy} className="flex-1">
                                        {busy ? "Booking…" : `Book ${day.label}`}
                                    </DuoButton>
                                </div>
                            ) : (
                                <AriaButton key={s.slot} onPress={() => setSlot(s.slot)} className="rounded-2xl border-2 border-secondary py-2.5 text-sm font-bold text-brand-secondary outline-focus-ring transition duration-100 ease-linear hover:border-brand hover:bg-brand-primary focus-visible:outline-2">
                                    {moClock(s.start)}
                                </AriaButton>
                            ),
                        )
                    )}
                </div>
            </div>
        </DuoCard>
    );
};

/* ---- the page ------------------------------------------------------------------------------ */

const StudentMockOral = () => {
    const [sp, setSp] = useSearchParams();
    const wantDay = sp.get("day");
    const { data, loading, error, set } = useApi<MockOralView>("/api/mock-oral");
    useEffect(() => {
        if (error) toast(error.message);
    }, [error]);
    const closePicker = () =>
        setSp(
            (p) => {
                p.delete("day");
                return p;
            },
            { replace: true },
        );

    const cancel = async (bookingId: string) => {
        const sure = await askConfirm({
            title: "Cancel this mock oral?",
            message: "Your place goes to somebody else. You can pick another time on that day afterwards if one is free.",
            confirmLabel: "Cancel booking",
            cancelLabel: "Keep it",
            danger: true,
        });
        if (!sure) return;
        try {
            // What is left comes back with it, so the days show as bookable again.
            set(await api<MockOralView>("/api/mock-oral/cancel", { method: "POST", json: { bookingId } }));
            toast("Your booking is cancelled. Your place is open again for somebody else.");
        } catch (e) {
            toast((e as Error).message);
        }
    };

    if (loading && !data) return <p className="text-sm text-quaternary">Loading your mock orals…</p>;
    // The old app showed the empty state when the request failed, with the error in a toast.
    const view = data || { bookings: [], days: [] };
    const bookings = view.bookings || [];
    const days = view.days || [];
    if (!bookings.length && !days.length) return <Empty icon={Calendar} title="No mock orals to book right now" note="When booking opens, the times will show here." />;

    const asked = wantDay ? days.find((d) => d.date === wantDay) : undefined;
    if (asked) {
        return (
            <Picker
                days={days}
                initial={asked}
                onBack={closePicker}
                onBooked={(next) => {
                    set(next);
                    // Booked: the day is no longer open for this student, so the list shows the ticket.
                    if (!next.days.some((d) => d.date === wantDay)) closePicker();
                }}
            />
        );
    }
    return (
        <div className="flex flex-col gap-5">
            {bookings.map((b) => (
                <Ticket key={b.id} booking={b} onCancel={cancel} />
            ))}
            {days.length > 0 && (
                <DuoCard className="flex flex-col gap-4 p-6">
                    <div>
                        <p className="text-lg font-bold text-primary">{bookings.length ? "Days you can still book" : `Book your mock oral${days.length === 1 ? "" : "s"}`}</p>
                        <p className="text-sm text-tertiary">{days.length === 1 ? "Pick the time that suits you." : "Each mock is booked separately. Pick a time for each one."}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                        {days.map((d) =>
                            d.full ? (
                                <div key={d.id} className="flex flex-col gap-2 rounded-2xl bg-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-md text-secondary">
                                        <strong className="font-bold text-primary">{d.label}</strong> {moDate(d.date)}
                                    </span>
                                    <span className="text-sm font-bold text-quaternary">Fully booked</span>
                                </div>
                            ) : (
                                <div key={d.id} className="flex flex-col gap-2 rounded-2xl border-2 border-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-md text-secondary">
                                        <strong className="font-bold text-primary">{d.label}</strong> {moDate(d.date)}
                                    </span>
                                    <DuoButton size="sm" onPress={() => setSp({ day: d.date })}>
                                        Pick a Time
                                    </DuoButton>
                                </div>
                            ),
                        )}
                    </div>
                </DuoCard>
            )}
        </div>
    );
};

export const MockOralPage = () => {
    const me = useMe();
    if (me === undefined)
        return (
            <Page>
                <p className="text-sm text-quaternary">Loading…</p>
            </Page>
        );
    if (!me) return <SignInCard next="/mock-oral" title="Sign in to book your mock oral" note="Mock oral booking is for students of Gaeilgeoir Guides. Sign in first." />;
    return (
        <Page>
            <PageHeader kicker="Mock oral" title="Your mock orals" sub="Twenty minutes online with an examiner. Book a time, and your link to join is emailed to you before the day." />
            {me.role === "student" ? (
                <StudentMockOral />
            ) : (
                <Empty icon={Calendar} title="Mock oral days are set up in the teacher console" note="Students book here; the days, examiners and the grid of who is where live in the console.">
                    <DuoButton size="sm" href="/teach/mock-orals">
                        Open Mock Orals
                    </DuoButton>
                </Empty>
            )}
        </Page>
    );
};
