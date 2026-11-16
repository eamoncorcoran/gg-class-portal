// The frame every page sits in: a collapsible sidebar (a drawer on smaller screens) and a sticky header
// holding the breadcrumb (section, then topic, where the topic crumb is a switcher) plus search.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, HomeLine, SearchLg } from "@/components/app/ic";
import { useHotkeys } from "react-hotkeys-hook";
import { Button as AriaButton, Dialog as AriaDialog, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { Link, useLocation, useNavigate } from "react-router";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { D, NAV, navName, soonTopics, yearName } from "@/lib/data";
import { get, set, useStore } from "@/lib/store";
import { searchExtras, searchTopics, searchYears } from "@/lib/search";
import { cx } from "@/utils/cx";
import { PanelIcon, topicIcon, SidebarContent, Wordmark } from "./app-sidebar";
import { Avatar } from "./hub-parts";
import { signOut, useMe } from "@/lib/portal";
import { toast } from "./toast";
import { User01 } from "@/components/app/ic";
import { MobileTabs } from "./mobile-tabs";

export type Crumb = { label: string; href?: string; menu?: "topic" };

const PQ: Crumb = { label: "Past questions", href: "/questions" };
/** Where the page is, for the sidebar highlight and the breadcrumb. `active` names the section (or the part of Past questions). */
export function useWhere(): { active: string; crumbs: Crumb[]; topicSlug?: string } {
    const { pathname } = useLocation();
    const [, a, b, c] = decodeURIComponent(pathname).split("/");
    if (a === "t" && b) {
        return { active: "topic", topicSlug: b, crumbs: [PQ, { label: navName(b), menu: "topic" }, ...(c === "samples" ? [{ label: "Samples & Guides" }] : c === "lessons" ? [{ label: "Lessons" }] : [])] };
    }
    if (a === "q" && D().q[b]) {
        const q = D().q[b], slug = D().topicOf[b];
        return { active: "topic", topicSlug: slug, crumbs: [PQ, { label: navName(slug), menu: "topic" }, { label: `${q.year}${q.deferred ? " deferred" : ""}` }] };
    }
    if (a === "questions") return { active: b === "lessons" ? "lessons" : "questions", crumbs: b === "lessons" ? [PQ, { label: "Lessons" }] : [{ label: "Past questions" }] };
    if (a === "year") return { active: "year", crumbs: [PQ, { label: "Exam years", href: "/years" }, { label: yearName(b) }] };
    if (a === "years") return { active: "year", crumbs: [PQ, { label: "Exam years" }] };
    if (a === "saved") return { active: "saved", crumbs: [{ label: "Saved questions" }] };
    if (a === "exam") return { active: "exam", crumbs: [{ label: "My exams", href: "/exam" }] };
    if (a === "quiz") return { active: "quiz", crumbs: [PQ, { label: "Quizzes", href: "/quiz" }] };
    if (a === "oral") return { active: "oral", crumbs: [PQ, { label: "An Bhéaltriail", href: "/oral" }, ...(b === "sraith" ? [{ label: "Sraith Pictiúr" }] : b === "comhra" ? [{ label: "Comhrá" }] : b ? [{ label: b === "failtiu" ? "Fáiltiú" : "Léamh na Filíochta" }] : [])] };
    if (a === "grammar") return { active: "grammar", crumbs: [PQ, { label: "Notes & guides", href: "/notes" }, { label: "Grammar", href: "/grammar" }] };
    if (a === "notes") return { active: "notes", crumbs: [PQ, { label: "Notes & guides", href: "/notes" }] };
    if (a === "search") return { active: "search", crumbs: [PQ, { label: "Search" }] };
    if (a === "papers") return { active: "papers", crumbs: [{ label: "Past papers" }] };
    if (a === "community") return { active: "community", crumbs: [{ label: "Community", href: "/community" }] };
    if (a === "courses") return { active: "courses", crumbs: [{ label: "Courses", href: "/courses" }, ...(b ? [{ label: "Course" }] : [])] };
    if (a === "live") return { active: "live", crumbs: [{ label: "Live classroom" }] };
    if (a === "tracker") return { active: "tracker", crumbs: [{ label: "Homework & check-ins" }] };
    if (a === "mock-oral") return { active: "mockoral", crumbs: [{ label: "Mock oral" }] };
    if (a === "sraith") return { active: "sraith", crumbs: [PQ, { label: "Sraith Pictiúr" }] };
    if (a === "message") return { active: "message", crumbs: [{ label: "Private message" }] };
    if (a === "account") return { active: "account", crumbs: [{ label: "Your account" }] };
    if (a === "teach") {
        const names: Record<string, string> = { tracker: "Weekly tracker", people: "Classes & students", calendar: "Calendar", courses: "Courses", sraith: "Sraith Pictiúr", "mock-orals": "Mock orals", live: "Live classroom", plans: "Plans", checkins: "Weekly check-ins", community: "Community", attendance: "Attendance upload", reminders: "Email reminders", drafting: "Feedback drafting", admins: "Administrators" };
        return { active: "teach", crumbs: [{ label: "Teacher console", href: "/teach" }, ...(b && names[b] ? [{ label: names[b], href: c ? `/teach/${b}` : undefined }] : [])] };
    }
    if (a === "signin") return { active: "signin", crumbs: [{ label: "Sign in" }] };
    if (a === "forgot") return { active: "signin", crumbs: [{ label: "Sign in", href: "/signin" }, { label: "Forgot password" }] };
    if (a === "reset") return { active: "signin", crumbs: [{ label: "Sign in", href: "/signin" }, { label: "New password" }] };
    return { active: "home", crumbs: [] };
}

const crumbBtn = "flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-semibold text-quaternary outline-focus-ring transition duration-100 ease-linear hover:text-tertiary focus-visible:outline-2 pressed:text-secondary";
const crumbCur = "flex h-7 items-center gap-1 rounded-md bg-secondary px-2 text-sm font-semibold text-secondary";

const Breadcrumbs = ({ crumbs, topicSlug }: { crumbs: Crumb[]; topicSlug?: string }) => (
    <nav aria-label="Breadcrumb" className="min-w-0 overflow-hidden">
        <ol className="flex items-center gap-2 whitespace-nowrap">
            <li>
                <Link to="/" aria-label="Home" className={cx(crumbs.length ? crumbBtn : crumbCur, "px-1.5")}>
                    <HomeLine aria-hidden="true" className="size-5" />
                    {!crumbs.length && <span className="ml-1">Home</span>}
                </Link>
            </li>
            {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                    <li key={i} className="flex min-w-0 items-center gap-2">
                        <ChevronRight aria-hidden="true" className="size-4 shrink-0 stroke-2 text-fg-quaternary" />
                        {c.menu === "topic" ? (
                            <TopicMenu current={topicSlug}>
                                <AriaButton className={last ? crumbCur : crumbBtn} aria-current={last ? "page" : undefined}>
                                    <span className="truncate">{c.label}</span>
                                    <ChevronDown aria-hidden="true" className="size-3.5 stroke-2 opacity-70" />
                                </AriaButton>
                            </TopicMenu>
                        ) : c.href && !last ? (
                            <Link to={c.href} className={crumbBtn}>
                                {c.label}
                            </Link>
                        ) : (
                            <span aria-current="page" className={cx(crumbCur, "truncate")}>
                                {c.label}
                            </span>
                        )}
                    </li>
                );
            })}
        </ol>
    </nav>
);

/** Every topic, grouped by paper, to jump between them from the breadcrumb. */
export const TopicMenu = ({ current, children }: { current?: string; children: ReactNode }) => (
    <Dropdown.Root>
        {children}
        <Dropdown.Popover placement="bottom left" className="w-76">
            <Dropdown.Menu aria-label="Topics" selectionMode="single" selectedKeys={current ? [current] : []}>
                {[...NAV.map((g) => ({ label: g.group, items: g.items.flatMap((i) => (i[3] ? i[3].map(([slug, en, ga]) => ({ slug, en: `${i[1]} · ${en}`, ga })) : [{ slug: i[0], en: i[1], ga: i[2] }])) })),
                  { label: "New for 2027", items: soonTopics().map((t) => ({ slug: t.slug, en: t.name, ga: "" })) }].map((g, gi) => (
                    <Dropdown.Section key={g.label}>
                        {gi > 0 && <Dropdown.Separator />}
                        <Dropdown.SectionHeader className="px-4 pt-2 pb-1 text-xs font-semibold text-quaternary">{g.label}</Dropdown.SectionHeader>
                        {g.items.map((t) => (
                            <Dropdown.Item key={t.slug} id={t.slug} href={`/t/${t.slug}`} textValue={t.en} icon={topicIcon(t.slug)}>
                                {t.en}
                                {t.ga && <span lang="ga" className="ml-1.5 font-normal text-quaternary">{t.ga}</span>}
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Section>
                ))}
            </Dropdown.Menu>
        </Dropdown.Popover>
    </Dropdown.Root>
);

/** You, in the header: saved questions and exams, the hub's own screens for your account, and the way in or out. */
const ProfileMenu = () => {
    const me = useMe();
    const saved = useStore((s) => s.saved.length);
    const exams = useStore((s) => s.exams.length + (s.exam.length ? 1 : 0));
    const nav = useNavigate();
    const who = me ? { name: me.name, role: me.role, avatar: me.hasAvatar ? `/api/media/avatar/${me.id}` : undefined } : null;
    return (
        <Dropdown.Root>
            <AriaButton aria-label="Your menu" className="flex h-10 items-center gap-2 rounded-xl px-1.5 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2">
                {who ? <Avatar who={who} size="sm" /> : <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-fg-quaternary"><User01 aria-hidden="true" className="size-4.5" /></span>}
                <span className="hidden max-w-32 truncate text-sm font-bold text-secondary md:block">{who ? who.name.split(" ")[0] : "Sign in"}</span>
                <ChevronDown aria-hidden="true" className="hidden size-3.5 stroke-2 text-fg-quaternary md:block" />
            </AriaButton>
            <Dropdown.Popover placement="bottom right" className="w-64">
                <Dropdown.Menu aria-label="You" onAction={(k) => {
                    if (k === "signout") signOut().then(() => (toast("Signed out of the hub"), nav("/")));
                }}>
                    <Dropdown.Section>
                        <Dropdown.SectionHeader className="px-4 pt-2 pb-1 text-xs font-semibold text-quaternary">{who ? `${who.name} · ${who.role === "admin" ? "Teacher" : "Student"}` : "Not signed in to the hub"}</Dropdown.SectionHeader>
                        <Dropdown.Item id="saved" href="/saved" textValue="Saved questions">Saved questions{saved ? <span className="ml-auto text-xs text-quaternary">{saved}</span> : null}</Dropdown.Item>
                        <Dropdown.Item id="exams" href="/exam" textValue="My exams">My exams{exams ? <span className="ml-auto text-xs text-quaternary">{exams}</span> : null}</Dropdown.Item>
                    </Dropdown.Section>
                    <Dropdown.Separator />
                    <Dropdown.Section>
                        <Dropdown.Item id="mock" href="/mock-oral" textValue="Mock oral">Mock oral</Dropdown.Item>
                        <Dropdown.Item id="msg" href="/message" textValue="Private message">Private message</Dropdown.Item>
                        <Dropdown.Item id="account" href="/account" textValue="Account">Account</Dropdown.Item>
                        {(!me || me.role === "admin") && <Dropdown.Item id="teach" href="/teach" textValue="Teacher console">Teacher console</Dropdown.Item>}
                    </Dropdown.Section>
                    <Dropdown.Separator />
                    <Dropdown.Section>
                        {me ? <Dropdown.Item id="signout" textValue="Sign out">Sign out</Dropdown.Item> : <Dropdown.Item id="signin" href="/signin" textValue="Sign in">Sign in</Dropdown.Item>}
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );
};

/** Search as an icon; press it (or /) and a field slides out, closes again when it is empty and loses focus. */
const HeaderSearch = () => {
    const nav = useNavigate();
    const { pathname } = useLocation();
    const [v, setV] = useState("");
    const [open, setOpen] = useState(false); // the box itself, on phones
    const [focus, setFocus] = useState(false);
    const box = useRef<HTMLInputElement>(null);
    useHotkeys("/", (e) => {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => box.current?.focus(), 30);
    });
    useEffect(() => {
        setV("");
        setFocus(false);
        setOpen(false);
    }, [pathname]);
    const go = () => {
        if (v.trim()) nav(`/search/${encodeURIComponent(v.trim())}`);
        setFocus(false);
        box.current?.blur();
    };
    const q = v.trim();
    const topics = q ? searchTopics(q).slice(0, 5) : [];
    const extras = q ? [...searchYears(q), ...searchExtras(q)].slice(0, 2) : [];
    const showList = focus && q.length > 0;
    return (
        <form
            role="search"
            className="relative flex items-center"
            onSubmit={(e) => {
                e.preventDefault();
                go();
            }}
        >
            <div className={cx("overflow-hidden transition-[width] duration-200", open ? "w-52 overflow-visible sm:w-72" : "w-0")}>
                <input
                    ref={box}
                    value={v}
                    onChange={(e) => setV(e.target.value)}
                    onFocus={() => setFocus(true)}
                    onBlur={() => setTimeout(() => setFocus(false), 150)}
                    onKeyDown={(e) => e.key === "Escape" && (setV(""), setFocus(false), setOpen(false))}
                    aria-label="Search topics and past questions"
                    placeholder="Search any topic or question"
                    autoComplete="off"
                    className="h-10 w-full rounded-xl border-2 border-secondary bg-primary px-3 text-sm font-medium text-primary outline-hidden placeholder:text-placeholder focus:border-brand"
                />
            </div>
            {/* the icon opens the box; pressed again it closes it (Enter in the box searches) */}
            <ButtonUtility
                color="tertiary"
                size="sm"
                icon={SearchLg}
                tooltip={open ? "Close search" : "Search any topic or question"}
                tooltipPlacement="bottom"
                aria-expanded={open}
                onPress={() => {
                    if (open) {
                        setOpen(false);
                        setFocus(false);
                        setV("");
                        return;
                    }
                    setOpen(true);
                    setTimeout(() => box.current?.focus(), 30);
                }}
            />
            {showList && (
                <div className="absolute top-12 right-0 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-secondary bg-primary p-2 shadow-lg" role="listbox" aria-label="Suggestions">
                    {topics.map((t) => (
                        <Link key={t.slug} to={t.href} role="option" aria-selected={false} className="flex flex-col rounded-xl px-3 py-2 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                            <span className="text-sm font-bold text-primary">{t.name}</span>
                            <span className="text-xs text-tertiary">{t.irish}</span>
                        </Link>
                    ))}
                    {extras.map((e) => (
                        <Link key={e.href} to={e.href} role="option" aria-selected={false} className="flex flex-col rounded-xl px-3 py-2 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                            <span className="text-sm font-bold text-primary">{e.title}</span>
                            <span className="text-xs text-tertiary">{e.sub}</span>
                        </Link>
                    ))}
                    <button type="submit" role="option" aria-selected={false} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-brand-secondary outline-focus-ring hover:bg-brand-primary focus-visible:outline-2">
                        <SearchLg aria-hidden="true" className="size-4" />
                        Search every question for “{q}”
                    </button>
                </div>
            )}
        </form>
    );
};

export const AppShell = ({ children }: { children: ReactNode }) => {
    const { active, crumbs, topicSlug } = useWhere();
    const sideOpen = useStore((s) => s.side);
    const isDesktop = useBreakpoint("lg");
    const [drawer, setDrawer] = useState(false);
    const { pathname } = useLocation();
    useEffect(() => setDrawer(false), [pathname]);
    useEffect(() => {
        const here = crumbs.at(-1)?.label;
        document.title = `${here ? `${here} · ` : ""}Gaeilgeoir Guides`;
    }, [pathname]);

    const toggle = () => (isDesktop ? set("side", !sideOpen) : setDrawer(true));
    const open = isDesktop && sideOpen;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target instanceof HTMLElement ? e.target : null;
            const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); // ⌘B is bold in a text box
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b" && !typing) {
                e.preventDefault();
                set("side", !get().side);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    /* The live console is used while teaching: the first time it opens, the menu folds away so the whole width is the class. */
    useEffect(() => {
        if (pathname.startsWith("/teach/live") && isDesktop && get().side) set("side", false);
    }, [pathname, isDesktop]);

    return (
        <div className="min-h-dvh bg-primary">
            {/* desktop sidebar */}
            <aside
                aria-label="Sections"
                inert={!open}
                className={cx(
                    "fixed inset-y-0 left-0 z-30 hidden w-76 border-r border-secondary bg-primary transition-transform duration-200 ease-out lg:block",
                    !open && "-translate-x-full",
                )}
            >
                <SidebarContent active={active} topicSlug={topicSlug} />
            </aside>

            {/* phone and tablet drawer */}
            <AriaModalOverlay
                isOpen={drawer}
                onOpenChange={setDrawer}
                isDismissable
                className={({ isEntering, isExiting }) =>
                    cx(
                        "fixed inset-0 z-50 bg-overlay/70 backdrop-blur-md lg:hidden",
                        isEntering && "duration-300 ease-out animate-in fade-in",
                        isExiting && "duration-200 ease-in animate-out fade-out",
                    )
                }
            >
                <AriaModal
                    className={({ isEntering, isExiting }) =>
                        cx(
                            "h-dvh w-full max-w-76 bg-primary shadow-xl",
                            isEntering && "duration-300 ease-out animate-in slide-in-from-left",
                            isExiting && "duration-200 ease-in animate-out slide-out-to-left",
                        )
                    }
                >
                    <AriaDialog aria-label="Sections" className="relative h-full outline-hidden">
                        <SidebarContent active={active} topicSlug={topicSlug} onClose={() => setDrawer(false)} />
                    </AriaDialog>
                </AriaModal>
            </AriaModalOverlay>

            <div className={cx("transition-[padding] duration-200 ease-out", open && "lg:pl-76")}>
                <header className="sticky top-0 z-20 border-b-2 border-secondary bg-primary/95 backdrop-blur-md">
                    <div className="flex h-16 items-center gap-2 px-3 md:px-6">
                        {/* Only once the menu is folded away (the menu has its own hide button); on a phone it opens the drawer. ⌘/Ctrl+B does the same. */}
                        {!open && (
                            <>
                                <ButtonUtility color="tertiary" size="sm" icon={PanelIcon} tooltip={isDesktop ? "Show menu (⌘B)" : "Menu"} tooltipPlacement="bottom" onPress={toggle} aria-expanded={false} />
                                <div className="hidden h-5 w-px bg-border-secondary md:block" aria-hidden="true" />
                            </>
                        )}
                        <div className="hidden min-w-0 flex-1 md:block">
                            <Breadcrumbs crumbs={crumbs} topicSlug={topicSlug} />
                        </div>
                        <div className="flex flex-1 md:hidden">
                            <Wordmark />
                        </div>
                        <HeaderSearch />
                        <ProfileMenu />
                    </div>
                </header>
                <div className="md:hidden">{crumbs.length > 0 && <MobileCrumbs crumbs={crumbs} />}</div>
                <main id="main" tabIndex={-1} className="min-h-[calc(100dvh-4rem)] pb-16 outline-hidden lg:pb-0">
                    {children}
                </main>
            </div>
            <MobileTabs active={active} onMenu={() => setDrawer(true)} />
        </div>
    );
};

const MobileCrumbs = ({ crumbs }: { crumbs: Crumb[] }) => (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 overflow-x-auto border-b-2 border-secondary px-4 py-2 text-sm whitespace-nowrap scrollbar-hide">
        <Link to="/" className="font-medium text-tertiary">
            Home
        </Link>
        {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
                <ChevronRight aria-hidden="true" className="size-4 text-fg-quaternary" />
                {c.href && i < crumbs.length - 1 ? (
                    <Link to={c.href} className="font-medium text-tertiary">
                        {c.label}
                    </Link>
                ) : (
                    <span className={cx("font-semibold", i === crumbs.length - 1 ? "text-secondary" : "text-tertiary")}>{c.label}</span>
                )}
            </span>
        ))}
    </nav>
);
