// Teaching plans: what a course is meant to cover, week by week, and what has been. The teacher
// ticks items off as they are taught, so the plan doubles as the record of where the term actually
// got to. Students never see this. /teach/plans is the picker; /teach/plans/:id (a courseId) is one
// plan, with ?mode=list|build|topics. Ported from plansView / planView / bindPlans / confirmRemovePlan.
import { useCallback, useEffect, useState } from "react";
import { LayersTwo01 } from "@/components/app/ic";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { DuoButton, DuoProgress } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { Empty } from "@/components/app/page-parts";
import { Segmented } from "@/components/app/segmented";
import { toast } from "@/components/app/toast";
import { api, useApi } from "@/lib/portal";
import { type Plan, type PlanSummary, type TopicBank, loadPlan, loadTopics, planPercent } from "@/lib/teach-courses";
import { cx } from "@/utils/cx";
import { Banner, DownloadLink, PlanBuilder, PlanChecklist, PlanTopics } from "./plan-builder";

export const PlansSection = () => {
    const { id } = useParams();
    return id ? <PlanView key={id} courseId={id} /> : <PlanPicker />;
};

/* ---- the picker: every course, with its plan or the offer of one ---- */

const PlanPicker = () => {
    const navigate = useNavigate();
    const { data, loading, error, reload } = useApi<PlanSummary[]>("/api/admin/plans");
    const [importing, setImporting] = useState<string | null>(null);
    useEffect(() => {
        if (error) toast(error.message);
    }, [error]);

    const importPlan = async (courseId: string) => {
        setImporting(courseId);
        try {
            await api(`/api/admin/plans/${courseId}/import`, { method: "POST", json: {} });
            toast("Plan added");
            navigate(`/teach/plans/${courseId}`);
        } catch (err) {
            setImporting(null);
            toast((err as Error).message);
            await reload();
        }
    };

    const courses = data ?? [];
    if (!loading && data && courses.length === 0)
        return (
            <>
                <SectionHead kicker="Teaching" title="Plans" sub="What each course covers, week by week." />
                <Empty icon={LayersTwo01} title="No courses yet" note="A plan belongs to a course, so make the course first." />
            </>
        );

    return (
        <>
            <SectionHead kicker="Teaching" title="Plans" sub="What each course covers, week by week, and what has been taught." />
            {loading && !data && <p className="text-sm text-quaternary">Loading…</p>}
            <div className="grid gap-4 md:grid-cols-2">
                {courses.map((course) => {
                    const has = Boolean(course.plan_id);
                    const pct = has ? planPercent(course.done, course.total) : 0;
                    return (
                        <article key={course.id} className="flex flex-col gap-4 rounded-2xl border-2 border-secondary bg-primary p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-primary">{course.title}</h3>
                                    <p className="mt-0.5 text-sm text-tertiary">{has ? course.plan_title : "No plan yet"}</p>
                                </div>
                                {has ? (
                                    <DuoButton size="sm" color="secondary" href={`/teach/plans/${course.id}`}>
                                        Open plan
                                    </DuoButton>
                                ) : (
                                    <DuoButton size="sm" isDisabled={importing === course.id} onPress={() => importPlan(course.id)}>
                                        Add the plan
                                    </DuoButton>
                                )}
                            </div>
                            {has ? (
                                <div>
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        <span className={cx("rounded-full px-2.5 py-1 text-xs font-bold", pct === 100 ? "bg-success-primary text-success-primary" : "bg-secondary text-tertiary")}>
                                            {course.done} of {course.total} covered
                                        </span>
                                        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-tertiary">{pct}%</span>
                                    </div>
                                    <DuoProgress value={pct} className="h-3" />
                                </div>
                            ) : (
                                <p className="text-sm text-quaternary">Bring in the Irish for Primary Teaching plan, or leave this course without one.</p>
                            )}
                        </article>
                    );
                })}
            </div>
        </>
    );
};

/* ---- one plan, open ---- */

type Mode = "list" | "build" | "topics";

const PlanView = ({ courseId }: { courseId: string }) => {
    const navigate = useNavigate();
    const [sp, setSp] = useSearchParams();
    const raw = sp.get("mode");
    /* Three ways of looking at the same plan. Ticking off is the everyday one, so it is the
       default; building is what happens once a term; the topic list is what somebody opens when the
       question is "what have we not covered". */
    const mode: Mode = raw === "build" || raw === "topics" ? raw : "list";
    const setMode = (m: Mode) => {
        const next = new URLSearchParams(sp);
        if (m === "list") next.delete("mode");
        else next.set("mode", m);
        setSp(next, { replace: true });
    };

    const [plan, setPlan] = useState<Plan | null>(null);
    const [bank, setBank] = useState<TopicBank | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [removing, setRemoving] = useState(false);

    /* Called from the failure path as well as the success one, so a plan that has been removed in
       another tab has to land on the picker rather than throw out of a drop handler where nothing
       would catch it. */
    const refresh = useCallback(async () => {
        const [p, t] = await Promise.all([loadPlan(courseId).catch(() => null), loadTopics(courseId).catch(() => null)]);
        if (!p) {
            navigate("/teach/plans", { replace: true });
            return;
        }
        setPlan(p);
        setBank(t);
        setLoaded(true);
    }, [courseId, navigate]);
    const refreshTopics = useCallback(async () => {
        const t = await loadTopics(courseId).catch(() => null);
        if (!t) {
            navigate("/teach/plans", { replace: true });
            return;
        }
        setBank(t);
    }, [courseId, navigate]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    if (!loaded || !plan) return <p className="text-sm text-quaternary">Loading…</p>;

    return (
        <>
            <SectionHead
                kicker="Teaching"
                title={plan.title}
                sub={`${plan.course_title} · ${plan.progress.done} of ${plan.progress.total} covered`}
                actions={
                    <>
                        <DuoButton size="sm" color="secondary" href="/teach/plans">
                            All plans
                        </DuoButton>
                        <DownloadLink href={`/api/admin/plans/${courseId}/checklist.csv`}>Export the checklist</DownloadLink>
                        <DuoButton size="sm" color="danger" onPress={() => setRemoving(true)}>
                            Remove plan
                        </DuoButton>
                    </>
                }
            />
            <div className="mb-5">
                <Segmented<Mode>
                    label="How to look at the plan"
                    value={mode}
                    onChange={setMode}
                    size="md"
                    items={[
                        { id: "list", label: "Checklist" },
                        { id: "build", label: "Builder" },
                        { id: "topics", label: "Topics" },
                    ]}
                />
            </div>
            {mode === "topics" ? <PlanTopics courseId={courseId} bank={bank} refreshTopics={refreshTopics} /> : mode === "build" ? <PlanBuilder plan={plan} bank={bank} refresh={refresh} /> : <PlanChecklist plan={plan} refresh={refresh} onPlan={setPlan} />}
            <RemovePlanDialog plan={plan} open={removing} onClose={() => setRemoving(false)} onRemoved={() => navigate("/teach/plans")} />
        </>
    );
};

const RemovePlanDialog = ({ plan, open, onClose, onRemoved }: { plan: Plan; open: boolean; onClose: () => void; onRemoved: () => void }) => {
    const [busy, setBusy] = useState(false);
    const done = plan.progress.done;
    const remove = async () => {
        setBusy(true);
        try {
            await api(`/api/admin/plans/${plan.course_id}?confirmDone=${done}`, { method: "DELETE" });
            onClose();
            toast("Plan removed");
            onRemoved();
        } catch (err) {
            toast((err as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <DuoDialog open={open} onClose={onClose} title={`Remove ${plan.title}?`} sub={done ? "This loses the record of what was taught." : "The plan can be added again at any time."}>
            {done ? (
                <>
                    <Banner>
                        {done} item{done === 1 ? "" : "s"} ticked off will be lost.
                    </Banner>
                    <p className="mt-3 text-sm text-tertiary">The plan itself comes back from the file, but which weeks you had covered does not. Export the checklist first if that record matters.</p>
                </>
            ) : (
                <p className="text-sm text-tertiary">Nothing has been ticked off, so there is nothing to lose. The plan can be brought back in whenever you want it.</p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton color="danger" size="sm" onPress={remove} isDisabled={busy}>
                    {done ? `Remove and lose ${done} tick${done === 1 ? "" : "s"}` : "Remove"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
