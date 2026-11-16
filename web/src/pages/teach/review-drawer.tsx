// The review drawer: one student's check-in, homework or attendance for one week. Read what they
// sent, play their audio, edit or regenerate the AI draft, dictate, record a voice note, set marks,
// return it, and move through the queue with the arrow keys. Ported control for control from the
// old hub's renderReviewDrawer and everything it called.
import { type ReactNode, useEffect, useRef, useState } from "react";
import * as P from "@phosphor-icons/react";
import { Dialog as AriaDialog, Heading as AriaHeading, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { askConfirm } from "@/components/app/confirm";
import { TEXTAREA_CLASS, TeacherBox, VoiceNoteBlock } from "@/components/app/dictation";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { X } from "@/components/app/ic";
import { toast } from "@/components/app/toast";
import { api } from "@/lib/portal";
import {
    type Attendance,
    type AttendanceStatus,
    type Checkin,
    type Drafting,
    type FeedbackState,
    type Homework,
    type HomeworkFile,
    type Mark,
    type ReviewKey,
    type ReviewRecord,
    type Settings,
    type Tone,
    type Tracker,
    type TrackerIcon,
    DIALECT_LABELS,
    assignmentClosed,
    draftingFor,
    errMsg,
    firstName,
    fmtBytes,
    fmtDate,
    fmtWeek,
} from "@/lib/teach";
import { cx } from "@/utils/cx";
import { Corrections } from "@/components/app/corrections";

/* ---- parts the console sections share (exported from here so they live in one place) ---- */

const PILL: Record<Tone | "blue", string> = {
    grey: "bg-secondary text-tertiary",
    plain: "bg-secondary text-tertiary",
    orange: "bg-warning-primary text-warning-primary",
    green: "bg-success-primary text-success-primary",
    red: "bg-error-primary text-error-primary",
    blue: "bg-blue-100 text-blue-800",
};
/** A status chip in the tracker tones. */
export const Pill = ({ tone = "grey", children, className }: { tone?: Tone | "blue"; children: ReactNode; className?: string }) => (
    <span className={cx("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-bold whitespace-nowrap", PILL[tone], className)}>{children}</span>
);

/** A small label-over-value tile, several to a row. */
export const Detail = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
    <div className="min-w-0 rounded-xl bg-secondary px-3 py-2">
        <p className="duo-label text-quaternary">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-primary" title={typeof children === "string" ? children : undefined}>
            {children}
        </p>
    </div>
);
export const DetailGrid = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}>{children}</div>;

/** A heading inside a drawer or dialog body. */
export const SubHead = ({ children, className }: { children: ReactNode; className?: string }) => <h3 className={cx("mt-6 mb-2 duo-label text-quaternary", className)}>{children}</h3>;

/** A grey track with a green or orange fill. */
export const Meter = ({ value, good }: { value: number | null; good: boolean }) => (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cx("h-full rounded-full", good ? "bg-success-solid" : "bg-warning-solid")} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
);

/** A link-looking button for names and small inline actions. */
export const TextLink = ({ onPress, children, className, danger }: { onPress: () => void; children: ReactNode; className?: string; danger?: boolean }) => (
    <button type="button" onClick={onPress} className={cx("rounded-sm text-left font-bold outline-focus-ring hover:underline focus-visible:outline-2", danger ? "text-error-primary" : "text-brand-secondary", className)}>
        {children}
    </button>
);

const bold = (I: P.Icon) => (p: { className?: string }) => <I size={24} weight="bold" aria-hidden="true" {...p} />;
export const CellIcon: Record<TrackerIcon, (p: { className?: string }) => React.JSX.Element> = { camera: bold(P.VideoCamera), talk: bold(P.ChatCircle), book: bold(P.BookOpen), x: bold(P.X) };
export const NoteIcon = bold(P.NotePencil);
export const MailIcon = bold(P.Envelope);
export const SparkIcon = bold(P.Sparkle);
export const LockIcon = bold(P.Lock);
export const SettingsIcon = bold(P.Gear);

/* A right-hand drawer in the Duolingo manner: full height, a 2px border on its left, bold title and
   a close cross; the body scrolls and the footer stays put. Drops to a bottom sheet on phones. */
export const SideDrawer = ({ open, onClose, title, sub, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) => (
    <AriaModalOverlay isOpen={open} onOpenChange={(o) => !o && onClose()} isDismissable className="fixed inset-0 z-50 flex items-end justify-end bg-overlay/60 backdrop-blur-[2px] duration-200 animate-in fade-in sm:items-stretch">
        <AriaModal className={cx("flex h-[94dvh] w-full flex-col rounded-t-3xl border-2 border-secondary bg-primary shadow-xl duration-200 animate-in slide-in-from-bottom-4 sm:h-full sm:rounded-none sm:border-y-0 sm:border-r-0 sm:slide-in-from-right-4", wide ? "sm:max-w-3xl" : "sm:max-w-xl")}>
            <AriaDialog className="flex min-h-0 flex-1 flex-col outline-hidden">
                <div className="flex items-start justify-between gap-4 border-b-2 border-secondary px-5 py-4 sm:px-7">
                    <div className="min-w-0">
                        <AriaHeading slot="title" className="truncate text-xl font-bold text-primary">
                            {title}
                        </AriaHeading>
                        {sub && <p className="mt-0.5 truncate text-sm text-tertiary">{sub}</p>}
                    </div>
                    <ButtonUtility color="tertiary" size="sm" icon={X} tooltip="Close" onPress={onClose} />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
                {footer && <div className="flex flex-col gap-3 border-t-2 border-secondary px-5 py-4 sm:px-7">{footer}</div>}
            </AriaDialog>
        </AriaModal>
    </AriaModalOverlay>
);

const Kbd = ({ children }: { children: ReactNode }) => <kbd className="rounded-md border border-secondary bg-secondary px-1.5 py-0.5 font-sans text-[11px] font-bold text-tertiary">{children}</kbd>;
const Hint = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cx("text-xs text-quaternary", className)}>{children}</p>;
const AnswerBox = ({ children }: { children: ReactNode }) => <div className="rounded-2xl border-2 border-secondary bg-secondary px-4 py-3 text-md leading-7 whitespace-pre-wrap text-secondary">{children}</div>;

/* ---- the drawer ---- */

export type ReviewDrawerProps = {
    tracker: Tracker;
    drafting: Drafting | null | undefined;
    queue: ReviewKey[];
    index: number;
    onIndex: (i: number) => void;
    onClose: () => void;
    /** Keep the tracker's own row in step with the server after a save, redraft or voice-note change. */
    patchRow: (type: "checkin" | "homework" | "attendance", row: Checkin | Homework | Attendance) => void;
    /** Feedback went out: the tracker reloads and the queue moves on. */
    onSubmitted: () => Promise<void>;
    /** Attendance saved: the tracker reloads and the drawer closes. */
    onAttendanceSaved: () => Promise<void>;
    record: ReviewRecord | null;
};

export const ReviewDrawer = (props: ReviewDrawerProps) => {
    const { tracker, record, queue, index, onIndex, onClose } = props;
    const tz = tracker.class.timezone || "Europe/Dublin";
    /* Unsaved text lives for as long as the drawer is open, so Previous and Next do not throw it
       away; closing the drawer starts fresh from the saved rows, as the old screen did. A ref, not
       a module map: it dies with this drawer and survives StrictMode's effect replay. */
    const store = useRef<DraftStore>(new Map());

    /* Registered for the life of the drawer. Arrow keys move through the queue unless the focus is
       in a field. Reads the latest index and queue through a ref so it is not re-armed on every
       repaint of the tracker behind it. */
    const latest = useRef({ index, queue, onIndex });
    latest.current = { index, queue, onIndex };
    const navigable = Boolean(record) && record?.type !== "attendance";
    useEffect(() => {
        if (!navigable) return;
        const onKey = (e: KeyboardEvent) => {
            const tag = (document.activeElement as HTMLElement | null)?.tagName;
            const typing = Boolean(tag && ["INPUT", "TEXTAREA", "SELECT"].includes(tag));
            const mod = e.metaKey || e.ctrlKey;
            const { index, queue, onIndex } = latest.current;
            /* ⌘Enter sends from anywhere, even mid-sentence; the footer does the sending. */
            if (mod && e.key === "Enter") {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent("gg-review-submit"));
                return;
            }
            /* Arrows move through the queue; with ⌘ they work from inside a text box too. */
            if (typing && !mod) return;
            if (e.key === "ArrowLeft" && index > 0) (e.preventDefault(), onIndex(index - 1));
            if (e.key === "ArrowRight" && index < queue.length - 1) (e.preventDefault(), onIndex(index + 1));
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [navigable]);

    if (!record) return null;
    const kind = record.type === "checkin" ? "Weekly check-in" : record.type === "homework" ? "Homework" : "Attendance";
    const nav =
        record.type === "attendance" ? null : (
            <div className="flex flex-wrap items-center gap-2">
                <DuoButton color="secondary" size="xs" isDisabled={index <= 0} onPress={() => onIndex(index - 1)}>
                    Previous
                </DuoButton>
                <span className="text-xs font-semibold text-quaternary tabular-nums">
                    {index + 1} of {queue.length}
                </span>
                <DuoButton color="secondary" size="xs" isDisabled={index >= queue.length - 1} onPress={() => onIndex(index + 1)}>
                    Next
                </DuoButton>
                <span className="ml-1 hidden items-center gap-1 text-[11px] text-quaternary sm:inline-flex" title="Arrow keys move through the queue (hold ⌘ or Ctrl from inside a text box). Enter sends from the text box; ⌘ Enter sends from anywhere. Esc closes.">
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd> move
                    <Kbd>⌘</Kbd>
                    <Kbd>Enter</Kbd> send
                </span>
            </div>
        );

    const rowId = record.type === "attendance" ? record.attendance?.id || "none" : record.type === "checkin" ? record.checkin?.id || "none" : record.homework?.id || "none";
    const bodyKey = `${record.type}:${record.student.id}:${record.week.id}:${record.assignment?.id || ""}:${rowId}`;
    const inner: Inner = { ...props, record, tz, store: store.current };

    return (
        <SideDrawer open onClose={onClose} wide={record.type !== "attendance"} title={`${record.student.name.trim()} · ${kind}`} sub={`${fmtWeek(record.week.week_start)} · ${tracker.class.label}`} footer={<Footer key={bodyKey} {...inner} nav={nav} />}>
            <Body key={bodyKey} {...inner} />
        </SideDrawer>
    );
};

/* The body and footer share the draft text, so both read from one store per open record. The
   store is a bag the body writes and the footer reads, keyed so it resets with the record. */
type Draft = { feedback: string; corrections: string; general: string; marks: Map<number, number>; attendance: { status: AttendanceStatus; minutes: string; notes: string }; busy: boolean };
type DraftStore = Map<string, Draft>;
const draftKey = (r: ReviewRecord) => `${r.type}:${r.student.id}:${r.week.id}:${r.assignment?.id || ""}`;
const useDraft = (store: DraftStore, r: ReviewRecord) => {
    const key = draftKey(r);
    let d = store.get(key);
    if (!d) {
        d = {
            feedback: r.checkin?.teacher_feedback || r.checkin?.ai_feedback || "",
            corrections: r.homework?.teacher_corrections || r.homework?.ai_corrections || "",
            general: r.homework?.teacher_general_feedback || r.homework?.ai_general_feedback || "",
            marks: new Map(),
            attendance: { status: r.attendance?.status || "unknown", minutes: String(Number(r.attendance?.minutes || 0)), notes: r.attendance?.notes || "" },
            busy: false,
        };
        store.set(key, d);
    }
    return d;
};
/* Both halves need to redraw when the other writes, so writers call every mounted listener. */
const draftSubs = new Set<() => void>();
const useDraftSync = () => {
    const [, tick] = useState(0);
    useEffect(() => {
        const f = () => tick((n) => n + 1);
        draftSubs.add(f);
        return () => void draftSubs.delete(f);
    }, []);
    return () => draftSubs.forEach((f) => f());
};
/** Called when a record's row changes on the server so the next open starts from the saved text. */
const forgetDraft = (store: DraftStore, r: ReviewRecord) => store.delete(draftKey(r));

const marksOf = (row: Homework): Mark[] => (Array.isArray(row.teacher_marks) ? row.teacher_marks : Array.isArray(row.ai_marks) ? row.ai_marks : []);
const markAt = (marks: Mark[], index: number) => marks.find((m) => Number(m.position) === index) || marks[index];
/** What the box shows for one question: the teacher's edit if there is one, else the mark as found. */
const awardedFor = (draft: Draft, mark: Mark, index: number) => draft.marks.get(index) ?? (Number(mark.awarded) || 0);

/** The marks as they stand on screen, which is what gets returned. */
const marksFromScreen = (record: ReviewRecord, draft: Draft): Mark[] | undefined => {
    if (record.assignment?.kind !== "listening" || !record.homework) return undefined;
    const source = marksOf(record.homework);
    const rows = record.assignment.questions.map((_, i) => ({ i, mark: markAt(source, i) })).filter((x) => x.mark);
    if (!rows.length) return undefined;
    return rows.map(({ i, mark }) => ({ position: i, awarded: awardedFor(draft, mark!, i), available: Number(mark!.available) || 0, note: mark!.note || "" }));
};

type Inner = Omit<ReviewDrawerProps, "record"> & { record: ReviewRecord; tz: string; store: DraftStore };

const submitReview = async (p: Inner, record: ReviewRecord, draft: Draft, redraw: () => void) => {
    if (draft.busy) return;
    draft.busy = true;
    redraw();
    try {
        if (record.type === "checkin") {
            if (!record.checkin) return;
            const feedback = draft.feedback.trim();
            if (!feedback && !record.checkin.voice_note) throw new Error("Write a reply or record a voice note first.");
            const row = await api<Checkin>(`/api/admin/checkins/${record.checkin.id}/return`, { method: "POST", json: { feedback } });
            p.patchRow("checkin", row);
        } else if (record.type === "homework") {
            if (!record.homework) return;
            const corrections = draft.corrections.trim();
            const generalFeedback = draft.general.trim();
            // Either section is a complete reply on its own now that only the corrections are
            // drafted; the server applies the same rule.
            if (!corrections && !generalFeedback && !record.homework.voice_note) throw new Error("Write some feedback, or record a voice note, before returning this homework.");
            const row = await api<Homework>(`/api/admin/homework/${record.homework.id}/return`, { method: "POST", json: { corrections, generalFeedback, marks: marksFromScreen(record, draft) } });
            p.patchRow("homework", row);
        }
        forgetDraft(p.store, record);
        toast("Feedback submitted to student");
        await p.onSubmitted();
    } catch (e) {
        toast(errMsg(e));
    } finally {
        draft.busy = false;
        redraw();
    }
};

const Footer = (p: Inner & { nav: ReactNode }) => {
    const { record } = p;
    const redraw = useDraftSync();
    const draft = useDraft(p.store, record);
    /* ⌘Enter anywhere in the drawer: the same as pressing the submit button. */
    const latest = useRef({ p, record, draft, redraw });
    latest.current = { p, record, draft, redraw };
    useEffect(() => {
        if (record.type === "attendance") return;
        const go = () => {
            const { p, record, draft, redraw } = latest.current;
            if (!draft.busy) submitReview(p, record, draft, redraw);
        };
        document.addEventListener("gg-review-submit", go);
        return () => document.removeEventListener("gg-review-submit", go);
    }, [record.type]);
    let actions: ReactNode;
    if (record.type === "attendance") {
        actions = (
            <>
                <DuoButton color="secondary" size="sm" onPress={p.onClose}>
                    Close
                </DuoButton>
                <DuoButton
                    size="sm"
                    isDisabled={draft.busy}
                    onPress={async () => {
                        draft.busy = true;
                        redraw();
                        try {
                            const row = await api<Attendance>(`/api/admin/attendance/${record.week.id}/${record.student.id}`, {
                                method: "PUT",
                                json: { status: draft.attendance.status, minutes: Number(draft.attendance.minutes) || 0, notes: draft.attendance.notes },
                            });
                            p.patchRow("attendance", row);
                            forgetDraft(p.store, record);
                            toast("Attendance updated");
                            await p.onAttendanceSaved();
                        } catch (e) {
                            toast(errMsg(e));
                        } finally {
                            draft.busy = false;
                            redraw();
                        }
                    }}
                >
                    Save Attendance
                </DuoButton>
            </>
        );
    } else {
        const row = record.type === "checkin" ? record.checkin : record.homework;
        if (!row || row.status === "draft") {
            actions = (
                <>
                    <DuoButton color="secondary" size="sm" onPress={p.onClose}>
                        Close
                    </DuoButton>
                    <NudgeButton {...p} record={record} />
                </>
            );
        } else {
            const saveDraft = async () => {
                try {
                    if (record.type === "checkin" && record.checkin) {
                        const r = await api<Checkin>(`/api/admin/checkins/${record.checkin.id}/feedback-draft`, { method: "PATCH", json: { feedback: draft.feedback } });
                        p.patchRow("checkin", r);
                        toast("Reply draft saved");
                    } else if (record.homework) {
                        const r = await api<Homework>(`/api/admin/homework/${record.homework.id}/feedback-draft`, { method: "PATCH", json: { corrections: draft.corrections, generalFeedback: draft.general } });
                        p.patchRow("homework", r);
                        toast("Feedback draft saved");
                    }
                } catch (e) {
                    toast(errMsg(e));
                }
            };
            const returned = row.status === "returned";
            actions = (
                <>
                    <DuoButton color="secondary" size="sm" onPress={saveDraft} isDisabled={draft.busy}>
                        Save Draft
                    </DuoButton>
                    <DuoButton size="sm" isDisabled={draft.busy} onPress={() => submitReview(p, record, draft, redraw)} data-review-submit>
                        {record.type === "checkin" ? (returned ? "Update Submitted Reply" : "Submit Reply") : returned ? "Update Submitted Feedback" : "Submit Feedback"}
                    </DuoButton>
                </>
            );
        }
    }
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>{p.nav}</div>
            <div className="flex flex-wrap justify-end gap-2">{actions}</div>
        </div>
    );
};

const Body = (p: Inner) => {
    const { record } = p;
    const sync = useDraftSync();
    const draft = useDraft(p.store, record);
    const set = (patch: Partial<Draft>) => {
        Object.assign(draft, patch);
        sync();
    };

    if (record.type === "attendance") {
        const a = record.attendance;
        const source = a?.source === "csv" ? "Imported from a CSV upload" : a ? "Set by hand" : "Nothing recorded yet";
        return (
            <>
                <DetailGrid className="sm:grid-cols-2">
                    <Detail label="Student">{record.student.name}</Detail>
                    <Detail label="Source">{source}</Detail>
                </DetailGrid>
                <div className="mt-6">
                    <FieldLabel>Attendance status</FieldLabel>
                    <DuoSelect
                        label="Attendance status"
                        value={draft.attendance.status}
                        onChange={(v) => set({ attendance: { ...draft.attendance, status: v as AttendanceStatus } })}
                        className="w-full"
                        items={[
                            { id: "live", label: "Attended live" },
                            { id: "partial", label: "Partially attended" },
                            { id: "recording", label: "Watched the recording" },
                            { id: "missed", label: "Did not attend" },
                            { id: "unknown", label: "Not recorded" },
                        ]}
                    />
                    <Hint className="mt-1.5">Only "attended live" shows as green on the tracker. Watching the recording does not count as live attendance.</Hint>
                </div>
                <div className="mt-5">
                    <FieldLabel>Minutes attended</FieldLabel>
                    <input type="number" min={0} max={1440} aria-label="Minutes attended" value={draft.attendance.minutes} onChange={(e) => set({ attendance: { ...draft.attendance, minutes: e.target.value } })} className={cx(TEXTAREA_CLASS, "py-2.5")} />
                </div>
                <div className="mt-5">
                    <FieldLabel>Internal notes</FieldLabel>
                    <textarea rows={3} aria-label="Internal notes" placeholder="Only you can see this." value={draft.attendance.notes} onChange={(e) => set({ attendance: { ...draft.attendance, notes: e.target.value } })} className={cx(TEXTAREA_CLASS, "resize-y")} />
                </div>
            </>
        );
    }

    if (record.type === "checkin") {
        const row = record.checkin;
        if (!row || row.status === "draft") return <MissingWorkPanel {...p} record={record} type="checkin" />;
        const answers = row.answers || {};
        const submit = () => submitReview(p, record, draft, sync);
        return (
            <>
                <DetailGrid className="sm:grid-cols-4">
                    <Detail label="Understanding">{answers.understanding || "—"}/10</Detail>
                    <Detail label="Confidence">{answers.confidence || "—"}/10</Detail>
                    <Detail label="Reviewed material">{answers.reviewed || "—"}</Detail>
                    <Detail label="Status">{row.status === "returned" ? "Returned" : "Submitted"}</Detail>
                </DetailGrid>
                <SubHead>Weekly win</SubHead>
                <AnswerBox>{answers.weeklyWin || "No weekly win submitted."}</AnswerBox>
                <SubHead>Support requested</SubHead>
                <AnswerBox>{answers.support || "No support requested."}</AnswerBox>
                <Lifecycle {...p} record={record} state={row.feedback_state} kind="checkin" draft={draft} />
                <TeacherBox id="checkin-feedback" label="Teacher response" value={draft.feedback} onChange={(v) => set({ feedback: v })} onSubmit={submit} hint="Enter submits. Shift + Enter adds a new line." className="mt-4" />
                <div className="mt-4">
                    <VoiceNoteBlock<Checkin> type="checkin" id={row.id} note={row.voice_note} onRow={(r) => p.patchRow("checkin", r)} />
                </div>
            </>
        );
    }

    const row = record.homework;
    const assignment = record.assignment!;
    if (!row || row.status === "draft") return <MissingWorkPanel {...p} record={record} type="homework" />;
    const answers = Array.isArray(row.answers) ? row.answers : [];
    const submit = () => submitReview(p, record, draft, sync);
    const listening = assignment.kind === "listening";
    const marks = marksOf(row);
    return (
        <>
            <DetailGrid className="sm:grid-cols-2">
                <Detail label="Assignment">{assignment.title}</Detail>
                <Detail label="Questions answered">
                    {answers.filter((a) => String(a ?? "").trim()).length}/{assignment.questions.length}
                </Detail>
            </DetailGrid>
            {assignment.questions.map((q, i) => {
                const mark = listening ? markAt(marks, i) : undefined;
                return (
                    <div key={q.id || i}>
                        <SubHead>Question {i + 1}</SubHead>
                        <AnswerBox>
                            <strong className="text-primary">{q.prompt}</strong>
                            <br />
                            <br />
                            {String(answers[i] ?? "") || "No answer submitted."}
                        </AnswerBox>
                        {mark && (
                            /* The machine's mark on one question, for the teacher to agree with or not. The
                               number is an input, not a label: a mark that cannot be changed is not a review. */
                            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border-2 border-secondary px-3 py-2 text-sm">
                                <label className="flex items-center gap-2 font-bold text-primary">
                                    Marks
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        max={Number(mark.available) || 0}
                                        value={awardedFor(draft, mark, i)}
                                        onChange={(e) => {
                                            draft.marks.set(i, Number(e.target.value) || 0);
                                            sync();
                                        }}
                                        className="w-16 rounded-lg border-2 border-secondary bg-primary px-2 py-1 text-center font-bold text-primary outline-hidden focus:border-brand"
                                        aria-label={`Marks for question ${i + 1}`}
                                    />
                                    of {Number(mark.available) || 0}
                                </label>
                                <span className="text-xs text-quaternary">{mark.note || ""}</span>
                            </div>
                        )}
                    </div>
                );
            })}
            {listening && <MarkSummary row={row} />}
            <SubmittedFiles files={row.files} />
            <Lifecycle {...p} record={record} state={row.feedback_state} kind="homework" draft={draft} />
            <TeacherBox
                id="homework-corrections"
                label="1. Irish corrections"
                mode="light"
                value={draft.corrections}
                onChange={(v) => set({ corrections: v })}
                onSubmit={submit}
                className="mt-4"
                hint={<>If there are no genuine errors, this should say “No Irish corrections needed.” Dictation here only adds punctuation, so your Irish is never rewritten.</>}
            />
            {draft.corrections.trim() && (
                <details className="mt-3 rounded-2xl border-2 border-secondary bg-secondary/40 p-3">
                    <summary className="cursor-pointer text-sm font-bold text-secondary">How the student will see these corrections</summary>
                    <div className="mt-3">
                        <Corrections text={draft.corrections} compact />
                    </div>
                </details>
            )}
            <TeacherBox id="homework-general" label="2. General feedback" value={draft.general} onChange={(v) => set({ general: v })} onSubmit={submit} className="mt-4" hint="Enter submits. Shift + Enter adds a new line." />
            <div className="mt-4">
                <VoiceNoteBlock<Homework> type="homework" id={row.id} note={row.voice_note} onRow={(r) => p.patchRow("homework", r)} />
            </div>
        </>
    );
};

const MarkSummary = ({ row }: { row: Homework }) => {
    const score = row.teacher_score ?? row.ai_score;
    const max = row.teacher_max ?? row.ai_max;
    if (score === null || score === undefined) {
        return <div className="mt-4 rounded-2xl border-2 border-dashed border-secondary px-4 py-3 text-sm text-tertiary">This was not marked automatically. Mark it yourself and it will go out with your feedback.</div>;
    }
    const dialect = row.listening_dialect ? DIALECT_LABELS[row.listening_dialect] || row.listening_dialect : null;
    return (
        <div className="mt-4 flex flex-col gap-1 rounded-2xl border-2 border-brand bg-brand-primary px-4 py-3">
            <strong className="text-lg font-bold text-primary">
                {score} out of {max}
            </strong>
            <span className="text-xs text-tertiary">
                Marked automatically when it was submitted{dialect ? `, listened in ${dialect}` : ""}
                {row.listening_plays ? `, played ${row.listening_plays} time${row.listening_plays === 1 ? "" : "s"}` : ""}. The student sees nothing until you submit your feedback.
            </span>
        </div>
    );
};

/* What the student handed up, and the text that was read out of it, which is what the corrections
   were actually generated from, so it is worth seeing. */
const SubmittedFiles = ({ files }: { files: HomeworkFile[] | null | undefined }) => {
    if (!files?.length) return null;
    return (
        <>
            <SubHead>Uploaded work</SubHead>
            <div className="flex flex-col gap-2">
                {files.map((f) => (
                    <div key={f.id} className="rounded-2xl border-2 border-secondary p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <a href={`/api/media/homework-file/${f.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-xl border-2 border-secondary px-3 py-1.5 text-sm font-bold text-brand-secondary hover:bg-primary_hover">
                                <CellIcon.book className="size-4" /> {f.fileName}
                            </a>
                            <span className="text-xs text-quaternary">
                                {fmtBytes(f.sizeBytes)}
                                {f.extractionState === "done" ? "" : f.extractionState === "failed" ? " · could not be read automatically" : " · not read"}
                            </span>
                        </div>
                        {f.extractedText && (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-sm font-bold text-secondary">What was read from it</summary>
                                <div className="mt-2">
                                    <AnswerBox>{f.extractedText}</AnswerBox>
                                </div>
                            </details>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
};

const LABELS: Record<string, string> = { none: "No draft", generating: "Generating", ai_drafted: "AI drafted", teacher_edited: "Teacher edited", returned: "Submitted to student", failed: "Draft failed" };

const Lifecycle = (p: Inner & { record: ReviewRecord; state: FeedbackState; kind: "checkin" | "homework"; draft: Draft }) => {
    const { record, state, kind, draft } = p;
    const sync = useDraftSync();
    const [busy, setBusy] = useState(false);
    const { on, correctionsOnly } = draftingFor(p.drafting, kind);
    /* With drafting off for this kind of work there is no button to offer and the note says so,
       rather than claiming a draft could not be generated. With only the corrections drafted, the
       note says which half is the teacher's. */
    const noun = kind === "checkin" ? "reply" : "feedback";
    const notes: Partial<Record<FeedbackState, string>> = {
        ai_drafted: correctionsOnly ? "The Irish corrections are drafted. Check them, then write the general feedback yourself." : "Review and edit before sending.",
        failed: on ? `The AI draft could not be generated. Write the ${noun} yourself, or try again.` : `The AI draft could not be generated. Write the ${noun} yourself.`,
        none: on ? "No AI draft was generated for this submission." : `Drafting is switched off for ${kind === "checkin" ? "check-ins" : "homework"} under Feedback drafting. Write the ${noun} yourself.`,
    };
    const retryable = on && ["failed", "none", "ai_drafted", "teacher_edited"].includes(state);
    const fresh = state === "failed" || state === "none";
    const buttonLabel = correctionsOnly ? (fresh ? "Draft Irish Corrections" : "Redraft Irish Corrections") : fresh ? "Generate AI Draft" : "Regenerate Draft";

    /* The AI draft can fail (API down, key rotated). Rather than leaving the teacher to start from
       nothing, offer a retry that overwrites the draft. */
    const redraft = async () => {
        const isCheckin = kind === "checkin";
        const row = isCheckin ? record.checkin : record.homework;
        if (!row) return;
        const existing = isCheckin ? draft.feedback.trim() : [draft.corrections.trim(), draft.general.trim()].filter(Boolean).join("");
        if (existing && !(await askConfirm({ title: "Replace what is written?", message: "A fresh AI draft overwrites the text currently in the box.", confirmLabel: "Generate a new draft" }))) return;
        setBusy(true);
        try {
            const updated = await api<Checkin | Homework>(`/api/admin/${isCheckin ? "checkins" : "homework"}/${row.id}/redraft`, { method: "POST" });
            if (isCheckin) {
                const c = updated as Checkin;
                draft.feedback = c.teacher_feedback || c.ai_feedback || "";
                p.patchRow("checkin", c);
            } else {
                const h = updated as Homework;
                draft.corrections = h.teacher_corrections || h.ai_corrections || "";
                draft.general = h.teacher_general_feedback || h.ai_general_feedback || "";
                p.patchRow("homework", h);
            }
            sync();
            toast("AI draft ready to review");
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
            <Pill tone={state === "returned" ? "green" : state === "failed" ? "red" : "orange"}>{LABELS[state] || state}</Pill>
            {notes[state] && <span className="text-xs text-tertiary">{notes[state]}</span>}
            {retryable && (
                <DuoButton color="secondary" size="xs" iconLeading={SparkIcon} isDisabled={busy} onPress={redraft} className="ml-auto">
                    {busy ? "Generating…" : buttonLabel}
                </DuoButton>
            )}
        </div>
    );
};

/* What you see when you click a cell with nothing in it. The point of this screen is not the absent
   feedback, it is deciding whether to chase the student. */
const MissingWorkPanel = (p: Inner & { record: ReviewRecord; type: "checkin" | "homework" }) => {
    const { record, type, tz } = p;
    const isCheckin = type === "checkin";
    const deadline = isCheckin ? record.week.checkin_due_at : record.assignment!.reopened_until || record.assignment!.deadline_at;
    const closed = isCheckin ? record.week.checkin_hard_deadline !== false && Date.now() > new Date(deadline).getTime() : assignmentClosed(record.assignment!);
    const draft = isCheckin ? record.checkin : record.homework;
    const off = isCheckin && record.week.checkin_enabled === false;
    const first = firstName(record.student.name);
    const Icon = CellIcon[off ? "talk" : closed ? "x" : isCheckin ? "talk" : "book"];
    const [history, setHistory] = useState<string>("");

    /* Shows when this student was last chased about this exact thing. */
    const loadHistory = async () => {
        const params = new URLSearchParams({ studentId: record.student.id, type: record.type });
        if (isCheckin) params.set("weekId", record.week.id);
        else params.set("assignmentId", record.assignment!.id);
        try {
            const { lastSentAt } = await api<{ lastSentAt: string | null }>(`/api/admin/nudge/history?${params}`);
            setHistory(lastSentAt ? `Last reminded ${fmtDate(lastSentAt, { time: true, weekday: true, dateStyle: "short" }, tz)}.` : "No reminder sent about this yet.");
        } catch {
            setHistory("");
        }
    };
    useEffect(() => {
        loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record.student.id, record.week.id, record.assignment?.id]);
    useEffect(() => {
        const f = () => loadHistory();
        nudgeSubs.add(f);
        return () => void nudgeSubs.delete(f);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <DetailGrid className="sm:grid-cols-2">
                <Detail label={isCheckin ? "Week" : "Assignment"}>{isCheckin ? `Week of ${fmtWeek(record.week.week_start)}` : record.assignment!.title}</Detail>
                <Detail label={closed ? "Closed" : "Due"}>{fmtDate(deadline, { time: true, weekday: true, dateStyle: "short" }, tz)}</Detail>
            </DetailGrid>
            <div className={cx("mt-6 flex items-start gap-4 rounded-2xl border-2 p-4", off ? "border-secondary bg-secondary" : closed ? "border-error_subtle bg-error-primary/40" : "border-secondary bg-secondary")}>
                <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", off ? PILL.grey : closed ? PILL.red : PILL.grey)}>
                    <Icon className="size-5" />
                </span>
                <div className="text-sm">
                    <strong className="block text-md font-bold text-primary">{off ? "No check-in was set for this week" : closed ? "The deadline passed with nothing submitted" : "Nothing submitted yet"}</strong>
                    <span className="text-tertiary">
                        {off ? "This week was switched off, so nothing was expected." : draft ? `${first} started it and saved a draft, but has not sent it.` : `${first} has not opened it yet.`}
                        {off ? "" : " Feedback stays blank until something is submitted, and no AI draft is generated."}
                    </span>
                </div>
            </div>
            <Hint className="mt-3">{history}</Hint>
        </>
    );
};

const nudgeSubs = new Set<() => void>();
let settingsCache: Settings | null = null;

const NudgeButton = (p: Inner & { record: ReviewRecord }) => {
    const { record, tz } = p;
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const isCheckin = record.type === "checkin";
    const first = firstName(record.student.name);
    const itemTitle = isCheckin ? `Week of ${fmtWeek(record.week.week_start)}` : record.assignment!.title;

    const openModal = async () => {
        const settings = settingsCache?.nudge ? settingsCache : await api<Settings>("/api/settings").catch(() => null);
        if (settings) settingsCache = settings;
        const nudge = settings?.nudge || {};
        const deadline = fmtDate(isCheckin ? record.week.checkin_due_at : record.assignment!.reopened_until || record.assignment!.deadline_at, { time: true, weekday: true, dateStyle: "short" }, tz);
        const fill = (template?: string) =>
            String(template || "")
                .replace(/\{\{\s*first_name\s*\}\}/g, first)
                .replace(/\{\{\s*item_title\s*\}\}/g, itemTitle)
                .replace(/\{\{\s*deadline\s*\}\}/g, deadline)
                .replace(/\{\{\s*link\s*\}\}/g, location.origin);
        setSubject(fill(isCheckin ? nudge.checkinSubject : nudge.homeworkSubject) || `A quick nudge about ${itemTitle}`);
        setBody(fill(isCheckin ? nudge.checkinBody : nudge.homeworkBody) || `Hi ${first},\n\n${itemTitle} has not come in yet. You can pick it up at ${location.origin}.`);
        setOpen(true);
    };

    const send = async () => {
        setSending(true);
        try {
            const result = await api<{ status: string; to: string }>("/api/admin/nudge", {
                method: "POST",
                json: { studentId: record.student.id, type: record.type, weekId: isCheckin ? record.week.id : undefined, assignmentId: isCheckin ? undefined : record.assignment!.id, subject, body },
            });
            setOpen(false);
            toast(result.status === "simulated" ? "Email is in test mode, so nothing was actually delivered" : `Reminder sent to ${result.to}`);
            nudgeSubs.forEach((f) => f());
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <DuoButton size="sm" iconLeading={MailIcon} onPress={openModal}>
                Send a Reminder
            </DuoButton>
            <DuoDialog open={open} onClose={() => setOpen(false)} title={`Remind ${first}`} sub={`${record.student.email} · ${itemTitle}`} className="max-w-2xl">
                <FieldLabel>Subject</FieldLabel>
                <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={cx(TEXTAREA_CLASS, "py-2.5")} />
                <TeacherBox id="nudge-body" label="Message" value={body} onChange={setBody} rows={9} noFormat className="mt-4" />
                <Hint className="mt-3">Edit anything before it goes. The wording you start from is on the Email reminders screen.</Hint>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <DuoButton color="secondary" size="sm" onPress={() => setOpen(false)}>
                        Cancel
                    </DuoButton>
                    <DuoButton size="sm" onPress={send} isDisabled={sending}>
                        {sending ? "Sending…" : `Send to ${first}`}
                    </DuoButton>
                </div>
            </DuoDialog>
        </>
    );
};
