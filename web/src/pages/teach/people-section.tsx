// /teach/people. Classes and students: class cards with their tracker, setup and delete; the student
// register with class moves, invites, password resets and removal; adding and importing students,
// pasting phone numbers and exporting contacts. Ported from the old hub's peopleView and the
// modals bindAdminView opened from it.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { askConfirm } from "@/components/app/confirm";
import { SectionHead } from "@/components/app/console";
import { TEXTAREA_CLASS } from "@/components/app/dictation";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { DAY_NAMES, api, loadAdminBootstrap, upload, useApi } from "@/lib/portal";
import { COURSE_TYPES, courseTypeLabel } from "@/lib/portal";
import { type ClassImpact, type ClassRow, type ImportResult, type PhoneImportResult, type Settings, type StudentImpact, type StudentRow, type Tone, classLabel, errMsg, fmtDate } from "@/lib/teach";
import { cx } from "@/utils/cx";
import { ClassSetupDialog } from "./class-setup";
import { Detail, DetailGrid, NoteIcon, Pill, SettingsIcon, TextLink } from "./review-drawer";
import { StudentProfileDrawer } from "./student-profile";

const INPUT = cx(TEXTAREA_CLASS, "py-2.5 text-sm");
const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
    <div className={className}>
        <FieldLabel>{label}</FieldLabel>
        {children}
    </div>
);
const Note = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cx("text-xs leading-5 text-quaternary", className)}>{children}</p>;
const Actions = ({ children }: { children: ReactNode }) => <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;

type Tab = "classes" | "students";
type Modal = { kind: "add-class" } | { kind: "add-student" } | { kind: "import" } | { kind: "phones" } | { kind: "delete-class"; id: string } | { kind: "remove-student"; id: string } | { kind: "setup"; id: string } | null;

export const PeopleSection = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const classes = useApi<ClassRow[]>("/api/admin/classes");
    const students = useApi<StudentRow[]>("/api/admin/students");
    const settings = useApi<Settings>("/api/settings");
    const [modal, setModal] = useState<Modal>(null);
    const tab = (params.get("tab") === "students" ? "students" : "classes") as Tab;
    const profileId = params.get("student");
    const setParam = (k: string, v: string | null) =>
        setParams(
            (p) => {
                const n = new URLSearchParams(p);
                if (v) n.set(k, v);
                else n.delete(k);
                return n;
            },
            { replace: true },
        );

    useEffect(() => {
        for (const e of [classes.error, students.error]) if (e) toast(e.message);
    }, [classes.error, students.error]);
    /* The calendar's class-info dialog sends people here with ?setup=<classId> to open that class's setup. */
    const setupId = params.get("setup");
    useEffect(() => {
        if (setupId) {
            setModal({ kind: "setup", id: setupId });
            setParam("setup", null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setupId]);

    /** The old loadAdmin: lists and the console nav together. */
    const reloadAll = async () => {
        await Promise.all([classes.reload(), students.reload(), loadAdminBootstrap(true).catch(() => undefined)]);
    };

    /* Filter by course type: Irish for Primary Teaching or Hibernia. Kept in the address, so a
       reload or a link back here keeps it. */
    const courseType = params.get("type") || "all";
    const ofType = (t?: string | null) => courseType === "all" || (t || "irish_for_primary") === courseType;
    const klasses = (classes.data || []).filter((k) => ofType(k.course_type));
    const allClasses = classes.data || [];
    const rows = (students.data || []).filter((s) => courseType === "all" || (s.class_id ? ofType(s.course_type) : false));
    const consoleMode = !settings.data?.email?.provider || settings.data.email.provider === "console";

    const moveStudent = async (id: string, classId: string) => {
        try {
            /* "Not in a class" is a move to nowhere, which is a different request: the update route
               takes a class to move to and would reject an empty one. */
            if (!classId) {
                const r = await api<{ message?: string }>(`/api/admin/students/${id}/remove-from-class`, { method: "POST", json: {} });
                toast(r.message || "Taken off the class");
            } else {
                await api(`/api/admin/students/${id}`, { method: "PATCH", json: { classId } });
                toast("Student moved");
            }
            await reloadAll();
        } catch (e) {
            toast(errMsg(e));
            await reloadAll();
        }
    };

    const accessAction = async (id: string, action: "reset-password" | "resend-invite") => {
        const ok = await askConfirm(
            action === "reset-password"
                ? { title: "Reset this password?", message: "A new temporary password is generated and emailed to the student. Their current password stops working and they are signed out everywhere.", confirmLabel: "Reset and email" }
                : { title: "Resend the invitation?", message: "A fresh temporary password is generated and emailed. Their current password stops working and they are signed out everywhere.", confirmLabel: "Resend invitation" },
        );
        if (!ok) return;
        try {
            const data = await api<{ message?: string }>(`/api/admin/students/${id}/${action}`, { method: "POST" });
            toast(data.message || "Email sent");
        } catch (e) {
            toast(errMsg(e));
        }
    };

    return (
        <>
            <SectionHead
                title="Classes and students"
                sub="Create class groups, invite students and manage access."
                actions={
                    <>
                        <DuoButton color="secondary" size="sm" onPress={() => setModal({ kind: "add-class" })}>
                            Add Class
                        </DuoButton>
                        <DuoButton color="secondary" size="sm" onPress={() => setModal({ kind: "add-student" })}>
                            Add Student
                        </DuoButton>
                        <DuoButton color="secondary" size="sm" onPress={() => setModal({ kind: "phones" })}>
                            Add Phone Numbers
                        </DuoButton>
                        {/* Straight to the file: the route says attachment and the cookie goes with the navigation. */}
                        <a href="/api/admin/students/addresses.csv" download className="inline-flex h-10.5 shrink-0 items-center justify-center rounded-2xl border-2 border-b-4 border-secondary bg-primary px-3.5 text-[13px] leading-none font-bold tracking-[0.8px] text-brand-secondary uppercase hover:bg-primary_hover">
                            Export Contacts
                        </a>
                        <DuoButton size="sm" onPress={() => setModal({ kind: "import" })}>
                            Upload Students
                        </DuoButton>
                    </>
                }
            />

            {/* Console mode is the silent failure: accounts get created, invitations get "sent", and nothing arrives. */}
            {settings.data && consoleMode && (
                <div className="mb-6 flex flex-col gap-3 rounded-2xl border-2 border-warning-solid/40 bg-warning-primary p-4 md:flex-row md:items-center">
                    <div className="flex-1 text-sm">
                        <strong className="block font-bold text-primary">Invitation emails are not being delivered.</strong>
                        <span className="text-secondary">Email is in test mode, so new students are created but never receive their login. Set up SMTP or the GoHighLevel webhook under Email reminders, send a test email, then add or re-invite your students.</span>
                    </div>
                    <DuoButton color="secondary" size="xs" href="/teach/reminders">
                        Set Up Email
                    </DuoButton>
                </div>
            )}

            <Segmented
                label="Classes or students"
                value={tab}
                onChange={(t) => setParam("tab", t === "classes" ? null : t)}
                size="md"
                items={[
                    { id: "classes", label: "Classes" },
                    { id: "students", label: "Students" },
                ]}
            />
            <div className="mt-3">
                <Segmented
                    label="Course type"
                    value={courseType}
                    onChange={(t) => setParam("type", t === "all" ? null : t)}
                    size="sm"
                    items={[{ id: "all", label: "All courses" }, ...COURSE_TYPES.map((t) => ({ id: t.key, label: t.label }))]}
                />
            </div>

            {tab === "classes" && (
                <section className="mt-5">
                    {!classes.data ? (
                        <p className="text-sm text-quaternary">Loading…</p>
                    ) : klasses.length ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            {klasses.map((k) => (
                                <article key={k.id} className="flex flex-col gap-4 rounded-2xl border-2 border-secondary bg-primary p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-lg font-bold text-primary">{classLabel(k)}</h3>
                                            <p className="text-sm text-tertiary">{k.course_type === "hibernia" ? "On demand: the course and private messages only." : "Separate tracker, attendance and homework."}</p>
                                        </div>
                                        {k.course_type !== "hibernia" && (
                                            <DuoButton color="secondary" size="xs" href={`/teach/tracker/${k.id}`}>
                                                Open Tracker
                                            </DuoButton>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Pill tone={k.course_type === "hibernia" ? "orange" : "green"}>{courseTypeLabel(k.course_type || "irish_for_primary")}</Pill>
                                        <Pill>{k.student_count || 0} students</Pill>
                                        {k.course_type !== "hibernia" && (
                                            <>
                                                <Pill>{k.timezone}</Pill>
                                                <Pill tone={k.join_url ? "green" : "grey"}>{k.join_url ? "Class link set" : "No class link"}</Pill>
                                                <Pill>{k.has_community === false ? "No board" : "Has a board"}</Pill>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <DuoButton color="secondary" size="xs" iconLeading={SettingsIcon} onPress={() => setModal({ kind: "setup", id: k.id })}>
                                            Class Setup
                                        </DuoButton>
                                        <DuoButton color="danger" size="xs" onPress={() => setModal({ kind: "delete-class", id: k.id })}>
                                            Delete Class
                                        </DuoButton>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border-2 border-dashed border-secondary p-10 text-center">
                            <h3 className="text-lg font-bold text-primary">No classes yet</h3>
                            <p className="mt-1 text-sm text-tertiary">Add your first class to begin.</p>
                        </div>
                    )}
                </section>
            )}

            {tab === "students" && (
                <section className="mt-5 overflow-x-auto rounded-2xl border-2 border-secondary">
                    {!students.data ? (
                        <p className="p-4 text-sm text-quaternary">Loading…</p>
                    ) : (
                        <table className="w-full min-w-[880px] text-sm">
                            <thead>
                                <tr className="duo-label text-quaternary">
                                    {/* The name stays put while the rest scrolls sideways on a phone. */}
                                    <th className="sticky left-0 z-10 border-r border-secondary bg-primary px-3 py-2 text-left">Student</th>
                                    <th className="px-3 py-2 text-left">Email</th>
                                    <th className="px-3 py-2 text-left">Current class</th>
                                    <th className="px-3 py-2 text-left">Login</th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((s) => (
                                    <tr key={s.id} className="border-t border-secondary align-middle">
                                        <td className="sticky left-0 z-10 max-w-44 border-r border-secondary bg-primary px-3 py-2">
                                            <TextLink onPress={() => setParam("student", s.id)}>{s.name.trim()}</TextLink>
                                        </td>
                                        <td className="px-3 py-2 text-secondary">{s.email}</td>
                                        <td className="px-3 py-2">
                                            <DuoSelect
                                                label={`Class for ${s.name}`}
                                                value={s.class_id || "none"}
                                                onChange={(v) => moveStudent(s.id, v === "none" ? "" : v)}
                                                className="min-w-48 py-1.5 text-sm"
                                                items={[{ id: "none", label: "Not in a class" }, ...allClasses.map((k) => ({ id: k.id, label: classLabel(k) }))]}
                                            />
                                        </td>
                                        <td className="px-3 py-2">{s.last_login_at ? <Pill tone="green">Last login {fmtDate(s.last_login_at)}</Pill> : <Pill tone="orange">Invite pending</Pill>}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-wrap justify-end gap-1.5">
                                                <DuoButton color="secondary" size="xs" iconLeading={NoteIcon} onPress={() => setParam("student", s.id)}>
                                                    Notes
                                                </DuoButton>
                                                <DuoButton color="secondary" size="xs" onPress={() => accessAction(s.id, "resend-invite")}>
                                                    Resend Invite
                                                </DuoButton>
                                                <DuoButton color="secondary" size="xs" onPress={() => accessAction(s.id, "reset-password")}>
                                                    Reset Password
                                                </DuoButton>
                                                <DuoButton color="danger" size="xs" onPress={() => setModal({ kind: "remove-student", id: s.id })}>
                                                    Remove
                                                </DuoButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!rows.length && (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-tertiary">
                                            No students yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </section>
            )}

            <StudentProfileDrawer studentId={profileId} onClose={() => setParam("student", null)} />
            <ClassSetupDialog classId={modal?.kind === "setup" ? modal.id : null} onClose={() => setModal(null)} onSaved={reloadAll} />
            <AddClassDialog
                open={modal?.kind === "add-class"}
                onClose={() => setModal(null)}
                onCreated={async (k) => {
                    setModal(null);
                    await loadAdminBootstrap(true).catch(() => undefined);
                    toast("Class created");
                    navigate(`/teach/tracker/${k.id}`);
                }}
            />
            <AddStudentDialog open={modal?.kind === "add-student"} classes={klasses} consoleMode={consoleMode} onClose={() => setModal(null)} onDone={reloadAll} />
            <ImportStudentsDialog open={modal?.kind === "import"} classes={klasses} onClose={() => setModal(null)} onDone={reloadAll} />
            <PhoneImportDialog open={modal?.kind === "phones"} onClose={() => setModal(null)} onDone={reloadAll} />
            <DeleteClassDialog
                id={modal?.kind === "delete-class" ? modal.id : null}
                onClose={() => setModal(null)}
                onDeleted={async () => {
                    setModal(null);
                    await reloadAll();
                    toast("Class deleted");
                }}
            />
            <RemoveStudentDialog
                id={modal?.kind === "remove-student" ? modal.id : null}
                onClose={() => setModal(null)}
                onDone={async (msg) => {
                    setModal(null);
                    await reloadAll();
                    toast(msg);
                }}
            />
        </>
    );
};

/* ---- Add class ---- */

type CourseRow = { id: string; title: string };
const AddClassDialog = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (k: ClassRow) => void | Promise<void> }) => {
    const courses = useApi<{ courses: CourseRow[] }>(open ? "/api/admin/courses" : null);
    const [f, setF] = useState({ courseType: "irish_for_primary", programmeName: "Irish for Primary Teaching", dayOfWeek: "1", startTime: "19:00", timezone: "Europe/Dublin", startsOn: "", endsOn: "", hasCommunity: true, courseIds: new Set<string>() });
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (open) setF({ courseType: "irish_for_primary", programmeName: "Irish for Primary Teaching", dayOfWeek: "1", startTime: "19:00", timezone: "Europe/Dublin", startsOn: "", endsOn: "", hasCommunity: true, courseIds: new Set() });
    }, [open]);
    // An on-demand course (Hibernia) has no day, time, term or board: only a name and its courses.
    const onDemand = f.courseType === "hibernia";
    const save = async () => {
        setBusy(true);
        try {
            const k = await api<ClassRow>("/api/admin/classes", {
                method: "POST",
                json: onDemand
                    ? { courseType: f.courseType, programmeName: f.programmeName, timezone: f.timezone, hasCommunity: false, courseIds: [...f.courseIds] }
                    : { courseType: f.courseType, programmeName: f.programmeName, dayOfWeek: f.dayOfWeek, startTime: f.startTime, timezone: f.timezone, hasCommunity: f.hasCommunity, startsOn: f.startsOn || null, endsOn: f.endsOn || null, courseIds: [...f.courseIds] },
            });
            await onCreated(k);
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <DuoDialog open={open} onClose={onClose} title="Add class" sub="Creates a separate weekly tracker and assignment stream." className="max-w-lg max-h-[92dvh] overflow-y-auto">
            <div className="flex flex-col gap-4">
                <Field label="Course type">
                    <DuoSelect
                        label="Course type"
                        value={f.courseType}
                        onChange={(v) => setF({ ...f, courseType: v, programmeName: v === "hibernia" ? "Hibernia Irish Interview" : "Irish for Primary Teaching" })}
                        className="w-full"
                        items={COURSE_TYPES.map((t) => ({ id: t.key, label: t.label }))}
                    />
                </Field>
                {onDemand && <Note>Hibernia students see their course and private messages only: no home, board, homework, past questions or papers.</Note>}
                <Field label="Programme name">
                    <input required value={f.programmeName} onChange={(e) => setF({ ...f, programmeName: e.target.value })} aria-label="Programme name" className={INPUT} />
                </Field>
                {!onDemand && (
                <>
                <Field label="Day">
                    <DuoSelect label="Day" value={f.dayOfWeek} onChange={(v) => setF({ ...f, dayOfWeek: v })} className="w-full" items={DAY_NAMES.slice(1).map((d, i) => ({ id: String(i + 1), label: d }))} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Start time">
                        <input type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} aria-label="Start time" className={INPUT} />
                    </Field>
                    <Field label="Timezone">
                        <input required value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} aria-label="Timezone" className={INPUT} />
                    </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="First day of the course">
                        <input type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} aria-label="First day of the course" className={INPUT} />
                    </Field>
                    <Field label="Last day">
                        <input type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} aria-label="Last day" className={INPUT} />
                    </Field>
                </div>
                <Note>Weekly check-ins are only created between these dates.</Note>
                <Checkbox label="Give this class a community board" isSelected={f.hasCommunity} onChange={(v) => setF({ ...f, hasCommunity: v })} />
                <Note>Without one, Community never appears in these students’ menu. It can be turned on later.</Note>
                </>
                )}
                {courses.data?.courses?.length ? (
                    <Field label="Courses">
                        <div className="flex flex-col gap-2">
                            {courses.data.courses.map((c) => (
                                <Checkbox
                                    key={c.id}
                                    label={c.title}
                                    isSelected={f.courseIds.has(c.id)}
                                    onChange={(v) =>
                                        setF((prev) => {
                                            const s = new Set(prev.courseIds);
                                            if (v) s.add(c.id);
                                            else s.delete(c.id);
                                            return { ...prev, courseIds: s };
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </Field>
                ) : null}
            </div>
            <Actions>
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={save} isDisabled={busy}>
                    Add Class
                </DuoButton>
            </Actions>
        </DuoDialog>
    );
};

/* ---- Add student ---- */

const AddStudentDialog = ({ open, classes, consoleMode, onClose, onDone }: { open: boolean; classes: ClassRow[]; consoleMode: boolean; onClose: () => void; onDone: () => Promise<void> }) => {
    const [f, setF] = useState({ name: "", email: "", classId: "" });
    const [busy, setBusy] = useState(false);
    const firstClass = classes[0]?.id || "";
    useEffect(() => {
        if (open) setF({ name: "", email: "", classId: firstClass });
    }, [open, firstClass]);
    const save = async () => {
        setBusy(true);
        try {
            const result = await api<{ emailStatus: string }>("/api/admin/students", { method: "POST", json: f });
            onClose();
            await onDone();
            if (result.emailStatus !== "sent") toast("Student created, but the invitation email failed to send. Use Resend invite once email is working.");
            else if (consoleMode) toast("Student created. Email is in test mode, so no invitation was actually delivered.");
            else toast("Student created and their login emailed");
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <DuoDialog open={open} onClose={onClose} title="Add student" sub="A strong temporary password will be generated and emailed automatically.">
            <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    save();
                }}
            >
                <Field label="Full name">
                    <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Full name" className={INPUT} />
                </Field>
                <Field label="Email">
                    <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email" className={INPUT} />
                </Field>
                <Field label="Class">
                    <DuoSelect label="Class" value={f.classId} onChange={(v) => setF({ ...f, classId: v })} className="w-full" items={classes.map((k) => ({ id: k.id, label: classLabel(k) }))} />
                </Field>
                <Actions>
                    <DuoButton color="secondary" size="sm" onPress={onClose}>
                        Cancel
                    </DuoButton>
                    <DuoButton size="sm" type="submit" isDisabled={busy}>
                        Create Account and Send Email
                    </DuoButton>
                </Actions>
            </form>
        </DuoDialog>
    );
};

/* ---- Upload students (CSV). Two steps: preview, then apply. ---- */

const STATUS_TONE: Record<string, Tone> = { created: "green", updated: "green", unchanged: "grey", duplicate: "orange", "not found": "orange", error: "red" };

const ImportStudentsDialog = ({ open, classes, onClose, onDone }: { open: boolean; classes: ClassRow[]; onClose: () => void; onDone: () => Promise<void> }) => {
    const [classId, setClassId] = useState("");
    const [mode, setMode] = useState<"preview" | "apply">("preview");
    const [result, setResult] = useState<ImportResult | null>(null);
    const [summary, setSummary] = useState("");
    const [hint, setHint] = useState("Nothing is written until you have seen what the file would do.");
    const [busy, setBusy] = useState(false);
    const file = useRef<HTMLInputElement>(null);
    const reset = () => {
        setMode("preview");
        setResult(null);
        setSummary("");
        setHint("Nothing is written until you have seen what the file would do.");
    };
    useEffect(() => {
        if (open) (reset(), setClassId(""));
    }, [open]);

    const run = async (preview: boolean) => {
        const chosen = file.current?.files?.[0];
        if (!chosen?.size) return toast("Choose a CSV file first");
        const form = new FormData();
        form.append("classId", classId);
        form.append("file", chosen);
        if (preview) form.append("preview", "1");
        setBusy(true);
        try {
            const r = await upload<ImportResult>("/api/admin/students/import", form);
            const sum = [
                r.updated ? `${r.updated} phone${r.updated === 1 ? "" : "s"} ${preview ? "to update" : "updated"}` : "",
                r.created ? `${r.created} ${preview ? "to create" : "created"}` : "",
                r.unchanged ? `${r.unchanged} already up to date` : "",
                r.notFound ? `${r.notFound} not found` : "",
                r.duplicates ? `${r.duplicates} duplicate row${r.duplicates === 1 ? "" : "s"}` : "",
                r.errors ? `${r.errors} with problems` : "",
            ]
                .filter(Boolean)
                .join(" · ");
            setResult(r);
            setSummary(sum || "Nothing to do.");
            const willWrite = r.updated + r.created;
            if (preview) {
                setHint(willWrite ? "That is what the file would do. Press Apply to write it." : "Nothing in this file would change anything.");
                setMode(willWrite ? "apply" : "preview");
            } else {
                setHint("Done.");
                setMode("preview");
                await onDone();
            }
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };
    const line = (row: ImportResult["results"][number]) => row.error || row.emailStatus || (row.was ? `was ${row.was}` : "");
    const buttonLabel = mode === "apply" ? `Apply: ${summary.split(" · ").slice(0, 2).join(", ")}` : result && !result.preview ? "Check Another File" : "Check the File";

    return (
        <DuoDialog open={open} onClose={onClose} title="Upload students" sub="CSV headings: Name, Email and Class. Each new student is emailed a temporary password." className="max-w-3xl max-h-[92dvh] overflow-y-auto">
            <div className="flex flex-col gap-4">
                <Field label="Default class, optional">
                    <DuoSelect label="Default class" value={classId || "none"} onChange={(v) => setClassId(v === "none" ? "" : v)} className="w-full" items={[{ id: "none", label: "Use the Class column" }, ...classes.map((k) => ({ id: k.id, label: classLabel(k) }))]} />
                </Field>
                <Field label="Student CSV">
                    <input ref={file} type="file" accept=".csv,text/csv" required aria-label="Student CSV" onChange={reset} className="block w-full text-sm text-secondary file:mr-3 file:rounded-xl file:border-2 file:border-secondary file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-brand-secondary" />
                    <Note className="mt-1.5">
                        Columns: <b>Name</b>, <b>Email</b>, and either <b>Class</b> or the default above for anybody new. Add a <b>Phone</b> column to put numbers on profiles: a row whose email is already on the portal updates that student's phone instead of creating them, so the same sheet can be uploaded again.
                    </Note>
                </Field>
                <Note>{hint}</Note>
                {result && (
                    <>
                        <div className={cx("rounded-xl px-3 py-2 text-sm font-bold", result.preview ? "bg-secondary text-secondary" : "bg-success-primary text-success-primary")}>{summary}</div>
                        <div className="overflow-x-auto rounded-2xl border-2 border-secondary">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="duo-label text-quaternary">
                                        <th className="px-3 py-2 text-left">Student</th>
                                        <th className="px-3 py-2 text-left">Email</th>
                                        <th className="px-3 py-2 text-left">Phone</th>
                                        <th className="px-3 py-2"></th>
                                        <th className="px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.results.map((r, i) => (
                                        <tr key={i} className="border-t border-secondary">
                                            <td className="px-3 py-1.5 text-primary">{r.name || ""}</td>
                                            <td className="px-3 py-1.5 text-secondary">{r.email}</td>
                                            <td className="px-3 py-1.5 text-secondary">{r.phone || ""}</td>
                                            <td className="px-3 py-1.5">
                                                <Pill tone={STATUS_TONE[r.status] || "grey"}>{r.status}</Pill>
                                            </td>
                                            <td className="px-3 py-1.5 text-xs text-quaternary">{line(r)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
            <Actions>
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Close
                </DuoButton>
                <DuoButton size="sm" isDisabled={busy} onPress={() => run(mode !== "apply")}>
                    {buttonLabel}
                </DuoButton>
            </Actions>
        </DuoDialog>
    );
};

/* ---- Paste phone numbers. Matched on email; nothing is created. ---- */

const PhoneImportDialog = ({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) => {
    const [text, setText] = useState("");
    const [mode, setMode] = useState<"preview" | "apply">("preview");
    const [result, setResult] = useState<PhoneImportResult | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (open) (setText(""), setMode("preview"), setResult(null));
    }, [open]);
    const run = async () => {
        const t = text.trim();
        if (!t) return toast("Paste the list first.");
        setBusy(true);
        try {
            /* Looked at first, written second. The same request with preview on answers with what
               it would do and touches nothing. */
            const preview = mode !== "apply";
            const r = await api<PhoneImportResult>("/api/admin/students/phone-import", { method: "POST", json: { text: t, preview } });
            setResult(r);
            setMode(preview && r.updated.length ? "apply" : "preview");
            await onDone();
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };
    const n = result?.updated.length || 0;
    const label = mode === "apply" ? `Apply: Update ${n} Phone${n === 1 ? "" : "s"}` : result && !result.preview ? "Check Another List" : "Check the List";
    return (
        <DuoDialog open={open} onClose={onClose} title="Paste phone numbers" sub="One student to a line, copied straight out of a spreadsheet." className="max-w-2xl max-h-[92dvh] overflow-y-auto">
            <Note>Each line needs an email and a number. Anything else on the line, a name for instance, is ignored. Students are matched on their email, so nobody is created and nothing is overwritten except the phone number.</Note>
            <Field label="Name, email, phone" className="mt-4">
                <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Holly Donnelly\thollydonnelly116@gmail.com\t087 123 4567"} aria-label="Name, email, phone" className={cx(TEXTAREA_CLASS, "resize-y font-mono text-sm")} />
            </Field>
            {result && (
                <div className="mt-4">
                    <div className={cx("rounded-2xl border-2 p-3 text-sm", result.unknown.length ? "border-warning-solid/40 bg-warning-primary" : "border-secondary bg-secondary")}>
                        <strong className="block font-bold text-primary">
                            {result.updated.length} number{result.updated.length === 1 ? "" : "s"} {result.preview ? "to save" : "saved"}
                            {result.unchanged?.length ? `, ${result.unchanged.length} already up to date` : ""}.
                        </strong>
                        <span className="text-secondary">
                            {result.noPhone.length ? `${result.noPhone.length} line${result.noPhone.length === 1 ? "" : "s"} had no number on ${result.noPhone.length === 1 ? "it" : "them"}. ` : ""}
                            {result.unknown.length ? `${result.unknown.length} did not match a student.` : "Everything matched."}
                            {result.preview && result.updated.length ? " Nothing is written yet: press Apply." : ""}
                        </span>
                    </div>
                    {result.unknown.length > 0 && (
                        <div className="mt-3 overflow-x-auto rounded-2xl border-2 border-secondary">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="duo-label text-quaternary">
                                        <th className="px-3 py-2 text-left">Line</th>
                                        <th className="px-3 py-2 text-left">Why</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.unknown.map((r, i) => (
                                        <tr key={i} className="border-t border-secondary">
                                            <td className="px-3 py-1.5 font-mono text-xs text-secondary">{r.line.slice(0, 80)}</td>
                                            <td className="px-3 py-1.5 text-tertiary">{r.why}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
            <Actions>
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" isDisabled={busy} onPress={run}>
                    {label}
                </DuoButton>
            </Actions>
        </DuoDialog>
    );
};

/* ---- Delete class, with what it costs ---- */

const DeleteClassDialog = ({ id, onClose, onDeleted }: { id: string | null; onClose: () => void; onDeleted: () => Promise<void> }) => {
    const impact = useApi<ClassImpact>(id ? `/api/admin/classes/${id}/impact` : null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (impact.error) (toast(impact.error.message), onClose());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [impact.error]);
    if (!id) return null;
    const d = impact.data;
    const work = d ? d.checkins + d.submissions : 0;
    const piece = `${work} piece${work === 1 ? "" : "s"}`;
    const del = async () => {
        setBusy(true);
        try {
            await api(`/api/admin/classes/${id}?confirmWork=${work}`, { method: "DELETE" });
            await onDeleted();
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title={d ? `Delete “${d.class.label}”?` : "Delete this class?"} sub="This cannot be undone." className="max-w-lg">
            {!d ? (
                <p className="text-sm text-quaternary">Loading…</p>
            ) : (
                <>
                    <Note>Deleting a class removes its whole history. The students themselves are kept and simply end up without a class, but everything they did here goes.</Note>
                    <DetailGrid className="mt-4">
                        <Detail label="Students enrolled">{d.students}</Detail>
                        <Detail label="Teaching weeks">{d.weeks}</Detail>
                        <Detail label="Assignments">{d.assignments}</Detail>
                        <Detail label="Attendance records">{d.attendance}</Detail>
                        <Detail label="Check-ins submitted">{d.checkins}</Detail>
                        <Detail label="Homework submitted">{d.submissions}</Detail>
                    </DetailGrid>
                    {work ? (
                        <p className="mt-4 rounded-xl bg-error-primary px-3 py-2 text-sm font-bold text-error-primary">{piece} of student work will be deleted permanently.</p>
                    ) : (
                        <Note className="mt-4">No student work has been submitted in this class, so it can be deleted cleanly.</Note>
                    )}
                    <Actions>
                        <DuoButton color="secondary" size="sm" onPress={onClose}>
                            Cancel
                        </DuoButton>
                        <DuoButton color="danger" size="sm" onPress={del} isDisabled={busy}>
                            {work ? `Delete and Remove ${piece} of Work` : "Delete"}
                        </DuoButton>
                    </Actions>
                </>
            )}
        </DuoDialog>
    );
};

/* ---- Remove a student: off the class (reversible, first) or delete the account ---- */

/* "Nothing will be lost" has to be true when it is said: when there is no work but there is
   something else, it says what the something else is. */
const deleteWarning = (work: number, impact: StudentImpact, piece: (n: number) => string) => {
    if (work) return <p className="mt-3 rounded-xl bg-error-primary px-3 py-2 text-sm font-bold text-error-primary">{piece(work)} of student work will be deleted permanently.</p>;
    const alsoLost = impact.posts + impact.comments + impact.notes + impact.attendance;
    if (!alsoLost) return <Note className="mt-3">Nothing has been handed in and nothing else is recorded, so this account can be deleted cleanly.</Note>;
    const parts: string[] = [];
    const board = impact.posts + impact.comments;
    if (board) parts.push(`${board} board post${board === 1 ? "" : "s"}`);
    if (impact.notes) parts.push(`${impact.notes} note${impact.notes === 1 ? "" : "s"} you wrote`);
    if (impact.attendance) parts.push(`${impact.attendance} attendance record${impact.attendance === 1 ? "" : "s"}`);
    const listed = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    return <Note className="mt-3">No homework or check-ins were handed in, but {listed} will be deleted too.</Note>;
};

const RemoveStudentDialog = ({ id, onClose, onDone }: { id: string | null; onClose: () => void; onDone: (msg: string) => Promise<void> }) => {
    const impact = useApi<StudentImpact>(id ? `/api/admin/students/${id}/impact` : null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (impact.error) (toast(impact.error.message), onClose());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [impact.error]);
    if (!id) return null;
    const d = impact.data;
    const student = d?.student;
    const work = d?.work || 0;
    const piece = (n: number) => `${n} piece${n === 1 ? "" : "s"}`;
    const offClass = async () => {
        if (!student?.classId) return;
        setBusy(true);
        try {
            const r = await api<{ message?: string }>(`/api/admin/students/${id}/remove-from-class`, { method: "POST", json: { classId: student.classId } });
            await onDone(r.message || "Taken off the class");
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };
    const del = async () => {
        if (!student) return;
        setBusy(true);
        try {
            await api(`/api/admin/students/${id}?confirmWork=${work}`, { method: "DELETE" });
            await onDone(`${student.name} was deleted`);
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <DuoDialog open onClose={onClose} title={student ? `Remove ${student.name.trim()}?` : "Remove this student?"} sub={student ? (student.classLabel ? `Currently in ${student.classLabel}` : "Not in a class at the moment") : undefined} className="max-w-2xl max-h-[92dvh] overflow-y-auto">
            {!d || !student ? (
                <p className="text-sm text-quaternary">Loading…</p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border-2 border-secondary p-4">
                        <h4 className="text-md font-bold text-primary">Take them off the class</h4>
                        <Note className="mt-1">Their account stays and everything they handed in is kept, so the tracker still shows the work they did. Use this when somebody has left the course or was put in the wrong group. You can put them in another class afterwards.</Note>
                        <DuoButton color="secondary" size="sm" className="mt-4" isDisabled={!student.classId || busy} onPress={offClass}>
                            {student.classId ? `Take off ${student.classLabel}` : "Not in a class"}
                        </DuoButton>
                    </div>
                    <div className="rounded-2xl border-2 border-error_subtle bg-error-primary/20 p-4">
                        <h4 className="text-md font-bold text-primary">Delete the account</h4>
                        <Note className="mt-1">Removes {student.name.trim()} and everything belonging to them. They can no longer sign in, and nothing they submitted is recoverable.</Note>
                        <DetailGrid className="mt-3 grid-cols-2 sm:grid-cols-2">
                            <Detail label="Check-ins">{d.checkins}</Detail>
                            <Detail label="Homework">{d.submissions}</Detail>
                            <Detail label="Files uploaded">{d.files}</Detail>
                            <Detail label="Attendance">{d.attendance}</Detail>
                            <Detail label="Board posts">{d.posts + d.comments}</Detail>
                            <Detail label="Your notes">{d.notes}</Detail>
                        </DetailGrid>
                        {deleteWarning(work, d, piece)}
                        <DuoButton color="danger" size="sm" className="mt-4" isDisabled={busy} onPress={del}>
                            {work ? `Delete Permanently and Lose ${piece(work)} of Work` : "Delete Permanently"}
                        </DuoButton>
                    </div>
                </div>
            )}
            <Actions>
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
            </Actions>
        </DuoDialog>
    );
};
