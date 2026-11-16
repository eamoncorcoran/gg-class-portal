// Teacher dictation and voice notes on MediaRecorder, ported from the old hub: the same containers,
// the same `audio` field, the same `mode` and `seconds` fields, the same wording. Dictation is a
// teacher tool and must never appear on a student screen, so the gate is here rather than at the
// call sites: for anybody who is not an admin the button simply does not render.
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import * as P from "@phosphor-icons/react";
import { Button as AriaButton } from "react-aria-components";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton } from "@/components/app/duo";
import { toast } from "@/components/app/toast";
import { type VoiceNote, errMsg, fmtDate, fmtDuration } from "@/lib/teach";
import { upload, useMe, api } from "@/lib/portal";
import { cx } from "@/utils/cx";

/* ---- the recorder ---- */

/** The best container this browser will actually produce. Safari only does mp4. */
const preferredAudioType = () => {
    if (typeof MediaRecorder === "undefined") return "";
    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
};

export const voiceSupported = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

export type RecordingHandle = { seconds: number; cancel: () => void; stop: () => Promise<{ blob: Blob; seconds: number }> };

/* A single active recording. Only one runs at a time so two microphones can never compete, and the
   track is always stopped so the browser's recording indicator goes away even when something throws. */
let activeRecorder: { handle: MediaRecorder; stop: RecordingHandle["stop"] } | null = null;

export const startRecording = async ({ onTick, onLevel }: { onTick?: (s: number) => void; onLevel?: (v: number) => void } = {}): Promise<RecordingHandle> => {
    if (!voiceSupported()) throw new Error("This browser cannot record audio. Try Chrome, Edge or Safari.");
    if (activeRecorder) await activeRecorder.stop().catch(() => undefined);

    let stream: MediaStream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === "NotAllowedError" || name === "SecurityError") throw new Error("Microphone access was blocked. Allow it for this site in your browser settings, then try again.");
        if (name === "NotFoundError") throw new Error("No microphone was found.");
        throw new Error("The microphone could not be started.");
    }

    const mimeType = preferredAudioType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.addEventListener("dataavailable", (e) => {
        if (e.data?.size) chunks.push(e.data);
    });

    // Live level meter, so it is obvious the microphone is actually hearing something.
    let audioContext: AudioContext | null = null;
    let levelTimer: ReturnType<typeof setInterval> | null = null;
    if (onLevel && typeof AudioContext !== "undefined") {
        try {
            audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            audioContext.createMediaStreamSource(stream).connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            levelTimer = setInterval(() => {
                analyser.getByteTimeDomainData(data);
                let peak = 0;
                for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
                onLevel(Math.min(1, peak / 60));
            }, 100);
        } catch {
            audioContext = null;
        }
    }

    const tickTimer = onTick ? setInterval(() => onTick((Date.now() - startedAt) / 1000), 250) : null;
    const cleanUp = () => {
        if (tickTimer) clearInterval(tickTimer);
        if (levelTimer) clearInterval(levelTimer);
        stream.getTracks().forEach((t) => t.stop());
        audioContext?.close().catch(() => undefined);
        if (activeRecorder?.handle === recorder) activeRecorder = null;
    };

    recorder.start();

    const stop = () =>
        new Promise<{ blob: Blob; seconds: number }>((resolve, reject) => {
            recorder.addEventListener(
                "error",
                (e) => {
                    cleanUp();
                    reject((e as unknown as { error?: Error }).error || new Error("Recording failed."));
                },
                { once: true },
            );
            recorder.addEventListener(
                "stop",
                () => {
                    const seconds = (Date.now() - startedAt) / 1000;
                    cleanUp();
                    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
                    if (!blob.size) return reject(new Error("Nothing was recorded."));
                    resolve({ blob, seconds });
                },
                { once: true },
            );
            try {
                recorder.stop();
            } catch (error) {
                cleanUp();
                reject(error);
            }
        });

    activeRecorder = { handle: recorder, stop };
    return {
        get seconds() {
            return (Date.now() - startedAt) / 1000;
        },
        cancel() {
            try {
                recorder.stop();
            } catch {
                /* already stopped */
            }
            cleanUp();
        },
        stop,
    };
};

export const audioFileName = (blob: Blob) => {
    const base = String(blob.type).split(";")[0];
    return `recording${({ "audio/webm": ".webm", "audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/wav": ".wav" } as Record<string, string>)[base] || ".webm"}`;
};

/* ---- text boxes the teacher writes feedback in ---- */

/** Drops dictated text in at the cursor, keeping a sensible space or blank line. */
export const insertDictatedText = (target: HTMLTextAreaElement, text: string, onChange: (v: string) => void) => {
    if (!text) return;
    const before = target.value.slice(0, target.selectionStart ?? target.value.length);
    const after = target.value.slice(target.selectionEnd ?? target.value.length);
    const needsGap = before.trim() && !/\n\s*$/.test(before);
    const joined = `${before}${needsGap ? (before.endsWith(" ") ? "" : " ") : ""}${text}`;
    onChange(joined + after);
    const caret = joined.length;
    requestAnimationFrame(() => {
        target.focus();
        target.setSelectionRange(caret, caret);
    });
};

/* A dictate button that sits above a textarea. `mode` is 'light' for the Irish corrections box,
   where the cleanup model must not touch the Irish being taught. */
export const DictateButton = ({ boxRef, onChange, mode = "full" }: { boxRef: RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void; mode?: "full" | "light" }) => {
    const me = useMe();
    const [state, setState] = useState<"" | "recording" | "working">("");
    const [timer, setTimer] = useState("");
    const rec = useRef<RecordingHandle | null>(null);
    useEffect(() => () => rec.current?.cancel(), []);
    if (me?.role !== "admin" || !voiceSupported()) return null;

    const toggle = async () => {
        const target = boxRef.current;
        if (!target) return;
        if (state === "recording") {
            const recorder = rec.current;
            setState("working");
            setTimer("");
            try {
                if (!recorder) throw new Error("Nothing was recorded.");
                const { blob, seconds } = await recorder.stop();
                if (seconds < 0.6) throw new Error("That recording was too short.");
                const form = new FormData();
                form.append("audio", blob, audioFileName(blob));
                form.append("mode", mode);
                const result = await upload<{ text: string; cleaned: boolean }>("/api/admin/dictate", form);
                insertDictatedText(target, result.text, onChange);
                toast(result.cleaned ? "Dictation added" : "Dictation added without cleanup");
            } catch (e) {
                toast(errMsg(e));
            } finally {
                setState("");
                rec.current = null;
            }
            return;
        }
        try {
            rec.current = await startRecording({ onTick: (s) => setTimer(fmtDuration(s)) });
            setState("recording");
            setTimer("0:00");
        } catch (e) {
            toast(errMsg(e));
        }
    };

    return (
        <AriaButton
            type="button"
            onPress={toggle}
            isDisabled={state === "working"}
            aria-label={`Dictate this${mode === "light" ? ". Irish wording is left exactly as you say it." : ""}`}
            className={cx(
                "inline-flex h-8 items-center gap-1.5 rounded-xl border-2 px-2.5 text-xs font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                state === "recording" ? "border-error bg-error-primary text-error-primary" : state === "working" ? "border-secondary bg-secondary text-quaternary" : "border-secondary bg-primary text-brand-secondary hover:bg-primary_hover",
            )}
        >
            {state === "recording" ? <P.Stop size={14} weight="fill" aria-hidden="true" /> : <P.Microphone size={14} weight="bold" aria-hidden="true" />}
            {state === "recording" ? "Stop" : state === "working" ? "Transcribing" : "Dictate"}
            {state === "recording" && <span className="tabular-nums">{timer}</span>}
        </AriaButton>
    );
};

/** Wraps the selection in a markdown marker; pressing bold on something already bold takes it off again. */
export const wrapSelection = (box: HTMLTextAreaElement, marker: string, onChange: (v: string) => void) => {
    const start = box.selectionStart;
    const end = box.selectionEnd;
    const chosen = box.value.slice(start, end);
    const before = box.value.slice(0, start);
    const after = box.value.slice(end);
    let next: string, s: number, e: number;
    if (chosen && before.endsWith(marker) && after.startsWith(marker)) {
        next = before.slice(0, -marker.length) + chosen + after.slice(marker.length);
        s = start - marker.length;
        e = end - marker.length;
    } else {
        next = `${before}${marker}${chosen}${marker}${after}`;
        s = start + marker.length;
        e = end + marker.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
        box.focus();
        box.setSelectionRange(s, e);
    });
};

/** The two-button bold and italic bar over a feedback box. */
export const FormatBar = ({ boxRef, onChange }: { boxRef: RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void }) => {
    const wrap = (marker: string) => boxRef.current && wrapSelection(boxRef.current, marker, onChange);
    const cls = "flex size-8 items-center justify-center rounded-lg border-2 border-secondary bg-primary text-sm text-secondary hover:bg-primary_hover";
    return (
        <span className="inline-flex gap-1">
            {/* Down rather than click, so the box does not lose its selection first. */}
            <button type="button" className={cls} title="Bold (Ctrl+B)" aria-label="Bold" onMouseDown={(e) => (e.preventDefault(), wrap("**"))}>
                <b>B</b>
            </button>
            <button type="button" className={cls} title="Italic (Ctrl+I)" aria-label="Italic" onMouseDown={(e) => (e.preventDefault(), wrap("*"))}>
                <i>I</i>
            </button>
        </span>
    );
};

export const TEXTAREA_CLASS = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md leading-7 text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/80 focus:border-brand";

/* A feedback box: label, format bar, dictate button, textarea, hint. Enter submits when `onSubmit`
   is given (Shift + Enter adds a line), Ctrl/Cmd+B and I wrap the selection. */
export const TeacherBox = ({
    id,
    label,
    value,
    onChange,
    onSubmit,
    hint,
    mode,
    rows = 6,
    className,
    placeholder,
    noFormat,
}: {
    id: string;
    label: ReactNode;
    value: string;
    onChange: (v: string) => void;
    onSubmit?: () => void;
    hint?: ReactNode;
    mode?: "full" | "light";
    rows?: number;
    className?: string;
    placeholder?: string;
    noFormat?: boolean;
}) => {
    const box = useRef<HTMLTextAreaElement>(null);
    return (
        <div className={className}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={id} className="duo-label text-quaternary">
                    {label}
                </label>
                <span className="flex items-center gap-2">
                    {!noFormat && <FormatBar boxRef={box} onChange={onChange} />}
                    <DictateButton boxRef={box} onChange={onChange} mode={mode} />
                </span>
            </div>
            <textarea
                id={id}
                ref={box}
                rows={rows}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (onSubmit && e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSubmit();
                        return;
                    }
                    if (noFormat || !(e.metaKey || e.ctrlKey)) return;
                    const key = e.key.toLowerCase();
                    if (key === "b") (e.preventDefault(), wrapSelection(e.currentTarget, "**", onChange));
                    if (key === "i") (e.preventDefault(), wrapSelection(e.currentTarget, "*", onChange));
                }}
                className={cx(TEXTAREA_CLASS, "resize-y")}
            />
            {hint && <p className="mt-1.5 text-xs text-quaternary">{hint}</p>}
        </div>
    );
};

/* ---- voice notes ---- */

export const VoiceNotePlayer = ({ note, children }: { note: VoiceNote; children?: ReactNode }) => (
    <div className="flex flex-wrap items-center gap-3">
        <audio controls preload="none" src={note.url} className="h-10 min-w-0 flex-1" />
        <span className="text-sm font-semibold text-tertiary tabular-nums">{fmtDuration(note.seconds)}</span>
        {children}
    </div>
);

const HINT_DEFAULT = "Optional. Students hear this alongside your written feedback.";

/* The voice note block in the review drawer: record, play back, re-record, remove. A note can carry
   the whole reply, so the written boxes may be left empty. */
export const VoiceNoteBlock = <R extends { voice_note: VoiceNote | null }>({ type, id, note, onRow }: { type: "checkin" | "homework" | "comment"; id: string; note: VoiceNote | null; onRow: (row: R) => void }) => {
    const [recording, setRecording] = useState(false);
    const [rerecording, setRerecording] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState("");
    const [level, setLevel] = useState(0);
    const rec = useRef<RecordingHandle | null>(null);
    useEffect(() => () => rec.current?.cancel(), []);
    useEffect(() => setRerecording(false), [id]);

    if (!voiceSupported() && !note) {
        return (
            <div className="rounded-2xl border-2 border-secondary bg-secondary p-4 text-sm text-tertiary">This browser cannot record audio, so voice notes are unavailable here.</div>
        );
    }

    const remove = async () => {
        if (!(await askConfirm({ title: "Remove this voice note?", message: "The recording is deleted and the student will no longer hear it.", confirmLabel: "Remove", danger: true }))) return;
        try {
            const row = await api<R>(`/api/admin/voice-note/${type}/${id}`, { method: "DELETE" });
            onRow(row);
            setRerecording(false);
            toast("Voice note removed");
        } catch (e) {
            toast(errMsg(e));
        }
    };

    const press = async () => {
        if (recording) {
            setSaving(true);
            setStatus("Saving…");
            try {
                const handle = rec.current;
                rec.current = null;
                if (!handle) throw new Error("Nothing was recorded.");
                const { blob, seconds } = await handle.stop();
                if (seconds < 0.6) throw new Error("That recording was too short.");
                const form = new FormData();
                form.append("audio", blob, audioFileName(blob));
                form.append("seconds", String(Math.round(seconds)));
                const row = await upload<R>(`/api/admin/voice-note/${type}/${id}`, form);
                onRow(row);
                setRerecording(false);
                toast("Voice note saved");
            } catch (e) {
                toast(errMsg(e));
            } finally {
                setRecording(false);
                setSaving(false);
                setStatus("");
                setLevel(0);
            }
            return;
        }
        try {
            rec.current = await startRecording({ onTick: (s) => setStatus(fmtDuration(s)), onLevel: (v) => setLevel(v) });
            setRecording(true);
            setStatus("0:00");
        } catch (e) {
            toast(errMsg(e));
        }
    };

    const showPlayer = note && !rerecording;
    return (
        <div className="rounded-2xl border-2 border-secondary bg-primary p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-bold text-primary">
                    <P.Microphone size={16} weight="bold" aria-hidden="true" /> Voice note
                </span>
                <span className="text-xs text-quaternary">{note ? `Recorded ${fmtDate(note.recordedAt, { time: true, weekday: true, dateStyle: "short" })}` : HINT_DEFAULT}</span>
            </div>
            {showPlayer ? (
                <VoiceNotePlayer note={note}>
                    <DuoButton color="secondary" size="xs" onPress={() => setRerecording(true)}>
                        Re-record
                    </DuoButton>
                    <DuoButton color="danger" size="xs" onPress={remove}>
                        Remove
                    </DuoButton>
                </VoiceNotePlayer>
            ) : (
                <div className="flex flex-wrap items-center gap-3">
                    <DuoButton color={recording ? "danger" : "secondary"} size="sm" onPress={press} isDisabled={saving}>
                        {recording ? "Stop Recording" : "Record a Voice Note"}
                    </DuoButton>
                    <span className="text-sm font-semibold text-tertiary tabular-nums">{status}</span>
                    <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                        <span className={cx("block h-full rounded-full bg-brand-500 transition-[width] duration-100", !recording && "opacity-0")} style={{ width: `${Math.round(level * 100)}%` }} />
                    </span>
                    {note && rerecording && !recording && (
                        <DuoButton color="ghost" size="xs" onPress={() => setRerecording(false)}>
                            Keep the Old One
                        </DuoButton>
                    )}
                </div>
            )}
        </div>
    );
};
