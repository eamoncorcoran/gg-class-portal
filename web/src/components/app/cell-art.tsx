// One cell that morphs through mitosis. Nothing is swapped: the eight chromatids are the same eight
// shapes throughout, uncoiling into threads in interphase, tightening into X pairs, sliding to the
// equator, splitting and travelling to the poles, settling into two nuclei while the membrane pinches
// in. Framer Motion tweens every attribute (paths, positions, opacity), so each phase flows into the
// next, and the same component stays mounted across slides so the picture never jumps.
import { motion } from "motion/react";
import { cx } from "@/utils/cx";

export type Phase = "interphase" | "prophase" | "metaphase" | "anaphase" | "telophase" | "cytokinesis";
export const PHASE_ORDER: Phase[] = ["interphase", "prophase", "metaphase", "anaphase", "telophase", "cytokinesis"];
export const PHASES: { id: Phase; ga: string; label: string; blurb: string }[] = [
    { id: "interphase", ga: "Idirphas", label: "Interphase", blurb: "The cell grows and copies its DNA. The chromosomes are long, thin threads inside the nucleus." },
    { id: "prophase", ga: "Próifáis", label: "Prophase", blurb: "The chromosomes coil up and become visible, each as two identical chromatids joined at the centromere. The nuclear membrane breaks down and spindle fibres form." },
    { id: "metaphase", ga: "Meitifáis", label: "Metaphase", blurb: "The chromosomes line up along the middle of the cell, the equator, each attached to spindle fibres." },
    { id: "anaphase", ga: "Anafáis", label: "Anaphase", blurb: "The centromeres split. The spindle fibres shorten and pull the chromatids apart to opposite poles." },
    { id: "telophase", ga: "Teileafáis", label: "Telophase", blurb: "A nuclear membrane forms around each set of chromosomes. Two nuclei, each with the full set." },
    { id: "cytokinesis", ga: "Cítichinéis", label: "Cytokinesis", blurb: "The cytoplasm divides and the cell membrane pinches in. Two identical daughter cells." },
];

const T = { duration: 1.1, ease: [0.45, 0, 0.2, 1] as const };
const BLUE = "#1CB0F6", ORANGE = "#FF9600", MEM = "#8FB8CF", CYTO = "#EAF6FB", NUC = "#D9ECF7", SPIN = "#B9B9B9", INK = "#1F2A1F";
const CX = 210, CY = 130;

/** Where each of the four chromosomes sits in each phase (relative to the cell centre). */
const HOME: Record<Phase, [number, number][]> = {
    interphase: [[-34, -22], [28, -10], [-14, 26], [36, 24]],
    prophase: [[-38, -30], [30, -14], [-18, 30], [42, 26]],
    metaphase: [[0, -48], [0, -16], [0, 16], [0, 48]],
    anaphase: [[0, -48], [0, -16], [0, 16], [0, 48]],
    telophase: [[0, -30], [0, -8], [0, 14], [0, 36]],
    cytokinesis: [[0, -30], [0, -8], [0, 14], [0, 36]],
};
const ROT: Record<Phase, number[]> = { interphase: [-20, 25, 10, -30], prophase: [-20, 25, 10, -30], metaphase: [0, 0, 0, 0], anaphase: [0, 0, 0, 0], telophase: [8, -6, 5, -8], cytokinesis: [8, -6, 5, -8] };
/** how far each chromatid of a pair has travelled toward its pole */
const APART: Record<Phase, number> = { interphase: 0, prophase: 0, metaphase: 0, anaphase: 72, telophase: 104, cytokinesis: 122 };
const PINCH: Record<Phase, number> = { interphase: 0, prophase: 0, metaphase: 0, anaphase: 0, telophase: 22, cytokinesis: 60 };
const WIDTH: Record<Phase, number> = { interphase: 260, prophase: 260, metaphase: 262, anaphase: 272, telophase: 290, cytokinesis: 310 };

/** A chromatid path: a loose thread in interphase, a tight rod from prophase on. Same command shape, so it tweens. */
// loose: the two chromatids run on as one long thread through the centre (DNA copied, not yet coiled)
const rod = (side: -1 | 1, loose: boolean) =>
    loose
        ? `M ${-46 * side} ${-30 * side} C ${-36 * side} ${-12 * side}, ${-22 * side} ${-6 * side}, ${-8 * side} ${-2 * side} S ${2 * side} ${3 * side}, 0 0`
        : `M ${-8 * side} -17 C ${-10 * side} -8, ${-2 * side} -3, 0 0 S ${10 * side} 8, ${8 * side} 17`;

export const CellArt = ({ phase, className, labels = true }: { phase: Phase; className?: string; labels?: boolean }) => {
    const p = phase;
    const loose = p === "interphase";
    const split = APART[p] > 0;
    const spindle = p === "prophase" || p === "metaphase" || p === "anaphase";
    const oneNucleus = p === "interphase" || p === "prophase";
    const twoNuclei = p === "telophase" || p === "cytokinesis";
    const pinch = PINCH[p], w = WIDTH[p], apart = APART[p];
    const small = twoNuclei ? 0.72 : 1;
    const cellPath = `M ${CX - w / 2} ${CY} C ${CX - w / 2} 50, ${CX - 40} 30, ${CX - 40 + pinch * 0.3} ${30 + pinch} C ${CX - 10} ${30 + pinch * 1.6} ${CX + 10} ${30 + pinch * 1.6} ${CX + 40 - pinch * 0.3} ${30 + pinch} C ${CX + 40} 30, ${CX + w / 2} 50, ${CX + w / 2} ${CY} C ${CX + w / 2} 210, ${CX + 40} 230, ${CX + 40 - pinch * 0.3} ${230 - pinch} C ${CX + 10} ${230 - pinch * 1.6} ${CX - 10} ${230 - pinch * 1.6} ${CX - 40 + pinch * 0.3} ${230 - pinch} C ${CX - 40} 230, ${CX - w / 2} 210, ${CX - w / 2} ${CY} Z`;
    const poleX = p === "interphase" ? 60 : 108; // centrosomes move out to the poles in prophase

    return (
        <svg viewBox="0 0 420 260" className={cx("mx-auto h-auto w-full max-w-lg", className)} role="img" aria-label={`A cell in ${phase}`}>
            <motion.path animate={{ d: cellPath }} transition={T} fill={CYTO} stroke={MEM} strokeWidth="4" />

            {/* centrosomes and spindle fibres */}
            <motion.circle animate={{ cx: CX - poleX, opacity: p === "interphase" ? 0.35 : 1 }} transition={T} cy={CY} r="5" fill={SPIN} />
            <motion.circle animate={{ cx: CX + poleX, opacity: p === "interphase" ? 0.35 : 1 }} transition={T} cy={CY} r="5" fill={SPIN} />
            {HOME[p].map(([hx, hy], n) => {
                const sx = CX + hx, sy = CY + hy;
                return (
                    <g key={n}>
                        <motion.line animate={{ x1: CX - poleX, y1: CY, x2: sx - apart, y2: sy, opacity: spindle ? 0.9 : 0 }} transition={T} stroke={SPIN} strokeWidth="1.5" />
                        <motion.line animate={{ x1: CX + poleX, y1: CY, x2: sx + apart, y2: sy, opacity: spindle ? 0.9 : 0 }} transition={T} stroke={SPIN} strokeWidth="1.5" />
                    </g>
                );
            })}

            {/* the nuclear membrane: whole, then dotted as it breaks, then two new ones */}
            <motion.ellipse animate={{ opacity: oneNucleus ? 1 : 0, rx: p === "prophase" ? 86 : 82, ry: p === "prophase" ? 72 : 68, strokeDasharray: p === "prophase" ? "9 9" : "1 0" }} transition={T} cx={CX} cy={CY} fill={NUC} stroke={MEM} strokeWidth="3" />
            <motion.ellipse animate={{ opacity: twoNuclei ? 1 : 0, cx: CX - apart, rx: twoNuclei ? 50 : 20, ry: twoNuclei ? 46 : 18 }} transition={T} cy={CY} fill={NUC} stroke={MEM} strokeWidth="3" />
            <motion.ellipse animate={{ opacity: twoNuclei ? 1 : 0, cx: CX + apart, rx: twoNuclei ? 50 : 20, ry: twoNuclei ? 46 : 18 }} transition={T} cy={CY} fill={NUC} stroke={MEM} strokeWidth="3" />

            {/* the chromosomes: four pairs of chromatids, every one its own shape all the way through */}
            {HOME[p].map(([hx, hy], n) => {
                const col = n < 2 ? BLUE : ORANGE;
                return (
                    <g key={n}>
                        {([-1, 1] as const).map((side) => (
                            <motion.g key={side} animate={{ x: CX + hx + side * apart, y: CY + hy, rotate: ROT[p][n], scale: small }} transition={T}>
                                <motion.path animate={{ d: rod(side, loose), strokeWidth: loose ? 3 : 6, opacity: loose ? 0.85 : 1 }} transition={T} stroke={col} fill="none" strokeLinecap="round" />
                                <motion.circle animate={{ r: loose ? 0 : split ? 3.2 : 4.2, cx: split ? side * 1.5 : 0 }} transition={T} cy="0" fill={INK} />
                            </motion.g>
                        ))}
                    </g>
                );
            })}

            {labels && (
                <>
                    <motion.g animate={{ opacity: p === "metaphase" ? 1 : 0 }} transition={T}>
                        <line x1={CX} y1="48" x2={CX} y2="212" stroke={SPIN} strokeWidth="1" strokeDasharray="4 4" />
                        <text x={CX + 12} y="60" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#8A8A8A">
                            EQUATOR
                        </text>
                    </motion.g>
                    <motion.text animate={{ opacity: spindle ? 1 : 0 }} transition={T} x="22" y={CY + 4} fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#8A8A8A">
                        POLE
                    </motion.text>
                    <motion.text animate={{ opacity: p === "prophase" ? 1 : 0 }} transition={T} x={CX + 60} y="226" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#8A8A8A">
                        SPINDLE FIBRES
                    </motion.text>
                    <motion.text animate={{ opacity: p === "prophase" || p === "metaphase" ? 1 : 0 }} transition={T} x={CX - 150} y="226" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#8A8A8A">
                        CENTROMERE ●
                    </motion.text>
                </>
            )}
        </svg>
    );
};

/** Cells doubling: tap Divide and the grid fills, 1, 2, 4, 8… up to 64. */
export const DoublingArt = ({ n }: { n: number }) => {
    const cells = Math.min(64, 2 ** n);
    const cols = cells <= 1 ? 1 : cells <= 4 ? 2 : cells <= 16 ? 4 : 8;
    const size = 320 / cols;
    return (
        <svg viewBox="0 0 320 320" className="mx-auto h-auto w-full max-w-xs" role="img" aria-label={`${cells} cells`}>
            {Array.from({ length: cells }, (_, k) => {
                const x = (k % cols) * size + size / 2, y = Math.floor(k / cols) * size + size / 2;
                return (
                    <motion.g key={k} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: (k % 8) * 0.03, type: "spring", stiffness: 260, damping: 18 }} style={{ originX: `${x}px`, originY: `${y}px` }}>
                        <circle cx={x} cy={y} r={size * 0.42} fill={CYTO} stroke={MEM} strokeWidth={Math.max(1.5, size * 0.04)} />
                        <circle cx={x} cy={y} r={size * 0.17} fill={NUC} stroke={MEM} strokeWidth={Math.max(1, size * 0.025)} />
                    </motion.g>
                );
            })}
        </svg>
    );
};

/** The cycle as a ring: interphase takes most of it, the four phases of mitosis and cytokinesis the rest. */
export const CycleArt = ({ hot, className }: { hot?: Phase; className?: string }) => {
    const segs: { id: Phase; from: number; to: number; col: string }[] = [
        { id: "interphase", from: 0, to: 0.62, col: "#58CC02" },
        { id: "prophase", from: 0.62, to: 0.72, col: BLUE },
        { id: "metaphase", from: 0.72, to: 0.8, col: "#CE82FF" },
        { id: "anaphase", from: 0.8, to: 0.88, col: ORANGE },
        { id: "telophase", from: 0.88, to: 0.95, col: "#FF4B4B" },
        { id: "cytokinesis", from: 0.95, to: 1, col: "#FFC800" },
    ];
    const R = 90, cx0 = 130, cy0 = 130;
    const arc = (a: number, b: number) => {
        const s = (a * 360 - 90) * (Math.PI / 180), e = (b * 360 - 90) * (Math.PI / 180);
        return `M ${cx0 + R * Math.cos(s)} ${cy0 + R * Math.sin(s)} A ${R} ${R} 0 ${b - a > 0.5 ? 1 : 0} 1 ${cx0 + R * Math.cos(e)} ${cy0 + R * Math.sin(e)}`;
    };
    return (
        <svg viewBox="0 0 260 260" className={cx("mx-auto h-auto w-56", className)} role="img" aria-label="The cell cycle">
            {segs.map((s) => (
                <motion.path key={s.id} d={arc(s.from + 0.004, s.to - 0.004)} stroke={s.col} fill="none" animate={{ opacity: !hot || hot === s.id ? 1 : 0.3, strokeWidth: hot === s.id ? 26 : 18 }} transition={{ duration: 0.4 }} />
            ))}
            <text x="130" y="124" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="800" fill="#1F1F1F">
                {hot ? PHASES.find((p) => p.id === hot)?.label : "The cell cycle"}
            </text>
            <text x="130" y="144" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fill="#8A8A8A">
                {hot === "interphase" || !hot ? "most of the cell's life" : "mitosis"}
            </text>
        </svg>
    );
};
