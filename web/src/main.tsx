import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "@/components/app/app-shell";
import { SampleModal, SchemeWindow } from "@/components/app/overlays";
import { ExamTray } from "@/components/app/exam-tray";
import { ToastRegion } from "@/components/app/toast";
import { loadData } from "@/lib/data";
import { loadHub } from "@/lib/hub";
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
const topicOf = (p: string) => (p.startsWith("/t/") ? p.split("/").slice(0, 3).join("/") : null);
const PageChange = () => {
    const { pathname } = useLocation();
    const prev = useRef(pathname);
    useEffect(() => {
        const sameTopic = topicOf(prev.current) !== null && topicOf(prev.current) === topicOf(pathname);
        prev.current = pathname;
        if (sameTopic) return; // a topic's tabs swap in place; the topic page decides where to scroll
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
        <SchemeWindow />
        <SampleModal />
        <ToastRegion />
        <ConfirmRegion />
        <LiveRoomFrame />
        <Welcome />
    </AppShell>
);

Promise.all([loadData(), loadHub()]).then(() =>
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <BrowserRouter>
                <RouteProvider>
                    <App />
                </RouteProvider>
            </BrowserRouter>
        </StrictMode>,
    ),
);
