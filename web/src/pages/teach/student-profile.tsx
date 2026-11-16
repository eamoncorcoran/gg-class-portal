// One student's record on the teacher's side: how they are doing, phone and postal address, the
// withdrawal form if they left, and the private notes the team keeps. Students never see any of it.
import { useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/app/confirm";
import { TEXTAREA_CLASS, TeacherBox } from "@/components/app/dictation";
import { DuoButton } from "@/components/app/duo";
import { Toggle } from "@/components/base/toggle/toggle";
import { toast } from "@/components/app/toast";
import { api, useApi } from "@/lib/portal";
import { type Note, type Profile, type ProfileStudent, type Withdrawal, errMsg, fmtDate } from "@/lib/teach";
import { Detail, DetailGrid, LockIcon, SideDrawer, SubHead, TextLink } from "./review-drawer";
import { cx } from "@/utils/cx";

const sortNotes = (notes: Note[]) => [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

/* The phone number, editable in place rather than behind a dialog, because it is one short field and
   the commonest thing done to it is correcting a digit. Saved on blur as well as on Enter. */
const ContactPanel = ({ student, onSaved }: { student: ProfileStudent; onSaved: (phone: string) => void }) => {
    const [value, setValue] = useState(student.phone || "");
    const saved = useRef(student.phone || "");
    useEffect(() => {
        setValue(student.phone || "");
        saved.current = student.phone || "";
    }, [student.id, student.phone]);
    const save = async () => {
        const phone = value.trim();
        if (phone === saved.current) return;
        try {
            await api(`/api/admin/students/${student.id}`, { method: "PATCH", json: { phone } });
            saved.current = phone;
            onSaved(phone);
            toast(phone ? "Phone saved" : "Phone cleared");
        } catch (e) {
            setValue(saved.current);
            toast(errMsg(e));
        }
    };
    return (
        <>
            <SubHead>Phone</SubHead>
            <div className="flex items-center gap-2">
                <input
                    type="tel"
                    maxLength={40}
                    autoComplete="off"
                    aria-label="Phone"
                    value={value}
                    placeholder="087 123 4567"
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={save}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") (e.preventDefault(), e.currentTarget.blur());
                    }}
                    className={cx(TEXTAREA_CLASS, "py-2.5")}
                />
                {student.phone && (
                    <DuoButton color="secondary" size="sm" href={`tel:${String(student.phone).replace(/[^0-9+]/g, "")}`}>
                        Call
                    </DuoButton>
                )}
            </div>
            <p className="mt-1.5 text-xs text-quaternary">Only the Gaeilgeoir Guides team sees this. Students are not asked for it and never see it.</p>
        </>
    );
};

/* Shown whether or not it has been given, because "not given yet" is the thing worth knowing when
   the envelopes are being written. */
const AddressPanel = ({ student }: { student: ProfileStudent }) => {
    const given = Boolean(student.address_line1 && student.address_county && student.eircode);
    const lines = [student.address_line1, student.address_line2, student.address_county ? `Co. ${student.address_county}` : "", student.eircode].filter(Boolean) as string[];
    return (
        <>
            <SubHead>Postal address</SubHead>
            {given ? (
                <div className="rounded-2xl border-2 border-secondary px-4 py-3">
                    <address className="text-md leading-7 text-secondary not-italic">
                        {lines.map((l, i) => (
                            <span key={i} className="block">
                                {l}
                            </span>
                        ))}
                    </address>
                    <small className="text-xs text-quaternary">Given {fmtDate(student.address_updated_at)}</small>
                </div>
            ) : (
                <p className="text-sm text-tertiary">Not given yet. The student is asked for it at the top of their screen each time they sign in.</p>
            )}
        </>
    );
};

export const WithdrawalSummary = ({ row }: { row: Withdrawal }) => {
    const rating = (v: number | null) => (v ? `${v}/5` : "—");
    return (
        <div className="mt-6 rounded-2xl border-2 border-error_subtle bg-error-primary/30 p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-md font-bold text-primary">Withdrew from the course</strong>
                <span className="text-xs text-tertiary">{fmtDate(row.submitted_at, { time: true, weekday: true, dateStyle: "short" })}</span>
            </header>
            <p className="mt-2 text-md font-bold text-error-primary">{row.reason}</p>
            {row.detail && <p className="mt-1 text-sm whitespace-pre-wrap text-secondary">{row.detail}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tertiary">
                <span>
                    Overall <strong className="text-primary">{rating(row.overall_rating)}</strong>
                </span>
                <span>
                    Teaching <strong className="text-primary">{rating(row.teaching_rating)}</strong>
                </span>
                <span>
                    Materials <strong className="text-primary">{rating(row.materials_rating)}</strong>
                </span>
                {row.pace && (
                    <span>
                        Pace <strong className="text-primary">{row.pace}</strong>
                    </span>
                )}
                {row.would_recommend && (
                    <span>
                        Would recommend <strong className="text-primary">{row.would_recommend}</strong>
                    </span>
                )}
            </div>
            {row.what_worked && (
                <div className="mt-3">
                    <small className="duo-label text-quaternary">What worked</small>
                    <p className="text-sm whitespace-pre-wrap text-secondary">{row.what_worked}</p>
                </div>
            )}
            {row.what_to_improve && (
                <div className="mt-3">
                    <small className="duo-label text-quaternary">What to change</small>
                    <p className="text-sm whitespace-pre-wrap text-secondary">{row.what_to_improve}</p>
                </div>
            )}
            <p className="mt-3 text-xs text-quaternary">{row.may_contact ? "Happy to be contacted about these answers." : "Did not want to be contacted about these answers."}</p>
        </div>
    );
};

const NoteCard = ({ note, onPin, onDelete }: { note: Note; onPin: () => void; onDelete: () => void }) => (
    <article className={cx("rounded-2xl border-2 p-4", note.pinned ? "border-brand bg-brand-primary" : "border-secondary bg-primary")}>
        <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-quaternary">
            <span>
                {note.author_name || "Gaeilgeoir Guides"} · {fmtDate(note.created_at, { time: true, weekday: true, dateStyle: "short" })}
                {note.pinned ? " · Pinned" : ""}
            </span>
            <span className="flex gap-3">
                <TextLink onPress={onPin} className="text-xs">
                    {note.pinned ? "Unpin" : "Pin"}
                </TextLink>
                <TextLink onPress={onDelete} danger className="text-xs">
                    Delete
                </TextLink>
            </span>
        </header>
        <p className="mt-2 text-md leading-7 whitespace-pre-wrap text-secondary">{note.body}</p>
    </article>
);

/** The drawer. `studentId` null closes it. */
export const StudentProfileDrawer = ({ studentId, onClose }: { studentId: string | null; onClose: () => void }) => {
    const { data, set, error } = useApi<Profile>(studentId ? `/api/admin/students/${studentId}/profile` : null);
    const [body, setBody] = useState("");
    const [pinned, setPinned] = useState(false);
    useEffect(() => {
        setBody("");
        setPinned(false);
    }, [studentId]);
    useEffect(() => {
        if (error) toast(error.message);
    }, [error]);
    if (!studentId) return null;

    /* useApi keeps the last student's payload until the next one arrives; opening a second profile
       would show the first person's name and notes for a moment, and a note saved in that moment
       would be filed under the wrong profile. Only this student's data counts. */
    const current = data && data.student.id === studentId ? data : undefined;
    const student = current?.student;
    const notes = current?.notes || [];
    const stats = current?.stats;
    const attendanceRate = stats?.recorded_weeks ? Math.round((stats.live_weeks / stats.recorded_weeks) * 100) : null;
    const patchNotes = (f: (n: Note[]) => Note[]) => set((prev) => (prev ? { ...prev, notes: sortNotes(f(prev.notes)) } : prev!));

    const saveNote = async () => {
        const text = body.trim();
        if (!text) return toast("Write a note first");
        try {
            const note = await api<Note>(`/api/admin/students/${studentId}/notes`, { method: "POST", json: { body: text, pinned } });
            patchNotes((n) => [note, ...n]);
            setBody("");
            setPinned(false);
            toast("Note saved");
        } catch (e) {
            toast(errMsg(e));
        }
    };
    const togglePin = async (note: Note) => {
        try {
            const updated = await api<Note>(`/api/admin/notes/${note.id}`, { method: "PATCH", json: { pinned: !note.pinned } });
            patchNotes((n) => n.map((x) => (x.id === note.id ? { ...x, ...updated } : x)));
        } catch (e) {
            toast(errMsg(e));
        }
    };
    const deleteNote = async (note: Note) => {
        if (!(await askConfirm({ title: "Delete this note?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true }))) return;
        try {
            await api(`/api/admin/notes/${note.id}`, { method: "DELETE" });
            patchNotes((n) => n.filter((x) => x.id !== note.id));
            toast("Note deleted");
        } catch (e) {
            toast(errMsg(e));
        }
    };

    return (
        <SideDrawer
            open
            onClose={onClose}
            title={student?.name || "Student"}
            sub={student ? `${student.email}${student.classLabel ? ` · ${student.classLabel}` : ""}` : "Loading…"}
            footer={
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-quaternary">
                        <LockIcon className="size-4" /> Never visible to the student
                    </span>
                    <DuoButton color="secondary" size="sm" onPress={onClose}>
                        Close
                    </DuoButton>
                </div>
            }
        >
            {!student ? (
                <p className="text-sm text-quaternary">Loading…</p>
            ) : (
                <>
                    <DetailGrid>
                        <Detail label="Live attendance">{attendanceRate === null ? "No records yet" : `${attendanceRate}% of ${stats!.recorded_weeks} weeks`}</Detail>
                        <Detail label="Check-ins submitted">{stats?.checkins_submitted ?? 0}</Detail>
                        <Detail label="Homework submitted">{stats?.homework_submitted ?? 0}</Detail>
                        <Detail label="Average understanding">{stats?.avg_understanding ? `${stats.avg_understanding}/10` : "—"}</Detail>
                        <Detail label="Average confidence">{stats?.avg_confidence ? `${stats.avg_confidence}/10` : "—"}</Detail>
                        <Detail label="Last login">{student.last_login_at ? fmtDate(student.last_login_at, { time: true }) : "Never signed in"}</Detail>
                    </DetailGrid>

                    <ContactPanel student={student} onSaved={(phone) => set((prev) => (prev ? { ...prev, student: { ...prev.student, phone: phone || null } } : prev!))} />
                    <AddressPanel student={student} />
                    {current?.withdrawal && <WithdrawalSummary row={current.withdrawal} />}

                    <SubHead>Add a note</SubHead>
                    <TeacherBox id="new-note" label="Private to the Gaeilgeoir Guides team" value={body} onChange={setBody} rows={4} noFormat placeholder="A phone call, a reason for an absence, something to follow up on." />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <Toggle label="Pin to the top" isSelected={pinned} onChange={setPinned} />
                        <DuoButton size="sm" onPress={saveNote}>
                            Save Note
                        </DuoButton>
                    </div>

                    <SubHead>Notes{notes.length ? ` (${notes.length})` : ""}</SubHead>
                    {notes.length ? (
                        <div className="flex flex-col gap-2">
                            {notes.map((n) => (
                                <NoteCard key={n.id} note={n} onPin={() => togglePin(n)} onDelete={() => deleteNote(n)} />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border-2 border-dashed border-secondary p-5 text-center">
                            <h3 className="text-md font-bold text-primary">No notes yet</h3>
                            <p className="mt-1 text-sm text-tertiary">Anything you log here stays private to your team.</p>
                        </div>
                    )}
                </>
            )}
        </SideDrawer>
    );
};
