// An Bhéaltriail: the four parts with their marks, the conversation explained (its notes are to
// follow), and the twenty Sraith Pictiúr with their pictures and sentences.
import { useEffect, useState } from "react";
import { ArrowRight, Clock, Pause, Play } from "@/components/app/ic";
import { motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { Link, useParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { DuoBubbles, DuoHeadphones, DuoMegaphone, DuoNews, DuoScroll } from "@/components/app/duo-icons";
import { Page, PageHeader, reveal } from "@/components/app/page-parts";
import { Segmented } from "@/components/app/segmented";
import { type Oral, type OralPart, loadOral } from "@/lib/extra";
import { hi } from "@/lib/highlight";
import { cx } from "@/utils/cx";
import { NotFound } from "./not-found";
import { usePlayer } from "./student/sraith-page";

const useOral = () => {
    const [d, setD] = useState<Oral | null>(null);
    useEffect(() => {
        loadOral().then(setD);
    }, []);
    return d;
};
const Loading = () => <p className="py-16 text-center text-sm text-tertiary">Loading…</p>;
const PART_ICON: Record<string, typeof DuoMegaphone> = { failtiu: DuoBubbles, "leamh-na-filiochta": DuoScroll, "sraith-pictiur": DuoNews, comhra: DuoHeadphones };
const partHref = (slug: string) => (slug === "sraith-pictiur" ? "/oral/sraith" : slug === "comhra" ? "/oral/comhra" : `/oral/${slug}`);

/** The divider heading used in the notes. */
const Head = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mb-5 flex items-center gap-4 text-center duo-label text-quaternary">
        <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
        {children}
        <span aria-hidden="true" className="flex-1 border-t-2 border-secondary" />
    </h2>
);

export const OralPage = () => {
    const d = useOral();
    return (
        <Page wide>
            <PageHeader kicker="Leaving Certificate · Higher Level" title="An Bhéaltriail" sub={d ? `The oral exam: ${d.total} marks, 40% of the whole exam, about 15 minutes with the examiner in the spring of sixth year. Four parts.` : "The oral exam."} />
            {!d ? (
                <Loading />
            ) : (
                <>
                    <ul className="grid gap-4 md:grid-cols-2">
                        {d.parts.map((p, i) => {
                            const Icon = PART_ICON[p.slug] ?? DuoMegaphone;
                            return (
                                <motion.li key={p.slug} {...reveal(i)}>
                                    <Link to={partHref(p.slug)} className="group flex h-full flex-col rounded-2xl border-2 border-secondary border-b-4 bg-primary p-5 outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 hover:bg-primary_hover focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                                        <div className="flex items-start gap-4">
                                            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-secondary bg-primary">
                                                <Icon aria-hidden="true" className="size-9" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="duo-label text-brand-secondary">{p.en}</p>
                                                <h2 className="mt-0.5 text-xl font-bold text-primary">{p.ga}</h2>
                                                <p className="mt-2 text-md leading-7 text-secondary">{hi(p.lead)}</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex items-center gap-2">
                                            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">{p.marks} marks</span>
                                            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-tertiary">about {p.minutes} min</span>
                                            <ArrowRight aria-hidden="true" className="ml-auto size-5 text-fg-quaternary transition-transform duration-200 group-hover:translate-x-0.5" />
                                        </div>
                                    </Link>
                                </motion.li>
                            );
                        })}
                    </ul>
                    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {d.parts.map((p) => (
                            <div key={p.slug} className="rounded-2xl border-2 border-secondary bg-primary px-4 py-3">
                                <p className="duo-label text-quaternary">{p.ga}</p>
                                <p className="mt-1 text-xl font-bold text-primary tabular-nums">
                                    {p.marks} <span className="text-sm font-semibold text-tertiary">/ {d.total}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Page>
    );
};

/** One part of the oral, explained: what happens, what to do, tips. */
const PartExplained = ({ p, children }: { p: OralPart; children?: React.ReactNode }) => {
    const Icon = PART_ICON[p.slug] ?? DuoMegaphone;
    return (
        <Page>
            <PageHeader kicker={<Link to="/oral" className="hover:underline">An Bhéaltriail</Link>} icon={<span className="flex size-14 items-center justify-center rounded-2xl border-2 border-secondary"><Icon aria-hidden="true" className="size-9" /></span>} title={p.ga} sub={`${p.en} · ${p.marks} marks · about ${p.minutes} minutes`} />
            <div className="max-w-2xl">
                <p className="text-lg leading-8 text-secondary">{hi(p.lead, "yellow")}</p>
                <section className="mt-12">
                    <Head>What you must do</Head>
                    <p className="text-lg leading-8 text-secondary">{hi(p.task, "yellow")}</p>
                </section>
                <section className="mt-12">
                    <Head>Tips</Head>
                    <ol className="flex flex-col gap-4">
                        {p.tips.map((t, i) => (
                            <li key={t} className="flex gap-4 text-lg leading-8 text-secondary">
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white tabular-nums">{i + 1}</span>
                                <span>{hi(t, "yellow")}</span>
                            </li>
                        ))}
                    </ol>
                </section>
                {children}
            </div>
        </Page>
    );
};

/** Fáiltiú and Léamh na Filíochta. */
export const OralPartPage = () => {
    const { part = "" } = useParams();
    const d = useOral();
    if (!d) return <Page><Loading /></Page>;
    const p = d.parts.find((x) => x.slug === part);
    if (!p) return <NotFound />;
    return <PartExplained p={p} />;
};

/* ---------------- comhrá ---------------- */

/* The conversation, explained: what it is, what to do, and what comes up. The notes on each topic
   (the questions, the answers to learn, the phrases) are not shown for now. They will follow, and
   until they do this page says so rather than showing notes that are not ready. */
export const ComhraPage = () => {
    const d = useOral();
    if (!d) return <Page><Loading /></Page>;
    const p = d.parts.find((x) => x.slug === "comhra");
    if (!p) return <NotFound />;
    return (
        <PartExplained p={p}>
            <section className="mt-12">
                <Head>What comes up</Head>
                <p className="text-lg leading-8 text-secondary">The examiner moves between everyday topics and the issues of the day. These are the ones to be ready for.</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                    {d.comhra.map((t) => (
                        <li key={t.slug} className="rounded-full border-2 border-secondary bg-primary px-3.5 py-1.5 text-sm">
                            <span lang="ga" className="font-bold text-primary">{t.ga}</span> <span className="text-tertiary">{t.en}</span>
                        </li>
                    ))}
                </ul>
            </section>
            <p className="mt-12 rounded-2xl border-2 border-dashed border-secondary bg-secondary_subtle px-5 py-4 text-md font-semibold text-tertiary">Notes on each topic will follow.</p>
        </PartExplained>
    );
};

/* ---------------- sraith pictiúr ---------------- */

export const SraithListPage = () => {
    const d = useOral();
    const p = d?.parts.find((x) => x.slug === "sraith-pictiur");
    const ready = d?.sraith.filter((s) => s.ready).length ?? 0;
    return (
        <Page wide>
            <PageHeader kicker={<Link to="/oral" className="hover:underline">An Bhéaltriail</Link>} title="Sraith Pictiúr" sub={p ? `${p.marks} marks · about ${p.minutes} minutes. ${p.lead} ${ready} of 20 are filled in so far.` : "The picture sequences."} />
            {!d ? (
                <Loading />
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {d.sraith.map((s, i) => {
                        const first = s.boxes[0]?.image;
                        const inner = (
                            <>
                                <span className="relative block aspect-[900/620] w-full overflow-hidden bg-secondary">
                                    {first ? (
                                        <img src={first.src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                                    ) : (
                                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-quaternary">
                                            <DuoNews aria-hidden="true" className="size-10 opacity-40 saturate-0" />
                                            <span className="duo-label">Coming</span>
                                        </span>
                                    )}
                                    <span className="absolute top-2 left-2 rounded-lg bg-primary/95 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">{s.n}</span>
                                </span>
                                <span className="block px-4 py-3">
                                    <span className={cx("block text-md font-bold", s.ready ? "text-primary" : "text-quaternary")}>{s.title}</span>
                                    <span className="mt-0.5 block text-xs font-bold text-quaternary">{s.ready ? `6 pictures · ${s.boxes.reduce((n, b) => n + b.sentences.length, 0)} sentences` : "Pictures and sentences to come"}</span>
                                </span>
                            </>
                        );
                        const cls = "block h-full overflow-hidden rounded-2xl border-2 bg-primary outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2";
                        return (
                            <motion.li key={s.slug} {...reveal(Math.min(i, 6))}>
                                {s.ready ? (
                                    <Link to={`/oral/sraith/${s.slug}`} className={cx(cls, "border-secondary border-b-4 hover:border-brand-300 hover:bg-primary_hover active:translate-y-0.5 active:border-b-2")}>
                                        {inner}
                                    </Link>
                                ) : (
                                    <div className={cx(cls, "border-dashed border-secondary")}>{inner}</div>
                                )}
                            </motion.li>
                        );
                    })}
                </ul>
            )}
        </Page>
    );
};

/* Where a Sraith sentence's audio lives. It is named by where the sentence is, and carries a short
   mark of the words themselves, so the browser can keep a clip for good and still fetch a new one if
   the sentence is ever reworded. The voice is Azure's Irish one; each clip is made once and kept. */
const mark = (text: string) => {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
};
const clipOf = (slug: string, box: number | "end", i: number, ga: string) => `/oral/sp/audio/${encodeURIComponent(slug)}/${box}-${i}.mp3?v=${mark(ga)}`;

/** The round listen button beside a sentence: a spinner while its clip loads, lit while it plays. */
const Listen = ({ on, loading, onPress, label }: { on: boolean; loading: boolean; onPress: () => void; label: string }) => (
    <AriaButton
        onPress={onPress}
        aria-label={label}
        aria-pressed={on}
        className={cx(
            "flex size-8 shrink-0 items-center justify-center rounded-full border-2 outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
            on || loading ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary bg-primary text-brand-secondary hover:border-brand",
        )}
    >
        {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-r-transparent" /> : on ? <Pause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5 translate-x-px" />}
    </AriaButton>
);

export const SraithPage = () => {
    const { slug = "" } = useParams();
    const d = useOral();
    const [showEn, setShowEn] = useState(true);
    const [slow, setSlow] = useState(false);
    const player = usePlayer(slow);
    // A different Sraith: whatever was playing stops.
    useEffect(() => player.stop, [slug, player.stop]);
    if (!d) return <Page><Loading /></Page>;
    const s = d.sraith.find((x) => x.slug === slug);
    if (!s || !s.ready) return <NotFound />;
    const i = d.sraith.indexOf(s);
    const next = d.sraith.slice(i + 1).find((x) => x.ready);
    return (
        <Page wide>
            <PageHeader
                kicker={
                    <>
                        <Link to="/oral" className="hover:underline">An Bhéaltriail</Link> · <Link to="/oral/sraith" className="hover:underline">Sraith Pictiúr</Link> · {s.n} of 20
                    </>
                }
                title={s.title}
                sub="Tell the story picture by picture, then be ready for three questions on it. Keep to one tense."
                actions={
                    <>
                        <Segmented ghost size="sm" label="English" value={showEn ? "on" : "off"} onChange={(k) => setShowEn(k === "on")} items={[{ id: "on", label: "With English" }, { id: "off", label: "Irish only" }]} itemClassName="px-3 py-2 duo-label tracking-normal" />
                        <Segmented ghost size="sm" label="Speed" value={slow ? "slow" : "normal"} onChange={(k) => setSlow(k === "slow")} items={[{ id: "normal", label: "Normal speed" }, { id: "slow", label: "Slower" }]} itemClassName="px-3 py-2 duo-label tracking-normal" />
                    </>
                }
            />
            <ol className="grid gap-5 lg:grid-cols-2">
                {s.boxes.map((b, n) => (
                    <motion.li key={b.n} {...reveal(Math.min(n, 5))} className="overflow-hidden rounded-2xl border-2 border-secondary bg-primary">
                        {b.image && (
                            <div className="relative border-b-2 border-secondary bg-white">
                                <img src={b.image.src} width={b.image.w} height={b.image.h} alt={`Picture ${b.n}`} className="block h-auto w-full" />
                                <span className="absolute top-3 left-3 flex size-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white tabular-nums">{b.n}</span>
                            </div>
                        )}
                        {/* Every sentence can be listened to, and the whole picture played through in order. */}
                        <div className="flex items-center justify-between gap-3 px-5 pt-4">
                            <p className="text-sm font-bold text-tertiary">Pictiúr {b.n}</p>
                            <AriaButton
                                onPress={() => (player.state.all === `b${b.n}` ? player.stop() : player.play(b.sentences.map((x, i) => ({ key: `b${b.n}-${i}`, audio: clipOf(s.slug, b.n, i, x.ga) })), `b${b.n}`))}
                                className={cx(
                                    "flex h-8 items-center gap-1.5 rounded-full border-2 px-3 text-xs font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                                    player.state.all === `b${b.n}` ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary text-brand-secondary hover:border-brand",
                                )}
                            >
                                {player.state.all === `b${b.n}` ? <Pause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5" />}
                                {player.state.all === `b${b.n}` ? "Stop" : "Play all"}
                            </AriaButton>
                        </div>
                        <ul className="flex flex-col gap-3 px-5 pt-3 pb-4">
                            {b.sentences.map((x, i) => {
                                const key = `b${b.n}-${i}`;
                                const here = player.state.key === key;
                                const press = () => (here && (player.state.loading || !player.state.all) ? player.stop() : player.play([{ key, audio: clipOf(s.slug, b.n, i, x.ga) }]));
                                return (
                                    <li key={x.ga} className="flex gap-3">
                                        <Listen on={here && !player.state.loading} loading={here && player.state.loading} onPress={press} label={`Listen: ${x.ga}`} />
                                        <div className="min-w-0">
                                            <p lang="ga" onClick={press} className={cx("cursor-pointer text-md leading-7 font-semibold transition-colors duration-200", here ? "text-brand-secondary" : "text-primary")}>
                                                {x.ga}
                                            </p>
                                            {showEn && x.en && <p className="text-sm text-tertiary">{x.en}</p>}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </motion.li>
                ))}
            </ol>
            {s.ending.length > 0 && (
                <section className="mt-10 max-w-2xl">
                    <Head>Críoch · ending</Head>
                    <ul className="flex flex-col gap-3">
                        {s.ending.map((x, i) => {
                            const key = `end-${i}`;
                            const here = player.state.key === key;
                            const press = () => (here ? player.stop() : player.play([{ key, audio: clipOf(s.slug, "end", i, x.ga) }]));
                            return (
                                <li key={x.ga} className="flex gap-3">
                                    <Listen on={here && !player.state.loading} loading={here && player.state.loading} onPress={press} label={`Listen: ${x.ga}`} />
                                    <div className="min-w-0">
                                        <p lang="ga" onClick={press} className={cx("cursor-pointer text-md leading-7 font-semibold transition-colors duration-200", here ? "text-brand-secondary" : "text-primary")}>
                                            {x.ga}
                                        </p>
                                        {showEn && x.en && <p className="text-sm text-tertiary">{x.en}</p>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-secondary pt-6">
                <p className="flex items-center gap-2 text-sm text-tertiary">
                    <Clock aria-hidden="true" className="size-4" /> About four minutes: a minute and a half on the story, the rest on the questions.
                </p>
                {next && (
                    <DuoButton color="secondary" size="sm" href={`/oral/sraith/${next.slug}`} iconTrailing={ArrowRight}>
                        Next: {next.title}
                    </DuoButton>
                )}
            </div>
        </Page>
    );
};
