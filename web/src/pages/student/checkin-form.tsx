// The weekly check-in: six questions one at a time (choice, 1 to 10 scale, free text), the draft
// saved on every answer, Submit on the last. Ported from openCheckinForm / renderCheckinStep /
// saveCheckinDraft / submitCheckin in the old app.js.
import { useEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { toast } from "@/components/app/toast";
import { api } from "@/lib/portal";
import { type Checkin, type CheckinAnswers, type Week, fmtWeek } from "@/lib/student";
import { cx } from "@/utils/cx";

type Q = { key: keyof CheckinAnswers; text: string; description?: string; type: "choice" | "scale" | "text"; required: boolean; options?: string[] };
export const CHECKIN_QUESTIONS: Q[] = [
    { key: "attendance", text: "Did you attend or watch this week's class?", type: "choice", required: true, options: ["I attended live", "I watched the recording", "Not yet"] },
    { key: "reviewed", text: "Did you review this week's material?", type: "choice", required: true, options: ["Yes", "No"] },
    { key: "understanding", text: "How well do you understand this week’s material?", type: "scale", required: true },
    { key: "confidence", text: "How confident are you feeling right now?", type: "scale", required: true },
    { key: "weeklyWin", text: "What's your weekly win?", description: "Anything big or small to do with Irish.", type: "text", required: true },
    { key: "support", text: "Is there anything you are struggling with or need help with?", type: "text", required: false },
];

/** The thin bar across the top of a rolling form: how far through the questions you are. */
export const StepProgress = ({ value }: { value: number }) => (
    <div className="-mx-7 -mt-6 mb-6 h-1.5 overflow-hidden bg-secondary" aria-hidden="true">
        <div className="h-full bg-brand-500 transition-[width] duration-200" style={{ width: `${value}%` }} />
    </div>
);

export const ErrorBanner = ({ children }: { children: string }) => <div className="mt-3 rounded-xl border-2 border-error-200 bg-error-primary px-4 py-2.5 text-sm font-semibold text-error-primary">{children}</div>;

/** The strip under a rolling form: Back on the left, the autosave note, the main button on the right. */
export const StepFooter = ({ left, note = "Drafts save automatically", right }: { left: React.ReactNode; note?: string; right: React.ReactNode }) => (
    <div className="-mx-7 -mb-7 mt-6 flex flex-col gap-3 rounded-b-3xl border-t-2 border-secondary bg-secondary px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">{left}</div>
        <span className="text-xs text-quaternary">{note}</span>
        <div className="flex flex-wrap justify-end gap-2">{right}</div>
    </div>
);

export const CheckinForm = ({ week, existing, onClose, onSubmitted }: { week: Week; existing: Checkin | undefined; onClose: () => void; onSubmitted: () => Promise<void> | void }) => {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<CheckinAnswers>({ ...(existing?.answers || {}) });
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const latest = useRef(answers);
    latest.current = answers;
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const question = CHECKIN_QUESTIONS[step];
    const answer = answers[question.key];
    const last = step === CHECKIN_QUESTIONS.length - 1;

    const saveDraft = async (next: CheckinAnswers = latest.current) => {
        try {
            await api(`/api/student/checkins/${week.id}/draft`, { method: "PUT", json: { answers: next } });
        } catch (e) {
            console.error(e);
        }
    };
    const set = (value: string | number) => {
        const next = { ...latest.current, [question.key]: value };
        setAnswers(next);
        setError("");
        return next;
    };
    const choose = (value: string | number) => {
        const next = set(value);
        saveDraft(next);
    };
    const typed = (value: string) => {
        set(value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => saveDraft(), 500);
    };
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    const trimmed = (): CheckinAnswers => {
        const cur = latest.current;
        if (question.type !== "text") return cur;
        const v = String(cur[question.key] ?? "").trim();
        const next = { ...cur, [question.key]: v };
        setAnswers(next);
        return next;
    };

    const back = () => {
        trimmed();
        setError("");
        if (step > 0) setStep(step - 1);
    };
    const next = async () => {
        const cur = trimmed();
        if (question.required && !String(cur[question.key] ?? "").trim()) return setError("Please answer this question.");
        if (timer.current) clearTimeout(timer.current);
        await saveDraft(cur);
        if (!last) return setStep(step + 1);
        /* Pressing Submit used to do nothing visible for as long as two requests took. The button
           says what is happening straight away; the celebration replaces the form when it is in. */
        setSending(true);
        try {
            await api(`/api/student/checkins/${week.id}/submit`, { method: "POST", json: { answers: cur } });
        } catch (e) {
            setSending(false);
            return toast((e as Error).message);
        }
        await onSubmitted();
    };

    return (
        <DuoDialog open onClose={onClose} title="Weekly check-in" sub={`Week of ${fmtWeek(week.week_start)}`} className="max-w-3xl">
            <StepProgress value={((step + 1) / CHECKIN_QUESTIONS.length) * 100} />
            <div className="min-h-[300px]">
                <p className="duo-label text-brand-secondary">
                    Question {step + 1} of {CHECKIN_QUESTIONS.length}
                </p>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-primary md:text-2xl">{question.text}</h3>
                <p className="mt-1.5 mb-5 text-xs text-quaternary">{question.description ?? (question.required ? "Required" : "Optional")}</p>
                {question.type === "choice" && (
                    <div className="grid gap-2.5">
                        {question.options!.map((opt) => (
                            <AriaButton
                                key={opt}
                                onPress={() => choose(opt)}
                                aria-pressed={answer === opt}
                                className={cx(
                                    "rounded-2xl border-2 px-4 py-3.5 text-left text-md font-semibold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                                    answer === opt ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary bg-primary text-secondary hover:border-brand-300 hover:bg-primary_hover",
                                )}
                            >
                                {opt}
                            </AriaButton>
                        ))}
                    </div>
                )}
                {question.type === "scale" && (
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="group" aria-label="1 to 10">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                            <AriaButton
                                key={v}
                                onPress={() => choose(v)}
                                aria-pressed={answer === v}
                                className={cx(
                                    "h-11 rounded-xl border-2 text-md font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                                    answer === v ? "border-brand bg-brand-500 text-white" : "border-secondary bg-primary text-secondary hover:border-brand-300 hover:bg-primary_hover",
                                )}
                            >
                                {v}
                            </AriaButton>
                        ))}
                    </div>
                )}
                {question.type === "text" && (
                    <textarea
                        aria-label={question.text}
                        value={String(answer ?? "")}
                        onChange={(e) => typed(e.target.value)}
                        placeholder={question.required ? "Type your answer" : "Optional"}
                        rows={6}
                        className="min-h-[155px] w-full resize-y rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden placeholder:text-placeholder/80 focus:border-brand"
                    />
                )}
                {error && <ErrorBanner>{error}</ErrorBanner>}
            </div>
            <StepFooter
                left={
                    <DuoButton color="secondary" size="sm" onPress={back} isDisabled={step === 0 || sending}>
                        Back
                    </DuoButton>
                }
                right={
                    <DuoButton size="sm" onPress={next} isDisabled={sending}>
                        {sending ? "Sending…" : last ? "Submit Check-in" : "Save and Continue"}
                    </DuoButton>
                }
            />
        </DuoDialog>
    );
};
