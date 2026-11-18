// Private messages, the teacher's side: who has written (newest first, unread marked), and the one
// long conversation with whichever student is open. /teach/messages lists; /teach/messages/<student>
// opens. On a phone the list and the conversation are one after the other, not side by side.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Link, useNavigate, useParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, DuoInput } from "@/components/app/duo-dialog";
import { Avatar } from "@/components/app/hub-parts";
import { ArrowLeft, Plus } from "@/components/app/ic";
import { Thread } from "@/components/app/message-thread";
import { type Inbox, type Message, type TeacherThread, setUnread, whenLabel } from "@/lib/messages";
import { api } from "@/lib/portal";
import { cx } from "@/utils/cx";

const POLL_MS = 10_000;

const Open = ({ studentId, onChanged }: { studentId: string; onChanged: () => void }) => {
    const [data, setData] = useState<TeacherThread | null>(null);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(async () => {
        try {
            setData(await api<TeacherThread>(`/api/admin/messages/${studentId}`));
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        }
    }, [studentId]);
    useEffect(() => {
        setData(null);
        load().then(onChanged);
        const t = window.setInterval(() => document.visibilityState !== "hidden" && load(), POLL_MS);
        return () => window.clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const send = async (body: string) => {
        const { message } = await api<{ message: Message }>(`/api/admin/messages/${studentId}`, { method: "POST", json: { body } });
        setData((d) => (d ? { ...d, messages: [...d.messages, message] } : d));
        onChanged();
    };
    if (error && !data) return <p className="p-6 text-md text-tertiary">{error}</p>;
    if (!data) return <p className="p-6 text-sm text-quaternary">Loading…</p>;
    const s = data.student;
    return (
        <>
            <header className="flex items-center gap-3 border-b-2 border-secondary px-4 py-3 sm:px-6">
                <Link to="/teach/messages" aria-label="Back to all conversations" className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-xl text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 @3xl:hidden">
                    <ArrowLeft aria-hidden="true" className="size-5" />
                </Link>
                <Avatar who={{ name: s.name, role: "student", avatar: s.avatar }} size="md" />
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-primary">{s.name}</h2>
                    <p className="truncate text-sm text-tertiary">
                        {s.className || "No class"} · {s.email}
                    </p>
                </div>
            </header>
            <Thread
                className="flex-1"
                messages={data.messages}
                mine={(m) => m.fromTeacher}
                onSend={send}
                placeholder={`Reply to ${s.name.split(" ")[0]}`}
                disabled={s.active ? null : "This student's account is switched off, so they would not see a reply."}
                empty={<p className="max-w-sm text-center text-md text-tertiary">Nothing yet. Whatever you write here starts the conversation, and {s.name.split(" ")[0]} gets an email to say it is there.</p>}
            />
        </>
    );
};

/** Starting a conversation with a student who has not written. */
const NewMessage = ({ open, onClose, inbox }: { open: boolean; onClose: () => void; inbox: Inbox | null }) => {
    const [q, setQ] = useState("");
    const nav = useNavigate();
    const found = useMemo(() => {
        const term = q.trim().toLowerCase();
        return (inbox?.students || []).filter((s) => !term || s.name.toLowerCase().includes(term)).slice(0, 40);
    }, [q, inbox]);
    return (
        <DuoDialog open={open} onClose={onClose} title="New message" sub="Choose the student to write to.">
            <DuoInput value={q} onChange={setQ} ariaLabel="Find a student" placeholder="Find a student" autoFocus className="py-2.5 text-sm" />
            <ul className="mt-3 flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
                {found.map((s) => (
                    <li key={s.id}>
                        <AriaButton
                            onPress={() => {
                                onClose();
                                setQ("");
                                nav(`/teach/messages/${s.id}`);
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                        >
                            <span className="truncate text-sm font-bold text-primary">{s.name}</span>
                            <span className="shrink-0 truncate text-xs text-quaternary">{s.className || ""}</span>
                        </AriaButton>
                    </li>
                ))}
                {!found.length && <li className="px-3 py-2 text-sm text-quaternary">Nobody by that name.</li>}
            </ul>
        </DuoDialog>
    );
};

export const MessagesSection = () => {
    const { id } = useParams();
    const [inbox, setInbox] = useState<Inbox | null>(null);
    const [picking, setPicking] = useState(false);
    const load = useCallback(async () => {
        try {
            const d = await api<Inbox>("/api/admin/messages");
            setInbox(d);
            setUnread(d.unread);
        } catch {
            /* the list keeps what it had */
        }
    }, []);
    useEffect(() => {
        load();
        const t = window.setInterval(() => document.visibilityState !== "hidden" && load(), 20_000);
        return () => window.clearInterval(t);
    }, [load]);

    const list = inbox?.conversations || [];
    return (
        <>
            <SectionHead
                title="Private messages"
                sub="One conversation with each student. They get an email when you reply, and you get one when they write."
                actions={
                    <DuoButton size="sm" color="secondary" iconLeading={Plus} onPress={() => setPicking(true)}>
                        New message
                    </DuoButton>
                }
            />
            {/* Side by side when the box itself is wide enough (it depends on which menus are open, not
                on the screen); otherwise the list, then the conversation with a way back. */}
            <div className="@container">
            <div className="flex h-[calc(100dvh-19rem)] min-h-[28rem] overflow-hidden rounded-3xl border-2 border-secondary bg-primary">
                <aside className={cx("w-full shrink-0 flex-col overflow-y-auto @3xl:flex @3xl:w-80 @3xl:border-r-2 @3xl:border-secondary", id ? "hidden" : "flex")} aria-label="Conversations">
                    {!inbox ? (
                        <p className="p-5 text-sm text-quaternary">Loading…</p>
                    ) : list.length === 0 ? (
                        <p className="p-5 text-md text-tertiary">No private messages yet. When a student writes, the conversation appears here.</p>
                    ) : (
                        <ul>
                            {list.map((c) => (
                                <li key={c.studentId}>
                                    <Link
                                        to={`/teach/messages/${c.studentId}`}
                                        aria-current={id === c.studentId ? "page" : undefined}
                                        className={cx("flex items-center gap-3 border-b-2 border-secondary px-4 py-3 outline-focus-ring focus-visible:outline-2 focus-visible:-outline-offset-2", id === c.studentId ? "bg-brand-primary" : "hover:bg-primary_hover")}
                                    >
                                        <Avatar who={{ name: c.name, role: "student", avatar: c.avatar }} size="md" />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-2">
                                                <span className={cx("truncate text-sm text-primary", c.unread ? "font-black" : "font-bold")}>{c.name}</span>
                                                <span className="shrink-0 text-xs font-semibold text-quaternary">{whenLabel(c.lastAt)}</span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <span className={cx("min-w-0 flex-1 truncate text-sm", c.unread ? "font-semibold text-primary" : "text-tertiary")}>
                                                    {c.lastFromTeacher ? "You: " : ""}
                                                    {c.lastBody}
                                                </span>
                                                {c.unread > 0 && <span className="shrink-0 rounded-full bg-brand-solid px-2 py-0.5 text-xs font-bold text-white tabular-nums">{c.unread}</span>}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>
                <section className={cx("min-w-0 flex-1 flex-col @3xl:flex", id ? "flex" : "hidden")} aria-label="Conversation">
                    {id ? <Open key={id} studentId={id} onChanged={load} /> : <p className="m-auto max-w-xs p-6 text-center text-md text-tertiary">Choose a conversation, or start one with New message.</p>}
                </section>
            </div>
            </div>
            <NewMessage open={picking} onClose={() => setPicking(false)} inbox={inbox} />
        </>
    );
};
