// While an exam is being put together (after "Create exam"), or questions are waiting for one, a bar
// floats at the foot of the screen, so nobody has to scroll back up: how many are in, Cancel (or
// Empty), and Next, which names the exam and then prints it, saves it or shares it with a class.
import { useState } from "react";
import { useLocation } from "react-router";
import { Button as AriaButton } from "react-aria-components";
import { ArrowRight } from "@/components/app/ic";
import { setBuilding, usePick } from "@/lib/pick";
import { get, set, useStore } from "@/lib/store";
import { FinishExamDialog } from "./exam-finish";
import { toast } from "./toast";

export const ExamTray = () => {
    const n = useStore((s) => s.exam.length);
    const running = useStore((s) => !!s.examRun);
    const building = usePick((s) => s.building);
    const [open, setOpen] = useState(false);
    const { pathname } = useLocation();
    const dialog = open && <FinishExamDialog onClose={() => setOpen(false)} />;
    if ((!n && !building) || running || pathname.startsWith("/exam")) return dialog || null;

    const cancel = () => {
        const was = get().exam;
        const wasBuilding = building;
        set("exam", []);
        setBuilding(false);
        if (was.length) toast(wasBuilding ? "Exam cancelled" : "Exam emptied", () => (set("exam", was), setBuilding(wasBuilding)));
    };

    return (
        <>
            <div
                role="region"
                aria-label="Your exam"
                className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center gap-2 rounded-full bg-primary-solid py-1.5 pr-1.5 pl-5 shadow-xl duration-300 animate-in slide-in-from-bottom-4 lg:right-auto lg:bottom-4 lg:left-1/2 lg:w-md lg:-translate-x-1/2"
            >
                <p className="flex-1 truncate text-sm font-semibold text-white tabular-nums" aria-live="polite">
                    {/* shorter on a phone, where Cancel and Next leave little room */}
                    {n ? (
                        <>
                            {n} question{n === 1 ? "" : "s"}
                            <span className="max-sm:hidden"> in your exam</span>
                        </>
                    ) : (
                        <>
                            <span className="sm:hidden">Pick your questions</span>
                            <span className="max-sm:hidden">Press Add to exam on each question</span>
                        </>
                    )}
                </p>
                <AriaButton
                    onPress={cancel}
                    className="rounded-full px-3 py-2 text-sm font-semibold text-white/70 outline-focus-ring hover:bg-white/10 hover:text-white focus-visible:outline-2"
                >
                    {building ? "Cancel" : "Empty"}
                </AriaButton>
                <AriaButton
                    isDisabled={!n}
                    onPress={() => setOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-solid px-5 py-2 text-sm font-bold text-white outline-focus-ring hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Next
                    <ArrowRight aria-hidden="true" className="size-4" />
                </AriaButton>
            </div>
            {dialog}
        </>
    );
};
