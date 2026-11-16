// One plan, three ways: the checklist ticked week by week, the builder that drags topics from the
// bank into weeks, and the topic list (what the course covers, by part of the exam, and whether
// each topic has found a week yet). Ported from planChecklistView / planBuilderView / planTopicsView
// and their bind functions in the old app.js.
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";
import { DuoButton, DuoProgress } from "@/components/app/duo";
import { DuoDialog, DuoInput, FieldLabel } from "@/components/app/duo-dialog";
import { toast } from "@/components/app/toast";
import { api } from "@/lib/portal";
import { EXAM_GROUPS, type Plan, type PlanItem, type PlanWeek, type TopicBank, type TopicCost, catTone, fmtDate, loadPlan, planPercent, plural } from "@/lib/teach-courses";
import { cx } from "@/utils/cx";

/* ---- small shared pieces (also used by the course editor and the Zoom import) ---- */

/** A native select in the app's chunky style. Native because these sit on every row of long lists and must work on a phone. */
export const Pick = ({ value, onChange, children, ariaLabel, disabled, className, title }: { value: string; onChange: (v: string) => void; children: ReactNode; ariaLabel: string; disabled?: boolean; className?: string; title?: string }) => (
    <select
        aria-label={ariaLabel}
        title={title}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cx("max-w-full rounded-xl border-2 border-secondary bg-primary px-3 py-2 text-sm font-bold text-primary outline-hidden transition duration-100 ease-linear focus:border-brand disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
        {children}
    </select>
);

/** The small coloured category pill. */
export const Chip = ({ tone, children, className }: { tone: string; children: ReactNode; className?: string }) => (
    <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", tone, className)}>{children}</span>
);

/** The red banner the old app put at the top of a dialog that was about to lose something. */
export const Banner = ({ children }: { children: ReactNode }) => <div className="rounded-xl bg-error-primary px-4 py-3 text-sm font-bold text-error-primary">{children}</div>;

/** A plain checkbox row (the old `.check-row`). */
export const CheckRow = ({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) => (
    <label className={cx("flex items-start gap-2.5 text-sm font-medium text-secondary", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
        <span>{children}</span>
    </label>
);

/** A link that downloads a file, drawn as the secondary button. A plain anchor because the router would otherwise try to open the CSV as a page. */
export const DownloadLink = ({ href, children }: { href: string; children: ReactNode }) => (
    <a
        href={href}
        download
        className="inline-flex h-10.5 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-b-4 border-secondary bg-primary px-3.5 text-[13px] leading-none font-bold tracking-[0.8px] text-brand-secondary uppercase outline-focus-ring transition duration-100 ease-linear select-none hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0.5 active:border-b-2"
    >
        {children}
    </a>
);

/* Bold and italics without ever putting anybody's HTML on the page: the two markers are turned into
   elements, everything else stays text. `**` before `*`, and neither crosses a line. Same rules as
   the old richText. */
export const RichText = ({ text, className }: { text: string; className?: string }) => {
    const nodes: ReactNode[] = [];
    const re = /\*\*([^*\n]+)\*\*|(^|[^*])\*([^*\n]+)\*(?!\*)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(text))) {
        if (m[1] !== undefined) {
            if (m.index > last) nodes.push(text.slice(last, m.index));
            nodes.push(<strong key={k++}>{m[1]}</strong>);
        } else {
            const start = m.index + m[2].length;
            if (start > last) nodes.push(text.slice(last, start));
            nodes.push(<em key={k++}>{m[3]}</em>);
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return <p className={cx("text-sm whitespace-pre-line text-secondary", className)}>{nodes}</p>;
};

/* ---- dragging items about, in whichever view is on screen ----
   The checklist and the builder draw the same weeks differently, so they share the dragging. A
   dragged row moves with the cursor (the local copy of the weeks is rearranged as it goes), so
   what is on screen during the drag is what the week will look like after it. The server is then
   told the whole order of the week the drop landed in. */
type Drag = { kind: "item" | "topic"; id: string };

const moveItem = (weeks: PlanWeek[], itemId: string, toWeekId: string, beforeId: string | null): PlanWeek[] => {
    let item: PlanItem | undefined;
    for (const w of weeks) item = item ?? w.items.find((i) => i.id === itemId);
    if (!item) return weeks;
    const target = weeks.find((w) => w.id === toWeekId);
    if (!target) return weeks;
    const rest = target.items.filter((i) => i.id !== itemId);
    const at = beforeId ? rest.findIndex((i) => i.id === beforeId) : rest.length;
    const index = at < 0 ? rest.length : at;
    if (target.items[index]?.id === itemId && target.items.length === rest.length + 1) return weeks; // already there
    const next = [...rest];
    next.splice(index, 0, item);
    return weeks.map((w) => (w.id === toWeekId ? { ...w, items: next } : { ...w, items: w.items.filter((i) => i.id !== itemId) }));
};

/** Which row a drop at this height lands above, or null for the end. */
const dropBefore = (list: HTMLElement, y: number): string | null => {
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-item]:not([data-dragging="true"])'));
    const row = rows.find((r) => {
        const box = r.getBoundingClientRect();
        return y < box.top + box.height / 2;
    });
    return row?.dataset.item ?? null;
};

const usePlanDrag = (plan: Plan, refresh: () => Promise<void>) => {
    const [weeks, setWeeks] = useState<PlanWeek[]>(plan.weeks);
    useEffect(() => setWeeks(plan.weeks), [plan]);
    const weeksRef = useRef(weeks);
    weeksRef.current = weeks;
    const drag = useRef<Drag | null>(null);
    const dropped = useRef(false);
    const [dragging, setDragging] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);

    const startItem = (e: DragEvent, itemId: string) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", `item:${itemId}`);
        drag.current = { kind: "item", id: itemId };
        dropped.current = false;
        setDragging(itemId);
    };
    const startTopic = (e: DragEvent, topicId: string) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", `topic:${topicId}`);
        drag.current = { kind: "topic", id: topicId };
        dropped.current = false;
        setDragging(topicId);
    };
    const end = () => {
        // A drag let go outside every week puts the rows back where they were.
        if (!dropped.current) setWeeks(plan.weeks);
        drag.current = null;
        setDragging(null);
        setOver(null);
    };
    const listOver = (e: DragEvent<HTMLElement>, weekId: string) => {
        e.preventDefault();
        setOver(weekId);
        const d = drag.current;
        if (!d || d.kind !== "item") return;
        const before = dropBefore(e.currentTarget, e.clientY);
        setWeeks((prev) => moveItem(prev, d.id, weekId, before));
    };
    const listLeave = (e: DragEvent<HTMLElement>, weekId: string) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === weekId ? null : o));
    };
    const listDrop = async (e: DragEvent<HTMLElement>, weekId: string) => {
        e.preventDefault();
        dropped.current = true;
        setOver(null);
        const payload = e.dataTransfer.getData("text/plain") || "";
        const week = weeksRef.current.find((w) => w.id === weekId);
        try {
            if (payload.startsWith("topic:")) {
                const before = dropBefore(e.currentTarget, e.clientY);
                const created = await api<{ id: string }>(`/api/admin/plan-weeks/${weekId}/items`, { method: "POST", json: { topicId: payload.slice(6) } });
                if (before && week) {
                    // It was added at the end, so say where it actually goes.
                    const ids = week.items.map((i) => i.id);
                    ids.splice(ids.indexOf(before), 0, created.id);
                    await api(`/api/admin/plan-weeks/${weekId}/order`, { method: "PUT", json: { itemIds: ids } });
                }
                await refresh();
                toast("Added to the plan");
            } else if (payload.startsWith("item:") && week) {
                await api(`/api/admin/plan-weeks/${weekId}/order`, { method: "PUT", json: { itemIds: week.items.map((i) => i.id) } });
                await refresh();
            }
        } catch (err) {
            toast((err as Error).message);
            await refresh();
        }
    };
    return { weeks, setWeeks, dragging, over, startItem, startTopic, end, listOver, listLeave, listDrop };
};

const Grip = ({ title }: { title?: string }) => (
    <span aria-hidden="true" title={title} className="-my-1.5 -ml-1 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-md leading-none text-quaternary select-none hover:bg-secondary active:cursor-grabbing">
        ⠿
    </span>
);

const dropZone = (on: boolean, empty: boolean) => cx("flex flex-col gap-1 rounded-xl transition-colors duration-100", empty && "min-h-12 border-2 border-dashed border-secondary", on && "bg-brand-primary/60 ring-2 ring-brand");

/* ---- the checklist ---- */

export const PlanChecklist = ({ plan, refresh, onPlan }: { plan: Plan; refresh: () => Promise<void>; onPlan: (p: Plan) => void }) => {
    const pct = planPercent(plan.progress.done, plan.progress.total);
    const d = usePlanDrag(plan, refresh);
    const [busyWeek, setBusyWeek] = useState<string | null>(null);

    /* Ticked one at a time and updated in place, so a plan of eighty items does not scroll back to
       the top on every tick. The counts at the top catch up from a fresh read of the plan. */
    const tick = async (item: PlanItem, wanted: boolean) => {
        const was = item.doneAt;
        d.setWeeks((prev) => prev.map((w) => ({ ...w, items: w.items.map((i) => (i.id === item.id ? { ...i, doneAt: wanted ? new Date().toISOString() : null } : i)) })));
        try {
            await api(`/api/admin/plan-items/${item.id}`, { method: "PATCH", json: { done: wanted } });
            try {
                onPlan(await loadPlan(plan.course_id));
            } catch {
                /* The tick itself is saved; the counts catch up on the next load. */
            }
        } catch (err) {
            d.setWeeks((prev) => prev.map((w) => ({ ...w, items: w.items.map((i) => (i.id === item.id ? { ...i, doneAt: was } : i)) })));
            toast((err as Error).message);
        }
    };

    const tickWeek = async (week: PlanWeek, done: boolean) => {
        setBusyWeek(week.id);
        try {
            for (const item of week.items) {
                if (Boolean(item.doneAt) === done) continue;
                await api(`/api/admin/plan-items/${item.id}`, { method: "PATCH", json: { done } });
            }
            await refresh();
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusyWeek(null);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-2xl border-2 border-secondary bg-primary p-5">
                <DuoProgress value={pct} className="h-5" />
                <p className="mt-3 text-sm text-tertiary">
                    {pct}% of the plan taught
                    {plan.starts_on ? ` · starts ${fmtDate(plan.starts_on, { dateStyle: "medium" })}` : ""}
                    {plan.break_start ? ` · break ${fmtDate(plan.break_start, { dateStyle: "short" })} to ${fmtDate(plan.break_end, { dateStyle: "short" })}` : ""}
                </p>
            </section>
            <div className="grid gap-4 md:grid-cols-2">
                {d.weeks.map((week) => {
                    const done = week.items.filter((i) => i.doneAt).length;
                    const all = week.items.length > 0 && done === week.items.length;
                    return (
                        <section key={week.id} className={cx("rounded-2xl border-2 bg-primary p-4", all ? "border-success-500/60" : "border-secondary")}>
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-md font-bold text-primary">{week.name}</p>
                                    <p className="text-xs font-semibold text-quaternary">{week.items.length ? `${done} of ${week.items.length}` : "Nothing scheduled"}</p>
                                </div>
                                {week.items.length > 0 && (
                                    <DuoButton size="xs" color="secondary" isDisabled={busyWeek === week.id} onPress={() => tickWeek(week, !all)}>
                                        {all ? "Clear week" : "Tick the week"}
                                    </DuoButton>
                                )}
                            </div>
                            {/* Always a list, even when the week is empty, so a week that has nothing in it is still somewhere a topic can be dragged to. */}
                            <ul data-week={week.id} onDragOver={(e) => d.listOver(e, week.id)} onDragLeave={(e) => d.listLeave(e, week.id)} onDrop={(e) => d.listDrop(e, week.id)} className={dropZone(d.over === week.id, week.items.length === 0)}>
                                {week.items.map((item) => (
                                    <li
                                        key={item.id}
                                        data-item={item.id}
                                        data-dragging={d.dragging === item.id ? "true" : undefined}
                                        draggable
                                        onDragStart={(e) => d.startItem(e, item.id)}
                                        onDragEnd={d.end}
                                        className={cx("flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-primary_hover", item.doneAt && "text-tertiary", d.dragging === item.id && "opacity-40")}
                                    >
                                        <Grip title="Drag this to another week" />
                                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                                            <input type="checkbox" checked={Boolean(item.doneAt)} onChange={(e) => tick(item, e.target.checked)} className="size-5 shrink-0 accent-brand-600" />
                                            <span className={cx("min-w-0 flex-1 text-sm font-semibold", item.doneAt ? "text-tertiary line-through decoration-secondary" : "text-primary")}>{item.title}</span>
                                        </label>
                                        <Chip tone={catTone(item.category)}>{item.category || ""}</Chip>
                                        {item.doneAt && (
                                            <span className="shrink-0 text-xs text-quaternary tabular-nums" title={`Ticked by ${item.doneBy || "somebody"}`}>
                                                {fmtDate(item.doneAt, { dateStyle: "short" })}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {week.items.length === 0 && <p className="mt-2 text-xs text-quaternary">Nothing here yet. Drag a topic in from another week.</p>}
                            {week.homework && (
                                <div className="mt-3 rounded-xl bg-secondary p-3">
                                    <p className="duo-label text-quaternary">Homework</p>
                                    <RichText text={week.homework} className="mt-1" />
                                </div>
                            )}
                            {week.notes && <RichText text={week.notes} className="mt-3 text-tertiary" />}
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

/* ---- the builder ---- */

/* The bank on the left, the weeks on the right, dragging between them. Every drag also has a plain
   control beside it (a week picker on a topic, a remove on an item) so the plan can still be built
   on a phone, where HTML5 dragging does nothing at all. */
export const PlanBuilder = ({ plan, bank, refresh }: { plan: Plan; bank: TopicBank | null; refresh: () => Promise<void> }) => {
    const d = usePlanDrag(plan, refresh);
    const [search, setSearch] = useState("");
    const [onlyFree, setOnlyFree] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const topics = useMemo(() => {
        const q = search.toLowerCase();
        return (bank?.topics ?? []).filter((t) => {
            if (onlyFree && t.weeks.length) return false;
            if (q && !t.title.toLowerCase().includes(q) && !String(t.category || "").toLowerCase().includes(q)) return false;
            return true;
        });
    }, [bank, search, onlyFree]);

    if (!bank)
        return (
            <div className="rounded-2xl border-2 border-secondary bg-primary p-5">
                <p className="text-sm text-quaternary">Loading the topics…</p>
            </div>
        );

    const addTo = async (topicId: string, weekId: string) => {
        if (!weekId) return;
        setBusy(topicId);
        try {
            await api(`/api/admin/plan-weeks/${weekId}/items`, { method: "POST", json: { topicId } });
            await refresh();
            toast("Added to the plan");
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusy(null);
        }
    };
    const remove = async (itemId: string) => {
        setBusy(itemId);
        try {
            await api(`/api/admin/plan-items/${itemId}`, { method: "DELETE" });
            await refresh();
            toast("Taken off the plan");
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-3 self-start rounded-2xl border-2 border-secondary bg-primary p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="text-md font-bold text-primary">Topic bank</p>
                    <p className="text-xs font-semibold text-quaternary">
                        {bank.counts.unscheduled} of {bank.counts.total} not on the plan
                    </p>
                </div>
                {/* Filtering is local to what is already loaded, so it redraws as it is typed without going near the server. */}
                <DuoInput value={search} onChange={setSearch} placeholder="Search the topics" ariaLabel="Search the topics" className="py-2.5 text-sm" />
                <CheckRow checked={onlyFree} onChange={setOnlyFree}>
                    Only the ones not scheduled
                </CheckRow>
                {topics.length ? (
                    <ul className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1">
                        {topics.map((t) => (
                            <li
                                key={t.id}
                                draggable
                                onDragStart={(e) => d.startTopic(e, t.id)}
                                onDragEnd={d.end}
                                className={cx("flex items-center gap-2 rounded-xl border-2 border-secondary px-2 py-2", t.weeks.length ? "bg-secondary" : "bg-primary", d.dragging === t.id && "opacity-40")}
                            >
                                <Grip />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-primary">{t.title}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                        <Chip tone={catTone(t.category)}>{t.category || ""}</Chip>
                                        {t.weeks.length > 0 && <span className="text-xs text-quaternary">{t.weeks.map((w) => w.name).join(", ")}</span>}
                                    </p>
                                </div>
                                {/* Dragging does nothing on a touch screen, so a topic can also be put into a week by picking one. */}
                                <Pick value="" onChange={(w) => addTo(t.id, w)} ariaLabel={`Put ${t.title} into a week`} title="Put this topic into a week" disabled={busy === t.id} className="w-24 px-2 py-1.5 text-xs">
                                    <option value="">Add to…</option>
                                    {plan.weeks.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.name}
                                        </option>
                                    ))}
                                </Pick>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="py-6 text-center text-sm text-quaternary">{search ? "Nothing matches that." : "Every topic is on the plan."}</p>
                )}
            </aside>

            <div className="grid gap-4 md:grid-cols-2">
                {d.weeks.map((week) => (
                    <section key={week.id} className="rounded-2xl border-2 border-secondary bg-primary p-4">
                        <div className="mb-3">
                            <p className="text-md font-bold text-primary">{week.name}</p>
                            <p className="text-xs font-semibold text-quaternary">{week.items.length ? plural(week.items.length, "topic") : "Nothing scheduled"}</p>
                        </div>
                        <ul data-week={week.id} onDragOver={(e) => d.listOver(e, week.id)} onDragLeave={(e) => d.listLeave(e, week.id)} onDrop={(e) => d.listDrop(e, week.id)} className={dropZone(d.over === week.id, week.items.length === 0)}>
                            {week.items.map((item) => (
                                <li
                                    key={item.id}
                                    data-item={item.id}
                                    data-dragging={d.dragging === item.id ? "true" : undefined}
                                    draggable
                                    onDragStart={(e) => d.startItem(e, item.id)}
                                    onDragEnd={d.end}
                                    className={cx("flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-primary_hover", item.doneAt && "text-tertiary", d.dragging === item.id && "opacity-40")}
                                >
                                    <Grip />
                                    <span className={cx("min-w-0 flex-1 text-sm font-semibold", item.doneAt ? "text-tertiary" : "text-primary")}>{item.title}</span>
                                    <Chip tone={catTone(item.category)}>{item.category || ""}</Chip>
                                    <AriaButton
                                        aria-label={`Take ${item.title} off the plan`}
                                        isDisabled={busy === item.id}
                                        onPress={() => remove(item.id)}
                                        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition hover:bg-error-primary hover:text-error-primary focus-visible:outline-2 disabled:opacity-50"
                                    >
                                        <X aria-hidden="true" className="size-4" />
                                    </AriaButton>
                                </li>
                            ))}
                        </ul>
                        {week.items.length === 0 && <p className="mt-2 text-xs text-quaternary">Drag a topic in here.</p>}
                    </section>
                ))}
            </div>
        </div>
    );
};

/* ---- the topic list ---- */

/* Everything the course covers, in the three parts of the exam, and whether it has found a week yet.
   The section a topic belongs to is a guess made from the original file, so it is a dropdown rather
   than a label. */
export const PlanTopics = ({ courseId, bank, refreshTopics }: { courseId: string; bank: TopicBank | null; refreshTopics: () => Promise<void> }) => {
    const [adding, setAdding] = useState<string | null>(null); // the exam group the new topic goes under
    const [cost, setCost] = useState<(TopicCost & { topicId: string }) | null>(null);

    if (!bank)
        return (
            <div className="rounded-2xl border-2 border-secondary bg-primary p-5">
                <p className="text-sm text-quaternary">Loading the topics…</p>
            </div>
        );

    const setGroup = async (topicId: string, examGroup: string) => {
        try {
            await api(`/api/admin/plan-topics/${topicId}`, { method: "PATCH", json: { examGroup } });
            await refreshTopics();
        } catch (err) {
            toast((err as Error).message);
            await refreshTopics(); // puts the select back to what the server has
        }
    };
    const askRemove = async (topicId: string) => {
        try {
            const c = await api<TopicCost>(`/api/admin/plan-topics/${topicId}/cost`);
            setCost({ ...c, topicId });
        } catch (err) {
            toast((err as Error).message);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-2xl border-2 border-secondary bg-primary px-5 py-4">
                <p className="text-sm text-tertiary">
                    {bank.counts.total} topics · {bank.counts.scheduled} on the plan · {bank.counts.unscheduled} still to place
                </p>
            </section>
            {bank.groups.map((group) => {
                const on = group.topics.filter((t) => t.weeks.length).length;
                return (
                    <section key={group.name} className="rounded-2xl border-2 border-secondary bg-primary p-4 md:p-5">
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-bold text-primary">{group.name}</h3>
                            <span className="text-xs font-semibold text-quaternary">
                                {on} of {group.topics.length} on the plan
                            </span>
                            <DuoButton size="xs" color="secondary" className="ml-auto" onPress={() => setAdding(group.name)}>
                                Add a topic
                            </DuoButton>
                        </div>
                        <ul className="divide-y-2 divide-secondary">
                            {group.topics.map((t) => {
                                const scheduled = t.weeks.length > 0;
                                return (
                                    <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 md:flex-nowrap">
                                        <span aria-hidden="true" className={cx("flex size-6 shrink-0 items-center justify-center rounded-full", scheduled ? "bg-brand-solid text-white" : "border-2 border-secondary")}>
                                            {scheduled && <Check className="size-3.5" />}
                                        </span>
                                        <span className="min-w-0 flex-1 text-sm font-semibold text-primary">{t.title}</span>
                                        <Chip tone={catTone(t.category)}>{t.category || ""}</Chip>
                                        <span className="w-full text-xs text-quaternary md:w-40 md:shrink-0 md:truncate" title={scheduled ? t.weeks.map((w) => w.name).join(", ") : undefined}>
                                            {scheduled ? t.weeks.map((w) => w.name).join(", ") : "Not scheduled"}
                                        </span>
                                        <Pick value={t.examGroup} onChange={(g) => setGroup(t.id, g)} ariaLabel={`Which part of the exam ${t.title} belongs to`} className="px-2 py-1.5 text-xs">
                                            {EXAM_GROUPS.map((name) => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                        </Pick>
                                        <AriaButton
                                            aria-label={`Take ${t.title} off the course`}
                                            onPress={() => askRemove(t.id)}
                                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition hover:bg-error-primary hover:text-error-primary focus-visible:outline-2"
                                        >
                                            <X aria-hidden="true" className="size-4" />
                                        </AriaButton>
                                    </li>
                                );
                            })}
                        </ul>
                        {group.topics.length === 0 && <p className="text-xs text-quaternary">Nothing in this part of the exam yet.</p>}
                    </section>
                );
            })}
            <AddTopicDialog courseId={courseId} examGroup={adding} categories={[...new Set(bank.topics.map((t) => t.category).filter((c): c is string => Boolean(c)))].sort()} onClose={() => setAdding(null)} onAdded={refreshTopics} />
            <RemoveTopicDialog cost={cost} onClose={() => setCost(null)} onRemoved={refreshTopics} />
        </div>
    );
};

/* A topic the packaged plan did not know about. It goes into the bank without a week, which is
   where the builder picks it up from. */
const AddTopicDialog = ({ courseId, examGroup, categories, onClose, onAdded }: { courseId: string; examGroup: string | null; categories: string[]; onClose: () => void; onAdded: () => Promise<void> }) => {
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("");
    const [group, setGroup] = useState("Oral");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (examGroup) {
            setTitle("");
            setCategory("");
            setGroup(examGroup);
            setBusy(false);
        }
    }, [examGroup]);
    const save = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await api(`/api/admin/plans/${courseId}/topics`, { method: "POST", json: { title: title.trim(), category: category.trim() || undefined, examGroup: group } });
            onClose();
            await onAdded();
            toast("Topic added");
        } catch (err) {
            setBusy(false);
            toast((err as Error).message);
        }
    };
    return (
        <DuoDialog open={Boolean(examGroup)} onClose={onClose} title="Add a topic" sub={`It goes onto the course under ${examGroup ?? ""}, with no week yet.`}>
            <div className="flex flex-col gap-4">
                <div>
                    <FieldLabel>What is it called?</FieldLabel>
                    {/* Typing a name and pressing return is the whole job, so let it be. */}
                    <DuoInput value={title} onChange={setTitle} maxLength={160} placeholder="Cluastuiscint: Fógra" ariaLabel="What is it called?" autoFocus onEnter={save} />
                </div>
                <div>
                    <FieldLabel>Category</FieldLabel>
                    <input
                        list="plan-categories"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        maxLength={60}
                        placeholder="Oral, Grammar, Aiste…"
                        autoComplete="off"
                        aria-label="Category"
                        className="w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden focus:border-brand"
                    />
                    <datalist id="plan-categories">
                        {categories.map((name) => (
                            <option key={name} value={name} />
                        ))}
                    </datalist>
                    <p className="mt-1.5 text-xs text-quaternary">Only for the colour beside it. Leave it blank if none of them fit.</p>
                </div>
                <div>
                    <FieldLabel>Part of the exam</FieldLabel>
                    <Pick value={group} onChange={setGroup} ariaLabel="Part of the exam" className="w-full px-4 py-3 text-md">
                        {EXAM_GROUPS.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </Pick>
                </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={save} isDisabled={busy}>
                    Add it
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* Removing a topic takes it out of every week it was in, which is a different thing from the
   builder's remove, and worth saying before it happens. */
const RemoveTopicDialog = ({ cost, onClose, onRemoved }: { cost: (TopicCost & { topicId: string }) | null; onClose: () => void; onRemoved: () => Promise<void> }) => {
    const [busy, setBusy] = useState(false);
    useEffect(() => setBusy(false), [cost]);
    const weeks = cost?.scheduled === 1 ? "one week" : `${cost?.scheduled ?? 0} weeks`;
    const remove = async () => {
        if (!cost) return;
        setBusy(true);
        try {
            await api(`/api/admin/plan-topics/${cost.topicId}?confirmDone=${cost.done}`, { method: "DELETE" });
            onClose();
            await onRemoved();
            toast("Topic removed");
        } catch (err) {
            setBusy(false);
            toast((err as Error).message);
        }
    };
    return (
        <DuoDialog open={Boolean(cost)} onClose={onClose} title={`Remove ${cost?.title ?? ""}?`} sub={cost?.scheduled ? `It is on the plan in ${weeks}.` : "It is not scheduled in any week."}>
            {cost?.done ? (
                <>
                    <Banner>
                        It is ticked off in {cost.done} week{cost.done === 1 ? "" : "s"}.
                    </Banner>
                    <p className="mt-3 text-sm text-tertiary">Removing it takes it out of {weeks} and loses the record of having taught it. Export the checklist first if that matters.</p>
                </>
            ) : cost?.scheduled ? (
                <p className="text-sm text-tertiary">It comes out of {weeks} as well as off the course. Nothing has been ticked off, so there is nothing to lose.</p>
            ) : (
                <p className="text-sm text-tertiary">It is only in the bank, so nothing on the plan changes.</p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton color="danger" size="sm" onPress={remove} isDisabled={busy}>
                    {cost?.done ? `Remove and lose ${cost.done} tick${cost.done === 1 ? "" : "s"}` : "Remove"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
