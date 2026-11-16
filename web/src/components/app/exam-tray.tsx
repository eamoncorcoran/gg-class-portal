// While you're collecting questions for an exam, a small bar keeps count and takes you to it.
import { Link, useLocation } from "react-router";
import { Button as AriaButton } from "react-aria-components";
import { toast } from "./toast";
import { get, set, useStore } from "@/lib/store";

export const ExamTray = () => {
    const n = useStore((s) => s.exam.length);
    const running = useStore((s) => !!s.examRun);
    const { pathname } = useLocation();
    if (!n || running || pathname.startsWith("/exam")) return null;
    return (
        <div
            role="region"
            aria-label="Your exam"
            className="fixed inset-x-4 bottom-20 z-30 lg:bottom-4 mx-auto flex max-w-sm items-center gap-2 rounded-full bg-primary-solid py-1.5 pr-1.5 pl-5 shadow-xl duration-300 animate-in slide-in-from-bottom-4 lg:right-auto lg:left-1/2 lg:-translate-x-1/2"
        >
            <p className="flex-1 truncate text-sm font-semibold text-white tabular-nums">
                Exam: {n} question{n === 1 ? "" : "s"}
            </p>
            <AriaButton
                onPress={() => {
                    const was = get().exam;
                    set("exam", []);
                    toast("Exam emptied", () => set("exam", was));
                }}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-white/70 outline-focus-ring hover:bg-white/10 hover:text-white focus-visible:outline-2"
            >
                Empty
            </AriaButton>
            <Link to="/exam/new?from=picked" className="rounded-full bg-brand-solid px-4 py-1.5 text-sm font-semibold text-white outline-focus-ring hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2">
                Make an exam
            </Link>
        </div>
    );
};
