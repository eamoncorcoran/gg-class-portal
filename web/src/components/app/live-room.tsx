// The student's live room (/live/room.html: the class video, the phrases as they come up, and the
// private questions panel) is the hub's own page, framed. The frame is made once, when the app loads,
// and kept hidden until the Live classroom page is open, where it is laid over that page's slot. The
// reason is the browser's permission to make sound: a page only gets it from a tap on itself or on a
// same-origin page that already held it, so a frame made at the moment the tab is pressed has missed
// the tap and Zoom stays silent until the student taps again. This one was there for it.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useMe, useStudentBootstrap } from "@/lib/portal";

const ROOM_WAIT = "/live/room.html?embed=1&wait=1";
const ROOM_NOW = "/live/room.html?embed=1";
export const LIVE_SLOT_ID = "live-slot";

export const LiveRoomFrame = () => {
    const me = useMe();
    const boot = useStudentBootstrap();
    const { pathname } = useLocation();
    const onLive = pathname === "/live";
    const root = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    /* Made while the Live page is already open (a direct visit, a reload): no waiting, it boots itself. */
    const [roomSrc] = useState(() => (window.location.pathname === "/live" ? ROOM_NOW : ROOM_WAIT));
    const [full, setFull] = useState(false);
    const enabled = me?.role === "student" && Boolean(boot?.liveClassroom);

    // the room says when it goes full screen; the frame follows and the page behind stops scrolling
    useEffect(() => {
        const onMsg = (e: MessageEvent) => {
            if (e.origin !== location.origin || e.data?.source !== "gglive" || e.data.type !== "fullscreen") return;
            setFull(Boolean(e.data.on));
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, []);
    useEffect(() => {
        document.body.classList.toggle("live-full", full);
        return () => document.body.classList.remove("live-full");
    }, [full]);

    // keep the frame over the slot while the page is open; hide it otherwise
    useEffect(() => {
        const el = root.current;
        if (!el || !enabled) return;
        const win = frame.current?.contentWindow;
        if (!onLive) {
            if (full) {
                setFull(false);
                win?.postMessage({ source: "gg-portal", type: "unfull" }, location.origin);
            }
            el.hidden = true;
            return;
        }
        let ro: ResizeObserver | null = null;
        const place = () => {
            const slot = document.getElementById(LIVE_SLOT_ID);
            if (!slot) {
                el.hidden = true;
                return;
            }
            const r = slot.getBoundingClientRect();
            Object.assign(el.style, { top: `${Math.round(r.top)}px`, left: `${Math.round(r.left)}px`, width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px` });
            if (el.hidden) {
                el.hidden = false;
                win?.postMessage({ source: "gg-portal", type: "show" }, location.origin);
            }
        };
        place();
        const t = setTimeout(place, 50); // the page's enter animation moves the slot
        const slot = document.getElementById(LIVE_SLOT_ID);
        if (slot && "ResizeObserver" in window) {
            ro = new ResizeObserver(place);
            ro.observe(slot);
        }
        window.addEventListener("resize", place);
        document.addEventListener("scroll", place, true);
        return () => {
            clearTimeout(t);
            ro?.disconnect();
            window.removeEventListener("resize", place);
            document.removeEventListener("scroll", place, true);
        };
    }, [onLive, enabled, full]);

    if (!enabled) return null;
    return (
        <div ref={root} hidden className={full ? "fixed inset-0 z-[2147483000] bg-primary" : "fixed z-30 overflow-hidden rounded-2xl border-2 border-secondary bg-primary"}>
            <iframe
                ref={frame}
                src={roomSrc}
                title="Live class"
                className="block h-full w-full border-0 bg-primary"
                allow="camera; microphone; autoplay; fullscreen; display-capture; speaker-selection"
                allowFullScreen
                /* A direct visit to /live makes the frame and shows it in the same breath, so "show" can land
                   before the room's script is listening. Once the room has loaded, say it again if it is on screen. */
                onLoad={() => {
                    if (root.current && !root.current.hidden) frame.current?.contentWindow?.postMessage({ source: "gg-portal", type: "show" }, location.origin);
                }}
            />
        </div>
    );
};

/** Where the room lands on the Live classroom page: the frame sits exactly over this box. */
export const LiveSlot = () => <div id={LIVE_SLOT_ID} className="h-[calc(100vh-150px)] min-h-[640px] rounded-2xl border-2 border-secondary bg-secondary" aria-label="Live class" />;
