// A private conversation drawn as one long thread: every message there has ever been, oldest at the
// top, a line for each new day, and the place to write pinned underneath. The student's page and the
// teacher's console both use this; `mine` says which side of the conversation is on the right.
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ArrowUp } from "@/components/app/ic";
import { MESSAGE_MAX, type Message, dayLabel, sameDay, timeLabel } from "@/lib/messages";
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

export const Thread = ({
    messages,
    mine,
    empty,
    onSend,
    placeholder,
    disabled,
    className,
}: {
    messages: Message[];
    /** True for a message this reader wrote, which goes on the right. */
    mine: (m: Message) => boolean;
    empty: ReactNode;
    onSend: (body: string) => Promise<void>;
    placeholder: string;
    disabled?: string | null;
    className?: string;
}) => {
    const scroller = useRef<HTMLDivElement>(null);
    const box = useRef<HTMLTextAreaElement>(null);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
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

    const send = async () => {
        const body = draft.trim();
        if (!body || sending || disabled) return;
        setSending(true);
        setError(null);
        try {
            nearEnd.current = true;
            await onSend(body);
            setDraft("");
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSending(false);
            box.current?.focus();
        }
    };

    const lastMine = [...messages].reverse().find(mine);
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
                                    <p className={cx("max-w-[85%] rounded-2xl px-4 py-2.5 text-md leading-6 break-words whitespace-pre-wrap", own ? "bg-brand-solid text-white" : "bg-secondary text-primary")}>{withLinks(m.body)}</p>
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
            <div className="border-t-2 border-secondary px-4 py-3 sm:px-6">
                <div className="mx-auto max-w-2xl">
                    {error && (
                        <p role="alert" className="mb-2 rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">
                            {error}
                        </p>
                    )}
                    {disabled ? (
                        <p className="py-2 text-center text-sm font-semibold text-tertiary">{disabled}</p>
                    ) : (
                        <form
                            className="flex items-end gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                send();
                            }}
                        >
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
                            <AriaButton
                                type="submit"
                                isDisabled={!draft.trim() || sending}
                                aria-label="Send"
                                className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-brand-solid text-white outline-focus-ring transition duration-100 ease-linear hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-secondary disabled:text-fg-quaternary"
                            >
                                <ArrowUp aria-hidden="true" className="size-5" />
                            </AriaButton>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
