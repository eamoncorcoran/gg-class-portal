// Homework that was set from past exam questions. It is an assignment like any other (on the
// calendar, in the reminders, in the teacher's review), but it is done here, on the paper itself:
// the answers are typed into the paper's own spaces, marked when it is finished, and handed in to
// the portal as the student's homework.
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { Page } from "@/components/app/page-parts";
import { QuestionCard, checkQuestion } from "@/components/app/question-card";
import { toast } from "@/components/app/toast";
import { type Question, D, answerKeys, checkable, label } from "@/lib/data";
import { api } from "@/lib/portal";
import { dueLabel } from "@/lib/pq-homework";
import { type Result, get, set, setAnswer, useStore } from "@/lib/store";
import type { AssignmentDetail, Homework } from "@/lib/student";
import { useLoadedFor } from "@/lib/use-loaded";
import { cx } from "@/utils/cx";

type PqResult = { answers: Record<string, Record<string, string>>; results: Record<string, Result[]>; got: number; total: number };
type Loaded = { assignment: AssignmentDetail; submission: (Homework & { pq_result?: PqResult | null }) | null };

/* A question with no answer spaces on the paper (a composition, a poetry question) is answered in
   one box under it, kept with the paper's answers under this key. */
const WRITTEN = "written";
const answered = (q: Question, mine: Record<string, string>) => (checkable(q) ? Object.entries(mine).some(([k, v]) => k !== WRITTEN && v.trim()) : Boolean((mine[WRITTEN] || "").trim()));

/** What was typed, space by space, as text: this is what the teacher reads in the review and what feedback is written on. */
const transcript = (q: Question, mine: Record<string, string>, by: Record<string, Result>) => {
    if (!checkable(q)) return (mine[WRITTEN] || "").trim();
    const lines: string[] = [];
    let section = "";
    for (const [key, number, question, part] of answerKeys(q)) {
        if (part && part !== section) lines.push("", part);
        section = part;
        const r = by[key];
        const mark = r ? ` [${r.awarded}/${r.max}]` : "";
        lines.push(`${number}${question ? ` ${question}` : ""}`.trim(), `  ${(mine[key] || "").trim() || "(no answer)"}${mark}`);
    }
    const all = Object.values(by);
    const got = all.reduce((n, r) => n + (r.awarded || 0), 0), total = all.reduce((n, r) => n + (r.max || 0), 0);
    return [`Marked on the paper: ${got} of ${total}`, ...lines].join("\n").trim().slice(0, 19000);
};

export const PqHomeworkPage = () => {
    const { id = "" } = useParams();
    const [data, setData] = useState<Loaded | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const answers = useStore((s) => s.answers);

    const load = useCallback(
        () =>
            api<Loaded>(`/api/student/assignments/${id}`)
                .then((d) => (setData(d), d))
                .catch((e) => (setErr((e as Error).message), null)),
        [id],
    );
    useEffect(() => {
        load();
    }, [load]);

    const ids: string[] = data?.assignment.pq_ids ?? [];
    useLoadedFor(ids);
    const qs = ids.map((qid) => D().q[qid]).filter(Boolean) as Question[];
    const sub = data?.submission;
    const handedIn = sub?.status === "submitted" || sub?.status === "returned";

    /* Handed in from another phone or laptop, this browser has none of it. What was handed in is put
       back on the paper so the student sees their own answers and marks wherever they open it. */
    useEffect(() => {
        const kept = handedIn ? sub?.pq_result : null;
        if (!kept) return;
        const a = { ...get().answers }, c = { ...get().checks };
        for (const qid of Object.keys(kept.answers || {})) a[qid] = kept.answers[qid];
        for (const qid of Object.keys(kept.results || {})) if (kept.results[qid]?.length) c[qid] = { by: Object.fromEntries(kept.results[qid].map((r) => [r.key, r])), at: Date.now() };
        set("answers", a);
        set("checks", c);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handedIn, sub?.id]);

    const handIn = async () => {
        if (busy || !data) return;
        const missing = qs.find((q) => !answered(q, get().answers[q.id] || {}));
        if (missing) {
            document.getElementById(`q-${missing.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            return toast(`Answer "${label(missing)}" before you hand in.`);
        }
        setBusy(true);
        const failed = (await Promise.all(qs.filter(checkable).map((q) => checkQuestion(q.id)))).find(Boolean);
        if (failed) {
            setBusy(false);
            return toast(`Not handed in yet. ${failed}`);
        }
        const mine = get().answers, checks = get().checks;
        const clean = (r: Result): Result => ({ key: String(r.key), verdict: r.verdict, awarded: Number(r.awarded) || 0, max: Number(r.max) || 0, expected: String(r.expected ?? "").slice(0, 4000), feedback: String(r.feedback ?? "").slice(0, 4000) });
        const results = Object.fromEntries(qs.map((q) => [q.id, checkable(q) ? Object.values(checks[q.id]?.by || {}).map(clean) : []]));
        const all = Object.values(results).flat();
        const pqResult: PqResult = {
            answers: Object.fromEntries(qs.map((q) => [q.id, mine[q.id] || {}])),
            results,
            got: all.reduce((n, r) => n + r.awarded, 0),
            total: all.reduce((n, r) => n + r.max, 0),
        };
        try {
            await api(`/api/student/assignments/${id}/submit`, {
                method: "POST",
                json: { answers: qs.map((q) => transcript(q, mine[q.id] || {}, checks[q.id]?.by || {})), pqResult },
            });
            await load();
            window.scrollTo({ top: 0, behavior: "smooth" });
            toast("Handed in. Maith thú!");
        } catch (e) {
            toast(`Not handed in. ${(e as Error).message}`);
        }
        setBusy(false);
    };

    if (err)
        return (
            <Page>
                <div className="rounded-2xl border-2 border-secondary bg-primary p-6">
                    <p className="text-lg font-bold text-primary">This homework could not be opened</p>
                    <p className="mt-1 text-md text-tertiary">{err}</p>
                    <div className="mt-4">
                        <DuoButton size="sm" color="secondary" href="/tracker">
                            Back to homework
                        </DuoButton>
                    </div>
                </div>
            </Page>
        );
    if (!data) return <Page><p className="py-16 text-center text-sm text-tertiary">Loading…</p></Page>;

    const a = data.assignment;
    const due = dueLabel(a.reopened_until || a.deadline_at);
    // An ordinary assignment opened at this address belongs in the tracker's own form.
    if (!ids.length) return <Navigate to={`/tracker?open=homework:${a.id}`} replace />;
    const closed = !a.open && !handedIn;
    const got = sub?.pq_result?.got ?? 0, total = sub?.pq_result?.total ?? 0;

    return (
        <Page>
            <div className={cx("sticky top-20 z-10 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 px-5 py-3 shadow-lg", handedIn ? "border-brand bg-brand-primary" : "border-secondary bg-primary")}>
                <div className="min-w-0 flex-1">
                    <p className="duo-label text-brand-secondary">{handedIn ? (sub?.status === "returned" ? "Homework · feedback returned" : "Homework · handed in") : "Homework"}</p>
                    <p className="truncate text-md font-bold text-primary">{a.title}</p>
                    <p className="text-sm text-tertiary">
                        {handedIn ? (total ? `${got} of ${total} marks on the paper. Your teacher will look at it too.` : "Your teacher will look at it.") : closed ? `This closed ${due}.` : `Due ${due} Irish time · ${qs.length} question${qs.length === 1 ? "" : "s"}`}
                    </p>
                </div>
                {handedIn || closed ? (
                    <DuoButton size="sm" color="secondary" href="/tracker">
                        Back to homework
                    </DuoButton>
                ) : (
                    <DuoButton size="sm" isLoading={busy} onPress={handIn}>
                        {busy ? "Marking" : "Finish and hand in"}
                    </DuoButton>
                )}
            </div>

            {!handedIn && !closed && a.instructions?.trim() && <p className="mb-6 rounded-2xl border-2 border-secondary bg-secondary_subtle px-5 py-4 text-md whitespace-pre-line text-secondary">{a.instructions}</p>}
            {closed && (
                <p className="mb-6 rounded-2xl border-2 border-secondary bg-primary px-5 py-4 text-md text-secondary">
                    This homework has closed, so it can no longer be handed in. <Link to="/tracker" className="font-bold text-brand-secondary underline">Back to homework</Link>
                </p>
            )}

            {!closed &&
                qs.map((q) => (
                    <div key={q.id}>
                        {/* Marked only at the end: while it is being done the paper shows no marks and no scheme. */}
                        <QuestionCard q={q} exam={{ running: !handedIn }} />
                        {!checkable(q) && (
                            <div className="-mt-2 mb-6 rounded-2xl border-2 border-secondary bg-primary p-4 sm:p-6">
                                <label htmlFor={`w-${q.id}`} className="duo-label text-quaternary">
                                    Your answer
                                </label>
                                <textarea
                                    id={`w-${q.id}`}
                                    lang="ga"
                                    rows={10}
                                    maxLength={18000}
                                    readOnly={handedIn}
                                    value={answers[q.id]?.[WRITTEN] || ""}
                                    onChange={(e) => setAnswer(q.id, WRITTEN, e.target.value)}
                                    placeholder="Scríobh do fhreagra anseo."
                                    className="mt-2 w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md leading-7 text-primary outline-hidden focus:border-brand"
                                />
                            </div>
                        )}
                    </div>
                ))}

            {!handedIn && !closed && qs.length > 0 && (
                <div className="mt-2 flex justify-end">
                    <DuoButton isLoading={busy} onPress={handIn}>
                        {busy ? "Marking" : "Finish and hand in"}
                    </DuoButton>
                </div>
            )}
        </Page>
    );
};
