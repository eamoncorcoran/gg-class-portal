// Forgot and reset password, the two public auth screens (ported from renderAuth's 'forgot' and
// 'reset' modes in the old app.js). Also home to two bits the other student pages share: the
// password-rules chips under a new-password field, and the short "sign in first" card.
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { FieldLabel } from "@/components/app/duo-dialog";
import { Page } from "@/components/app/page-parts";
import { toast } from "@/components/app/toast";
import { Wordmark } from "@/components/app/app-sidebar";
import { INPUT, PASSWORD_RULES, type PasswordPolicy, passwordChecks, signInHref } from "@/lib/account";
import { api, useApi } from "@/lib/portal";
import { cx } from "@/utils/cx";

/** The card a signed-out visitor sees on any hub screen: one line and the way in. */
export const SignInCard = ({ next, title = "Sign in to see this", note = "This part of the hub is for students and teachers of Gaeilgeoir Guides. Sign in with your usual login." }: { next: string; title?: string; note?: string }) => (
    <Page>
        <div className="mx-auto mt-6 max-w-md rounded-3xl border-2 border-secondary bg-primary p-7 md:mt-16 md:p-9">
            <Wordmark />
            <h1 className="mt-6 text-display-xs font-bold tracking-tight text-primary">{title}</h1>
            <p className="mt-2 text-md text-tertiary">{note}</p>
            <div className="mt-6">
                <DuoButton full href={signInHref(next)}>
                    Sign in
                </DuoButton>
            </div>
        </div>
    </Page>
);

/** The five rule chips that light up as a new password meets them (passwordRules + updatePasswordRules). */
export const PasswordRules = ({ value, minimumLength = 12 }: { value: string; minimumLength?: number }) => {
    const ok = passwordChecks(value, minimumLength);
    return (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Password rules">
            {PASSWORD_RULES.map((r) => (
                <span key={r.id} className={cx("rounded-full px-2.5 py-1 text-xs font-bold transition-colors duration-150", ok[r.id] ? "bg-success-primary text-success-primary" : "bg-secondary text-quaternary")}>
                    {r.id === "length" ? `${minimumLength}+ characters` : r.label}
                </span>
            ))}
        </div>
    );
};

/** The server's password policy; 12 characters when it cannot be reached (the old app hard-coded 12). */
export const usePasswordPolicy = () => {
    const { data } = useApi<PasswordPolicy>("/api/auth/password-policy");
    return data?.minimumLength ?? 12;
};

const Banner = ({ tone, children }: { tone: "error" | "success"; children: string }) => (
    <p role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl px-3 py-2 text-sm font-semibold", tone === "error" ? "bg-error-primary text-error-primary" : "bg-success-primary text-success-primary")}>
        {children}
    </p>
);

const AuthCard = ({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) => (
    <Page>
        <div className="mx-auto mt-6 max-w-md rounded-3xl border-2 border-secondary bg-primary p-7 md:mt-16 md:p-9">
            <Wordmark />
            <h1 className="mt-6 text-display-xs font-bold tracking-tight text-primary">{title}</h1>
            <p className="mt-2 text-md text-tertiary">{sub}</p>
            {children}
        </div>
    </Page>
);

/* ---- /forgot -------------------------------------------------------------------------------- */

export const ForgotPage = () => {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [sent, setSent] = useState<string | null>(null);
    const go = async (e: FormEvent) => {
        e.preventDefault();
        if (!email.trim() || busy) return;
        setBusy(true);
        setErr(null);
        try {
            const data = await api<{ ok: boolean; message: string }>("/api/auth/forgot-password", { method: "POST", json: { email: email.trim() } });
            // The old app went back to the sign-in screen carrying this message; here it shows in place.
            setSent(data.message || "If that email exists, a reset link has been sent.");
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <AuthCard title="Reset your password" sub="Enter your email and we will send a secure reset link.">
            {sent ? (
                <div className="mt-6 flex flex-col gap-4">
                    <Banner tone="success">{sent}</Banner>
                    <DuoButton full href="/signin">
                        Back to Sign In
                    </DuoButton>
                </div>
            ) : (
                <form className="mt-6 flex flex-col gap-4" onSubmit={go}>
                    <div>
                        <FieldLabel>Email address</FieldLabel>
                        <input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} autoFocus />
                    </div>
                    {err && <Banner tone="error">{err}</Banner>}
                    <DuoButton type="submit" full isDisabled={busy || !email.trim()}>
                        {busy ? "One moment…" : "Send Reset Link"}
                    </DuoButton>
                    <Link to="/signin" className="text-center text-sm font-bold text-brand-secondary hover:underline">
                        Back to sign in
                    </Link>
                </form>
            )}
        </AuthCard>
    );
};

/* ---- /reset?token=… ------------------------------------------------------------------------- */

export const ResetPage = () => {
    const [sp] = useSearchParams();
    // `token` is the new link; `reset` is what the old app's emails carried (/?reset=TOKEN).
    const token = sp.get("token") || sp.get("reset") || "";
    const nav = useNavigate();
    const minimumLength = usePasswordPolicy();
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    useEffect(() => {
        if (!token) setErr("The reset link or password is invalid.");
    }, [token]);
    const go = async (e: FormEvent) => {
        e.preventDefault();
        if (!password || busy) return;
        setBusy(true);
        setErr(null);
        try {
            await api("/api/auth/reset-password", { method: "POST", json: { token, newPassword: password } });
            toast("Your password was reset. You can now sign in.");
            nav("/signin", { replace: true });
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <AuthCard title="Choose a new password" sub="This reset link expires after one hour.">
            <form className="mt-6 flex flex-col gap-4" onSubmit={go}>
                <div>
                    <FieldLabel>New password</FieldLabel>
                    <input type="password" name="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} autoFocus disabled={!token} />
                    <PasswordRules value={password} minimumLength={minimumLength} />
                </div>
                {err && <Banner tone="error">{err}</Banner>}
                <DuoButton type="submit" full isDisabled={busy || !password || !token}>
                    {busy ? "One moment…" : "Set New Password"}
                </DuoButton>
                {!token && (
                    <Link to="/forgot" className="text-center text-sm font-bold text-brand-secondary hover:underline">
                        Ask for a new reset link
                    </Link>
                )}
            </form>
        </AuthCard>
    );
};
