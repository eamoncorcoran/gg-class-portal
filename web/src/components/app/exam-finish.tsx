// The step after choosing questions with "Create exam": give the exam a name and a description,
// then print it, keep it in My exams, or (the teacher only) share it with a class as homework.
// Whichever is chosen, the exam is kept in My exams too, so it can be printed or sat again later.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Check, Printer, Users01 } from "@/components/app/ic";
import { type Question, D } from "@/lib/data";
import { setBuilding } from "@/lib/pick";
import { api, useMe } from "@/lib/portal";
import { loadPqHomework } from "@/lib/pq-homework";
import { type SavedExam, get, set, uid, useStore } from "@/lib/store";
import { classLabel, fromZonedInput } from "@/lib/teach";
import { type AdminClassRow, FIELD_CLASS } from "@/lib/teach-calendar";
import { useLoadedFor } from "@/lib/use-loaded";
import { marksOf, minutesOf, roundMins } from "@/pages/exam-pages";
import { DuoButton } from "./duo";
import { DuoDialog, DuoInput, FieldLabel } from "./duo-dialog";
import { DuoSelect } from "./duo-select";
import { printExam } from "./overlays";
import { defaultDeadline, homeworkTitle } from "./set-homework";
import { toast } from "./toast";

const TZ = "Europe/Dublin";
/** The class server takes at most this many past questions in one homework (src/routes/admin.js). */
const MAX_HOMEWORK = 12;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const FinishExamDialog = ({ onClose }: { onClose: () => void }) => {
    const picked = useStore((s) => s.exam);
    useLoadedFor(picked);
    const qs = picked.map((id) => D().q[id]).filter(Boolean) as Question[];
    const nav = useNavigate();
    const teacher = useMe()?.role === "admin";

    const [step, setStep] = useState<"details" | "share">("details");
    const [name, setName] = useState("");
    const [note, setNote] = useState("");
    const [tried, setTried] = useState(false);
    const [classes, setClasses] = useState<AdminClassRow[]>([]);
    const [classId, setClassId] = useState("");
    const [deadline, setDeadline] = useState(defaultDeadline);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (step !== "share" || classes.length) return;
        api<AdminClassRow[]>("/api/admin/classes")
            .then((rows) => {
                const live = rows.filter((k) => k.active !== false);
                setClasses(live);
                setClassId((id) => id || live[0]?.id || "");
            })
            .catch((e) => setErr((e as Error).message));
    }, [step, classes.length]);

    const marks = qs.reduce((n, q) => n + marksOf(q), 0);
    const mins = roundMins(qs.reduce((n, q) => n + minutesOf(q), 0));
    const named = name.trim().length >= 2;
    const tooMany = qs.length > MAX_HOMEWORK;

    /** Keeps the exam in My exams and finishes choosing. */
    const keep = (): SavedExam => {
        const exam: SavedExam = {
            id: uid(),
            name: name.trim(),
            ids: qs.map((q) => q.id),
            mins,
            topics: [...new Set(qs.map((q) => D().topicOf[q.id]).filter(Boolean))],
            shuffle: false,
            created: Date.now(),
            instructions: note.trim() || undefined,
        };
        set("exams", [exam, ...get().exams]);
        set("exam", []);
        setBuilding(false);
        return exam;
    };
    /** Every action needs a name first: it is the heading on the printed exam and the homework's title. */
    const needName = () => {
        setTried(true);
        return !named;
    };

    const print = () => {
        if (needName()) return;
        const exam = keep();
        printExam(exam, qs);
        toast("Printing. The exam is in My exams too.");
        onClose();
    };
    const save = () => {
        if (needName()) return;
        const exam = keep();
        toast("Exam saved");
        onClose();
        nav(`/exam/${exam.id}`);
    };
    const share = async () => {
        if (busy || !classId || tooMany) return;
        setBusy(true);
        setErr(null);
        try {
            if (!deadline) throw new Error("Choose when it is due.");
            const deadlineAt = fromZonedInput(deadline, TZ);
            if (new Date(deadlineAt).getTime() <= Date.now()) throw new Error("That deadline has already passed.");
            await api("/api/admin/assignments", {
                method: "POST",
                json: {
                    classId,
                    title: name.trim(),
                    instructions: note.trim(),
                    deadlineAt,
                    questions: qs.map((q) => ({ prompt: homeworkTitle(q), required: true })),
                    pqIds: qs.map((q) => q.id),
                },
            });
            keep();
            await loadPqHomework(true).catch(() => undefined);
            const k = classes.find((c) => c.id === classId);
            toast(`Shared with ${k ? classLabel(k) : "the class"}. It is on their calendar now.`);
            onClose();
        } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
        }
    };

    const summary = `${plural(qs.length, "question")} · ${marks} marks${mins ? ` · about ${mins} min` : ""}`;

    if (step === "share")
        return (
            <DuoDialog open onClose={onClose} title="Share with a class" sub={`${name.trim()} · ${plural(qs.length, "question")}`}>
                <div className="mt-5 flex flex-col gap-4">
                    <DuoSelect label="Class" value={classId} onChange={setClassId} items={classes.map((k) => ({ id: k.id, label: classLabel(k) }))} className="w-full" />
                    <div>
                        <FieldLabel>Due (Irish time)</FieldLabel>
                        <input aria-label="Due" type="datetime-local" className={FIELD_CLASS} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                    </div>
                    {tooMany ? (
                        <p role="alert" className="rounded-2xl border-2 border-warning-300 bg-warning-primary px-4 py-3 text-sm font-semibold text-warning-primary">
                            A class homework can hold {MAX_HOMEWORK} questions at most. Take out {qs.length - MAX_HOMEWORK} to share this one, or print it instead.
                        </p>
                    ) : (
                        <p className="text-sm text-tertiary">The class sees it on their calendar straight away, with your description, and answers on the papers themselves. Their answers are marked and handed in to your homework review.</p>
                    )}
                    {err && (
                        <p role="alert" className="text-sm font-semibold text-error-primary">
                            {err}
                        </p>
                    )}
                    <div className="flex items-center gap-2">
                        <DuoButton color="ghost" size="sm" iconLeading={ArrowLeft} onPress={() => (setStep("details"), setErr(null))}>
                            Back
                        </DuoButton>
                        <DuoButton size="sm" className="ml-auto" iconLeading={Users01} isLoading={busy} isDisabled={!classId || tooMany} onPress={share}>
                            Share with class
                        </DuoButton>
                    </div>
                </div>
            </DuoDialog>
        );

    return (
        <DuoDialog open onClose={onClose} title="Your exam" sub={summary}>
            <div className="mt-5 flex flex-col gap-4">
                <div>
                    <FieldLabel>
                        Exam name <span className="text-error-primary">*</span>
                    </FieldLabel>
                    <DuoInput ariaLabel="Exam name" value={name} onChange={setName} placeholder="e.g. Christmas mock, Paper 1 practice" maxLength={60} autoFocus className={tried && !named ? "border-error-500" : undefined} />
                    {tried && !named && <p className="mt-1.5 text-sm font-semibold text-error-primary">Give the exam a name.</p>}
                </div>
                <div>
                    <FieldLabel>Description (optional)</FieldLabel>
                    <DuoInput ariaLabel="Description" multiline value={note} onChange={setNote} placeholder="e.g. Answer every question. Each recording is played twice." maxLength={600} />
                    <p className="mt-1.5 text-xs text-tertiary">Printed under the name on the exam, and shown to a class you share it with.</p>
                </div>
                <div className="mt-1 flex flex-col gap-2">
                    {teacher && (
                        <DuoButton full iconLeading={Users01} onPress={() => !needName() && setStep("share")}>
                            Share with a class
                        </DuoButton>
                    )}
                    <div className="flex gap-2">
                        <DuoButton color={teacher ? "secondary" : "primary"} iconLeading={Printer} onPress={print} className="flex-1">
                            Print
                        </DuoButton>
                        <DuoButton color="secondary" iconLeading={Check} onPress={save} className="flex-1">
                            Save
                        </DuoButton>
                    </div>
                </div>
            </div>
        </DuoDialog>
    );
};
