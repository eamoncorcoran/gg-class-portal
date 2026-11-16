// Answer spaces for a question whose paper is not typed on directly (every subject but Irish): one
// row per markable part from keys.json, under the paper image. Short and gap answers are typed,
// numbers get a narrow box, true/false and multiple choice are picked from chips.
import { Button as AriaButton } from "react-aria-components";
import { type KeyPart, type Question, shortParts } from "@/lib/data";
import { type Check as CheckT, type Verdict, setAnswer, useStore } from "@/lib/store";
import { cx } from "@/utils/cx";

const FILL: Record<Verdict, string> = {
    correct: "border-success bg-utility-success-50/70",
    partial: "border-warning bg-utility-warning-50/80",
    wrong: "border-error bg-utility-error-50/70",
    blank: "",
};

const Chips = ({ part, value, onPick, fill }: { part: KeyPart; value: string; onPick: (v: string) => void; fill?: string }) => {
    const options = part.kind === "tf" ? ["True", "False"] : (part.options ?? []).length ? part.options! : ["A", "B", "C", "D"];
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((o) => {
                const on = value.trim().toLowerCase() === o.trim().toLowerCase() || (part.kind === "mcq" && value.trim().toLowerCase() === o.trim().charAt(0).toLowerCase() && o.length > 1 && /^[A-D][).:]/.test(o));
                return (
                    <AriaButton
                        key={o}
                        onPress={() => onPick(on ? "" : o)}
                        aria-pressed={on}
                        className={cx(
                            "rounded-xl border-2 px-3 py-1.5 text-left text-sm font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2",
                            on ? cx("border-brand bg-brand-primary text-brand-secondary", fill) : "border-secondary text-secondary hover:bg-primary_hover",
                        )}
                    >
                        {o}
                    </AriaButton>
                );
            })}
        </div>
    );
};

export const AnswerParts = ({ q, check }: { q: Question; check?: CheckT }) => {
    const answers = useStore((s) => s.answers[q.id]);
    const parts = shortParts(q.id);
    if (!parts.length) return null;
    return (
        <ol className="mt-4 flex flex-col gap-3" aria-label="Your answers">
            {parts.map((p) => {
                const r = check?.by[p.id];
                const v = answers?.[p.id] || "";
                return (
                    <li key={p.id} className={cx("rounded-2xl border-2 border-secondary bg-primary p-4 transition-colors duration-150", r && FILL[r.verdict])}>
                        <div className="mb-2 flex items-baseline gap-3">
                            <span className="duo-label text-brand-secondary">{p.id}</span>
                            <span className="min-w-0 flex-1 text-sm text-secondary">{p.question}</span>
                            {p.marks > 0 && <span className="shrink-0 text-xs font-bold text-quaternary tabular-nums">{p.marks} mark{p.marks === 1 ? "" : "s"}</span>}
                        </div>
                        {p.kind === "mcq" || p.kind === "tf" ? (
                            <Chips part={p} value={v} onPick={(x) => setAnswer(q.id, p.id, x)} />
                        ) : (
                            <input
                                type="text"
                                inputMode={p.kind === "numeric" ? "decimal" : "text"}
                                value={v}
                                onChange={(e) => setAnswer(q.id, p.id, e.target.value)}
                                aria-label={`Answer to ${p.id}`}
                                placeholder={p.kind === "numeric" ? "Number and unit" : "Type your answer"}
                                className={cx(
                                    "h-11 rounded-xl border-2 border-secondary bg-primary px-3 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder focus:border-brand",
                                    p.kind === "numeric" ? "w-48 max-w-full" : "w-full",
                                )}
                            />
                        )}
                        {r && r.verdict !== "correct" && r.expected && (
                            <p className="mt-2 text-sm text-tertiary">
                                <span className="font-semibold text-primary">Marking scheme: </span>
                                {r.expected}
                                {r.feedback ? ` ${r.feedback}` : ""}
                            </p>
                        )}
                    </li>
                );
            })}
        </ol>
    );
};
