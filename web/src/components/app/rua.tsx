// Rua, the tutor: a simple round green character with two eyes and a mouth, drawn in SVG so every
// mood is a few shapes. Idle it blinks; it bobs when talking, beams when you are right and droops
// when you are not. Original drawing, nobody else's mascot.
import { motion } from "motion/react";
import { cx } from "@/utils/cx";

export type Mood = "idle" | "talk" | "happy" | "sad" | "think";

export const Rua = ({ mood = "idle", className }: { mood?: Mood; className?: string }) => {
    const anim =
        mood === "happy"
            ? { y: [0, -10, 0, -4, 0], rotate: [0, -6, 6, 0], scale: [1, 1.08, 1] }
            : mood === "sad"
              ? { x: [0, -5, 5, -3, 0], y: [0, 3, 3, 3, 0] }
              : mood === "talk"
                ? { y: [0, -3, 0, -2, 0] }
                : mood === "think"
                  ? { rotate: [0, 4, 0], y: [0, -2, 0] }
                  : { y: [0, -2, 0] };
    const dur = mood === "idle" ? 3 : mood === "talk" ? 0.9 : 0.7;
    const eyeH = mood === "happy" ? 3 : mood === "sad" ? 9 : 11;
    const eyeY = mood === "happy" ? 44 : 40;
    return (
        <motion.svg viewBox="0 0 100 100" animate={anim} transition={{ duration: dur, repeat: mood === "idle" || mood === "talk" || mood === "think" ? Infinity : 0, ease: "easeInOut" }} className={cx("size-16 drop-shadow-sm", className)} aria-hidden="true">
            <defs>
                <linearGradient id="rua-g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#7ED957" />
                    <stop offset="1" stopColor="#2FA84F" />
                </linearGradient>
            </defs>
            {/* antenna */}
            <line x1="50" y1="14" x2="50" y2="4" stroke="#2FA84F" strokeWidth="4" strokeLinecap="round" />
            <circle cx="50" cy="4" r="4.5" fill={mood === "happy" ? "#FFC800" : "#FF9600"} />
            {/* body */}
            <rect x="10" y="14" width="80" height="78" rx="30" fill="url(#rua-g)" />
            <ellipse cx="38" cy="28" rx="12" ry="6" fill="#fff" opacity="0.22" />
            {/* eyes */}
            <motion.rect x="32" y={eyeY} width="10" height={eyeH} rx="5" fill="#1F2A1F" animate={mood === "idle" || mood === "think" ? { scaleY: [1, 1, 0.1, 1, 1] } : {}} transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }} style={{ transformOrigin: "37px 46px" }} />
            <motion.rect x="58" y={eyeY} width="10" height={eyeH} rx="5" fill="#1F2A1F" animate={mood === "idle" || mood === "think" ? { scaleY: [1, 1, 0.1, 1, 1] } : {}} transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }} style={{ transformOrigin: "63px 46px" }} />
            {/* cheeks when happy */}
            {mood === "happy" && (
                <>
                    <circle cx="27" cy="58" r="5" fill="#FF9600" opacity="0.45" />
                    <circle cx="73" cy="58" r="5" fill="#FF9600" opacity="0.45" />
                </>
            )}
            {/* mouth */}
            {mood === "happy" ? (
                <path d="M36 62 Q50 76 64 62" stroke="#1F2A1F" strokeWidth="4" fill="none" strokeLinecap="round" />
            ) : mood === "sad" ? (
                <path d="M38 70 Q50 60 62 70" stroke="#1F2A1F" strokeWidth="4" fill="none" strokeLinecap="round" />
            ) : mood === "talk" ? (
                <motion.ellipse cx="50" cy="66" rx="7" ry="4" fill="#1F2A1F" animate={{ ry: [2, 5, 2] }} transition={{ duration: 0.35, repeat: Infinity }} />
            ) : mood === "think" ? (
                <path d="M42 66 Q50 63 58 67" stroke="#1F2A1F" strokeWidth="4" fill="none" strokeLinecap="round" />
            ) : (
                <path d="M40 65 Q50 71 60 65" stroke="#1F2A1F" strokeWidth="4" fill="none" strokeLinecap="round" />
            )}
        </motion.svg>
    );
};
