// Your account: photograph, board emails, password, calendar feed, and for students the postal
// address and the course withdrawal form. Ported from the old app's openAccountModal, renderAuth
// ('change' and 'avatar' modes), bindAccountPhoto, bindAvatarForm, notificationSettings,
// openCalendarSubscribeModal, openAddressModal and openWithdrawalForm.
//
// Two steps are forced first, as the old app forced them: a first sign-in with a temporary password
// has to pick a real one, and a student with no photograph has to add one (?avatar=1 jumps there too,
// which is where every 428 avatar_required sends them).
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button as AriaButton } from "react-aria-components";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton, DuoCard } from "@/components/app/duo";
import { DuoDialog, FieldLabel } from "@/components/app/duo-dialog";
import { DuoSelect } from "@/components/app/duo-select";
import { User01 } from "@/components/app/ic";
import { Page, PageHeader } from "@/components/app/page-parts";
import { toast } from "@/components/app/toast";
import { Wordmark } from "@/components/app/app-sidebar";
import { Toggle } from "@/components/base/toggle/toggle";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import {
    AVATAR_ACCEPT, AVATAR_MAX_BYTES, AVATAR_TOO_BIG, type Address, COUNTIES, type CalendarFeed, INPUT, type Notifications, TEXTAREA,
    WITHDRAWAL_REASONS, type WithdrawalBody, type WithdrawalState, avatarUrl, webcalUrl,
} from "@/lib/account";
import { type Me, api, loadStudentBootstrap, refreshMe, signOut, upload, useApi, useMe } from "@/lib/portal";
import { cx } from "@/utils/cx";
import { PasswordRules, SignInCard, usePasswordPolicy } from "./password-pages";

const ErrorBanner = ({ children }: { children: string }) => (
    <p role="alert" className="rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">
        {children}
    </p>
);

/* ---- the photograph preview + hidden picker shared by the forced step and the settings card ---- */

const PhotoPreview = ({ src }: { src: string | null }) => (
    <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-secondary bg-secondary">
        {src ? <img src={src} alt="" className="size-full object-cover" /> : <User01 aria-hidden="true" className="size-10 text-fg-quaternary" />}
    </div>
);

/** Reads the chosen file, refuses one over 6MB, and hands back a preview data URL. */
const readPhoto = (file: File, onPreview: (dataUrl: string) => void) => {
    if (file.size > AVATAR_MAX_BYTES) {
        toast(AVATAR_TOO_BIG);
        return false;
    }
    // Shown before it is sent: nobody should find out what they uploaded by seeing it appear on the feed.
    const reader = new FileReader();
    reader.onload = () => onPreview(String(reader.result));
    reader.readAsDataURL(file);
    return true;
};

const sendPhoto = (file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    return upload<{ ok: boolean }>("/api/auth/avatar", form);
};

/* ---- step 1: a first sign-in has to choose its own password (renderAuth 'change') ---------- */

const ChangePasswordStep = ({ next }: { next: string }) => {
    const nav = useNavigate();
    const minimumLength = usePasswordPolicy();
    const [current, setCurrent] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const go = async (e: FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setErr(null);
        try {
            await api("/api/auth/change-password", { method: "POST", json: { currentPassword: current, newPassword: password } });
            toast("Password changed");
            // Straight on to the photograph rather than into the portal, so the ask lands while
            // somebody is still in setting-up mode. refreshMe re-renders this page into that step.
            const u = await refreshMe();
            if (!(u?.mustSetAvatar && !u.hasAvatar)) nav(next, { replace: true });
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Page>
            <div className="mx-auto mt-6 max-w-md rounded-3xl border-2 border-secondary bg-primary p-7 md:mt-16 md:p-9">
                <Wordmark />
                <h1 className="mt-6 text-display-xs font-bold tracking-tight text-primary">Protect your account</h1>
                <p className="mt-2 text-md text-tertiary">Choose your own strong password before continuing.</p>
                <form className="mt-6 flex flex-col gap-4" onSubmit={go}>
                    <div>
                        <FieldLabel>Temporary password</FieldLabel>
                        <input type="password" name="currentPassword" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT} autoFocus />
                    </div>
                    <div>
                        <FieldLabel>New password</FieldLabel>
                        <input type="password" name="newPassword" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
                        <PasswordRules value={password} minimumLength={minimumLength} />
                    </div>
                    {err && <ErrorBanner>{err}</ErrorBanner>}
                    <DuoButton type="submit" full isDisabled={busy || !current || !password}>
                        {busy ? "One moment…" : "Save New Password"}
                    </DuoButton>
                    <p className="text-center text-sm text-tertiary">You will remain signed in on this device after changing your password.</p>
                </form>
            </div>
        </Page>
    );
};

/* ---- step 2: the photograph (renderAuth 'avatar' + bindAvatarForm) ------------------------- */

/* Asked for once, on the way in, after the password is set. Not skippable and not buried in
   settings: a feed of faces only works if everybody has one, and the only moment everybody reliably
   passes through is this one. */
const AvatarStep = ({ forced, next, onDone }: { forced: boolean; next: string | null; onDone: () => void }) => {
    const nav = useNavigate();
    const input = useRef<HTMLInputElement>(null);
    const [chosen, setChosen] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const pick = (file: File | undefined) => {
        if (!file) return;
        if (!readPhoto(file, setPreview)) return;
        setChosen(file);
    };
    const go = async (e: FormEvent) => {
        e.preventDefault();
        if (!chosen || busy) return;
        setBusy(true);
        setErr(null);
        try {
            await sendPhoto(chosen);
            await refreshMe();
            toast("Go raibh maith agat");
            if (next !== null) nav(next, { replace: true });
            else onDone();
        } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
        }
    };
    return (
        <Page>
            <div className="mx-auto mt-6 max-w-md rounded-3xl border-2 border-secondary bg-primary p-7 md:mt-16 md:p-9">
                <Wordmark />
                <h1 className="mt-6 text-display-xs font-bold tracking-tight text-primary">{forced ? "Add your photograph" : "Your photograph"}</h1>
                <p className="mt-2 text-md text-tertiary">{forced ? "One more thing, then you are in." : "Your class sees this beside anything you post."}</p>
                <form className="mt-6 flex flex-col gap-5" onSubmit={go}>
                    <div className="flex items-center gap-4">
                        <PhotoPreview src={preview} />
                        <div className="min-w-0">
                            <DuoButton color="secondary" size="sm" onPress={() => input.current?.click()}>
                                Choose a Photograph
                            </DuoButton>
                            <p className="mt-2 text-sm text-tertiary">A clear photo of your face. JPEG, PNG or WebP, up to 6MB. Your class sees it beside anything you post.</p>
                        </div>
                    </div>
                    <input ref={input} type="file" accept={AVATAR_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                    {err && <ErrorBanner>{err}</ErrorBanner>}
                    <DuoButton type="submit" full isDisabled={!chosen || busy}>
                        {busy ? "Saving…" : "Save and Continue"}
                    </DuoButton>
                    {!forced && (
                        <AriaButton onPress={onDone} className="text-center text-sm font-bold text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2">
                            Back to your account
                        </AriaButton>
                    )}
                </form>
            </div>
        </Page>
    );
};

/* ---- the settings proper ------------------------------------------------------------------ */

const Section = ({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) => (
    <DuoCard className={cx("flex flex-col gap-4", className)}>
        <div>
            <h2 className="text-lg font-bold text-primary">{title}</h2>
            {note && <p className="mt-1 text-sm leading-6 text-tertiary">{note}</p>}
        </div>
        {children}
    </DuoCard>
);

/* Changing a photograph after the first one. The same endpoint, the same preview-before-send, and
   the picture on screen is refreshed rather than left showing the cached old one. */
const PhotoSection = ({ me }: { me: Me }) => {
    const input = useRef<HTMLInputElement>(null);
    const [stamp, setStamp] = useState(() => Date.now());
    const [preview, setPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const change = async (file: File | undefined) => {
        if (!file) return;
        if (!readPhoto(file, setPreview)) return;
        setBusy(true);
        try {
            await sendPhoto(file);
            await refreshMe();
            setStamp(Date.now());
            toast("Photograph updated");
        } catch (e) {
            toast((e as Error).message);
            setPreview(null);
        } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
        }
    };
    return (
        <Section title="Photograph" note="Your class sees this beside anything you post.">
            <div className="flex items-center gap-4">
                <PhotoPreview src={preview || (me.hasAvatar ? avatarUrl(me.id, stamp) : null)} />
                <div>
                    <DuoButton color="secondary" size="sm" onPress={() => input.current?.click()} isDisabled={busy}>
                        {busy ? "Saving…" : me.hasAvatar ? "Change Photograph" : "Add a Photograph"}
                    </DuoButton>
                    <p className="mt-2 text-xs text-quaternary">JPEG, PNG or WebP, up to 6MB.</p>
                </div>
                <input ref={input} type="file" accept={AVATAR_ACCEPT} className="hidden" onChange={(e) => change(e.target.files?.[0])} />
            </div>
        </Section>
    );
};

/* Turning the board's emails off. On by default, because a board nobody hears about is a board nobody
   reads. Loaded after the page is drawn rather than before, so Settings still opens instantly if this
   request is slow or fails. */
const NotificationsSection = () => {
    const [prefs, setPrefs] = useState<Notifications>({ boardPosts: true, boardReplies: true });
    useEffect(() => {
        api<Notifications>("/api/auth/notifications")
            .then((cur) => setPrefs({ boardPosts: cur.boardPosts !== false, boardReplies: cur.boardReplies !== false }))
            .catch(() => setPrefs({ boardPosts: true, boardReplies: true }));
    }, []);
    const save = async (key: keyof Notifications, wanted: boolean) => {
        setPrefs((p) => ({ ...p, [key]: wanted }));
        try {
            await api("/api/auth/notifications", { method: "PUT", json: { [key]: wanted } });
            toast(wanted ? "Emails on" : "Emails off");
        } catch (e) {
            // Put the switch back rather than leaving it showing something untrue.
            setPrefs((p) => ({ ...p, [key]: !wanted }));
            toast((e as Error).message);
        }
    };
    return (
        <Section title="Notifications" note="Emails about the class board. Turning these off does not affect homework reminders or anything about your own work.">
            <div className="flex flex-col gap-3">
                <Toggle size="md" className="max-w-full" label="Email me when there is a new post" isSelected={prefs.boardPosts} onChange={(v) => save("boardPosts", v)} />
                <Toggle size="md" className="max-w-full" label="Email me when somebody replies to a post I am part of" isSelected={prefs.boardReplies} onChange={(v) => save("boardReplies", v)} />
            </div>
        </Section>
    );
};

const PasswordSection = () => {
    const minimumLength = usePasswordPolicy();
    const [current, setCurrent] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const go = async (e: FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
            await api("/api/auth/change-password", { method: "POST", json: { currentPassword: current, newPassword: password } });
            toast("Password changed");
            setCurrent("");
            setPassword("");
        } catch (e) {
            toast((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Section title="Password">
            <form className="flex flex-col gap-4" onSubmit={go}>
                <div>
                    <FieldLabel>Current password</FieldLabel>
                    <input type="password" name="currentPassword" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT} />
                </div>
                <div>
                    <FieldLabel>New password</FieldLabel>
                    <input type="password" name="newPassword" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
                    <PasswordRules value={password} minimumLength={minimumLength} />
                </div>
                <div>
                    <DuoButton type="submit" size="sm" isDisabled={busy || !current || !password}>
                        {busy ? "Saving…" : "Save New Password"}
                    </DuoButton>
                </div>
            </form>
        </Section>
    );
};

/* Subscribing beats downloading: the calendar app re-reads the feed, so a moved deadline or a new
   assignment turns up without anyone adding it again. */
const CalendarDialog = ({ open, onClose, role }: { open: boolean; onClose: () => void; role: Me["role"] }) => {
    const base = role === "admin" ? "/api/admin/calendar-feed" : "/api/student/calendar-feed";
    const [feed, setFeed] = useState<CalendarFeed | null>(null);
    const field = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open) return;
        setFeed(null);
        api<CalendarFeed>(base)
            .then(setFeed)
            .catch((e) => {
                toast((e as Error).message);
                onClose();
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, base]);
    const copy = async () => {
        if (!feed) return;
        try {
            await navigator.clipboard.writeText(feed.url);
            toast("Link copied");
        } catch {
            field.current?.select();
            toast("Press Cmd+C to copy");
        }
    };
    const rotate = async () => {
        if (!(await askConfirm({ title: "Reset your calendar link?", message: "Any calendar already subscribed stops updating until you add the new link. Use this if you think someone else has the old one.", confirmLabel: "Reset link", danger: true }))) return;
        try {
            setFeed(await api<CalendarFeed>(`${base}/rotate`, { method: "POST" }));
            toast("Link reset. Re-add it in your calendar app.");
        } catch (e) {
            toast((e as Error).message);
        }
    };
    return (
        <DuoDialog open={open} onClose={onClose} title="Add deadlines to your calendar" sub="Subscribe once and it stays up to date on its own." className="max-w-xl">
            {!feed ? (
                <p className="text-sm text-quaternary">Getting your link…</p>
            ) : (
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-tertiary">This link is private to you. Anyone who has it can read your deadlines, so treat it like a password.</p>
                    <div>
                        <FieldLabel>Your calendar link</FieldLabel>
                        <input ref={field} readOnly value={feed.url} aria-label="Your calendar link" className={cx(INPUT, "font-mono text-sm")} onFocus={(e) => e.target.select()} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <DuoButton color="secondary" size="sm" onPress={copy}>
                            Copy Link
                        </DuoButton>
                        <DuoButton size="sm" href={webcalUrl(feed.url)}>
                            Open in Your Calendar App
                        </DuoButton>
                    </div>
                    <div>
                        <p className="duo-label text-quaternary">How to add it</p>
                        <ul className="mt-2 flex flex-col gap-2 text-sm leading-6 text-secondary">
                            <li>
                                <strong>iPhone or Mac:</strong> tap <em>Open in your calendar app</em>, or Calendar, File, New Calendar Subscription and paste the link.
                            </li>
                            <li>
                                <strong>Google Calendar:</strong> Other calendars, From URL, paste the link.
                            </li>
                            <li>
                                <strong>Outlook:</strong> Add calendar, Subscribe from web, paste the link.
                            </li>
                        </ul>
                    </div>
                    <p className="text-sm text-tertiary">Calendar apps refresh on their own schedule, often only every few hours. The feed carries every published deadline{role === "admin" ? " across your classes" : ""}.</p>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <DuoButton color="danger" size="sm" onPress={rotate}>
                            Reset Link
                        </DuoButton>
                        <DuoButton size="sm" onPress={onClose}>
                            Done
                        </DuoButton>
                    </div>
                </div>
            )}
        </DuoDialog>
    );
};

/* The address, asked for once and then left alone, so that anything on paper can actually be posted. */
const AddressDialog = ({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (a: Address) => void }) => {
    const [line1, setLine1] = useState("");
    const [line2, setLine2] = useState("");
    const [county, setCounty] = useState("");
    const [eircode, setEircode] = useState("");
    const [counties, setCounties] = useState<string[]>(COUNTIES);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        api<Address>("/api/student/address")
            .then((cur) => {
                setLine1(cur.address_line1 || "");
                setLine2(cur.address_line2 || "");
                setCounty(cur.address_county || "");
                setEircode(cur.eircode || "");
                if (cur.counties?.length) setCounties(cur.counties);
            })
            .catch(() => undefined);
    }, [open]);
    const save = async (e?: FormEvent) => {
        e?.preventDefault();
        const body = { line1: line1.trim(), line2: line2.trim(), county, eircode: eircode.trim() };
        if (!body.line1 || !body.county || !body.eircode) return toast("Fill in your address, county and Eircode.");
        setBusy(true);
        try {
            const saved = await api<Address>("/api/student/address", { method: "PUT", json: body });
            onSaved(saved);
            onClose();
            toast("Thank you, that is saved");
        } catch (e) {
            toast((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const CHOOSE = "__choose";
    return (
        <DuoDialog open={open} onClose={onClose} title="Your address" sub="So we can post things out to you.">
            <form className="flex flex-col gap-4" onSubmit={save}>
                <div>
                    <FieldLabel>Address line 1</FieldLabel>
                    <input name="line1" required maxLength={200} autoComplete="address-line1" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="12 Ard na Gréine" className={INPUT} />
                </div>
                <div>
                    <FieldLabel>Address line 2 (optional)</FieldLabel>
                    <input name="line2" maxLength={200} autoComplete="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Ballinfoyle" className={INPUT} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <FieldLabel>County</FieldLabel>
                        <DuoSelect label="County" value={county || CHOOSE} onChange={(id) => setCounty(id === CHOOSE ? "" : id)} items={[{ id: CHOOSE, label: "Choose your county" }, ...counties.map((c) => ({ id: c, label: c }))]} className="w-full" />
                    </div>
                    <div>
                        <FieldLabel>Eircode</FieldLabel>
                        <input name="eircode" required maxLength={10} autoComplete="postal-code" value={eircode} onChange={(e) => setEircode(e.target.value)} placeholder="A65 F4E2" className={INPUT} />
                    </div>
                </div>
                <p className="text-sm text-tertiary">
                    You can look your Eircode up at{" "}
                    <a href="https://finder.eircode.ie" target="_blank" rel="noopener noreferrer" className="font-bold text-brand-secondary hover:underline">
                        finder.eircode.ie
                    </a>
                    .
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <DuoButton color="secondary" size="sm" onPress={onClose}>
                        Not Now
                    </DuoButton>
                    <DuoButton type="submit" size="sm" isDisabled={busy}>
                        {busy ? "Saving…" : "Save Address"}
                    </DuoButton>
                </div>
            </form>
        </DuoDialog>
    );
};

/* The withdrawal form. One page rather than the rolling format used elsewhere: somebody leaving
   should not be walked through eight separate screens. Only the first question is required; every
   other answer is a favour they are doing us. */
const NONE = "__none";
const RatingRow = ({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) => (
    <div>
        <FieldLabel>{label}</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
                <AriaButton
                    key={n}
                    onPress={() => onChange(n)}
                    aria-label={`${n} of 5`}
                    aria-pressed={value === n}
                    className={cx(
                        "size-10 rounded-xl border-2 text-sm font-bold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                        value !== undefined && n <= value ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary bg-primary text-tertiary hover:bg-primary_hover",
                    )}
                >
                    {n}
                </AriaButton>
            ))}
            <span className="text-xs text-quaternary">1 poor · 5 excellent</span>
        </div>
    </div>
);

const WithdrawalDialog = ({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) => {
    const [reason, setReason] = useState(WITHDRAWAL_REASONS[0]);
    const [detail, setDetail] = useState("");
    const [ratings, setRatings] = useState<{ overall?: number; teaching?: number; materials?: number }>({});
    const [pace, setPace] = useState(NONE);
    const [worked, setWorked] = useState("");
    const [improve, setImprove] = useState("");
    const [recommend, setRecommend] = useState(NONE);
    const [mayContact, setMayContact] = useState(false);
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (busy) return;
        if (!(await askConfirm({ title: "Submit the withdrawal form?", message: "This ends your place on the course. Reminders and new homework stop. Everything you have already done stays in your account.", confirmLabel: "Submit and withdraw", danger: true }))) return;
        setBusy(true);
        const body: WithdrawalBody = {
            reason,
            detail,
            overallRating: ratings.overall,
            teachingRating: ratings.teaching,
            materialsRating: ratings.materials,
            pace: pace === NONE ? "" : pace,
            whatWorked: worked,
            whatToImprove: improve,
            wouldRecommend: recommend === NONE ? "" : recommend,
            mayContact,
        };
        try {
            await api("/api/student/withdrawal", { method: "POST", json: body });
            onClose();
            onDone();
        } catch (e) {
            toast((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <DuoDialog open={open} onClose={onClose} title="Course withdrawal form" sub="Only the first question is required." className="max-w-3xl">
            <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
                <div>
                    <FieldLabel>What is the main reason you are leaving?</FieldLabel>
                    <DuoSelect label="Main reason" value={reason} onChange={setReason} items={WITHDRAWAL_REASONS.map((r) => ({ id: r, label: r }))} className="w-full" />
                </div>
                <div>
                    <FieldLabel>Anything you would like to add?</FieldLabel>
                    <textarea aria-label="Anything you would like to add?" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Optional. It stays between you and Gaeilgeoir Guides." className={TEXTAREA} />
                </div>
                <p className="duo-label text-quaternary">How was the course?</p>
                <RatingRow label="Overall" value={ratings.overall} onChange={(v) => setRatings((r) => ({ ...r, overall: v }))} />
                <RatingRow label="The teaching" value={ratings.teaching} onChange={(v) => setRatings((r) => ({ ...r, teaching: v }))} />
                <RatingRow label="The materials and homework" value={ratings.materials} onChange={(v) => setRatings((r) => ({ ...r, materials: v }))} />
                <div>
                    <FieldLabel>How was the pace?</FieldLabel>
                    <DuoSelect label="Pace" value={pace} onChange={setPace} items={[{ id: NONE, label: "Prefer not to say" }, { id: "Too slow", label: "Too slow" }, { id: "About right", label: "About right" }, { id: "Too fast", label: "Too fast" }]} className="w-full" />
                </div>
                <div>
                    <FieldLabel>What worked well for you?</FieldLabel>
                    <textarea aria-label="What worked well for you?" value={worked} onChange={(e) => setWorked(e.target.value)} placeholder="Optional" className={TEXTAREA} />
                </div>
                <div>
                    <FieldLabel>What would you change?</FieldLabel>
                    <textarea aria-label="What would you change?" value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Optional" className={TEXTAREA} />
                </div>
                <div>
                    <FieldLabel>Would you recommend Gaeilgeoir Guides to someone else?</FieldLabel>
                    <DuoSelect label="Would you recommend us" value={recommend} onChange={setRecommend} items={[{ id: NONE, label: "Prefer not to say" }, { id: "Yes", label: "Yes" }, { id: "Maybe", label: "Maybe" }, { id: "No", label: "No" }]} className="w-full" />
                </div>
                <Checkbox size="md" label="Éamon may contact me about my answers" isSelected={mayContact} onChange={setMayContact} />
                <p className="rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">Submitting this ends your place on the course. Reminders and new homework stop, and everything you have already done stays in your account.</p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DuoButton color="secondary" size="sm" onPress={onClose}>
                    Cancel
                </DuoButton>
                <DuoButton color="danger" size="sm" onPress={submit} isDisabled={busy}>
                    {busy ? "Submitting…" : "Submit and Withdraw"}
                </DuoButton>
            </div>
        </DuoDialog>
    );
};

const Disclosure = ({ summary, children }: { summary: string; children: ReactNode }) => (
    <details className="group rounded-2xl border-2 border-secondary">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-secondary select-none marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-block transition-transform duration-150 group-open:rotate-90">›</span>
            {summary}
        </summary>
        <div className="border-t-2 border-secondary px-4 py-4">{children}</div>
    </details>
);

const AccountSettings = ({ me }: { me: Me }) => {
    const nav = useNavigate();
    const student = me.role === "student";
    const withdrawal = useApi<WithdrawalState>(student ? "/api/student/withdrawal" : null);
    const address = useApi<Address>(student ? "/api/student/address" : null);
    const [calendar, setCalendar] = useState(false);
    const [addressOpen, setAddressOpen] = useState(false);
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [thanks, setThanks] = useState(false);
    const withdrawn = withdrawal.data?.withdrawnAt || null;
    const logout = async () => {
        await signOut();
        nav("/signin", { replace: true });
    };
    return (
        <Page>
            <PageHeader
                kicker="Settings"
                title="Your account"
                sub={`${me.name} · ${me.email}`}
                actions={
                    <DuoButton color="danger" size="sm" onPress={logout}>
                        Log Out
                    </DuoButton>
                }
            />
            <div className="grid gap-5 lg:grid-cols-2">
                <PhotoSection me={me} />
                <NotificationsSection />
                <PasswordSection />
                <Section title="Calendar" note="Add every published deadline to your own calendar app. It stays up to date on its own.">
                    <div>
                        <DuoButton color="secondary" size="sm" onPress={() => setCalendar(true)}>
                            Add Deadlines to Your Calendar
                        </DuoButton>
                    </div>
                </Section>
                {student && (
                    <Section title="Your address" note="So we can post things out to you.">
                        {address.data?.complete && (
                            <p className="text-sm leading-6 text-secondary">
                                {address.data.address_line1}
                                {address.data.address_line2 ? `, ${address.data.address_line2}` : ""}, Co. {address.data.address_county}, {address.data.eircode}
                            </p>
                        )}
                        <div>
                            <DuoButton color="secondary" size="sm" onPress={() => setAddressOpen(true)}>
                                {address.data?.complete ? "Update Your Address" : "Add Your Address"}
                            </DuoButton>
                        </div>
                    </Section>
                )}
                {student &&
                    (withdrawn ? (
                        <DuoCard tone="locked" className="lg:col-span-2">
                            <p className="text-md font-bold text-primary">You have withdrawn from this course.</p>
                            <p className="mt-1 text-sm leading-6 text-tertiary">
                                Recorded {new Date(withdrawn).toLocaleDateString("en-IE", { dateStyle: "medium", timeZone: "Europe/Dublin" })}. No further work is expected and reminders have stopped. Everything you submitted is still here.
                            </p>
                        </DuoCard>
                    ) : (
                        withdrawal.data && (
                            <div className="lg:col-span-2">
                                <Disclosure summary="Options">
                                    <Disclosure summary="Stepping Back">
                                        <p className="text-sm leading-6 text-secondary">If you must step back from the course for whatever reason please fill in the below form.</p>
                                        <div className="mt-3">
                                            <DuoButton color="secondary" size="sm" onPress={() => setWithdrawOpen(true)}>
                                                Course Withdrawal Form
                                            </DuoButton>
                                        </div>
                                    </Disclosure>
                                </Disclosure>
                            </div>
                        )
                    ))}
            </div>

            <CalendarDialog open={calendar} onClose={() => setCalendar(false)} role={me.role} />
            {student && <AddressDialog open={addressOpen} onClose={() => setAddressOpen(false)} onSaved={(a) => address.set({ ...a, complete: true })} />}
            {student && (
                <WithdrawalDialog
                    open={withdrawOpen}
                    onClose={() => setWithdrawOpen(false)}
                    onDone={() => {
                        withdrawal.reload();
                        loadStudentBootstrap(true).catch(() => undefined);
                        setThanks(true);
                    }}
                />
            )}
            <DuoDialog open={thanks} onClose={() => setThanks(false)} title="Thank you">
                <p className="rounded-xl bg-success-primary px-3 py-2 text-sm font-semibold text-success-primary">Your withdrawal has been recorded. You will not receive any more reminders, and no further work is expected.</p>
                <p className="mt-3 text-sm leading-6 text-tertiary">Everything you submitted and every piece of feedback stays in your account. Go raibh míle maith agat, and the best of luck with the Gaeilge.</p>
                <div className="mt-6 flex justify-end">
                    <DuoButton size="sm" onPress={() => setThanks(false)}>
                        Close
                    </DuoButton>
                </div>
            </DuoDialog>
        </Page>
    );
};

/* ---- the page ------------------------------------------------------------------------------ */

export const AccountPage = () => {
    const me = useMe();
    const [sp, setSp] = useSearchParams();
    const next = sp.get("next") || "/";
    const cameFrom = sp.get("next");
    if (me === undefined)
        return (
            <Page>
                <p className="text-sm text-quaternary">Loading your account…</p>
            </Page>
        );
    if (!me) return <SignInCard next="/account" title="Sign in to your account" note="Your photograph, password, notifications and calendar feed live here. Sign in first." />;
    // The same gate the old app's boot() applied: password first, then the photograph.
    if (me.mustChangePassword) return <ChangePasswordStep next={next} />;
    const forcedAvatar = Boolean(me.mustSetAvatar && !me.hasAvatar);
    const wantAvatar = sp.get("avatar") === "1";
    const leaveAvatarStep = () =>
        setSp(
            (p) => {
                p.delete("avatar");
                return p;
            },
            { replace: true },
        );
    if (forcedAvatar || wantAvatar) return <AvatarStep forced={forcedAvatar} next={forcedAvatar ? next : cameFrom} onDone={leaveAvatarStep} />;
    return <AccountSettings me={me} />;
};
