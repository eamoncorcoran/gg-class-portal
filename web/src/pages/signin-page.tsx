// Sign in to the hub with the same email and password as before. The hub sets its session cookie,
// which every hub-backed screen here then uses.
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { DuoButton } from "@/components/app/duo";
import { FieldLabel } from "@/components/app/duo-dialog";
import { Page } from "@/components/app/page-parts";
import { Wordmark } from "@/components/app/app-sidebar";
import { type Me, api, refreshMe, useMe } from "@/lib/portal";

export const SignInPage = () => {
    const me = useMe();
    const nav = useNavigate();
    const [sp] = useSearchParams();
    const next = sp.get("next") || "/";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const go = async () => {
        if (!email.trim() || !password) return;
        setBusy(true);
        setErr(null);
        try {
            const r = await api<{ user: Me }>("/api/auth/login", { method: "POST", json: { email: email.trim(), password } });
            await refreshMe();
            nav(r.user.mustChangePassword || (r.user.mustSetAvatar && !r.user.hasAvatar) ? `/account?next=${encodeURIComponent(next)}` : next, { replace: true });
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
                <h1 className="mt-6 text-display-xs font-bold tracking-tight text-primary">Sign in</h1>
                <p className="mt-2 text-md text-tertiary">{me ? `You are signed in as ${me.name}.` : "Your usual Gaeilgeoir Guides login."}</p>
                {me === null && (
                    <form
                        className="mt-6 flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            go();
                        }}
                    >
                        <div>
                            <FieldLabel>Email</FieldLabel>
                            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/80 focus:border-brand" placeholder="you@example.com" autoFocus />
                        </div>
                        <div>
                            <FieldLabel>Password</FieldLabel>
                            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear focus:border-brand" />
                        </div>
                        {err && (
                            <p role="alert" className="rounded-xl bg-error-primary px-3 py-2 text-sm font-semibold text-error-primary">
                                {err}
                            </p>
                        )}
                        <DuoButton type="submit" full isDisabled={busy || !email.trim() || !password}>
                            {busy ? "One moment…" : "Sign in"}
                        </DuoButton>
                        <Link to="/forgot" className="text-center text-sm font-bold text-brand-secondary hover:underline">
                            Forgot your password?
                        </Link>
                    </form>
                )}
                {me && (
                    <div className="mt-6">
                        <DuoButton full href={next}>
                            Carry on
                        </DuoButton>
                    </div>
                )}
            </div>
        </Page>
    );
};
// Plain inputs on purpose (not DuoInput): the browser's password manager wants real inputs.
