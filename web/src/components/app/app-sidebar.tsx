// The left navigation: the Gaeilgeoir Guides mark, then the six sections of the hub. Home,
// Community, Courses, Homework, Live Classroom, Past Questions (which folds open to every topic)
// and Past Papers. Your own things (saved questions, exams, account) live in the header menu.
import { type FC, useEffect, useState } from "react";
import { ChevronDown, X } from "@/components/app/ic";
import { DuoBook, DuoBooks, DuoBubbles, DuoCheckDoc, DuoFeather, DuoFolder, DuoHome, DuoLive, DuoMail, DuoMegaphone, DuoNews, DuoPencil, DuoQuestion, DuoScroll } from "@/components/app/duo-icons";
import { AnimatePresence, motion } from "motion/react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { useLocation } from "react-router";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { NAV, type NavItem, soonTopics, topic } from "@/lib/data";
import { set } from "@/lib/store";
import { useLiveNow, useMe, useStudentBootstrap } from "@/lib/portal";
import { useUnreadMessages } from "@/lib/messages";
import { warmBoard } from "@/lib/community-cache";
import { cx } from "@/utils/cx";

/** The hub is Irish only; these stay for the pages that still ask. */
export const useSubject = () => "irish";
export type Level = "higher" | "ordinary" | "foundation" | "common";
export const useLevel = (): Level => "higher";
export const SUBJECTS = () => [{ id: "irish", name: "Irish", mark: "Ga", live: true, href: "/" }];

/** One full-colour icon per topic (see duo-icons.tsx). */
export const topicIcon = (slug: string): FC<{ className?: string }> =>
    slug.includes("fogra")
        ? DuoMegaphone
        : slug.includes("comhra")
          ? DuoBubbles
          : slug.startsWith("aural")
            ? DuoNews
            : slug === "write"
              ? DuoPencil
              : slug === "reading-comprehension"
                ? DuoBook
                : slug.includes("poetry")
                  ? DuoFeather
                  : slug.includes("prose")
                    ? DuoScroll
                    : DuoCheckDoc;

// Popovers share one entrance so every menu in the app opens the same way
export const POP = "duration-200 ease-out origin-top animate-in fade-in zoom-in-95 slide-in-from-top-1";

// Top-level nav rows, Duolingo desktop sizing: 32px colour icon, 13px bold uppercase label, 2px border,
// the current one tinted brand with a brand border.
const NAV_ROW = "flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-[13px] font-bold tracking-[0.06em] uppercase outline-focus-ring transition duration-100 ease-linear select-none focus-visible:outline-2 focus-visible:outline-offset-2";
const NAV_ON = "border-brand bg-brand-primary text-brand-secondary";
const NAV_OFF = "border-transparent text-tertiary hover:bg-primary_hover hover:text-secondary pressed:bg-secondary";

/** The Gaeilgeoir Guides mark, as on the hub. */
export const Wordmark = ({ className }: { className?: string }) => (
    <a href="/" className={cx("flex items-center rounded-md outline-focus-ring focus-visible:outline-2", className)} aria-label="Gaeilgeoir Guides home">
        <span className="text-[22px] leading-none font-black tracking-tight text-primary [font-family:Nunito,var(--font-body)]">
            Gaeilgeoir <span className="text-brand-secondary">Guides</span>
        </span>
    </a>
);
/** A sidebar panel icon for hide/show, in the rounded Duolingo manner. */
export const PanelIcon = ({ className, ...rest }: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" className={cx("size-5", className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
        <rect x="3" y="4" width="18" height="16" rx="4" />
        <path d="M9 4v16" />
    </svg>
);

const NavRow = ({ href, icon: Icon, current, badge, dot, children, onNear }: { href: string; icon: FC<{ className?: string }>; current: boolean; badge?: number; dot?: boolean; children: React.ReactNode; /** hovered or pressed: about to be opened */ onNear?: () => void }) => (
    <AriaLink href={href} aria-current={current ? "page" : undefined} className={cx(NAV_ROW, current ? NAV_ON : NAV_OFF)} onHoverStart={onNear} onPressStart={onNear}>
        <Icon aria-hidden="true" className="size-8 shrink-0" />
        <span className="flex-1">{children}</span>
        {dot && <span className="size-2.5 rounded-full bg-error-solid ring-4 ring-error-primary" aria-label="Live now" />}
        {badge ? <span className="rounded-full bg-brand-solid px-2 py-0.5 text-xs text-white tabular-nums">{badge}</span> : null}
    </AriaLink>
);

/** A nav row that folds: press anywhere on it to open or close its parts. (`href` is kept for callers; the row itself no longer navigates.) */
const FoldRow = ({ href: _href, icon: Icon, label, current, inside, children }: { href: string; icon: FC<{ className?: string }>; label: string; current: boolean; inside: boolean; children: React.ReactNode }) => {
    const [open, setOpen] = useState(inside);
    useEffect(() => {
        if (inside) setOpen(true);
    }, [inside]);
    return (
        <div>
            {/* the whole row is the switch: press anywhere to open or close the topics */}
            <AriaButton onPress={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Hide ${label} topics` : `Show ${label} topics`} className={cx("group flex w-full cursor-pointer items-center text-left", NAV_ROW, current || inside ? NAV_ON : NAV_OFF)}>
                <Icon aria-hidden="true" className="size-8 shrink-0" />
                <span className="flex-1">{label}</span>
                <ChevronDown aria-hidden="true" className={cx("size-4 shrink-0 stroke-[2.5px] text-fg-quaternary transition-transform duration-200 ease-out", open && "-scale-y-100")} />
            </AriaButton>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
                        <ul className="pt-1 pb-2">{children}</ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/** Which part of Past questions a page is (for the sidebar highlight). */
export const questionPart = (active: string) => (["questions", "topic", "year", "search"].includes(active) ? "questions" : ["lessons", "notes", "grammar", "oral", "quiz", "sraith"].includes(active) ? active : "");
export const inQuestions = (active: string) => questionPart(active) !== "";
/** The "you" pages: saved questions, exams, classes and homework. */
export const inProfile = (active: string) => ["saved", "exam"].includes(active);

/** A small pill after a text's name: which course it belongs to. */
const CoursePill = ({ when }: { when: "old" | "new" }) => (
    <span className={cx("ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide uppercase", when === "new" ? "bg-brand-500 text-white" : "bg-secondary text-quaternary")}>{when === "new" ? "2027" : "To 2026"}</span>
);
const SUB = "flex w-full items-center gap-2 rounded-xl border-2 py-1.5 pr-3 pl-5 text-left text-[13px] font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2";
const SUB_ON = "border-brand bg-brand-primary text-brand-secondary";
const SUB_OFF = "border-transparent text-tertiary hover:bg-primary_hover hover:text-secondary pressed:bg-secondary";

/** A topic with texts under it (Prose, Poetry): the row folds open to the texts, and stays open on one of them. */
const PanelFold = ({ item, active }: { item: NavItem; active: string }) => {
    const fresh = soonTopics().filter((t) => t.slug.startsWith(item[0] + "-") || (item[0] === "poetry" && t.slug === "danta-breise"));
    const kids: NavItem[] = [...fresh.map((t) => [t.slug, t.name.replace(/^(Prose|Poetry) - /, ""), t.irish] as NavItem), ...(item[3] ?? [])];
    const inside = kids.some((k) => k[0] === active);
    const [open, setOpen] = useState(inside);
    useEffect(() => {
        if (inside) setOpen(true);
    }, [inside]);
    return (
        <li className="py-0.5">
            <AriaButton onPress={() => setOpen(!open)} aria-expanded={open} className={cx(SUB, "py-2 tracking-wide uppercase", inside && !open ? SUB_ON : SUB_OFF)}>
                <span className="flex-1">{item[1]}</span>
                <ChevronDown aria-hidden="true" className={cx("size-4 shrink-0 stroke-[2.5px] text-fg-quaternary transition-transform duration-200 ease-out", open && "-scale-y-100")} />
            </AriaButton>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
                        {kids.map(([slug, en]) => {
                            const t = topic(slug);
                            if (!t) return null;
                            const text = slug.startsWith("prose-") || slug.startsWith("poetry-") || slug === "danta-breise";
                            return (
                                <li key={slug} className="py-0.5">
                                    <AriaLink href={`/t/${slug}`} aria-current={active === slug ? "page" : undefined} className={cx(SUB, "pl-9", active === slug ? SUB_ON : SUB_OFF)}>
                                        <span className="truncate">{en}</span>
                                        {text && <CoursePill when={t.course2027 ? "new" : "old"} />}
                                    </AriaLink>
                                </li>
                            );
                        })}
                    </motion.ul>
                )}
            </AnimatePresence>
        </li>
    );
};

/** An Bhéaltriail: the four parts, then the conversation topics. */
const OralFold = ({ active, pathname }: { active: string; pathname: string }) => {
    const inside = active === "oral";
    const [open, setOpen] = useState(inside);
    useEffect(() => {
        if (inside) setOpen(true);
    }, [inside]);
    const rows: [string, string][] = [
        ["/oral", "How the oral works"],
        ["/oral/failtiu", "Fáiltiú"],
        ["/oral/leamh-na-filiochta", "Léamh na Filíochta"],
        ["/oral/sraith", "Sraith Pictiúr"],
        ["/oral/comhra", "Comhrá"],
    ];
    const cur = (href: string) => (href === "/oral" ? pathname === "/oral" : pathname.startsWith(href));
    return (
        <li className="py-0.5">
            <AriaButton onPress={() => setOpen(!open)} aria-expanded={open} className={cx(SUB, "py-2 tracking-wide uppercase", inside && !open ? SUB_ON : SUB_OFF)}>
                <span className="flex-1">Oral</span>
                <ChevronDown aria-hidden="true" className={cx("size-4 shrink-0 stroke-[2.5px] text-fg-quaternary transition-transform duration-200 ease-out", open && "-scale-y-100")} />
            </AriaButton>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
                        {rows.map(([href, label]) => (
                            <li key={href} className="py-0.5">
                                <AriaLink href={href} aria-current={cur(href) ? "page" : undefined} className={cx(SUB, "pl-9", cur(href) ? SUB_ON : SUB_OFF)}>
                                    {label}
                                </AriaLink>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </li>
    );
};

/** Every topic as panel links, in paper order, texts folded under Prose and Poetry, the oral at the end. */
const TopicTree = ({ active, pathname }: { active: string; pathname: string }) => (
    <>
        {NAV.flatMap((g) => g.items).map((item) =>
            item[3] ? (
                <PanelFold key={item[0]} item={item} active={active} />
            ) : (
                topic(item[0]) && (
                    <li key={item[0]} className="py-0.5">
                        <AriaLink href={`/t/${item[0]}`} aria-current={active === item[0] ? "page" : undefined} className={cx(SUB, active === item[0] ? SUB_ON : SUB_OFF)}>
                            <span className="truncate">{item[1].replace(/\s*\(.*\)$/, "")}</span>
                        </AriaLink>
                    </li>
                )
            ),
        )}
        <OralFold active={active} pathname={pathname} />
    </>
);

export const SidebarContent = ({ active, topicSlug = "", onClose }: { active: string; topicSlug?: string; onClose?: () => void }) => {
    const me = useMe();
    const boot = useStudentBootstrap();
    const { pathname } = useLocation();
    const inside = inQuestions(active);
    /* The red dot means the class is on: the teacher has gone live. It used to go by the timetable,
       so it lit up for two hours at every scheduled class whether anybody was teaching or not. */
    const liveNow = useLiveNow();
    /* The private line, at the foot of the menu on every page. A student's goes to their one
       conversation with the teacher; the teacher's goes to the list of them. The number is what is
       waiting to be read. An administrator who is not the lead teacher has no private line. */
    const unread = useUnreadMessages();
    /* A student's board is read a moment after the app opens, while they are looking at something
       else, so Community is already there the first time it is pressed. */
    useEffect(() => {
        if (me?.role !== "student" || !boot?.hasCommunity) return;
        const t = window.setTimeout(() => warmBoard("student"), 1500);
        return () => window.clearTimeout(t);
    }, [me?.role, boot?.hasCommunity]);
    const hasLine = Boolean(me) && !(me?.role === "admin" && !me.isSuperAdmin);
    const lineHref = me?.role === "admin" ? "/teach/messages" : "/message";

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 pr-3 pl-4">
                <Wordmark />
                {onClose ? (
                    <ButtonUtility color="tertiary" size="sm" icon={X} tooltip="Close menu" tooltipPlacement="bottom" onPress={onClose} />
                ) : (
                    <ButtonUtility color="tertiary" size="sm" icon={PanelIcon} tooltip="Hide menu" tooltipPlacement="bottom" onPress={() => set("side", false)} />
                )}
            </div>

            <nav aria-label="Main" className="flex-1 px-4 pt-2 pb-6">
                {me?.role === "student" && me.coursesOnly ? (
                    /* An on-demand (Hibernia) student: their courses, and the private line below. */
                    <ul className="flex flex-col gap-1.5">
                        <li>
                            <NavRow href="/courses" icon={DuoBooks} current={active === "courses"}>
                                Courses
                            </NavRow>
                        </li>
                    </ul>
                ) : (
                <ul className="flex flex-col gap-1.5">
                    <li>
                        <NavRow href="/" icon={DuoHome} current={active === "home"}>
                            Home
                        </NavRow>
                    </li>
                    <li>
                        <NavRow href="/community" icon={DuoBubbles} current={active === "community"} badge={boot?.communityUnread || 0} onNear={() => me && warmBoard(me.role)}>
                            Community
                        </NavRow>
                    </li>
                    <li>
                        <NavRow href="/courses" icon={DuoBooks} current={active === "courses"}>
                            Courses
                        </NavRow>
                    </li>
                    <li>
                        {/* Teachers never had a student tracker: their row is the console. */}
                        {me?.role === "admin" ? (
                            <NavRow href="/teach" icon={DuoCheckDoc} current={active === "teach"}>
                                Teacher console
                            </NavRow>
                        ) : (
                            <NavRow href="/tracker" icon={DuoCheckDoc} current={active === "tracker"} badge={boot?.notifications || 0}>
                                Homework
                            </NavRow>
                        )}
                    </li>
                    {/* Teachers run the class from the console; a student whose class has no live room never sees the row. */}
                    {(me?.role !== "student" || boot?.liveClassroom !== false) && (
                        <li>
                            <NavRow href={me?.role === "admin" ? "/teach/live" : "/live"} icon={DuoLive} current={active === "live" || (me?.role === "admin" && pathname.startsWith("/teach/live"))} dot={liveNow}>
                                Live Classroom
                            </NavRow>
                        </li>
                    )}
                    <li>
                        <FoldRow href="/questions" icon={DuoQuestion} label="Past Questions" current={active === "questions"} inside={inside}>
                            <TopicTree active={topicSlug} pathname={pathname} />
                        </FoldRow>
                    </li>
                    <li>
                        <NavRow href="/papers" icon={DuoFolder} current={active === "papers"}>
                            Past Papers
                        </NavRow>
                    </li>
                </ul>
                )}
            </nav>
            {hasLine && (
                <div className="shrink-0 border-t-2 border-secondary px-4 py-3">
                    <NavRow href={lineHref} icon={DuoMail} current={active === "message"} badge={unread}>
                        {me?.role === "admin" ? "Private messages" : "Private message"}
                    </NavRow>
                </div>
            )}
        </div>
    );
};
