// The pictures above a quiz question, drawn as SVG so they stay crisp: the verb-first sentence
// blocks, a word growing its séimhiú, a clock showing the time in the question, and the marks of the
// exam as a stacked bar. Each takes the item so it can show the question's own numbers.
import type { QuizItem } from "@/lib/quiz";
import { CellArt, CycleArt, type Phase } from "./cell-art";

const C = { green: "#58CC02", blue: "#1CB0F6", yellow: "#FFC800", orange: "#FF9600", purple: "#CE82FF", red: "#FF4B4B", ink: "#3C3C3C", grey: "#E5E5E5", mid: "#AFAFAF" };

/** Three blocks in a row: verb, who, what. For order items the blocks carry the right words. */
const OrderArt = ({ item, revealed }: { item: QuizItem; revealed?: boolean }) => {
    const words = item.answer.split(" ");
    const verb = words[0], who = words[1] ?? "", rest = words.slice(2).join(" ");
    const parts = [
        { k: "Briathar", w: verb, c: C.green },
        { k: "Cé", w: who, c: C.blue },
        { k: "Cad / cá / cathain", w: rest, c: C.yellow },
    ];
    return (
        <svg viewBox="0 0 520 150" className="mx-auto h-auto w-full max-w-md" role="img" aria-label="Verb first, then who, then the rest">
            {parts.map((p, i) => (
                <g key={p.k} transform={`translate(${12 + i * 170} 20)`}>
                    <rect width="160" height="78" rx="16" fill={p.c} opacity="0.18" />
                    <rect width="160" height="78" rx="16" fill="none" stroke={p.c} strokeWidth="3" />
                    <text x="80" y="36" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize={revealed && p.w.length > 10 ? 15 : 20} fill={C.ink}>
                        {revealed ? p.w : p.w ? "?" : ""}
                    </text>
                    <text x="80" y="62" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="12" fill={p.c} letterSpacing="1">
                        {p.k.toUpperCase()}
                    </text>
                    {i < 2 && <path d="M166 39 h12 l-6 -6 m6 6 l-6 6" stroke={C.mid} strokeWidth="3" fill="none" strokeLinecap="round" transform="translate(-6 0)" />}
                </g>
            ))}
            <text x="260" y="130" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fill={C.mid}>
                1 · 2 · 3: the verb always leads
            </text>
        </svg>
    );
};

/** A word in boxes with the mutation letter slotting in after the first letter. */
const MutationArt = ({ item }: { item: QuizItem }) => {
    const m = item.answer.match(/\b([bcdfgmpst])h(\w+)/i) ?? item.answer.match(/\b(m)b|\b(g)c|\b(n)d|\b(bh)f|\b(n)g|\b(b)p|\b(d)t/i);
    const word = (item.answer.match(/\b[a-záéíóú]+h[a-záéíóú]+\b/i) ?? item.answer.split(" ").slice(-1))[0] ?? "";
    const letters = word.split("");
    const hAt = m ? 1 : -1;
    const w = Math.min(520, 60 * letters.length + 40);
    return (
        <svg viewBox={`0 0 ${w} 140`} className="mx-auto h-auto w-full max-w-md" role="img" aria-label="A word with its added letter">
            {letters.map((ch, i) => {
                const hot = i === hAt;
                return (
                    <g key={i} transform={`translate(${20 + i * 60} 30)`}>
                        <rect width="52" height="64" rx="12" fill={hot ? C.yellow : "#fff"} stroke={hot ? C.orange : C.grey} strokeWidth="3" />
                        <text x="26" y="44" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="30" fill={C.ink}>
                            {ch}
                        </text>
                        {hot && <path d="M26 -14 v8" stroke={C.orange} strokeWidth="3" strokeLinecap="round" />}
                        {hot && <circle cx="26" cy="-20" r="6" fill={C.orange} />}
                    </g>
                );
            })}
            <text x={w / 2} y="125" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fill={C.mid}>
                {hAt >= 0 ? "the h slots in after the first letter" : "watch the first letter"}
            </text>
        </svg>
    );
};

/** A clock. If the prompt names a time in Irish or digits, the hands show it. */
const ClockArt = ({ item }: { item: QuizItem }) => {
    const p = item.prompt.toLowerCase();
    let h = 3, min = 0;
    const digits = p.match(/(\d{1,2})[:.](\d{2})/);
    if (digits) (h = +digits[1]), (min = +digits[2]);
    else {
        const nums: Record<string, number> = { "a haon": 1, "a dó": 2, "a trí": 3, "a ceathair": 4, "a cúig": 5, "a sé": 6, "a seacht": 7, "a hocht": 8, "a naoi": 9, "a deich": 10 };
        for (const [k, v] of Object.entries(nums)) if (p.includes(k)) h = v;
        if (p.includes("leathuair")) min = 30;
        else if (p.includes("ceathrú tar éis")) min = 15;
        else if (p.includes("ceathrú chun")) (min = 45), (h = h - 1);
    }
    const ha = ((h % 12) + min / 60) * 30, ma = min * 6;
    const hand = (deg: number, len: number, wdt: number, col: string) => {
        const r = ((deg - 90) * Math.PI) / 180;
        return <line x1="100" y1="100" x2={100 + len * Math.cos(r)} y2={100 + len * Math.sin(r)} stroke={col} strokeWidth={wdt} strokeLinecap="round" />;
    };
    return (
        <svg viewBox="0 0 200 200" className="mx-auto h-auto w-44" role="img" aria-label={`A clock showing ${h}:${String(min).padStart(2, "0")}`}>
            <circle cx="100" cy="100" r="92" fill="#fff" stroke={C.grey} strokeWidth="6" />
            {Array.from({ length: 12 }, (_, i) => {
                const r = ((i * 30 - 90) * Math.PI) / 180;
                return <circle key={i} cx={100 + 76 * Math.cos(r)} cy={100 + 76 * Math.sin(r)} r={i % 3 === 0 ? 5 : 3} fill={i % 3 === 0 ? C.ink : C.mid} />;
            })}
            {hand(ha, 46, 8, C.ink)}
            {hand(ma, 66, 6, C.blue)}
            <circle cx="100" cy="100" r="7" fill={C.green} />
        </svg>
    );
};

/** The 600 marks of the exam as one bar, the section in the question lit up. */
const MarksArt = ({ item }: { item: QuizItem }) => {
    const parts = [
        { k: "Béaltriail", v: 240, c: C.orange },
        { k: "Cluastuiscint", v: 60, c: C.blue },
        { k: "Ceapadóireacht", v: 100, c: C.green },
        { k: "Léamhthuiscint", v: 100, c: C.purple },
        { k: "Prós", v: 30, c: C.yellow },
        { k: "Filíocht", v: 30, c: C.red },
        { k: "Dánta Breise", v: 40, c: C.mid },
    ];
    const p = (item.prompt + " " + item.answer).toLowerCase();
    const hot = parts.findIndex((x) => p.includes(x.k.toLowerCase().slice(0, 5)) || (x.k === "Cluastuiscint" && /listen|fógra|comhrá/.test(p)) || (x.k === "Ceapadóireacht" && /compos|essay/.test(p)) || (x.k === "Léamhthuiscint" && /read/.test(p)) || (x.k === "Béaltriail" && /oral/.test(p)));
    let x = 0;
    return (
        <svg viewBox="0 0 520 120" className="mx-auto h-auto w-full max-w-md" role="img" aria-label="The 600 marks of the exam by section">
            {parts.map((s, i) => {
                const w = (s.v / 600) * 500;
                const el = (
                    <g key={s.k} transform={`translate(${10 + x} 20)`}>
                        <rect width={w - 3} height="40" rx="8" fill={s.c} opacity={hot === -1 || hot === i ? 1 : 0.25} />
                        {w > 50 && (
                            <text x={(w - 3) / 2} y="26" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="14" fill="#fff">
                                {s.v}
                            </text>
                        )}
                    </g>
                );
                x += w;
                return el;
            })}
            <text x="260" y="95" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fill={C.mid}>
                {hot >= 0 ? `${parts[hot].k}: ${parts[hot].v} of 600 marks` : "600 marks in all"}
            </text>
        </svg>
    );
};

/** The picture for a question, by kind. Unknown kinds fall back to the quiz badge. */
export const Art = ({ kind, item, revealed }: { kind?: string; item: QuizItem; revealed?: boolean }) => {
    if (kind?.startsWith("cell:")) return <CellArt phase={kind.slice(5) as Phase} />;
    if (kind === "cycle") return <CycleArt />;
    if (kind === "order") return <OrderArt item={item} revealed={revealed} />;
    if (kind === "mutation") return <MutationArt item={item} />;
    if (kind === "clock") return <ClockArt item={item} />;
    if (kind === "marks") return <MarksArt item={item} />;
    return null;
};
