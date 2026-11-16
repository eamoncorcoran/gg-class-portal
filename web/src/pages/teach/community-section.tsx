// Community in the teacher console: one feed per class. The class picker shows when more than one
// class has a board; /teach/community/:id is the classId and the open post sits in ?post=.
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoSelect } from "@/components/app/duo-select";
import { Calendar } from "@/components/app/ic";
import { toast } from "@/components/app/toast";
import { type AdminClass, api } from "@/lib/portal";
import { CommunityBoard } from "@/pages/community-page";

type ClassRow = AdminClass & { active?: boolean; label?: string };

export const CommunitySection = () => {
    const { id } = useParams();
    const nav = useNavigate();
    const [params, setParams] = useSearchParams();
    const [classes, setClasses] = useState<ClassRow[] | null>(null);
    useEffect(() => {
        api<ClassRow[]>("/api/admin/classes")
            .then((list) => setClasses(Array.isArray(list) ? list : []))
            .catch((e) => {
                toast(e.message);
                setClasses([]);
            });
    }, []);

    // The boards: classes flagged has_community, or every class when none is flagged (an older hub).
    const boards = classes ? (classes.some((k) => k.has_community) ? classes.filter((k) => k.has_community) : classes) : [];
    const chosen = id && boards.some((k) => k.id === id) ? id : (boards.find((k) => k.active) ?? boards[0])?.id ?? null;
    useEffect(() => {
        if (classes && chosen && chosen !== id) nav(`/teach/community/${chosen}${params.get("post") ? `?post=${params.get("post")}` : ""}`, { replace: true });
    }, [classes, chosen, id]);

    const post = params.get("post");
    const openPost = (tid: string | null) => {
        const next = new URLSearchParams(params);
        if (tid) next.set("post", tid);
        else next.delete("post");
        setParams(next);
    };

    if (!classes) return <p className="text-sm text-quaternary">Loading…</p>;
    if (!chosen)
        return (
            <>
                <SectionHead kicker="Manage" title="Community" sub="One feed per class. Pin, close, remove or schedule anything." />
                <p className="rounded-2xl border-2 border-dashed border-secondary p-8 text-center text-sm text-tertiary">No class has a board yet. Switch one on in the class setup under Classes & students.</p>
            </>
        );

    return (
        <CommunityBoard
            key={chosen}
            admin
            classId={chosen}
            openId={post}
            onOpen={openPost}
            head={({ openCategories, openSchedulePlan }) => (
                <SectionHead
                    kicker="Manage"
                    title="Community"
                    sub="One feed per class. Pin, close, remove or schedule anything."
                    actions={
                        <>
                            {boards.length > 1 && <DuoSelect label="Class" value={chosen} items={boards.map((k) => ({ id: k.id, label: k.label || k.programme_name }))} onChange={(v) => nav(`/teach/community/${v}`)} className="max-w-72" />}
                            <DuoButton size="sm" color="secondary" onPress={openCategories}>
                                Categories
                            </DuoButton>
                            <DuoButton size="sm" color="secondary" iconLeading={Calendar} onPress={openSchedulePlan}>
                                Scheduled
                            </DuoButton>
                        </>
                    }
                />
            )}
        />
    );
};
