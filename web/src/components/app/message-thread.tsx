// A private conversation drawn as one long thread: every message there has ever been, oldest at the
// top, a line for each new day, and the place to write pinned underneath. The student's page and the
// teacher's console both use this; `mine` says which side of the conversation is on the right.
//
// A message can carry files, shown under it as something to open, and a voice note, shown as a
// player. `accept` is what this side may attach and `canVoice` whether it may record: a student may
// send a PDF or a Word document and may not record; the hub enforces both whatever this draws.
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ArrowUp, FileDoc, Microphone01, Paperclip, StopCircle, X } from "@/components/app/ic";
import { VoiceNotePlayer, useRecorder } from "@/components/app/recorder";
import { MAX_FILE_MB, MAX_FILES, MESSAGE_MAX, type Message, type MessageFile, type Outgoing, dayLabel, fileSize, sameDay, timeLabel } from "@/lib/messages";
import { fmtDuration } from "@/lib/student";
import { cx } from "@/utils/cx";

/* Addresses in a message are made pressable; nothing else in it is treated as anything but text. */
const withLinks = (text: string): ReactNode[] =>
    text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g).map((part, i) =>
        i % 2 ? (
            <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
                {part}
            </a>
        ) : (
            part
        ),
    );

/** A file somebody sent: its name and size, and pressing it opens or downloads it. */
const FileChip = ({ f }: { f: MessageFile }) => (
    <a
        href={f.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex max-w-full items-center gap-3 rounded-2xl border-2 border-secondary bg-primary px-3 py-2 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
    >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-brand-secondary">
            <FileDoc aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-primary">{f.name}</span>
            <span className="block text-xs font-semibold text-quaternary">{fileSize(f.size)}</span>
        </span>
    </a>
);

export const Thread = ({
    messages,
    mine,
    empty,
    onSend,
    placeholder,
    disabled,
    className,
    accept,
    attachHint,
    canVoice,
}: {
    messages: Message[];
    /** True for a message this reader wrote, which goes on the right. */
    mine: (m: Message) => boolean;
    empty: ReactNode;
    onSend: (out: Outgoing) => Promise<void>;
    placeholder: string;
    disabled?: string | null;
    className?: string;
    /** The file picker's list of what this side may attach. */
    accept: string;
    /** Said when a file is turned away, e.g. "You can attach a PDF or a Word document." */
    attachHint: string;
    canVoice?: boolean;
}) => {
    const scroller = useRef<HTMLDivElement>(null);
    const box = useRef<HTMLTextAreaElement>(null);
    const picker = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [voice, setVoice] = useState<Outgoing["voice"]>(null);
    const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rec = useRecorder();
    const lastId = messages.at(-1)?.id;
    const nearEnd = useRef(true);

    /* Open at the newest message, and stay there as more arrive, unless the reader has scrolled up
       to read something older: then a new message must not pull the page out from under them. */
    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && nearEnd.current) el.scrollTop = el.scrollHeight;
    }, [lastId, messages.length]);
    const onScroll = () => {
        const el = scroller.current;
        if (el) nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    // the box grows with what is typed, up to about eight lines
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [draft]);
    // the recording just made can be listened to before it is sent
    useEffect(() => {
        if (!voice) return setVoiceUrl(null);
        const url = URL.createObjectURL(voice.blob);
        setVoiceUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [voice]);

    const pick = (chosen: FileList | null) => {
        if (!chosen?.length) return;
        const allowed = accept.split(",");
        const next = [...files];
        let problem: string | null = null;
        for (const f of Array.from(chosen)) {
            const ext = `.${f.name.split(".").pop()?.toLowerCase() || ""}`;
            if (!allowed.includes(ext)) problem = `"${f.name}" cannot be sent. ${attachHint}`;
            else if (f.size > MAX_FILE_MB * 1048576) problem = `"${f.name}" is too large. Attachments can be up to ${MAX_FILE_MB}MB.`;
            else if (next.length >= MAX_FILES) problem = `A message can carry up to ${MAX_FILES} files.`;
            else if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
        }
        setFiles(next);
        setError(problem);
        if (picker.current) picker.current.value = "";
    };

    const record = async () => {
        setError(null);
        try {
            if (rec.recording) {
                const out = await rec.stop();
                setVoice({ blob: out.blob, seconds: out.seconds, fileName: rec.fileName(out.blob) });
            } else {
                setVoice(null);
                await rec.start();
            }
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const ready = Boolean(draft.trim() || files.length || voice);
    const send = async () => {
        if (!ready || sending || disabled || rec.recording) return;
        setSending(true);
        setError(null);
        try {
            nearEnd.current = true;
            await onSend({ body: draft.trim(), files, voice });
            setDraft("");
            setFiles([]);
            setVoice(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSending(false);
            box.current?.focus();
        }
    };

    const lastMine = [...messages].reverse().find(mine);
    const tool = "flex size-[46px] shrink-0 items-center justify-center rounded-full text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-secondary focus-visible:outline-2";
    return (
        <div className={cx("flex min-h-0 flex-col", className)}>
            <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" role="log" aria-live="polite" aria-label="Conversation">
                {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">{empty}</div>
                ) : (
                    <ol className="mx-auto flex max-w-2xl flex-col">
                        {messages.map((m, i) => {
                            const prev = messages[i - 1];
                            const next = messages[i + 1];
                            const own = mine(m);
                            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
                            // a run of messages from one side within a few minutes reads as one turn
                            const joinsPrev = !newDay && prev && mine(prev) === own && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60000;
                            const endsRun = !next || mine(next) !== own || !sameDay(next.createdAt, m.createdAt) || +new Date(next.createdAt) - +new Date(m.createdAt) >= 5 * 60000;
                            const attached = m.files || [];
                            return (
                                <li key={m.id} className={cx("flex flex-col", own ? "items-end" : "items-start", joinsPrev ? "mt-1" : "mt-4", i === 0 && "mt-0")}>
                                    {newDay && (
                                        <p className={cx("mb-4 flex w-full items-center gap-3 text-xs font-bold text-quaternary", i > 0 && "mt-2")}>
                                            <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
                                            {dayLabel(m.createdAt)}
                                            <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
                                        </p>
                                    )}
                                    {!own && !joinsPrev && <p className="mb-1 ml-1 text-xs font-bold text-tertiary">{m.senderName}</p>}
                                    {m.body && <p className={cx("max-w-[85%] rounded-2xl px-4 py-2.5 text-md leading-6 break-words whitespace-pre-wrap", own ? "bg-brand-solid text-white" : "bg-secondary text-primary")}>{withLinks(m.body)}</p>}
                                    {attached.length > 0 && (
                                        <div className={cx("flex w-full max-w-[85%] flex-col gap-1.5", own ? "items-end" : "items-start", m.body && "mt-1.5")}>
                                            {attached.map((f) =>
                                                f.kind === "voice" ? <VoiceNotePlayer key={f.id} src={f.url} seconds={f.seconds} className="w-full max-w-sm" /> : <FileChip key={f.id} f={f} />,
                                            )}
                                        </div>
                                    )}
                                    {endsRun && (
                                        <p className={cx("mt-1 text-[11px] font-semibold text-quaternary", own ? "mr-1" : "ml-1")}>
                                            {timeLabel(m.createdAt)}
                                            {own && m.id === lastMine?.id && m.readAt ? " · Seen" : ""}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
            <div className="border-t-2 border-secondary px-3 py-3 sm:px-5">
                <div className="mx-auto max-w-2xl">
                    {error && (
                        <p role="alert" className="mb-2 rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">
                            {error}
                        </p>
                    )}
                    {disabled ? (
                        <p className="py-2 text-center text-sm font-semibold text-tertiary">{disabled}</p>
                    ) : (
                        <>
                            {/* what is going with the message: files picked, and a voice note just recorded */}
                            {(files.length > 0 || voice) && (
                                <ul className="mb-2 flex flex-col gap-1.5" aria-label="Attached to this message">
                                    {files.map((f) => (
                                        <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 rounded-xl bg-secondary py-1.5 pr-1.5 pl-3">
                                            <FileDoc aria-hidden="true" className="size-4.5 shrink-0 text-fg-quaternary" />
                                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{f.name}</span>
                                            <span className="shrink-0 text-xs font-semibold text-quaternary">{fileSize(f.size)}</span>
                                            <AriaButton aria-label={`Remove ${f.name}`} onPress={() => setFiles(files.filter((x) => x !== f))} className="flex size-7 shrink-0 items-center justify-center rounded-full text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                                                <X aria-hidden="true" className="size-4" />
                                            </AriaButton>
                                        </li>
                                    ))}
                                    {voice && voiceUrl && (
                                        <li className="flex items-center gap-2">
                                            <VoiceNotePlayer src={voiceUrl} seconds={voice.seconds} className="min-w-0 flex-1" />
                                            <AriaButton aria-label="Delete this voice note" onPress={() => setVoice(null)} className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                                                <X aria-hidden="true" className="size-4.5" />
                                            </AriaButton>
                                        </li>
                                    )}
                                </ul>
                            )}
                            {rec.recording ? (
                                <div className="flex items-center gap-3 rounded-2xl border-2 border-error bg-error-primary px-4 py-2">
                                    <span aria-hidden="true" className="size-3 shrink-0 animate-pulse rounded-full bg-error-solid" />
                                    <p className="flex-1 text-sm font-bold text-error-primary" aria-live="polite">
                                        Recording {fmtDuration(rec.seconds)}
                                    </p>
                                    <AriaButton onPress={rec.cancel} className="rounded-full px-3 py-1.5 text-sm font-bold text-tertiary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                                        Cancel
                                    </AriaButton>
                                    <AriaButton onPress={record} className="flex items-center gap-1.5 rounded-full bg-error-solid px-3.5 py-1.5 text-sm font-bold text-white outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2">
                                        <StopCircle aria-hidden="true" className="size-4" />
                                        Stop
                                    </AriaButton>
                                </div>
                            ) : (
                                <form
                                    className="flex items-end gap-1"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        send();
                                    }}
                                >
                                    <input ref={picker} type="file" multiple accept={accept} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files)} />
                                    <AriaButton aria-label="Attach a file" onPress={() => picker.current?.click()} className={tool}>
                                        <Paperclip aria-hidden="true" className="size-5" />
                                    </AriaButton>
                                    <textarea
                                        ref={box}
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            /* Enter sends on a keyboard; Shift+Enter is a new line. On a phone Enter is a
                                               new line and the button sends, which is what a phone keyboard leads you to expect. */
                                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                                                e.preventDefault();
                                                send();
                                            }
                                        }}
                                        rows={1}
                                        maxLength={MESSAGE_MAX}
                                        placeholder={placeholder}
                                        aria-label={placeholder}
                                        className="max-h-[200px] min-h-[46px] w-full resize-none rounded-2xl border-2 border-secondary bg-primary px-4 py-2.5 text-md leading-6 font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/80 focus:border-brand"
                                    />
                                    {canVoice && rec.supported && !voice && (
                                        <AriaButton aria-label="Record a voice note" onPress={record} className={tool}>
                                            <Microphone01 aria-hidden="true" className="size-5" />
                                        </AriaButton>
                                    )}
                                    <AriaButton
                                        type="submit"
                                        isDisabled={!ready || sending}
                                        aria-label="Send"
                                        className="ml-1 flex size-[46px] shrink-0 items-center justify-center rounded-full bg-brand-solid text-white outline-focus-ring transition duration-100 ease-linear hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-secondary disabled:text-fg-quaternary"
                                    >
                                        <ArrowUp aria-hidden="true" className="size-5" />
                                    </AriaButton>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
