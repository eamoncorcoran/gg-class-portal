// Short confirmations at the bottom of the screen, with Undo when an action threw work away.
import { useEffect, useState } from "react";
import { CheckCircle, FlipBackward } from "@/components/app/ic";
import { Button as AriaButton } from "react-aria-components";

type Toast = { id: number; msg: string; undo?: () => void };
let push: (t: Toast) => void = () => {};
let n = 0;

export const toast = (msg: string, undo?: () => void) => push({ id: ++n, msg, undo });

export const ToastRegion = () => {
    const [t, setT] = useState<Toast | null>(null);
    useEffect(() => {
        push = setT;
    }, []);
    useEffect(() => {
        if (!t) return;
        const id = setTimeout(() => setT(null), t.undo ? 7000 : 3500);
        return () => clearTimeout(id);
    }, [t]);

    return (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex justify-center lg:inset-x-auto lg:right-6 lg:bottom-6">
            {t && (
                <div
                    key={t.id}
                    className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl bg-primary-solid py-2.5 pr-2.5 pl-4 shadow-lg duration-200 animate-in fade-in slide-in-from-bottom-2"
                >
                    <CheckCircle aria-hidden="true" className="size-5 shrink-0 text-fg-success-secondary" />
                    <p className="flex-1 text-sm font-medium text-white">{t.msg}</p>
                    {t.undo && (
                        <AriaButton
                            onPress={() => {
                                t.undo!();
                                setT(null);
                            }}
                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-white/80 outline-focus-ring transition duration-100 ease-linear hover:bg-white/10 hover:text-white focus-visible:outline-2"
                        >
                            <FlipBackward aria-hidden="true" className="size-4" />
                            Undo
                        </AriaButton>
                    )}
                </div>
            )}
        </div>
    );
};
