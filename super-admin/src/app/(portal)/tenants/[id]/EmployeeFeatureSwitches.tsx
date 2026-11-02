"use client";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { Toggle } from "@/components/ui/Toggle";
import { useEmployeeAccess, useSetEmployeeFeature } from "@/lib/api/hooks";

export default function EmployeeFeatureSwitches({ tenantId, userId }: { tenantId: string; userId: string }) {
  const query = useEmployeeAccess(tenantId, userId);
  const update = useSetEmployeeFeature();
  if (query.isLoading) return <PageLoader variant="compact" />;
  if (query.isError || !query.data) return <p role="alert">Could not load employee access. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p>;
  const a = query.data;
  return <div className="space-y-4">
    <div><h3 className="pesaa-card-title">{a.user.full_name}</h3><p className="text-sm text-muted">{a.user.email} · {a.user.role ?? "No role"}</p><p className="text-sm text-muted">Branches: {a.branches.all ? "All branches" : a.branches.branches.map((b) => b.name).join(", ") || "None assigned"}</p></div>
    {!a.user.is_active && <p role="status" className="text-sm text-muted">This account is inactive and cannot sign in.</p>}
    <div className="rounded-xl border border-border bg-surface p-4"><h3 className="pesaa-card-title">User access preview</h3><p className="mt-2 text-sm text-muted">Only enabled, authorized features appear in this user’s menus. The list below previews their available modules. It previews access without signing in as them.</p>
      <ul className="mt-3 space-y-2">{a.modules.filter((m) => m.status === "enabled" && m.effective_view).map((m) => <li key={m.key} className="flex justify-between gap-3 text-sm"><span>{m.name}</span><span className={a.user.is_active && m.effective_view ? "text-accent" : "text-muted"}>{!a.user.is_active ? "Account inactive" : m.effective_change ? "View and edit" : m.effective_view ? "View only" : "Unavailable"}</span></li>)}</ul>
    </div>
    {a.user.is_owner ? <p className="text-sm text-muted">Owner access follows the business feature settings and cannot be restricted per employee.</p> : <>
      <h3 className="pesaa-card-title">Employee feature switches</h3><p className="text-sm text-muted">Changes save immediately. Accounting, Expenses and Debt Management are independent employee switches. Enable restores default view/edit and role permissions. Turning a feature off blocks it on the server.</p>
      {update.isError && <p role="alert" className="text-sm text-red-600">Could not update access. {update.error.message}</p>}
      {update.isSuccess && <p role="status" className="text-sm text-accent">Feature access saved.</p>}
      <ul className="divide-y divide-border">{a.modules.map((m) => <li key={m.key} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-semibold">{m.name}</p><p className="text-sm text-muted">{m.status === "restricted" ? "Restricted by platform" : m.status === "not_included" ? "Not included for business" : m.status === "available" ? "Business switched off writes" : m.blocked ? "Off for this employee" : "Enabled for this employee"}</p></div><Toggle checked={!m.blocked} disabled={update.isPending} label={`Allow ${m.name} for ${a.user.full_name}`} onChange={(enabled) => update.mutate({ tenantId, userId, module: m.key, enabled })} /></li>)}</ul>
    </>}
  </div>;
}
