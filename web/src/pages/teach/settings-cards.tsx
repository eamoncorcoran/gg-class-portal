// The pieces the settings-style console sections share: a card with a header and footer, the
// "copy on the left, control on the right" setting row, a switch, text and secret fields, the
// connected/not-connected dot, chips, notices and the test-result line. Duolingo look throughout.
import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { Switch as AriaSwitch } from "react-aria-components";
import { DuoButton } from "@/components/app/duo";
import type { ProbeResult } from "@/lib/teach-settings";
import { cx } from "@/utils/cx";

/** A bordered card with a bold title, a line of explanation, optional header actions and a footer row. */
export const SettingsCard = ({ id, title, sub, actions, footer, children, className, tone }: { id?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; footer?: ReactNode; children?: ReactNode; className?: string; tone?: "plain" | "warning" }) => (
    <section id={id} className={cx("overflow-hidden rounded-2xl border-2 bg-primary", tone === "warning" ? "border-warning-solid/40" : "border-secondary", className)}>
        <header className="flex flex-col gap-3 border-b-2 border-secondary px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                <h2 className="text-lg font-bold text-primary">{title}</h2>
                {sub && <p className="mt-1 text-sm text-tertiary">{sub}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children !== undefined && <div className="flex flex-col gap-4 px-5 py-4">{children}</div>}
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t-2 border-secondary bg-secondary px-5 py-3">{footer}</footer>}
    </section>
);

/** Copy on the left, the control on the right; stacks on a phone. */
export const SettingRow = ({ title, hint, children, align = "start" }: { title: ReactNode; hint?: ReactNode; children: ReactNode; align?: "start" | "center" }) => (
    <div className={cx("grid gap-2 border-b border-secondary pb-4 last:border-b-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-6", align === "center" && "md:items-center")}>
        <div className="min-w-0">
            <p className="text-sm font-bold text-primary">{title}</p>
            {hint && <p className="mt-0.5 text-sm text-tertiary">{hint}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
);

const fieldCls = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-2.5 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/80 focus:border-brand focus:bg-brand-primary/30 disabled:opacity-50";

/** A chunky bordered text box. Controlled; `type` for email/url/number/password. */
export const Field = ({ value, onChange, ariaLabel, className, ...rest }: { value: string; onChange: (v: string) => void; ariaLabel: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) => (
    <input {...rest} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={cx(fieldCls, className)} />
);

/** A multi-line box; `tall` for prompts and email bodies. */
export const TextArea = ({ value, onChange, ariaLabel, placeholder, tall, rows, className, mono }: { value: string; onChange: (v: string) => void; ariaLabel: string; placeholder?: string; tall?: boolean; rows?: number; className?: string; mono?: boolean }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? (tall ? 8 : 4)} className={cx(fieldCls, "resize-y leading-6", mono && "font-mono text-sm", className)} />
);

/** A secret that never comes back from the server: always empty, "leave blank to keep" by placeholder. */
export const SecretField = ({ value, onChange, ariaLabel, placeholder, autoComplete = "off" }: { value: string; onChange: (v: string) => void; ariaLabel: string; placeholder?: string; autoComplete?: "off" | "new-password" }) => (
    <input type="password" autoComplete={autoComplete} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldCls} />
);

/** A labelled field: caps label above, then the control. */
export const Labelled = ({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) => {
    const id = useId();
    return (
        <div>
            <p id={id} className="mb-1.5 duo-label text-quaternary">
                {label}
            </p>
            {children}
            {hint && <p className="mt-1.5 text-sm text-tertiary">{hint}</p>}
        </div>
    );
};

/** The on/off switch with its label beside it. */
export const Switch = ({ checked, onChange, label, isDisabled, className }: { checked: boolean; onChange: (on: boolean) => void; label: ReactNode; isDisabled?: boolean; className?: string }) => (
    <AriaSwitch isSelected={checked} onChange={onChange} isDisabled={isDisabled} className={cx("group inline-flex cursor-pointer items-center gap-2.5 text-sm font-bold text-secondary outline-focus-ring select-none disabled:cursor-not-allowed disabled:opacity-50", className)}>
        <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent bg-tertiary transition duration-150 ease-linear group-selected:bg-brand-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus-ring">
            <span className="absolute top-0 left-0 size-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-linear group-selected:translate-x-5" />
        </span>
        <span>{label}</span>
    </AriaSwitch>
);

/** A plain checkbox row, for the one or two places the old screen used a tick rather than a switch. */
export const CheckRow = ({ checked, onChange, label, name }: { checked: boolean; onChange: (on: boolean) => void; label: ReactNode; name?: string }) => (
    <label className="flex cursor-pointer items-start gap-3 text-sm font-medium text-secondary">
        <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 rounded-md accent-brand-600" />
        <span>{label}</span>
    </label>
);

/** Connected or not: a dot, a bold word, a line of what that means. */
export const Connection = ({ ok, title, note, className }: { ok: boolean; title: ReactNode; note?: ReactNode; className?: string }) => (
    <div className={cx("flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3", className)}>
        <span aria-hidden="true" className={cx("mt-1.5 size-3 shrink-0 rounded-full", ok ? "bg-success-solid" : "bg-quaternary")} />
        <div className="min-w-0">
            <p className="text-sm font-bold text-primary">{title}</p>
            {note && <p className="text-sm text-tertiary">{note}</p>}
        </div>
    </div>
);

export type ChipTone = "grey" | "orange" | "green" | "red" | "blue";
const chipTones: Record<ChipTone, string> = {
    grey: "bg-secondary text-tertiary",
    orange: "bg-warning-primary text-warning-primary",
    green: "bg-success-primary text-success-primary",
    red: "bg-error-primary text-error-primary",
    blue: "bg-blue-100 text-blue-800",
};
/** A small status chip in the tracker tones. */
export const Chip = ({ tone = "grey", children, className }: { tone?: ChipTone; children: ReactNode; className?: string }) => <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", chipTones[tone], className)}>{children}</span>;

/** A `{{variable}}` chip for the template cards. */
export const VarChip = ({ children }: { children: ReactNode }) => <code className="inline-block rounded-lg border border-secondary bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-secondary">{children}</code>;

/** A bordered notice: warning (amber) or plain (grey). */
export const Notice = ({ tone = "info", title, children, actions, className }: { tone?: "info" | "warning" | "error"; title?: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) => (
    <div className={cx("flex flex-col gap-3 rounded-2xl border-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between", tone === "warning" ? "border-warning-solid/40 bg-warning-primary text-warning-primary" : tone === "error" ? "border-error_subtle bg-error-primary text-error-primary" : "border-secondary bg-secondary text-secondary", className)}>
        <div className="min-w-0 leading-6">
            {title && <p className="font-bold">{title}</p>}
            {children && <div className={cx(title && "mt-0.5")}>{children}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
);

/** What a Test button said: one line per probe, green or red, or a plain sentence while it is asking. */
export const TestResult = ({ result }: { result: ProbeResult[] | string | null }) => {
    if (!result) return null;
    if (typeof result === "string") return <p className="text-sm text-tertiary">{result}</p>;
    return (
        <div className="flex flex-col gap-1">
            {result.map((line, i) => (
                <p key={i} className={cx("text-sm font-medium", line.ok ? "text-success-primary" : "text-error-primary")}>
                    {line.message}
                </p>
            ))}
        </div>
    );
};

/** The table shell every list here uses: scrolls sideways on a phone. */
export const TableWrap = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx("overflow-x-auto rounded-2xl border-2 border-secondary", className)}>{children}</div>;
export const thCls = "px-3 py-2 text-left duo-label text-quaternary";
export const tdCls = "px-3 py-2 align-top";

/** A quiet "asking the server" line. */
export const Quiet = ({ children }: { children: ReactNode }) => <p className="text-sm text-quaternary">{children}</p>;

/** Console mode is the silent failure: accounts get created, invitations get "sent", and nothing
 *  arrives. Shown wherever students are added, and at the top of Email reminders itself. Pass
 *  `provider` from GET /api/settings (`email.provider`); undefined (not loaded) reads as console. */
export const EmailModeBanner = ({ provider, setupHref = "/teach/reminders", className }: { provider: string | undefined; setupHref?: string | null; className?: string }) => {
    if (provider && provider !== "console") return null;
    return (
        <Notice tone="warning" title="Invitation emails are not being delivered." className={className} actions={setupHref ? <DuoButton size="xs" color="secondary" href={setupHref}>Set Up Email</DuoButton> : undefined}>
            Email is in test mode, so new students are created but never receive their login. Set up SMTP or the GoHighLevel webhook under Email reminders, send a test email, then add or re-invite your students.
        </Notice>
    );
};
