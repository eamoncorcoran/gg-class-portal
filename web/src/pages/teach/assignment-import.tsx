// A term of homework from a spreadsheet (the old openAssignmentImport, assignmentPreview and
// offerBulkRender). One row per assignment, questions in numbered columns, and nothing written until
// the file has been read back.
import { type DragEvent, useEffect, useRef, useState } from "react";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { toast } from "@/components/app/toast";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { UploadCloud02 } from "@/components/app/ic";
import { api, upload } from "@/lib/portal";
import { type AdminClassRow, DIALECT_LABELS, type DialectKey, type ImportPreview, type ImportResult, type RenderAllResult, SYNTHESISABLE, classLabel, fmtWeek, plural } from "@/lib/teach-calendar";
import { cx } from "@/utils/cx";

const Pill = ({ tone, children }: { tone: "grey" | "green"; children: React.ReactNode }) => (
    <span className={cx("ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold", tone === "green" ? "bg-success-primary text-success-primary" : "bg-secondary text-tertiary")}>{children}</span>
);

export const ImportDialog = ({ classes, timezone, onClose, onImported }: { classes: AdminClassRow[]; timezone: string; onClose: () => void; onImported: (classId: string, result: ImportResult) => void | Promise<void> }) => {
    const [classId, setClassId] = useState(classes[0]?.id || "");
    // Opened before the classes arrived: take the first one once there is one, as the select shows.
    useEffect(() => {
        if (!classId && classes[0]) setClassId(classes[0].id);
    }, [classes, classId]);
    const [file, setFile] = useState<File | null>(null);
    const [over, setOver] = useState(false);
    const [reading, setReading] = useState(false);
    const [readError, setReadError] = useState<string | null>(null);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [importing, setImporting] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    const read = async (f: File | null | undefined, forClass = classId) => {
        if (!f) return;
        setFile(f);
        setReading(true);
        setReadError(null);
        setPreview(null);
        const form = new FormData();
        form.append("file", f);
        try {
            setPreview(await upload<ImportPreview>(`/api/admin/classes/${forClass}/assignment-preview`, form));
        } catch (e) {
            setReadError((e as Error).message);
        } finally {
            setReading(false);
        }
    };

    const template = async () => {
        try {
            const response = await fetch(`/api/admin/classes/${classId}/assignment-template`, { credentials: "same-origin" });
            if (!response.ok) throw new Error("The template could not be prepared.");
            const url = URL.createObjectURL(new Blob([await response.text()], { type: "text/csv;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "assignments-template.csv";
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (e) {
            toast((e as Error).message);
        }
    };

    const doImport = async () => {
        if (!file) return;
        setImporting(true);
        const form = new FormData();
        form.append("file", file);
        try {
            const result = await upload<ImportResult>(`/api/admin/classes/${classId}/assignment-import`, form);
            onClose();
            toast(`${plural(result.created, "assignment")} created${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}`);
            await onImported(classId, result);
        } catch (e) {
            setImporting(false);
            toast((e as Error).message);
        }
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        read(e.dataTransfer?.files?.[0]);
    };

    const ready = preview?.ready ?? 0;
    return (
        <DuoDialog open onClose={onClose} title="Import homework" sub="One row per assignment. Nothing is written until you have seen what it read." className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex flex-col gap-4">
                <div>
                    <FieldLabel>Which class</FieldLabel>
                    <DuoSelect
                        label="Which class"
                        value={classId}
                        onChange={(id) => {
                            setClassId(id);
                            // Changing the class re-reads the file: the weeks it is filed against differ.
                            read(file, id);
                        }}
                        items={classes.map((k) => ({ id: k.id, label: classLabel(k) }))}
                        className="w-full"
                    />
                </div>
                <label
                    onDragEnter={(e) => (e.preventDefault(), setOver(true))}
                    onDragOver={(e) => (e.preventDefault(), setOver(true))}
                    onDragLeave={() => setOver(false)}
                    onDrop={onDrop}
                    className={cx("flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed p-6 text-center transition duration-100 ease-linear", over ? "border-brand bg-brand-primary" : "border-secondary bg-secondary_subtle hover:bg-primary_hover")}
                >
                    <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => read(e.target.files?.[0])} />
                    <UploadCloud02 aria-hidden="true" className="size-8 text-fg-quaternary" />
                    <span className="text-sm text-secondary">
                        <b className="text-brand-secondary">Click to upload</b> or drag a CSV here
                    </span>
                    <span className="text-xs text-quaternary">Deadline, Title, Instructions, Opens, Deadline type, Story, Q1, Q2, Q3…</span>
                    {file && <span className="mt-1 text-xs font-bold text-secondary">{file.name}</span>}
                </label>
                <p className="text-sm text-quaternary">
                    Put each question in its own column: <b>Q1</b>, <b>Q2</b>, <b>Q3</b>, as many as you need. Dates read as {timezone} and can be written 25/12/2026 20:00 or 2026-12-25T20:00. A deadline with no time on it closes at 11:55pm that night. Deadline type is <b>hard</b> (late work refused) or <b>soft</b> (accepted and marked late). Blank means hard. <b>Leave Opens blank</b> and each week's homework appears to students at 10am on the Monday of its own week, so a term imported in one go arrives a week at a time rather than all at once.
                </p>
                <p className="text-sm text-quaternary">
                    <b>For a listening activity</b>, paste the story into a <b>Story</b> column. That is all it takes: a row with a story in it becomes a listening activity. Put what a right answer looks like in <b>A1, A2, A3</b> beside each question, and what it is worth in <b>M1, M2, M3</b>. Add <b>Show text</b> with <b>yes</b> if the transcript should start visible; left blank they listen first and can press "Show the text" themselves. Each assignment is filed against the teaching week its deadline falls in.{" "}
                    <button type="button" onClick={template} className="font-bold text-brand-secondary hover:underline">
                        Download the template
                    </button>
                    .
                </p>
                {reading && <p className="text-sm text-quaternary">Reading…</p>}
                {readError && <p className="text-sm font-semibold text-error-primary">{readError}</p>}
                {preview && <PreviewTable result={preview} />}
            </div>
            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton onPress={doImport} isDisabled={!preview || ready === 0 || importing}>
                    {!preview ? "Import" : ready ? `Create ${plural(ready, "assignment")}` : "Nothing to import"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* Every row, in file order, with its problems named: a count alone leaves somebody guessing which
   nine of their twelve made it. */
const PreviewTable = ({ result }: { result: ImportPreview }) => (
    <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold text-success-primary">{result.ready} ready</span>
            {result.problems > 0 && <span className="font-bold text-error-primary">{result.problems} with problems</span>}
            <span className="text-quaternary">Times read as {result.timezone}</span>
            {result.listening > 0 && <span className="text-quaternary">{plural(result.listening, "listening activity", "listening activities")}, still to be read aloud</span>}
        </div>
        <div className="overflow-x-auto rounded-2xl border-2 border-secondary">
            <table className="w-full text-sm">
                <thead className="duo-label text-quaternary">
                    <tr className="border-b border-secondary text-left">
                        {["Row", "Title", "Students see it", "Deadline", "Questions", "Week", ""].map((h, i) => (
                            <th key={i} className="px-3 py-2 font-bold">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {result.rows.map((row) => (
                        <tr key={row.line} className={cx("border-b border-secondary last:border-0", row.problems.length && "bg-error-primary/40")}>
                            <td className="px-3 py-2 tabular-nums text-tertiary">{row.line}</td>
                            <td className="px-3 py-2 font-semibold text-primary">
                                {row.title || "Untitled"}
                                {!row.hardDeadline && <Pill tone="grey">Soft</Pill>}
                                {row.kind === "listening" && <Pill tone="green">Listening</Pill>}
                            </td>
                            <td className="px-3 py-2 text-secondary">
                                {row.localVisible || "Not given"}
                                {row.opensAssumed && <b className="ml-1 text-xs text-quaternary">Monday of that week</b>}
                            </td>
                            <td className="px-3 py-2 text-secondary">
                                {row.localDeadline || "Not given"}
                                {row.past && !row.problems.length && <b className="ml-1 text-xs text-quaternary">already passed</b>}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-secondary">{row.questions.length}</td>
                            <td className="px-3 py-2 text-secondary">{row.weekLabel ? fmtWeek(row.weekLabel) : <span className="text-quaternary">no matching week</span>}</td>
                            <td className="px-3 py-2">{row.problems.length ? <span className="font-semibold text-error-primary">{row.problems.join("; ")}</span> : <span className="font-semibold text-success-primary">will be created</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

/* Offered straight after an import that brought in stories. Asked rather than done: reading twelve
   stories aloud in three dialects is thirty six trips to a speech service, which is a decision and
   not a side effect of pressing Import. */
export const BulkRenderDialog = ({ classId, count, onClose }: { classId: string; count: number; onClose: () => void }) => {
    const [dialects, setDialects] = useState<DialectKey[]>([...SYNTHESISABLE]);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);

    const go = async () => {
        if (!dialects.length) return toast("Choose at least one dialect");
        setBusy(true);
        setStatus({ text: `Making ${count * dialects.length} recordings. This takes a moment each.` });
        try {
            const result = await api<RenderAllResult>(`/api/admin/classes/${classId}/listening/render-all`, { method: "POST", json: { dialects } });
            onClose();
            toast(result.failed.length ? `${result.made} made, ${result.failed.length} failed: ${result.failed[0].error}` : `${plural(result.made, "recording")} made`);
        } catch (e) {
            setBusy(false);
            setStatus({ text: (e as Error).message, bad: true });
        }
    };

    return (
        <DuoDialog open onClose={onClose} title={`Read ${count} ${count === 1 ? "story" : "stories"} aloud?`} sub="They are imported. The recordings are a separate step.">
            <p className="text-sm text-quaternary">Until a story has been read aloud there is nothing for a student to play. Choose the dialects you want and they will all be made now, or leave it and do them one at a time from each assignment later.</p>
            <div className="mt-4">
                <FieldLabel>Dialects</FieldLabel>
                <div className="flex flex-wrap gap-4">
                    {SYNTHESISABLE.map((key) => (
                        <Checkbox key={key} isSelected={dialects.includes(key)} onChange={(on) => setDialects((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)))} label={DIALECT_LABELS[key]} />
                    ))}
                </div>
            </div>
            {status && <p className={cx("mt-4 text-sm", status.bad ? "font-semibold text-error-primary" : "text-quaternary")}>{status.text}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Not now
                </DuoButton>
                <DuoButton size="sm" onPress={go} isDisabled={busy}>
                    {busy ? "Reading…" : "Read them aloud"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
