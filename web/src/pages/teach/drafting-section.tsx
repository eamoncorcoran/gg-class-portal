// /teach/drafting: feedback drafting (the old "ai" view). The Claude connection and what it drafts,
// the term notes and homework prompts, the OpenAI key for dictation, dictation settings, the speech
// keys, the two Zoom cards and Bunny Stream. One Save writes them all in the old order; each Test
// button asks its own service. A port of aiSettingsView and its cards plus bindAISettings from the
// old app.js. Secrets come back only as set or not set, so every secret box is empty and a blank
// box means "keep the one that is there".
import { useEffect, useState } from "react";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { toast } from "@/components/app/toast";
import { api, loadAdminBootstrap, useApi } from "@/lib/portal";
import {
    type AnthropicPut,
    type AnthropicTestResult,
    type BunnyPut,
    type BunnyTestResult,
    type DictationLanguage,
    type DictationPut,
    type DraftingPut,
    type DraftingSwitches,
    type OpenAIPut,
    type ProbeResult,
    type PromptsPut,
    type SpeechPut,
    type SpeechTestResult,
    type TeachSettings,
    type ZoomApiPut,
    type ZoomPut,
    type ZoomSaveResult,
    type ZoomTestResult,
} from "@/lib/teach-settings";
import { CheckRow, Chip, Connection, Field, Labelled, Notice, Quiet, SecretField, SettingRow, SettingsCard, Switch, TestResult, TextArea } from "./settings-cards";

type Form = {
    anthropicKey: string;
    anthropicModel: string;
    openaiKey: string;
    openaiModel: string;
    drafting: DraftingSwitches;
    checkinNotes: string;
    communityNotes: string;
    correctionPrompt: string;
    generalFeedbackPrompt: string;
    transcribeModel: string;
    cleanupModel: string;
    language: DictationLanguage;
    dictionary: string;
    cleanupPrompt: string;
    lightPrompt: string;
    azureKey: string;
    azureRegion: string;
    abairKey: string;
    zoomClientId: string;
    zoomClientSecret: string;
    zoomEnabled: boolean;
    zoomHostEmail: string;
    zoomapiAccountId: string;
    zoomapiClientId: string;
    zoomapiClientSecret: string;
    zoomapiWebhookSecret: string;
    bunnyLibraryId: string;
    bunnyApiKey: string;
    bunnyTokenKey: string;
};

/* Unset drafting switches (an older server) read as on, the way everything was before the switches existed. */
const onUnlessOff = (v: boolean | undefined) => v !== false;

const formFrom = (s: TeachSettings): Form => ({
    anthropicKey: "",
    anthropicModel: s.anthropic?.model || "claude-opus-5",
    openaiKey: "",
    openaiModel: s.openai?.model || "gpt-5.6",
    drafting: {
        corrections: onUnlessOff(s.drafting?.corrections),
        generalFeedback: onUnlessOff(s.drafting?.generalFeedback),
        checkins: onUnlessOff(s.drafting?.checkins),
        board: onUnlessOff(s.drafting?.board),
    },
    checkinNotes: s.prompts?.checkinNotes || "",
    communityNotes: s.prompts?.communityNotes || "",
    correctionPrompt: s.prompts?.correctionPrompt || "",
    generalFeedbackPrompt: s.prompts?.generalFeedbackPrompt || "",
    transcribeModel: s.dictation?.transcribeModel || "gpt-4o-transcribe",
    cleanupModel: s.dictation?.cleanupModel || "gpt-4.1-mini",
    language: s.dictation?.language || "auto",
    dictionary: (Array.isArray(s.dictation?.dictionary) ? s.dictation.dictionary : []).join("\n"),
    cleanupPrompt: s.voicePrompts?.cleanupPrompt || "",
    lightPrompt: s.voicePrompts?.lightPrompt || "",
    azureKey: "",
    azureRegion: s.speech?.azureRegion || "southeastasia",
    abairKey: "",
    zoomClientId: s.zoom?.clientId || "",
    zoomClientSecret: "",
    zoomEnabled: Boolean(s.zoom?.enabled),
    zoomHostEmail: s.zoom?.hostEmail || "",
    zoomapiAccountId: s.zoomApi?.accountId || "",
    zoomapiClientId: s.zoomApi?.clientId || "",
    zoomapiClientSecret: "",
    zoomapiWebhookSecret: "",
    bunnyLibraryId: s.bunny?.libraryId || "",
    bunnyApiKey: "",
    bunnyTokenKey: "",
});

const orUndefined = (v: string) => v.trim() || undefined;
const mono = "font-mono text-sm";

export const DraftingSection = () => {
    const settings = useApi<TeachSettings>("/api/settings");
    const [f, setF] = useState<Form | null>(null);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [testingClaude, setTestingClaude] = useState(false);
    const [zoomTest, setZoomTest] = useState<ProbeResult[] | string | null>(null);
    const [zoomapiTest, setZoomapiTest] = useState<ProbeResult[] | string | null>(null);
    const [bunnyTest, setBunnyTest] = useState<ProbeResult[] | string | null>(null);
    const [speechTest, setSpeechTest] = useState<ProbeResult[] | string | null>(null);
    const [busyTest, setBusyTest] = useState<string | null>(null);

    useEffect(() => {
        if (settings.data) setF(formFrom(settings.data));
    }, [settings.data]);

    const s = settings.data;
    const patch = (p: Partial<Form>) => setF((cur) => (cur ? { ...cur, ...p } : cur));

    /* Save everything, in the order the old screen did, stopping at the first error. */
    const save = async () => {
        if (!f) return;
        setSaving(true);
        try {
            const anthropic: AnthropicPut = { apiKey: f.anthropicKey || undefined, model: f.anthropicModel };
            await api("/api/settings/anthropic", { method: "PUT", json: anthropic });
            const openai: OpenAIPut = { apiKey: f.openaiKey || undefined, model: f.openaiModel };
            await api("/api/settings/openai", { method: "PUT", json: openai });
            const zoom: ZoomPut = { clientId: f.zoomClientId.trim(), clientSecret: orUndefined(f.zoomClientSecret), enabled: f.zoomEnabled, hostEmail: f.zoomHostEmail.trim() };
            await api<ZoomSaveResult>("/api/settings/zoom", { method: "PUT", json: zoom });
            const zoomapi: ZoomApiPut = { accountId: f.zoomapiAccountId.trim(), clientId: f.zoomapiClientId.trim(), clientSecret: orUndefined(f.zoomapiClientSecret), webhookSecret: orUndefined(f.zoomapiWebhookSecret) };
            await api("/api/settings/zoomapi", { method: "PUT", json: zoomapi });
            const bunny: BunnyPut = { libraryId: f.bunnyLibraryId.trim(), apiKey: orUndefined(f.bunnyApiKey), tokenKey: orUndefined(f.bunnyTokenKey) };
            await api("/api/settings/bunny", { method: "PUT", json: bunny });
            const speech: SpeechPut = { azureKey: orUndefined(f.azureKey), azureRegion: orUndefined(f.azureRegion), abairKey: orUndefined(f.abairKey) };
            await api("/api/settings/speech", { method: "PUT", json: speech });
            const drafting: DraftingPut = f.drafting;
            await api("/api/settings/drafting", { method: "PUT", json: drafting });
            const prompts: PromptsPut = { correctionPrompt: f.correctionPrompt, generalFeedbackPrompt: f.generalFeedbackPrompt, checkinNotes: f.checkinNotes, communityNotes: f.communityNotes };
            await api("/api/settings/prompts", { method: "PUT", json: prompts });
            const dictation: DictationPut = {
                transcribeModel: f.transcribeModel,
                cleanupModel: f.cleanupModel,
                language: f.language,
                dictionary: f.dictionary
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean),
                cleanupPrompt: f.cleanupPrompt,
                lightPrompt: f.lightPrompt,
            };
            await api("/api/settings/dictation", { method: "PUT", json: dictation });
            toast("Drafting configuration saved");
            // The console nav reads liveRoom and the review drawer reads the drafting switches from the bootstrap.
            await Promise.all([settings.reload(), loadAdminBootstrap(true).catch(() => undefined)]);
        } catch (e) {
            toast((e as Error).message);
        }
        setSaving(false);
    };

    /* Drafts a real check-in from an invented student rather than pinging the API,
       because the thing worth testing is whether it sounds like you. */
    const testClaude = async () => {
        setTestingClaude(true);
        try {
            const r = await api<AnthropicTestResult>("/api/settings/anthropic/test", { method: "POST" });
            setPreview(r.preview);
        } catch (e) {
            toast((e as Error).message);
        }
        setTestingClaude(false);
    };
    const probe = async (key: string, waiting: string, set: (r: ProbeResult[] | string | null) => void, run: () => Promise<ProbeResult[]>) => {
        setBusyTest(key);
        set(waiting);
        try {
            set(await run());
        } catch (e) {
            set((e as Error).message);
        }
        setBusyTest(null);
    };
    const testZoom = () => probe("zoom", "Asking Zoom", setZoomTest, async () => {
        const r = await api<ZoomTestResult>("/api/settings/zoom/test", { method: "POST", json: {} });
        return [r.sdk, r.api];
    });
    const testZoomApi = () => probe("zoomapi", "Asking Zoom", setZoomapiTest, async () => {
        const r = await api<ZoomTestResult>("/api/settings/zoom/test", { method: "POST", json: {} });
        return [r.api];
    });
    const testBunny = () => probe("bunny", "Asking Bunny", setBunnyTest, async () => [await api<BunnyTestResult>("/api/settings/bunny/test", { method: "POST", json: {} })]);
    const testSpeech = () => probe("speech", "Asking Azure and abair.ie", setSpeechTest, async () => {
        const r = await api<SpeechTestResult>("/api/settings/speech/test", { method: "POST", json: {} });
        return [r.azure, r.abair];
    });

    const webhook = `${location.origin}/api/zoom/webhook`;

    return (
        <>
            <SectionHead
                kicker="Feedback drafting"
                title="Claude keys and correction prompts"
                sub="AI drafting starts only after a student submits actual work."
                actions={
                    <>
                        <DuoButton size="sm" color="secondary" onPress={testClaude} isDisabled={testingClaude}>
                            {testingClaude ? "Drafting…" : "Test Connection"}
                        </DuoButton>
                        <DuoButton size="sm" onPress={save} isDisabled={!f || saving}>
                            {saving ? "Saving…" : "Save Configuration"}
                        </DuoButton>
                    </>
                }
            />

            {!f || !s ? (
                <Quiet>{settings.error ? settings.error.message : "Loading…"}</Quiet>
            ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="flex flex-col gap-6">
                        <SettingsCard title="Claude connection" sub="Writes the check-in, homework and board drafts. The API key is encrypted server-side and never returned to the browser.">
                            <Connection ok={s.anthropic?.configured} title={s.anthropic?.configured ? "Connected" : "Not configured"} note={s.anthropic?.configured ? `Using ${s.anthropic.model}` : "Add a server-side API key."} />
                            <SettingRow title="API key" hint="Leave blank to keep the existing key.">
                                <SecretField value={f.anthropicKey} onChange={(v) => patch({ anthropicKey: v })} ariaLabel="Anthropic API key" placeholder="sk-ant-..." />
                            </SettingRow>
                            <SettingRow title="Model" hint="Used for check-in, homework and board drafts.">
                                <Field value={f.anthropicModel} onChange={(v) => patch({ anthropicModel: v })} ariaLabel="Claude model" className={mono} />
                            </SettingRow>
                        </SettingsCard>

                        <SettingsCard title="What Claude drafts" sub="Each switch is a separate bill. Anything off is left for you to write.">
                            <DraftSwitch on={f.drafting.corrections} onChange={(on) => patch({ drafting: { ...f.drafting, corrections: on } })} title="Irish corrections on homework" hint="The slow part to do by hand. Drafted on every homework submission." />
                            <DraftSwitch on={f.drafting.generalFeedback} onChange={(on) => patch({ drafting: { ...f.drafting, generalFeedback: on } })} title="General feedback on homework" hint="The note under the corrections. Off, and the box is empty for you to fill." />
                            <DraftSwitch on={f.drafting.checkins} onChange={(on) => patch({ drafting: { ...f.drafting, checkins: on } })} title="Weekly check-in replies" hint='Off, and a submitted check-in reads "No draft" until you reply.' />
                            <DraftSwitch on={f.drafting.board} onChange={(on) => patch({ drafting: { ...f.drafting, board: on } })} title="Suggested replies on the class board" hint="Off, and no draft is offered when you open a post." />
                            <p className="text-sm text-tertiary">Listening comprehensions are still marked and the Test connection button still works whatever is switched off here.</p>
                        </SettingsCard>

                        <SettingsCard title="Your voice" sub="Built into the app, not editable here.">
                            <p className="text-sm text-tertiary">
                                The check-in and board drafts are written to a voice measured from 362 replies you sent students on WhatsApp between January and August 2026: how you open, that you never sign off, the length you actually write, no em dashes, and the advice you give over and over. It is held in the code so an edit here cannot undo it.
                            </p>
                            <Labelled label="Notes for this term, weekly check-in" hint="Added after your voice, not instead of it. Leave empty if there is nothing.">
                                <TextArea value={f.checkinNotes} onChange={(v) => patch({ checkinNotes: v })} ariaLabel="Notes for this term, weekly check-in" placeholder="Optional. Anything true this term, for example how far out the next oral is." />
                            </Labelled>
                            <Labelled label="Notes for this term, community board" hint="The draft offered above the reply box when you open a post on the board. It is a starting point you edit, nothing is ever sent without you pressing Comment, and students never see the draft or know one existed.">
                                <TextArea value={f.communityNotes} onChange={(v) => patch({ communityNotes: v })} ariaLabel="Notes for this term, community board" placeholder="Optional." />
                            </Labelled>
                        </SettingsCard>

                        <SettingsCard title="Homework prompts" sub="Corrections are a marking standard, so they stay editable here.">
                            <Labelled label="Irish corrections, An Caighdeán Oifigiúil">
                                <TextArea tall value={f.correctionPrompt} onChange={(v) => patch({ correctionPrompt: v })} ariaLabel="Irish corrections prompt" />
                            </Labelled>
                            <Labelled label="General teacher feedback">
                                <TextArea value={f.generalFeedbackPrompt} onChange={(v) => patch({ generalFeedbackPrompt: v })} ariaLabel="General teacher feedback prompt" />
                            </Labelled>
                        </SettingsCard>

                        <SettingsCard title="OpenAI connection" sub="Dictation and transcription only. Claude has no equivalent, so this key stays.">
                            <Connection ok={s.openai?.configured} title={s.openai?.configured ? "Connected" : "Not configured"} note={s.openai?.configured ? `Using ${s.openai.model}` : "Add a server-side API key."} />
                            <SettingRow title="API key" hint="Leave blank to keep the existing key.">
                                <SecretField value={f.openaiKey} onChange={(v) => patch({ openaiKey: v })} ariaLabel="OpenAI API key" placeholder="sk-..." />
                            </SettingRow>
                            <SettingRow title="Model" hint="Used to tidy up dictated voice notes.">
                                <Field value={f.openaiModel} onChange={(v) => patch({ openaiModel: v })} ariaLabel="OpenAI model" className={mono} />
                            </SettingRow>
                        </SettingsCard>

                        {/* Dictation settings mirror the VoiceKey app: which models, which language, and the personal dictionary. */}
                        <SettingsCard title="Dictation and voice notes" sub="Speech is transcribed, then cleaned into the words you would have typed. Same pipeline as VoiceKey.">
                            <SettingRow title="Speech model" hint="Used to turn your recording into a transcript.">
                                <Field value={f.transcribeModel} onChange={(v) => patch({ transcribeModel: v })} ariaLabel="Speech model" className={mono} />
                            </SettingRow>
                            <SettingRow title="Cleanup model" hint="Turns the raw transcript into finished text.">
                                <Field value={f.cleanupModel} onChange={(v) => patch({ cleanupModel: v })} ariaLabel="Cleanup model" className={mono} />
                            </SettingRow>
                            <SettingRow title="Language" hint="Auto handles English with Irish words mixed in, which is what most feedback looks like.">
                                <DuoSelect
                                    label="Dictation language"
                                    value={f.language}
                                    items={[
                                        { id: "auto", label: "Auto detect" },
                                        { id: "en", label: "English" },
                                        { id: "ga", label: "Irish" },
                                    ]}
                                    onChange={(id) => patch({ language: id as DictationLanguage })}
                                />
                            </SettingRow>
                            <SettingRow title="Personal dictionary" hint="Names and terms speech recognition tends to mishear. One per line.">
                                <TextArea tall value={f.dictionary} onChange={(v) => patch({ dictionary: v })} ariaLabel="Personal dictionary" />
                            </SettingRow>
                            <Labelled label="Cleanup instructions" hint="Used for check-in replies, general feedback and student notes.">
                                <TextArea tall value={f.cleanupPrompt} onChange={(v) => patch({ cleanupPrompt: v })} ariaLabel="Cleanup instructions" />
                            </Labelled>
                            <Labelled label="Light cleanup, for Irish corrections" hint="Punctuation only. This must never rewrite the Irish being taught.">
                                <TextArea value={f.lightPrompt} onChange={(v) => patch({ lightPrompt: v })} ariaLabel="Light cleanup instructions" />
                            </Labelled>
                        </SettingsCard>

                        {/* The speech keys behind practice lessons: the mic and the standard voice (Azure), the three dialect voices (abair.ie). */}
                        <SettingsCard
                            id="speech-card"
                            title="Speech and voices"
                            sub="For practice lessons: the mic that hears a student, and the voices that say each phrase. Keys are encrypted server-side and never returned to the browser."
                            actions={
                                <DuoButton size="xs" color="secondary" onPress={testSpeech} isDisabled={busyTest === "speech"}>
                                    Test Speech
                                </DuoButton>
                            }
                        >
                            <Connection ok={s.speech?.azureConfigured} title={s.speech?.azureConfigured ? "Azure Speech connected" : "Azure Speech not set"} note={`The mic, and the standardised voice. Region ${s.speech?.azureRegion || "southeastasia"}.`} />
                            <SettingRow title="Azure Speech key" hint="From the Azure portal, Keys and Endpoint. Leave blank to keep the existing key.">
                                <SecretField value={f.azureKey} onChange={(v) => patch({ azureKey: v })} ariaLabel="Azure Speech key" placeholder="Paste the key" />
                            </SettingRow>
                            <SettingRow title="Azure region" hint="The resource's location, for example southeastasia or westeurope.">
                                <Field value={f.azureRegion} onChange={(v) => patch({ azureRegion: v })} ariaLabel="Azure region" className={mono} />
                            </SettingRow>
                            <Connection ok={s.speech?.abairConfigured} title={s.speech?.abairConfigured ? "abair.ie connected" : "abair.ie not set"} note="The Connemara, Donegal and Kerry voices. Without it every voice is the standardised one." />
                            <SettingRow title="abair.ie API key" hint="Leave blank to keep the existing key.">
                                <SecretField value={f.abairKey} onChange={(v) => patch({ abairKey: v })} ariaLabel="abair.ie API key" placeholder="Paste the key" />
                            </SettingRow>
                            <TestResult result={speechTest} />
                        </SettingsCard>

                        {/* The Zoom Meeting SDK app behind the live room, and the switch that shows the room at all. */}
                        <SettingsCard id="zoom-card" title="Live classroom (Zoom)" sub='The Meeting SDK app that lets a class play inside the portal. From marketplace.zoom.us: a "Meeting SDK" app, its Client ID and Client Secret. The secret is encrypted server-side and never returned to the browser.'>
                            <Connection ok={s.zoom?.configured} title={s.zoom?.configured ? "Zoom connected" : "Zoom not set"} note={s.zoom?.enabled ? "The live room is switched on." : "The live room is switched off: students see no Live class tab and the console is hidden."} />
                            <SettingRow title="Client ID" hint="Public: it goes into every join signature.">
                                <Field autoComplete="off" value={f.zoomClientId} onChange={(v) => patch({ zoomClientId: v })} ariaLabel="Zoom Client ID" placeholder="Paste the Client ID" className={mono} />
                            </SettingRow>
                            <SettingRow title="Client Secret" hint="Leave blank to keep the existing secret.">
                                <SecretField value={f.zoomClientSecret} onChange={(v) => patch({ zoomClientSecret: v })} ariaLabel="Zoom Client Secret" placeholder={s.zoom?.secretConfigured ? "Set. Paste to replace." : "Paste the Client Secret"} />
                            </SettingRow>
                            <CheckRow checked={f.zoomEnabled} onChange={(on) => patch({ zoomEnabled: on })} label="Show the live room: a Live class tab for students, the console for teachers" />
                            <Connection
                                ok={s.zoom?.apiConfigured}
                                title={s.zoom?.apiConfigured ? "Zoom account connected" : "Zoom account not connected"}
                                note="Lets Go live start the meeting for you. It is the same Server-to-Server app the recordings import uses (ZOOM_ACCOUNT_ID and its keys on the server), and it needs the meeting:write:admin scope."
                            />
                            <SettingRow title="Host" hint="The Zoom user the meeting is created under. Leave blank for the account owner.">
                                <Field type="email" autoComplete="off" value={f.zoomHostEmail} onChange={(v) => patch({ zoomHostEmail: v })} ariaLabel="Zoom host email" placeholder="you@gaeilgeoirguides.com" />
                            </SettingRow>
                            <p className="text-sm text-tertiary">Without the account connected, Go live still works: paste the Zoom link you are hosting into the console instead.</p>
                            <div>
                                <DuoButton size="xs" color="secondary" onPress={testZoom} isDisabled={busyTest === "zoom"}>
                                    Test Zoom
                                </DuoButton>
                            </div>
                            <TestResult result={zoomTest} />
                        </SettingsCard>

                        {/* The Zoom account: the Server-to-Server app that lists recordings and reads attendance. */}
                        <SettingsCard id="zoom-account-card" title="Zoom account (recordings and attendance)" sub='A "Server-to-Server OAuth" app from marketplace.zoom.us, on the account that hosts the classes. With it, each class’s recording lands in its course by itself and attendance is read from Zoom after every class.'>
                            <Connection ok={s.zoomApi?.configured} title={s.zoomApi?.configured ? "Zoom account connected" : "Zoom account not set"} note={s.zoomApi?.configured ? "Recordings and attendance can be read." : "Paste the Account ID, Client ID and Client Secret from the app’s App Credentials page."} />
                            <SettingRow title="Account ID" hint="From the app’s App Credentials page.">
                                <Field autoComplete="off" value={f.zoomapiAccountId} onChange={(v) => patch({ zoomapiAccountId: v })} ariaLabel="Zoom account ID" className={mono} />
                            </SettingRow>
                            <SettingRow title="Client ID">
                                <Field autoComplete="off" value={f.zoomapiClientId} onChange={(v) => patch({ zoomapiClientId: v })} ariaLabel="Zoom account Client ID" className={mono} />
                            </SettingRow>
                            <SettingRow title="Client Secret" hint={s.zoomApi?.secretConfigured ? "Set. Leave blank to keep it." : "Not set."}>
                                <SecretField autoComplete="new-password" value={f.zoomapiClientSecret} onChange={(v) => patch({ zoomapiClientSecret: v })} ariaLabel="Zoom account Client Secret" placeholder={s.zoomApi?.secretConfigured ? "unchanged" : ""} />
                            </SettingRow>
                            <SettingRow title="Webhook secret token" hint={s.zoomApi?.webhookConfigured ? "Set. Leave blank to keep it." : "Optional: lets Zoom tell the portal the moment a recording is ready or a class ends."}>
                                <SecretField autoComplete="new-password" value={f.zoomapiWebhookSecret} onChange={(v) => patch({ zoomapiWebhookSecret: v })} ariaLabel="Zoom webhook secret token" placeholder={s.zoomApi?.webhookConfigured ? "unchanged" : ""} />
                            </SettingRow>
                            <Notice title="Scopes the app needs">
                                Under Scopes in the Marketplace app: <Code>cloud_recording:read:list_user_recordings:admin</Code>, <Code>cloud_recording:read:recording:admin</Code>, <Code>webinar:read:list_past_instances:admin</Code>, <Code>meeting:read:list_past_instances:admin</Code>, <Code>meeting:read:past_meeting:admin</Code>, <Code>report:read:list_webinar_participants:admin</Code>, <Code>report:read:list_meeting_participants:admin</Code> and <Code>user:read:user:admin</Code>. The app is never given permission to delete anything.
                            </Notice>
                            <Notice title="Webhook">
                                Under Feature, Event Subscriptions: endpoint <Code>{webhook}</Code>, events <Code>recording.completed</Code>, <Code>webinar.ended</Code> and <Code>meeting.ended</Code>. Paste its Secret Token above. Without it, an hourly sweep does the same work an hour later.
                            </Notice>
                            <div>
                                <DuoButton size="xs" color="secondary" onPress={testZoomApi} isDisabled={busyTest === "zoomapi"}>
                                    Test the Account
                                </DuoButton>
                            </div>
                            <TestResult result={zoomapiTest} />
                        </SettingsCard>

                        {/* Bunny Stream: where videos uploaded to the board go. */}
                        <SettingsCard id="bunny-card" title="Bunny Stream (videos)" sub="Videos you upload to a post go to this library and play inside the post. Playback links are signed for each reader, so a link copied out of the portal stops working.">
                            <Connection
                                ok={s.bunny?.configured}
                                title={s.bunny?.configured ? "Bunny Stream connected" : "Bunny Stream not set"}
                                note={s.bunny?.configured ? (s.bunny.tokenKeyConfigured ? "Videos upload and play with signed links." : "Videos upload and play. Add the token authentication key to make links private.") : "In bunny.net: Stream, your video library, then API. Paste the three values below."}
                            />
                            <SettingRow title="Video Library ID" hint="A number, on the library’s API page.">
                                <Field autoComplete="off" inputMode="numeric" value={f.bunnyLibraryId} onChange={(v) => patch({ bunnyLibraryId: v })} ariaLabel="Bunny Video Library ID" className={mono} />
                            </SettingRow>
                            <SettingRow title="API Key" hint={s.bunny?.apiKeyConfigured ? "Set. Leave blank to keep it." : "The library’s API key, on the same page. Not your account key."}>
                                <SecretField autoComplete="new-password" value={f.bunnyApiKey} onChange={(v) => patch({ bunnyApiKey: v })} ariaLabel="Bunny API Key" placeholder={s.bunny?.apiKeyConfigured ? "unchanged" : ""} />
                            </SettingRow>
                            <SettingRow title="Token authentication key" hint={s.bunny?.tokenKeyConfigured ? "Set. Leave blank to keep it." : "Under the library’s Security tab: switch on Embed view token authentication, then paste its key."}>
                                <SecretField autoComplete="new-password" value={f.bunnyTokenKey} onChange={(v) => patch({ bunnyTokenKey: v })} ariaLabel="Bunny token authentication key" placeholder={s.bunny?.tokenKeyConfigured ? "unchanged" : ""} />
                            </SettingRow>
                            <div>
                                <DuoButton size="xs" color="secondary" onPress={testBunny} isDisabled={busyTest === "bunny"}>
                                    Test the Library
                                </DuoButton>
                            </div>
                            <TestResult result={bunnyTest} />
                        </SettingsCard>
                    </div>

                    <aside className="flex flex-col gap-6">
                        <SettingsCard title="Draft lifecycle" sub="Clear states on the teacher side.">
                            <Connection ok title="Submission-triggered only" note="No reply is drafted for missing work." />
                            <div className="flex flex-wrap gap-1.5">
                                <Chip>AI drafted</Chip>
                                <Chip>Teacher edited</Chip>
                                <Chip>Returned</Chip>
                            </div>
                            <p className="text-sm text-tertiary">
                                <Kbd>←</Kbd> <Kbd>→</Kbd> moves through submissions. <Kbd>Enter</Kbd> submits feedback. <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> adds a line.
                            </p>
                        </SettingsCard>
                    </aside>
                </div>
            )}

            <DuoDialog open={preview !== null} onClose={() => setPreview(null)} title="Claude connection successful" className="max-w-2xl">
                <div className="rounded-2xl border-2 border-secondary bg-secondary p-4">
                    <p className="mb-2 duo-label text-quaternary">Draft preview</p>
                    <p className="text-md leading-7 whitespace-pre-line text-primary">{preview}</p>
                </div>
                <div className="mt-6 flex justify-end">
                    <DuoButton size="sm" onPress={() => setPreview(null)}>
                        Done
                    </DuoButton>
                </div>
            </DuoDialog>
        </>
    );
};

/* One switch on the What Claude drafts card, with the word On or Off beside it. */
const DraftSwitch = ({ on, onChange, title, hint }: { on: boolean; onChange: (on: boolean) => void; title: string; hint: string }) => (
    <SettingRow title={title} hint={hint} align="center">
        <Switch checked={on} onChange={onChange} label={on ? "On" : "Off"} />
    </SettingRow>
);

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded-md bg-primary px-1.5 py-0.5 font-mono text-xs text-primary break-all">{children}</code>;
const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="inline-block rounded-md border border-secondary bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-secondary">{children}</kbd>;
