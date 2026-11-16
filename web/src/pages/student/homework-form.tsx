// Homework, one question at a time: the teacher's instructions page first, then the questions with
// the listening player kept above them, uploads on the last one, the draft saved as you go. Ported
// from openHomeworkForm / renderHomeworkIntro / renderHomeworkStep / listeningPanel /
// homeworkUploadPanel / saveHomeworkDraft / submitHomework / closedAssignmentNotice in the old app.js.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button as AriaButton } from "react-aria-components";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { Headphones01, UploadCloud02 } from "@/components/app/ic";
import { toast } from "@/components/app/toast";
import { avatarHref } from "@/lib/account";
import { api, isAvatarRequired, upload } from "@/lib/portal";
import { type Assignment, type AssignmentDetail, type Dialect, type Homework, type HomeworkFile, type Resource, dialectTag, fmtBytes, fmtDate, homeworkHasIntro, normaliseDialects, richText } from "@/lib/student";
import { cx } from "@/utils/cx";
import { ErrorBanner, StepFooter, StepProgress } from "./checkin-form";
import { SubmittedHomeworkBlock } from "./feedback-views";

const FILE_TYPE_ACCEPT: Record<string, string> = { image: ".jpg,.jpeg,.png,.webp,.heic,.heif", pdf: ".pdf", word: ".docx", text: ".txt" };
const FILE_TYPE_NAMES: Record<string, string> = { image: "photos", pdf: "PDFs", word: "Word documents", text: "text files" };

export const LoomEmbed = ({ url }: { url: string | null | undefined }) => {
    if (!url) return null;
    const match = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    if (!match)
        return (
            <DuoButton color="secondary" size="xs" href={url} className="mb-4">
                Open Loom Video
            </DuoButton>
        );
    return <iframe title="Assignment video" src={`https://www.loom.com/embed/${match[1]}`} className="mb-4 aspect-video w-full rounded-2xl border-0" allowFullScreen />;
};

const ResourceChips = ({ resources, className }: { resources: Resource[]; className?: string }) => {
    if (!resources.length) return null;
    return (
        <div className={cx("flex flex-wrap gap-2", className)}>
            {resources.map((r) => (
                <a key={r.id} href={r.fileUrl || r.file_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-xl border-2 border-secondary bg-primary px-3 py-1.5 text-xs font-bold text-brand-secondary hover:bg-primary_hover">
                    📎 {r.fileName || r.file_name}
                </a>
            ))}
        </div>
    );
};

/* What a student sees when a hard deadline has gone. Their own work, if they submitted, and otherwise
   the plain fact of it. */
export const ClosedAssignmentNotice = ({ assignment, submission, tz, onClose }: { assignment: AssignmentDetail; submission: Homework | null; tz: string; onClose: () => void }) => {
    const submitted = Boolean(submission && submission.status !== "draft");
    return (
        <DuoDialog open onClose={onClose} title={assignment.title} sub={`Closed ${fmtDate(assignment.deadline_at, { weekday: true, time: true, dateStyle: "medium" }, tz)}`} className="max-w-3xl">
            {submitted ? (
                <>
                    <div className="rounded-2xl border-2 border-brand bg-brand-primary px-4 py-3.5">
                        <p className="text-md font-bold text-brand-secondary">You handed this in.</p>
                        <p className="mt-1 text-sm leading-6 text-secondary">The deadline has since passed, so it can no longer be changed.</p>
                    </div>
                    <SubmittedHomeworkBlock assignment={assignment} submission={submission} />
                </>
            ) : (
                <div className="rounded-2xl border-2 border-error-200 bg-error-primary px-4 py-3.5">
                    <p className="text-md font-bold text-error-primary">This deadline has passed.</p>
                    <p className="mt-1 text-sm leading-6 text-secondary">It was a hard deadline, so the assignment is closed and cannot be submitted now. If you need it reopened, ask in the community or reply to your feedback email.</p>
                </div>
            )}
            <div className="mt-6 flex justify-end">
                <DuoButton size="sm" onPress={onClose}>
                    Close
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

type Listening = { dialect: string; textShown: boolean; plays: number };

/* A listening activity, above the questions. Persistent across the questions rather than living on
   the first one: a comprehension is answered while listening. Where the student had got to is kept
   and put back when the player is rebuilt, otherwise moving to question two would start the story
   again from the beginning. */
const ListeningPanel = ({ assignment, available, listen, onChange }: { assignment: AssignmentDetail; available: Dialect[]; listen: Listening; onChange: (patch: Partial<Listening>) => void }) => {
    const audio = useRef<HTMLAudioElement>(null);
    const state = useRef(listen);
    state.current = listen;
    /* Where the student had got to, kept here rather than in form state: the position changes four
       times a second while the story plays, and nothing else on the form needs to know. */
    const at = useRef(0);

    useEffect(() => {
        const a = audio.current;
        if (!a) return;
        const restore = () => {
            if (at.current > 0) a.currentTime = Math.min(at.current, a.duration || at.current);
        };
        const time = () => {
            at.current = a.currentTime;
        };
        /* Counted per press rather than per second, and only when it starts from somewhere near the
           beginning, so scrubbing back over a sentence does not read as playing the whole story again. */
        const play = () => {
            if (a.currentTime < 1) onChange({ plays: state.current.plays + 1 });
        };
        a.addEventListener("loadedmetadata", restore, { once: true });
        a.addEventListener("timeupdate", time);
        a.addEventListener("play", play);
        return () => {
            a.removeEventListener("loadedmetadata", restore);
            a.removeEventListener("timeupdate", time);
            a.removeEventListener("play", play);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listen.dialect]);

    if (!available.length)
        return (
            <div className="mb-4 rounded-2xl border-2 border-secondary bg-secondary p-4">
                <p className="text-xs text-tertiary">The recording for this story is not ready yet. Tell your teacher.</p>
                {assignment.listening_text && <p className="mt-3 text-sm leading-7 whitespace-pre-wrap text-secondary">{assignment.listening_text}</p>}
            </div>
        );
    const current = available.find((e) => e.key === listen.dialect) || available[0];
    return (
        <div className="mb-4 grid gap-3 rounded-2xl border-2 border-secondary bg-secondary p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <strong className="inline-flex items-center gap-2 text-sm font-bold text-primary">
                    <Headphones01 aria-hidden="true" className="size-4" /> Listen to the story
                </strong>
                {available.length > 1 ? (
                    <div role="group" aria-label="Which dialect to listen in" className="inline-flex rounded-xl border-2 border-secondary bg-primary p-0.5">
                        {available.map((e) => (
                            <AriaButton
                                key={e.key}
                                onPress={() => {
                                    if (e.key === listen.dialect) return;
                                    // A different voice is a different recording, so it starts at the beginning.
                                    at.current = 0;
                                    onChange({ dialect: e.key });
                                }}
                                className={cx("rounded-lg px-3 py-1.5 text-xs font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2", e.key === listen.dialect ? "bg-brand-primary text-brand-secondary" : "text-tertiary hover:text-secondary")}
                            >
                                {dialectTag(e)}
                            </AriaButton>
                        ))}
                    </div>
                ) : dialectTag(available[0]) ? (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-tertiary">{dialectTag(available[0])}</span>
                ) : null}
            </div>
            {/* keyed on the dialect so a new voice is a new element and the old position is not carried over */}
            <audio key={listen.dialect} ref={audio} controls preload="metadata" src={`/api/media/listening/${assignment.id}/${encodeURIComponent(listen.dialect)}`} className="w-full" />
            <div className="flex flex-wrap items-center gap-3">
                <AriaButton onPress={() => onChange({ textShown: !listen.textShown })} className="text-xs font-bold text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2">
                    {listen.textShown ? "Hide the text" : "Show the text"}
                </AriaButton>
                {available.length > 1 && dialectTag(current) && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-tertiary">{dialectTag(current)}</span>}
                <span className="text-xs text-quaternary">{listen.plays ? `Played ${listen.plays} time${listen.plays === 1 ? "" : "s"}` : "Play it as often as you like"}</span>
            </div>
            {listen.textShown && <p className="text-sm leading-7 whitespace-pre-wrap text-secondary">{assignment.listening_text || ""}</p>}
        </div>
    );
};

/* Where a student hands work up. Only shown when the teacher turned uploads on for this assignment,
   and only accepting the formats they chose. */
const UploadPanel = ({ assignment, files, onFiles }: { assignment: AssignmentDetail; files: HomeworkFile[]; onFiles: (next: HomeworkFile[]) => void }) => {
    const [status, setStatus] = useState<{ text: string; tone: "busy" | "error" } | null>(null);
    const input = useRef<HTMLInputElement>(null);
    if (!assignment.allow_uploads) return null;
    const types = assignment.accepted_file_types || [];
    const accept = types.map((t) => FILE_TYPE_ACCEPT[t]).filter(Boolean).join(",");
    const names = types.map((t) => FILE_TYPE_NAMES[t]).filter(Boolean);
    const max = assignment.max_files || 3;
    const full = files.length >= max;

    const remove = async (id: string) => {
        try {
            await api(`/api/student/files/${id}`, { method: "DELETE" });
            onFiles(files.filter((f) => f.id !== id));
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const pick = async (file: File | undefined) => {
        if (!file) return;
        setStatus({ text: "Uploading and reading your work…", tone: "busy" });
        try {
            const body = new FormData();
            body.append("file", file, file.name);
            const uploaded = await upload<HomeworkFile>(`/api/student/assignments/${assignment.id}/files`, body);
            onFiles([...files, uploaded]);
            setStatus(null);
            toast(uploaded.extractionState === "done" ? "Uploaded and read" : "Uploaded. Your teacher will read it themselves.");
        } catch (e) {
            setStatus({ text: (e as Error).message, tone: "error" });
        } finally {
            if (input.current) input.current.value = "";
        }
    };

    return (
        <div className="mt-5 rounded-2xl border-2 border-secondary bg-secondary p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-sm font-bold text-primary">{assignment.uploads_required ? "Upload your work" : "Upload your work, optional"}</strong>
                <span className="text-xs text-tertiary">
                    {names.length ? `Takes ${names.join(", ")}` : ""} · up to {max} file{max === 1 ? "" : "s"}
                </span>
            </div>
            <div className="mb-3 grid gap-2">
                {files.length ? (
                    files.map((f) => (
                        <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-secondary bg-primary px-3 py-2.5">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary">{f.fileName}</span>
                            <span className="text-xs text-quaternary">
                                {fmtBytes(f.sizeBytes)}
                                {f.extractionState === "done" ? " · read" : f.extractionState === "failed" ? " · could not be read automatically" : ""}
                            </span>
                            <AriaButton onPress={() => remove(f.id)} className="text-xs font-bold text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2">
                                Remove
                            </AriaButton>
                        </div>
                    ))
                ) : (
                    <p className="text-xs text-tertiary">Nothing uploaded yet.</p>
                )}
            </div>
            {full ? (
                <p className="text-xs text-tertiary">That is the maximum for this assignment.</p>
            ) : (
                <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-primary bg-primary p-5 text-center transition duration-100 ease-linear hover:border-brand hover:bg-brand-primary/30">
                    <input ref={input} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-secondary">
                        <UploadCloud02 aria-hidden="true" className="size-5" /> Choose a file
                    </span>
                    <small className="text-xs text-tertiary">A photo of handwritten work is grand. It is read automatically so your teacher can correct it.</small>
                </label>
            )}
            {status && <p className={cx("mt-3 text-xs font-semibold", status.tone === "error" ? "text-error-primary" : "text-tertiary")}>{status.text}</p>}
        </div>
    );
};

const Shell = ({ title, sub, onClose, progress, children }: { title: string; sub: string; onClose: () => void; progress: number; children: ReactNode }) => (
    <DuoDialog open onClose={onClose} title={title} sub={sub} className="max-w-3xl">
        <StepProgress value={progress} />
        {children}
    </DuoDialog>
);

/** Fetches the assignment and runs the whole form; `onSubmitted` fires once the server has it. */
export const HomeworkForm = ({ assignment: row, tz, onClose, onSubmitted }: { assignment: Assignment; tz: string; onClose: () => void; onSubmitted: () => Promise<void> | void }) => {
    const nav = useNavigate();
    const { pathname, search } = useLocation();
    const [data, setData] = useState<{ assignment: AssignmentDetail; submission: Homework | null } | null>(null);
    const [mode, setMode] = useState<"intro" | "step">("step");
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<string[]>([]);
    const [files, setFiles] = useState<HomeworkFile[]>([]);
    const [listen, setListen] = useState<Listening>({ dialect: "connacht", textShown: false, plays: 0 });
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const latest = useRef({ answers, step });
    latest.current = { answers, step };
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let gone = false;
        (async () => {
            try {
                const d = await api<{ assignment: AssignmentDetail; submission: Homework | null }>(`/api/student/assignments/${row.id}`);
                if (gone) return;
                const dialects = normaliseDialects(d.assignment.dialects).map((e) => e.key);
                const saved = Array.isArray(d.submission?.answers) ? d.submission.answers : [];
                const ans = d.assignment.questions.map((_, i) => String(saved[i] ?? ""));
                const start = Math.min(Math.max(0, d.submission?.current_question || 0), Math.max(0, ans.length - 1));
                setStep(start);
                setAnswers(ans);
                setFiles(d.submission?.files || []);
                setListen({ dialect: dialects[0] || "connacht", textShown: Boolean(d.assignment.listening_text_shown), plays: 0 });
                /* The teacher's explanation page comes first, the once: a student who has started (an answer
                   in the draft, or a later question) lands back where they were, with the page a button away. */
                const started = start > 0 || ans.some((a) => String(a || "").trim());
                setMode(d.assignment.open && homeworkHasIntro(d.assignment) && !started ? "intro" : "step");
                setData(d);
            } catch (e) {
                if (gone) return;
                if (isAvatarRequired(e)) return nav(avatarHref(pathname + search), { replace: true });
                toast((e as Error).message);
                onClose();
            }
        })();
        return () => {
            gone = true;
            if (timer.current) clearTimeout(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [row.id]);

    if (!data)
        return (
            <DuoDialog open onClose={onClose} title={row.title} className="max-w-3xl">
                <p className="text-sm text-quaternary">Opening…</p>
            </DuoDialog>
        );
    const { assignment } = data;
    if (!assignment.open) return <ClosedAssignmentNotice assignment={assignment} submission={data.submission} tz={tz} onClose={onClose} />;

    const questions = assignment.questions;
    const hasIntro = homeworkHasIntro(assignment);
    const started = step > 0 || answers.some((a) => String(a || "").trim());
    const due = `Due ${fmtDate(assignment.reopened_until || assignment.deadline_at, { time: true }, tz)}`;
    const available = normaliseDialects(assignment.dialects);
    const last = step === questions.length - 1;
    const question = questions[step];

    const saveDraft = async (ans = latest.current.answers, cur = latest.current.step) => {
        try {
            await api(`/api/student/assignments/${assignment.id}/draft`, { method: "PUT", json: { answers: ans, currentQuestion: cur } });
        } catch (e) {
            console.error(e);
        }
    };
    const typed = (value: string) => {
        const next = [...latest.current.answers];
        next[step] = value;
        setAnswers(next);
        setError("");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => saveDraft(), 500);
    };
    const flush = () => {
        if (timer.current) clearTimeout(timer.current);
        return saveDraft();
    };
    const exit = async () => {
        await flush();
        onClose();
    };
    const previous = async () => {
        await flush();
        setError("");
        if (step > 0) setStep(step - 1);
        else if (hasIntro) setMode("intro");
    };
    const toInstructions = async () => {
        await flush();
        setMode("intro");
    };
    const next = async () => {
        const trimmedAns = [...latest.current.answers];
        trimmedAns[step] = String(trimmedAns[step] || "").trim();
        setAnswers(trimmedAns);
        if (question?.required && !trimmedAns[step]) return setError("Please answer this question.");
        if (timer.current) clearTimeout(timer.current);
        await saveDraft(trimmedAns, step);
        if (!last) {
            setError("");
            return setStep(step + 1);
        }
        // Same shape as the check-in: handing work in should be one moment, not a silence followed by a party.
        setSending(true);
        try {
            await api(`/api/student/assignments/${assignment.id}/submit`, {
                method: "POST",
                json: { answers: trimmedAns, ...(assignment.kind === "listening" ? { listeningDialect: listen.dialect, listeningPlays: listen.plays } : {}) },
            });
        } catch (e) {
            setSending(false);
            return toast((e as Error).message);
        }
        await onSubmitted();
    };

    if (mode === "intro")
        return (
            <Shell title={assignment.title} sub={due} onClose={onClose} progress={0}>
                <div className="min-h-[300px]">
                    <p className="duo-label text-brand-secondary">Before you start</p>
                    <div className="prose prose-sm mt-3 mb-4 max-w-none text-secondary" dangerouslySetInnerHTML={{ __html: richText(assignment.instructions) }} />
                    <LoomEmbed url={assignment.loom_url} />
                    <ResourceChips resources={assignment.resources || []} className="mb-4" />
                    <p className="text-xs font-semibold text-quaternary">
                        {questions.length} {questions.length === 1 ? "question" : "questions"}
                    </p>
                </div>
                <StepFooter
                    note=""
                    left={
                        <DuoButton color="secondary" size="sm" onPress={exit}>
                            Back to Deadlines
                        </DuoButton>
                    }
                    right={
                        <DuoButton size="sm" onPress={() => setMode("step")}>
                            {started ? "Back to the Questions" : "Start the Homework"}
                        </DuoButton>
                    }
                />
            </Shell>
        );

    if (!question)
        return (
            <Shell title={assignment.title} sub={due} onClose={onClose} progress={0}>
                <p className="text-sm text-tertiary">This assignment has no questions yet. Tell your teacher.</p>
                <StepFooter
                    note=""
                    left={
                        <DuoButton color="secondary" size="sm" onPress={exit}>
                            Back to Deadlines
                        </DuoButton>
                    }
                    right={null}
                />
            </Shell>
        );

    return (
        <Shell title={assignment.title} sub={due} onClose={onClose} progress={((step + 1) / questions.length) * 100}>
            <div className="min-h-[300px]">
                {assignment.kind === "listening" && <ListeningPanel assignment={assignment} available={available} listen={listen} onChange={(p) => setListen((l) => ({ ...l, ...p }))} />}
                {step === 0 && !hasIntro && <LoomEmbed url={assignment.loom_url} />}
                {step === 0 && !hasIntro && <ResourceChips resources={assignment.resources || []} className="mb-4" />}
                <p className="duo-label text-brand-secondary">
                    Question {step + 1} of {questions.length}
                </p>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-primary md:text-2xl">{question.prompt}</h3>
                {question.imageUrl && <img src={question.imageUrl} alt="" className="mt-3 max-h-[260px] max-w-full rounded-2xl" />}
                <p className="mt-1.5 mb-4 text-xs text-quaternary">{question.required ? "Required" : "Optional"}</p>
                <textarea
                    key={step}
                    aria-label={question.prompt}
                    value={answers[step] || ""}
                    onChange={(e) => typed(e.target.value)}
                    placeholder="Type your answer"
                    rows={6}
                    className="min-h-[155px] w-full resize-y rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden placeholder:text-placeholder/80 focus:border-brand"
                />
                {last && <UploadPanel assignment={assignment} files={files} onFiles={setFiles} />}
                {error && <ErrorBanner>{error}</ErrorBanner>}
            </div>
            <StepFooter
                left={
                    <DuoButton color="secondary" size="sm" onPress={exit} isDisabled={sending}>
                        Back to Deadlines
                    </DuoButton>
                }
                right={
                    <>
                        {hasIntro && (
                            <DuoButton color="secondary" size="sm" onPress={toInstructions} isDisabled={sending}>
                                Instructions
                            </DuoButton>
                        )}
                        <DuoButton color="secondary" size="sm" onPress={previous} isDisabled={(step === 0 && !hasIntro) || sending}>
                            Previous
                        </DuoButton>
                        <DuoButton size="sm" onPress={next} isDisabled={sending}>
                            {sending ? "Sending…" : last ? "Submit Homework" : "Save and Continue"}
                        </DuoButton>
                    </>
                }
            />
        </Shell>
    );
};
