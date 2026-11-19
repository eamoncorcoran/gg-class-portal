// Duolingo desktop controls: the chunky button with a 4px lip that presses flat, in the five colours
// Duolingo uses (filled primary, white-with-grey-border secondary, borderless ghost, red danger, a
// locked grey), plus a card with a 2px border.
import { type FC, type ReactNode } from "react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { cx } from "@/utils/cx";

type Icon = FC<{ className?: string }>;

const base =
    "group/btn relative inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-b-4 text-[15px] leading-none font-bold tracking-[0.8px] uppercase outline-focus-ring transition-[transform,border-width,background-color,color,filter] duration-100 ease-linear select-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed data-disabled:cursor-not-allowed";
// pressed: the lip disappears and the face drops by its height, so the button looks pushed in
const press = "active:translate-y-0.5 active:border-b-2 pressed:translate-y-0.5 pressed:border-b-2";
const colors = {
    primary: "border-transparent border-b-brand-700 bg-brand-500 text-white hover:brightness-105 disabled:border-transparent disabled:bg-secondary disabled:text-disabled data-disabled:border-transparent data-disabled:bg-secondary data-disabled:text-disabled",
    secondary: "border-secondary bg-primary text-brand-secondary hover:bg-primary_hover disabled:text-disabled data-disabled:text-disabled",
    ghost: "border-transparent border-b-2 bg-transparent text-brand-secondary hover:bg-brand-primary active:translate-y-0 pressed:translate-y-0 disabled:text-disabled data-disabled:text-disabled",
    danger: "border-transparent border-b-error-700 bg-error-solid text-white hover:brightness-105 disabled:border-transparent disabled:bg-secondary disabled:text-disabled",
    muted: "border-transparent border-b-gray-300 bg-secondary text-quaternary hover:bg-secondary_hover",
};
const sizes = { xs: "h-9 px-3 text-xs", sm: "h-10.5 px-3.5 text-[13px]", md: "h-[50px] px-4", lg: "h-14 px-6 text-md" };
const iconSize = { xs: "size-4", sm: "size-4.5", md: "size-5", lg: "size-6" };

export type DuoButtonProps = {
    color?: keyof typeof colors;
    size?: keyof typeof sizes;
    href?: string;
    className?: string;
    children?: ReactNode;
    onPress?: () => void;
    isDisabled?: boolean;
    full?: boolean;
    ariaLabel?: string;
    iconLeading?: Icon;
    iconTrailing?: Icon;
    type?: "button" | "submit";
    /** Waiting on something slow (the marker, an upload): three bouncing dots, the label stays, the button cannot be pressed again. */
    isLoading?: boolean;
};

/** Three dots that bounce in turn, the Duolingo "thinking" mark. */
export const Dots = ({ className }: { className?: string }) => (
    <span aria-hidden="true" className={cx("inline-flex items-end gap-1", className)}>
        {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 120}ms`, animationDuration: "900ms" }} />
        ))}
    </span>
);

export const DuoButton = ({ color = "primary", size = "md", href, className, children, onPress, isDisabled, full, ariaLabel, iconLeading: L, iconTrailing: T, type = "button", isLoading }: DuoButtonProps) => {
    const cls = cx(base, color !== "ghost" && press, colors[color], sizes[size], full && "flex w-full", !children && "px-0 aspect-square", isLoading && "cursor-progress translate-y-0.5 border-b-2 brightness-95", className);
    const inner = (
        <>
            {isLoading ? <Dots /> : L && <L aria-hidden="true" className={cx(iconSize[size], "shrink-0")} />}
            {children}
            {!isLoading && T && <T aria-hidden="true" className={cx(iconSize[size], "shrink-0")} />}
        </>
    );
    /* Waiting is not the same as switched off. A button that is working keeps its colour, with the
       dots beside its label, and simply does nothing if it is pressed again; it used to be handed
       the disabled look, which turned a green button grey and its label nearly invisible at the
       very moment somebody was watching it. */
    return href ? (
        <AriaLink href={href} className={cls} aria-label={ariaLabel} isDisabled={isDisabled || isLoading} aria-busy={isLoading || undefined}>
            {inner}
        </AriaLink>
    ) : (
        <AriaButton type={isLoading ? "button" : type} onPress={isLoading ? undefined : onPress} className={cls} aria-label={ariaLabel} isDisabled={isDisabled} aria-busy={isLoading || undefined}>
            {inner}
        </AriaButton>
    );
};

export const DuoCard = ({ className, children, tone = "plain" }: { className?: string; children: ReactNode; tone?: "plain" | "active" | "locked" }) => (
    <div className={cx("rounded-2xl border-2 p-5", tone === "active" ? "border-brand bg-brand-primary" : tone === "locked" ? "border-secondary bg-secondary" : "border-secondary bg-primary", className)}>
        {children}
    </div>
);

/** A Duolingo progress bar: a grey track with a coloured fill and the light highlight stripe along its top. */
export const DuoProgress = ({ value, className, color = "bg-brand-500" }: { value: number; className?: string; color?: string }) => (
    <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} className={cx("h-4 w-full overflow-hidden rounded-full bg-secondary", className)}>
        <div className={cx("relative h-full rounded-full transition-[width] duration-500 ease-out", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }}>
            <span aria-hidden="true" className="absolute inset-x-3 top-1 h-1 rounded-full bg-white/30" />
        </div>
    </div>
);
