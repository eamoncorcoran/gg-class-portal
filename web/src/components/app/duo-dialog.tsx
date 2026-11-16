// A small centred dialog in the Duolingo manner: rounded card with a 2px border, bold title, a close
// cross, and whatever the caller puts in it.
import { type ReactNode } from "react";
import { X } from "@/components/app/ic";
import { Dialog as AriaDialog, Heading as AriaHeading, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { cx } from "@/utils/cx";

export const DuoDialog = ({ open, onClose, title, sub, children, className }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) => (
    <AriaModalOverlay isOpen={open} onOpenChange={(o) => !o && onClose()} isDismissable className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/60 p-4 backdrop-blur-[2px] duration-200 animate-in fade-in sm:items-center">
        <AriaModal className={cx("max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border-2 border-secondary bg-primary p-5 shadow-xl duration-200 animate-in zoom-in-95 slide-in-from-bottom-2 sm:p-7", className)}>
            <AriaDialog className="outline-hidden">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <AriaHeading slot="title" className="text-xl font-bold text-primary">
                            {title}
                        </AriaHeading>
                        {sub && <p className="mt-1 text-sm text-tertiary">{sub}</p>}
                    </div>
                    <ButtonUtility color="tertiary" size="sm" icon={X} tooltip="Close" onPress={onClose} />
                </div>
                <div className="mt-6">{children}</div>
            </AriaDialog>
        </AriaModal>
    </AriaModalOverlay>
);

/** A bold caps label above a field. */
export const FieldLabel = ({ children }: { children: ReactNode }) => <p className="mb-1.5 duo-label text-quaternary">{children}</p>;

/** A chunky bordered text box (Duolingo's input look) for the few free-text fields we have. */
export const DuoInput = ({ value, onChange, placeholder, className, multiline, maxLength, autoFocus, ariaLabel, mono, onEnter }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; multiline?: boolean; maxLength?: number; autoFocus?: boolean; ariaLabel: string; mono?: boolean; onEnter?: () => void }) => {
    const cls = cx(
        "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/80 focus:border-brand focus:bg-brand-primary/30",
        mono && "font-mono tracking-[0.3em] uppercase",
        className,
    );
    return multiline ? (
        <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} rows={3} className={cx(cls, "resize-y")} />
    ) : (
        <input
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus={autoFocus}
            onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
            className={cls}
        />
    );
};
