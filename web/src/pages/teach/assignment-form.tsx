// Create or edit an assignment: the old hub's assignmentForm + openAssignmentModal, questionBuilder,
// uploadSettingsBlock, markAssignmentSaved and the B/I format bar, as one dialog. The parent mounts
// it fresh each time it opens, so the state below starts from the assignment being edited.
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { toast } from "@/components/app/toast";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Toggle } from "@/components/base/toggle/toggle";
import { api, upload } from "@/lib/portal";
import {
    type AdminClassRow,
    type Assignment,
    type AssignmentKind,
    type AssignmentPayload,
    type AssignmentResource,
    FIELD_CLASS,
    FILE_TYPE_CHOICES,
    type FileTypeKey,
    type UploadedFiles,
    classLabel,
    fmtDate,
    fromZonedInput,
    tidyUrl,
    timezoneAbbreviation,
    toZonedInput,
} from "@/lib/teach-calendar";
import { cx } from "@/utils/cx";
import { ListeningPanel } from "./listening-panel";

type QuestionDraft = { key: number; prompt: string; imageUrl: string; imageFile: File | null; expectedAnswer: string; marks: number; required: boolean };
let qKey = 0;
const blankQuestion = (): QuestionDraft => ({ key: ++qKey, prompt: "", imageUrl: "", imageFile: null, expectedAnswer: "", marks: 1, required: true });

const Field = ({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) => (
    <div>
        <FieldLabel>{label}</FieldLabel>
        {children}
        {hint && <p className="mt-1.5 text-sm text-quaternary">{hint}</p>}
    </div>
);

const SectionTitle = ({ children }: { children: ReactNode }) => <h3 className="mt-2 border-t-2 border-secondary pt-5 text-md font-bold text-primary">{children}</h3>;

/** Two big cards acting as a radio group (kind of assignment, kind of deadline). */
const ChoiceCards = <K extends string>({ value, onChange, label, items }: { value: K; onChange: (k: K) => void; label: string; items: { id: K; title: string; note: string }[] }) => (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => {
            const on = it.id === value;
            return (
                <button
                    key={it.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange(it.id)}
                    className={cx(
                        "rounded-2xl border-2 p-3 text-left outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                        on ? "border-brand bg-brand-primary" : "border-secondary bg-primary hover:bg-primary_hover",
                    )}
                >
                    <span className={cx("block font-bold", on ? "text-brand-secondary" : "text-primary")}>{it.title}</span>
                    <span className="mt-0.5 block text-sm text-tertiary">{it.note}</span>
                </button>
            );
        })}
    </div>
);

/* The buttons over a box that takes formatting. Nothing clever: they wrap what is selected, or drop
   the markers in and put the cursor between them. Pressing bold on something already bold takes it
   off again. */
const wrapSelection = (box: HTMLTextAreaElement, marker: string, set: (v: string) => void) => {
    const start = box.selectionStart;
    const end = box.selectionEnd;
    const chosen = box.value.slice(start, end);
    const before = box.value.slice(0, start);
    const after = box.value.slice(end);
    let next: string;
    let range: [number, number];
    if (chosen && before.endsWith(marker) && after.startsWith(marker)) {
        next = before.slice(0, -marker.length) + chosen + after.slice(marker.length);
        range = [start - marker.length, end - marker.length];
    } else {
        next = `${before}${marker}${chosen}${marker}${after}`;
        range = [start + marker.length, end + marker.length];
    }
    set(next);
    requestAnimationFrame(() => {
        box.focus();
        box.setSelectionRange(range[0], range[1]);
    });
};

export const AssignmentDialog = ({
    assignment,
    classes,
    defaultClassId,
    prefillDeadline,
    timezone,
    onClose,
    onSaved,
}: {
    assignment: Assignment | null;
    classes: AdminClassRow[];
    defaultClassId?: string | null;
    /** "YYYY-MM-DDTHH:mm" in the class zone, from clicking a calendar day */
    prefillDeadline?: string | null;
    timezone: string;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}) => {
    /* A recording belongs to an assignment, so there is nothing to upload against until one exists.
       The first save turns this from a create into an edit in place: the recordings block goes live
       underneath and the teacher carries on. */
    const [saved, setSaved] = useState<{ id: string; status: Assignment["status"] } | null>(assignment ? { id: assignment.id, status: assignment.status } : null);
    const [live, setLive] = useState<string | null>(null); // the "Published." banner text once a listening activity is saved
    const [saving, setSaving] = useState(false);

    const [classId, setClassId] = useState(assignment?.class_id || defaultClassId || classes[0]?.id || "");
    /* The tracker's deep link (and a quick click on Create) can open this before the classes have
       arrived. The select then shows the first class while the state is still empty, and the save is
       refused for a class nobody could see was missing. Adopt the first class once there is one. */
    useEffect(() => {
        if (!classId && classes[0]) setClassId(classes[0].id);
    }, [classes, classId]);
    const [title, setTitle] = useState(assignment?.title || "");
    const [kind, setKind] = useState<AssignmentKind>(assignment?.kind === "listening" ? "listening" : "written");
    const [listeningText, setListeningText] = useState(assignment?.listening_text || "");
    const [listeningTextShown, setListeningTextShown] = useState(Boolean(assignment?.listening_text_shown));
    const [instructions, setInstructions] = useState(assignment?.instructions || "");
    const [loomUrl, setLoomUrl] = useState(assignment?.loom_url || "");
    const [visibleAt, setVisibleAt] = useState(toZonedInput(assignment?.visible_at || new Date(), timezone));
    const [deadlineAt, setDeadlineAt] = useState(assignment?.deadline_at ? toZonedInput(assignment.deadline_at, timezone) : prefillDeadline || toZonedInput(new Date(Date.now() + 7 * 86400000), timezone));
    const [deadlineKind, setDeadlineKind] = useState<"hard" | "soft">(assignment?.hard_deadline === false ? "soft" : "hard");
    const [remindersEnabled, setRemindersEnabled] = useState(assignment?.reminders_enabled !== false);
    const [allowUploads, setAllowUploads] = useState(Boolean(assignment?.allow_uploads));
    const [uploadsRequired, setUploadsRequired] = useState(Boolean(assignment?.uploads_required));
    const [acceptedFileTypes, setAcceptedFileTypes] = useState<FileTypeKey[]>(assignment?.accepted_file_types || ["image", "pdf"]);
    const [maxFiles, setMaxFiles] = useState(String(Number(assignment?.max_files || 3)));
    const [files, setFiles] = useState<File[]>([]);
    const [existing] = useState<AssignmentResource[]>(() =>
        (assignment?.resources || []).map((r) => {
            const raw = r as AssignmentResource & { filename?: string; fileurl?: string; mimetype?: string };
            return { fileName: raw.fileName || raw.filename || "", fileUrl: raw.fileUrl || raw.fileurl || "", mimeType: raw.mimeType || raw.mimetype || "" };
        }),
    );
    const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
        assignment?.questions?.length
            ? assignment.questions.map((q) => {
                  const raw = q as typeof q & { image_url?: string | null; expected_answer?: string | null };
                  return { key: ++qKey, prompt: q.prompt || "", imageUrl: q.imageUrl || raw.image_url || "", imageFile: null, expectedAnswer: q.expectedAnswer || raw.expected_answer || "", marks: Number(q.marks ?? 1), required: q.required !== false };
              })
            : [blankQuestion()],
    );

    const instructionsRef = useRef<HTMLTextAreaElement>(null);
    const listeningBlockRef = useRef<HTMLElement>(null);
    const listening = kind === "listening";

    const fmt = (marker: string) => (e: MouseEvent) => {
        // Down rather than click, so the box does not lose its selection first.
        e.preventDefault();
        if (instructionsRef.current) wrapSelection(instructionsRef.current, marker, setInstructions);
    };
    const fmtKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        const key = e.key.toLowerCase();
        if (key === "b") (e.preventDefault(), wrapSelection(e.currentTarget, "**", setInstructions));
        if (key === "i") (e.preventDefault(), wrapSelection(e.currentTarget, "*", setInstructions));
    };

    const patchQ = (key: number, patch: Partial<QuestionDraft>) => setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
    const removeQ = (key: number) => {
        if (questions.length <= 1) return toast("At least one question is required");
        setQuestions((qs) => qs.filter((q) => q.key !== key));
    };

    const save = async () => {
        setSaving(true);
        try {
            const resources: AssignmentResource[] = [...existing];
            if (files.length) {
                const form = new FormData();
                files.forEach((file) => form.append("files", file));
                const uploaded = await upload<UploadedFiles>("/api/admin/uploads", form);
                /* The upload answers with `url`; the assignment wants `fileUrl`. Spreading the answer
                   straight in sent the wrong key, and every attached handout was refused on save. */
                resources.push(...uploaded.files.map((file) => ({ fileName: file.fileName, fileUrl: file.url, mimeType: file.mimeType || "" })));
            }
            const out: AssignmentPayload["questions"] = [];
            for (const q of questions) {
                let imageUrl: string | null = q.imageUrl || null;
                if (q.imageFile) {
                    const form = new FormData();
                    form.append("files", q.imageFile);
                    const uploadedImage = await upload<UploadedFiles>("/api/admin/uploads", form);
                    imageUrl = uploadedImage.files[0]?.url || imageUrl;
                }
                const prompt = q.prompt.trim();
                const expectedAnswer = q.expectedAnswer.trim();
                /* A block added with the Add question button and then left entirely empty carries no
                   intent, so it is dropped rather than refused. */
                if (!prompt && !expectedAnswer && !imageUrl) continue;
                out.push({ prompt, imageUrl, required: q.required, expectedAnswer, marks: Number(q.marks) || 1 });
            }
            const payload: AssignmentPayload = {
                classId: assignment?.class_id || classId,
                title,
                instructions,
                loomUrl: tidyUrl(loomUrl),
                visibleAt: fromZonedInput(visibleAt, timezone),
                deadlineAt: fromZonedInput(deadlineAt, timezone),
                hardDeadline: deadlineKind === "hard",
                remindersEnabled,
                allowUploads,
                uploadsRequired,
                acceptedFileTypes,
                maxFiles: Number(maxFiles) || 3,
                status: saved?.status || assignment?.status || "published",
                questions: out,
                resources,
                kind,
                listeningText: listeningText || "",
                listeningTextShown,
            };
            const written = await api<Assignment | { ok: true }>(saved ? `/api/admin/assignments/${saved.id}` : "/api/admin/assignments", { method: saved ? "PUT" : "POST", json: payload });
            const wasNew = !saved;
            const now = saved ?? { id: (written as Assignment).id, status: payload.status };
            if (wasNew) setSaved(now);
            await onSaved();

            /* A listening activity is not finished until it has something to play, so the dialog stays
               open on the recordings rather than closing on a story nobody can hear. */
            if (payload.kind === "listening") {
                toast(wasNew ? "Published. Now add the recordings." : "Assignment updated");
                const when = payload.visibleAt ? fmtDate(payload.visibleAt, { weekday: true, time: true, dateStyle: "medium", timeZone: timezone }) : null;
                setLive(when ? `Students see it from ${when}.` : "Students can see it now.");
                setTimeout(() => listeningBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
                return;
            }
            onClose();
            toast(wasNew ? "Assignment published" : "Assignment updated");
        } catch (e) {
            toast((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const tzNote = `Times are ${timezone} (${timezoneAbbreviation(timezone)}).`;
    const klass = classes.find((k) => k.id === (assignment?.class_id || classId));

    return (
        <DuoDialog open onClose={onClose} title={assignment ? "Edit assignment" : "Create assignment"} sub="Students complete multiple questions one at a time. Drafts save automatically." className="max-w-3xl max-h-[92vh] overflow-y-auto">
            {live && (
                <div className="mb-5 rounded-2xl border-2 border-success-primary bg-success-primary p-4 text-sm text-success-primary">
                    <strong>Published.</strong> {live} Add the recordings below, then press Done.
                </div>
            )}
            <div className="flex flex-col gap-5">
                <Field label="Class">
                    {assignment ? (
                        <div className={cx(FIELD_CLASS, "opacity-60")}>{classLabel(klass) || assignment.classLabel}</div>
                    ) : (
                        <DuoSelect label="Class" value={classId} onChange={setClassId} items={classes.map((k) => ({ id: k.id, label: classLabel(k) }))} className="w-full" />
                    )}
                </Field>
                <Field label="Title">
                    <input aria-label="Title" className={FIELD_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} required />
                </Field>
                <Field label="What kind of assignment">
                    <ChoiceCards
                        label="Kind of assignment"
                        value={kind}
                        onChange={setKind}
                        items={[
                            { id: "written", title: "Written", note: "Questions they answer in writing." },
                            { id: "listening", title: "Listening", note: "A story they listen to, then questions about it." },
                        ]}
                    />
                </Field>

                {listening && (
                    <section className="rounded-2xl border-2 border-secondary bg-secondary_subtle p-4">
                        <div className="mb-3 flex items-start gap-3">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-solid text-sm font-bold text-white">1</span>
                            <div>
                                <p className="font-bold text-primary">The story</p>
                                <p className="text-sm text-quaternary">What they will hear. Plain text, written the way it should be read out.</p>
                            </div>
                        </div>
                        <textarea aria-label="The story" rows={8} placeholder="Paste the story here." value={listeningText} onChange={(e) => setListeningText(e.target.value)} className={cx(FIELD_CLASS, "resize-y")} />
                        <Toggle className="mt-3" isSelected={listeningTextShown} onChange={setListeningTextShown} label="Show the text straight away, rather than making them listen first" />
                    </section>
                )}
                {listening && (
                    <section ref={listeningBlockRef} className="rounded-2xl border-2 border-secondary bg-secondary_subtle p-4">
                        <div className="mb-3 flex items-start gap-3">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-solid text-sm font-bold text-white">2</span>
                            <div>
                                <p className="font-bold text-primary">The recording</p>
                                <p className="text-sm text-quaternary">What students hear. One is usually all you need.</p>
                            </div>
                        </div>
                        <ListeningPanel assignmentId={saved?.id ?? null} />
                    </section>
                )}

                <Field
                    label={
                        <span className="flex items-center gap-3">
                            Instructions page
                            <span className="inline-flex gap-1 normal-case tracking-normal">
                                <button type="button" title="Bold (Ctrl+B)" onMouseDown={fmt("**")} className="size-6 rounded-md border border-secondary bg-primary text-xs font-bold text-secondary hover:bg-primary_hover">
                                    B
                                </button>
                                <button type="button" title="Italic (Ctrl+I)" onMouseDown={fmt("*")} className="size-6 rounded-md border border-secondary bg-primary text-xs font-bold italic text-secondary hover:bg-primary_hover">
                                    I
                                </button>
                            </span>
                        </span>
                    }
                    hint="Students read this as a page of its own, then press Start. Leave it blank and they go straight to the first question."
                >
                    <textarea
                        ref={instructionsRef}
                        id="assignment-instructions"
                        aria-label="Instructions page"
                        rows={6}
                        placeholder="What to do, roughly how long it takes, what to hand in."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        onKeyDown={fmtKeys}
                        className={cx(FIELD_CLASS, "resize-y")}
                    />
                </Field>
                <Field label="Loom share or embed URL">
                    <input aria-label="Loom share or embed URL" type="url" className={FIELD_CLASS} value={loomUrl} onChange={(e) => setLoomUrl(e.target.value)} placeholder="https://www.loom.com/share/..." />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Visible from" hint={tzNote}>
                        <input aria-label="Visible from" type="datetime-local" className={FIELD_CLASS} value={visibleAt} onChange={(e) => setVisibleAt(e.target.value)} required />
                    </Field>
                    <Field label="Deadline" hint="It shows on the tracker in the week of this deadline.">
                        <input aria-label="Deadline" type="datetime-local" className={FIELD_CLASS} value={deadlineAt} onChange={(e) => setDeadlineAt(e.target.value)} required />
                    </Field>
                </div>
                <Field label="When the deadline passes">
                    <ChoiceCards
                        label="When the deadline passes"
                        value={deadlineKind}
                        onChange={setDeadlineKind}
                        items={[
                            { id: "hard", title: "Hard", note: "The assignment closes. Students see that the deadline has passed and the questions are not shown." },
                            { id: "soft", title: "Soft", note: "Students can still hand it in, and the submission is marked late." },
                        ]}
                    />
                </Field>
                <Toggle isSelected={remindersEnabled} onChange={setRemindersEnabled} label="Email reminders" />

                {/* Whether this assignment takes files at all, and which ones. */}
                <div className={cx("rounded-2xl border-2 p-4", allowUploads ? "border-brand bg-brand-primary/40" : "border-secondary")}>
                    <Toggle isSelected={allowUploads} onChange={setAllowUploads} label="Let students upload files with this homework" className="max-w-full" />
                    {allowUploads && (
                        <div className="mt-4 flex flex-col gap-4">
                            <p className="text-sm text-quaternary">Uploads are read into text automatically, so a photo of handwritten Irish goes through the same corrections as anything typed in.</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {FILE_TYPE_CHOICES.map((choice) => (
                                    <Checkbox
                                        key={choice.value}
                                        isSelected={acceptedFileTypes.includes(choice.value)}
                                        onChange={(on) => setAcceptedFileTypes((cur) => (on ? [...cur.filter((c) => c !== choice.value), choice.value] : cur.filter((c) => c !== choice.value)))}
                                        label={choice.label}
                                        hint={choice.hint}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-5">
                                <Toggle isSelected={uploadsRequired} onChange={setUploadsRequired} label="A file must be uploaded to submit" />
                                <label className="flex items-center gap-2 text-sm font-medium text-secondary">
                                    Up to
                                    <input type="number" min={1} max={10} value={maxFiles} onChange={(e) => setMaxFiles(e.target.value)} aria-label="Maximum files" className={cx(FIELD_CLASS, "w-20 px-3 py-2")} />
                                    file(s)
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <SectionTitle>Files students can use</SectionTitle>
                <div>
                    <input aria-label="Files students can use" type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="block w-full text-sm text-secondary file:mr-3 file:rounded-xl file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-bold file:text-secondary" />
                    <p className="mt-1.5 text-sm text-quaternary">Handouts, PDFs, images, anything they need alongside the questions.</p>
                    {listening && (
                        <p className="mt-1.5 text-sm text-quaternary">
                            <b>Not the listening recording.</b> That goes under <b>The recordings</b> above, one per dialect, so students can choose which to hear.
                        </p>
                    )}
                    {existing.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {existing.map((r, i) => (
                                <span key={i} className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-tertiary">
                                    {r.fileName}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <SectionTitle>Rolling questions</SectionTitle>
                <div className="flex flex-col gap-4">
                    {questions.map((q, index) => (
                        <div key={q.key} className="rounded-2xl border-2 border-secondary p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <strong className="text-primary">Question {index + 1}</strong>
                                <button type="button" onClick={() => removeQ(q.key)} className="text-sm font-bold text-brand-secondary hover:underline">
                                    Remove
                                </button>
                            </div>
                            <div className="flex flex-col gap-4">
                                <Field label="Question">
                                    <textarea aria-label={`Question ${index + 1}`} rows={3} value={q.prompt} onChange={(e) => patchQ(q.key, { prompt: e.target.value })} className={cx(FIELD_CLASS, "resize-y")} required />
                                </Field>
                                <Field label="Embedded image, optional">
                                    <input aria-label="Existing image URL" type="url" value={q.imageUrl} onChange={(e) => patchQ(q.key, { imageUrl: e.target.value })} placeholder="Existing image URL" className={FIELD_CLASS} />
                                    <input aria-label="Upload an image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => patchQ(q.key, { imageFile: e.target.files?.[0] ?? null })} className="mt-2 block w-full text-sm text-secondary file:mr-3 file:rounded-xl file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-bold file:text-secondary" />
                                </Field>
                                {listening && (
                                    <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                                        <Field label="What a right answer looks like, optional">
                                            <textarea aria-label="Expected answer" rows={2} value={q.expectedAnswer} onChange={(e) => patchQ(q.key, { expectedAnswer: e.target.value })} placeholder="Leave blank and the marking takes the answer from the story. Type one only if a particular point must count." className={cx(FIELD_CLASS, "resize-y")} />
                                        </Field>
                                        <Field label="Marks">
                                            <input aria-label="Marks" type="number" min={0} max={100} value={q.marks} onChange={(e) => patchQ(q.key, { marks: Number(e.target.value) })} className={FIELD_CLASS} />
                                        </Field>
                                    </div>
                                )}
                                <Toggle isSelected={q.required} onChange={(on) => patchQ(q.key, { required: on })} label="Required" />
                            </div>
                        </div>
                    ))}
                    <div>
                        <DuoButton color="secondary" size="sm" onPress={() => setQuestions((qs) => [...qs, blankQuestion()])}>
                            Add question
                        </DuoButton>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" onPress={onClose}>
                    {live ? "Done" : "Cancel"}
                </DuoButton>
                <DuoButton onPress={save} isDisabled={saving}>
                    {saving ? "Saving…" : saved ? "Save changes" : "Publish assignment"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
