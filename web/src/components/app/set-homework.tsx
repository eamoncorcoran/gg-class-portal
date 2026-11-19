// Setting a past question as homework, and the tag that says it has been set.
// Both are for the teacher only: neither is drawn for anybody else, and the server behind them
// (/api/admin/...) refuses anybody who is not a teacher whatever the page shows.
import { useEffect, useMemo, useState } from "react";
import { Calendar, FileCheck02 } from "@/components/app/ic";
import { type Question, label } from "@/lib/data";
import { api, useMe } from "@/lib/portal";
import { type PqAssignment, dueLabel, loadPqHomework, usePqHomework } from "@/lib/pq-homework";
import { classLabel, fromZonedInput, toZonedInput } from "@/lib/teach";
import { type AdminClassRow, FIELD_CLASS } from "@/lib/teach-calendar";
import { cx } from "@/utils/cx";
import { DuoButton } from "./duo";
import { DuoDialog, FieldLabel } from "./duo-dialog";
import { DuoSelect } from "./duo-select";
import { toast } from "./toast";

const TZ = "Europe/Dublin";
/** "2025 Deferred · Paper 1 · Cuid A · Fógraí": the year belongs in the homework's name, where there is no heading to carry it. */
export const homeworkTitle = (q: Question) => `${q.year}${q.deferred ? " Deferred" : ""} · ${label(q)}`;

/* A week from now at five to midnight, Irish time: the usual shape of a deadline, and one to change. */
export const defaultDeadline = () => `${toZonedInput(new Date(Date.now() + 7 * 86400000), TZ).slice(0, 10)}T23:55`;

/** The tags under a question's title: each class it has been set for, when it is due and how many have handed it in. */
export const HomeworkTags = ({ q }: { q: Question }) => {
    const set = usePqHomework()?.byQuestion[q.id];
    if (!set?.length) return null;
    return (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Set as homework">
            {set.map((s) => {
                const past = new Date(s.deadlineAt).getTime() < Date.now();
                return (
                    <li key={s.assignmentId}>
                        <a
                            href="/teach/tracker"
                            title={`${s.title}. Set for ${s.className}, due ${dueLabel(s.deadlineAt)}. ${s.done} of ${s.students} handed in${s.marked ? `, ${s.marked} marked against the scheme and returned` : ""}.`}
                            className={cx("inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-bold outline-focus-ring focus-visible:outline-2", past ? "border-secondary bg-secondary text-tertiary" : "border-purple-200 bg-purple-50 text-purple-800")}
                        >
                            <FileCheck02 aria-hidden="true" className="size-3.5 shrink-0" />
                            Homework · {s.className} · {past ? "was due" : "due"} {dueLabel(s.deadlineAt)} · {s.done} of {s.students} done
                            {s.marked && s.outOf ? ` · average ${s.average} of ${s.outOf}` : ""}
                        </a>
                    </li>
                );
            })}
        </ul>
    );
};

const SetHomeworkDialog = ({ q, onClose }: { q: Question; onClose: () => void }) => {
    const set = usePqHomework();
    const [classes, setClasses] = useState<AdminClassRow[]>([]);
    const [classId, setClassId] = useState("");
    const [into, setInto] = useState("new");
    const [title, setTitle] = useState(homeworkTitle(q));
    const [deadline, setDeadline] = useState(defaultDeadline);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        api<AdminClassRow[]>("/api/admin/classes")
            .then((rows) => {
                const live = rows.filter((k) => k.active !== false);
                setClasses(live);
                setClassId((id) => id || live[0]?.id || "");
            })
            .catch((e) => setErr((e as Error).message));
    }, []);

    /* Homework for this class that is still open and that nobody has handed in: this question can
       join one of those rather than be a second entry on the same day of the calendar. */
    const joinable = useMemo<PqAssignment[]>(
        () => (set?.assignments || []).filter((a) => a.classId === classId && a.done === 0 && new Date(a.deadlineAt).getTime() > Date.now() && !(set?.byQuestion[q.id] || []).some((s) => s.assignmentId === a.assignmentId)),
        [set, classId, q.id],
    );
    useEffect(() => {
        if (into !== "new" && !joinable.some((a) => a.assignmentId === into)) setInto("new");
    }, [joinable, into]);
    const already = (set?.byQuestion[q.id] || []).filter((s) => s.classId === classId);

    const save = async () => {
        if (busy || !classId) return;
        setBusy(true);
        setErr(null);
        try {
            if (into === "new") {
                if (title.trim().length < 2) throw new Error("Give the homework a title.");
                if (!deadline) throw new Error("Choose when it is due.");
                const deadlineAt = fromZonedInput(deadline, TZ);
                if (new Date(deadlineAt).getTime() <= Date.now()) throw new Error("That deadline has already passed.");
                await api("/api/admin/assignments", {
                    method: "POST",
                    json: { classId, title: title.trim(), instructions: note.trim(), deadlineAt, questions: [{ prompt: homeworkTitle(q), required: true }], pqIds: [q.id] },
                });
                toast("Set as homework. It is on the class calendar now.");
            } else {
                await api(`/api/admin/assignments/${into}/pq`, { method: "POST", json: { pqId: q.id, prompt: homeworkTitle(q) } });
                toast("Added to that homework.");
            }
            await loadPqHomework(true).catch(() => undefined);
            onClose();
        } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
        }
    };

    return (
        <DuoDialog open onClose={onClose} title="Set as homework" sub={homeworkTitle(q)}>
            <div className="mt-5 flex flex-col gap-4">
                <DuoSelect label="Class" value={classId} onChange={setClassId} items={classes.map((k) => ({ id: k.id, label: classLabel(k) }))} className="w-full" />
                {already.length > 0 && (
                    <p className="rounded-2xl border-2 border-warning-300 bg-warning-primary px-4 py-3 text-sm font-semibold text-warning-primary">
                        This class has already been set this question ({already.map((s) => `due ${dueLabel(s.deadlineAt)}`).join(", ")}).
                    </p>
                )}
                {joinable.length > 0 && (
                    <DuoSelect
                        label="Add it to"
                        value={into}
                        onChange={setInto}
                        items={[{ id: "new", label: "A new homework" }, ...joinable.map((a) => ({ id: a.assignmentId, label: `${a.title} (due ${dueLabel(a.deadlineAt)})` }))]}
                        className="w-full"
                    />
                )}
                {into === "new" && (
                    <>
                        <div>
                            <FieldLabel>Title</FieldLabel>
                            <input aria-label="Title" className={FIELD_CLASS} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div>
                            <FieldLabel>Due (Irish time)</FieldLabel>
                            <input aria-label="Due" type="datetime-local" className={FIELD_CLASS} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                        </div>
                        <div>
                            <FieldLabel>Note for students (optional)</FieldLabel>
                            <textarea aria-label="Note for students" rows={2} maxLength={2000} className={FIELD_CLASS} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should know before they start." />
                        </div>
                    </>
                )}
                <p className="text-sm text-tertiary">Students see it on their calendar straight away and answer on the paper itself. Their answers are marked there and handed in to your homework review.</p>
                {err && <p role="alert" className="text-sm font-semibold text-error-primary">{err}</p>}
                <div className="flex justify-end gap-2">
                    <DuoButton color="secondary" size="sm" onPress={onClose}>
                        Cancel
                    </DuoButton>
                    <DuoButton size="sm" isLoading={busy} isDisabled={!classId} onPress={save}>
                        {into === "new" ? "Set homework" : "Add to homework"}
                    </DuoButton>
                </div>
            </div>
        </DuoDialog>
    );
};

/** The button on a question, drawn for a teacher and nobody else. */
export const SetHomeworkButton = ({ q }: { q: Question }) => {
    const me = useMe();
    const [open, setOpen] = useState(false);
    if (me?.role !== "admin") return null;
    return (
        <>
            <DuoButton color="secondary" size="sm" iconLeading={Calendar} onPress={() => setOpen(true)}>
                Set as homework
            </DuoButton>
            {open && <SetHomeworkDialog q={q} onClose={() => setOpen(false)} />}
        </>
    );
};
