// Pick out the facts worth remembering in a run of text (marks, minutes, percentages, paper and
// question numbers, how often a recording plays, word counts) with a soft highlight.
import { Fragment } from "react";
import { cx } from "@/utils/cx";

const KEY =
    /(\b\d+(?:\s*(?:to|or|nó)\s*\d+)?\s*(?:marks?|mharc|marc|minutes?|min|nóiméad|words?|focal|%)|\ba quarter of the written exam|\bPaper [12]\b|\bPáipéar [12]\b|\bCeist \d[AB]?\b|\bCuid [ABC]\b|\b(?:once|twice|three times|two halves|in Irish|one piece|one of two texts|printed on the paper|faoi dhó|trí huaire)\b)/g;

export const hi = (t: string, tone: "green" | "yellow" = "green") =>
    t.split(KEY).map((part, i) =>
        i % 2 ? (
            <mark key={i} className={cx("rounded-md px-1 py-0.5 font-semibold", tone === "yellow" ? "bg-yellow-100 text-yellow-900" : "bg-brand-primary text-brand-secondary")}>
                {part}
            </mark>
        ) : (
            <Fragment key={i}>{part}</Fragment>
        ),
    );
