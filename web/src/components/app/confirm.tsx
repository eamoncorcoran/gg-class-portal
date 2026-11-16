// An in-page confirmation (the browser's confirm() is blocked in sandboxed frames and looks nothing
// like the app). askConfirm() resolves true or false; ConfirmRegion draws the dialog once, at the root.
import { useSyncExternalStore } from "react";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";

type Ask = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; resolve: (ok: boolean) => void };
let current: Ask | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const askConfirm = (o: Omit<Ask, "resolve">) =>
    new Promise<boolean>((resolve) => {
        current = { ...o, resolve };
        emit();
    });

export const ConfirmRegion = () => {
    const ask = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => current);
    const done = (ok: boolean) => {
        ask?.resolve(ok);
        current = null;
        emit();
    };
    return (
        <DuoDialog open={Boolean(ask)} onClose={() => done(false)} title={ask?.title ?? ""} className="z-[60]">
            <p className="text-md leading-7 text-secondary">{ask?.message}</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={() => done(false)}>
                    {ask?.cancelLabel ?? "Cancel"}
                </DuoButton>
                <DuoButton color={ask?.danger ? "danger" : "primary"} size="sm" onPress={() => done(true)}>
                    {ask?.confirmLabel ?? "Confirm"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
