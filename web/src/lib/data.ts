// The papers: site/data.json (questions + scheme crops), keys.json (reading comprehension answer keys)
// and resources.json (H1 sample answers), all served by tools/server.py.

export type Img = { src: string; w: number; h: number; pt?: number; boxes?: number[][]; boxText?: string };
export type Question = {
    id: string;
    year: number;
    deferred: boolean;
    title: string;
    kinds?: string[];
    part?: "A" | "B";
    source: { paper: string; pages: number[] };
    question: Img[];
    strips?: { images: Img[]; parts?: string[] }[];
    paperFont?: { family: string; size: number };
    markingScheme: Img[];
    markingSchemeText?: string;
    questionText?: string;
    audio?: { src: string; seconds: number };
    resKey?: string;
    /** other subjects: marks printed on the paper, and the paper/section the question sits in */
    marks?: number;
    paper?: string;
    section?: string;
};
export type Topic = { slug: string; name: string; irish: string; questions: Question[]; course2027?: boolean };
/** One answer space of a question: short (typed, marked by the model), mcq (pick one), numeric, tf (true/false), gap; long parts get no space. */
export type KeyPart = { id: string; kind: "short" | "long" | "mcq" | "numeric" | "tf" | "gap"; marks: number; question: string; answer_key: string; options?: string[]; accept?: string[] };
export type Sample = {
    letter: string;
    title: string;
    form: string;
    intro: string;
    grade: string;
    words: number;
    approach: string;
    approach_points: string[];
    good_to_know: string;
    paragraphs: { chunks: { ga: string; en?: string; highlight?: boolean }[]; comment_heading: string; comment: string }[];
    assessment: { stil: number; abhar: number; gaeilge: number; abhar_comment: string; gaeilge_comment: string };
};

export type Data = {
    /** which subject and level these topics belong to ("irish" / "higher" is the original site) */
    subject: string;
    level: string;
    /** the sidebar and home grouping for this subject: sections of topics, as Studyclix orders them */
    nav: NavGroup[];
    topics: Topic[];
    keys: Record<string, { passage: string; parts: KeyPart[] }>;
    res: Record<string, Sample[]>;
    /** every question of every loaded subject, by id (ids are unique across subjects) */
    q: Record<string, Question>;
    topicOf: Record<string, string>;
};

/* ---------------- subjects (site/subjects.json, built by tools/categories.py) ---------------- */
export type SubjectInfo = {
    id: string;
    name: string;
    code: number;
    mark: string;
    aural: boolean;
    levels: string[];
    /** per level: the category tree (sections of topics) and how many topics it has */
    levelTrees: Record<string, { tree: { section: string; items: { slug: string; name: string; full: string }[] }[]; topics: number; built?: boolean; questions?: number }>;
};
type G = typeof globalThis & { __pq?: Data; __pqStores?: Record<string, Data>; __pqSubjects?: SubjectInfo[]; __pqQ?: Record<string, Question>; __pqTopicOf?: Record<string, string> };
const g = globalThis as G;
// kept on globalThis so a hot reload of this module during development keeps the loaded papers
let data: Data | null = g.__pq ?? null;
const stores: Record<string, Data> = (g.__pqStores ??= {});
// one merged index for lookups by id (saved questions, exams and homework can mix subjects)
const ALLQ: Record<string, Question> = (g.__pqQ ??= {});
const ALLTOPIC: Record<string, string> = (g.__pqTopicOf ??= {});
let subjects: SubjectInfo[] = g.__pqSubjects ?? [];

// asset paths in data.json are relative to the old single page; the app routes need them absolute
const abs = (i: Img) => ({ ...i, src: i.src.startsWith("/") ? i.src : "/" + i.src });

function index(topics: Topic[]) {
    for (const t of topics) {
        for (const x of t.questions) {
            x.question = x.question.map(abs);
            x.markingScheme = x.markingScheme.map(abs);
            x.strips = x.strips?.map((s) => ({ ...s, images: s.images.map(abs) }));
            if (x.audio) x.audio = { ...x.audio, src: x.audio.src.startsWith("/") ? x.audio.src : "/" + x.audio.src };
            ALLQ[x.id] = x;
            ALLTOPIC[x.id] = t.slug;
        }
    }
}

export const loadSubjects = async (): Promise<SubjectInfo[]> => {
    if (subjects.length) return subjects;
    subjects = await fetch("/subjects.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    g.__pqSubjects = subjects;
    return subjects;
};
export const subjectsList = () => subjects;
export const subjectInfo = (id: string) => subjects.find((s) => s.id === id);
/** Subjects with at least one built level, Irish first, then the rest as the manifest orders them. */
export const liveSubjects = () => subjects.filter((s) => s.id === "irish" || Object.values(s.levelTrees).some((l) => l.built));
export const levelsOf = (id: string) => subjectInfo(id)?.levels ?? ["higher"];
export const LEVEL_LABEL: Record<string, string> = { higher: "Higher", ordinary: "Ordinary", foundation: "Foundation", common: "Common" };
/** The URL prefix of a subject and level: the original Irish Higher site stays at the root. */
export const basePath = (subject: string, level: string) => (subject === "irish" && level === "higher" ? "" : `/${subject}/${level}`);

/** The original site: Irish Higher, from site/data.json, keys.json and resources.json. */
export async function loadData(): Promise<Data> {
    if (data && data.subject === "irish" && data.level === "higher") return data;
    if (stores["irish/higher"]) return (data = stores["irish/higher"]);
    const [d, keys, res] = await Promise.all([
        fetch("/data.json").then((r) => {
            // 401 = not signed in: the past questions are for the class, and the caller starts the app again at the sign-in form.
            if (!r.ok) throw Object.assign(new Error(`The past questions could not be loaded (${r.status}).`), { status: r.status });
            return r.json();
        }),
        fetch("/keys.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        fetch("/resources.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        loadSubjects(),
    ]);
    index(d.topics as Topic[]);
    data = stores["irish/higher"] = { subject: "irish", level: "higher", nav: NAV, topics: d.topics, keys, res, q: ALLQ, topicOf: ALLTOPIC };
    g.__pq = data;
    return data;
}

/** Another subject (or another level of Irish): site/subjects/<subject>/<level>/data.json + keys.json. */
export async function loadSubject(subject: string, level: string): Promise<Data | null> {
    if (subject === "irish" && level === "higher") return loadData();
    const key = `${subject}/${level}`;
    if (stores[key]) return (data = stores[key]);
    await loadSubjects();
    const d = await fetch(`/subjects/${key}/data.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) return null;
    const keys = await fetch(`/subjects/${key}/keys.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    index(d.topics as Topic[]);
    const info = subjectInfo(subject);
    const tree = info?.levelTrees[level]?.tree ?? [];
    const have = new Set((d.topics as Topic[]).map((t) => t.slug));
    const nav: NavGroup[] = tree
        .map((s) => ({ group: s.section, sub: "", items: s.items.filter((i) => have.has(i.slug)).map((i) => [i.slug, i.name, ""] as NavItem) }))
        .filter((s) => s.items.length);
    // topics the tree does not name (cut from the paper's own headings) go in a last group
    const named = new Set(nav.flatMap((s) => s.items.map((i) => i[0])));
    const rest = (d.topics as Topic[]).filter((t) => !named.has(t.slug)).map((t) => [t.slug, t.name, t.irish || ""] as NavItem);
    if (rest.length) nav.push({ group: nav.length ? "Other questions" : "", sub: "", items: rest });
    data = stores[key] = { subject, level, nav, topics: d.topics, keys, res: {}, q: ALLQ, topicOf: ALLTOPIC };
    return data;
}

/** Make a loaded subject the current one (the pages read `D()`); false when it was never loaded. */
export function useSubjectStore(subject: string, level: string) {
    const key = `${subject}/${level}`;
    if (stores[key]) {
        data = stores[key];
        return true;
    }
    return false;
}
/** Which subject/level a question id belongs to, from its prefix ("english.h.2024…"), or Irish Higher. */
export const subjectOfId = (id: string): [string, string] => {
    const m = id.match(/^([a-z][a-z0-9-]*)\.(h|o|f|c)\./);
    if (!m) return ["irish", "higher"];
    return [m[1], { h: "higher", o: "ordinary", f: "foundation", c: "common" }[m[2]]!];
};
/** Load whatever subjects a list of question ids needs (an exam or homework can span subjects). */
export async function ensureLoadedFor(ids: string[]) {
    const want = new Set(ids.filter((id) => !ALLQ[id]).map((id) => subjectOfId(id).join("/")));
    const cur = data;
    await Promise.all([...want].map((k) => loadSubject(...(k.split("/") as [string, string]))));
    if (cur) data = cur; // loading for lookups must not switch the page's subject
}

export const D = () => data as Data;
export const nav = (): NavGroup[] => (data ? data.nav : NAV);

/* ---------------- naming ---------------- */
// How each topic reads in navigation: English first, the paper's own Irish heading beneath
export type NavItem = [string, string, string, NavItem[]?];
export type NavGroup = { group: string; sub: string; items: NavItem[] };
/** The named texts of the current course sit under Prose and Poetry; the Roghnach questions are the last child. */
export const NAV: NavGroup[] = [
    {
        group: "Paper 1",
        sub: "Listening and composition",
        items: [
            ["aural-fogra-announcement", "Aural - Fógra (Announcement)", "Cluastuiscint, Cuid A"],
            ["aural-comhra-conversation", "Aural - Comhrá (Conversation)", "Cluastuiscint, Cuid B"],
            ["aural-piosa-nuachta-news-pieces", "Aural - Píosa Nuachta (News Pieces)", "Cluastuiscint, Cuid C"],
            ["write", "Composition", "Ceapadóireacht"],
        ],
    },
    {
        group: "Paper 2",
        sub: "Reading and literature",
        items: [
            ["reading-comprehension", "Reading comprehension", "Léamhthuiscint"],
            [
                "prose",
                "Prose",
                "Prós",
                [
                    ["prose-hurlamaboc", "Hurlamaboc", "Prós Ainmnithe, Ceist 2A"],
                    ["prose-dis", "Dís", "Prós Ainmnithe, Ceist 2A"],
                    ["prose-oisin-i-dtir-na-nog", "Oisín i dTír na nÓg", "Prós Ainmnithe, Ceist 2A"],
                    ["prose-caca-milis", "Cáca Milis", "Prós Ainmnithe, Ceist 2A"],
                    ["prose-an-lasair-choille", "An Lasair Choille", "Prós Ainmnithe, Ceist 2A"],
                    ["studied-prose-pros-roghnach", "Your own prose text", "Prós Roghnach, Ceist 2B"],
                ],
            ],
            [
                "poetry",
                "Poetry",
                "Filíocht",
                [
                    ["poetry-geibheann", "Géibheann", "Filíocht Ainmnithe, Ceist 3A"],
                    ["poetry-colscaradh", "Colscaradh", "Filíocht Ainmnithe, Ceist 3A"],
                    ["poetry-mo-ghra-sa", "Mo Ghrá-sa (idir lúibíní)", "Filíocht Ainmnithe, Ceist 3A"],
                    ["poetry-an-spailpin-fanach", "An Spailpín Fánach", "Filíocht Ainmnithe, Ceist 3A"],
                    ["poetry-an-tearrach-thiar", "An tEarrach Thiar", "Filíocht Ainmnithe, Ceist 3A"],
                    ["studied-poetry-filiocht-roghnach", "Your own poem", "Filíocht Roghnach, Ceist 3B"],
                ],
            ],
        ],
    },
];
/** Every topic entry of the current subject, children included, in nav order. */
export const navItems = (): NavItem[] => nav().flatMap((g) => g.items.flatMap((i) => (i[3] ? i[3] : [i])));
/** The parent row ("Prose") of a child topic, if it has one. */
export const navParent = (slug: string) => nav().flatMap((g) => g.items).find((i) => i[3]?.some((c) => c[0] === slug));
export const KINDS = ["Aiste", "Alt nuachtáin", "Scéal", "Díospóireacht / Óráid"];

export const topic = (slug?: string | null) => D().topics.find((t) => t.slug === slug);
export const navName = (slug: string) => navItems().find((i) => i[0] === slug)?.[1] ?? topic(slug)?.name ?? slug;
export const navIrish = (slug: string) => navItems().find((i) => i[0] === slug)?.[2] ?? "";
export const paperOf = (slug: string) => nav().find((g) => g.items.some((i) => i[0] === slug || i[3]?.some((c) => c[0] === slug)))?.group;
export const soonTopics = () => D().topics.filter((t) => t.course2027);

export const label = (q: Question) => q.title.replace(/^\d{4}( Deferred)? · /, "");
export const yearKey = (q: Question) => `${q.year}${q.deferred ? "D" : ""}`;
export const yearName = (k: string) => (k.endsWith("D") ? `${k.slice(0, 4)} deferred` : k);
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
export const where = (q: Question) => {
    const paper = q.source.paper.replace(".pdf", "").split("_")[1];
    const p = q.source.pages;
    return `${({ P1: "Paper 1", P2: "Paper 2", AURAL: "Aural paper" } as Record<string, string>)[paper] ?? "Paper"}, page${p.length > 1 ? "s" : ""} ${p.join(", ")}`;
};

/** The current subject's questions (the merged index holds every loaded subject). */
export const allQ = () => D().topics.flatMap((t) => t.questions);
export const yearKeys = () =>
    [...new Set(allQ().map(yearKey))].sort((a, b) => parseInt(b) - parseInt(a) || (a.endsWith("D") ? 1 : -1));
export const qsOfYear = (k: string) => allQ().filter((q) => yearKey(q) === k);
export const samplesOf = (q: Question) => D().res[q.resKey || q.id] || [];
/** The parts a student types or picks an answer for (everything but a long written part). */
export const shortParts = (qid: string) => (D().keys[qid]?.parts || []).filter((p) => p.kind !== "long");
export const isAural = (q: Question) => D().topicOf[q.id]?.startsWith("aural") && D().subject === "irish";
export const checkable = (q: Question) => shortParts(q.id).length > 0 || (isAural(q) && q.question.some((i) => i.boxes?.length));

const _st: Record<string, string> = {};
export const searchText = (q: Question) =>
    (_st[q.id] ??= [q.title, (q.kinds || []).join(" "), q.questionText, q.markingSchemeText, ...samplesOf(q).map((r) => r.title)].join(" ").toLowerCase());

/* ---------------- answer spaces ---------------- */
// [key, number, question text, section] for every answer space, in paper order. Listening papers repeat
// question numbers in each conversation and part, so each space also carries its section heading.
export function answerKeys(q: Question): [string, string, string, string][] {
    if (D().keys[q.id]) return shortParts(q.id).map((p) => [p.id, p.id, p.question, ""]);
    if (!isAural(q)) return [];
    const out: [string, string, string, string][] = [];
    let block = "", part = "", num = "", text = "", sub = "", lastQ = "";
    // "COMHRÁ A hAON" -> "Comhrá a hAon": sentence case, keeping Irish h-prefixes and the number after "a"
    const tidy = (x: string) =>
        x.split(/\s+/).map((w, i, ws) => {
            const cap = i === 0 || ws[i - 1].toLowerCase() === "a";
            const h = /^h[AEIOUÁÉÍÓÚ]/.test(w);
            const core = (h ? w.slice(1) : w).toLowerCase();
            return (h ? "h" : "") + (cap ? core.charAt(0).toUpperCase() + core.slice(1) : core);
        }).join(" ");
    q.question.forEach((img) => {
        (img.boxText || "").split("\n").forEach((line) => {
            const m = line.match(/\[\[BOX (\d+-\d+)\]\]/);
            const t = line.trim();
            if (m) {
                const id = `${num}${sub ? ` ${sub}` : ""}`;
                const again = out.length > 0 && out.at(-1)![1].replace(/ · 2nd$/, "") === id && lastQ === id;
                out.push(["box" + m[1], again ? `${id} · 2nd` : id, text, [block, part].filter(Boolean).join(" · ")]);
                lastQ = id;
            } else if (/^(F[ÓO]GRA|COMHR[ÁA]|P[ÍI]OSA)/i.test(t)) [block, part, num, text, sub] = [tidy(t.replace(/\s*\(.*$/, "")), "", "", "", ""];
            else if (/^An (Ch[ée]ad|Dara|Tr[íi]ú) Mh?[íi]r/i.test(t)) [part, num, text, sub] = [t.replace(/\s*\(.*$/, ""), "", "", ""];
            else if (/^\d+\./.test(t)) {
                const mm = t.match(/^(\d+)\.\s*(.*)$/)!;
                [num, text, sub] = [mm[1], mm[2], ""];
            } else if (/^\([a-z]+\)\s*$/i.test(t)) sub = t;
            else if (/^\([a-z]+\)\s+\S/i.test(t) && num) {
                const mm = t.match(/^(\([a-z]+\))\s*(.*)$/i)!;
                [sub, text] = [mm[1], mm[2]];
            } else if (t && text && !/[?.:]$/.test(text)) text = `${text} ${t}`;
            else if (t && !num) text = t;
        });
    });
    return out;
}

/* ---------------- whole papers (site/papers.json, built by tools/papers.py) ---------------- */
export type PaperFile = { pdf: string; thumb: string; pages: number };
export type PaperRow = { kind: "P1" | "P2" | "AURAL"; name: string; paper: PaperFile; scheme?: PaperFile; audio?: string | null };
export type Sitting = { key: string; year: number; deferred: boolean; rows: PaperRow[] };
let papers: Sitting[] | null = null;
export const loadPapers = async () => (papers ??= await fetch("/papers.json").then((r) => (r.ok ? r.json() : [])));

/* ---------------- lessons (site/lessons.json) ---------------- */
export type Lesson = {
    id: string;
    group: string;
    kind: "guide" | "tutorial";
    minutes: number;
    title: string;
    summary: string;
    /** the video at the top of the lesson; without a src the frame shows as coming soon */
    video?: { src?: string; poster?: string; seconds?: number };
    body: ({ p: string } | { h: string } | { list: string[] } | { steps: string[] } | { terms: [string, string][] } | { tip: string })[];
};
let lessons: Record<string, Lesson[]> | null = null;
export const loadLessons = async () => (lessons ??= await fetch("/lessons.json").then((r) => (r.ok ? r.json() : {})));
