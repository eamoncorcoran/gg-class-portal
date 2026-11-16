// The first time a person signs in on a device, a card says what is new. Closing it is remembered
// for that person on that device, so it never comes back.
import { useEffect, useState } from "react";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { DuoBulb, DuoHeadphones, DuoQuestion, DuoSparkle } from "@/components/app/duo-icons";
import { useMe } from "@/lib/portal";

const key = (id: string) => `pq.welcome.seen:${id}`;
const seen = (id: string) => {
    try {
        return localStorage.getItem(key(id)) === "1";
    } catch {
        return true; // no storage: do not nag on every load
    }
};
const remember = (id: string) => {
    try {
        localStorage.setItem(key(id), "1");
    } catch {
        /* fine */
    }
};

const FEATURES = [
    { icon: DuoQuestion, title: "Every past question and marking scheme", text: "Paper 1 and Paper 2, by topic and by year, with the official schemes beside them." },
    { icon: DuoHeadphones, title: "Interactive listening and reading comprehensions", text: "Type your answers in and have them marked on the spot, with the recordings cut to each section." },
    { icon: DuoBulb, title: "Notes and videos", text: "Short notes for every part of the exam and the video lessons to go with them.", soon: true },
];

export const Welcome = () => {
    const me = useMe();
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!me) return;
        if (seen(me.id)) return;
        const t = setTimeout(() => setOpen(true), 600); // after the page has settled
        return () => clearTimeout(t);
    }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!me) return null;
    const close = () => {
        remember(me.id);
        setOpen(false);
    };
    return (
        <DuoDialog open={open} onClose={close} title={<span className="sr-only">New and improved class portal</span>} className="max-w-lg p-0 sm:p-0">
            <div className="-mt-6 overflow-hidden rounded-3xl">
                {/* the top band: icons on a soft brand wash */}
                <div className="relative bg-brand-primary px-7 pt-9 pb-7 text-center">
                    <div className="flex items-center justify-center gap-3">
                        <DuoQuestion aria-hidden="true" className="size-14 rotate-[-8deg] shadow-lg" />
                        <DuoHeadphones aria-hidden="true" className="size-16 shadow-lg" />
                        <DuoBulb aria-hidden="true" className="size-14 rotate-[8deg] shadow-lg" />
                    </div>
                    <p className="mt-6 flex items-center justify-center gap-1.5 duo-label text-brand-secondary">
                        <DuoSparkle aria-hidden="true" className="size-4" /> Fáilte romhat
                    </p>
                    <h2 className="mt-2 text-display-xs font-bold tracking-tight text-primary">New and improved class portal</h2>
                    <p className="mx-auto mt-2 max-w-sm text-md text-tertiary">Everything from the old hub is here, in a new home, with a lot more beside it.</p>
                </div>
                <ul className="flex flex-col gap-3 px-6 py-6 sm:px-7">
                    {FEATURES.map((f) => (
                        <li key={f.title} className="flex items-start gap-4 rounded-2xl border-2 border-secondary bg-primary p-4">
                            <f.icon aria-hidden="true" className="size-11 shrink-0" />
                            <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 text-md font-bold text-primary">
                                    {f.title}
                                    {f.soon && <span className="rounded-full bg-warning-primary px-2 py-0.5 text-[11px] font-bold tracking-wide text-warning-primary uppercase">Coming soon</span>}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-tertiary">{f.text}</p>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="px-6 pb-6 sm:px-7">
                    <DuoButton full onPress={close}>
                        Let's Go
                    </DuoButton>
                </div>
            </div>
        </DuoDialog>
    );
};
