// Past papers: every whole SEC paper, marking scheme and full listening recording, by sitting.
// Laid out like Studyclix's papers page (choose exam, subject and level, then a table per year).
import { useEffect, useState } from "react";
import { Headphones01, PauseCircle } from "@/components/app/ic";
import { useSearchParams } from "react-router";
import { Page, PageHeader } from "@/components/app/page-parts";
import { Badge } from "@/components/base/badges/badges";
import { DuoButton } from "@/components/app/duo";
import { DuoFolder } from "@/components/app/duo-icons";
import { DuoSelect } from "@/components/app/duo-select";
import { type PaperFile, type Sitting, loadPapers } from "@/lib/data";
import { cx } from "@/utils/cx";
import { Segmented } from "@/components/app/segmented";

/** A first-page thumbnail that opens the PDF. */
const Thumb = ({ f, what, label }: { f?: PaperFile; what: string; label: string }) =>
    f ? (
        <a
            href={f.pdf}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${what} (PDF, ${f.pages} pages)`}
            className="group flex w-fit items-center gap-3 rounded-lg outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
        >
            <img src={f.thumb} alt="" loading="lazy" className="h-18 w-14 rounded-sm bg-white object-cover object-top shadow-xs ring-1 ring-secondary transition duration-100 ease-linear group-hover:shadow-md group-hover:ring-primary" />
            <span className="flex flex-col">
                <span className="text-sm font-semibold text-secondary group-hover:text-primary group-hover:underline">
                    <span className="md:hidden">{label}</span>
                    <span className="max-md:hidden">Open PDF</span>
                </span>
                <span className="text-xs text-tertiary">{f.pages} pages</span>
            </span>
        </a>
    ) : (
        <span className="text-sm text-quaternary">
            <span className="md:hidden">{label}: </span>Not published
        </span>
    );

export const PapersPage = () => {
    const [all, setAll] = useState<Sitting[] | null>(null);
    const [sp, setSp] = useSearchParams();
    const [playing, setPlaying] = useState<string | null>(null);
    useEffect(() => {
        loadPapers().then(setAll);
    }, []);
    const tab = sp.get("show") || "all", year = sp.get("year") || "";
    const put = (k: string, v: string, def: string) => {
        const n = new URLSearchParams(sp);
        v === def ? n.delete(k) : n.set(k, v);
        setSp(n, { replace: true });
    };

    const sittings = (all || []).filter((s) => (tab === "all" || (tab === "def") === s.deferred) && (!year || String(s.year) === year));
    const years = [...new Set((all || []).map((s) => s.year))];

    return (
        <Page>
            <PageHeader icon={<DuoFolder aria-hidden="true" className="size-14" />} kicker="Leaving Certificate · Higher Level Irish" title="Past papers" sub="Every Leaving Certificate Higher Level Irish paper and marking scheme from the State Examinations Commission, with the full listening recordings." />

            {!all ? (
                <p className="py-16 text-center text-sm text-tertiary">Loading papers…</p>
            ) : (
                <>
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <h2 className="text-xl font-semibold text-primary">
                            {sittings.reduce((n, s) => n + s.rows.length, 0)} papers{" "}
                            <span className="font-normal text-tertiary tabular-nums">
                                ({Math.min(...years)}–{Math.max(...years)})
                            </span>
                        </h2>
                        <DuoSelect
                            label="Year"
                            placement="bottom right"
                            value={year || "all"}
                            onChange={(k) => put("year", k.replace("all", ""), "")}
                            className={cx("w-44 py-2", year && "border-brand bg-brand-primary text-brand-secondary")}
                            items={[{ id: "all", label: "All years" }, ...years.map((y) => ({ id: String(y), label: String(y) }))]}
                        />
                    </div>

                    <Segmented
                        ghost
                        size="md"
                        itemClassName="px-4 py-2.5 duo-label"
                        label="Which sittings"
                        value={tab}
                        onChange={(k) => put("show", k, "all")}
                        className="mb-8"
                        items={[
                            { id: "all", label: "All" },
                            { id: "state", label: "June exams" },
                            { id: "def", label: "Deferred exams" },
                        ]}
                    />

                    {sittings.map((s) => (
                        <section key={s.key} aria-labelledby={`py-${s.key}`} className="mb-10">
                            <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-4 border-b-2 border-secondary pb-3 md:grid-cols-[minmax(0,1.3fr)_1fr_1fr_1fr]">
                                <h3 id={`py-${s.key}`} className="text-display-xs font-semibold text-primary tabular-nums">
                                    {s.year}
                                    {s.deferred && <span className="ml-2 text-md font-semibold text-warning-primary">Deferred</span>}
                                </h3>
                                <p className="hidden text-sm font-medium text-tertiary md:block">Exam paper</p>
                                <p className="hidden text-sm font-medium text-tertiary md:block">Marking scheme</p>
                                <p className="hidden text-sm font-medium text-tertiary md:block">Recording</p>
                            </div>
                            <ul className="divide-y divide-secondary">
                                {s.rows.map((r) => {
                                    const id = `${s.key}-${r.kind}`;
                                    return (
                                        <li key={r.kind} className="grid grid-cols-2 items-center gap-x-4 gap-y-3 py-4 md:grid-cols-[minmax(0,1.3fr)_1fr_1fr_1fr]">
                                            <div className="col-span-2 flex flex-col items-start gap-1.5 md:col-span-1">
                                                <p className="text-md font-semibold text-primary">{r.name}</p>
                                                <Badge size="sm" type="pill-color" color={s.deferred ? "warning" : "brand"}>
                                                    {s.deferred ? "Deferred exam" : "State exam"}
                                                </Badge>
                                            </div>
                                            <Thumb f={r.paper} what={`${s.year} ${r.name}`} label="Exam paper" />
                                            <Thumb f={r.scheme} what={`${s.year} marking scheme`} label="Marking scheme" />
                                            <div className="col-span-2 md:col-span-1">
                                                {r.audio ? (
                                                    playing === id ? (
                                                        <div className="flex items-center gap-2">
                                                            <audio controls autoPlay src={r.audio} className="h-9 w-full min-w-0" aria-label={`${s.year} full listening recording`} />
                                                            <DuoButton color="ghost" size="xs" iconLeading={PauseCircle} ariaLabel="Close player" onPress={() => setPlaying(null)} />
                                                        </div>
                                                    ) : (
                                                        <DuoButton color="ghost" size="xs" iconLeading={Headphones01} onPress={() => setPlaying(id)}>
                                                            Full recording
                                                        </DuoButton>
                                                    )
                                                ) : r.kind !== "P2" && s.year >= 2009 ? (
                                                    <span className="text-sm text-quaternary">Recording not in the archive yet</span>
                                                ) : null}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </>
            )}
        </Page>
    );
};
