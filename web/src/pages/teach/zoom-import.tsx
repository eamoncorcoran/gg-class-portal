// Importing from Zoom: every recording on the account, and nothing acts on any of them without being
// told to. A Zoom account holds one-to-ones, test calls and meetings that have no business on a class
// portal, so the list is a list and the Import button is the decision. Below it, the recurring
// webinars whose recordings come across on their own. Ported from openZoomImport / renderZoomList.
import { useCallback, useEffect, useRef, useState } from "react";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, DuoInput } from "@/components/app/duo-dialog";
import { toast } from "@/components/app/toast";
import { api } from "@/lib/portal";
import { type CourseRow, type ZoomRecordings, type ZoomStatus, type ZoomSweep, fmtDate, loadCourse } from "@/lib/teach-courses";
import { cx } from "@/utils/cx";
import { CheckRow, Pick } from "./plan-builder";

type Section = { id: string; label: string; courseId: string };

export const ZoomImport = ({ open, onClose, courses }: { open: boolean; onClose: () => void; courses: CourseRow[] }) => {
    const [status, setStatus] = useState<ZoomStatus | null>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        if (!open) return;
        setStatus(null);
        api<ZoomStatus>("/api/admin/zoom/status")
            .then(setStatus)
            .catch((err: Error) => {
                toast(err.message);
                close.current();
            });
    }, [open]);

    if (!status) return <DuoDialog open={open} onClose={onClose} title="Import from Zoom"><p className="text-sm text-quaternary">Asking Zoom…</p></DuoDialog>;

    if (!status.zoom)
        return (
            <DuoDialog open={open} onClose={onClose} title="Import from Zoom" sub="Not connected yet.">
                <p className="text-md leading-7 text-secondary">
                    The Zoom account is not connected yet. Under <strong>Settings</strong>, the <em>Zoom account</em> card takes the Account ID, Client ID and Client Secret of a Server-to-Server OAuth app from marketplace.zoom.us, and lists the scopes it needs.
                </p>
                <p className="mt-3 text-sm text-tertiary">
                    With the account connected, a recording is linked straight to Zoom's own share page with its passcode. Add a Bunny Stream library (<code className="font-mono text-xs">BUNNY_LIBRARY_ID</code> and <code className="font-mono text-xs">BUNNY_API_KEY</code>) and recordings are moved into the portal's own player instead.
                </p>
                <div className="mt-6 flex justify-end">
                    <DuoButton size="sm" onPress={onClose}>
                        Close
                    </DuoButton>
                </div>
            </DuoDialog>
        );

    return (
        <DuoDialog
            open={open}
            onClose={onClose}
            title="Import from Zoom"
            sub={!status.bunny ? "Recordings are linked to Zoom’s own share page, passcode included. Add a Bunny Stream library to move them into the portal’s player." : status.signedPlayback ? "Playback links are signed, so a forwarded link will not work." : "Playback is unsigned: add BUNNY_TOKEN_KEY to lock links to your students."}
            className="max-w-3xl max-h-[92vh] overflow-y-auto"
        >
            <ZoomList courses={courses} onClose={onClose} />
        </DuoDialog>
    );
};

const ZoomList = ({ courses, onClose }: { courses: CourseRow[]; onClose: () => void }) => {
    const [data, setData] = useState<ZoomRecordings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sections, setSections] = useState<Section[]>([]);
    const [picked, setPicked] = useState<Record<string, string>>({}); // fileId -> moduleId
    const [importing, setImporting] = useState<string | null>(null);
    // the new-rule form
    const [ruleClass, setRuleClass] = useState("");
    const [zoomId, setZoomId] = useState("");
    const [label, setLabel] = useState("");
    const [ruleModule, setRuleModule] = useState("");
    const [autoImport, setAutoImport] = useState(false);
    const [autoPublish, setAutoPublish] = useState(false);

    const load = useCallback(async () => {
        try {
            const d = await api<ZoomRecordings>("/api/admin/zoom/recordings?months=3");
            setData(d);
            setError(null);
            setPicked((prev) => {
                const next = { ...prev };
                for (const r of d.recordings) if (!next[r.fileId] && r.targetModuleId) next[r.fileId] = r.targetModuleId;
                return next;
            });
        } catch (err) {
            setError((err as Error).message);
        }
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    // Every section of every course, so a recording can be dropped straight in.
    useEffect(() => {
        let alive = true;
        (async () => {
            const list: Section[] = [];
            for (const course of courses) {
                const detail = await loadCourse(course.id).catch(() => null);
                for (const m of detail?.modules ?? []) list.push({ id: m.id, label: `${course.title} · ${m.title}`, courseId: course.id });
            }
            if (alive) setSections(list);
        })();
        return () => {
            alive = false;
        };
    }, [courses]);

    /* Picking the class fills in its webinar id and narrows the sections to the courses that class is
       enrolled in, so a recording cannot be sent where its students would never see it. */
    const sectionsFor = (classId: string) => {
        if (!classId) return sections;
        const allowed = new Set(courses.filter((c) => c.class_id === classId || (c.classes || []).some((k) => k.id === classId)).map((c) => c.id));
        return sections.filter((s) => allowed.has(s.courseId));
    };
    const ruleSections = sectionsFor(ruleClass);
    const pickClass = (id: string) => {
        setRuleClass(id);
        const k = data?.classes?.find((x) => x.id === id);
        if (k?.zoomId) setZoomId(k.zoomId);
        if (ruleModule && !sectionsFor(id).some((s) => s.id === ruleModule)) setRuleModule("");
    };

    const sweep = async () => {
        try {
            const result = await api<ZoomSweep>("/api/admin/zoom/sweep", { method: "POST" });
            toast(result.imported ? `Imported ${result.imported}` : result.reason || "Nothing to import");
            load();
        } catch (err) {
            toast((err as Error).message);
        }
    };
    const importOne = async (uuid: string, fileId: string) => {
        const moduleId = picked[fileId];
        if (!moduleId) return toast("Choose the section it belongs in first.");
        setImporting(fileId);
        try {
            await api("/api/admin/zoom/import", { method: "POST", json: { uuid, fileId, moduleId } });
            toast("Imported as a draft lesson. Check the title before publishing it");
            await load();
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setImporting(null);
        }
    };
    const saveRule = async () => {
        const body = { zoomId: zoomId.trim(), label: label.trim(), moduleId: ruleModule || null, classId: ruleClass || null, autoImport, autoPublish };
        if (!body.zoomId) return toast("Give the webinar id.");
        try {
            await api("/api/admin/zoom/sources", { method: "PUT", json: body });
            toast("Saved");
            load();
        } catch (err) {
            toast((err as Error).message);
        }
    };
    const forget = async (id: string) => {
        try {
            await api(`/api/admin/zoom/sources/${id}`, { method: "DELETE" });
            load();
        } catch (err) {
            toast((err as Error).message);
        }
    };

    const sectionOptions = (list: Section[]) => (
        <>
            <option value="">Choose a section…</option>
            {list.map((s) => (
                <option key={s.id} value={s.id}>
                    {s.label}
                </option>
            ))}
        </>
    );

    return (
        <div className="flex flex-col gap-6">
            {error ? (
                <p className="text-sm text-quaternary">{error}</p>
            ) : !data ? (
                <p className="text-sm text-quaternary">Asking Zoom what is there…</p>
            ) : data.recordings.length ? (
                <ul className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1">
                    {data.recordings.map((r) => {
                        const done = r.importStatus === "done";
                        return (
                            <li key={`${r.uuid}:${r.fileId}`} className={cx("flex flex-col gap-3 rounded-2xl border-2 border-secondary p-3 sm:flex-row sm:items-center", done && "bg-secondary")}>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-primary">{r.topic || "Untitled meeting"}</p>
                                    <p className="text-xs text-tertiary">
                                        {fmtDate(r.startedAt, { dateStyle: "medium", time: true })} · {Math.round((r.durationSeconds || 0) / 60)} min · {((r.fileSize || 0) / 1024 / 1024).toFixed(0)}MB
                                        {r.autoImport && (
                                            <>
                                                {" · "}
                                                <b>imports automatically</b>
                                            </>
                                        )}
                                    </p>
                                    {r.error && <p className="text-xs font-semibold text-error-primary">{r.error}</p>}
                                </div>
                                {done ? (
                                    <span className="shrink-0 rounded-full bg-success-primary px-2.5 py-1 text-xs font-bold text-success-primary">Imported</span>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Pick value={picked[r.fileId] || ""} onChange={(v) => setPicked((p) => ({ ...p, [r.fileId]: v }))} ariaLabel={`Section for ${r.topic || "this recording"}`} className="max-w-56 px-2 py-1.5 text-xs">
                                            {sectionOptions(sections)}
                                        </Pick>
                                        <DuoButton size="xs" isDisabled={importing === r.fileId} onPress={() => importOne(r.uuid, r.fileId)}>
                                            {importing === r.fileId ? "Importing…" : "Import"}
                                        </DuoButton>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="text-sm text-quaternary">No recordings on the account in the last three months.</p>
            )}

            {data && (
                <section>
                    <p className="duo-label text-quaternary">Import automatically</p>
                    <p className="mt-1 text-sm text-tertiary">A recurring webinar keeps the same id every week. Name one here and its recordings come across on their own. Everything else stays in the list above until you say so.</p>
                    {data.sources.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-2">
                            {data.sources.map((s) => (
                                <li key={s.id} className="flex flex-col gap-2 rounded-2xl border-2 border-secondary p-3 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-primary">{s.label || s.zoom_id}</p>
                                        <p className="text-xs text-tertiary">
                                            {s.zoom_id}
                                            {s.class_label ? ` · ${s.class_label}` : ""}
                                            {s.module_title ? ` → ${s.course_title} · ${s.module_title}` : " → no section chosen"}
                                        </p>
                                    </div>
                                    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", s.auto_import ? "bg-success-primary text-success-primary" : "bg-secondary text-tertiary")}>{s.auto_import ? (s.auto_publish ? "Automatic, published" : "Automatic, as a draft") : "Manual only"}</span>
                                    <DuoButton size="xs" color="danger" onPress={() => forget(s.id)}>
                                        Remove
                                    </DuoButton>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="mt-3 flex flex-col gap-2 rounded-2xl border-2 border-secondary p-3">
                        <Pick value={ruleClass} onChange={pickClass} ariaLabel="Which class is this webinar?" className="w-full">
                            <option value="">Which class is this webinar?</option>
                            {(data.classes || []).map((k) => (
                                <option key={k.id} value={k.id}>
                                    {k.label}
                                    {k.active === false ? " (not active)" : ""}
                                </option>
                            ))}
                        </Pick>
                        <DuoInput value={zoomId} onChange={setZoomId} ariaLabel="Webinar or meeting id" placeholder="Webinar or meeting id" className="py-2.5 text-sm" />
                        <DuoInput value={label} onChange={setLabel} ariaLabel="What it is" placeholder="What it is, e.g. Monday class" className="py-2.5 text-sm" />
                        <Pick value={ruleModule} onChange={setRuleModule} ariaLabel="Section the recordings land in" className="w-full">
                            {sectionOptions(ruleSections)}
                        </Pick>
                        <CheckRow checked={autoImport} onChange={setAutoImport}>
                            Bring new recordings across on their own
                        </CheckRow>
                        <CheckRow checked={autoPublish} onChange={setAutoPublish}>
                            Publish them on arrival, titled with the class date
                        </CheckRow>
                        <DuoButton size="sm" color="secondary" className="self-start" onPress={saveRule}>
                            Save
                        </DuoButton>
                    </div>
                </section>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Close
                </DuoButton>
                <DuoButton size="sm" color="secondary" onPress={sweep}>
                    Run automatic import
                </DuoButton>
            </div>
        </div>
    );
};
