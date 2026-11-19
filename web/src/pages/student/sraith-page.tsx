// Sraith Pictiúr: the ten picture stories from the Irish for Primary Teaching course book, for
// revision (ported from sraithView, bindSraith, renderSraithIndex, sraithLine, srSection,
// renderSraithStory, srStop and srPlay). Each Sraith is its six pictures: the sentences for the
// picture on the left as a list, Irish with the English beneath it, a listen button at the end of
// each Irish sentence, and the picture on the right. The English can be hidden to test yourself and
// the speech slowed; both choices are remembered on the device.
//
// Mounted at /sraith and /sraith/:slug for students, and by the teacher console at
// /teach/sraith/:id, so the slug comes from whichever param is set and links are built on basePath.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Button as AriaButton } from "react-aria-components";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { BookOpen01, ChevronLeft, Play, Stars02 } from "@/components/app/ic";
import { Empty, Page, PageHeader } from "@/components/app/page-parts";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { type SrLine, type SrPrefs, type SrStory, type SrSummary, saveSraithPrefs, srTwo, sraithPrefs } from "@/lib/account";
import { api, useMe } from "@/lib/portal";
import { cx } from "@/utils/cx";
import { SignInCard } from "./password-pages";

/* ---- fetched once per session, as the old sraithCache did ---------------------------------- */
const cache = new Map<string, Promise<unknown>>();
const cached = <T,>(key: string, path: string) => {
    if (!cache.has(key)) cache.set(key, api<T>(path).catch((e) => (cache.delete(key), Promise.reject(e))));
    return cache.get(key) as Promise<T>;
};
const useCached = <T,>(key: string, path: string) => {
    const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key });
    useEffect(() => {
        let live = true;
        setState({ key });
        if (!path) return;
        cached<T>(key, path).then(
            (d) => live && setState({ key, data: d }),
            (e: Error) => live && setState({ key, error: e.message }),
        );
        return () => {
            live = false;
        };
    }, [key, path]);
    return state.key === key ? state : { key };
};

/* ---- one player for the whole page ----------------------------------------------------------
   Pressing a new line stops the last one, and Play all walks through the picture's sentences with a
   short pause between them and the sentence being spoken picked out. */
type Playing = { key: string | null; loading: boolean; all: string | null };
/* `audio` on a line is either a clip id of the course-book Sraith (served by /api/sraith/audio) or a
   whole address beginning with "/", which is how the past papers' Sraith names its sentences. */
const clipSrc = (audio: string, retry = 0) => {
    const src = audio.startsWith("/") ? audio : `/api/sraith/audio/${encodeURIComponent(audio)}.mp3`;
    return retry ? `${src}${src.includes("?") ? "&" : "?"}r=${retry}` : src;
};
export const usePlayer = (slow: boolean) => {
    const audio = useRef<HTMLAudioElement | null>(null);
    const run = useRef(0);
    const slowRef = useRef(slow);
    slowRef.current = slow;
    const [state, setState] = useState<Playing>({ key: null, loading: false, all: null });
    useEffect(() => {
        if (audio.current) audio.current.defaultPlaybackRate = audio.current.playbackRate = slow ? 0.75 : 1;
    }, [slow]);
    const stop = useCallback(() => {
        run.current += 1;
        try {
            audio.current?.pause();
        } catch {
            /* gone */
        }
        setState({ key: null, loading: false, all: null });
    }, []);
    useEffect(() => stop, [stop]); // leaving the page stops the sound
    const play = useCallback(
        (lines: { key: string; audio: string; el?: HTMLElement | null }[], all: string | null = null) => {
            stop();
            const mine = run.current;
            const queue = [...lines];
            if (!audio.current) audio.current = new Audio();
            const a = audio.current;
            const rate = () => (a.defaultPlaybackRate = a.playbackRate = slowRef.current ? 0.75 : 1);
            const next = () => {
                if (mine !== run.current) return;
                const li = queue.shift();
                if (!li) return stop();
                setState({ key: li.key, loading: true, all });
                a.onplaying = () => {
                    if (mine !== run.current) return;
                    setState({ key: li.key, loading: false, all });
                    if (all) li.el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                };
                a.onended = () => {
                    if (mine !== run.current) return;
                    if (queue.length) setTimeout(next, 500);
                    else stop();
                };
                /* A request dropped mid-way (a page restarting, a phone changing network) is tried
                   again once, quietly, before anything is said. A load cut short by pressing another
                   sentence is not an error at all. */
                let tries = 0;
                a.onerror = () => {
                    if (mine !== run.current) return;
                    if (a.error && a.error.code === 1) return;
                    if (tries < 2) {
                        tries += 1;
                        setTimeout(() => {
                            if (mine !== run.current) return;
                            a.src = clipSrc(li.audio, tries);
                            rate();
                            a.play().catch(() => {
                                /* onerror decides */
                            });
                        }, 700 * tries);
                        return;
                    }
                    stop();
                    toast("That sentence did not play. Tap it again.");
                };
                a.src = clipSrc(li.audio);
                rate(); // a new source resets the rate to the default, so both are set
                a.play().catch((error: { name?: string }) => {
                    if (mine !== run.current || error?.name === "AbortError") return;
                    stop();
                    if (error?.name !== "NotAllowedError") return; // a failed load is onerror's to retry
                    toast("Your browser held the sound back. Tap the sentence again.");
                });
            };
            next();
        },
        [stop],
    );
    return { state, play, stop };
};

/* ---- the index -------------------------------------------------------------------------------- */

const SraithIndex = ({ list, basePath }: { list: SrSummary[]; basePath: string }) => (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {list.map((s) => (
            <Link key={s.slug} to={`${basePath}/${encodeURIComponent(s.slug)}`} className="group flex flex-col rounded-2xl outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-4">
                <span className="block aspect-4/3 overflow-hidden rounded-2xl border-2 border-secondary bg-primary transition duration-150 group-hover:border-brand">
                    {s.cover ? (
                        <img src={s.cover.src} alt="" loading="lazy" width={s.cover.width} height={s.cover.height} className="size-full object-cover transition duration-500 group-hover:scale-[1.025]" />
                    ) : (
                        <span className="grid size-full place-items-center bg-secondary text-xs text-quaternary">Pictures to come</span>
                    )}
                </span>
                <span className="mt-3 flex justify-between gap-2 text-xs text-quaternary tabular-nums">
                    <span>{srTwo(s.n)}</span>
                    <span>{s.sentences} sentences</span>
                </span>
                <span lang="ga" className="mt-1 text-md font-bold text-primary transition duration-100 group-hover:text-brand-secondary">
                    {s.title}
                </span>
            </Link>
        ))}
    </div>
);

/* ---- one sentence ---------------------------------------------------------------------------- */

/* The listen button sits at the end of the sentence, bound to its last word so a line that wraps
   never leaves the button alone on the next row. */
const Line = ({ line, english, peeked, playing, loading, onPlay, onPeek, register }: { line: SrLine; english: boolean; peeked: boolean; playing: boolean; loading: boolean; onPlay: () => void; onPeek: () => void; register: (el: HTMLLIElement | null) => void }) => {
    const text = String(line.ga);
    const cut = text.lastIndexOf(" ");
    const head = cut > 0 ? `${text.slice(0, cut)} ` : "";
    const tail = cut > 0 ? text.slice(cut + 1) : text;
    return (
        <li ref={register} className="relative pl-5">
            <span aria-hidden="true" className={cx("absolute top-[0.8em] left-1 size-1.5 rounded-full transition-colors duration-200", playing ? "bg-brand-solid" : "bg-quaternary")} />
            <p lang="ga" onClick={onPlay} className={cx("cursor-pointer text-lg leading-7 font-bold tracking-tight transition-colors duration-200", playing ? "text-brand-secondary" : "text-primary")}>
                {head}
                <span className="whitespace-nowrap">
                    {tail}
                    <button
                        type="button"
                        aria-label={`Listen: ${text}`}
                        title="Listen"
                        onClick={(e) => {
                            e.stopPropagation();
                            onPlay();
                        }}
                        className={cx(
                            "relative ml-2 inline-flex size-8 items-center justify-center rounded-full border-2 align-[-8px] outline-focus-ring transition duration-100 ease-linear after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-2",
                            playing || loading ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary bg-primary text-brand-secondary hover:border-brand",
                        )}
                    >
                        {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-r-transparent" /> : <Play aria-hidden="true" className={cx("size-3.5", playing && "animate-pulse")} />}
                    </button>
                </span>
            </p>
            {line.en && (
                <p
                    className={cx("mt-1 text-md leading-6 text-tertiary italic", !english && "cursor-pointer select-none")}
                    onClick={(e) => {
                        // With the English hidden, its line is revealed, not played.
                        if (!english) {
                            e.stopPropagation();
                            onPeek();
                        }
                    }}
                >
                    <span className={cx("transition duration-200", !english && !peeked && "opacity-55 blur-[5px]")}>{line.en}</span>
                </p>
            )}
        </li>
    );
};

/* ---- one picture with its sentences --------------------------------------------------------- */

const SrSection = ({ id, label, lines, keyPrefix, image, n, english, peeks, togglePeek, player, onZoom, register }: { id: string; label: string; lines: SrLine[]; keyPrefix: string; image: { src: string; width: number; height: number } | null; n: number; english: boolean; peeks: Set<string>; togglePeek: (k: string) => void; player: ReturnType<typeof usePlayer>; onZoom: (src: string, n: number) => void; register: (id: string, el: HTMLElement | null) => void }) => {
    const refs = useRef(new Map<string, HTMLLIElement>());
    const items = lines.map((l, i) => ({ key: `${keyPrefix}-${i}`, line: l }));
    const allOn = player.state.all === id;
    const playOne = (key: string, audio: string) => {
        if (player.state.key === key && (player.state.loading || !player.state.all)) return player.stop();
        player.play([{ key, audio, el: refs.current.get(key) }]);
    };
    return (
        <section id={`sr-box-${id}`} ref={(el) => register(`sr-box-${id}`, el)} className={cx("grid scroll-mt-40 gap-6 border-b-2 border-secondary py-8 lg:gap-12", image ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]" : "max-w-2xl")}>
            <div>
                <div className="mb-5 flex items-baseline justify-between gap-4">
                    <h2 className="text-sm font-bold text-primary">{label}</h2>
                    <AriaButton
                        onPress={() => (allOn ? player.stop() : player.play(items.map((it) => ({ key: it.key, audio: it.line.audio, el: refs.current.get(it.key) })), id))}
                        className={cx("inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-bold outline-focus-ring hover:underline focus-visible:outline-2 md:min-h-0 md:px-0", allOn ? "text-primary" : "text-brand-secondary")}
                    >
                        {allOn ? <span aria-hidden="true" className="inline-block size-2.5 rounded-xs bg-current" /> : <Play aria-hidden="true" className="size-3" />}
                        <span>{allOn ? "Stop" : "Play all"}</span>
                    </AriaButton>
                </div>
                <ul className="flex flex-col gap-5">
                    {items.map((it) => (
                        <Line
                            key={it.key}
                            line={it.line}
                            english={english}
                            peeked={peeks.has(it.key)}
                            playing={player.state.key === it.key && !player.state.loading}
                            loading={player.state.key === it.key && player.state.loading}
                            onPlay={() => playOne(it.key, it.line.audio)}
                            onPeek={() => togglePeek(it.key)}
                            register={(el) => {
                                if (el) refs.current.set(it.key, el);
                                else refs.current.delete(it.key);
                            }}
                        />
                    ))}
                </ul>
            </div>
            {image && (
                <figure className="-order-1 m-0 lg:order-none lg:sticky lg:top-40">
                    <button type="button" onClick={() => onZoom(image.src, n)} aria-label={`View Pictiúr ${n} larger`} className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border-2 border-secondary bg-primary outline-focus-ring transition duration-150 hover:border-brand focus-visible:outline-2">
                        <img src={image.src} alt={`Pictiúr ${n}`} width={image.width} height={image.height} loading={n <= 2 ? "eager" : "lazy"} className="block h-auto w-full" />
                    </button>
                </figure>
            )}
        </section>
    );
};

/* ---- the story ------------------------------------------------------------------------------ */

const SraithStory = ({ s, basePath }: { s: SrStory; basePath: string }) => {
    const [prefs, setPrefs] = useState<SrPrefs>(sraithPrefs);
    const [peeks, setPeeks] = useState<Set<string>>(new Set());
    const [zoom, setZoom] = useState<{ src: string; n: number } | null>(null);
    const [on, setOn] = useState<string>(s.boxes[0] ? String(s.boxes[0].n) : "end");
    const player = usePlayer(prefs.slow);
    const sections = useRef(new Map<string, HTMLElement>());
    const tabs = useRef<HTMLElement>(null);
    const update = (next: Partial<SrPrefs>) => {
        const merged = { ...prefs, ...next };
        setPrefs(merged);
        saveSraithPrefs(merged);
        if (next.english !== undefined) setPeeks(new Set());
    };
    const togglePeek = (k: string) =>
        setPeeks((p) => {
            const n = new Set(p);
            if (n.has(k)) n.delete(k);
            else n.add(k);
            return n;
        });
    const jumpIds = [...s.boxes.map((b) => String(b.n)), ...(s.ending.length ? ["end"] : [])];
    const register = useCallback((id: string, el: HTMLElement | null) => {
        if (el) sections.current.set(id, el);
        else sections.current.delete(id);
    }, []);

    // The tab for the picture being read lights up as the page scrolls past it.
    useEffect(() => {
        if (!("IntersectionObserver" in window)) return;
        const seen = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) if (entry.isIntersecting) setOn(entry.target.id.replace("sr-box-", ""));
            },
            { rootMargin: "-35% 0px -60% 0px" },
        );
        sections.current.forEach((el) => seen.observe(el));
        /* The last section is too short to reach the middle of the screen: at the foot of the page it
           is the one being read. */
        const atFoot = () => {
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && jumpIds.length) setOn(jumpIds[jumpIds.length - 1]);
        };
        window.addEventListener("scroll", atFoot, { passive: true });
        return () => {
            seen.disconnect();
            window.removeEventListener("scroll", atFoot);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [s.slug]);
    useEffect(() => {
        tabs.current?.querySelector<HTMLElement>(`[data-jump="${CSS.escape(on)}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }, [on]);
    // A new Sraith starts at the top, with nothing playing.
    useEffect(() => {
        window.scrollTo({ top: 0 });
        setPeeks(new Set());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [s.slug]);

    const jump = (id: string) => {
        setOn(id);
        document.getElementById(`sr-box-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div>
            <header>
                <Link to={basePath} className="inline-flex items-center gap-0.5 text-sm font-bold text-tertiary hover:text-primary">
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    <span>Sraith Pictiúr</span>
                </Link>
                <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-sm text-tertiary tabular-nums">
                            Sraith {srTwo(s.n)} of {srTwo(s.total)}
                        </p>
                        <h1 lang="ga" className="text-display-xs font-bold tracking-tight text-primary md:text-display-sm">
                            {s.title}
                        </h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-tertiary">English</span>
                            <Segmented size="sm" itemClassName="min-h-10 md:min-h-0" label="English" value={prefs.english ? "show" : "hide"} onChange={(v) => update({ english: v === "show" })} items={[{ id: "show", label: "Show" }, { id: "hide", label: "Hide" }]} />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-tertiary">Speed</span>
                            <Segmented size="sm" itemClassName="min-h-10 md:min-h-0" label="Speed" value={prefs.slow ? "slow" : "normal"} onChange={(v) => update({ slow: v === "slow" })} items={[{ id: "normal", label: "Normal" }, { id: "slow", label: "Slow" }]} />
                        </div>
                    </div>
                </div>
            </header>

            <nav ref={tabs} aria-label="Pictures" className="sticky top-16 z-20 mt-6 flex items-center gap-0.5 overflow-x-auto border-b-2 border-secondary bg-primary scrollbar-hide">
                <span className="shrink-0 pr-2 text-xs text-quaternary">Pictiúr</span>
                {jumpIds.map((id) => (
                    <a
                        key={id}
                        href={`#sr-box-${id}`}
                        data-jump={id}
                        onClick={(e) => {
                            e.preventDefault();
                            jump(id);
                        }}
                        className={cx("relative shrink-0 px-2.5 py-3 text-sm font-bold tabular-nums transition-colors duration-150", id === "end" && "ml-2", on === id ? "text-primary after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-brand-solid" : "text-quaternary hover:text-primary")}
                    >
                        {id === "end" ? "Críoch" : id}
                    </a>
                ))}
            </nav>
            {!prefs.english && <p className="mt-3 text-xs text-quaternary">The English is hidden. Tap a line to reveal it.</p>}

            {s.boxes.map((b) => (
                <SrSection key={b.n} id={String(b.n)} label={`Pictiúr ${b.n}`} lines={b.sentences} keyPrefix={String(b.n)} image={b.image} n={b.n} english={prefs.english} peeks={peeks} togglePeek={togglePeek} player={player} onZoom={(src, n) => setZoom({ src, n })} register={register} />
            ))}
            {s.ending.length > 0 && <SrSection id="end" label="Críoch" lines={s.ending} keyPrefix="end" image={null} n={0} english={prefs.english} peeks={peeks} togglePeek={togglePeek} player={player} onZoom={() => undefined} register={register} />}

            <nav aria-label="Other Sraith" className="flex justify-between gap-5 pt-8 pb-2">
                {s.prev ? (
                    <Link to={`${basePath}/${encodeURIComponent(s.prev.slug)}`} className="group flex max-w-[48%] flex-col gap-1 text-left">
                        <span className="text-xs text-quaternary">Previous</span>
                        <strong lang="ga" className="text-md font-bold text-primary transition duration-100 group-hover:text-brand-secondary">
                            {s.prev.title}
                        </strong>
                    </Link>
                ) : (
                    <span />
                )}
                {s.next ? (
                    <Link to={`${basePath}/${encodeURIComponent(s.next.slug)}`} className="group ml-auto flex max-w-[48%] flex-col items-end gap-1 text-right">
                        <span className="text-xs text-quaternary">Next</span>
                        <strong lang="ga" className="text-md font-bold text-primary transition duration-100 group-hover:text-brand-secondary">
                            {s.next.title}
                        </strong>
                    </Link>
                ) : (
                    <span />
                )}
            </nav>

            <DuoDialog open={Boolean(zoom)} onClose={() => setZoom(null)} title={zoom ? `Pictiúr ${zoom.n}` : ""} sub={s.title} className="max-w-3xl">
                {zoom && <img src={zoom.src} alt={`Pictiúr ${zoom.n}`} className="mx-auto block h-auto max-h-[min(72vh,760px)] w-auto max-w-full rounded-xl" />}
                <div className="mt-5 flex justify-end">
                    <DuoButton size="sm" onPress={() => setZoom(null)}>
                        Close
                    </DuoButton>
                </div>
            </DuoDialog>
        </div>
    );
};

/* ---- the page ------------------------------------------------------------------------------ */

const Body = ({ slug, basePath }: { slug: string | undefined; basePath: string }) => {
    const index = useCached<{ sraith: SrSummary[] }>("index", "/api/sraith");
    const story = useCached<SrStory>(slug ? `s:${slug}` : "none", slug ? `/api/sraith/s/${encodeURIComponent(slug)}` : "");
    const err = slug ? story.error : index.error;
    if (err) return <Empty icon={Stars02} title="The Sraith did not open" note={err} />;
    if (slug) return story.data ? <SraithStory s={story.data} basePath={basePath} /> : <p className="py-12 text-center text-sm text-quaternary">Opening the Sraith…</p>;
    return index.data ? <SraithIndex list={index.data.sraith} basePath={basePath} /> : <p className="py-12 text-center text-sm text-quaternary">Loading the Sraith…</p>;
};

export const SraithPage = ({ basePath }: { basePath: string }) => {
    const params = useParams();
    const slug = params.slug || params.id;
    const me = useMe();
    const inConsole = basePath.startsWith("/teach");
    if (me === undefined)
        return inConsole ? (
            <p className="text-sm text-quaternary">Loading…</p>
        ) : (
            <Page>
                <p className="text-sm text-quaternary">Loading…</p>
            </Page>
        );
    if (!me) return <SignInCard next={slug ? `${basePath}/${encodeURIComponent(slug)}` : basePath} title="Sign in to read the Sraith" note="The Sraith Pictiúr are for students on the Irish for Primary Teaching course. Sign in first." />;
    // The console provides the Page; the index gets its heading, a story draws its own header.
    if (inConsole)
        return (
            <>
                {!slug && <SectionHead kicker="Revision" title="Sraith Pictiúr" sub="The picture stories from the course book, with every sentence read aloud." />}
                <Body slug={slug} basePath={basePath} />
            </>
        );
    return (
        <Page wide={Boolean(slug)}>
            {!slug && <PageHeader icon={<BookOpen01 aria-hidden="true" className="size-8 text-brand-secondary" />} kicker="Revision" title="Sraith Pictiúr" sub="The picture stories from the course book, with every sentence read aloud." />}
            <Body slug={slug} basePath={basePath} />
        </Page>
    );
};
