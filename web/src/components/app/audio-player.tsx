// The listening recording: a proper player rather than the browser's default strip. Play button,
// a scrubbable brand-coloured track, elapsed and total time, skip back ten seconds and a speed toggle.
import { type RefObject, useEffect, useRef, useState } from "react";
import { Play, RefreshCcw01 } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";
import { mmss } from "@/lib/data";
import { cx } from "@/utils/cx";

export const AudioPlayer = ({ src, title, seconds, meta, audioRef }: { src: string; title: string; seconds: number; meta: string; /** handed the <audio> element, for anything that follows the recording (the script panel) */ audioRef?: RefObject<HTMLAudioElement | null> }) => {
    const el = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [t, setT] = useState(0);
    /* While the thumb is being dragged the clock is ours, not the recording's: timeupdate would push it straight back. */
    const scrub = useRef(false);
    const want = useRef(0);
    const [dur, setDur] = useState(seconds);
    const [rate, setRate] = useState(1);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const a = el.current!;
        if (audioRef) audioRef.current = a;
        const on = () => setPlaying(true), off = () => setPlaying(false);
        const time = () => {
            if (!scrub.current) setT(a.currentTime);
        };
        const meta = () => setDur(a.duration || seconds);
        const wait = () => setBusy(true), go = () => setBusy(false);
        a.addEventListener("play", on);
        a.addEventListener("pause", off);
        a.addEventListener("ended", off);
        a.addEventListener("timeupdate", time);
        a.addEventListener("loadedmetadata", meta);
        a.addEventListener("waiting", wait);
        a.addEventListener("playing", go);
        a.addEventListener("canplay", go);
        return () => {
            a.removeEventListener("play", on);
            a.removeEventListener("pause", off);
            a.removeEventListener("ended", off);
            a.removeEventListener("timeupdate", time);
            a.removeEventListener("loadedmetadata", meta);
            a.removeEventListener("waiting", wait);
            a.removeEventListener("playing", go);
            a.removeEventListener("canplay", go);
        };
    }, [seconds]);

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
        const a = el.current!;
        if (a.paused) {
            document.querySelectorAll("audio").forEach((x) => x !== a && x.pause());
            a.play();
        } else a.pause();
    };
    const pct = dur ? (100 * t) / dur : 0;

    return (
        <div className="mb-4 flex h-12 items-center gap-3 rounded-xl bg-brand-solid px-3 text-white" aria-label={`${title}, ${meta}`}>
            <audio ref={el} preload="metadata" src={src} onRateChange={(e) => setRate(e.currentTarget.playbackRate)} />
            <AriaButton
                onPress={toggle}
                aria-label={playing ? "Pause" : "Play"}
                className="flex size-9 shrink-0 items-center justify-center rounded-full outline-focus-ring transition duration-100 ease-linear hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white pressed:scale-95"
            >
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
                    <div className={cx("h-full rounded-full bg-white", busy && "animate-pulse")} style={{ width: `${pct}%` }} />
                </div>
                <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-150 group-hover:scale-125" style={{ left: `${pct}%` }} />
                <input
                    type="range"
                    min={0}
                    max={dur || 1}
                    step={0.5}
                    value={t}
                    aria-label="Position in recording"
                    aria-valuetext={`${mmss(t)} of ${mmss(dur)}`}
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
                {mmss(t)} / {mmss(dur)}
            </p>
            <div className="hidden shrink-0 items-center sm:flex">
                <AriaButton
                    onPress={() => (el.current!.currentTime = Math.max(0, el.current!.currentTime - 10))}
                    aria-label="Back ten seconds"
                    className="flex size-8 items-center justify-center rounded-md text-white/80 outline-focus-ring transition duration-100 ease-linear hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                    <RefreshCcw01 aria-hidden="true" className="size-4" />
                </AriaButton>
                <AriaButton
                    onPress={() => (el.current!.playbackRate = rate === 1 ? 0.75 : 1)}
                    aria-label={`Playback speed, now ${rate}×`}
                    className={cx("h-8 rounded-md px-2 text-xs font-bold tabular-nums outline-focus-ring transition duration-100 ease-linear hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white", rate === 1 ? "text-white/80" : "bg-white/20 text-white")}
                >
                    {rate === 1 ? "1×" : "0.75×"}
                </AriaButton>
            </div>
        </div>
    );
};