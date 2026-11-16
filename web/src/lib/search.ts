// Search across the hub: topics by their English or Irish names (and the words people actually use
// for them), every past question's text and marking scheme, and exam years. Accents never matter:
// "fogra" finds Fógra, "Léamhthuiscint" finds Reading comprehension.
import { type Question, D, nav, navName, navIrish, searchText, topic, yearKeys } from "@/lib/data";

/** Lower-case, accents stripped, apostrophes dropped. */
export const fold = (s: string) =>
    (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[’'`]/g, "");

/* The words people reach for, beyond the nav names. A topic slug maps to any number of them. */
const ALIASES: Record<string, string> = {
    "aural-fogra-announcement": "cluastuiscint listening aural fógra fogra announcement announcements cuid a",
    "aural-comhra-conversation": "cluastuiscint listening aural comhrá comhra conversation conversations cuid b",
    "aural-piosa-nuachta-news-pieces": "cluastuiscint listening aural píosa nuachta nuacht news cuid c",
    write: "ceapadóireacht ceapadoireacht composition essay aiste alt nuachtáin scéal díospóireacht óráid speech story debate article writing paper 1",
    "reading-comprehension": "léamhthuiscint leamhthuiscint reading comprehension paper 2",
    prose: "prós pros prose ainmnithe roghnach litríocht literature",
    poetry: "filíocht filiocht poetry poem poems dán dánta ainmnithe roghnach litríocht literature",
};
export type TopicHit = { slug: string; name: string; irish: string; group: string; href: string; score: number };
export type ExtraHit = { title: string; sub: string; href: string };

const EXTRA: { words: string; title: string; sub: string; href: string }[] = [
    { words: "béaltriail bealtriail oral speaking interview", title: "An Bhéaltriail", sub: "The oral exam", href: "/oral" },
    { words: "sraith pictiúr pictiur picture sequence", title: "Sraith Pictiúr", sub: "The picture sequences", href: "/oral/sraith" },
    { words: "comhrá comhra conversation oral", title: "Comhrá", sub: "The oral conversation, explained", href: "/oral/comhra" },
    { words: "gramadach grammar tenses aimsir", title: "Grammar", sub: "The grammar course", href: "/grammar" },
    { words: "past papers paper páipéar scrúdú exam papers", title: "Past papers", sub: "Every paper, by year", href: "/papers" },
    { words: "notes nótaí guides", title: "Notes and guides", sub: "Coming soon", href: "/notes" },
];

const tokens = (q: string) => fold(q).split(/\s+/).filter(Boolean);

/** Topics whose English name, Irish name or aliases match every word of the query. */
export const searchTopics = (q: string): TopicHit[] => {
    const ts = tokens(q);
    if (!ts.length) return [];
    const hits: TopicHit[] = [];
    for (const g of nav()) {
        const items = g.items.flatMap((i) => (i[3] ? [i, ...i[3]] : [i]));
        for (const [slug, name, irish] of items) {
            const hay = fold(`${name} ${irish} ${ALIASES[slug] || ""}`);
            if (!ts.every((t) => hay.includes(t))) continue;
            const n = fold(name), ir = fold(irish);
            const score = ts.reduce((sc, t) => sc + (n.startsWith(t) || ir.startsWith(t) ? 3 : n.includes(t) || ir.includes(t) ? 2 : 1), 0);
            hits.push({ slug, name, irish, group: g.group, href: `/t/${slug}`, score });
        }
    }
    return hits.sort((a, b) => b.score - a.score);
};

/** Other places a word can point: the oral, grammar, papers. */
export const searchExtras = (q: string): ExtraHit[] => {
    const ts = tokens(q);
    if (!ts.length) return [];
    return EXTRA.filter((e) => ts.every((t) => fold(`${e.words} ${e.title}`).includes(t)));
};

/** A four-digit year (optionally "deferred") maps to that year's paper. */
export const searchYears = (q: string): ExtraHit[] => {
    const m = fold(q).match(/\b(20\d\d)\b/);
    if (!m) return [];
    return yearKeys()
        .filter((k) => k.startsWith(m[1]))
        .map((k) => ({ title: k.endsWith("D") ? `${k.slice(0, 4)} deferred paper` : `${k} paper`, sub: "Every question from that sitting", href: `/year/${k}` }));
};

const folded: Record<string, string> = {};
const textOf = (q: Question) => (folded[q.id] ??= fold(searchText(q)));

export type QuestionHit = { q: Question; slug: string; score: number };
/** Questions whose title, text, marking scheme or sample titles contain every word of the query. */
export const searchQuestions = (q: string): QuestionHit[] => {
    const ts = tokens(q);
    if (!ts.length) return [];
    const out: QuestionHit[] = [];
    for (const qu of Object.values(D().q)) {
        const text = textOf(qu);
        if (!ts.every((t) => text.includes(t))) continue;
        const title = fold(qu.title);
        const slug = D().topicOf[qu.id];
        const score = ts.reduce((sc, t) => sc + (title.includes(t) ? 3 : 1), 0) + (fold(navName(slug) + " " + navIrish(slug)).includes(ts[0]) ? 2 : 0);
        out.push({ q: qu, slug, score });
    }
    return out.sort((a, b) => b.score - a.score || b.q.year - a.q.year);
};

/** Group question hits by topic, keeping the nav's order within a run. */
export const groupByTopic = (hits: QuestionHit[]) => {
    const groups = new Map<string, QuestionHit[]>();
    for (const h of hits) groups.set(h.slug, [...(groups.get(h.slug) ?? []), h]);
    return [...groups.entries()].map(([slug, list]) => ({ slug, name: navName(slug) || topic(slug)?.name || slug, irish: navIrish(slug), list }));
};
