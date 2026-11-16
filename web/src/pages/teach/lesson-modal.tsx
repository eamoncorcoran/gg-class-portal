// Adding or editing a lesson: the host is chosen and the link pasted; whole URLs and bare ids both
// work, because nobody should have to know which one their host wants. A practice lesson is picked
// from the studio instead of pasted. Handouts (PDF or Word) are attached to a lesson that already
// exists. Ported from openLessonModal in app.js; the attachments use the hub's
// /lessons/:id/attachments routes, which the old screen never exposed.
import { useEffect, useRef, useState } from "react";
import { Trash01 } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";
import { useNavigate } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, DuoInput, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { toast } from "@/components/app/toast";
import { api, upload } from "@/lib/portal";
import { type AdminLesson, type LessonAttachment, type PracticeLesson, PROVIDERS, type VideoProvider, detectVideoHost, fmtBytes } from "@/lib/teach-courses";
import { CheckRow } from "./plan-builder";

const field = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear focus:border-brand";

export const LessonModal = ({ open, onClose, moduleId, lesson, onSaved }: { open: boolean; onClose: () => void; moduleId: string | null; lesson: AdminLesson | null; onSaved: (edited: boolean) => void | Promise<void> }) => {
    const navigate = useNavigate();
    const [title, setTitle] = useState("");
    const [provider, setProvider] = useState<VideoProvider | "">("");
    const [minutes, setMinutes] = useState("");
    const [recordedOn, setRecordedOn] = useState("");
    const [video, setVideo] = useState("");
    const [practiceRef, setPracticeRef] = useState("");
    const [passcode, setPasscode] = useState("");
    const [notes, setNotes] = useState("");
    const [published, setPublished] = useState(true);
    const [busy, setBusy] = useState(false);
    const [studio, setStudio] = useState<PracticeLesson[] | null | "asking">(null);
    const [studioError, setStudioError] = useState("");
    const [attachments, setAttachments] = useState<LessonAttachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    /* Handouts are written to the server the moment they are added, not on Save, so a dialog closed
       with Cancel has still changed the lesson. The course page is told so it redraws them. */
    const attachmentsChanged = useRef(false);
    const close = () => {
        onClose();
        if (attachmentsChanged.current) {
            attachmentsChanged.current = false;
            void onSaved(true);
        }
    };

    useEffect(() => {
        if (!open) return;
        setTitle(lesson?.title || "");
        setProvider(lesson?.videoProvider || "");
        setMinutes(lesson?.durationSeconds ? String(Math.round(lesson.durationSeconds / 60)) : "");
        setRecordedOn(lesson?.recordedOn ? String(lesson.recordedOn).slice(0, 10) : "");
        setVideo(lesson?.videoProvider === "practice" ? "" : lesson?.videoRef || "");
        setPracticeRef(lesson?.videoProvider === "practice" ? lesson.videoRef || "" : "");
        setPasscode(lesson?.videoPasscode || "");
        setNotes(lesson?.notes || "");
        setPublished(lesson === null || Boolean(lesson.published));
        setAttachments(lesson?.attachments || []);
        setStudio(null);
        setStudioError("");
        setBusy(false);
        attachmentsChanged.current = false;
    }, [open, lesson]);

    /* The studio's lessons, fetched the first time they are wanted rather than for every lesson
       edited, most of which are recordings. */
    const practice = provider === "practice";
    useEffect(() => {
        if (!open || !practice || studio !== null) return;
        setStudio("asking");
        api<{ lessons: PracticeLesson[] }>("/api/admin/live/practice-lessons")
            .then((d) => setStudio(d.lessons || []))
            .catch((err: Error) => {
                setStudio([]);
                setStudioError(err.message);
            });
    }, [open, practice, studio]);

    /* The host is read off the link as it is pasted, so the dropdown shows what will be saved
       rather than the person having to tell the software what the URL already says. */
    const readHost = (value: string) => {
        setVideo(value);
        const link = value.trim();
        if (!link) return;
        const host = detectVideoHost(link);
        if (host && !provider) setProvider(host);
    };

    const save = async () => {
        const body = {
            title: title.trim(),
            notes: notes.trim(),
            videoProvider: provider || null,
            video: provider === "practice" ? practiceRef.trim() || null : video.trim() || null,
            durationSeconds: minutes ? Number(minutes) * 60 : null,
            recordedOn: recordedOn || null,
            videoPasscode: passcode.trim() || null,
            published,
        };
        if (!body.title) return toast("Give the lesson a title.");
        if (body.videoProvider === "practice" && !body.video) return toast("Choose which studio lesson this is.");
        setBusy(true);
        try {
            if (lesson) await api(`/api/admin/lessons/${lesson.id}`, { method: "PATCH", json: body });
            else await api(`/api/admin/modules/${moduleId}/lessons`, { method: "POST", json: body });
            attachmentsChanged.current = false; // the reload below covers them
            onClose();
            await onSaved(Boolean(lesson));
            toast(lesson ? "Lesson saved" : "Lesson added");
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const attach = async (file: File | undefined | null) => {
        if (!file || !lesson) return;
        const form = new FormData();
        form.append("file", file);
        setUploading(true);
        try {
            const row = await upload<{ id: string; url: string; file_name: string; mime_type: string; size_bytes: number }>(`/api/admin/lessons/${lesson.id}/attachments`, form);
            setAttachments((list) => [...list, { id: row.id, url: row.url, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: row.size_bytes }]);
            attachmentsChanged.current = true;
            toast("Handout added");
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = "";
        }
    };
    const detach = async (a: LessonAttachment) => {
        try {
            await api(`/api/admin/lesson-attachments/${a.id}`, { method: "DELETE" });
            setAttachments((list) => list.filter((x) => x.id !== a.id));
            attachmentsChanged.current = true;
            toast("Handout removed");
        } catch (err) {
            toast((err as Error).message);
        }
    };

    const studioList = Array.isArray(studio) ? studio : [];
    const studioOptions = [
        { id: "", label: !Array.isArray(studio) ? "Looking in the studio" : studioError ? studioError : studioList.length ? "Choose a lesson" : "Nothing in the studio yet" },
        ...studioList.map((item) => ({ id: item.id, label: `${item.title}${item.course ? ` (${item.course})` : ""} · ${item.phrases} phrase${item.phrases === 1 ? "" : "s"}` })),
    ];

    return (
        <DuoDialog open={open} onClose={close} title={lesson ? "Edit lesson" : "New lesson"} className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex flex-col gap-4">
                <div>
                    <FieldLabel>Title</FieldLabel>
                    <DuoInput value={title} onChange={setTitle} ariaLabel="Title" placeholder="Week 1: An aimsir chaite" autoFocus={!lesson} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="min-w-0">
                        <FieldLabel>Recording host</FieldLabel>
                        <DuoSelect label="Recording host" value={provider} onChange={(v) => setProvider(v as VideoProvider | "")} className="w-full" items={[{ id: "", label: "No recording yet" }, ...PROVIDERS]} />
                    </div>
                    <div>
                        <FieldLabel>Length in minutes</FieldLabel>
                        <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Length in minutes" className={field} />
                    </div>
                    <div>
                        <FieldLabel>Recorded on</FieldLabel>
                        <input type="date" value={recordedOn} onChange={(e) => setRecordedOn(e.target.value)} aria-label="Recorded on" className={field} />
                    </div>
                </div>
                {practice ? (
                    <div>
                        <FieldLabel>Practice lesson</FieldLabel>
                        <DuoSelect label="Practice lesson" value={practiceRef} onChange={setPracticeRef} className="w-full" items={studioOptions} />
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-quaternary">
                            A video with phrases the student says aloud, built in the studio. The student sees it here, in this course, with a mic under the video.
                            <DuoButton
                                size="xs"
                                color="secondary"
                                onPress={() => {
                                    close();
                                    navigate("/teach/live?tab=studio");
                                }}
                            >
                                Open the studio
                            </DuoButton>
                        </p>
                    </div>
                ) : (
                    <div>
                        <FieldLabel>Link or id</FieldLabel>
                        <DuoInput value={video} onChange={readHost} ariaLabel="Link or id" placeholder="Paste the share link" />
                        <p className="mt-2 text-xs text-quaternary">A whole link or a bare id, whichever you have. A Zoom recording opens on Zoom rather than playing here, because Zoom does not allow its recordings to play inside another site, so students get a button that takes them to it.</p>
                    </div>
                )}
                {provider === "zoom" && (
                    <div>
                        <FieldLabel>Zoom passcode</FieldLabel>
                        <DuoInput value={passcode} onChange={setPasscode} ariaLabel="Zoom passcode" maxLength={60} placeholder="e.g. 8Xk?2wQz" />
                        <p className="mt-2 text-xs text-quaternary">Zoom shows this beside the share link. Without it the recording asks students for a passcode nobody gave them.</p>
                    </div>
                )}
                <div>
                    <FieldLabel>Notes</FieldLabel>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} aria-label="Notes" placeholder="What this class covered, and anything to do before the next one." className={`${field} resize-y`} />
                </div>
                <CheckRow checked={published} onChange={setPublished}>
                    Visible to students
                </CheckRow>

                {lesson && (
                    <div>
                        <FieldLabel>Handouts</FieldLabel>
                        {attachments.length > 0 && (
                            <ul className="mb-2 flex flex-col gap-1.5">
                                {attachments.map((a) => (
                                    <li key={a.id} className="flex items-center gap-3 rounded-xl border-2 border-secondary px-3 py-2">
                                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-primary hover:underline">
                                            {a.fileName}
                                        </a>
                                        <span className="text-xs text-quaternary">{fmtBytes(a.sizeBytes)}</span>
                                        <AriaButton aria-label={`Remove ${a.fileName}`} onPress={() => detach(a)} className="flex size-7 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring hover:bg-error-primary hover:text-error-primary focus-visible:outline-2">
                                            <Trash01 aria-hidden="true" className="size-4" />
                                        </AriaButton>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-secondary px-4 py-4 text-center hover:bg-primary_hover">
                            <input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" disabled={uploading} onChange={(e) => attach(e.target.files?.[0])} />
                            <span className="text-sm text-secondary">
                                <b className="font-bold text-brand-secondary">{uploading ? "Uploading…" : "Add a handout"}</b>
                            </span>
                            <span className="text-xs text-quaternary">Lessons take PDFs and Word documents (.docx).</span>
                        </label>
                    </div>
                )}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={close}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={save} isDisabled={busy}>
                    {lesson ? "Save lesson" : "Add lesson"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
