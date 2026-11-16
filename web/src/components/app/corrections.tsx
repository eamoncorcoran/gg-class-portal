// Corrections, made plain for a student: each sentence they wrote with the slips marked, and under
// it the sentence put right with the changes picked out. The text itself is the teacher's usual
// format: a quoted original line, then the corrected line with **the changes** in bold, pairs
// separated by blank lines. Anything that is not such a pair (a note, "No Irish corrections
// needed.") is shown as it is.
import { Fragment } from "react";
import { cx } from "@/utils/cx";

type Pair = { kind: "pair"; original: string; corrected: string };
type Note = { kind: "note"; text: string };
export type CorrectionItem = Pair | Note;

const unquote = (s: string) => s.trim().replace(/^["“”„]+/, "").replace(/["“”]+$/, "").trim();
const isQuoted = (s: string) => /^\s*["“„]/.test(s);

/** Split the teacher's corrections text into (original, corrected) pairs and loose notes. */
export const parseCorrections = (text: string): CorrectionItem[] => {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const out: CorrectionItem[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
            continue;
        }
        if (isQuoted(line) && i + 1 < lines.length && lines[i + 1].trim()) {
            out.push({ kind: "pair", original: unquote(line), corrected: lines[i + 1].trim() });
            i += 2;
            continue;
        }
        // a run of plain lines is one note
        const buf: string[] = [];
        while (i < lines.length && lines[i].trim() && !isQuoted(lines[i])) buf.push(lines[i].trim()), i++;
        if (buf.length) out.push({ kind: "note", text: buf.join("\n") });
        else i++;
    }
    return out;
};

type Tok = { text: string; bold: boolean };
/** Tokens of the corrected line, remembering which were inside **bold**. */
const tokensOf = (corrected: string): Tok[] => {
    const toks: Tok[] = [];
    let bold = false;
    for (const part of corrected.split(/(\*\*)/)) {
        if (part === "**") {
            bold = !bold;
            continue;
        }
        for (const w of part.split(/\s+/).filter(Boolean)) toks.push({ text: w, bold });
    }
    return toks;
};
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, "");

/** Which words of the original are not in the corrected line (the slips), by longest common subsequence. */
const slipsIn = (original: string[], corrected: string[]) => {
    const a = original.map(norm), b = corrected.map(norm);
    const n = a.length, m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const keep = new Set<number>();
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] && a[i] === b[j]) keep.add(i), i++, j++;
        else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
    }
    return original.map((_, k) => !keep.has(k));
};

const Line = ({ words, mark, tone }: { words: string[]; mark: boolean[]; tone: "slip" | "fix" }) => (
    <p className="text-md leading-8 text-primary">
        {words.map((w, k) => (
            <Fragment key={k}>
                {k > 0 && " "}
                {mark[k] ? (
                    <mark className={cx("rounded-md px-1 py-0.5 font-bold", tone === "slip" ? "bg-error-primary text-error-primary line-through decoration-2" : "bg-success-primary text-success-primary")}>{w}</mark>
                ) : (
                    w
                )}
            </Fragment>
        ))}
    </p>
);

/** One correction: what was written, with the slips struck through, then the right sentence. */
const PairCard = ({ p, n, compact }: { p: Pair; n: number; compact?: boolean }) => {
    const fixed = tokensOf(p.corrected);
    const original = p.original.split(/\s+/).filter(Boolean);
    const slips = slipsIn(original, fixed.map((t) => t.text));
    const boldMarks = fixed.map((t) => t.bold);
    const same = !slips.some(Boolean) && !boldMarks.some(Boolean);
    return (
        <li className={cx("rounded-2xl border-2 border-secondary bg-primary", compact ? "p-3" : "p-4 md:p-5")}>
            <div className="flex items-start gap-3">
                <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-tertiary tabular-nums">{n}</span>
                <div className="min-w-0 flex-1">
                    <p className="duo-label text-quaternary">You wrote</p>
                    <Line words={original} mark={slips} tone="slip" />
                    <p className="mt-2 duo-label text-success-primary">{same ? "Fine as it is" : "Corrected"}</p>
                    <Line words={fixed.map((t) => t.text)} mark={boldMarks} tone="fix" />
                </div>
            </div>
        </li>
    );
};

/** The whole corrections block for a student (or the teacher's preview of it). */
export const Corrections = ({ text, compact }: { text: string; compact?: boolean }) => {
    const items = parseCorrections(text);
    if (!items.length) return null;
    let n = 0;
    return (
        <ul className={cx("flex flex-col", compact ? "gap-2" : "gap-3")}>
            {items.map((it, i) =>
                it.kind === "pair" ? (
                    <PairCard key={i} p={it} n={++n} compact={compact} />
                ) : (
                    <li key={i} className={cx("rounded-2xl bg-secondary px-4 py-3 text-md leading-7 whitespace-pre-wrap text-secondary", compact && "text-sm leading-6")}>
                        {it.text.replace(/\*\*/g, "")}
                    </li>
                ),
            )}
        </ul>
    );
};
