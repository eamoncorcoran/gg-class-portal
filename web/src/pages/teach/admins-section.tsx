// /teach/admins: who can run this place. Super administrators only: the nav hides it for others and
// the server refuses them, but the screen says so too. List, add (name, email, super admin flag, the
// same invitation a student gets), promote or demote, suspend or restore. A port of adminsView,
// openAdminModal and the data-admin-* bindings from the old app.js.
import { type FormEvent, useState } from "react";
import { SectionHead } from "@/components/app/console";
import { askConfirm } from "@/components/app/confirm";
import { DuoButton } from "@/components/app/duo";
import { DuoDialog } from "@/components/app/duo-dialog";
import { toast } from "@/components/app/toast";
import { api, useApi, useMe } from "@/lib/portal";
import { type AdminCreated, type AdminsResponse, fmtDate } from "@/lib/teach-settings";
import { CheckRow, Chip, Labelled, Quiet, TableWrap, tdCls, thCls } from "./settings-cards";
import { cx } from "@/utils/cx";

const inputCls = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden focus:border-brand";

export const AdminsSection = () => {
    const me = useMe();
    const isSuper = Boolean(me?.isSuperAdmin);
    const list = useApi<AdminsResponse>(isSuper ? "/api/admin/admins" : null);
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    if (me && !isSuper) {
        return (
            <>
                <SectionHead kicker="Administrators" title="Super administrators only" sub="Only a super administrator can see who runs this place, or add and suspend others." />
            </>
        );
    }

    const rows = list.data?.admins ?? [];
    const myId = list.data?.me;

    /* Guarded on the server as well: the buttons being hidden for your own row is a courtesy, not the control. */
    const setSuper = async (id: string, on: boolean) => {
        setBusy(id);
        try {
            await api(`/api/admin/admins/${id}`, { method: "PATCH", json: { superAdmin: !on } });
            await list.reload();
        } catch (e) {
            toast((e as Error).message);
        }
        setBusy(null);
    };
    const setActive = async (id: string, active: boolean) => {
        const suspending = active;
        if (
            suspending &&
            !(await askConfirm({
                title: "Suspend this administrator?",
                message: "They are signed out everywhere immediately and cannot sign back in. Their work on the portal stays where it is.",
                confirmLabel: "Suspend",
                danger: true,
            }))
        )
            return;
        setBusy(id);
        try {
            await api(`/api/admin/admins/${id}`, { method: "PATCH", json: { active: !suspending } });
            await list.reload();
        } catch (e) {
            toast((e as Error).message);
        }
        setBusy(null);
    };

    return (
        <>
            <SectionHead
                kicker="Administrators"
                title="Who can run this place"
                sub="An administrator can do everything on this portal. A super administrator can also create and suspend others."
                actions={
                    <DuoButton size="sm" onPress={() => setAdding(true)}>
                        Add an Administrator
                    </DuoButton>
                }
            />

            {!list.data ? (
                <Quiet>{list.error ? list.error.message : "Loading…"}</Quiet>
            ) : (
                <TableWrap>
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="border-b border-secondary">
                                {/* The name stays put while the rest scrolls sideways on a phone. */}
                                <th className={cx(thCls, stickyCol)}>Name</th>
                                <th className={thCls}>Email</th>
                                <th className={thCls}>Access</th>
                                <th className={thCls}>Last signed in</th>
                                <th className={thCls}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const you = row.id === myId;
                                return (
                                    <tr key={row.id} className={cx("border-b border-secondary last:border-b-0", !row.active && "opacity-60")}>
                                        <td className={cxTd(cx("whitespace-nowrap", stickyCol))}>
                                            <span className="font-bold text-primary">{row.name}</span>
                                            {you && (
                                                <Chip className="ml-2" tone="grey">
                                                    You
                                                </Chip>
                                            )}
                                        </td>
                                        <td className={tdCls}>{row.email}</td>
                                        <td className={tdCls}>
                                            <div className="flex flex-wrap gap-1.5">
                                                <Chip tone={row.is_super_admin ? "green" : "grey"}>{row.is_super_admin ? "Super admin" : "Admin"}</Chip>
                                                {!row.active && <Chip tone="red">Suspended</Chip>}
                                                {row.must_change_password && <Chip tone="orange">Invite pending</Chip>}
                                            </div>
                                        </td>
                                        <td className={cxTd("whitespace-nowrap text-quaternary")}>{row.last_login_at ? fmtDate(row.last_login_at, { dateStyle: "medium" }) : "Never"}</td>
                                        <td className={cxTd("text-right")}>
                                            {you ? (
                                                <span className="text-xs text-quaternary">You cannot change your own access</span>
                                            ) : (
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <DuoButton size="xs" color="secondary" onPress={() => setSuper(row.id, row.is_super_admin)} isDisabled={busy === row.id}>
                                                        {row.is_super_admin ? "Make Ordinary Admin" : "Make Super Admin"}
                                                    </DuoButton>
                                                    <DuoButton size="xs" color={row.active ? "danger" : "secondary"} onPress={() => setActive(row.id, row.active)} isDisabled={busy === row.id}>
                                                        {row.active ? "Suspend" : "Restore"}
                                                    </DuoButton>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </TableWrap>
            )}
            <p className="mt-4 text-sm text-tertiary">Suspending somebody signs them out everywhere immediately. The last super administrator cannot be suspended or demoted. Promote somebody else first, so there is always a way back in.</p>

            {adding && (
                <AddAdminDialog
                    onClose={() => setAdding(false)}
                    onCreated={async (created) => {
                        setAdding(false);
                        await list.reload();
                        toast(created.emailStatus === "sent" ? "Administrator created and their login emailed" : "Administrator created, but the invitation email failed to send");
                    }}
                />
            )}
        </>
    );
};
const cxTd = (extra: string) => `${tdCls} ${extra}`;
const stickyCol = "sticky left-0 z-10 border-r border-secondary bg-primary";

/* Adding one: a real form so the browser's own validation (required, email) runs as it did. */
const AddAdminDialog = ({ onClose, onCreated }: { onClose: () => void; onCreated: (c: AdminCreated) => void }) => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [superAdmin, setSuperAdmin] = useState(false);
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            const created = await api<AdminCreated>("/api/admin/admins", { method: "POST", json: { name: name.trim(), email: email.trim(), superAdmin } });
            onCreated(created);
        } catch (err) {
            toast((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <DuoDialog open onClose={onClose} title="Add an administrator" sub="They get the same invitation a student does: a temporary password, changed on first sign-in.">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <Labelled label="Full name">
                    <input name="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Full name" className={inputCls} />
                </Labelled>
                <Labelled label="Email">
                    <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" className={inputCls} />
                </Labelled>
                <CheckRow name="superAdmin" checked={superAdmin} onChange={setSuperAdmin} label="Also a super administrator" />
                <p className="text-sm text-tertiary">A super administrator can create and suspend other administrators. Leave this off unless they need it.</p>
                <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <DuoButton size="sm" color="secondary" onPress={onClose}>
                        Cancel
                    </DuoButton>
                    <DuoButton size="sm" type="submit" isDisabled={busy}>
                        {busy ? "Creating…" : "Create and Send the Invitation"}
                    </DuoButton>
                </div>
            </form>
        </DuoDialog>
    );
};
