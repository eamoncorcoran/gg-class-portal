// The teacher console's own shell: a second, narrower nav (the class trackers, then Manage) beside the
// section being worked on. Native to this app; nothing is framed.
import { type FC, type ReactNode } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { Page } from "@/components/app/page-parts";
import { Users01, Calendar, BookOpen01, Grid01, Headphones01, PlayCircle, LayersTwo01, Smile, FileCheck02, UploadCloud02, Bell01, Mail01, Stars02, Settings01 } from "@/components/app/ic";
import { useUnreadMessages } from "@/lib/messages";
import { type AdminClass, classSlot, useAdminBootstrap, useMe } from "@/lib/portal";
import { cx } from "@/utils/cx";

type Icon = FC<{ className?: string }>;
export type ConsoleSection = { id: string; label: string; icon: Icon; superOnly?: boolean };
export const CONSOLE_SECTIONS: ConsoleSection[] = [
    // Between a student and their teacher: the lead teacher's account only, as the server enforces.
    { id: "messages", label: "Private messages", icon: Mail01, superOnly: true },
    { id: "people", label: "Classes & students", icon: Users01 },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "courses", label: "Courses", icon: BookOpen01 },
    { id: "sraith", label: "Sraith Pictiúr", icon: Grid01 },
    { id: "mock-orals", label: "Mock orals", icon: Headphones01 },
    { id: "live", label: "Live classroom", icon: PlayCircle },
    { id: "plans", label: "Plans", icon: LayersTwo01 },
    { id: "checkins", label: "Weekly check-ins", icon: Smile },
    { id: "community", label: "Community", icon: FileCheck02 },
    { id: "attendance", label: "Attendance upload", icon: UploadCloud02 },
    { id: "reminders", label: "Email reminders", icon: Bell01 },
    { id: "drafting", label: "Feedback drafting", icon: Stars02 },
    { id: "admins", label: "Administrators", icon: Settings01, superOnly: true },
];

const Row = ({ to, icon: I, label, sub, active, badge }: { to: string; icon: Icon; label: ReactNode; sub?: ReactNode; active?: boolean; badge?: number }) => (
    <NavLink
        to={to}
        className={({ isActive }) =>
            cx(
                "flex shrink-0 items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm font-bold whitespace-nowrap transition duration-100 ease-linear outline-focus-ring focus-visible:outline-2 xl:shrink xl:whitespace-normal",
                (active ?? isActive) ? "border-brand bg-brand-primary text-brand-secondary" : "border-transparent text-secondary hover:bg-primary_hover",
            )
        }
    >
        <I aria-hidden="true" className="size-5 shrink-0" />
        <span className="min-w-0">
            <span className="block truncate">{label}</span>
            {sub && <span className="block truncate text-xs font-semibold text-quaternary">{sub}</span>}
        </span>
        {badge ? <span className="ml-auto shrink-0 rounded-full bg-brand-solid px-2 py-0.5 text-xs text-white tabular-nums">{badge}</span> : null}
    </NavLink>
);

/** The console frame: sub-nav on the left (a scrolling pill row on phones) and the section on the right. */
export const Console = ({ children }: { children: ReactNode }) => {
    const boot = useAdminBootstrap();
    const me = useMe();
    const { section, id } = useParams();
    const nav = useNavigate();
    // On-demand classes (Hibernia) have no tracker: no weeks, check-ins or homework.
    const classes: AdminClass[] = (boot?.classes ?? []).filter((k) => k.course_type !== "hibernia");
    const sections = CONSOLE_SECTIONS.filter((s) => !s.superOnly || me?.isSuperAdmin);
    const unread = useUnreadMessages();
    return (
        <Page wide>
            <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:gap-10">
                <aside className="min-w-0 max-w-full xl:w-64 xl:shrink-0">
                    {/* on a phone the sections are a picker, not a strip that hides most of itself */}
                    <label className="block md:hidden">
                        <span className="sr-only">Console section</span>
                        <select
                            value={section === "tracker" && id ? `tracker:${id}` : (section ?? "")}
                            onChange={(e) => {
                                const v = e.target.value;
                                nav(v.startsWith("tracker:") ? `/teach/tracker/${v.slice(8)}` : `/teach/${v}`);
                            }}
                            className="w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-bold text-primary outline-hidden focus:border-brand"
                        >
                            {classes.map((k) => (
                                <option key={k.id} value={`tracker:${k.id}`}>
                                    Tracker: {k.programme_name}
                                </option>
                            ))}
                            {sections.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.label}
                                    {s.id === "messages" && unread ? ` (${unread} new)` : ""}
                                </option>
                            ))}
                        </select>
                    </label>
                    <nav aria-label="Teacher console" className="hidden w-full max-w-full gap-1 overflow-x-auto pb-2 scrollbar-hide md:flex xl:sticky xl:top-24 xl:flex-col xl:overflow-visible xl:pb-0">
                        {classes.length > 0 && <p className="hidden duo-label text-quaternary xl:block xl:px-3 xl:pb-2">Class trackers</p>}
                        {classes.map((k) => (
                            <Row key={k.id} to={`/teach/tracker/${k.id}`} icon={Grid01} label={k.programme_name} sub={classSlot(k)} active={section === "tracker" && id === k.id} />
                        ))}
                        <p className="hidden duo-label text-quaternary xl:block xl:px-3 xl:pt-5 xl:pb-2">Manage</p>
                        {sections.map((s) => (
                            <Row key={s.id} to={`/teach/${s.id}`} icon={s.icon} label={s.label} active={section === s.id} badge={s.id === "messages" ? unread : 0} />
                        ))}
                    </nav>
                </aside>
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </Page>
    );
};

/** The heading at the top of a console section. */
export const SectionHead = ({ title, sub, actions, children }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) => (
    <header className="mb-8 flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
            <h1 className="text-display-xs font-bold tracking-tight text-primary">{title}</h1>
            {sub && <p className="mt-2 max-w-2xl text-md text-tertiary">{sub}</p>}
            {children}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
);
