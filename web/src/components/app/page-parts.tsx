// Pieces every page shares: the page header, empty states, and a list of questions grouped by exam
// year with a sticky year bar that follows your scroll.
import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

/** Props for a short rise-and-fade on the nth item of a list, so content settles in a soft stagger. */
export const reveal = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.32, delay: Math.min(i, 6) * 0.06, ease: [0.2, 0.8, 0.2, 1] as const },
});
import { Segmented } from "./segmented";
import { useLocation } from "react-router";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { type Question, yearKey } from "@/lib/data";
import { cx } from "@/utils/cx";
import { QuestionCard } from "./question-card";

export const Page = ({ children, wide }: { children: ReactNode; wide?: boolean }) => {
    const { pathname } = useLocation();
    return (
        <motion.div
            key={pathname.startsWith("/t/") ? pathname.split("/").slice(0, 3).join("/") : pathname}  // a topic's tabs swap in place, no page re-entry
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className={cx("mx-auto w-full px-4 pt-6 pb-12 md:px-10 md:pt-10 lg:pb-20", wide ? "max-w-container" : "max-w-5xl")}
        >
            {children}
        </motion.div>
    );
};

/* The icon and the caps line above the title are accepted but not drawn: the sidebar already
   carries the icon and the caps line repeated it on every inner page. */
export const PageHeader = ({ title, sub, actions, children }: { icon?: ReactNode; kicker?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) => (
    <header className="mb-10 flex flex-col gap-5 border-b-2 border-secondary pb-8 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0 flex-1">
            <h1 className="text-display-xs font-bold tracking-tight text-primary md:text-display-sm">{title}</h1>
            {sub && <p className="mt-3 max-w-2xl text-md leading-7 text-tertiary md:text-lg md:leading-8">{sub}</p>}
            {children}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-3 md:pb-1">{actions}</div>}
    </header>
);

export const Empty = ({ icon, title, note, children }: { icon: FC<{ className?: string }>; title: string; note: ReactNode; children?: ReactNode }) => (
    <EmptyState size="md" className="py-16">
        <EmptyState.Header pattern="circle">
            <EmptyState.FeaturedIcon icon={icon} color="gray" theme="modern" />
        </EmptyState.Header>
        <EmptyState.Content>
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            <EmptyState.Description>{note}</EmptyState.Description>
        </EmptyState.Content>
        {children && <EmptyState.Footer>{children}</EmptyState.Footer>}
    </EmptyState>
);

/** The row of years (or topics) pinned while you scroll: a track with one pill that slides to the one you're reading. */
export const JumpBar = ({ items, label, className }: { items: { id: string; label: ReactNode; aria?: string }[]; label: string; className?: string }) => {
    const [cur, setCur] = useState<string | undefined>(items[0]?.id);
    const bar = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const spy = () => {
            const line = (bar.current?.getBoundingClientRect().bottom || 0) + 24;
            let on: string | undefined = items[0]?.id;
            for (const it of items) {
                const el = document.getElementById(it.id);
                if (el && el.getBoundingClientRect().top <= line) on = it.id;
            }
            if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) on = items.at(-1)?.id;
            setCur(on);
        };
        spy();
        addEventListener("scroll", spy, { passive: true });
        return () => removeEventListener("scroll", spy);
    }, [items]);
    useEffect(() => {
        const b = bar.current?.querySelector<HTMLElement>(`[data-k="${cur}"]`);
        if (b && bar.current) bar.current.scrollTo({ left: b.offsetLeft - bar.current.clientWidth / 2 + b.clientWidth / 2, behavior: "smooth" });
    }, [cur]);
    if (items.length < 4) return null;
    return (
        <div className={cx("py-2", className)}>
            <nav ref={bar} aria-label={label} className="-mx-2 min-w-0 overflow-x-auto px-2 scrollbar-hide [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)]">
                <Segmented
                    label={label}
                    value={cur || items[0].id}
                    items={items}
                    plain
                    itemClassName="px-2.5 py-1.5"
                    className="min-w-full gap-1"
                    onChange={(id) => {
                        const el = document.getElementById(id);
                        if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - (bar.current?.getBoundingClientRect().bottom || 0) - 12, behavior: "smooth" });
                    }}
                />
            </nav>
        </div>
    );
};

/** Questions grouped under a heading per exam sitting. `head` is pinned above them with the year bar. */
export const YearGroups = ({ list, head }: { list: Question[]; head?: ReactNode }) => {
    const groups: { k: string; year: number; deferred: boolean; qs: Question[] }[] = [];
    for (const q of list) {
        const k = yearKey(q);
        if (!groups.length || groups.at(-1)!.k !== k) groups.push({ k, year: q.year, deferred: q.deferred, qs: [] });
        groups.at(-1)!.qs.push(q);
    }
    const items = groups.map((g) => ({
        id: `y-${g.k}`,
        aria: `${g.year}${g.deferred ? " deferred" : ""}`,
        label: (
            <>
                {g.year}
                {g.deferred && <span className="ml-0.5 text-xs text-warning-primary">D</span>}
            </>
        ),
    }));
    return (
        <>
            <div className="sticky top-16 z-20 -mx-4 mb-8 border-b-2 border-secondary bg-primary px-4 md:-mx-8 md:px-8">
                {head}
                <JumpBar items={items} label="Jump to a year" />
            </div>
            {/* the questions keep the paper's reading width even when the page around them is wider */}
            <div className="mx-auto max-w-[960px]">
            {groups.map((g, gi) => (
                <motion.section key={g.k} id={`y-${g.k}`} className="mb-16 scroll-mt-48" aria-labelledby={`yh-${g.k}`} {...reveal(gi)}>
                    <div className="mb-5 flex items-baseline gap-3">
                        <h2 id={`yh-${g.k}`} className="text-display-xs font-bold text-primary tabular-nums">
                            {g.year}
                        </h2>
                        {g.deferred && <span className="text-sm font-semibold text-warning-primary">Deferred exam</span>}
                        <span className="ml-auto text-sm text-tertiary">
                            {g.qs.length} question{g.qs.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    {g.qs.map((q) => (
                        <QuestionCard key={q.id} q={q} />
                    ))}
                </motion.section>
            ))}
            </div>
        </>
    );
};
