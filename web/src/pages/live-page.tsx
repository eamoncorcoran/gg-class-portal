// Live classroom for a student: the class plays here, with each phrase to practise as it comes up and
// a private line to the teacher. The room itself is the hub's /live/room.html, framed once for the
// whole session (see live-room.tsx). Teachers run the class from the console instead.
import { Navigate } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { NextClassBanner, useNow } from "@/components/app/hub-parts";
import { LiveSlot } from "@/components/app/live-room";
import { Page, PageHeader } from "@/components/app/page-parts";
import { useHub } from "@/lib/hub";
import { useMe, useStudentBootstrap } from "@/lib/portal";
import { SignInCard } from "@/pages/student/password-pages";

export const LivePage = () => {
    const me = useMe();
    const boot = useStudentBootstrap();
    const hub = useHub();
    const now = useNow();
    if (me === undefined) return <Page>{null}</Page>;
    if (!me) return <SignInCard next="/live" title="Sign in for the live class" />;
    if (me.role === "admin") return <Navigate to="/teach/live" replace />;
    if (!boot) return <Page>{null}</Page>;
    const label = (boot.class?.label as string | undefined) || hub?.klass.name;
    return (
        <Page wide>
            <PageHeader kicker={label} title="Live class" sub="Your class plays here, with each phrase to practise as it comes up." />
            {boot.liveClassroom ? (
                <LiveSlot />
            ) : (
                <div className="flex flex-col gap-6">
                    {hub && <NextClassBanner hub={hub} now={now} compact />}
                    <section className="rounded-2xl border-2 border-secondary bg-primary p-6">
                        <p className="text-md text-secondary">The class runs on Zoom. Open the class link from the calendar on Home, or here when the teacher has set one.</p>
                        {hub?.klass.joinUrl && (
                            <DuoButton className="mt-4" href={hub.klass.joinUrl}>
                                Open the class in Zoom
                            </DuoButton>
                        )}
                    </section>
                </div>
            )}
        </Page>
    );
};
