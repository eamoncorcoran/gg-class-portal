// One segmented control for the whole app: a grey track with a single white pill that glides to the
// chosen option. The pill is measured and moved with a CSS transition, so it never jumps.
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/utils/cx";

export type SegItem<K extends string> = { id: K; label: ReactNode; aria?: string };

export const Segmented = <K extends string>({
    value,
    onChange,
    items,
    label,
    size = "sm",
    fullWidth,
    className,
    itemClassName,
    ghost,
    plain,
}: {
    value: K;
    onChange: (k: K) => void;
    items: SegItem<K>[];
    label: string;
    size?: "xs" | "sm" | "md";
    fullWidth?: boolean;
    className?: string;
    itemClassName?: string;
    /** no track: just the labels with a bordered brand chip under the chosen one (Duolingo style) */
    ghost?: boolean;
    /** no track and no chip: the chosen label is simply the brand colour */
    plain?: boolean;
}) => {
    const track = useRef<HTMLDivElement>(null);
    const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
    const measure = useCallback(() => {
        const el = track.current?.querySelector<HTMLElement>(`[data-k="${CSS.escape(value)}"]`);
        if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    }, [value]);
    useLayoutEffect(measure, [measure, items.length]);
    useEffect(() => {
        addEventListener("resize", measure);
        document.fonts?.ready.then(measure);
        return () => removeEventListener("resize", measure);
    }, [measure]);

    const pad = size === "md" ? "p-1.5" : "p-1";
    const btn = size === "md" ? "px-3.5 py-2 text-sm" : size === "sm" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs";

    return (
        <div
            ref={track}
            role="radiogroup"
            aria-label={label}
            className={cx("relative isolate inline-flex max-w-full gap-0.5 overflow-x-auto scrollbar-hide", ghost || plain ? "p-0" : cx("rounded-xl border-2 border-secondary bg-secondary_alt", pad), fullWidth && "flex w-full", className)}
        >
            {pill && !plain && (
                <span
                    aria-hidden="true"
                    className={cx(
                        "absolute left-0 -z-1 rounded-lg transition-[transform,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
                        ghost ? "inset-y-0 rounded-xl border-2 border-brand bg-brand-primary" : cx("bg-primary_alt shadow-sm ring-2 ring-secondary", size === "md" ? "inset-y-1.5" : "inset-y-1"),
                    )}
                    style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
                />
            )}
            {items.map((it) => {
                const on = it.id === value;
                return (
                    <button
                        key={it.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={it.aria}
                        data-k={it.id}
                        onClick={() => onChange(it.id)}
                        className={cx(
                            "relative font-bold whitespace-nowrap tabular-nums outline-focus-ring transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2",
                            btn,
                            ghost || plain ? "rounded-xl" : "rounded-lg",
                            fullWidth ? "min-w-0 flex-1" : "shrink-0",
                            on ? (ghost || plain ? "text-brand-secondary" : "text-secondary") : plain ? "text-quaternary hover:text-tertiary" : "text-quaternary hover:text-secondary",
                            itemClassName,
                        )}
                    >
                        {it.label}
                    </button>
                );
            })}
        </div>
    );
};
