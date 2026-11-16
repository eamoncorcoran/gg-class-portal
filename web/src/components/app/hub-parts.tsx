// Pieces the hub pages share: a person's avatar, the next-class banner, the month calendar and the
// class card, all drawn on the same Duolingo tokens as the rest of the app.
import { type ReactNode, useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "@/components/app/ic";
import { Link } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoLive } from "@/components/app/duo-icons";
import { type Hub, type Who, CLASS_MINUTES, dateKey, dayKey, fmtDay, fmtShort, fmtTime, initials, instantOf, nextClass, wall } from "@/lib/hub";
import { cx } from "@/utils/cx";

/** Ticks once a minute so countdowns and "happening now" stay right. */
export const useNow = () => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);
    return now;
};

const TONES = ["bg-brand-500", "bg-blue-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
/** A round avatar: the photo when there is one, otherwise initials on a colour picked from the name. */
export const Avatar = ({ who, size = "md", className }: { who: Who; size?: "xs" | "sm" | "md" | "lg"; className?: string }) => {
    const [broken, setBroken] = useState(false);
    const px = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
    const name = who.name || "?";
    const tone = TONES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TONES.length];
    return who.avatar && !broken ? (
        <img src={who.avatar} alt="" onError={() => setBroken(true)} className={cx("shrink-0 rounded-full object-cover ring-2 ring-primary", px, className)} />
    ) : (
        <span aria-hidden="true" className={cx("flex shrink-0 items-center justify-center rounded-full font-bold text-white", tone, px, className)}>
            {initials(name)}
        </span>
    );
};

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "Sundays at 6:24pm" from the class row. */
export const classWhen = (h: Hub) => {
    const [hh, mm] = h.klass.startTime.split(":").map(Number);
    const today = wall(new Date());
    return `${DAYS[h.klass.dayOfWeek % 7]}s at ${fmtTime(instantOf(today.getFullYear(), today.getMonth() + 1, today.getDate(), hh, mm))}`;
};

/** The banner over Home and Live: the class running now, or the next one and how far away it is. */
export const NextClassBanner = ({ hub, now, compact }: { hub: Hub; now: Date; compact?: boolean }) => {
    const nx = nextClass(hub, now);
    if (!nx) return null;
    const mins = nx.minutesAway;
    const when = nx.live ? "Happening now" : mins < 60 ? `Starts in ${mins} minute${mins === 1 ? "" : "s"}` : mins < 24 * 60 ? `Starts in ${Math.round(mins / 60)} hours` : `Next class ${fmtDay(nx.date)}`;
    return (
        <section aria-label="Next class" className={cx("flex flex-col gap-4 rounded-2xl border-2 p-5 md:flex-row md:items-center md:gap-6", nx.live ? "border-brand bg-brand-primary" : "border-secondary bg-primary")}>
            <span className={cx("flex size-14 shrink-0 items-center justify-center rounded-2xl border-2", nx.live ? "border-brand bg-primary" : "border-secondary bg-primary")}>
                <DuoLive aria-hidden="true" className="size-9" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 duo-label text-brand-secondary">
                    {nx.live && <span className="size-2 animate-pulse rounded-full bg-error-solid" aria-hidden="true" />}
                    {nx.live ? "Live now" : nx.soon ? "Today" : "Coming up"}
                    {nx.kind === "extra" && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-quaternary">Extra class</span>}
                </p>
                <p className="mt-1 text-lg font-bold text-primary md:text-xl">{when}</p>
                <p className="mt-0.5 text-sm text-tertiary">
                    {fmtShort(nx.date)} · {fmtTime(nx.date)} Irish time · {CLASS_MINUTES / 60} hours{nx.week ? ` · Week ${nx.week}` : ""}
                    {hub.klass.joinNote ? ` · Passcode ${hub.klass.joinNote}` : ""}
                </p>
            </div>
            {!compact && (
                <div className="flex shrink-0 flex-wrap gap-2">
                    <DuoButton size="sm" href="/live" iconTrailing={ArrowRight}>
                        {nx.live ? "Join live classroom" : "Live classroom"}
                    </DuoButton>
                </div>
            )}
        </section>
    );
};

export type CalEvent = { date: Date; kind: "class" | "recorded" | "skipped" | "moved" | "extra" | "break" | "checkin" | "homework" | "oral"; label: string; href?: string; title?: string };
const CHIP: Record<CalEvent["kind"], string> = {
    class: "bg-brand-500 text-white",
    extra: "bg-brand-500 text-white",
    moved: "bg-blue-500 text-white",
    recorded: "bg-blue-100 text-blue-800",
    skipped: "bg-secondary text-quaternary line-through",
    break: "bg-secondary text-quaternary",
    checkin: "bg-warning-primary text-warning-primary",
    homework: "bg-purple-100 text-purple-800",
    oral: "bg-orange-100 text-orange-800",
};

/** A month, Monday first, with the day's events as small chips. */
export const MonthCalendar = ({ events, now, initial, className }: { events: CalEvent[]; now: Date; initial?: Date; className?: string }) => {
    const [cur, setCur] = useState(() => {
        const w = wall(initial ?? now);
        return new Date(w.getFullYear(), w.getMonth(), 1);
    });
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cur.getFullYear(), cur.getMonth(), i + 1))];
    while (cells.length % 7) cells.push(null);
    const byDay = new Map<string, CalEvent[]>();
    for (const e of events) {
        const k = dayKey(e.date);
        byDay.set(k, [...(byDay.get(k) ?? []), e]);
    }
    const move = (n: number) => setCur(new Date(cur.getFullYear(), cur.getMonth() + n, 1));
    return (
        <section aria-label="Calendar" className={cx("rounded-2xl border-2 border-secondary bg-primary", className)}>
            <div className="flex items-center justify-between gap-2 border-b-2 border-secondary px-4 py-3">
                <h2 className="text-lg font-bold text-primary">{cur.toLocaleDateString("en-IE", { month: "long", year: "numeric" })}</h2>
                <div className="flex items-center gap-1">
                    <DuoButton color="ghost" size="xs" ariaLabel="Previous month" iconLeading={ChevronLeft} onPress={() => move(-1)} />
                    <DuoButton color="ghost" size="xs" onPress={() => setCur(new Date(wall(now).getFullYear(), wall(now).getMonth(), 1))}>
                        Today
                    </DuoButton>
                    <DuoButton color="ghost" size="xs" ariaLabel="Next month" iconLeading={ChevronRight} onPress={() => move(1)} />
                </div>
            </div>
            <div className="grid grid-cols-7 border-b-2 border-secondary">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="py-2 text-center duo-label text-quaternary">
                        {d}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                    const evs = d ? (byDay.get(dateKey(d)) ?? []) : [];
                    const today = d && dateKey(d) === dayKey(now);
                    return (
                        <div key={i} className={cx("min-h-18 border-b border-secondary p-1 md:min-h-22 md:p-1.5", i % 7 !== 6 && "border-r", !d && "bg-secondary_subtle")}>
                            {d && (
                                <>
                                    <span className={cx("mb-1 flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums", today ? "bg-brand-solid text-white" : dateKey(d) < dayKey(now) ? "text-quaternary" : "text-secondary")}>{d.getDate()}</span>
                                    <ul className="flex flex-col gap-0.5">
                                        {evs.map((e, j) => {
                                            const chip = <span className={cx("block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-bold", CHIP[e.kind])}>{e.label}</span>;
                                            return (
                                                <li key={j} title={e.title ?? e.label}>
                                                    {e.href ? (
                                                        <Link to={e.href} className="block rounded-md outline-focus-ring hover:brightness-95 focus-visible:outline-2">
                                                            {chip}
                                                        </Link>
                                                    ) : (
                                                        chip
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs font-semibold text-tertiary">
                {(["class", "recorded", "break", "checkin", "homework"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-1.5">
                        <span className={cx("size-2.5 rounded-sm", CHIP[k].split(" ")[0])} aria-hidden="true" />
                        {{ class: "Class", recorded: "Pre-recorded", break: "No class", checkin: "Check-in due", homework: "Homework" }[k]}
                    </li>
                ))}
            </ul>
        </section>
    );
};

/** The class card on the side: who we are, when we meet, and the way in. */
export const ClassCard = ({ hub, now, children }: { hub: Hub; now: Date; children?: ReactNode }) => {
    const nx = nextClass(hub, now);
    return (
        <section aria-label="Your class" className="rounded-2xl border-2 border-secondary bg-primary p-5">
            <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-solid text-md font-black text-white">{initials(hub.klass.name)}</span>
                <div className="min-w-0">
                    <p className="truncate text-md font-bold text-primary">{hub.klass.name}</p>
                    <p className="text-sm text-tertiary">{classWhen(hub)}</p>
                </div>
            </div>
            {nx && (
                <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-sm text-secondary">
                    <span className="font-bold text-primary">{nx.live ? "Happening now" : "Next class"}</span> {nx.live ? "" : `${fmtShort(nx.date)}, ${fmtTime(nx.date)}`}
                </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
                <DuoButton size="sm" full href="/live">
                    {nx?.live ? "Join live classroom" : "Live classroom"}
                </DuoButton>
                {children}
            </div>
        </section>
    );
};

/** A quiet heading for a side-column block. */
export const SideHead = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
    <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="duo-label text-quaternary">{children}</h2>
        {action}
    </div>
);
