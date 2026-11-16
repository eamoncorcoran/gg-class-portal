// Having the story read aloud, or uploading a recording of it: the recordings block inside the
// assignment form. A separate step from saving the text, because ABAIR takes a few seconds per
// dialect and a teacher fixing a typo should not wait for three recordings to find out whether the
// typo is fixed. Only offered on a saved assignment: there is nothing to attach a recording to until
// the story has an id.
import { useCallback, useEffect, useRef, useState } from "react";
import { DuoButton } from "@/components/app/duo";
import { askConfirm } from "@/components/app/confirm";
import { toast } from "@/components/app/toast";
import { UploadCloud02 } from "@/components/app/ic";
import { api, upload } from "@/lib/portal";
import { FIELD_COMPACT_CLASS, fmtBytes, type ListeningData, type ListeningDialect, type RenderResult } from "@/lib/teach-calendar";
import { cx } from "@/utils/cx";

const ACCEPT = "audio/*,.mp3,.m4a,.wav,.ogg,.webm,.flac,.aac,.aiff";

export const ListeningPanel = ({ assignmentId }: { assignmentId: string | null }) => {
    const [data, setData] = useState<ListeningData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
    const [rendering, setRendering] = useState<string | null>(null);

    /* Each read is numbered so a slow answer for the previous assignment, or one that arrives after
       the dialog closed, cannot land on top of the current one. */
    const tick = useRef(0);
    const load = useCallback(async () => {
        if (!assignmentId) return;
        const n = ++tick.current;
        setError(null);
        try {
            const next = await api<ListeningData>(`/api/admin/assignments/${assignmentId}/listening`);
            if (n === tick.current) setData(next);
        } catch (e) {
            if (n === tick.current) setError((e as Error).message);
        }
    }, [assignmentId]);
    useEffect(() => {
        setData(null);
        load();
        return () => {
            tick.current += 1;
        };
    }, [load]);

    if (!assignmentId)
        return (
            <p className="flex items-start gap-2 rounded-2xl border-2 border-dashed border-secondary bg-secondary_subtle p-4 text-sm text-tertiary">
                <UploadCloud02 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-quaternary" />
                <span>
                    Write the story and the questions first, then press <b>Publish assignment</b>. The upload buttons appear here straight afterwards, without leaving this screen.
                </span>
            </p>
        );
    if (error) return <p className="text-sm font-semibold text-error-primary">{error}</p>;
    if (!data) return <p className="text-sm text-quaternary">Checking the recordings…</p>;

    /* One recording is the normal case. Most stories are read once, by one person, and that is the
       whole job. So the plain upload comes first and asks nothing; dialects are underneath, for the
       teacher who does have more than one. */
    const done = data.dialects.filter((d) => d.state === "ready");
    const plain = done.length <= 1;
    const only = done[0] || null;
    // A single recording is filed under standard, which means no particular dialect.
    const single = only || data.dialects.find((d) => d.key === "standard") || data.dialects[0];
    const others = data.dialects.filter((d) => d.key !== single?.key);
    const moreOpen = done.length > 1;

    const onUpload = async (dialect: string, file: File | undefined) => {
        if (!file) return;
        setStatus({ text: `Uploading ${file.name}…` });
        const body = new FormData();
        body.append("file", file);
        body.append("dialect", dialect);
        try {
            await upload(`/api/admin/assignments/${assignmentId}/listening/upload`, body);
            setStatus(null);
            toast("Recording uploaded");
            load();
        } catch (e) {
            setStatus({ text: (e as Error).message, bad: true });
        }
    };
    /* Saved as it is typed rather than behind a button: one short field, and a teacher who typed a tag
       and closed the dialog would reasonably expect it to be there when they came back. */
    const onLabel = async (dialect: string, label: string) => {
        try {
            await api(`/api/admin/assignments/${assignmentId}/listening/${dialect}`, { method: "PATCH", json: { label: label.trim() } });
            toast("Tag saved");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const onRemove = async (dialect: string) => {
        const sure = await askConfirm({ title: `Remove the ${dialect} recording?`, message: "Students will no longer be offered it. The story and the questions stay as they are.", confirmLabel: "Remove it", danger: true });
        if (!sure) return;
        try {
            await api(`/api/admin/assignments/${assignmentId}/listening/${dialect}`, { method: "DELETE" });
            toast("Recording removed");
            load();
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const onRender = async (dialect: string) => {
        setRendering(dialect);
        try {
            const result = await api<RenderResult>(`/api/admin/assignments/${assignmentId}/listening/render`, { method: "POST", json: { dialects: [dialect] } });
            const failed = result.results.filter((item) => item.state === "failed");
            toast(failed.length ? failed[0].error || "Failed" : "Recording ready");
        } catch (e) {
            toast((e as Error).message);
        }
        setRendering(null);
        load();
    };

    const row = (dialect: ListeningDialect, showDialectName: boolean) => {
        const has = dialect.state === "ready";
        const state =
            dialect.state === "none" ? (
                <span className="text-sm text-quaternary">Nothing yet</span>
            ) : dialect.state === "pending" ? (
                <span className="text-sm text-quaternary">Working…</span>
            ) : dialect.state === "ready" ? (
                dialect.stale ? (
                    <span className="text-sm font-semibold text-error-primary">Read from an older version of the story</span>
                ) : (
                    <span className="text-sm font-semibold text-success-primary">
                        {dialect.source === "upload" ? "Uploaded" : "Synthesised"}
                        {dialect.sizeBytes ? ` · ${fmtBytes(dialect.sizeBytes)}` : ""}
                        {dialect.originalName ? ` · ${dialect.originalName}` : ""}
                    </span>
                )
            ) : (
                <span className="text-sm font-semibold text-error-primary">{dialect.error || "Failed"}</span>
            );
        return (
            <div key={dialect.key} className="flex flex-col gap-3 rounded-2xl border-2 border-secondary p-4">
                <div>
                    {showDialectName ? (
                        <p className="font-bold text-primary">
                            {dialect.label} <span className="ml-1 text-sm font-medium text-quaternary">{dialect.hint}</span>
                        </p>
                    ) : (
                        <p className="font-bold text-primary">The recording</p>
                    )}
                    <div>{state}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {has && <audio className="h-10 w-full max-w-xs" controls preload="none" src={`/api/media/listening/${assignmentId}/${dialect.key}`} />}
                    <label className={cx("inline-flex h-10.5 cursor-pointer items-center rounded-2xl border-2 border-b-4 border-secondary bg-primary px-3.5 text-[13px] font-bold tracking-[0.8px] text-brand-secondary uppercase hover:bg-primary_hover")}>
                        <input type="file" accept={ACCEPT} hidden onChange={(e) => onUpload(dialect.key, e.target.files?.[0])} />
                        {has ? "Replace" : "Upload a recording"}
                    </label>
                    {dialect.synthesisable && data.configured && (
                        <DuoButton color="secondary" size="sm" isDisabled={rendering === dialect.key} onPress={() => onRender(dialect.key)}>
                            {rendering === dialect.key ? "Reading…" : has ? "Read it out instead" : "Read it out"}
                        </DuoButton>
                    )}
                    {has && (
                        <DuoButton color="danger" size="sm" onPress={() => onRemove(dialect.key)}>
                            Remove
                        </DuoButton>
                    )}
                </div>
                {has && (
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-semibold text-secondary">
                            {showDialectName ? "What students see on the tab" : "Say which dialect it is, optional"}
                            <TagInput key={dialect.tag ?? ""} initial={dialect.tag || ""} placeholder={showDialectName ? dialect.label : "Connacht, Corca Dhuibhne…"} onSave={(v) => onLabel(dialect.key, v)} />
                        </label>
                        <span className="text-xs text-quaternary">{showDialectName ? `Leave it blank to just say ${dialect.label}.` : "Left blank, students just get the player with no label on it."}</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-3">
            {plain ? (
                <>
                    <div className="flex flex-col gap-3">{single && row(single, false)}</div>
                    <p className="text-sm text-quaternary">MP3, M4A, WAV, OGG, FLAC or WebM, up to 60 MB. One recording is all most stories need.</p>
                    <details className="rounded-2xl border-2 border-secondary p-4" open={moreOpen}>
                        <summary className="cursor-pointer font-bold text-brand-secondary">Add more, one per dialect</summary>
                        <p className="mt-2 text-sm text-quaternary">Only if you have separate recordings. Students then choose which to listen to.</p>
                        <div className="mt-3 flex flex-col gap-3">{others.map((d) => row(d, true))}</div>
                    </details>
                </>
            ) : (
                <>
                    <div className="flex flex-col gap-3">{data.dialects.map((d) => row(d, true))}</div>
                    <p className="text-sm text-quaternary">One recording per dialect. MP3, M4A, WAV, OGG, FLAC or WebM, up to 60 MB. Students pick which one to listen to and see the tag you give it.</p>
                </>
            )}
            {status && <p className={cx("text-sm", status.bad ? "font-semibold text-error-primary" : "text-quaternary")}>{status.text}</p>}
        </div>
    );
};

/** The tag field: saves on change (blur or Enter), as the old one did. */
const TagInput = ({ initial, placeholder, onSave }: { initial: string; placeholder: string; onSave: (v: string) => void }) => {
    const [v, setV] = useState(initial);
    const last = useRef(initial);
    const commit = () => {
        if (v === last.current) return;
        last.current = v;
        onSave(v);
    };
    return (
        <input
            type="text"
            maxLength={60}
            placeholder={placeholder}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className={cx(FIELD_COMPACT_CLASS, "mt-1 block w-full max-w-xs font-medium")}
        />
    );
};
