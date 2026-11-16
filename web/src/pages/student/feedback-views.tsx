// What a student sees once work is in: their own answers read back, the teacher's reply (written,
// voice note, marks), and the celebration that follows a submission. Ported from the old
// showCheckinFeedback / showHomeworkFeedback / submitted*Block / studentScoreBlock / celebrationScreen.
import { Corrections } from "@/components/app/corrections";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Confetti } from "@/components/app/confetti";
import { DuoButton, DuoProgress } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { BookOpen01 } from "@/components/app/ic";
import { VoiceNotePlayer } from "@/components/app/recorder";
import { api } from "@/lib/portal";
import { type Assignment, type Checkin, type Homework, type VoiceNote, type Week, CHECKIN_LABELS, fmtDuration, fmtWeek, richText } from "@/lib/student";

export const SectionTitle = ({ children }: { children: ReactNode }) => <p className="mt-6 mb-2 duo-label text-quaternary first:mt-0">{children}</p>;

/** A green box with the teacher's words in it. */
export const FeedbackBox = ({ html, heading = "Feedback returned" }: { html: string; heading?: string }) => (
    <div className="rounded-2xl border-2 border-success-200 bg-success-primary p-4">
        <p className="mb-1.5 text-xs font-bold text-success-primary">✓ {heading}</p>
        <div className="prose prose-sm max-w-none text-secondary" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
);

export const StudentVoiceNote = ({ note }: { note: VoiceNote | null | undefined }) => {
    if (!note) return null;
    return (
        <div className="rounded-2xl border-2 border-secondary bg-secondary p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-primary">Voice note from your teacher</span>
                <span className="text-xs text-tertiary tabular-nums">{fmtDuration(note.seconds)}</span>
            </div>
            <VoiceNotePlayer src={note.url} seconds={note.seconds} label="Voice note from your teacher" />
        </div>
    );
};

/* A student's own answers, read back to them. Once something is handed in the first thing anyone
   wants to know is what they actually said. */
export const SubmittedCheckinBlock = ({ checkin }: { checkin: Checkin | undefined }) => {
    const answers = checkin?.answers || {};
    const rows: [string, string][] = (
        [
            ["attendance", answers.attendance],
            ["reviewed", answers.reviewed],
            ["understanding", answers.understanding ? `${answers.understanding}/10` : ""],
            ["confidence", answers.confidence ? `${answers.confidence}/10` : ""],
            ["weeklyWin", answers.weeklyWin],
            ["support", answers.support],
        ] as [string, string | number | undefined][]
    )
        .filter(([, v]) => String(v ?? "").trim())
        .map(([k, v]) => [k, String(v)]);
    if (!rows.length) return null;
    return (
        <>
            <SectionTitle>What you sent</SectionTitle>
            <div className="grid gap-2">
                {rows.map(([key, value]) => (
                    <div key={key} className="rounded-2xl border-2 border-secondary bg-primary px-4 py-3">
                        <p className="duo-label text-quaternary">{CHECKIN_LABELS[key] || key}</p>
                        <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap text-secondary">{value}</p>
                    </div>
                ))}
            </div>
        </>
    );
};

export const SubmittedHomeworkBlock = ({ assignment, submission }: { assignment: Pick<Assignment, "questions"> | null | undefined; submission: Homework | null | undefined }) => {
    const answers = Array.isArray(submission?.answers) ? submission.answers : [];
    const questions = assignment?.questions || [];
    const files = submission?.files || [];
    if (!questions.length && !files.length) return null;
    return (
        <>
            <SectionTitle>What you sent</SectionTitle>
            <div className="grid gap-2">
                {questions.map((q, i) => (
                    <div key={q.id || i} className="rounded-2xl border-2 border-secondary bg-primary px-4 py-3">
                        <p className="duo-label text-quaternary">{q.prompt}</p>
                        <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap text-secondary">{answers[i] || "You left this one blank."}</p>
                    </div>
                ))}
                {files.length > 0 && (
                    <div className="rounded-2xl border-2 border-secondary bg-primary px-4 py-3">
                        <p className="duo-label text-quaternary">Files you uploaded</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {files.map((f) => (
                                <a key={f.id} href={`/api/media/homework-file/${f.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-xl border-2 border-secondary bg-primary px-3 py-1.5 text-xs font-bold text-brand-secondary hover:bg-primary_hover">
                                    <BookOpen01 aria-hidden="true" className="size-4" />
                                    {f.fileName}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

/* A mark, once the teacher has released it. Only ever drawn from the teacher's columns: the machine's
   are not sent to a student at all, so there is nothing here to fall back to and nothing to show early. */
export const StudentScoreBlock = ({ assignment, submission }: { assignment: Pick<Assignment, "kind">; submission: Homework }) => {
    if (assignment.kind !== "listening") return null;
    const score = submission.teacher_score;
    const max = submission.teacher_max;
    if (score === null || score === undefined || !max) return null;
    const marks = Array.isArray(submission.teacher_marks) ? submission.teacher_marks : [];
    const pct = Math.round((score / max) * 100);
    return (
        <div className="mb-4 rounded-2xl border-2 border-secondary bg-primary p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <strong className="text-lg font-bold text-primary">
                    {score} out of {max}
                </strong>
                <span className="text-xs text-tertiary">{pct}%</span>
            </div>
            <DuoProgress value={pct} className="h-3" color={pct >= 50 ? "bg-success-solid" : "bg-warning-solid"} />
            {marks.length > 0 && (
                <ul className="mt-3 grid gap-1.5">
                    {marks.map((m, i) => (
                        <li key={i} className="flex items-center justify-between text-sm text-secondary">
                            <span>Question {Number(m.position ?? i) + 1}</span>
                            <span className="text-xs text-tertiary tabular-nums">
                                {Number(m.awarded) || 0} of {Number(m.available) || 0}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const Done = ({ onClose }: { onClose: () => void }) => (
    <div className="mt-6 flex justify-end">
        <DuoButton size="sm" onPress={onClose}>
            Done
        </DuoButton>
    </div>
);

const SuccessBanner = ({ children }: { children: ReactNode }) => <div className="mb-4 rounded-2xl border-2 border-success-200 bg-success-primary px-4 py-3 text-sm font-semibold text-success-primary">{children}</div>;

/** Submitted and waiting on the teacher. */
export const SubmittedCheckinDialog = ({ checkin, week, onClose }: { checkin: Checkin; week: Week; onClose: () => void }) => (
    <DuoDialog open onClose={onClose} title="Your check-in" sub={`Week of ${fmtWeek(week.week_start)}`} className="max-w-3xl">
        <SuccessBanner>Submitted. Your teacher will reply here.</SuccessBanner>
        <SubmittedCheckinBlock checkin={checkin} />
        <Done onClose={onClose} />
    </DuoDialog>
);

export const SubmittedHomeworkDialog = ({ assignment, submission, onClose }: { assignment: Assignment; submission: Homework; onClose: () => void }) => (
    <DuoDialog open onClose={onClose} title="Your homework" sub={assignment.title} className="max-w-3xl">
        <SuccessBanner>Submitted. Your teacher will return corrections and feedback here.</SuccessBanner>
        <SubmittedHomeworkBlock assignment={assignment} submission={submission} />
        <Done onClose={onClose} />
    </DuoDialog>
);

/* Opening the reply marks it read on the server the moment the dialog shows (a failure there is
   swallowed, as before); `onRead` lets the tracker drop the unread dot and the badge count. */
const useMarkRead = (path: string, wasUnread: boolean, onRead: () => void) => {
    const done = useRef(false);
    useEffect(() => {
        if (done.current) return;
        done.current = true;
        api(path, { method: "POST" }).catch(() => undefined);
        if (wasUnread) onRead();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
};

export const CheckinFeedbackDialog = ({ checkin, week, onClose, onRead }: { checkin: Checkin; week: Week; onClose: () => void; onRead: () => void }) => {
    useMarkRead(`/api/student/checkins/${checkin.id}/read-feedback`, !checkin.feedback_read_at, onRead);
    const written = checkin.teacher_feedback || checkin.ai_feedback || "";
    return (
        <DuoDialog open onClose={onClose} title="Your check-in feedback" sub={`Week of ${fmtWeek(week.week_start)}`} className="max-w-3xl">
            <StudentVoiceNote note={checkin.voice_note} />
            {written && (
                <>
                    <SectionTitle>Feedback from your teacher</SectionTitle>
                    <FeedbackBox html={richText(written)} />
                </>
            )}
            <SubmittedCheckinBlock checkin={checkin} />
            <Done onClose={onClose} />
        </DuoDialog>
    );
};

export const HomeworkFeedbackDialog = ({ assignment, submission, onClose, onRead }: { assignment: Assignment; submission: Homework; onClose: () => void; onRead: () => void }) => {
    useMarkRead(`/api/student/homework/${submission.id}/read-feedback`, !submission.feedback_read_at, onRead);
    const corrections = submission.teacher_corrections || submission.ai_corrections || "";
    const general = submission.teacher_general_feedback || submission.ai_general_feedback || "";
    return (
        <DuoDialog open onClose={onClose} title={assignment.title} sub="Feedback from your teacher" className="max-w-3xl">
            <StudentScoreBlock assignment={assignment} submission={submission} />
            <StudentVoiceNote note={submission.voice_note} />
            {corrections && (
                <>
                    <SectionTitle>Corrections</SectionTitle>
                    <p className="mb-3 text-sm text-tertiary">What you wrote, with the slips marked, and the sentence put right underneath.</p>
                    <Corrections text={corrections} />
                </>
            )}
            {general && (
                <>
                    <SectionTitle>General feedback</SectionTitle>
                    <FeedbackBox html={richText(general)} />
                </>
            )}
            <SubmittedHomeworkBlock assignment={assignment} submission={submission} />
            <Done onClose={onClose} />
        </DuoDialog>
    );
};

/* Replaces the flat "thank you" that used to follow a submission. The confetti fires over the
   dialog; a milestone earns a second, bigger burst. */
export const CelebrationDialog = ({ title, line, milestone, onClose }: { title: string; line: string; milestone: number | null; onClose: () => void }) => {
    const [fire, setFire] = useState(0);
    useEffect(() => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        setFire(1);
        if (!milestone) return;
        const t = setTimeout(() => setFire(2), 700);
        return () => clearTimeout(t);
    }, [milestone]);
    return (
        <DuoDialog open onClose={onClose} title={<span className="sr-only">{title}</span>} className="relative overflow-hidden">
            <Confetti fire={fire} />
            <div className="relative text-center">
                <svg viewBox="0 0 52 52" aria-hidden="true" className="mx-auto size-16 fill-none stroke-success-500 stroke-[3] [stroke-linecap:round] [stroke-linejoin:round]">
                    <circle cx="26" cy="26" r="24" className="animate-in duration-500 zoom-in-50" />
                    <path d="M15 27l8 8 15-16" className="animate-in duration-500 fade-in" />
                </svg>
                <h2 className="mt-4 text-xl font-bold text-primary">{title}</h2>
                <p className="mt-2 text-md leading-7 text-tertiary">{line}</p>
                {milestone && (
                    <p className="mx-auto mt-4 max-w-max rounded-xl bg-success-primary px-4 py-2.5 text-sm text-success-primary">
                        That is <strong>{milestone}</strong> pieces of work handed in. Sin obair mhaith.
                    </p>
                )}
                <div className="mt-6">
                    <DuoButton onPress={onClose}>Back to My Deadlines</DuoButton>
                </div>
            </div>
        </DuoDialog>
    );
};
