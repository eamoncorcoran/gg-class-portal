// Choosing what to print. Pressing print on a question, or the printer above a list, does not print
// straight away: it ticks that question and asks whether there are more, so a set of questions goes
// to the printer as one job. This bar keeps the count and holds the Print button while that happens.
import { Button as AriaButton } from "react-aria-components";
import { D } from "@/lib/data";
import type { Question } from "@/lib/data";
import { getPick, pickAll, setScheme, stopPrinting, usePick } from "@/lib/pick";
import { printQuestions } from "./overlays";
import { toast } from "./toast";

export const PrintTray = () => {
    const printing = usePick((s) => s.printing);
    const n = usePick((s) => s.ids.length);
    const scheme = usePick((s) => s.scheme);
    const more = usePick((s) => s.scope.filter((id) => !s.ids.includes(id)).length);
    if (!printing) return null;
    const print = () => {
        const list = getPick().ids.map((id) => D().q[id]).filter(Boolean) as Question[];
        if (!list.length) return toast("Tick the questions you want to print first.");
        printQuestions(list, getPick().scheme, false);
        stopPrinting();
    };
    const quiet = "rounded-full px-3 py-1.5 text-sm font-semibold text-white/70 outline-focus-ring hover:bg-white/10 hover:text-white focus-visible:outline-2";
    return (
        <div
            role="region"
            aria-label="Printing"
            className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-1 rounded-3xl bg-primary-solid py-2 pr-2 pl-5 shadow-xl duration-300 animate-in slide-in-from-bottom-4 lg:bottom-4"
        >
            <p className="min-w-0 flex-1 text-sm font-semibold text-white" aria-live="polite">
                {n ? `${n} question${n === 1 ? "" : "s"} to print.` : "Printing."} <span className="font-normal text-white/70">{n ? "Tick any others you want." : "Tick the questions you want."}</span>
            </p>
            <label className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1.5 text-sm font-semibold text-white/80 select-none">
                <input type="checkbox" checked={scheme} onChange={(e) => setScheme(e.target.checked)} className="size-4 accent-brand-500" />
                Marking schemes
            </label>
            {more > 0 && (
                <AriaButton onPress={() => pickAll(getPick().scope)} className={quiet}>
                    Select all
                </AriaButton>
            )}
            <AriaButton onPress={stopPrinting} className={quiet}>
                Cancel
            </AriaButton>
            <AriaButton
                onPress={print}
                isDisabled={!n}
                className="rounded-full bg-brand-solid px-4 py-1.5 text-sm font-semibold text-white outline-focus-ring hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
                Print{n ? ` ${n}` : ""}
            </AriaButton>
        </div>
    );
};
