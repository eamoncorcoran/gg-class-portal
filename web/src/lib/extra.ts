// The oral exam and the grammar course: two JSON files built by tools/oral.py and
// tools/grammar_export.py, loaded on first use.
export type OralPart = { slug: string; ga: string; en: string; marks: number; minutes: number; lead: string; task: string; tips: string[] };
export type ComhraTopic = { slug: string; ga: string; en: string; intro: string; qa: { q: string; a: string; en: string }[]; phrases: { ga: string; en: string }[] };
export type SraithBox = { n: number; image: { src: string; w: number; h: number } | null; sentences: { ga: string; en: string }[] };
export type Sraith = { n: number; ready: boolean; slug: string; title: string; boxes: SraithBox[]; ending: { ga: string; en: string }[] };
export type Oral = { total: number; parts: OralPart[]; comhra: ComhraTopic[]; sraith: Sraith[] };

export type GBlock =
    | { t: "p"; text: string }
    | { t: "h"; text: string }
    | { t: "list"; items: string[]; lead?: string }
    | { t: "table"; head?: string[] | null; rows: (string | string[])[][]; note?: string | null; practice?: boolean }
    | { t: "group"; title: string; blocks: GBlock[] }
    | { t: "verbs"; tense: string; title: string; note?: string | null; verbs: string[][] };
export type GSection = { id: string; step: boolean; h: string; lead?: string | null; blocks: GBlock[] };
export type GLesson = { ga: string; en: string; thumb: string; summary: string; sections: GSection[]; recap: string[] };
export type GGroup = { id: string; ga: string; en: string; short: string; lessons: { slug: string; ga: string; en: string; learn: string[] }[] };
export type Grammar = { groups: GGroup[]; lessons: Record<string, GLesson> };

let oral: Promise<Oral> | null = null;
let grammar: Promise<Grammar> | null = null;
export const loadOral = () => (oral ??= fetch("/oral.json").then((r) => r.json()));
export const loadGrammar = () => (grammar ??= fetch("/grammar.json").then((r) => r.json()));
