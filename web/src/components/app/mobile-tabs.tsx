// The phone navigation, the Duolingo way: a fixed bar of five colour icons along the bottom, the
// current one sitting in a tinted bordered square. Desktop keeps the sidebar; this is lg:hidden.
import { type FC } from "react";
import { Menu02 } from "@/components/app/ic";
import { Link } from "react-router";
import { inQuestions } from "./app-sidebar";
import { DuoBooks, DuoBubbles, DuoHome, DuoQuestion } from "./duo-icons";
import { cx } from "@/utils/cx";

type Tab = { id: string; label: string; href?: string; icon: FC<{ className?: string }>; match: (active: string) => boolean };

export const MobileTabs = ({ active, onMenu }: { active: string; onMenu: () => void }) => {
    const tabs: Tab[] = [
        { id: "home", label: "Home", href: "/", icon: DuoHome, match: (a) => a === "home" },
        { id: "community", label: "Community", href: "/community", icon: DuoBubbles, match: (a) => a === "community" },
        { id: "courses", label: "Courses", href: "/courses", icon: DuoBooks, match: (a) => a === "courses" },
        { id: "questions", label: "Questions", href: "/questions", icon: DuoQuestion, match: (a) => inQuestions(a) },
        { id: "menu", label: "Menu", icon: Menu02 as FC<{ className?: string }>, match: () => false },
    ];
    const current = tabs.find((t) => t.match(active))?.id;
    return (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-secondary bg-primary pb-[env(safe-area-inset-bottom)] lg:hidden">
            <ul className="flex h-[66px] items-stretch">
                {tabs.map((t) => {
                    const on = t.id === current;
                    const inner = (
                        <>
                            <span className={cx("flex h-9 w-14 items-center justify-center rounded-xl border-2 transition duration-150 ease-out", on ? "border-brand bg-brand-primary" : "border-transparent")}>
                                <t.icon aria-hidden="true" className={cx("size-6 transition duration-150", t.id === "menu" ? "size-5.5 stroke-[2.5px] text-fg-quaternary" : !on && "opacity-60 saturate-50")} />
                            </span>
                            <span className={cx("mt-0.5 text-[11px] leading-none font-bold tracking-wide uppercase", on ? "text-brand-secondary" : "text-quaternary")}>{t.label}</span>
                        </>
                    );
                    const cls = "flex h-full w-full flex-col items-center justify-center outline-focus-ring focus-visible:-outline-offset-2 focus-visible:outline-2 active:scale-95 transition duration-100";
                    return (
                        <li key={t.id} className="flex-1">
                            {t.href ? (
                                <Link to={t.href} aria-current={on ? "page" : undefined} aria-label={t.label} className={cls}>
                                    {inner}
                                </Link>
                            ) : (
                                <button type="button" onClick={onMenu} aria-label={t.label} className={cls}>
                                    {inner}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
