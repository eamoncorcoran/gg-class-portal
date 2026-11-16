// The private line, and an argument for not using it (ported from privateMessageView,
// mountChatWidget and unmountChatWidget).
//
// The point of this screen is mostly to send people back to the board. A question asked privately
// is answered once; the same question on the board is answered once and read by twenty people,
// several of whom were about to ask it. So the case for the community is made first and made
// honestly (it is faster for the student too, because other students answer) and the private line
// is offered underneath for the things that genuinely are private.
import { useEffect } from "react";
import { DuoButton, DuoCard } from "@/components/app/duo";
import { Users01 } from "@/components/app/ic";
import { Empty, Page, PageHeader } from "@/components/app/page-parts";
import { useMe, useStudentBootstrap } from "@/lib/portal";
import { SignInCard } from "./password-pages";

/* The widget belongs to this screen and nowhere else. It is a third-party script, and a third-party
   script can read whatever is on the page it is running on. This is the one screen with nothing on
   it (no submissions, no feedback, no other student's name), so it is loaded when the screen opens
   and taken away again when it closes, rather than sitting on every page for the whole session. */
const CHAT_WIDGET_ID = "6a97b99f783fa37794030a49";

/* The loader draws the bubble and its "Hi there" prompt 20px off the bottom right corner, which on a
   phone is where the Menu tab is. It draws them inside an open shadow root (a `chat-widget` element
   holding `.lc_text-widget` for the prompt and `.lc_text-widget--bubble` for the button), so a style
   sheet put into that root lifts both above the tab bar (66px + its 2px border + the safe area)
   wherever the tab bar is shown, which is every screen below lg. */
const CHAT_WIDGET_LIFT = "@media (max-width: 1023px) { .lc_text-widget, .lc_text-widget--bubble { bottom: calc(92px + env(safe-area-inset-bottom)) !important; } }";
let liftTimer: number | undefined;
const liftChatWidget = () => {
    const hosts = Array.from(document.querySelectorAll("chat-widget"));
    /* In development React runs the effect twice, and a loader script that has started cannot be
       un-run by removing its tag, so two widgets can turn up. One bubble is plenty. */
    hosts.slice(1).forEach((h) => h.remove());
    const root = hosts[0]?.shadowRoot;
    if (!root) return false;
    if (!root.querySelector("#gg-chat-widget-lift")) {
        const style = document.createElement("style");
        style.id = "gg-chat-widget-lift";
        style.textContent = CHAT_WIDGET_LIFT;
        root.append(style);
    }
    return true;
};

const mountChatWidget = () => {
    if (document.getElementById("gg-chat-widget")) return;
    const script = document.createElement("script");
    script.id = "gg-chat-widget";
    script.src = "https://widgets.leadconnectorhq.com/loader.js";
    script.dataset.resourcesUrl = "https://widgets.leadconnectorhq.com/chat-widget/loader.js";
    script.dataset.widgetId = CHAT_WIDGET_ID;
    document.body.append(script);
    /* The shadow root appears some time after the script, so keep looking for it (for half a minute). */
    const started = Date.now();
    const tick = () => {
        if (liftChatWidget() || Date.now() - started > 30000) return;
        liftTimer = window.setTimeout(tick, 250);
    };
    tick();
};

const unmountChatWidget = () => {
    window.clearTimeout(liftTimer);
    document.getElementById("gg-chat-widget")?.remove();
    /* The loader draws its own furniture outside our markup, so removing the script alone leaves
       the bubble floating over every other screen. */
    document.querySelectorAll('[id^="lc_text-widget"], [class*="lc_text-widget"], chat-widget').forEach((node) => node.remove());
};

const PrivateLine = () => {
    // Whether this class has a board comes from the student bootstrap (the shell's shared copy), as it did before.
    const boot = useStudentBootstrap();
    const hasBoard = Boolean(boot?.hasCommunity);
    useEffect(() => {
        mountChatWidget();
        return unmountChatWidget;
    }, []);
    return (
        <div className="flex max-w-2xl flex-col gap-4">
            {hasBoard && (
                <DuoCard tone="active" className="p-6">
                    <h2 className="text-lg font-bold text-primary">Try the community first</h2>
                    <p className="mt-2 text-md leading-7 text-secondary">
                        Nearly every question about the course is one somebody else in the class is also sitting with. Posting it on the board means it gets answered once and read by everyone, and you will usually hear back faster, because your classmates answer too, not just us.
                    </p>
                    <p className="mt-3 rounded-xl bg-primary px-4 py-3 text-md leading-7 font-semibold text-secondary">If you are about to ask something another student could learn from, please put it on the board.</p>
                    <div className="mt-4">
                        <DuoButton href="/community" size="sm">
                            Go to the Community
                        </DuoButton>
                    </div>
                </DuoCard>
            )}
            <DuoCard className="p-6">
                <h2 className="text-lg font-bold text-primary">Something private?</h2>
                <p className="mt-2 text-md leading-7 text-secondary">
                    Use the chat at the bottom of this page for anything personal: your own circumstances, something you would rather not put in front of the class, or anything to do with your account or payment. It comes straight to us and nobody else sees it.
                </p>
                <p className="mt-3 rounded-xl bg-warning-primary px-4 py-3 text-md font-bold text-warning-primary">Please allow up to 48 hours for a reply.</p>
            </DuoCard>
        </div>
    );
};

export const MessagePage = () => {
    const me = useMe();
    if (me === undefined)
        return (
            <Page>
                <p className="text-sm text-quaternary">Loading…</p>
            </Page>
        );
    if (!me) return <SignInCard next="/message" title="Sign in to send a message" note="The private line is for students of Gaeilgeoir Guides. Sign in first." />;
    return (
        <Page>
            <PageHeader kicker="Private message" title="A word with your teacher" sub="Something the rest of the class does not see." />
            {me.role === "student" ? <PrivateLine /> : <Empty icon={Users01} title="The private line is for students" note="Students write to you here through the chat widget; the replies happen in the GHL inbox, not in the hub." />}
        </Page>
    );
};
