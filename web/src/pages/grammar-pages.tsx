// Grammar: the 38 lessons of the HeyRua grammar course, grouped the way the course groups them,
// read here as airy notes with the Irish picked out.
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { ArrowRight, ChevronDown } from "@/components/app/ic";
import { AnimatePresence, motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { Link, useParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoPencil } from "@/components/app/duo-icons";
import { Page, PageHeader, reveal } from "@/components/app/page-parts";
import { type GBlock, type Grammar, loadGrammar } from "@/lib/extra";
import { cx } from "@/utils/cx";
import { NotFound } from "./not-found";

const useGrammar = () => {
    const [d, setD] = useState<Grammar | null>(null);
    useEffect(() => {
        loadGrammar().then(setD);
    }, []);
    return d;
};

/** The course's inline markup: «Irish», *gloss*, **bold**, [h] séimhiú and {m} urú marks, [[slug]] links. */
export const rich = (raw: unknown): ReactNode => {
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") : raw == null ? "" : String(raw);
    const parts = text.split(/(«[^»]*»|\*\*[^*]+\*\*|\*[^*]+\*|\[\[[^\]]+\]\])/g);
    return parts.map((p, i) => {
        if (p.startsWith("«")) return <span key={i} lang="ga" className="font-semibold text-primary">{marks(p.slice(1, -1))}</span>;
        if (p.startsWith("**")) return <strong key={i} className="font-bold text-primary">{p.slice(2, -2)}</strong>;
        if (p.startsWith("*")) return <em key={i} className="text-tertiary">{p.slice(1, -1)}</em>;
        if (p.startsWith("[[")) {
            const slug = p.slice(2, -2);
            return (
                <Link key={i} to={`/grammar/${slug}`} className="font-bold text-brand-secondary hover:underline">
                    {slug.replace(/-/g, " ")}
                </Link>
            );
        }
        return <Fragment key={i}>{marks(p)}</Fragment>;
    });
};
/** [h] and {m} and [t-] marks become yellow letters: the mutation itself, picked out. */
const marks = (s: string): ReactNode =>
    s.split(/(\[[^\]]{1,3}\]|\{[^}]{1,3}\})/g).map((p, i) =>
        /^[[{]/.test(p) ? (
            <mark key={i} className="rounded-sm bg-yellow-100 px-0.5 font-bold text-yellow-900">
                {p.slice(1, -1)}
            </mark>
        ) : (
            <Fragment key={i}>{p}</Fragment>
        ),
    );

const Cell = ({ c }: { c: string | string[] }) =>
    Array.isArray(c) ? (
        <>
            <span lang="ga" className="block font-semibold text-primary">
                {marks(c[0] ?? "")}
            </span>
            {c[1] && <span className="block text-sm text-tertiary">{c[1]}</span>}
        </>
    ) : (
        <>{rich(c)}</>
    );

const Block = ({ b }: { b: GBlock }) => {
    if (b.t === "p") return <p className="my-5 text-lg leading-8 text-secondary">{rich(b.text)}</p>;
    if (b.t === "h") return <h4 className="mt-8 mb-3 text-md font-bold text-primary">{rich(b.text)}</h4>;
    if (b.t === "list")
        return (
            <ul className="my-6 flex flex-col gap-3">
                {b.items.map((x, i) => (
                    <li key={i} className="flex items-start gap-4 text-lg leading-8 text-secondary">
                        <span aria-hidden="true" className="mt-3.5 size-2 shrink-0 rounded-full bg-brand-500" />
                        <span>{rich(x)}</span>
                    </li>
                ))}
            </ul>
        );
    if (b.t === "table")
        return (
            <div className="my-6 overflow-x-auto rounded-2xl border-2 border-secondary">
                <table className="w-full border-collapse text-md">
                    {b.head && b.head.some(Boolean) && (
                        <thead>
                            <tr className="border-b-2 border-secondary bg-secondary_subtle">
                                {b.head.map((h, i) => (
                                    <th key={i} className="px-4 py-2.5 text-left duo-label text-quaternary">
                                        {rich(h)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    )}
                    <tbody className="divide-y-2 divide-secondary">
                        {b.rows.map((r, i) => (
                            <tr key={i}>
                                {r.map((c, j) => (
                                    <td key={j} className={cx("px-4 py-3 align-top", j === 0 && "font-semibold text-primary")}>
                                        <Cell c={c} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {b.note && <p className="border-t-2 border-secondary px-4 py-2.5 text-sm text-tertiary">{rich(b.note)}</p>}
            </div>
        );
    if (b.t === "group") return <Fold title={b.title}>{b.blocks.map((x, i) => <Block key={i} b={x} />)}</Fold>;
    return (
        <div className="my-6 rounded-2xl border-2 border-dashed border-secondary px-5 py-4">
            <p className="duo-label text-quaternary">{b.title || `Verb tables${b.tense ? ` · ${b.tense}` : ""}`}</p>
            {b.verbs.length > 0 && (
                <p className="mt-2 text-md text-secondary">
                    {b.verbs.map((v, i) => (
                        <Fragment key={i}>
                            {i > 0 && ", "}
                            <span lang="ga" className="font-semibold text-primary">
                                {v[0]}
                            </span>
                            {v[1] && <span className="text-tertiary"> ({v[1]})</span>}
                        </Fragment>
                    ))}
                </p>
            )}
            {b.note && <p className="mt-2 text-sm text-tertiary">{rich(b.note)}</p>}
            <p className="mt-2 text-xs font-bold text-quaternary">Full conjugation tables are in the HeyRua grammar course.</p>
        </div>
    );
};

const Fold = ({ title, children }: { title: string; children: ReactNode }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="my-6 rounded-2xl border-2 border-secondary">
            <AriaButton onPress={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-md font-bold text-primary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                {rich(title)}
                <ChevronDown aria-hidden="true" className={cx("size-5 shrink-0 stroke-[2.5px] text-fg-quaternary transition-transform duration-200", open && "-scale-y-100")} />
            </AriaButton>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                        <div className="border-t-2 border-secondary px-5 pb-2">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const GrammarPage = () => {
    const d = useGrammar();
    return (
        <Page wide>
            <PageHeader kicker="Gramadach" title="Grammar" sub="Every rule you need for the Leaving Cert, one lesson at a time: the tenses, the mutations, numbers, prepositions and the genitive." />
            {!d ? (
                <p className="py-16 text-center text-sm text-tertiary">Loading…</p>
            ) : (
                d.groups.map((g, gi) => (
                    <motion.section key={g.id} {...reveal(Math.min(gi, 6))} className="mb-12">
                        <div className="mb-4 flex items-baseline gap-3">
                            <h2 className="text-lg font-bold text-primary">{g.en}</h2>
                            <span lang="ga" className="text-sm font-semibold text-tertiary">
                                {g.ga}
                            </span>
                        </div>
                        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {g.lessons.map((l) => (
                                <li key={l.slug}>
                                    <Link to={`/grammar/${l.slug}`} className="group flex h-full gap-4 rounded-2xl border-2 border-secondary border-b-4 bg-primary p-5 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-secondary bg-primary">
                                            <DuoPencil aria-hidden="true" className="size-7" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-md font-bold text-primary">{l.en}</span>
                                            <span lang="ga" className="block text-sm text-tertiary">
                                                {l.ga}
                                            </span>
                                            {l.learn[0] && <span className="mt-2 block text-xs text-quaternary">{rich(l.learn[0])}</span>}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </motion.section>
                ))
            )}
        </Page>
    );
};

export const GrammarLessonPage = () => {
    const { slug = "" } = useParams();
    const d = useGrammar();
    if (!d) return <Page><p className="py-16 text-center text-sm text-tertiary">Loading…</p></Page>;
    const L = d.lessons[slug];
    if (!L) return <NotFound />;
    const group = d.groups.find((g) => g.lessons.some((l) => l.slug === slug));
    const flat = d.groups.flatMap((g) => g.lessons);
    const next = flat[flat.findIndex((l) => l.slug === slug) + 1];
    const meta = group?.lessons.find((l) => l.slug === slug);
    const steps = L.sections.filter((s) => s.step);
    return (
        <Page wide>
            <PageHeader kicker={<><Link to="/grammar" className="hover:underline">Grammar</Link>{group ? ` · ${group.en}` : ""}</>} title={L.en} sub={<span lang="ga">{L.ga}</span>} />
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <article className="min-w-0 max-w-2xl">
                    <p className="text-lg leading-8 text-secondary">{rich(L.summary)}</p>
                    {meta && meta.learn.length > 0 && (
                        <div className="mt-6 rounded-2xl border-2 border-brand bg-brand-primary p-5">
                            <p className="duo-label text-brand-secondary">In this lesson</p>
                            <ul className="mt-2 flex flex-col gap-1.5">
                                {meta.learn.map((x) => (
                                    <li key={x} className="text-md leading-7 text-secondary">
                                        {rich(x)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {L.sections.map((s, i) => (
                        <section key={s.id ?? i} id={s.id} className="mt-12 scroll-mt-24">
                            <h3 className="flex items-center gap-4 text-center duo-label text-quaternary">
                                <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
                                {s.step && steps.indexOf(s) >= 0 && <span className="flex size-6 items-center justify-center rounded-full bg-brand-500 text-xs text-white tabular-nums">{steps.indexOf(s) + 1}</span>}
                                <span>{rich(s.h)}</span>
                                <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
                            </h3>
                            {s.lead && <p className="mt-5 text-lg leading-8 font-semibold text-primary">{rich(s.lead)}</p>}
                            {s.blocks.map((b, j) => (
                                <Block key={j} b={b} />
                            ))}
                        </section>
                    ))}
                    {L.recap.length > 0 && (
                        <section className="mt-12 rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-6">
                            <p className="duo-label text-yellow-700">Remember</p>
                            <ul className="mt-3 flex flex-col gap-2.5">
                                {L.recap.map((x, i) => (
                                    <li key={i} className="text-lg leading-8 text-yellow-950">
                                        {rich(x)}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t-2 border-secondary pt-6">
                        <DuoButton color="ghost" size="sm" href="/grammar">
                            All grammar lessons
                        </DuoButton>
                        {next && (
                            <DuoButton color="secondary" size="sm" href={`/grammar/${next.slug}`} iconTrailing={ArrowRight}>
                                Next: {next.en}
                            </DuoButton>
                        )}
                    </div>
                </article>
                <aside className="rounded-2xl border-2 border-secondary bg-primary p-4 lg:sticky lg:top-24">
                    <p className="px-2 pb-2 duo-label text-quaternary">{group?.en ?? "Lessons"}</p>
                    <ul className="flex flex-col gap-1">
                        {(group?.lessons ?? []).map((l) => (
                            <li key={l.slug}>
                                <Link to={`/grammar/${l.slug}`} aria-current={l.slug === slug ? "page" : undefined} className={cx("block rounded-xl border-2 px-3 py-2.5 text-sm font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2", l.slug === slug ? "border-brand bg-brand-primary text-brand-secondary" : "border-transparent text-secondary hover:bg-primary_hover")}>
                                    {l.en}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </aside>
            </div>
        </Page>
    );
};
