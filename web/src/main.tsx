import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "@/components/app/app-shell";
import { SampleModal, SchemeWindow } from "@/components/app/overlays";
import { ExamTray } from "@/components/app/exam-tray";
import { PrintTray } from "@/components/app/print-tray";
import { ToastRegion } from "@/components/app/toast";
import { pageKey } from "@/components/app/page-parts";
import { loadData } from "@/lib/data";
import { loadHub } from "@/lib/hub";
import { isCoursesOnly, loadMe, useMe } from "@/lib/portal";
import { HomePage } from "@/pages/hub-home";
import { QuestionsPage } from "@/pages/questions-page";
import { CommunityPage } from "@/pages/community-page";
import { CoursePage, CoursesPage } from "@/pages/courses-pages";
import { LivePage } from "@/pages/live-page";
import { ConsolePage } from "@/pages/teach/console-page";
import { TrackerPage } from "@/pages/student/tracker-page";
import { MockOralPage } from "@/pages/student/mock-oral-page";
import { PqHomeworkPage } from "@/pages/student/pq-homework-page";
import { SraithPage as HubSraithPage } from "@/pages/student/sraith-page";
import { MessagePage } from "@/pages/student/message-page";
import { AccountPage } from "@/pages/student/account-page";
import { ForgotPage, ResetPage } from "@/pages/student/password-pages";
import { ConfirmRegion } from "@/components/app/confirm";
import { LiveRoomFrame } from "@/components/app/live-room";
import { Welcome } from "@/components/app/welcome";
import { SignInPage } from "@/pages/signin-page";
import { NotFound } from "@/pages/not-found";
import { LevelPage, QuestionPage, SavedPage, SearchPage, YearPage, YearsPage } from "@/pages/other-pages";
import { ExamDetailPage, MyExamsPage, NewExamPage } from "@/pages/exam-pages";
import { QuizBuilderPage, QuizPlayPage, QuizzesPage } from "@/pages/quiz-pages";
import { ComhraPage, OralPage, OralPartPage, SraithListPage, SraithPage } from "@/pages/oral-pages";
import { GrammarLessonPage, GrammarPage } from "@/pages/grammar-pages";
import { NotesPage } from "@/pages/notes-page";
import { PapersPage } from "@/pages/papers-page";
import { TopicPage } from "@/pages/topic-page";
import { RouteProvider } from "@/providers/router-provider";
import "@/styles/globals.css";

// New page: start at the top and move focus to the content, so screen readers begin there
const PageChange = () => {
    const { pathname } = useLocation();
    const prev = useRef(pathname);
    useEffect(() => {
        const samePage = pageKey(prev.current) === pageKey(pathname);
        prev.current = pathname;
        // A part of the page already on screen (a topic's tab, a post opened over the board): nothing moves.
        if (samePage) return;
        scrollTo(0, 0);
        document.getElementById("main")?.focus({ preventScroll: true });
    }, [pathname]);
    return null;
};

/* The hub's own emails link to the root with a query: "/?reset=TOKEN" (password reset), "/?go=tracker",
   "/?go=calendar", "/?go=assignment&id=<id>" (a homework). Each lands where it means to. */
const ResetForward = () => {
    const { search } = useLocation();
    const sp = new URLSearchParams(search);
    const token = sp.get("reset");
    if (token) return <Navigate to={`/reset?reset=${encodeURIComponent(token)}`} replace />;
    const go = sp.get("go");
    if (go === "tracker") return <Navigate to="/tracker" replace />;
    if (go === "assignment" && sp.get("id")) return <Navigate to={`/tracker?open=homework:${encodeURIComponent(sp.get("id")!)}`} replace />;
    if (go === "mockoral") return <Navigate to="/mock-oral" replace />;
    if (go) return <Navigate to="/" replace />; // "calendar" and anything else: Home has the calendar
    return <HomePage />;
};

/* A Hibernia student's hub: their courses and the private line to the teacher, and nothing else.
   No home, no board, no past questions or papers. Any other address lands on Courses. */
const CoursesOnlyApp = () => (
    <AppShell>
        <PageChange />
        <Routes>
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/:id" element={<CoursePage />} />
            <Route path="/courses/:id/:lesson" element={<CoursePage />} />
            <Route path="/message" element={<MessagePage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/forgot" element={<ForgotPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="*" element={<Navigate to="/courses" replace />} />
        </Routes>
        <ToastRegion />
        <ConfirmRegion />
    </AppShell>
);

const App = () => (
    <AppShell>
        <PageChange />
        <Routes>
            <Route path="/" element={<ResetForward />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/community/:id" element={<CommunityPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/courses/:id" element={<CoursePage />} />
            <Route path="/courses/:id/:lesson" element={<CoursePage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/tracker" element={<TrackerPage />} />
            <Route path="/mock-oral" element={<MockOralPage />} />
            <Route path="/hw/:id" element={<PqHomeworkPage />} />
            <Route path="/sraith" element={<HubSraithPage basePath="/sraith" />} />
            <Route path="/sraith/:slug" element={<HubSraithPage basePath="/sraith" />} />
            <Route path="/message" element={<MessagePage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/teach" element={<ConsolePage />} />
            <Route path="/teach/:section" element={<ConsolePage />} />
            <Route path="/teach/:section/:id" element={<ConsolePage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/forgot" element={<ForgotPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="/questions" element={<QuestionsPage />} />
            <Route path="/questions/lessons" element={<QuestionsPage view="lessons" />} />
            <Route path="/t/:slug" element={<TopicPage />} />
            <Route path="/t/:slug/:tab" element={<TopicPage />} />
            <Route path="/t/:slug/:tab/:item" element={<TopicPage />} />
            <Route path="/q/:id" element={<QuestionPage />} />
            <Route path="/papers" element={<PapersPage />} />
            <Route path="/years" element={<YearsPage />} />
            <Route path="/year/:key" element={<YearPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/search/:term?" element={<SearchPage />} />
            <Route path="/exam" element={<MyExamsPage />} />
            <Route path="/exam/new" element={<NewExamPage />} />
            <Route path="/exam/:id" element={<ExamDetailPage />} />
            <Route path="/exam/:id/edit" element={<NewExamPage />} />
            <Route path="/quiz" element={<QuizzesPage />} />
            <Route path="/quiz/new" element={<QuizBuilderPage />} />
            <Route path="/quiz/:id/edit" element={<QuizBuilderPage />} />
            <Route path="/quiz/play" element={<QuizPlayPage />} />
            <Route path="/quiz/:id/play" element={<QuizPlayPage />} />
            <Route path="/oral" element={<OralPage />} />
            <Route path="/oral/sraith" element={<SraithListPage />} />
            <Route path="/oral/sraith/:slug" element={<SraithPage />} />
            <Route path="/oral/comhra" element={<ComhraPage />} />
            {/* The topic notes are off for now; an old link to one lands on the explanation. */}
            <Route path="/oral/comhra/:slug" element={<Navigate to="/oral/comhra" replace />} />
            <Route path="/oral/:part" element={<OralPartPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/grammar" element={<GrammarPage />} />
            <Route path="/grammar/:slug" element={<GrammarLessonPage />} />
            <Route path="/level/:level" element={<LevelPage />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
        <ExamTray />
        <PrintTray />
        <SchemeWindow />
        <SampleModal />
        <ToastRegion />
        <ConfirmRegion />
        <LiveRoomFrame />
        <Welcome />
    </AppShell>
);

/* Signed out, the app is a sign-in form and the two password pages, and nothing else. No class
   data is asked for: the server gives none of it to a visitor, whatever address they type. Every
   other address shows the sign-in form in place and returns there once signed in. */
const SignedOut = () => {
    const { search } = useLocation();
    const token = new URLSearchParams(search).get("reset");
    return (
        <div className="min-h-dvh bg-primary">
            <main id="main" tabIndex={-1} className="outline-hidden">
                <Routes>
                    <Route path="/forgot" element={<ForgotPage />} />
                    <Route path="/reset" element={<ResetPage />} />
                    <Route path="/" element={token ? <Navigate to={`/reset?reset=${encodeURIComponent(token)}`} replace /> : <SignInPage />} />
                    <Route path="*" element={<SignInPage />} />
                </Routes>
            </main>
            <ToastRegion />
        </div>
    );
};

/* A session that ends while the app is open (signed out, or timed out) starts the app again, which
   then draws the sign-in form above and drops everything it was holding. */
const SessionWatch = () => {
    const me = useMe();
    useEffect(() => {
        if (me === null) window.location.reload();
    }, [me]);
    return null;
};

const root = createRoot(document.getElementById("root")!);
const draw = (app: React.ReactNode) =>
    root.render(
        <StrictMode>
            <BrowserRouter>
                <RouteProvider>{app}</RouteProvider>
            </BrowserRouter>
        </StrictMode>,
    );

loadMe().then(async (me) => {
    if (!me) return draw(<SignedOut />);
    const coursesOnly = isCoursesOnly(me);
    try {
        // The past questions are not part of an on-demand course, so they are not asked for.
        await Promise.all([coursesOnly ? Promise.resolve() : loadData(), loadHub()]);
    } catch (e) {
        // The session ended between the two questions: start again and show the sign-in form.
        if ((e as { status?: number }).status === 401) return window.location.reload();
        return draw(
            <div className="mx-auto mt-24 max-w-md px-6 text-center">
                <p className="text-lg font-bold text-primary">The hub could not be loaded.</p>
                <p className="mt-2 text-md text-tertiary">Check your connection and try again.</p>
                <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-2xl border-2 border-secondary px-5 py-2.5 text-sm font-bold text-brand-secondary">
                    Try again
                </button>
            </div>,
        );
    }
    draw(
        <>
            <SessionWatch />
            {coursesOnly ? <CoursesOnlyApp /> : <App />}
        </>,
    );
});
