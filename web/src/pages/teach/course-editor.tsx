// One course, open for the teacher: the player and the lesson being looked at on the left, the
// contents (sections and lessons, each with its own menu) down the side, and the dialogs that build
// it. Also home to the pieces the course grid shares with it: the course settings dialog, the
// manage menu (publish, duplicate, progress, delete) and the progress report. Ported from
// coursePage / courseContents / lessonPlayer / bindCourse / bindCourseAdmin and friends in app.js.
import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy01, DotsVertical, Edit01, Eye, EyeOff, FileCheck02, Play, Plus, Trash01, Users01 } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";
import { useNavigate, useSearchParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton, DuoProgress } from "@/components/app/duo";
import { DuoDialog, DuoInput, FieldLabel } from "@/components/app/duo-dialog";
import { toast } from "@/components/app/toast";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { type AdminClass, api, upload, useAdminBootstrap } from "@/lib/portal";
import {
    type AdminCourse,
    type AdminLesson,
    type AdminModule,
    type CourseImpact,
    type CourseRow,
    type ModuleImpact,
    type OrderShape,
    type PracticeLessonData,
    type PracticeVoice,
    type ProgressRow,
    allLessons,
    classLabel,
    currentOrder,
    fmtClock,
    fmtDate,
    initials,
    loadCourse,
    plural,
} from "@/lib/teach-courses";
import { cx } from "@/utils/cx";
import { LessonModal } from "./lesson-modal";
import { CheckRow, Pick as PickSelect } from "./plan-builder";

/* ---- the manage menu: the same actions from the card and from inside the course ---- */

/** The three-dots trigger of a menu. Its own button rather than Dropdown.DotsButton, which fixes the label to "Open menu". */
const Dots = ({ label, className }: { label: string; className?: string }) => (
    <AriaButton aria-label={label} className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-secondary hover:text-fg-secondary focus-visible:outline-2", className)}>
        <DotsVertical aria-hidden="true" className="size-5" />
    </AriaButton>
);

type Manageable = Pick<CourseRow, "id" | "title" | "published"> & Partial<Pick<CourseRow, "description" | "cover_url" | "open_to_all" | "classes">>;

/* Everything the server can do to a course, as a small menu rather than a dialog, because these
   are one-click actions and a modal for "unpublish" is a modal too many. */
export const CourseActions = ({ course, afterChange, afterDelete, children }: { course: Manageable; afterChange: () => void | Promise<void>; afterDelete: () => void; children?: ReactNode }) => {
    const navigate = useNavigate();
    const [editing, setEditing] = useState(false);
    const [progress, setProgress] = useState(false);
    const published = course.published !== false;

    /* Unpublishing is the reversible one, so it happens on the spot and says what it did. It is
       also how a past course is put away without losing it. */
    const setPublished = async (next: boolean) => {
        try {
            await api(`/api/admin/courses/${course.id}`, { method: "PATCH", json: { published: next } });
            await afterChange();
            toast(next ? "Course published" : "Course hidden from students");
        } catch (err) {
            toast((err as Error).message);
        }
    };
    /* Copying is how last year's course is run again. The copy arrives unpublished and enrolled in
       nothing, and we open it, because the next thing anybody wants is to change the dates in it. */
    const duplicate = async () => {
        try {
            const copy = await api<{ id: string }>(`/api/admin/courses/${course.id}/duplicate`, { method: "POST", json: {} });
            toast("Copied. The copy is a draft until you publish it.");
            navigate(`/teach/courses/${copy.id}`);
        } catch (err) {
            toast((err as Error).message);
        }
    };
    const remove = async () => {
        let impact: CourseImpact;
        try {
            impact = await api<CourseImpact>(`/api/admin/courses/${course.id}/impact`);
        } catch (err) {
            return toast((err as Error).message);
        }
        const ok = await askConfirm({
            title: `Delete “${course.title}”?`,
            message: `${plural(impact.lessons, "lesson")} and ${plural(impact.progress, "record")} of students having watched them go with it. This cannot be undone. To put a finished course away without losing it, unpublish it instead.`,
            confirmLabel: "Delete course",
            danger: true,
        });
        if (!ok) return;
        try {
            await api(`/api/admin/courses/${course.id}`, { method: "DELETE" });
            toast("Course deleted");
            afterDelete();
        } catch (err) {
            toast((err as Error).message);
        }
    };

    return (
        <>
            <Dropdown.Root>
                {children ?? <Dots label={`Manage ${course.title}`} className="size-9 rounded-xl border-2 border-secondary bg-primary shadow-sm hover:bg-primary_hover" />}
                <Dropdown.Popover placement="bottom right" className="w-60">
                    <Dropdown.Menu
                        aria-label={`Manage ${course.title}`}
                        onAction={(key) => {
                            if (key === "edit") setEditing(true);
                            else if (key === "publish") setPublished(!published);
                            else if (key === "duplicate") duplicate();
                            else if (key === "progress") setProgress(true);
                            else if (key === "delete") remove();
                        }}
                    >
                        <Dropdown.Item id="edit" icon={Edit01} label="Edit course" />
                        <Dropdown.Item id="publish" icon={published ? EyeOff : Eye} label={published ? "Unpublish" : "Publish"} />
                        <Dropdown.Item id="duplicate" icon={Copy01} label="Duplicate" />
                        <Dropdown.Item id="progress" icon={Users01} label="Progress report" />
                        <Dropdown.Separator />
                        <Dropdown.Item id="delete" icon={Trash01}>
                            <span className="text-error-primary">Delete course</span>
                        </Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown.Root>
            <CourseModal open={editing} onClose={() => setEditing(false)} course={course} onSaved={afterChange} onDeleted={afterDelete} />
            <ProgressDialog open={progress} onClose={() => setProgress(false)} course={course} />
        </>
    );
};

/* ---- the progress report: how far each student has got (GET /courses/:id/progress) ---- */

export const ProgressDialog = ({ open, onClose, course }: { open: boolean; onClose: () => void; course: Manageable }) => {
    const [rows, setRows] = useState<ProgressRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!open) return;
        setRows(null);
        setError(null);
        api<{ students: ProgressRow[] }>(`/api/admin/courses/${course.id}/progress`)
            .then((d) => setRows(d.students))
            .catch((err: Error) => setError(err.message));
    }, [open, course.id]);
    const total = rows?.[0]?.lesson_count ?? 0;
    return (
        <DuoDialog open={open} onClose={onClose} title="Progress report" sub={`${course.title} · who has watched what${total ? `, out of ${plural(total, "published lesson")}` : ""}`} className="max-w-2xl">
            {error ? (
                <p className="text-sm text-error-primary">{error}</p>
            ) : !rows ? (
                <p className="text-sm text-quaternary">Loading…</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-tertiary">Nobody is enrolled on this course yet.</p>
            ) : (
                <div className="max-h-[60vh] overflow-auto rounded-2xl border-2 border-secondary">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-primary duo-label text-quaternary">
                            <tr>
                                <th className="px-3 py-2 text-left">Student</th>
                                <th className="px-3 py-2 text-left">Watched</th>
                                <th className="w-40 px-3 py-2 text-left">Progress</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-t-2 border-secondary">
                                    <td className="px-3 py-2 font-semibold text-primary">
                                        {String(r.name || "").trim() || "Unnamed"}
                                        {r.withdrawn && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-tertiary">Withdrawn</span>}
                                    </td>
                                    <td className="px-3 py-2 text-tertiary tabular-nums">
                                        {r.completed_count} of {r.lesson_count}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <DuoProgress value={r.percent} className="h-2.5" />
                                            <span className="w-10 text-right text-xs font-bold text-tertiary tabular-nums">{r.percent}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </DuoDialog>
    );
};

/* ---- the course settings dialog ---- */

/* The cover photo, in the same uploader the rest of the app uses. A course without one falls back to
   its initials on a tint rather than a photo somebody has to find, so this is genuinely optional. */
const CoverField = ({ value, onChange }: { value: string; onChange: (url: string) => void }) => {
    const [busy, setBusy] = useState(false);
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const send = async (file: File | undefined | null) => {
        if (!file) return;
        if (!/^image\//.test(file.type)) return toast("Choose an image file.");
        const form = new FormData();
        form.append("files", file);
        setBusy(true);
        try {
            const uploaded = await upload<{ files?: { url: string }[] }>("/api/admin/uploads", form);
            const url = uploaded.files?.[0]?.url;
            if (!url) throw new Error("The upload did not come back.");
            onChange(url);
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const drop = (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        send(e.dataTransfer?.files?.[0]);
    };
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className={cx("flex aspect-[2/1] w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-secondary bg-secondary sm:w-48", value && "border-transparent")} aria-hidden="true">
                {value ? <img src={value} alt="" className="size-full object-cover" /> : <span className="text-xs font-bold text-quaternary">No photo</span>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <label
                    onDragEnter={(e) => {
                        e.preventDefault();
                        setOver(true);
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setOver(true);
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={drop}
                    className={cx("flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition", over ? "border-brand bg-brand-primary" : "border-secondary bg-primary hover:bg-primary_hover", busy && "opacity-60")}
                >
                    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => send(e.target.files?.[0])} />
                    <span className="text-sm text-secondary">
                        <b className="font-bold text-brand-secondary">Click to upload</b> or drag a photo here
                    </span>
                    <span className="text-xs text-quaternary">{busy ? "Uploading…" : "PNG, JPG or WEBP. Landscape works best."}</span>
                </label>
                {value && (
                    <DuoButton size="xs" color="ghost" className="self-start" onPress={() => onChange("")}>
                        Remove photo
                    </DuoButton>
                )}
            </div>
        </div>
    );
};

export const CourseModal = ({ open, onClose, course, onSaved, onDeleted }: { open: boolean; onClose: () => void; course: Manageable | null; onSaved: (createdId?: string) => void | Promise<void>; onDeleted?: () => void }) => {
    const boot = useAdminBootstrap();
    const classes: AdminClass[] = boot?.classes ?? [];
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [cover, setCover] = useState("");
    const [openToAll, setOpenToAll] = useState(false);
    const [classIds, setClassIds] = useState<string[]>([]);
    const [published, setPublished] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        setTitle(course?.title || "");
        setDescription(course?.description || "");
        setCover(course?.cover_url || "");
        setOpenToAll(Boolean(course?.open_to_all));
        setClassIds((course?.classes || []).map((c) => c.id));
        setPublished(Boolean(course?.published));
        setBusy(false);
    }, [open, course]);

    const save = async () => {
        const body = {
            title: title.trim(),
            description: description.trim(),
            openToAll,
            classIds: openToAll ? [] : classIds,
            coverUrl: cover.trim() || null,
            published,
        };
        if (!body.title) return toast("Give the course a title.");
        setBusy(true);
        try {
            let createdId: string | undefined;
            if (course) await api(`/api/admin/courses/${course.id}`, { method: "PATCH", json: body });
            else createdId = (await api<{ id: string }>("/api/admin/courses", { method: "POST", json: body })).id;
            onClose();
            await onSaved(createdId);
            toast(course ? "Course saved" : "Course created");
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const remove = async () => {
        if (!course) return;
        let impact: CourseImpact;
        try {
            impact = await api<CourseImpact>(`/api/admin/courses/${course.id}/impact`);
        } catch (err) {
            return toast((err as Error).message);
        }
        const ok = await askConfirm({
            title: `Delete “${course.title}”?`,
            message: `${plural(impact.lessons, "lesson")} and ${plural(impact.progress, "record")} of students having watched them go with it. This cannot be undone.`,
            confirmLabel: "Delete course",
            danger: true,
        });
        if (!ok) return;
        try {
            await api(`/api/admin/courses/${course.id}`, { method: "DELETE" });
            onClose();
            toast("Course deleted");
            onDeleted?.();
        } catch (err) {
            toast((err as Error).message);
        }
    };

    return (
        <DuoDialog open={open} onClose={onClose} title={course ? "Course settings" : "New course"} sub="A course holds sections, and a section holds the class recordings." className="max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex flex-col gap-4">
                <div>
                    <FieldLabel>Title</FieldLabel>
                    <DuoInput value={title} onChange={setTitle} ariaLabel="Title" placeholder="Irish for Primary Teaching" autoFocus={!course} />
                </div>
                <div>
                    <FieldLabel>Description</FieldLabel>
                    <DuoInput value={description} onChange={setDescription} ariaLabel="Description" multiline />
                </div>
                <div>
                    <FieldLabel>Cover photo</FieldLabel>
                    <CoverField value={cover} onChange={setCover} />
                </div>
                <div>
                    <FieldLabel>Who sees it</FieldLabel>
                    <CheckRow checked={openToAll} onChange={setOpenToAll}>
                        Every class, including ones added later
                    </CheckRow>
                    {/* Picking classes is meaningless while the course is open to everybody. */}
                    <div className={cx("mt-2 flex flex-col gap-1.5 rounded-xl border-2 border-secondary p-3 transition", openToAll && "pointer-events-none opacity-40")}>
                        {classes.length ? (
                            classes.map((k) => (
                                <CheckRow key={k.id} checked={classIds.includes(k.id)} onChange={(on) => setClassIds((ids) => (on ? [...ids, k.id] : ids.filter((id) => id !== k.id)))} disabled={openToAll}>
                                    {classLabel(k)}
                                </CheckRow>
                            ))
                        ) : (
                            <p className="text-sm text-quaternary">No classes yet.</p>
                        )}
                    </div>
                </div>
                <CheckRow checked={published} onChange={setPublished}>
                    Visible to students
                </CheckRow>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                {course && (
                    <DuoButton color="danger" size="sm" onPress={remove}>
                        Delete
                    </DuoButton>
                )}
                <DuoButton size="sm" onPress={save} isDisabled={busy}>
                    {course ? "Save" : "Create course"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* ---- which sections are folded away, remembered on this device ---- */

const CLOSED_KEY = "gg-closed-modules";
const readClosed = (): Set<string> => {
    try {
        const saved = JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]");
        return new Set(Array.isArray(saved) ? saved : []);
    } catch {
        return new Set();
    }
};
const rememberClosed = (closed: Set<string>) => {
    try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed]));
    } catch {
        /* private window */
    }
};

/* ---- the player ---- */

/* An embedded host gets an iframe; a file we hold gets a plain <video>. Zoom will not play inside
   another site, so that is a door rather than a player: a clear button, and the passcode beside it. */
const Player = ({ lesson, frameRef, onFrameOrigin }: { lesson: AdminLesson | null; frameRef: React.RefObject<HTMLIFrameElement | null>; onFrameOrigin: (origin: string | null) => void }) => {
    const stage = "flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-secondary bg-secondary p-6 text-center";
    if (!lesson) return <div className={stage}>Pick a lesson from the list.</div>;
    if (!lesson.video)
        return (
            <div className={stage}>
                <strong className="text-lg font-bold text-primary">No recording yet</strong>
                <span className="text-sm text-tertiary">Add one by editing this lesson.</span>
            </div>
        );
    const v = lesson.video;
    if (v.type === "link")
        return (
            <div className={stage}>
                <Play aria-hidden="true" className="size-10 text-fg-quaternary" />
                <strong className="text-lg font-bold text-primary">This class was recorded on Zoom</strong>
                <p className="text-sm text-tertiary">It opens on Zoom in a new tab rather than playing here.</p>
                {v.passcode && (
                    <p className="text-sm text-tertiary">
                        Passcode <code className="rounded-md bg-primary px-1.5 py-0.5 font-mono font-bold text-primary">{v.passcode}</code>
                    </p>
                )}
                <a href={v.src} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-[50px] items-center gap-2 rounded-2xl border-2 border-transparent border-b-4 border-b-brand-700 bg-brand-500 px-4 text-[15px] font-bold tracking-[0.8px] text-white uppercase">
                    <Play aria-hidden="true" className="size-5" /> Watch the recording
                </a>
            </div>
        );
    if (v.type === "practice") return <PracticeFrame key={lesson.id} lesson={lesson} frameRef={frameRef} onOrigin={onFrameOrigin} />;
    if (v.type === "iframe") return <iframe title={lesson.title} src={v.src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen className="aspect-video w-full rounded-2xl border-2 border-secondary bg-black" />;
    return <video controls playsInline preload="metadata" src={v.src} className="aspect-video w-full rounded-2xl border-2 border-secondary bg-black" />;
};

/* A practice lesson is the live classroom's player inside this page. Its address is asked for when
   the lesson is opened, because it names the viewer. The course page is drawn several times as it
   opens, and each drawing would otherwise mint a fresh hand-off: one address per lesson, kept for a
   couple of minutes, well inside the hand-off's life. The player is served by the hub itself (its
   /live/ pages are not proxied), so the address is resolved against the hub's origin. */
const practiceUrls = new Map<string, { at: number; address: Promise<{ url: string }> }>();
const PracticeFrame = ({ lesson, frameRef, onOrigin }: { lesson: AdminLesson; frameRef: React.RefObject<HTMLIFrameElement | null>; onOrigin: (origin: string | null) => void }) => {
    const [src, setSrc] = useState<string | null>(null);
    const [wait, setWait] = useState<string | null>("Opening the practice lesson");
    useEffect(() => {
        const kept = practiceUrls.get(lesson.id);
        if (!kept || Date.now() - kept.at > 2 * 60 * 1000) practiceUrls.set(lesson.id, { at: Date.now(), address: api<{ url: string }>(`/api/admin/lessons/${lesson.id}/practice`) });
        let alive = true;
        practiceUrls
            .get(lesson.id)!
            .address.then(({ url }) => {
                if (!alive) return;
                const full = new URL(url, location.origin); // relative practice URLs resolve through the dev proxy (same origin)
                onOrigin(full.origin);
                setSrc(full.href);
            })
            .catch((err: Error) => alive && setWait(err.message));
        return () => {
            alive = false;
            onOrigin(null);
        };
    }, [lesson.id, onOrigin]);
    return (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-secondary bg-black">
            {src && <iframe ref={frameRef} src={src} title={lesson.title} allow="microphone; autoplay; fullscreen" allowFullScreen onLoad={() => setWait(null)} className="size-full" />}
            {wait && <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white/80">{wait}</div>}
        </div>
    );
};

/* The phrases of a practice lesson, beside the player rather than under it. Tapping one asks the
   player (which is its own page in a frame) to practise it; the player reports back which are
   done, and the ticks follow. */
let voicesOnce: Promise<PracticeVoice[]> | null = null;
const PracticePhrases = ({ lessonRef, frameRef, frameOrigin, progress }: { lessonRef: string; frameRef: React.RefObject<HTMLIFrameElement | null>; frameOrigin: string | null; progress: { doneIds: string[]; activeId: string | null } | null }) => {
    const [data, setData] = useState<PracticeLessonData | null>(null);
    const [voices, setVoices] = useState<PracticeVoice[]>([]);
    const [voice, setVoice] = useState("");
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                voicesOnce ??= api<PracticeVoice[]>("/api/live/voices");
                const vs = await voicesOnce;
                let saved = "";
                try {
                    saved = localStorage.getItem("gglive_voice") || "";
                } catch {
                    saved = "";
                }
                const lesson = await api<PracticeLessonData>(`/api/live/lessons/${encodeURIComponent(lessonRef)}`);
                if (!alive) return;
                setVoices(vs);
                setVoice(saved);
                setData(lesson);
            } catch (err) {
                if (alive) setError((err as Error).message);
            }
        })();
        return () => {
            alive = false;
        };
    }, [lessonRef]);
    const done = new Set(progress?.doneIds ?? []);
    const practise = (phraseId: string) => frameRef.current?.contentWindow?.postMessage({ source: "gg-portal", type: "practise", phraseId }, frameOrigin || "*");
    const pickVoice = (id: string) => {
        setVoice(id);
        // The player reads the voice from this same origin's storage on each replay.
        try {
            localStorage.setItem("gglive_voice", id);
        } catch {
            /* private window */
        }
        const v = voices.find((x) => x.id === id);
        if (v) {
            try {
                new Audio(`/api/live/tts?text=${encodeURIComponent(v.sample)}&voice=${encodeURIComponent(v.id)}`).play().catch(() => undefined);
            } catch {
                /* no audio */
            }
        }
    };
    return (
        <section className="border-t-2 border-secondary p-4">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold text-primary">Phrases in this lesson</p>
                <p className="text-xs font-semibold text-quaternary">{error ? error : data ? `${done.size} of ${data.phrases.length} said` : "Loading"}</p>
            </div>
            {data && (
                <>
                    <label className="mt-3 flex items-center gap-2 text-xs font-bold text-tertiary">
                        Voice
                        <PickSelect value={voice} onChange={pickVoice} ariaLabel="Voice" className="flex-1 px-2 py-1.5 text-xs">
                            {voices.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </PickSelect>
                    </label>
                    <ul className="mt-3 flex flex-col gap-1">
                        {data.phrases.map((p, i) => {
                            const ok = done.has(p.id);
                            const on = p.id === progress?.activeId;
                            return (
                                <li key={p.id}>
                                    <AriaButton onPress={() => practise(p.id)} className={cx("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-focus-ring transition hover:bg-primary_hover focus-visible:outline-2", on && "bg-brand-primary")}>
                                        <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", ok ? "bg-brand-solid text-white" : "bg-secondary text-tertiary")}>{ok ? "✓" : i + 1}</span>
                                        <span className="min-w-0 flex-1">
                                            <span lang="ga" className="block text-sm font-bold text-primary">
                                                {p.irish}
                                            </span>
                                            {p.english && <span className="block text-xs text-tertiary">{p.english}</span>}
                                        </span>
                                        <span className="text-xs text-quaternary tabular-nums">{fmtClock(p.at)}</span>
                                    </AriaButton>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
};

/* ---- small dialogs: a section's name, moving a lesson ---- */

/* Naming a section. This used to be window.prompt, which returns false without asking anything
   inside a sandboxed iframe. */
const SectionDialog = ({ open, onClose, courseId, module, onSaved }: { open: boolean; onClose: () => void; courseId: string; module: AdminModule | null; onSaved: () => Promise<void> }) => {
    const [title, setTitle] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (open) {
            setTitle(module?.title || "");
            setBusy(false);
        }
    }, [open, module]);
    const save = async () => {
        const t = title.trim();
        if (!t) return toast("Give the section a name.");
        setBusy(true);
        try {
            if (module) await api(`/api/admin/modules/${module.id}`, { method: "PATCH", json: { title: t } });
            else await api(`/api/admin/courses/${courseId}/modules`, { method: "POST", json: { title: t } });
            onClose();
            await onSaved();
            toast(module ? "Section renamed" : "Section added");
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <DuoDialog open={open} onClose={onClose} title={module ? "Rename section" : "Add a section"} sub="A section groups the recordings: a term, a module, a theme.">
            <FieldLabel>Section name</FieldLabel>
            <DuoInput value={title} onChange={setTitle} ariaLabel="Section name" maxLength={200} placeholder="Term 1: Foundations" autoFocus onEnter={save} />
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={save} isDisabled={busy}>
                    {module ? "Save" : "Add section"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* Moving a lesson to a different section. It goes to the end of wherever it lands, which is nearly
   always where a recording being filed belongs; from there it can be nudged up. */
const MoveLessonDialog = ({ move, course, onClose, onOrder }: { move: { lesson: AdminLesson; from: AdminModule } | null; course: AdminCourse; onClose: () => void; onOrder: (modules: OrderShape) => Promise<void> }) => {
    const others = course.modules.filter((m) => m.id !== move?.from.id);
    const [to, setTo] = useState("");
    useEffect(() => setTo(others[0]?.id ?? ""), [move]); // eslint-disable-line react-hooks/exhaustive-deps
    const save = async () => {
        if (!move || !to) return;
        const modules = currentOrder(course);
        for (const m of modules) m.lessons = m.lessons.filter((id) => id !== move.lesson.id);
        modules.find((m) => m.id === to)?.lessons.push(move.lesson.id);
        onClose();
        await onOrder(modules);
        toast("Lesson moved");
    };
    return (
        <DuoDialog open={Boolean(move)} onClose={onClose} title="Move to another section" sub={move ? `“${move.lesson.title}” is in ${move.from.title}.` : undefined}>
            <FieldLabel>Move it to</FieldLabel>
            <PickSelect value={to} onChange={setTo} ariaLabel="Move it to" className="w-full px-4 py-3 text-md">
                {others.map((m) => (
                    <option key={m.id} value={m.id}>
                        {m.title}
                    </option>
                ))}
            </PickSelect>
            <p className="mt-2 text-xs text-quaternary">It goes to the end of that section. Nobody’s record of having watched it is affected.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={save}>
                    Move lesson
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* ---- the course page ---- */

const IconBtn = ({ label, onPress, children, className }: { label: string; onPress?: () => void; children: ReactNode; className?: string }) => (
    <AriaButton aria-label={label} onPress={onPress} className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition hover:bg-secondary hover:text-fg-secondary focus-visible:outline-2", className)}>
        {children}
    </AriaButton>
);

export const CourseEditor = ({ courseId }: { courseId: string }) => {
    const navigate = useNavigate();
    const [sp, setSp] = useSearchParams();
    const [course, setCourse] = useState<AdminCourse | null>(null);
    const [closed, setClosed] = useState<Set<string>>(readClosed);
    const [section, setSection] = useState<{ module: AdminModule | null } | null>(null);
    const [lessonDialog, setLessonDialog] = useState<{ moduleId: string | null; lesson: AdminLesson | null } | null>(null);
    const [move, setMove] = useState<{ lesson: AdminLesson; from: AdminModule } | null>(null);
    const [editing, setEditing] = useState(false);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [frameOrigin, setFrameOrigin] = useState<string | null>(null);
    const [practiceProgress, setPracticeProgress] = useState<{ doneIds: string[]; activeId: string | null } | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            setCourse(await loadCourse(courseId));
        } catch (err) {
            toast((err as Error).message);
            navigate("/teach/courses", { replace: true });
        }
    }, [courseId, navigate]);
    useEffect(() => {
        load();
    }, [load]);

    /* The practice player reports how many phrases are done; the ticks beside it follow. (A
       student's lesson ticks itself complete at this point; the teacher's preview only watches.) */
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (!frameOrigin || event.origin !== frameOrigin) return;
            const msg = event.data;
            if (!msg || msg.source !== "gglive" || msg.type !== "progress") return;
            setPracticeProgress({ doneIds: msg.doneIds || [], activeId: msg.activeId || null });
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [frameOrigin]);

    const lessons = allLessons(course);
    const wanted = sp.get("lesson");
    // Straight to where they left off, unless a particular lesson was asked for.
    const lessonId = wanted && lessons.some((l) => l.id === wanted) ? wanted : (course?.resumeLessonId ?? null);
    const lesson = lessons.find((l) => l.id === lessonId) ?? null;
    const openLesson = (id: string | null) => {
        const next = new URLSearchParams(sp);
        if (id) next.set("lesson", id);
        else next.delete("lesson");
        setSp(next, { replace: true });
        if (id) stageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    };

    if (!course) return <p className="text-sm text-quaternary">Loading…</p>;

    const toggleModule = (id: string) => {
        const next = new Set(closed);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setClosed(next);
        rememberClosed(next);
    };

    /* Order. The whole shape of the course is sent each time rather than a single move. Rearranging
       locally first means the list is only ever saved in a state we have actually drawn. */
    const saveOrder = async (modules: OrderShape) => {
        try {
            await api(`/api/admin/courses/${course.id}/order`, { method: "PUT", json: { modules } });
            await load();
        } catch (err) {
            toast((err as Error).message);
        }
    };
    const moveModule = (index: number, by: number) => {
        const modules = currentOrder(course);
        const target = index + by;
        if (target < 0 || target >= modules.length) return;
        [modules[index], modules[target]] = [modules[target], modules[index]];
        return saveOrder(modules);
    };
    const moveLesson = (moduleIndex: number, lessonIndex: number, by: number) => {
        const modules = currentOrder(course);
        const ls = modules[moduleIndex].lessons;
        const target = lessonIndex + by;
        if (target < 0 || target >= ls.length) return;
        [ls[lessonIndex], ls[target]] = [ls[target], ls[lessonIndex]];
        return saveOrder(modules);
    };

    const deleteSection = async (module: AdminModule) => {
        let impact: ModuleImpact;
        try {
            impact = await api<ModuleImpact>(`/api/admin/modules/${module.id}/impact`);
        } catch (err) {
            return toast((err as Error).message);
        }
        const ok = await askConfirm({
            title: `Delete “${module.title}”?`,
            message: impact.lessons ? `${plural(impact.lessons, "lesson")} and ${plural(impact.progress, "record")} of students having watched them go with it. This cannot be undone. Move the lessons to another section first if you want to keep them.` : "This section is empty, so nothing else goes with it.",
            confirmLabel: "Delete section",
            danger: true,
        });
        if (!ok) return;
        try {
            await api(`/api/admin/modules/${module.id}`, { method: "DELETE" });
            openLesson(null);
            await load();
            toast("Section deleted");
        } catch (err) {
            toast((err as Error).message);
        }
    };
    const deleteLesson = async (l: AdminLesson | null) => {
        if (!l) return;
        const ok = await askConfirm({
            title: `Delete “${l.title}”?`,
            message: "The recording link and everybody’s record of having watched it go with it. This cannot be undone. To take it off students’ screens without losing it, unpublish it instead.",
            confirmLabel: "Delete lesson",
            danger: true,
        });
        if (!ok) return;
        try {
            await api(`/api/admin/lessons/${l.id}`, { method: "DELETE" });
            // Whatever was open may be the thing just deleted, so let the course decide.
            openLesson(null);
            await load();
            toast("Lesson deleted");
        } catch (err) {
            toast((err as Error).message);
        }
    };
    /* Taking one recording off students' screens without deleting it, the usual reason being that
       it was published before it was ready. */
    const setLessonPublished = async (l: AdminLesson, published: boolean) => {
        try {
            await api(`/api/admin/lessons/${l.id}`, { method: "PATCH", json: { title: l.title, published } });
            await load();
            toast(published ? "Lesson published" : "Lesson hidden from students");
        } catch (err) {
            toast((err as Error).message);
        }
    };

    let numbered = 0;

    return (
        <>
            <SectionHead
                kicker="Courses"
                title={course.title}
                sub={course.description || undefined}
                actions={
                    <>
                        <DuoButton size="sm" color="ghost" href="/teach/courses">
                            All courses
                        </DuoButton>
                        {course.published === false && <span className="self-center rounded-full bg-warning-primary px-2.5 py-1 text-xs font-bold text-warning-primary">Draft</span>}
                        <DuoButton size="sm" color="secondary" onPress={() => setEditing(true)}>
                            Edit course
                        </DuoButton>
                        <CourseActions course={course} afterChange={load} afterDelete={() => navigate("/teach/courses")}>
                            <AriaButton aria-label="More course actions" className="flex h-10.5 w-10.5 items-center justify-center rounded-2xl border-2 border-b-4 border-secondary bg-primary text-brand-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 pressed:translate-y-0.5 pressed:border-b-2">
                                <DotsVertical aria-hidden="true" className="size-5" />
                            </AriaButton>
                        </CourseActions>
                    </>
                }
            />

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div ref={stageRef} className="min-w-0 scroll-mt-24">
                    <Player lesson={lesson} frameRef={frameRef} onFrameOrigin={setFrameOrigin} />
                    {lesson && (
                        <>
                            <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                    <h2 className="text-display-xs font-bold tracking-tight text-primary">{lesson.title}</h2>
                                    <p className="mt-1.5 text-sm text-tertiary">
                                        {lesson.recordedOn ? `Recorded ${fmtDate(lesson.recordedOn, { dateStyle: "medium" })}` : ""}
                                        {lesson.durationLabel ? `${lesson.recordedOn ? " · " : ""}${lesson.durationLabel}` : ""}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <DuoButton size="sm" color="secondary" onPress={() => setLessonDialog({ moduleId: null, lesson })}>
                                        Edit lesson
                                    </DuoButton>
                                    <DuoButton size="sm" color="danger" onPress={() => deleteLesson(lesson)}>
                                        Delete
                                    </DuoButton>
                                </div>
                            </div>
                            {lesson.notes && <p className="mt-6 max-w-2xl text-md leading-8 whitespace-pre-line text-secondary">{lesson.notes}</p>}
                            {lesson.attachments?.length > 0 && (
                                <div className="mt-6 flex flex-col gap-2">
                                    {lesson.attachments.map((a) => {
                                        const format = /\.docx$/i.test(a.fileName || "") || String(a.mimeType || "").includes("wordprocessingml") ? "DOCX" : "PDF";
                                        return (
                                            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border-2 border-secondary bg-primary px-4 py-3 outline-focus-ring transition hover:bg-primary_hover focus-visible:outline-2">
                                                <FileCheck02 aria-hidden="true" className="size-5 shrink-0 text-fg-quaternary" />
                                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{a.fileName || "Document"}</span>
                                                <em className="text-xs font-bold text-quaternary not-italic">{format}</em>
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <aside className="self-start rounded-2xl border-2 border-secondary bg-primary">
                    <div className="border-b-2 border-secondary p-4">
                        <p className="text-md font-bold text-primary">{course.title}</p>
                        <p className="mt-1 text-xs font-semibold text-quaternary">{plural(course.lessonCount, "lesson")}</p>
                    </div>
                    {course.modules.map((module, moduleIndex) => {
                        const isClosed = closed.has(module.id);
                        const last = course.modules.length - 1;
                        const first = numbered;
                        numbered += module.lessons.length;
                        return (
                            <section key={module.id} className="border-b-2 border-secondary">
                                <div className="flex items-center gap-1 px-2 py-2">
                                    <IconBtn label={`${isClosed ? "Expand" : "Collapse"} ${module.title}`} onPress={() => toggleModule(module.id)}>
                                        <ChevronDown aria-hidden="true" className={cx("size-4 transition-transform", isClosed && "-rotate-90")} />
                                    </IconBtn>
                                    <span className="min-w-0 flex-1 truncate duo-label text-quaternary">{module.title}</span>
                                    <IconBtn label={`Add a lesson to ${module.title}`} onPress={() => setLessonDialog({ moduleId: module.id, lesson: null })}>
                                        <Plus aria-hidden="true" className="size-4" />
                                    </IconBtn>
                                    <Dropdown.Root>
                                        <Dots label={`Manage ${module.title}`} />
                                        <Dropdown.Popover placement="bottom right" className="w-56">
                                            <Dropdown.Menu
                                                aria-label={`Manage ${module.title}`}
                                                onAction={(key) => {
                                                    if (key === "rename") setSection({ module });
                                                    else if (key === "up") moveModule(moduleIndex, -1);
                                                    else if (key === "down") moveModule(moduleIndex, 1);
                                                    else if (key === "delete") deleteSection(module);
                                                }}
                                            >
                                                <Dropdown.Item id="rename" icon={Edit01} label="Rename section" />
                                                {moduleIndex > 0 ? <Dropdown.Item id="up" icon={ArrowUp} label="Move up" /> : null}
                                                {moduleIndex < last ? <Dropdown.Item id="down" icon={ArrowDown} label="Move down" /> : null}
                                                <Dropdown.Separator />
                                                <Dropdown.Item id="delete" icon={Trash01}>
                                                    <span className="text-error-primary">Delete section</span>
                                                </Dropdown.Item>
                                            </Dropdown.Menu>
                                        </Dropdown.Popover>
                                    </Dropdown.Root>
                                </div>
                                {!isClosed && (
                                    <ul className="pb-2">
                                        {module.lessons.map((l, lessonIndex) => {
                                            const number = first + lessonIndex + 1;
                                            const on = l.id === lessonId;
                                            const published = l.published !== false;
                                            const others = course.modules.filter((m) => m.id !== module.id);
                                            return (
                                                <li key={l.id} className={cx("flex items-center gap-1 border-l-4 pr-2", on ? "border-brand bg-brand-primary" : "border-transparent hover:bg-primary_hover")}>
                                                    <AriaButton onPress={() => openLesson(l.id)} aria-current={on ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left outline-focus-ring focus-visible:-outline-offset-2 focus-visible:outline-2">
                                                        <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", l.completed ? "bg-brand-solid text-white" : "bg-secondary text-tertiary")}>{l.completed ? "✓" : number}</span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className={cx("block truncate text-sm font-semibold", on ? "text-brand-secondary" : "text-secondary", !published && "opacity-60")}>{l.title}</span>
                                                            <span className="block text-xs text-quaternary">
                                                                {l.durationLabel || ""}
                                                                {l.practice ? `${l.durationLabel ? " · " : ""}Practice` : ""}
                                                                {!published ? " · Draft" : ""}
                                                            </span>
                                                        </span>
                                                    </AriaButton>
                                                    <Dropdown.Root>
                                                        <Dots label={`Manage ${l.title}`} />
                                                        <Dropdown.Popover placement="bottom right" className="w-60">
                                                            <Dropdown.Menu
                                                                aria-label={`Manage ${l.title}`}
                                                                onAction={(key) => {
                                                                    if (key === "edit") setLessonDialog({ moduleId: null, lesson: l });
                                                                    else if (key === "publish") setLessonPublished(l, !published);
                                                                    else if (key === "up") moveLesson(moduleIndex, lessonIndex, -1);
                                                                    else if (key === "down") moveLesson(moduleIndex, lessonIndex, 1);
                                                                    else if (key === "move") setMove({ lesson: l, from: module });
                                                                    else if (key === "delete") deleteLesson(l);
                                                                }}
                                                            >
                                                                <Dropdown.Item id="edit" icon={Edit01} label="Edit lesson" />
                                                                <Dropdown.Item id="publish" icon={published ? EyeOff : Eye} label={published ? "Unpublish" : "Publish"} />
                                                                {lessonIndex > 0 ? <Dropdown.Item id="up" icon={ArrowUp} label="Move up" /> : null}
                                                                {lessonIndex < module.lessons.length - 1 ? <Dropdown.Item id="down" icon={ArrowDown} label="Move down" /> : null}
                                                                {others.length ? <Dropdown.Item id="move" icon={Copy01} label="Move to another section…" /> : null}
                                                                <Dropdown.Separator />
                                                                <Dropdown.Item id="delete" icon={Trash01}>
                                                                    <span className="text-error-primary">Delete lesson</span>
                                                                </Dropdown.Item>
                                                            </Dropdown.Menu>
                                                        </Dropdown.Popover>
                                                    </Dropdown.Root>
                                                </li>
                                            );
                                        })}
                                        {module.lessons.length === 0 && <li className="px-4 py-2 text-xs text-quaternary">No lessons in this section yet.</li>}
                                    </ul>
                                )}
                            </section>
                        );
                    })}
                    <div className="p-3">
                        <DuoButton size="sm" color="secondary" full onPress={() => setSection({ module: null })}>
                            Add a section
                        </DuoButton>
                    </div>
                    {lesson?.video?.type === "practice" && <PracticePhrases key={lesson.id} lessonRef={lesson.video.ref} frameRef={frameRef} frameOrigin={frameOrigin} progress={practiceProgress} />}
                </aside>
            </div>

            <CourseModal open={editing} onClose={() => setEditing(false)} course={course} onSaved={load} onDeleted={() => navigate("/teach/courses")} />
            <SectionDialog open={Boolean(section)} onClose={() => setSection(null)} courseId={course.id} module={section?.module ?? null} onSaved={load} />
            <MoveLessonDialog move={move} course={course} onClose={() => setMove(null)} onOrder={saveOrder} />
            <LessonModal
                open={Boolean(lessonDialog)}
                onClose={() => setLessonDialog(null)}
                moduleId={lessonDialog?.moduleId ?? null}
                lesson={lessonDialog?.lesson ?? null}
                onSaved={async (edited) => {
                    // A new lesson lands where the course says; an edited one stays open.
                    if (!edited) openLesson(null);
                    await load();
                }}
            />
        </>
    );
};

/* The initials-on-a-tint cover, shared with the grid's cards. */
export const CoverArt = ({ course, className }: { course: Pick<CourseRow, "title" | "cover_url">; className?: string }) => {
    /* A cover whose file has gone (a 404) falls back to the initials rather than the browser's broken-image glyph. */
    const [broken, setBroken] = useState<string | null>(null);
    const src = course.cover_url && course.cover_url !== broken ? course.cover_url : null;
    return (
        <div className={cx("relative flex items-center justify-center overflow-hidden bg-linear-to-br from-brand-600 to-brand-900", className)}>
            {src ? <img src={src} alt="" onError={() => setBroken(src)} className="absolute inset-0 size-full object-cover" /> : <span className="text-display-md font-black text-white/90">{initials(course.title)}</span>}
        </div>
    );
};
