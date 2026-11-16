// Who this browser is. A card at the foot of the sidebar: a teacher with their classes, a student in
// one class, or nobody yet, with a dialog to become either. Teachers get a name only; students need
// the class code their teacher reads out.
import { useState } from "react";
import { LogOut01 } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";
import { useNavigate } from "react-router";
import { DuoButton } from "./duo";
import { DuoDialog, DuoInput, FieldLabel } from "./duo-dialog";
import { DuoBooks, DuoClipboard } from "./duo-icons";
import { Segmented } from "./segmented";
import { toast } from "./toast";
import { api, signOut } from "@/lib/classroom";
import { useStore } from "@/lib/store";

export const useAccount = () => useStore((s) => s.account);

export const AccountDialog = ({ open, onClose, start = "teacher" }: { open: boolean; onClose: () => void; start?: "teacher" | "student" }) => {
    const [role, setRole] = useState<"teacher" | "student">(start);
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const nav = useNavigate();
    const go = async () => {
        setBusy(true);
        setErr("");
        try {
            if (role === "teacher") {
                await api.becomeTeacher(name);
                toast(`Welcome, ${name.trim()}`);
                onClose();
                nav("/classes");
            } else {
                const r = await api.join(code, name);
                toast(`You're in ${r.class.name}`);
                onClose();
                nav("/homework");
            }
        } catch (e) {
            setErr((e as Error).message);
        }
        setBusy(false);
    };
    return (
        <DuoDialog open={open} onClose={onClose} title={role === "teacher" ? "Set up as a teacher" : "Join your class"} sub={role === "teacher" ? "Make classes, share exams and quizzes, and see who has done the homework." : "Your teacher sends a link to join. If you only have the six-letter code, type it here."}>
            <Segmented ghost size="md" label="I am a" value={role} onChange={setRole} items={[{ id: "teacher", label: "Teacher" }, { id: "student", label: "Student" }]} itemClassName="px-4 py-2.5 duo-label" />
            <div className="mt-5 flex flex-col gap-4">
                {role === "student" && (
                    <div>
                        <FieldLabel>Class code</FieldLabel>
                        <DuoInput ariaLabel="Class code" value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="ABC123" maxLength={6} mono autoFocus />
                    </div>
                )}
                <div>
                    <FieldLabel>Your name</FieldLabel>
                    <DuoInput ariaLabel="Your name" value={name} onChange={setName} placeholder={role === "teacher" ? "e.g. Múinteoir Ní Bhriain" : "First name and surname"} maxLength={60} autoFocus={role === "teacher"} onEnter={go} />
                </div>
                {err && (
                    <p role="alert" className="rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">
                        {err}
                    </p>
                )}
                <DuoButton full onPress={go} isDisabled={busy || !name.trim() || (role === "student" && code.length < 6)}>
                    {busy ? "One moment…" : role === "teacher" ? "Continue" : "Join class"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/** The sidebar's foot: who you are, with the way in or out. */
export const AccountCard = () => {
    const acct = useAccount();
    const [open, setOpen] = useState<null | "teacher" | "student">(null);
    return (
        <div className="mx-4 mt-4 mb-4 rounded-2xl border-2 border-secondary p-3">
            {acct ? (
                <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    {acct.role === "teacher" ? <DuoBooks aria-hidden="true" className="size-9 shrink-0" /> : <DuoClipboard aria-hidden="true" className="size-9 shrink-0" />}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-primary">{acct.name}</p>
                        <p className="truncate duo-label text-quaternary">{acct.role === "teacher" ? "Teacher" : acct.className}</p>
                    </div>
                    <AriaButton
                        aria-label="Sign out"
                        onPress={() => {
                            signOut();
                            toast("Signed out");
                        }}
                        className="rounded-lg p-1.5 text-fg-quaternary outline-focus-ring hover:bg-secondary hover:text-fg-secondary focus-visible:outline-2"
                    >
                        <LogOut01 aria-hidden="true" className="size-4.5" />
                    </AriaButton>
                </div>
                </div>
            ) : (
                <>
                    <p className="text-sm font-bold text-primary">Teachers and classes</p>
                    <p className="mt-0.5 text-xs text-tertiary">Share exams and quizzes as homework, marked for you.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <DuoButton size="xs" color="secondary" onPress={() => setOpen("teacher")}>
                            Teacher
                        </DuoButton>
                        <DuoButton size="xs" color="secondary" onPress={() => setOpen("student")}>
                            Join class
                        </DuoButton>
                    </div>
                </>
            )}
            {open && <AccountDialog open onClose={() => setOpen(null)} start={open} />}
        </div>
    );
};

/** Shown on a teacher-only or student-only page when this browser isn't one yet. */
export const NeedAccount = ({ role }: { role: "teacher" | "student" }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="mx-auto max-w-md rounded-3xl border-2 border-secondary p-8 text-center">
            {role === "teacher" ? <DuoBooks aria-hidden="true" className="mx-auto size-16" /> : <DuoClipboard aria-hidden="true" className="mx-auto size-16" />}
            <h2 className="mt-4 text-xl font-bold text-primary">{role === "teacher" ? "This is the teachers' room" : "Join a class first"}</h2>
            <p className="mt-2 text-md text-tertiary">{role === "teacher" ? "Set yourself up as a teacher to make classes and share homework." : "Your teacher's six-letter code gets you in; your homework appears here."}</p>
            <DuoButton className="mt-6" onPress={() => setOpen(true)}>
                {role === "teacher" ? "I'm a teacher" : "Join a class"}
            </DuoButton>
            <AccountDialog open={open} onClose={() => setOpen(false)} start={role} />
        </div>
    );
};
