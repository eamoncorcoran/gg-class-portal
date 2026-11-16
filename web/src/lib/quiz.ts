// Quiz items in the Duolingo manner: pick the right answer from tiles, or type it. Marking is exact
// but forgiving: case, spacing, punctuation and stray accents are ignored, and a teacher can list
// other acceptable answers.
export type QuizItem = {
    id: string;
    type: "choose" | "type" | "order" | "tap";
    prompt: string;
    /** the right answer; for order, the words in the right order joined with spaces */
    answer: string;
    /** wrong answers shown beside the right one (choose) */
    options?: string[];
    /** other answers that also count as right (type) */
    alts?: string[];
    /** the words to arrange (order); shown shuffled */
    words?: string[];
    /** why the answer is right, shown behind "Why?" */
    why?: string;
    /** a diagram to draw above the question: see components/app/diagrams */
    art?: string;
    /** tap: the spots on the diagram (in its 420 x 260 viewBox); answer is the id of the right one */
    targets?: { id: string; label: string; cx: number; cy: number; r: number }[];
    /** type: accept a number written any way (digits or words are not needed, just digits) */
    numeric?: boolean;
};

const norm = (s: string) =>
    s
        .normalize("NFC")
        .toLowerCase()
        .replace(/[’'"“”.,;:!?()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
const loose = (s: string) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Is the student's answer right for this item? Exact first, then without fadas (a near miss still scores, as on Duolingo). */
export const isRight = (item: QuizItem, given: string) => {
    if (item.type === "tap") return given === item.answer;
    if (item.numeric) return given.replace(/[^\d.]/g, "") === item.answer.replace(/[^\d.]/g, "");
    const want = [item.answer, ...(item.alts || [])].filter(Boolean);
    const g = norm(given);
    if (!g) return false;
    return want.some((w) => norm(w) === g) || want.some((w) => loose(w) === loose(given));
};

/** The tiles for a choose item, the right one mixed in, in a fixed order per item so a retry looks the same. */
export const tilesFor = (item: QuizItem) => {
    const all = [item.answer, ...(item.options || [])].filter(Boolean);
    let h = 0;
    for (const ch of item.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return [...all].sort((a, b) => ((h + a.length * 7 + a.charCodeAt(0)) % 97) - ((h + b.length * 7 + b.charCodeAt(0)) % 97));
};

export const blankItem = (id: string, type: QuizItem["type"] = "choose"): QuizItem => ({ id, type, prompt: "", answer: "", options: type === "choose" ? ["", "", ""] : undefined, alts: [] });

/** A finished item is one with a prompt, an answer and (for tiles) at least one wrong option. */
export const itemOk = (i: QuizItem) => !!i.prompt.trim() && !!i.answer.trim() && (i.type !== "choose" || (i.options || []).some((o) => o.trim())) && (i.type !== "order" || (i.words || []).length > 1);

/** The words of an order item, dealt in a fixed scrambled order per item. */
export const wordsFor = (item: QuizItem) => {
    const w = item.words && item.words.length ? [...item.words] : item.answer.split(" ");
    let h = 7;
    for (const ch of item.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const out = [...w].sort((a, b) => ((h + a.length * 13 + a.charCodeAt(0) * 3) % 101) - ((h + b.length * 13 + b.charCodeAt(0) * 3) % 101));
    return out.join(" ") === item.answer ? out.reverse() : out;
};

/** A few starter items so a new quiz is never a blank page. */
export const SAMPLE_ITEMS: QuizItem[] = [
    { id: "s1", type: "choose", prompt: "Cad is brí le “cluastuiscint”?", answer: "Listening comprehension", options: ["Reading comprehension", "Essay", "Marking scheme"] },
    { id: "s2", type: "type", prompt: "Say “I went to the shop” in Irish", answer: "Chuaigh mé go dtí an siopa", alts: ["chuaigh mé chuig an siopa"] },
    { id: "s3", type: "choose", prompt: "Which is the genitive case?", answer: "An tuiseal ginideach", options: ["An tuiseal tabharthach", "An modh coinníollach", "An aimsir fháistineach"] },
];
