// Recording and playing voice notes. useRecorder() wraps MediaRecorder exactly the way the old
// startRecording() did (same constraints, same container preference, one recording at a time, the
// track always stopped so the browser's red dot goes away), and VoiceNotePlayer plays a note back
// with a proper play button and track rather than the browser's default strip.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Play } from "@/components/app/ic";
import { fmtDuration } from "@/lib/student";
import { cx } from "@/utils/cx";

/** The best container this browser will actually produce. Safari only does mp4. */
export const preferredAudioType = () => {
    if (typeof MediaRecorder === "undefined") return "";
    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
};

export const voiceSupported = () => Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

/** A file name whose extension matches the blob, so the server's type sniffing agrees with the browser's. */
export const audioFileName = (blob: Blob) => {
    const base = String(blob.type).split(";")[0];
    const ext: Record<string, string> = { "audio/webm": ".webm", "audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/wav": ".wav" };
    return `recording${ext[base] || ".webm"}`;
};

export type RecordingHandle = {
    readonly seconds: number;
    cancel: () => void;
    stop: () => Promise<{ blob: Blob; seconds: number }>;
};

/* A single active recording. Only one runs at a time so two microphones can never compete. */
let activeRecorder: { handle: MediaRecorder; stop: RecordingHandle["stop"] } | null = null;

export const startRecording = async ({ onTick, onLevel }: { onTick?: (s: number) => void; onLevel?: (v: number) => void } = {}): Promise<RecordingHandle> => {
    if (!voiceSupported()) throw new Error("This browser cannot record audio. Try Chrome, Edge or Safari.");
    if (activeRecorder) await activeRecorder.stop().catch(() => undefined);

    let stream: MediaStream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
        const name = (e as { name?: string }).name;
        if (name === "NotAllowedError" || name === "SecurityError") throw new Error("Microphone access was blocked. Allow it for this site in your browser settings, then try again.");
        if (name === "NotFoundError") throw new Error("No microphone was found.");
        throw new Error("The microphone could not be started.");
    }

    const mimeType = preferredAudioType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.addEventListener("dataavailable", (ev) => {
        if (ev.data?.size) chunks.push(ev.data);
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

    const stop: RecordingHandle["stop"] = () =>
        new Promise((resolve, reject) => {
            recorder.addEventListener(
                "error",
                (ev) => {
                    cleanUp();
                    reject((ev as unknown as { error?: Error }).error || new Error("Recording failed."));
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
            } catch (e) {
                cleanUp();
                reject(e);
            }
        });
    const handle: RecordingHandle = {
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
    activeRecorder = { handle: recorder, stop };
    return handle;
};

/**
 * Recording as React state: `start()` asks for the microphone, `stop()` resolves with the blob and
 * its length (and throws the old "too short" message under 0.6s), `seconds` and `level` tick while
 * recording. Unmounting cancels a recording in progress so no tab is left listening.
 */
export const useRecorder = () => {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [level, setLevel] = useState(0);
    const handle = useRef<RecordingHandle | null>(null);
    const supported = voiceSupported();

    useEffect(() => () => handle.current?.cancel(), []);

    const start = useCallback(async () => {
        handle.current = await startRecording({ onTick: setSeconds, onLevel: setLevel });
        setSeconds(0);
        setRecording(true);
    }, []);
    const stop = useCallback(async () => {
        const h = handle.current;
        handle.current = null;
        setRecording(false);
        setLevel(0);
        if (!h) throw new Error("Nothing was recorded.");
        const out = await h.stop();
        if (out.seconds < 0.6) throw new Error("That recording was too short.");
        return out;
    }, []);
    const cancel = useCallback(() => {
        handle.current?.cancel();
        handle.current = null;
        setRecording(false);
        setLevel(0);
    }, []);

    return { supported, recording, seconds, level, start, stop, cancel, fileName: audioFileName };
};

/** A voice note: play/pause, a scrubbable track, elapsed over total. `seconds` seeds the total before the file loads. */
export const VoiceNotePlayer = ({ src, seconds = 0, className, label = "Voice note" }: { src: string; seconds?: number; className?: string; label?: string }) => {
    const el = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [t, setT] = useState(0);
    /* While the thumb is being dragged the clock is ours, not the recording's: timeupdate would push it straight back. */
    const scrub = useRef(false);
    const want = useRef(0);
    const [dur, setDur] = useState(seconds);

    useEffect(() => {
        const a = el.current;
        if (!a) return;
        const on = () => setPlaying(true), off = () => setPlaying(false);
        const time = () => {
            if (!scrub.current) setT(a.currentTime);
        };
        const meta = () => setDur(Number.isFinite(a.duration) && a.duration ? a.duration : seconds);
        a.addEventListener("play", on);
        a.addEventListener("pause", off);
        a.addEventListener("ended", off);
        a.addEventListener("timeupdate", time);
        a.addEventListener("loadedmetadata", meta);
        a.addEventListener("durationchange", meta);
        return () => {
            a.removeEventListener("play", on);
            a.removeEventListener("pause", off);
            a.removeEventListener("ended", off);
            a.removeEventListener("timeupdate", time);
            a.removeEventListener("loadedmetadata", meta);
            a.removeEventListener("durationchange", meta);
        };
    }, [seconds, src]);

    /* Move the recording. Before any data is in, set the time once it knows its length, else the browser drops it. */
    const seek = (v: number) => {
        const a = el.current;
        if (!a) return;
        if (a.readyState === 0) {
            a.addEventListener("loadedmetadata", () => (a.currentTime = v), { once: true });
            a.load();
        } else a.currentTime = v;
    };
    const toggle = () => {
        const a = el.current;
        if (!a) return;
        if (a.paused) {
            document.querySelectorAll("audio").forEach((x) => x !== a && x.pause());
            a.play().catch(() => undefined);
        } else a.pause();
    };
    const pct = dur ? Math.min(100, (100 * t) / dur) : 0;

    return (
        <div className={cx("flex h-12 items-center gap-3 rounded-xl bg-brand-solid px-3 text-white", className)} aria-label={label}>
            <audio ref={el} preload="metadata" src={src} />
            <AriaButton onPress={toggle} aria-label={playing ? "Pause" : "Play"} className="flex size-9 shrink-0 items-center justify-center rounded-full outline-focus-ring transition duration-100 ease-linear hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white pressed:scale-95">
                {playing ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                ) : (
                    <Play aria-hidden="true" className="ml-0.5 size-5 fill-current" />
                )}
            </AriaButton>
            <div className="group relative h-6 min-w-0 flex-1">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/30">
                    <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
                </div>
                <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-150 group-hover:scale-125" style={{ left: `${pct}%` }} />
                <input
                    type="range"
                    min={0}
                    max={dur || 1}
                    step={0.5}
                    value={Math.min(t, dur || t)}
                    aria-label="Position in recording"
                    aria-valuetext={`${fmtDuration(t)} of ${fmtDuration(dur)}`}
                    onPointerDown={() => (scrub.current = true)}
                    onPointerUp={() => {
                        scrub.current = false;
                        seek(want.current);
                    }}
                    onPointerCancel={() => {
                        scrub.current = false;
                        seek(want.current);
                    }}
                    onChange={(e) => {
                        const v = +e.target.value;
                        want.current = v;
                        setT(v);
                        if (!scrub.current) seek(v); // keyboard or a plain click: seek at once
                    }}
                    className="absolute inset-0 w-full cursor-pointer opacity-0 outline-focus-ring focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
                />
            </div>
            <p className="shrink-0 text-xs font-semibold tabular-nums">
                {fmtDuration(t)} / {fmtDuration(dur)}
            </p>
        </div>
    );
};
