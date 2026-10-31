"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { Back, Pill } from "@/components/users/AccessParts";
import { useCompanyUserActivity, useMyBranches, useRoleSummaries, useUpdateCompanyUser, useUserAccess } from "@/lib/api/hooks";
import type { UserAccess } from "@/lib/api/access";
import { branchLabel } from "@/lib/accessView";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" }, { id: "features", label: "Feature access" }, { id: "roles", label: "Role" },
  { id: "branches", label: "Branches" }, { id: "history", label: "History" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function UserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const tab: TabId = TABS.some((t) => t.id === search.get("tab")) ? (search.get("tab") as TabId) : "overview";
  const query = useUserAccess(id);
  const { hasPermission } = useAuth();
  const canManage = hasPermission("users:update");

  if (query.isLoading) return <PageLoader variant="compact" />;
  if (query.isError || !query.data) return <div className="py-12 text-center"><p role="alert" className="text-sm text-red-600">This person couldn&apos;t be found or you don&apos;t have access.</p><Link href="/settings/users" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Back to Team &amp; Access</Link></div>;
  const a = query.data;
  const go = (t: TabId) => router.replace(`/settings/users/access/${id}?tab=${t}`, { scroll: false });

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Back href="/settings/users">Team &amp; Access</Back>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">{a.user.full_name}</h1>
          <Pill tone={a.user.is_active ? "green" : "slate"}>{a.user.is_active ? "Active" : "Deactivated"}</Pill>
          {a.user.is_owner ? <Pill tone="green">Owner</Pill> : a.user.role ? <Pill>{a.user.role}</Pill> : <Pill tone="amber">No role</Pill>}
        </div>
        <p className="mt-0.5 text-sm text-muted">{a.user.email} · {branchLabel(a.branches.all, a.branches.branches)}</p>
      </div>
      <div role="tablist" aria-label="Access sections" className="no-scrollbar flex overflow-x-auto border-b border-border">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)} className={cn("whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-accent", tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground")}>{t.label}</button>)}
      </div>
      {tab === "overview" && <Overview a={a} />}
      {tab === "features" && <FeatureAccessTab a={a} canManage={canManage} />}
      {tab === "roles" && <RoleTab a={a} canManage={canManage} />}
      {tab === "branches" && <BranchTab a={a} canManage={canManage} />}
      {tab === "history" && <History id={id} name={a.user.full_name} />}
    </div>
  );
}

const Card = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="min-w-0 rounded-xl border border-border bg-card"><header className="border-b border-border px-4 py-3"><h2 className="text-sm font-bold text-foreground">{title}</h2>{hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}</header><div className="p-4">{children}</div></section>
);

function Overview({ a }: { a: UserAccess }) {
  const usable = a.modules.filter((m) => m.effective_change), viewOnly = a.modules.filter((m) => m.effective_view && !m.effective_change);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Account">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm"><dt className="text-muted">Name</dt><dd>{a.user.full_name}</dd><dt className="text-muted">Email</dt><dd className="break-all">{a.user.email}</dd><dt className="text-muted">Role</dt><dd>{a.user.is_owner ? "Owner (has every permission)" : a.user.role ?? "None"}</dd><dt className="text-muted">Branches</dt><dd>{branchLabel(a.branches.all, a.branches.branches)}</dd><dt className="text-muted">Status</dt><dd>{a.user.is_active ? "Active" : "Deactivated"}</dd></dl>
      </Card>
      <Card title="What they can do now" hint="Their role's permissions, applied to the modules in your plan.">
        <p className="text-sm"><strong>{usable.length}</strong> module{usable.length === 1 ? "" : "s"} they can use{usable.length ? `: ${usable.map((m) => m.name).join(", ")}` : ""}.</p>
        <p className="mt-2 text-sm"><strong>{viewOnly.length}</strong> view only{viewOnly.length ? `: ${viewOnly.map((m) => m.name).join(", ")}` : ""}.</p>
        {!a.user.is_active && <p className="mt-3 rounded-lg bg-surface p-3 text-[12px] text-muted">This account is deactivated, so none of this applies until it is activated again.</p>}
      </Card>
    </div>
  );
}

function FeatureAccessTab({ a, canManage }: { a: UserAccess; canManage: boolean }) {
  const update = useUpdateCompanyUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const off = a.modules.filter((m) => m.blocked).map((m) => m.key);
  const change = async (key: string, on: boolean) => {
    setError(null);
    setBusy(key);
    try { await update.mutateAsync({ id: a.user.id, data: { disabled_modules: on ? off.filter((k) => k !== key) : [...off, key] } }); }
    catch (e: unknown) { setError((e as { detail?: string })?.detail ?? (e as Error)?.message ?? "Couldn't change this feature."); }
    finally { setBusy(null); }
  };
  return (
    <Card title="Feature access" hint="Choose which features this person can open. Switching one off hides it and blocks it on the server, whatever their role allows. Switching it back on returns them to what their role permits.">
      {a.user.is_owner ? <p className="text-sm text-muted">The business owner always has every feature.</p> : (
        <>
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p>}
          {!canManage && <p className="mb-3 text-[12px] text-muted">You can see this but need permission to change it.</p>}
          <ul className="divide-y divide-border">
            {a.modules.map((m) => {
              const closed = m.status === "not_included" || m.status === "restricted";
              const byRole = !m.can_view && !m.can_change;
              return (
                <li key={m.key} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.name}</p>
                    <p className="text-[12px] text-muted">
                      {closed ? "Not available to your business." : m.blocked ? "Switched off for this person." : byRole ? "Their role gives no access to this yet." : m.can_change ? "Can view and make changes." : "Can view only."}
                    </p>
                  </div>
                  {closed ? <Pill tone="amber">Unavailable</Pill> : <Toggle checked={!m.blocked} label={`${m.name} for ${a.user.full_name}`} loading={busy === m.key} disabled={!canManage || busy !== null} onChange={(v) => void change(m.key, v)} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function RoleTab({ a, canManage }: { a: UserAccess; canManage: boolean }) {
  const roles = useRoleSummaries();
  const update = useUpdateCompanyUser();
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const value = picked ?? a.user.role_id ?? "";
  const dirty = value !== (a.user.role_id ?? "");
  const save = async () => {
    setMessage(null);
    try { await update.mutateAsync({ id: a.user.id, data: { role_id: value } }); setPicked(null); setMessage({ ok: true, text: "Role updated. It applies from their next action." }); }
    catch (e: unknown) { setMessage({ ok: false, text: (e as { detail?: string })?.detail ?? (e as Error)?.message ?? "Couldn't change the role." }); }
  };
  return (
    <Card title="Role" hint="Each person has one role. Its permissions decide what they can do.">
      {a.user.is_owner ? <p className="text-sm text-muted">The business owner has every permission and can&apos;t be given a lower role here.</p> : (
        <div className="max-w-md space-y-3">
          <Select aria-label="Role" value={value} disabled={!canManage || update.isPending} onChange={(e) => { setPicked(e.target.value); setMessage(null); }}>
            <option value="" disabled>Choose a role</option>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.builtIn ? "" : " (custom)"}</option>)}
          </Select>
          {!canManage && <p className="text-[12px] text-muted">You can see this but need permission to change roles.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={!canManage || !dirty || !value || update.isPending}>{update.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />} Save role</Button>
            {dirty && <Button variant="ghost" onClick={() => setPicked(null)}>Discard</Button>}
            {message?.ok && <span role="status" className="flex items-center gap-1 text-[12px] font-medium text-emerald-600"><CheckCircle2 size={13} /> {message.text}</span>}
            {message && !message.ok && <span role="alert" className="text-[12px] font-medium text-red-600">{message.text}</span>}
          </div>
          <p className="text-[12px] text-muted">Need different permissions? <Link className="font-semibold text-accent hover:underline" href="/settings/users/roles">Edit or create a role</Link>.</p>
        </div>
      )}
    </Card>
  );
}

function BranchTab({ a, canManage }: { a: UserAccess; canManage: boolean }) {
  const branches = useMyBranches();
  const update = useUpdateCompanyUser();
  const initial = a.branches.all ? null : a.branches.branches.map((b) => b.id);
  // A single default branch left behind would still confine someone set to "All branches", so it is cleared with the scope.
  const [draft, setDraft] = useState<string[] | null | undefined>(undefined); // undefined = untouched
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = draft === undefined ? initial : draft;
  const dirty = JSON.stringify(current) !== JSON.stringify(initial);
  const save = async () => {
    setMessage(null);
    try { await update.mutateAsync({ id: a.user.id, data: { branch_ids: current as string[], branch_id: current && current.length ? current[0] : null } }); setDraft(undefined); setMessage({ ok: true, text: "Branches updated." }); }
    catch (e: unknown) { setMessage({ ok: false, text: (e as { detail?: string })?.detail ?? (e as Error)?.message ?? "Couldn't change branches." }); }
  };
  return (
    <Card title="Branches" hint="Which branches this person can work in. This is enforced for every request, separately from modules and permissions.">
      <div className="max-w-md space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" checked={current === null} disabled={!canManage} onChange={() => setDraft(null)} /> All branches</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" checked={current !== null} disabled={!canManage} onChange={() => setDraft(current ?? [])} /> Only selected branches</label>
        {current !== null && <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-2">{branches.data?.items.map((b) => <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canManage} checked={current.includes(b.id)} onChange={(e) => setDraft(e.target.checked ? [...current, b.id] : current.filter((x) => x !== b.id))} />{b.name}</label>)}</div>}
        {current !== null && current.length === 0 && <p className="text-[12px] font-medium text-amber-700 dark:text-amber-400">With no branch selected this person can&apos;t act anywhere.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={!canManage || !dirty || update.isPending}>{update.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />} Save branches</Button>
          {dirty && <Button variant="ghost" onClick={() => setDraft(undefined)}>Discard</Button>}
          {message?.ok && <span role="status" className="flex items-center gap-1 text-[12px] font-medium text-emerald-600"><CheckCircle2 size={13} /> {message.text}</span>}
          {message && !message.ok && <span role="alert" className="text-[12px] font-medium text-red-600">{message.text}</span>}
        </div>
      </div>
    </Card>
  );
}

function History({ id, name }: { id: string; name: string }) {
  const [page, setPage] = useState(1);
  const q = useCompanyUserActivity(id, page, 20);
  if (q.isLoading) return <PageLoader variant="compact" />;
  const items = q.data?.items ?? [];
  return (
    <Card title="History" hint={`Changes to ${name}'s account, and what they have done.`}>
      {items.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nothing recorded yet.</p> : <ul className="divide-y divide-border">{items.map((e) => <li key={e.id} className="py-2.5"><p className="text-sm text-foreground">{e.summary}</p><p className="text-[12px] text-muted">{e.actor_name ? `${e.actor_name} · ` : ""}{e.created_at ? new Date(e.created_at).toLocaleString() : ""}</p></li>)}</ul>}
      {(q.data?.total ?? 0) > 20 && <div className="mt-3 flex justify-between text-[12px]"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</Button><Button variant="outline" size="sm" disabled={page * 20 >= (q.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Older</Button></div>}
    </Card>
  );
}
