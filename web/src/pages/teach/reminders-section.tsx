// /teach/reminders: email reminders. What has gone out and the switch to hold it, who the
// reminders reached, the delivery provider, the one-off nudge wording, the automatic deadline
// sequence, and the two by-hand controls (send this week's check-in reminder, run the cycle now).
// A port of remindersView, bindReminderSettings, saveReminders, saveEmailSettings, testEmail,
// loadEmailPause, loadReminderAudit and openCheckinReminderModal from the old app.js.
import { type ReactNode, useEffect, useState } from "react";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { toast } from "@/components/app/toast";
import { api, useApi, useMe } from "@/lib/portal";
import {
    type CheckinNowResult,
    type CheckinPreview,
    type EmailPauseState,
    type EmailPut,
    type EmailSettings,
    type NudgePut,
    type ReminderAudit,
    type ReminderTemplateKey,
    type RemindersPut,
    type TeachSettings,
    fmtDate,
    fmtWeek,
    plural,
} from "@/lib/teach-settings";
import { Chip, EmailModeBanner, Field, Labelled, Notice, Quiet, SecretField, SettingRow, SettingsCard, Switch, TableWrap, TextArea, VarChip, tdCls, thCls } from "./settings-cards";

type TemplateForm = { enabled: boolean; subject: string; body: string };
type RemindersForm = { enabled: boolean } & Record<ReminderTemplateKey, TemplateForm>;
type EmailForm = Omit<EmailPut, "smtpPort"> & { smtpPort: string };

const TEMPLATES: { key: ReminderTemplateKey; title: string; timing: string }[] = [
    { key: "tomorrow", title: "Due tomorrow", timing: "24 hours before deadline" },
    { key: "twoHours", title: "Due in 2 hours", timing: "2 hours before deadline" },
    { key: "thirtyMinutes", title: "Due in 30 minutes", timing: "30 minutes before deadline" },
];

const remindersFrom = (s: TeachSettings): RemindersForm => {
    const r = s.reminders || {};
    const t = (k: ReminderTemplateKey): TemplateForm => ({ enabled: r[k]?.enabled !== false, subject: r[k]?.subject || "", body: r[k]?.body || "" });
    return { enabled: r.enabled !== false, tomorrow: t("tomorrow"), twoHours: t("twoHours"), thirtyMinutes: t("thirtyMinutes") };
};
const emailFrom = (e: EmailSettings = {}): EmailForm => ({
    provider: e.provider || "console",
    fromName: e.fromName || "Gaeilgeoir Guides",
    fromAddress: e.fromAddress || "",
    replyTo: e.replyTo || "",
    webhookUrl: e.webhookUrl || "",
    smtpHost: e.smtpHost || "",
    smtpPort: String(e.smtpPort || 587),
    smtpSecure: Boolean(e.smtpSecure),
    smtpUser: e.smtpUser || "",
    smtpPassword: "",
});
const nudgeFrom = (s: TeachSettings): NudgePut => ({
    checkinSubject: s.nudge?.checkinSubject || "",
    checkinBody: s.nudge?.checkinBody || "",
    homeworkSubject: s.nudge?.homeworkSubject || "",
    homeworkBody: s.nudge?.homeworkBody || "",
});

export const RemindersSection = () => {
    const me = useMe();
    const settings = useApi<TeachSettings>("/api/settings");
    const [reminders, setReminders] = useState<RemindersForm | null>(null);
    const [email, setEmail] = useState<EmailForm | null>(null);
    const [nudge, setNudge] = useState<NudgePut | null>(null);
    const [checkinOpen, setCheckinOpen] = useState(false);
    const [testOpen, setTestOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [pauseTick, setPauseTick] = useState(0);

    /* Filled once from the server. Anything typed since stays: saving one card must not throw away the
       unsaved edits in the other two, which a reset on every refetch did. */
    useEffect(() => {
        const s = settings.data;
        if (!s) return;
        setReminders((cur) => cur ?? remindersFrom(s));
        setEmail((cur) => cur ?? emailFrom(s.email));
        setNudge((cur) => cur ?? nudgeFrom(s));
    }, [settings.data]);

    const saveReminders = async () => {
        if (!reminders) return;
        const data: RemindersPut = reminders;
        try {
            await api("/api/settings/reminders", { method: "PUT", json: data });
            toast("Reminder sequence saved");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const saveEmail = async () => {
        if (!email) return;
        const data: EmailPut = { ...email, smtpPort: Number(email.smtpPort) || 587 };
        try {
            const saved = await api<{ provider: string; configured: boolean }>("/api/settings/email", { method: "PUT", json: data });
            toast("Email settings saved");
            // The password box empties once it has been kept; the banner at the top follows the provider.
            setEmail((f) => (f ? { ...f, smtpPassword: "" } : f));
            settings.set((prev) => (prev ? { ...prev, email: { ...prev.email, ...data, smtpPassword: undefined, provider: saved.provider || data.provider, configured: saved.configured } } : prev!));
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const saveNudge = async () => {
        if (!nudge) return;
        try {
            await api("/api/settings/nudge", { method: "PUT", json: nudge });
            toast("Reminder wording saved");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    const runReminders = async () => {
        setRunning(true);
        try {
            await api("/api/admin/reminders/run", { method: "POST" });
            toast("Reminder cycle completed");
        } catch (e) {
            toast((e as Error).message);
        }
        setRunning(false);
    };

    return (
        <>
            <SectionHead
                kicker="Automation"
                title="Email reminders"
                sub="Configure the delivery provider, templates and automatic deadline sequence."
                actions={
                    <>
                        <DuoButton size="sm" color="secondary" onPress={() => setCheckinOpen(true)}>
                            Send the Check-In Reminder Now
                        </DuoButton>
                        <DuoButton size="sm" color="secondary" onPress={runReminders} isDisabled={running}>
                            {running ? "Running…" : "Run Reminder Check"}
                        </DuoButton>
                        <DuoButton size="sm" onPress={saveReminders} isDisabled={!reminders}>
                            Save Settings
                        </DuoButton>
                    </>
                }
            />

            {settings.data && <EmailModeBanner provider={settings.data.email?.provider} setupHref={null} className="mb-6" />}

            <div className="flex flex-col gap-6">
                <SendingCard tick={pauseTick} />
                <AuditCard />

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="flex flex-col gap-6">
                        <SettingsCard
                            title="Delivery settings"
                            sub="Use a GoHighLevel webhook, SMTP or console mode."
                            footer={
                                <>
                                    <DuoButton size="sm" color="secondary" onPress={() => setTestOpen(true)} isDisabled={!email}>
                                        Send Test Email
                                    </DuoButton>
                                    <DuoButton size="sm" onPress={saveEmail} isDisabled={!email}>
                                        Save Email Settings
                                    </DuoButton>
                                </>
                            }
                        >
                            {!email ? (
                                <Quiet>{settings.error ? settings.error.message : "Loading…"}</Quiet>
                            ) : (
                                <>
                                    <SettingRow title="Provider" hint="Console mode logs email locally without sending.">
                                        <DuoSelect
                                            label="Provider"
                                            value={email.provider}
                                            items={[
                                                { id: "console", label: "Console / test" },
                                                { id: "ghl_webhook", label: "GoHighLevel webhook" },
                                                { id: "smtp", label: "SMTP" },
                                            ]}
                                            onChange={(provider) => setEmail({ ...email, provider })}
                                        />
                                    </SettingRow>
                                    <SettingRow title="Sender" hint="Name, email and reply-to address.">
                                        <Field value={email.fromName} onChange={(v) => setEmail({ ...email, fromName: v })} ariaLabel="Sender name" placeholder="Sender name" />
                                        <Field type="email" value={email.fromAddress} onChange={(v) => setEmail({ ...email, fromAddress: v })} ariaLabel="Sender email" placeholder="Sender email" />
                                        <Field type="email" value={email.replyTo} onChange={(v) => setEmail({ ...email, replyTo: v })} ariaLabel="Reply-to" placeholder="Reply-to" />
                                    </SettingRow>
                                    <SettingRow title="GoHighLevel webhook" hint="Receives the complete email payload.">
                                        <Field type="url" value={email.webhookUrl} onChange={(v) => setEmail({ ...email, webhookUrl: v })} ariaLabel="GoHighLevel webhook URL" placeholder="https://..." />
                                    </SettingRow>
                                    <SettingRow title="SMTP" hint="Optional direct email delivery. Port 465 normally needs implicit TLS; 587 does not.">
                                        <Field value={email.smtpHost} onChange={(v) => setEmail({ ...email, smtpHost: v })} ariaLabel="SMTP host" placeholder="SMTP host" />
                                        <Field type="number" min={1} max={65535} value={email.smtpPort} onChange={(v) => setEmail({ ...email, smtpPort: v })} ariaLabel="SMTP port" placeholder="Port" />
                                        <Field value={email.smtpUser} onChange={(v) => setEmail({ ...email, smtpUser: v })} ariaLabel="SMTP user" placeholder="SMTP user" />
                                        <SecretField value={email.smtpPassword} onChange={(v) => setEmail({ ...email, smtpPassword: v })} ariaLabel="SMTP password" placeholder="Leave blank to keep current password" />
                                        <Switch checked={email.smtpSecure} onChange={(on) => setEmail({ ...email, smtpSecure: on })} label="Use implicit TLS" />
                                    </SettingRow>
                                </>
                            )}
                        </SettingsCard>

                        <SettingsCard
                            title="One-off reminders"
                            sub="The wording you start from when you chase a single student from the tracker. Every send is editable first."
                            footer={
                                <DuoButton size="sm" onPress={saveNudge} isDisabled={!nudge}>
                                    Save Reminder Wording
                                </DuoButton>
                            }
                        >
                            {!nudge ? (
                                <Quiet>Loading…</Quiet>
                            ) : (
                                <>
                                    <Labelled label="Missed check-in, subject">
                                        <Field value={nudge.checkinSubject} onChange={(v) => setNudge({ ...nudge, checkinSubject: v })} ariaLabel="Missed check-in, subject" />
                                    </Labelled>
                                    <Labelled label="Missed check-in, message">
                                        <TextArea tall value={nudge.checkinBody} onChange={(v) => setNudge({ ...nudge, checkinBody: v })} ariaLabel="Missed check-in, message" />
                                    </Labelled>
                                    <Labelled label="Missed homework, subject">
                                        <Field value={nudge.homeworkSubject} onChange={(v) => setNudge({ ...nudge, homeworkSubject: v })} ariaLabel="Missed homework, subject" />
                                    </Labelled>
                                    <Labelled label="Missed homework, message">
                                        <TextArea tall value={nudge.homeworkBody} onChange={(v) => setNudge({ ...nudge, homeworkBody: v })} ariaLabel="Missed homework, message" />
                                    </Labelled>
                                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-tertiary">
                                        Available here: <VarChip>{"{{first_name}}"}</VarChip>
                                        <VarChip>{"{{item_title}}"}</VarChip>
                                        <VarChip>{"{{deadline}}"}</VarChip>
                                        <VarChip>{"{{link}}"}</VarChip>
                                    </p>
                                </>
                            )}
                        </SettingsCard>

                        <SettingsCard
                            title="Automatic deadline sequence"
                            sub="Only students who have not submitted receive these."
                            actions={reminders && <Switch checked={reminders.enabled} onChange={(on) => setReminders({ ...reminders, enabled: on })} label="Enabled" />}
                        >
                            {!reminders ? (
                                <Quiet>Loading…</Quiet>
                            ) : (
                                TEMPLATES.map(({ key, title, timing }) => {
                                    const t = reminders[key];
                                    const set = (patch: Partial<TemplateForm>) => setReminders({ ...reminders, [key]: { ...t, ...patch } });
                                    return (
                                        <div key={key} className="flex flex-col gap-3 rounded-2xl border-2 border-secondary bg-secondary/40 p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-md font-bold text-primary">{title}</p>
                                                    <p className="text-sm text-tertiary">{timing}</p>
                                                </div>
                                                <Switch checked={t.enabled} onChange={(on) => set({ enabled: on })} label="Enabled" />
                                            </div>
                                            <Labelled label="Subject">
                                                <Field value={t.subject} onChange={(v) => set({ subject: v })} ariaLabel={`${title}: subject`} />
                                            </Labelled>
                                            <Labelled label="Email body">
                                                <TextArea value={t.body} onChange={(v) => set({ body: v })} ariaLabel={`${title}: email body`} rows={5} />
                                            </Labelled>
                                        </div>
                                    );
                                })
                            )}
                        </SettingsCard>
                    </div>

                    <aside className="flex flex-col gap-6">
                        <SettingsCard title="Available variables" sub="Use these in subject lines and email bodies.">
                            <div className="flex flex-wrap gap-1.5">
                                <VarChip>{"{{first_name}}"}</VarChip>
                                <VarChip>{"{{assignment_title}}"}</VarChip>
                                <VarChip>{"{{deadline_time}}"}</VarChip>
                                <VarChip>{"{{assignment_link}}"}</VarChip>
                            </div>
                        </SettingsCard>
                    </aside>
                </div>
            </div>

            {checkinOpen && <CheckinReminderDialog onClose={() => setCheckinOpen(false)} onSent={() => setPauseTick((n) => n + 1)} />}
            {testOpen && <TestEmailDialog initialTo={me?.email || ""} onClose={() => setTestOpen(false)} />}
        </>
    );
};

/* What has gone out, and a way to stop it. On the screen rather than only in a log, because the
   question "is this thing sending more than it should" was asked after the fact once and the only
   way to answer it was to read code. */
const KINDS: Record<string, string> = {
    transactional: "Logins, invitations and nudges",
    deadline: "Homework and check-in reminders",
    announcement: "Posts you put out",
    notice: "Board activity: replies and student posts",
};

const SendingCard = ({ tick }: { tick: number }) => {
    // `tick` bumps after a by-hand check-in send, so the counts refresh the way loadEmailPause() was called then.
    const pause = useApi<EmailPauseState>("/api/settings/email/pause", [tick]);
    const [busy, setBusy] = useState(false);
    const s = pause.data;

    const set = async (hours: number, reason: string) => {
        setBusy(true);
        try {
            await api("/api/settings/email/pause", { method: "PUT", json: { hours, reason } });
            await pause.reload();
            toast(hours ? "Sending held" : "Sending resumed");
        } catch (e) {
            toast((e as Error).message);
        }
        setBusy(false);
    };

    if (!s) {
        return (
            <SettingsCard title="Sending">
                <Quiet>{pause.error ? pause.error.message : "Checking what has been sent…"}</Quiet>
            </SettingsCard>
        );
    }
    const day = s.lastDay || {};
    const went = (day.sent || 0) + (day.simulated || 0);
    const held = day.suppressed || 0;
    const failed = day.failed || 0;
    const week = (s.byKind || []).reduce((t, r) => t + r.count, 0);

    return (
        <SettingsCard
            title="Sending"
            sub={`${went} ${plural(went, "email")} in the last 24 hours${held ? `, ${held} held back` : ""}${failed ? `, ${failed} failed` : ""}. Limit is ${s.dailyCap} a day.`}
            actions={
                s.paused ? (
                    <DuoButton size="xs" color="secondary" onPress={() => set(0, "")} isDisabled={busy}>
                        Resume Sending
                    </DuoButton>
                ) : (
                    <DuoButton size="xs" color="secondary" onPress={() => set(24, "held by hand")} isDisabled={busy}>
                        Hold Sending for 24 Hours
                    </DuoButton>
                )
            }
        >
            {week ? (
                <div>
                    <p className="mb-2 duo-label text-quaternary">What went out this week ({week})</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {(s.byKind || []).map((row) => (
                            <div key={row.priority} className="rounded-2xl border-2 border-secondary p-3">
                                <p className="text-xl font-bold text-primary tabular-nums">{row.count}</p>
                                <p className="text-sm text-tertiary">{KINDS[row.priority] || row.priority}</p>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                    <i className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round((row.count / week) * 100)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <Quiet>Nothing sent in the last seven days.</Quiet>
            )}
            {(s.byDay || []).length > 0 && (
                <div>
                    <p className="mb-2 duo-label text-quaternary">By day</p>
                    <TableWrap>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-secondary">
                                    <th className={thCls}>Day</th>
                                    <th className={thCls}>Sent</th>
                                    <th className={thCls}>Held</th>
                                </tr>
                            </thead>
                            <tbody>
                                {s.byDay.map((row) => (
                                    <tr key={row.day} className="border-b border-secondary last:border-b-0">
                                        <td className={tdCls}>{row.day}</td>
                                        <td className={`${tdCls} tabular-nums`}>{row.sent}</td>
                                        <td className={`${tdCls} tabular-nums`}>{row.held || ""}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </TableWrap>
                </div>
            )}
            {s.paused && (
                <Notice tone="warning" title={`Sending is on hold until ${fmtDate(s.until, { time: true, weekday: true, dateStyle: "medium" })}.`}>
                    Board notices and reminders are being held. Password resets and invitations still go out, because somebody is waiting on those.{s.reason ? ` Reason given: ${s.reason}.` : ""}
                </Notice>
            )}
        </SettingsCard>
    );
};

/* The audit card: every homework and check-in reminder of the last month, against who had already
   handed in when it went. The number that matters is the one that should be zero. */
const AuditCard = () => {
    const audit = useApi<ReminderAudit>("/api/settings/reminders/audit?days=30");
    const a = audit.data;
    if (!a) {
        return (
            <SettingsCard title="Who the reminders reached">
                <Quiet>{audit.error ? audit.error.message : "Checking who the reminders reached…"}</Quiet>
            </SettingsCard>
        );
    }
    const wrong = a.wrong || [];
    const total = (a.homework?.sent || 0) + (a.checkins?.sent || 0);
    const when = (iso: string | null) => (iso ? fmtDate(iso, { weekday: true, time: true, dateStyle: "medium" }) : "");
    const reverted = (a.reverted?.homework || 0) + (a.reverted?.checkins || 0);
    return (
        <SettingsCard
            title="Who the reminders reached"
            sub={`Last ${a.days} days: ${total} ${plural(total, "reminder")} about work, ${a.homework?.sent || 0} homework and ${a.checkins?.sent || 0} check-in.`}
            actions={<Chip tone={wrong.length ? "orange" : "green"}>{wrong.length ? `${wrong.length} went to somebody who had already handed in` : "None went to anybody who had already handed in"}</Chip>}
        >
            <p className="text-sm text-tertiary">A reminder only goes to a student whose work is not in, checked when the list is drawn up and again at the moment of sending. {a.doneAfterReminder || 0} of these were followed by the work coming in.</p>
            {reverted > 0 && (
                <p className="text-sm text-error-primary">
                    {a.reverted.homework} homework and {a.reverted.checkins} check-ins are sitting as drafts although they were handed in. That should not happen any more; tell Claude if it does.
                </p>
            )}
            {wrong.length > 0 && (
                <TableWrap>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-secondary">
                                <th className={thCls}>Student</th>
                                <th className={thCls}>About</th>
                                <th className={thCls}>Reminder sent</th>
                                <th className={thCls}>Handed in</th>
                            </tr>
                        </thead>
                        <tbody>
                            {wrong.map((row, i) => (
                                <tr key={i} className="border-b border-secondary last:border-b-0">
                                    <td className={tdCls}>
                                        <span className="font-medium text-primary">{row.name}</span>
                                        <span className="block text-xs text-quaternary">{row.email}</span>
                                    </td>
                                    <td className={tdCls}>{row.what}</td>
                                    <td className={tdCls}>{when(row.sentAt)}</td>
                                    <td className={tdCls}>{when(row.submittedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </TableWrap>
            )}
        </SettingsCard>
    );
};

/* Sending this week's check-in reminder by hand. The count comes first and the button says it,
   because this is the one control on the screen that reaches people outside the portal and cannot
   be taken back. Anybody already reminded this week is named rather than hidden. */
const CheckinReminderDialog = ({ onClose, onSent }: { onClose: () => void; onSent: () => void }) => {
    const [preview, setPreview] = useState<CheckinPreview | null>(null);
    const [sending, setSending] = useState(false);
    const [failedOnce, setFailedOnce] = useState(false);

    useEffect(() => {
        api<CheckinPreview>("/api/admin/reminders/checkin-preview")
            .then(setPreview)
            .catch((e: Error) => {
                toast(e.message);
                onClose();
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!preview) return null;

    if (!preview.total) {
        return (
            <DuoDialog open onClose={onClose} title="Nobody to remind" sub="Everybody with an open check-in has done it.">
                <p className="text-sm text-tertiary">A reminder only goes to somebody whose check-in is open and not yet submitted. There is nobody in that position right now.</p>
                <div className="mt-6 flex justify-end">
                    <DuoButton size="sm" onPress={onClose}>
                        Close
                    </DuoButton>
                </div>
            </DuoDialog>
        );
    }

    const fresh = preview.total - preview.alreadyReminded;
    const send = async () => {
        setSending(true);
        try {
            const result = await api<CheckinNowResult>("/api/admin/reminders/checkin-now", { method: "POST", json: {} });
            onClose();
            toast(`Reminder sent to ${result.sent} ${plural(result.sent, "student")}`);
            onSent();
        } catch (e) {
            setSending(false);
            setFailedOnce(true);
            toast((e as Error).message);
        }
    };
    const label: ReactNode = sending ? "Sending…" : failedOnce ? "Send" : `Send to ${preview.total} ${plural(preview.total, "student")}${preview.alreadyReminded ? ` (${fresh} for the first time)` : ""}`;

    return (
        <DuoDialog open onClose={onClose} title={`Remind ${preview.total} ${plural(preview.total, "student")}?`} sub="They have an open check-in they have not done yet." className="max-w-2xl">
            <p className="text-sm text-tertiary">This sends straight away. It goes only to students whose check-in is open and still unsubmitted, so nobody is chased for work they have handed in.</p>
            {preview.alreadyReminded > 0 && (
                <Notice tone="warning" className="mt-4" title={`${preview.alreadyReminded} of them already had a reminder for this week.`}>
                    Sending now means a second one. That is sometimes the point, and sometimes not, so it is worth a look at the list below first.
                </Notice>
            )}
            <TableWrap className="mt-4 max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-secondary">
                            <th className={thCls}>Student</th>
                            <th className={thCls}>Week</th>
                            <th className={thCls}>Closes</th>
                            <th className={thCls}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {preview.students.map((row, i) => (
                            <tr key={i} className="border-b border-secondary last:border-b-0">
                                <td className={tdCls}>{row.name}</td>
                                <td className={`${tdCls} whitespace-nowrap`}>{fmtWeek(row.week)}</td>
                                <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(row.closes, { time: true, weekday: true, dateStyle: "short" })}</td>
                                <td className={tdCls}>{row.alreadyReminded && <Chip tone="orange">Already reminded</Chip>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableWrap>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton size="sm" color="secondary" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={send} isDisabled={sending}>
                    {label}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

/* The test email: to the signed-in administrator by default. Only this button ever calls the test route. */
const TestEmailDialog = ({ initialTo, onClose }: { initialTo: string; onClose: () => void }) => {
    const [to, setTo] = useState(initialTo);
    const [busy, setBusy] = useState(false);
    const send = async () => {
        setBusy(true);
        try {
            await api("/api/settings/email/test", { method: "POST", json: { to } });
            onClose();
            toast("Test email sent");
        } catch (e) {
            toast((e as Error).message);
        }
        setBusy(false);
    };
    return (
        <DuoDialog open onClose={onClose} title="Send test email">
            <Labelled label="Recipient">
                <Field type="email" value={to} onChange={setTo} ariaLabel="Recipient" autoFocus />
            </Labelled>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton size="sm" color="secondary" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton size="sm" onPress={send} isDisabled={busy}>
                    {busy ? "Sending…" : "Send Test"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};
