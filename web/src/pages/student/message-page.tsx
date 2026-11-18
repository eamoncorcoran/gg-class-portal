// Private message: one long conversation with the teacher. Everything the student and the teacher
// have written to each other privately is here, oldest at the top, and the place to write is
// underneath. It is kept in the hub (it used to be another company's chat widget loaded into this
// page, which left no record here and, when it failed to load, left no line at all).
//
// A teacher who opens this address is sent to the console, where the conversations are listed.
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { Avatar } from "@/components/app/hub-parts";
import { Thread } from "@/components/app/message-thread";
import { Page } from "@/components/app/page-parts";
import { type Message, type StudentThread, setUnread } from "@/lib/messages";
import { api, useMe, useStudentBootstrap } from "@/lib/portal";
import { SignInCard } from "./password-pages";

const POLL_MS = 10_000;

const Conversation = () => {
    const boot = useStudentBootstrap();
    const [data, setData] = useState<StudentThread | null>(null);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(async () => {
        try {
            const d = await api<StudentThread>("/api/student/messages");
            setData(d);
            setError(null);
            setUnread(0); // opening the conversation is reading it
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);
    // While the conversation is open and in view, look for a reply every ten seconds.
    useEffect(() => {
        load();
        const t = window.setInterval(() => document.visibilityState !== "hidden" && load(), POLL_MS);
        const seen = () => document.visibilityState !== "hidden" && load();
        document.addEventListener("visibilitychange", seen);
        return () => {
            window.clearInterval(t);
            document.removeEventListener("visibilitychange", seen);
        };
    }, [load]);

    const send = async (body: string) => {
        const { message } = await api<{ message: Message }>("/api/student/messages", { method: "POST", json: { body } });
        setData((d) => (d ? { ...d, messages: [...d.messages, message] } : d));
    };

    const teacher = data?.teacher;
    return (
        <div className="mx-auto flex h-[calc(100dvh-13rem-env(safe-area-inset-bottom))] min-h-[22rem] max-w-3xl flex-col overflow-hidden rounded-3xl border-2 border-secondary bg-primary lg:h-[calc(100dvh-8.5rem)]">
            <header className="flex items-center gap-3 border-b-2 border-secondary px-4 py-3 sm:px-6">
                {teacher && <Avatar who={{ name: teacher.name, role: "admin", avatar: teacher.avatar }} size="md" />}
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-bold text-primary">{teacher ? teacher.name : "Private message"}</h1>
                    <p className="text-sm text-tertiary">Private. Only you and your teacher see this.</p>
                </div>
            </header>
            {error && !data ? (
                <p className="p-6 text-md text-tertiary">{error}</p>
            ) : !data ? (
                <p className="p-6 text-sm text-quaternary">Loading…</p>
            ) : (
                <Thread
                    className="flex-1"
                    messages={data.messages}
                    mine={(m) => !m.fromTeacher}
                    onSend={send}
                    placeholder={`Write to ${data.teacher.firstName}`}
                    empty={
                        <div className="mx-auto max-w-md text-center">
                            <p className="text-lg font-bold text-primary">Write to {data.teacher.firstName}</p>
                            <p className="mt-2 text-md leading-7 text-tertiary">For anything personal: your own circumstances, your account or payment, or something you would rather not put in front of the class. Please allow up to 48 hours for a reply. You will get an email when there is one.</p>
                            {boot?.hasCommunity && (
                                <p className="mt-4 rounded-2xl bg-brand-primary px-4 py-3 text-sm leading-6 font-semibold text-brand-secondary">
                                    A question about the course itself is usually answered faster on the{" "}
                                    <a href="/community" className="underline underline-offset-2">
                                        Community board
                                    </a>
                                    , where your classmates can answer too.
                                </p>
                            )}
                        </div>
                    }
                />
            )}
        </div>
    );
};

export const MessagePage = () => {
    const me = useMe();
    if (me === undefined)
        return (
            <Page>
                <p className="text-sm text-quaternary">Loading…</p>
            </Page>
        );
    if (!me) return <SignInCard next="/message" title="Sign in to send a message" note="The private line is for students of Gaeilgeoir Guides. Sign in first." />;
    if (me.role !== "student") return <Navigate to={me.isSuperAdmin ? "/teach/messages" : "/teach"} replace />;
    return (
        <div className="mx-auto w-full max-w-5xl px-3 pt-4 pb-4 md:px-10 md:pt-8">
            <Conversation />
        </div>
    );
};
