// /teach/:section/:id? — picks the section component. Each section lives in its own file in this
// folder; the Console shell draws the nav around it.
import { lazy, Suspense } from "react";
import { Navigate, useParams } from "react-router";
import { Console } from "@/components/app/console";
import { Page } from "@/components/app/page-parts";
import { DuoButton } from "@/components/app/duo";
import { useAdminBootstrap, useMe } from "@/lib/portal";

const sections: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
    tracker: lazy(() => import("./tracker-section").then((m) => ({ default: m.TrackerSection }))),
    people: lazy(() => import("./people-section").then((m) => ({ default: m.PeopleSection }))),
    calendar: lazy(() => import("./calendar-section").then((m) => ({ default: m.CalendarSection }))),
    courses: lazy(() => import("./courses-section").then((m) => ({ default: m.CoursesSection }))),
    sraith: lazy(() => import("./sraith-section").then((m) => ({ default: m.SraithSection }))),
    "mock-orals": lazy(() => import("./mock-orals-section").then((m) => ({ default: m.MockOralsSection }))),
    live: lazy(() => import("./live-section").then((m) => ({ default: m.LiveSection }))),
    plans: lazy(() => import("./plans-section").then((m) => ({ default: m.PlansSection }))),
    checkins: lazy(() => import("./checkins-section").then((m) => ({ default: m.CheckinsSection }))),
    community: lazy(() => import("./community-section").then((m) => ({ default: m.CommunitySection }))),
    attendance: lazy(() => import("./attendance-section").then((m) => ({ default: m.AttendanceSection }))),
    reminders: lazy(() => import("./reminders-section").then((m) => ({ default: m.RemindersSection }))),
    drafting: lazy(() => import("./drafting-section").then((m) => ({ default: m.DraftingSection }))),
    admins: lazy(() => import("./admins-section").then((m) => ({ default: m.AdminsSection }))),
};

export const ConsolePage = () => {
    const me = useMe();
    const boot = useAdminBootstrap();
    const { section } = useParams();
    if (me === undefined) return <Page>{null}</Page>;
    if (!me) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
    if (me.role !== "admin")
        return (
            <Page>
                <h1 className="text-display-xs font-bold text-primary">Teachers only</h1>
                <p className="mt-2 text-md text-tertiary">This part of the hub is for the teaching team.</p>
                <DuoButton className="mt-6" href="/">Back home</DuoButton>
            </Page>
        );
    if (!section) {
        if (!boot) return <Page>{null}</Page>;
        return <Navigate to={boot.classes[0] ? `/teach/tracker/${boot.classes[0].id}` : "/teach/people"} replace />;
    }
    const S = sections[section];
    /* The live console is used while teaching, so it gets the whole width: no section nav around it. */
    if (section === "live")
        return (
            <Suspense fallback={<p className="p-4 text-sm text-quaternary">Loading…</p>}>
                <S />
            </Suspense>
        );
    return (
        <Console>
            {S ? (
                <Suspense fallback={<p className="text-sm text-quaternary">Loading…</p>}>
                    <S />
                </Suspense>
            ) : (
                <p className="text-md text-tertiary">There is no such section.</p>
            )}
        </Console>
    );
};
