// The teacher's live classroom: the console for running a class and the studio for building lessons.
// Both are standalone pages the hub serves (/live/teacher.html, /live/studio.html), and the old hub
// framed them too, so they stay framed here. The frame takes the whole height under one slim bar,
// and Full screen hands the console the entire display while teaching.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { ArrowLeft, Expand01, Minimize01 } from "@/components/app/ic";
import { Segmented } from "@/components/app/segmented";
import { useAdminBootstrap } from "@/lib/portal";

export const LiveSection = () => {
    const boot = useAdminBootstrap();
    const [params, setParams] = useSearchParams();
    const liveRoom = Boolean(boot?.liveRoom);
    const tab = liveRoom && params.get("tab") !== "studio" ? "console" : "studio";
    const classId = params.get("classId");
    const wrap = useRef<HTMLDivElement>(null);
    const [full, setFull] = useState(false);
    useEffect(() => {
        const on = () => setFull(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", on);
        return () => document.removeEventListener("fullscreenchange", on);
    }, []);
    if (boot === undefined) return <p className="p-4 text-sm text-quaternary">Loading…</p>;

    const src = tab === "studio" ? `/live/studio.html?embed=1` : `/live/teacher.html?embed=1${classId ? `&classId=${encodeURIComponent(classId)}` : ""}`;
    const toggleFull = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else wrap.current?.requestFullscreen?.();
    };

    return (
        <div ref={wrap} className="flex h-[calc(100dvh-4rem)] flex-col bg-primary">
            <div className="flex flex-wrap items-center gap-2 border-b-2 border-secondary px-3 py-2 md:px-4">
                <DuoButton color="ghost" size="xs" href="/teach" iconLeading={ArrowLeft}>
                    Console sections
                </DuoButton>
                <h1 className="text-md font-bold text-primary">{liveRoom ? (tab === "studio" ? "Studio" : "Live classroom") : "Studio"}</h1>
                <div className="ml-auto flex items-center gap-2">
                    {liveRoom && (
                        <Segmented
                            label="Live classroom view"
                            value={tab}
                            onChange={(t) => {
                                const next = new URLSearchParams(params);
                                next.set("tab", t);
                                setParams(next);
                            }}
                            items={[
                                { id: "console", label: "Console" },
                                { id: "studio", label: "Studio" },
                            ]}
                        />
                    )}
                    <DuoButton color="secondary" size="xs" onPress={toggleFull} iconLeading={full ? Minimize01 : Expand01}>
                        {full ? "Exit Full Screen" : "Full Screen"}
                    </DuoButton>
                </div>
            </div>
            {/* The framed pages are laid out for a laptop screen; on a phone it is a squeeze. */}
            <p className="bg-secondary px-4 py-2 text-xs font-semibold text-tertiary md:hidden">The {tab === "studio" ? "studio" : "console"} is built for a laptop screen. It works here, but it is a squeeze on a phone.</p>
            <iframe key={src} src={src} title={liveRoom ? `Live classroom ${tab}` : "Studio"} allow="camera; microphone; autoplay; fullscreen; display-capture" allowFullScreen className="block min-h-0 w-full flex-1" />
        </div>
    );
};
