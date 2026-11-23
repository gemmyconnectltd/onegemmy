"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SignInDetails, makePassword, passwordProblem } from "./SignInDetails";
import { useUpdateTeamUser, useSetTeamStatus, useRemoveTeamUser, useResetUserPassword, useSetUserPassword, useTeamActivity } from "@/lib/api/hooks";
import type { TeamUser } from "@/lib/api/admin";
import { TeamBranches, TeamChoice } from "./TeamFields";

/** The parts of one business user's page: profile, account actions, password and activity. Each saves on its own. */

const branchesOf = (u: TeamUser) => u.branch_ids ?? (u.branch_id ? [u.branch_id] : null);

export function ProfileForm({ tenantId, user, onDirtyChange }: { tenantId: string; user: TeamUser; onDirtyChange?: (dirty: boolean) => void }) {
  const [name, setName] = useState(user.full_name), [phone, setPhone] = useState(user.phone || ""), [role, setRole] = useState(user.role_id || ""), [dept, setDept] = useState(user.department_id || "");
  const [branches, setBranches] = useState<string[] | null>(branchesOf(user));
  const update = useUpdateTeamUser();
  const dirty = name !== user.full_name || phone !== (user.phone || "") || role !== (user.role_id || "") || dept !== (user.department_id || "") || JSON.stringify(branches) !== JSON.stringify(branchesOf(user));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const reset = () => { setName(user.full_name); setPhone(user.phone || ""); setRole(user.role_id || ""); setDept(user.department_id || ""); setBranches(branchesOf(user)); };
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); update.mutate({ tenantId, userId: user.id, data: { full_name: name.trim(), phone: phone.trim(), ...(user.is_superuser ? {} : { role_id: role || undefined }), department_id: dept || null, branch_ids: branches, branch_id: branches?.[0] || null } }); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required><Input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><Input type="tel" maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {user.is_superuser ? <p className="text-sm text-muted sm:col-span-1">The business owner retains their role and full access.</p> : <TeamChoice tenantId={tenantId} kind="roles" label="Role" value={role} currentLabel={user.role} onChange={setRole} />}
        <TeamChoice tenantId={tenantId} kind="departments" label="Department" optional value={dept} onChange={setDept} />
      </div>
      <div className="rounded-lg border border-border bg-surface p-4"><TeamBranches tenantId={tenantId} value={branches} onChange={setBranches} /></div>
      {update.isError && <p role="alert" className="text-sm text-red-600">{update.error.message}</p>}
      {update.isSuccess && !dirty && <p role="status" className="text-sm text-accent">Profile saved.</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {dirty && <span className="mr-auto text-xs font-semibold text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        <Button type="submit" disabled={!dirty || update.isPending || !name.trim()}>{update.isPending ? "Saving…" : "Save profile"}</Button>
        <Button type="button" variant="secondary" disabled={!dirty || update.isPending} onClick={reset}>Discard</Button>
      </div>
    </form>
  );
}

/** The most common help for a locked-out user: an emailed, time-limited recovery link. */
export function RecoveryLinkButton({ tenantId, user }: { tenantId: string; user: TeamUser }) {
  const recover = useResetUserPassword();
  const { confirm, dialog } = useConfirmDialog();
  return (
    <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
      {dialog}
      <Button variant="outline" disabled={recover.isPending || !user.is_active} onClick={() => confirm({ title: "Send recovery link?", message: `Email a time-limited recovery link to ${user.email}.`, confirmLabel: "Send link", onConfirm: () => recover.mutate({ tenantId, userId: user.id }) })}>{recover.isPending ? "Sending…" : "Send recovery link"}</Button>
      {recover.isSuccess && <p role="status" className="text-xs text-accent">Recovery link emailed.</p>}
      {recover.isError && <p role="alert" className="text-xs text-red-600">{recover.error.message}</p>}
    </div>
  );
}

/** Deactivate/reactivate and remove, kept apart at the bottom of the page so they are never clicked by accident. */
export function DangerZone({ tenantId, user, onRemoved }: { tenantId: string; user: TeamUser; onRemoved: () => void }) {
  const status = useSetTeamStatus(), remove = useRemoveTeamUser();
  const { confirm, dialog } = useConfirmDialog();
  const busy = status.isPending || remove.isPending;
  const error = status.error || remove.error;
  return (
    <div className="-m-4 min-w-0 sm:-m-5">
      {dialog}
      {user.is_superuser ? <p className="p-4 text-sm text-muted sm:p-5">The business owner cannot be deactivated or removed.</p> : (
        <ul className="divide-y divide-border">
          <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div className="min-w-0"><p className="text-sm font-semibold">{user.is_active ? "Deactivate account" : "Reactivate account"}</p><p className="text-xs text-muted">{user.is_active ? "They lose access immediately. Their records, settings and audit history stay." : "Restore sign-in with their existing role, branches and feature settings."}</p></div>
            <Button variant="outline" disabled={busy} onClick={() => confirm({ title: user.is_active ? "Deactivate user?" : "Reactivate user?", message: user.is_active ? "They will lose access immediately. Their records and audit history remain." : "Restore sign-in access with their existing role and feature settings.", danger: user.is_active, onConfirm: () => status.mutate({ tenantId, userId: user.id, active: !user.is_active }) })}>{status.isPending ? "Saving…" : user.is_active ? "Deactivate" : "Reactivate"}</Button>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div className="min-w-0"><p className="text-sm font-semibold">Remove from this business</p><p className="text-xs text-muted">Deletes the account from the business. Deactivate instead if you may restore access later.</p></div>
            <Button variant="destructive" disabled={busy} onClick={() => confirm({ title: "Remove user?", message: "Remove this account from the business. Deactivate instead if you may restore access later.", danger: true, confirmLabel: "Remove user", onConfirm: () => remove.mutate({ tenantId, userId: user.id }, { onSuccess: onRemoved }) })}>{remove.isPending ? "Removing…" : "Remove user"}</Button>
          </li>
        </ul>
      )}
      {error && <p role="alert" className="px-4 pb-4 text-sm text-red-600 sm:px-5">{error.message}</p>}
    </div>
  );
}

export function PasswordForm({ tenantId, user }: { tenantId: string; user: TeamUser }) {
  const setPassword = useSetUserPassword();
  const { confirm, dialog } = useConfirmDialog();
  const [pw, setPw] = useState(""); const [shown, setShown] = useState<string | null>(null);
  const problem = passwordProblem(pw);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); confirm({ title: "Set this password?", message: `${user.email} will be able to sign in with the password you typed.`, confirmLabel: "Set password", onConfirm: () => { const chosen = pw; setShown(null); setPassword.mutate({ tenantId, userId: user.id, password: chosen, requireChange: false }, { onSuccess: () => { setPw(""); setShown(chosen); } }); } }); }}>
      {dialog}
      <p className="text-xs text-muted">At least 6 characters. It is not emailed: after setting it you see the sign-in details once, to copy or tell them.</p>
      <Field label="Default password" hint={problem ?? undefined}><div className="flex gap-2"><Input type="text" autoComplete="new-password" spellCheck={false} maxLength={128} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="e.g. Welcome2026" /><Button type="button" variant="outline" onClick={() => setPw(makePassword())}>Generate</Button></div></Field>
      <Button type="submit" variant="outline" disabled={setPassword.isPending || !pw || !!problem}>{setPassword.isPending ? "Setting…" : "Set password"}</Button>
      {setPassword.isSuccess && shown && <SignInDetails email={user.email} password={shown} emailed={null} />}
      {setPassword.isError && <p role="alert" className="text-sm text-red-600">{setPassword.error.message}</p>}
    </form>
  );
}

export function UserActivity({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [page, setPage] = useState(1); const q = useTeamActivity(tenantId, userId, page);
  if (q.isLoading) return <PageLoader variant="compact" />;
  if (q.isError) return <p role="alert">Could not load activity. <Button variant="outline" onClick={() => void q.refetch()}>Retry</Button></p>;
  const total = q.data?.total || 0;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">{q.data?.items.map((e) => <li key={e.id} className="py-3"><p className="text-sm">{e.summary}</p><p className="text-xs text-muted">{e.actor_name || "System"} · {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}</p></li>)}</ul>
      {!q.data?.items.length && <p className="text-sm text-muted">No activity recorded.</p>}
      {total > 20 && <div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-xs text-muted">Page {page}</span><Button size="sm" variant="outline" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div>
  );
}
