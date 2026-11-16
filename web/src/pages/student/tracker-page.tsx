// The student's weekly tracker at /tracker: every week of the course as a card with its attendance,
// check-in and homework tiles, the class banner and this-week notice above, the address task bar,
// the running total, overdue deadlines that can be cleared, and the forms and feedback that open
// from the tiles. Ported from studentTrackerView / bindStudentView / openStudentItem /
// nextClassBanner / taskBar / openAddressModal / openClassInfo / dismissDeadline in the old app.js.
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChatCircle, Note, VideoCamera } from "@phosphor-icons/react";
import { Button as AriaButton } from "react-aria-components";
import { useNavigate, useSearchParams } from "react-router";
import { DuoButton, DuoCard } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoCheckDoc } from "@/components/app/duo-icons";
import { DuoSelect } from "@/components/app/duo-select";
import { BookOpen01, Calendar, Play, X } from "@/components/app/ic";
import { Empty, Page, PageHeader } from "@/components/app/page-parts";
import { toast } from "@/components/app/toast";
import { useAvatarGate } from "@/lib/account";
import { api, useApi, useCanJoinLive, useLiveNow, useMe } from "@/lib/portal";
import { JoinLive } from "@/components/app/hub-parts";
import {
    type Assignment,
    type Checkin,
    type ClassDate,
    type Dismissal,
    type Homework,
    type StatusIconName,
    type StatusState,
    type StudentBootstrap,
    type Tone,
    type Week,
    assignmentClosed,
    attendanceState,
    checkinState,
    classTimezone,
    effectiveDeadline,
    fmtDate,
    fmtWeek,
    homeworkState,
    hoursOrMinutes,
    isDismissed,
    passcodeOnly,
    plainHour,
    sittingsForWeek,
    studentMaps,
    studentProgress,
} from "@/lib/student";
import { cx } from "@/utils/cx";
import { CheckinForm } from "./checkin-form";
import { CelebrationDialog, CheckinFeedbackDialog, HomeworkFeedbackDialog, SubmittedCheckinDialog, SubmittedHomeworkDialog } from "./feedback-views";
import { HomeworkForm } from "./homework-form";

/* ---- status tiles ---- */

const TONE_CHIP: Record<Tone, string> = {
    grey: "bg-secondary text-tertiary",
    orange: "bg-warning-primary text-warning-primary",
    green: "bg-success-primary text-success-primary",
    red: "bg-error-primary text-error-primary",
    blue: "bg-blue-100 text-blue-800",
};
const StatusGlyph = ({ icon, className }: { icon: StatusIconName; className?: string }) => {
    const c = cx("size-4", className);
    if (icon === "camera") return <Camera weight="bold" aria-hidden="true" className={c} />;
    if (icon === "talk") return <ChatCircle weight="bold" aria-hidden="true" className={c} />;
    if (icon === "x") return <X aria-hidden="true" className={c} />;
    return <BookOpen01 aria-hidden="true" className={c} />;
};

/* One status tile: a fixed icon over a single line of label text. `hint` becomes the hover tooltip. */
const StatusIcon = ({ state }: { state: StatusState }) => (
    <>
        <span className={cx("relative flex size-9 items-center justify-center rounded-xl", TONE_CHIP[state.tone])}>
            <StatusGlyph icon={state.icon} />
            {state.unread && (
                <span aria-label="1 new" className="absolute -top-1.5 -right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full border-2 border-white bg-error-solid px-1 text-[9px] font-bold text-white tabular-nums">
                    1
                </span>
            )}
        </span>
        <span title={state.hint || state.label} className="max-w-full truncate text-[11px] font-semibold text-secondary">
            {state.label}
        </span>
    </>
);

const LegendKey = ({ tone, icon, label }: { tone: Tone | "plain"; icon: StatusIconName; label: string }) => (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-tertiary">
        <span className={cx("grid size-6 place-items-center rounded-lg", tone === "plain" ? "border-2 border-secondary bg-primary text-tertiary" : TONE_CHIP[tone])}>
            <StatusGlyph icon={icon} className="size-3.5" />
        </span>
        {label}
    </span>
);
const Legend = () => (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t-2 border-secondary bg-secondary px-4 py-3">
        <div className="flex flex-wrap items-center gap-3.5">
            <span className="duo-label text-quaternary">Columns</span>
            <LegendKey tone="plain" icon="camera" label="Attendance" />
            <LegendKey tone="plain" icon="talk" label="Check-in" />
            <LegendKey tone="plain" icon="book" label="Homework" />
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
            <span className="duo-label text-quaternary">Status</span>
            <LegendKey tone="grey" icon="book" label="To do" />
            <LegendKey tone="green" icon="book" label="Submitted or returned" />
            <LegendKey tone="red" icon="x" label="Missed or absent" />
        </div>
    </div>
);

/* ---- the banner and this-week notice ---- */

/* A week that is not the usual thing says so first. The banner below names the next live class, but a
   week replaced by a recording would otherwise pass in silence. */
const WeekNotice = ({ data }: { data: StudentBootstrap }) => {
    const tw = data.thisWeek;
    if (!tw || tw.kind === "moved") return null;
    const recorded = tw.kind === "recorded";
    return (
        <section className={cx("flex items-start gap-4 rounded-2xl border-2 p-4", recorded ? "border-blue-200 bg-blue-50" : "border-secondary bg-secondary")}>
            <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", recorded ? "bg-blue-100 text-blue-800" : "bg-primary text-tertiary")}>{recorded ? <Play aria-hidden="true" className="size-5" /> : <Calendar aria-hidden="true" className="size-5" />}</span>
            <div className="min-w-0">
                <p className="text-md font-bold text-primary">{recorded ? "This week is pre-recorded" : "No class this week"}</p>
                <p className="mt-0.5 text-sm leading-6 text-tertiary">{tw.reason || (recorded ? "Watch the recording in Courses whenever it suits you. There is no live class." : "The class is not meeting this week. Your check-in and homework are unaffected.")}</p>
            </div>
        </section>
    );
};

const ClassBanner = ({ data, tz }: { data: StudentBootstrap; tz: string }) => {
    const next = data.nextClass;
    /* In the hub's own room, "live" is the teacher having gone live (polled), not the clock. */
    const on = useLiveNow() && Boolean(data.liveReady);
    const canJoin = useCanJoinLive() && Boolean(data.liveReady);
    if (!next) return null;
    // The button is there whenever there is a link at all; what the hours change is the urgency of the wording.
    if (!next.joinUrl && !next.live && !next.soon && !data.liveReady) return null;
    const live = data.liveReady ? on : next.live;
    const when = live ? "Happening now" : next.live ? "Starting shortly" : next.soon ? `Starts ${hoursOrMinutes(next.minutesAway)}` : `Next class ${fmtDate(next.startsAt, { weekday: true, time: true, dateStyle: "short" }, tz)}`;
    const line = `${next.live || next.soon ? fmtDate(next.startsAt, { weekday: true, time: true, dateStyle: "short" }, tz) : fmtDate(next.startsAt, { dateStyle: "medium" }, tz)} · ${plainHour(next.startsAt, next.timezone)} Irish${next.note ? ` · Passcode: ${passcodeOnly(next.note)}` : ""}${next.movedFrom ? " · moved from its usual day" : ""}`;
    return (
        <section aria-label="Next class" className={cx("flex flex-col gap-4 rounded-2xl border-2 p-5 md:flex-row md:items-center md:gap-6", live ? "border-brand bg-brand-primary" : "border-secondary bg-primary")}>
            <span className={cx("grid size-12 shrink-0 place-items-center rounded-2xl border-2", live ? "border-brand bg-primary text-brand-secondary" : "border-secondary bg-primary text-tertiary")}>
                <VideoCamera weight="bold" aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-lg font-bold text-primary">
                    {live && <span className="size-2 animate-pulse rounded-full bg-error-solid" aria-hidden="true" />}
                    {when}
                </p>
                <p className="mt-0.5 text-sm text-tertiary">{line}</p>
                {data.liveReady && !canJoin && <p className="mt-1 text-xs font-semibold text-quaternary">The button appears here by itself when your teacher goes live. No need to refresh.</p>}
            </div>
            {/* The class plays inside the hub now, so the door is the Live class page rather than a Zoom link that opens somewhere else. */}
            {data.liveReady ? (
                <JoinLive live={canJoin} />
            ) : next.joinUrl ? (
                <a href={next.joinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10.5 items-center justify-center rounded-2xl border-2 border-transparent border-b-4 border-b-brand-700 bg-brand-500 px-3.5 text-[13px] font-bold tracking-[0.8px] text-white uppercase hover:brightness-105">
                    {next.live ? "Join Now" : "Join Class"}
                </a>
            ) : (
                <span className="text-xs text-tertiary">No link yet</span>
            )}
        </section>
    );
};

/* ---- the address task bar and its form ---- */

/* The counties, so the list is the same one the server will accept. A free text box here would
   produce "Co Galway", "galway" and "Gaillimh" in the same column of the same spreadsheet. */
const COUNTIES = ["Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down", "Dublin", "Fermanagh", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford", "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Tyrone", "Waterford", "Westmeath", "Wexford", "Wicklow"];

type Address = { address_line1: string; address_line2: string; address_county: string; eircode: string };
const CHOOSE_COUNTY = "__choose";
const AddressDialog = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
    const [form, setForm] = useState<{ line1: string; line2: string; county: string; eircode: string } | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        api<Address>("/api/student/address")
            .then((a) => setForm({ line1: a.address_line1 || "", line2: a.address_line2 || "", county: a.address_county || "", eircode: a.eircode || "" }))
            .catch(() => setForm({ line1: "", line2: "", county: "", eircode: "" }));
    }, []);
    const save = async () => {
        if (!form) return;
        const body = { line1: form.line1.trim(), line2: form.line2.trim(), county: form.county, eircode: form.eircode.trim() };
        if (!body.line1 || !body.county || !body.eircode) return toast("Fill in your address, county and Eircode.");
        setBusy(true);
        try {
            await api("/api/student/address", { method: "PUT", json: body });
            /* The bar is drawn from this, so it has to be true before the screen is drawn again, or the bar
               comes back for somebody who just answered it. */
            onSaved();
            toast("Thank you, that is saved");
        } catch (e) {
            setBusy(false);
            toast((e as Error).message);
        }
    };
    const input = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden focus:border-brand";
    return (
        <DuoDialog open onClose={onClose} title="Your address" sub="So we can post things out to you." className="max-w-xl">
            {!form ? (
                <p className="text-sm text-quaternary">Loading…</p>
            ) : (
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        save();
                    }}
                >
                    <div>
                        <FieldLabel>Address line 1</FieldLabel>
                        <input aria-label="Address line 1" required maxLength={200} autoComplete="address-line1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} placeholder="12 Ard na Gréine" className={input} />
                    </div>
                    <div>
                        <FieldLabel>Address line 2 (optional)</FieldLabel>
                        <input aria-label="Address line 2" maxLength={200} autoComplete="address-line2" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} placeholder="Ballinfoyle" className={input} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <FieldLabel>County</FieldLabel>
                            <DuoSelect label="County" value={form.county || CHOOSE_COUNTY} items={[{ id: CHOOSE_COUNTY, label: "Choose your county" }, ...COUNTIES.map((c) => ({ id: c, label: c }))]} onChange={(county) => setForm({ ...form, county: county === CHOOSE_COUNTY ? "" : county })} className="w-full" />
                        </div>
                        <div>
                            <FieldLabel>Eircode</FieldLabel>
                            <input aria-label="Eircode" required maxLength={10} autoComplete="postal-code" value={form.eircode} onChange={(e) => setForm({ ...form, eircode: e.target.value })} placeholder="A65 F4E2" className={input} />
                        </div>
                    </div>
                    <p className="text-xs text-tertiary">
                        You can look your Eircode up at{" "}
                        <a href="https://finder.eircode.ie" target="_blank" rel="noopener" className="font-bold text-brand-secondary hover:underline">
                            finder.eircode.ie
                        </a>
                        .
                    </p>
                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <DuoButton color="secondary" size="sm" onPress={onClose}>
                            Not Now
                        </DuoButton>
                        <DuoButton size="sm" type="submit" isDisabled={busy}>
                            Save Address
                        </DuoButton>
                    </div>
                </form>
            )}
        </DuoDialog>
    );
};

/* The one thing we need from a student that the course itself does not produce: a bar rather than a
   dialog on arrival, obvious, and gone for good the moment it is answered. */
const TaskBar = ({ onPress }: { onPress: () => void }) => (
    <AriaButton onPress={onPress} className="flex w-full items-center gap-3 rounded-2xl border-2 border-warning-300 bg-warning-primary px-4 py-3 text-left outline-focus-ring transition duration-100 ease-linear hover:border-warning-500 focus-visible:outline-2">
        <Note weight="bold" aria-hidden="true" className="size-5 shrink-0 text-warning-primary" />
        <span className="min-w-0 flex-1">
            <strong className="block text-sm font-bold text-primary">Enter your address &amp; Eircode</strong>
            <small className="block text-xs text-secondary">So we can post things out to you. It takes a moment.</small>
        </span>
        <span className="hidden shrink-0 text-xs font-bold text-warning-primary sm:block">Click here</span>
    </AriaButton>
);

/* ---- class info ---- */

/* What is happening on one class date: is it on, when, and how do I get in. All of it is in hand from
   the bootstrap, so this opens instantly. */
const InfoRow = ({ k, v }: { k: string; v: ReactNode }) => (
    <div className="flex justify-between gap-4 border-b border-secondary py-2 text-sm last:border-0">
        <dt className="text-tertiary">{k}</dt>
        <dd className="text-right font-semibold text-primary">{v}</dd>
    </div>
);
const ClassInfoDialog = ({ data, sittings, tz, onClose }: { data: StudentBootstrap; sittings: ClassDate[]; tz: string; onClose: () => void }) => {
    const nav = useNavigate();
    const sitting = sittings.find((s) => s.kind !== "extra") || sittings[0];
    if (!sitting) return null;
    const klass = data.class;
    const at = new Date(sitting.at);
    const when = at.toLocaleString("en-IE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz });
    const usual = new Date(`${sitting.onDate}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    /* The link is only offered where there is a class to join. */
    const next = data.nextClass;
    const sameSitting = Boolean(next && Math.abs(new Date(next.startsAt).getTime() - at.getTime()) < 60000);
    const joinUrl = sitting.kind === "extra" ? sitting.joinUrl || next?.joinUrl || null : ["running", "moved"].includes(sitting.kind) ? (sameSitting ? next?.joinUrl : klass?.join_url) || null : null;
    const said: Record<string, [string, string]> = {
        running: ["Class as usual", `Your weekly class, at the time it always runs. Times shown in ${tz}.`],
        moved: ["This class has moved", `It was due on ${usual} and is running at the time above instead.`],
        recorded: ["Pre-recorded this week", "There is no live class. The recording is in Courses whenever it suits you."],
        skipped: ["No class this week", "The class is not meeting. Your check-in and homework are unaffected."],
        extra: [sitting.label || "Extra class", "An additional session on top of the weekly class."],
    };
    const [title, line] = said[sitting.kind] || ["Class", ""];
    return (
        <DuoDialog open onClose={onClose} title={title} sub={sitting.kind === "skipped" ? usual : when}>
            <p className="text-md leading-7 text-secondary">{sitting.reason || line}</p>
            {sitting.kind !== "skipped" && (
                <dl className="mt-4">
                    <InfoRow k="When" v={when} />
                    <InfoRow k="Timezone" v={tz} />
                    {sitting.minutes ? <InfoRow k="Length" v={`${sitting.minutes} minutes`} /> : null}
                    {klass?.join_note && joinUrl && !data.liveReady ? <InfoRow k="Passcode" v={passcodeOnly(klass.join_note)} /> : null}
                </dl>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Close
                </DuoButton>
                {sitting.kind === "recorded" ? (
                    <DuoButton size="sm" onPress={() => nav("/courses")}>
                        Go to Courses
                    </DuoButton>
                ) : data.liveReady && sitting.kind !== "skipped" ? (
                    <DuoButton size="sm" onPress={() => nav("/live")}>
                        Go to Live Class
                    </DuoButton>
                ) : joinUrl ? (
                    <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10.5 items-center justify-center rounded-2xl border-2 border-transparent border-b-4 border-b-brand-700 bg-brand-500 px-3.5 text-[13px] font-bold tracking-[0.8px] text-white uppercase hover:brightness-105">
                        Join Class
                    </a>
                ) : null}
            </div>
        </DuoDialog>
    );
};

/* ---- the page ---- */

type OpenItem = { kind: "checkin"; weekId: string } | { kind: "homework"; assignmentId: string } | { kind: "address" } | { kind: "class"; weekId: string };
type Celebrate = { title: string; line: string; milestone: number | null };

const SIGNED_OUT = (
    <Page>
        <PageHeader title="Homework and check-ins" sub="Your weekly tracker: the check-in for each week, the homework set, your hand-ins and the corrections." />
        <div className="rounded-2xl border-2 border-secondary bg-primary p-8 text-center">
            <p className="text-lg font-bold text-primary">Sign in to see your tracker</p>
            <p className="mt-1 text-md text-tertiary">Your usual Gaeilgeoir Guides login.</p>
            <div className="mt-5">
                <DuoButton href="/signin?next=/tracker">Sign In</DuoButton>
            </div>
        </div>
    </Page>
);

export const TrackerPage = () => {
    const me = useMe();
    const [sp, setSp] = useSearchParams();
    const { data, loading, error, reload, set } = useApi<StudentBootstrap>(me?.role === "student" ? "/api/student/bootstrap" : null, [me?.id]);
    const [open, setOpen] = useState<OpenItem | null>(null);
    const [celebrate, setCelebrate] = useState<Celebrate | null>(null);
    const loadedAt = useRef(Date.now());
    const followed = useRef<string | null>(null);
    const tz = classTimezone(data);

    useEffect(() => {
        if (data) loadedAt.current = Date.now();
    }, [data]);
    useAvatarGate(error);
    useEffect(() => {
        if (error) toast(error.message);
    }, [error]);

    /* A tab left open overnight, or a second device, showed yesterday's list: homework handed in on the
       phone still read "To do" on the laptop. Coming back to the tab after a while asks again, but never
       under somebody's feet mid-form. */
    const dialogOpen = Boolean(open || celebrate);
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState !== "visible" || !data || Date.now() - loadedAt.current < 60 * 1000) return;
            if (dialogOpen) return;
            reload().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [data, dialogOpen, reload]);

    const maps = data ? studentMaps(data) : null;

    /* Open a tile the way the old openStudentItem did: both ends of the check-in window are answered
       here rather than by opening a form the server will refuse. */
    const openItem = useCallback(
        (item: { kind: "checkin"; weekId: string } | { kind: "homework"; assignmentId: string }) => {
            if (!data || !maps) return;
            if (item.kind === "checkin") {
                const week = data.weeks.find((w) => w.id === item.weekId);
                if (!week) return;
                const checkin = maps.checkins.get(week.id);
                if (checkin?.status === "returned" || checkin?.status === "submitted") return setOpen(item);
                if (week.checkin_release_at && Date.now() < new Date(week.checkin_release_at).getTime()) return toast(`This check-in opens ${fmtDate(week.checkin_release_at, { weekday: true, time: true, dateStyle: "short" }, tz)}`);
                /* A soft deadline keeps taking check-ins, marked late, which is what the server does and what
                   the card says ("Open, late"). Only a hard one closes. */
                if (Date.now() > new Date(week.checkin_due_at).getTime() && week.checkin_hard_deadline !== false) return toast(`This check-in closed ${fmtDate(week.checkin_due_at, { weekday: true, time: true, dateStyle: "short" }, tz)}`);
                return setOpen(item);
            }
            if (!data.assignments.some((a) => a.id === item.assignmentId)) return;
            setOpen(item);
        },
        [data, maps, tz],
    );

    // ?open=homework:<assignmentId> / ?open=checkin:<weekId>: the tracker with that item open, as the
    // calendar and the emails ask. Taken out of the address bar first, so a refresh does not reopen it.
    useEffect(() => {
        const want = sp.get("open");
        if (!data || !want || followed.current === want) return;
        followed.current = want;
        const m = /^(homework|checkin):([\w-]+)$/.exec(want);
        const next = new URLSearchParams(sp);
        next.delete("open");
        setSp(next, { replace: true });
        if (!m) return;
        if (m[1] === "homework") openItem({ kind: "homework", assignmentId: m[2] });
        else openItem({ kind: "checkin", weekId: m[2] });
    }, [data, sp, setSp, openItem]);

    if (me === undefined) return <Page>{null}</Page>;
    if (!me) return SIGNED_OUT;
    if (me.role === "admin")
        return (
            <Page>
                <PageHeader title="Homework and check-ins" sub="This is the student view of the weekly tracker." />
                <div className="rounded-2xl border-2 border-secondary bg-primary p-8 text-center">
                    <p className="text-lg font-bold text-primary">You are signed in as a teacher</p>
                    <p className="mt-1 text-md text-tertiary">The class tracker, with every student's row, is in the teacher console.</p>
                    <div className="mt-5">
                        <DuoButton href="/teach">Open the Teacher Console</DuoButton>
                    </div>
                </div>
            </Page>
        );
    if (!data)
        return (
            <Page>
                <PageHeader title="Homework and check-ins" sub="Every week of the course at a glance." />
                <p className="text-sm text-quaternary">{loading ? "Loading your tracker…" : "Your tracker could not be loaded."}</p>
            </Page>
        );

    const header = <PageHeader kicker={data.class?.label} title="Homework and check-ins" sub="Every week of the course at a glance." />;
    if (!data.class)
        return (
            <Page>
                {header}
                <Empty icon={DuoCheckDoc} title="You are not in a class yet" note="Your account is active but has not been added to a class group. Contact Gaeilgeoir Guides and they will add you." />
            </Page>
        );

    const progress = studentProgress(data);
    const weeks = [...data.weeks].reverse();
    const currentWeekId = data.weeks.at(-1)?.id;
    const now = Date.now();

    /** A local change to the bootstrap (always on top of the latest copy). */
    const patch = (f: (p: StudentBootstrap) => StudentBootstrap) => set((prev) => f(prev ?? data));

    /* Mark a reply read locally, so the dot and the badge go without another round trip. */
    const markRead = (kind: "checkin" | "homework", id: string) =>
        patch((prev) => {
            const stamp = new Date().toISOString();
            return {
                ...prev,
                notifications: Math.max(0, prev.notifications - 1),
                checkins: kind === "checkin" ? prev.checkins.map((c) => (c.id === id ? { ...c, feedback_read_at: stamp } : c)) : prev.checkins,
                homework: kind === "homework" ? prev.homework.map((h) => (h.id === id ? { ...h, feedback_read_at: stamp } : h)) : prev.homework,
            };
        });

    /* It is in. The form gives way to the celebration once the fresh bootstrap is back; a milestone earns
       the bigger burst. */
    const submitted = async (title: string, line: string) => {
        setOpen(null);
        setCelebrate({ title, line, milestone: null });
        try {
            const fresh = await api<StudentBootstrap>("/api/student/bootstrap");
            set(fresh);
            loadedAt.current = Date.now();
            const hit = studentProgress(fresh).justHit;
            if (hit) setCelebrate((c) => (c ? { ...c, milestone: hit } : c));
        } catch {
            /* the celebration still shows; the next visit reloads */
        }
    };

    /* A hard deadline that has gone cannot be met, so leaving it in the list is a reminder to do something
       impossible. Clearing it changes this student's list and nothing else. */
    const dismiss = async (kind: Dismissal["kind"], refId: string, title: string) => {
        try {
            await api("/api/student/dismissals", { method: "POST", json: { kind, refId } });
        } catch (e) {
            return toast((e as Error).message);
        }
        patch((prev) => ({ ...prev, dismissals: [...(prev.dismissals || []), { kind, refId }] }));
        toast(`Cleared. ${title} is still recorded in your tracker.`, async () => {
            try {
                await api(`/api/student/dismissals/${kind}/${refId}`, { method: "DELETE" });
            } catch (e) {
                return toast((e as Error).message);
            }
            patch((prev) => ({ ...prev, dismissals: (prev.dismissals || []).filter((r) => !(r.kind === kind && r.refId === refId)) }));
        });
    };

    /* Overdue work: a hard deadline that passed with nothing in. Work that had already closed when this
       student joined was never theirs to miss, and anything cleared stays cleared. */
    const joinedAt = data.enrolledAt ? new Date(data.enrolledAt).getTime() : 0;
    type Overdue = { kind: Dismissal["kind"]; refId: string; title: string; due: string; state: StatusState; open: () => void };
    const overdue: Overdue[] = [];
    data.weeks.forEach((week) => {
        if (!week.checkin_enabled) return;
        const checkin = maps!.checkins.get(week.id);
        const state = checkinState(checkin, week, tz, now);
        if (state.tone !== "red" || (checkin && checkin.status !== "draft")) return;
        overdue.push({ kind: "checkin", refId: week.id, title: `Week of ${fmtWeek(week.week_start)} check-in`, due: week.checkin_due_at, state, open: () => openItem({ kind: "checkin", weekId: week.id }) });
    });
    data.assignments.forEach((a) => {
        const sub = maps!.homework.get(a.id);
        const state = homeworkState(sub, a, now);
        if (state.tone !== "red" || (sub && sub.status !== "draft") || !assignmentClosed(a, now)) return;
        overdue.push({ kind: "homework", refId: a.id, title: a.title, due: new Date(effectiveDeadline(a)).toISOString(), state, open: () => openItem({ kind: "homework", assignmentId: a.id }) });
    });
    const shownOverdue = overdue.filter((o) => !isDismissed(data, o.kind, o.refId) && !(joinedAt && new Date(o.due).getTime() < joinedAt)).sort((a, b) => new Date(b.due).getTime() - new Date(a.due).getTime());

    /* Which dialog is open. The rows are read from the live data each render, so a reply marked read or a
       draft saved shows straight away. */
    let dialog: ReactNode = null;
    if (open?.kind === "address") dialog = <AddressDialog onClose={() => setOpen(null)} onSaved={() => (patch((p) => ({ ...p, addressNeeded: false })), setOpen(null))} />;
    else if (open?.kind === "class") {
        const week = data.weeks.find((w) => w.id === open.weekId);
        dialog = week ? <ClassInfoDialog data={data} sittings={sittingsForWeek(data.classDates, week.week_start)} tz={tz} onClose={() => setOpen(null)} /> : null;
    } else if (open?.kind === "checkin") {
        const week = data.weeks.find((w) => w.id === open.weekId);
        const checkin: Checkin | undefined = week ? maps!.checkins.get(week.id) : undefined;
        if (week && checkin?.status === "returned") dialog = <CheckinFeedbackDialog checkin={checkin} week={week} onClose={() => setOpen(null)} onRead={() => markRead("checkin", checkin.id)} />;
        else if (week && checkin?.status === "submitted") dialog = <SubmittedCheckinDialog checkin={checkin} week={week} onClose={() => setOpen(null)} />;
        else if (week) dialog = <CheckinForm week={week} existing={checkin} onClose={() => setOpen(null)} onSubmitted={() => submitted("Check-in sent. Maith thú!", "Your teacher will read it and come back to you in your weekly tracker.")} />;
    } else if (open?.kind === "homework") {
        const assignment = data.assignments.find((a) => a.id === open.assignmentId);
        const sub: Homework | undefined = assignment ? maps!.homework.get(assignment.id) : undefined;
        if (assignment && sub?.status === "returned") dialog = <HomeworkFeedbackDialog assignment={assignment} submission={sub} onClose={() => setOpen(null)} onRead={() => markRead("homework", sub.id)} />;
        else if (assignment && sub?.status === "submitted") dialog = <SubmittedHomeworkDialog assignment={assignment} submission={sub} onClose={() => setOpen(null)} />;
        else if (assignment) dialog = <HomeworkForm assignment={assignment} tz={tz} onClose={() => setOpen(null)} onSubmitted={() => submitted("Homework in. Go hiontach!", "Corrections and feedback will appear in your weekly tracker once your teacher has been through it.")} />;
    }

    return (
        <Page wide>
            {header}
            <div className="grid gap-4">
                <WeekNotice data={data} />
                <ClassBanner data={data} tz={tz} />
                {data.addressNeeded && <TaskBar onPress={() => setOpen({ kind: "address" })} />}
                {progress.total > 0 && (
                    <section aria-label="Your progress" className="flex flex-wrap gap-2.5">
                        <GoalChip value={progress.checkins} label={progress.checkins === 1 ? "check-in done" : "check-ins done"} />
                        <GoalChip value={progress.homework} label="homework done" />
                    </section>
                )}
                {shownOverdue.length > 0 && (
                    <DuoCard className="p-0">
                        <div className="flex items-center justify-between gap-3 px-5 py-4">
                            <div>
                                <h2 className="text-lg font-bold text-primary">Overdue</h2>
                                <p className="text-sm text-tertiary">
                                    {shownOverdue.length} deadline{shownOverdue.length === 1 ? "" : "s"} passed without a submission.
                                </p>
                            </div>
                            <span className="rounded-full bg-error-primary px-2.5 py-1 text-xs font-bold text-error-primary tabular-nums">{shownOverdue.length}</span>
                        </div>
                        <div className="grid gap-3 border-t-2 border-secondary p-4 sm:grid-cols-2 lg:grid-cols-3">
                            {shownOverdue.map((o) => (
                                <article key={`${o.kind}:${o.refId}`} className="relative rounded-2xl border-2 border-error-200 bg-error-primary/40 p-4 pr-10">
                                    <AriaButton onPress={() => dismiss(o.kind, o.refId, o.title)} aria-label={`Clear ${o.title} from your list`} className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full text-tertiary outline-focus-ring hover:bg-primary hover:text-primary focus-visible:outline-2">
                                        <X aria-hidden="true" className="size-4" />
                                    </AriaButton>
                                    <small className="block text-xs text-tertiary">{fmtDate(o.due, { time: true, weekday: true, dateStyle: "short" }, tz)}</small>
                                    <strong className="mt-0.5 block text-md font-bold text-primary">{o.title}</strong>
                                    <p className="mt-1 text-sm text-secondary">{o.state.hint || o.state.label}</p>
                                    <DuoButton color="secondary" size="xs" className="mt-3" onPress={o.open}>
                                        View
                                    </DuoButton>
                                </article>
                            ))}
                        </div>
                    </DuoCard>
                )}

                {!weeks.length ? (
                    <Empty icon={DuoCheckDoc} title="Your tracker is empty" note="Weeks appear here once your class has started. Check back after your first session." />
                ) : (
                    <DuoCard className="overflow-hidden p-0">
                        <div className="grid gap-3 p-4">
                            {weeks.map((week) => (
                                <WeekCard key={week.id} week={week} data={data} isCurrent={week.id === currentWeekId} tz={tz} now={now} onOpen={openItem} onClass={sittingsForWeek(data.classDates, week.week_start).length ? () => setOpen({ kind: "class", weekId: week.id }) : undefined} />
                            ))}
                        </div>
                        <Legend />
                    </DuoCard>
                )}
            </div>
            {dialog}
            {celebrate && <CelebrationDialog title={celebrate.title} line={celebrate.line} milestone={celebrate.milestone} onClose={() => setCelebrate(null)} />}
        </Page>
    );
};

const GoalChip = ({ value, label }: { value: number; label: string }) => (
    <div className="flex items-baseline gap-2 rounded-2xl border-2 border-secondary bg-primary px-4 py-2.5">
        <strong className="text-lg font-bold text-primary tabular-nums">{value}</strong>
        <span className="text-sm text-tertiary">{label}</span>
    </div>
);

/* One week: the head on the left (or on top on a phone), then a tile per action that always keeps
   the same shape. A week with no homework shows no homework tile; the row closes up. */
type Action = { key: string; name: string; state: StatusState; disabled?: boolean; onPress?: () => void };
const WeekCard = ({ week, data, isCurrent, tz, now, onOpen, onClass }: { week: Week; data: StudentBootstrap; isCurrent: boolean; tz: string; now: number; onOpen: (i: { kind: "checkin"; weekId: string } | { kind: "homework"; assignmentId: string }) => void; onClass?: () => void }) => {
    const maps = studentMaps(data);
    const checkin = maps.checkins.get(week.id);
    const assignments: Assignment[] = maps.assignmentsByWeek.get(week.id) || [];
    const actions: Action[] = [{ key: "attendance", name: "Attendance", state: attendanceState(maps.attendance.get(week.id)), disabled: true }];
    /* The tile stays once the check-in has opened, closed or not: a submitted or returned check-in, and
       its unread dot, has to be reachable from the tracker the badge points at. */
    const released = week.checkin_enabled !== false && Boolean(week.checkin_release_at) && now >= new Date(week.checkin_release_at as string).getTime();
    if (released || checkin) {
        const unread = checkin?.status === "returned" && !checkin.feedback_read_at;
        actions.push({ key: "checkin", name: "Check-in", state: { ...checkinState(checkin, week, tz, now), unread }, onPress: () => onOpen({ kind: "checkin", weekId: week.id }) });
    }
    assignments.forEach((a) => {
        const hw = maps.homework.get(a.id);
        const unread = hw?.status === "returned" && !hw.feedback_read_at;
        actions.push({ key: a.id, name: assignments.length > 1 ? a.title : "Homework", state: { ...homeworkState(hw, a, now), unread }, onPress: () => onOpen({ kind: "homework", assignmentId: a.id }) });
    });
    const needsAction = actions.some((a) => a.state.unread || a.state.tone === "grey");
    return (
        <article className={cx("overflow-hidden rounded-2xl border-2 bg-primary md:grid md:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]", isCurrent ? "border-brand ring-4 ring-brand-500/10" : needsAction ? "border-brand-200" : "border-secondary")}>
            <header className={cx("flex items-center border-b-2 border-secondary px-4 py-3.5 md:border-r-2 md:border-b-0", isCurrent ? "bg-brand-primary" : "bg-secondary")}>
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-secondary">
                        Week of {fmtWeek(week.week_start)}
                        {isCurrent && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">This week</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-quaternary">Check-in due {fmtDate(week.checkin_due_at, { time: true, weekday: true, dateStyle: "short" }, tz)}</p>
                    {onClass && (
                        <AriaButton onPress={onClass} className="mt-1.5 text-xs font-bold text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2">
                            About this week's class
                        </AriaButton>
                    )}
                </div>
            </header>
            {/* One tile per action in a single row on a desktop; on a phone they wrap two (or three) to a row
                so the labels can be read in full. The tiles' own borders draw the lattice; the extra right and
                bottom edges of the wrapped grid are pulled under the card's border. */}
            <div className="-mr-0.5 -mb-0.5 grid grid-cols-2 min-[480px]:grid-cols-3 md:mr-0 md:mb-0 md:grid-cols-[repeat(var(--tiles),minmax(0,1fr))]" style={{ "--tiles": actions.length } as CSSProperties}>
                {actions.map((a) => (
                    <AriaButton
                        key={a.key}
                        isDisabled={a.disabled}
                        onPress={a.onPress}
                        aria-label={`${a.name}: ${a.state.hint || a.state.label}`}
                        className={cx("grid min-w-0 content-center justify-items-center gap-1.5 border-r-2 border-b-2 border-secondary px-1.5 py-4 outline-focus-ring focus-visible:outline-2 focus-visible:-outline-offset-2 md:border-b-0 md:last:border-r-0", !a.disabled && "hover:bg-primary_hover", a.disabled && "cursor-default")}
                    >
                        <StatusIcon state={a.state} />
                        <span className="max-w-full text-center text-[11px] leading-tight font-semibold text-tertiary md:truncate md:text-[10px] md:leading-normal">{a.name}</span>
                    </AriaButton>
                ))}
            </div>
            {!released && !checkin && week.checkin_enabled !== false && week.checkin_release_at && <p className="border-t-2 border-secondary bg-secondary px-4 py-2 text-xs text-quaternary md:col-span-2">Your check-in opens {fmtDate(week.checkin_release_at, { time: true, weekday: true, dateStyle: "short" }, tz)}.</p>}
        </article>
    );
};
