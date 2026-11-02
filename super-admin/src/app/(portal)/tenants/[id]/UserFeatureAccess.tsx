"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { Toggle } from "@/components/ui/Toggle";
import { useEmployeeAccess, useSetEmployeeFeature, useTenantUsers } from "@/lib/api/hooks";

export default function UserFeatureAccess({ tenantId }: { tenantId: string }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const users = useTenantUsers(tenantId, page);
  return <section className="space-y-4">
    <div><h2 className="pesaa-section-title">User feature access</h2><p className="text-sm text-muted">Manage each employee and preview the modules they can open. Business restrictions always apply.</p></div>
    {users.isLoading ? <PageLoader variant="compact" /> : users.isError ? <p role="alert">Could not load users. <Button variant="outline" onClick={() => void users.refetch()}>Retry</Button></p> : <>
      <TableScroll><table className="w-full text-sm"><thead><tr><th className="text-left">User</th><th className="text-left">Role</th><th className="text-left">Status</th><th><span className="sr-only">Manage access</span></th></tr></thead><tbody>
        {users.data?.items.map((u) => <tr key={u.id}><td><p className="font-semibold">{u.full_name}</p><p className="text-muted">{u.email}</p></td><td>{u.is_superuser ? "Owner" : u.role}</td><td>{u.is_active ? "Active" : "Inactive"}</td><td><Button variant="outline" onClick={() => setSelected(u.id)} aria-label={`Manage feature access for ${u.full_name}`}>Manage features</Button></td></tr>)}
        {users.data?.items.length === 0 && <tr><td colSpan={4}>No users in this business.</td></tr>}
      </tbody></table></TableScroll>
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page === 1 || users.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm text-muted">Page {page} · {users.data?.total ?? 0} users</span><Button variant="outline" disabled={users.isFetching || page * 50 >= (users.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button></div>
    </>}
    <Drawer open={!!selected} onClose={() => setSelected("")} title="Employee feature access" size="xl">
      {selected && <EmployeeFeatures key={`${tenantId}:${selected}`} tenantId={tenantId} userId={selected} />}
    </Drawer>
  </section>;
}

function EmployeeFeatures({ tenantId, userId }: { tenantId: string; userId: string }) {
  const query = useEmployeeAccess(tenantId, userId);
  const update = useSetEmployeeFeature();
  if (query.isLoading) return <PageLoader variant="compact" />;
  if (query.isError || !query.data) return <p role="alert">Could not load employee access. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p>;
  const a = query.data;
  return <div className="space-y-4">
    <div><h3 className="pesaa-card-title">{a.user.full_name}</h3><p className="text-sm text-muted">{a.user.email} · {a.user.role ?? "No role"}</p><p className="text-sm text-muted">Branches: {a.branches.all ? "All branches" : a.branches.branches.map((b) => b.name).join(", ") || "None assigned"}</p></div>
    {!a.user.is_active && <p role="status" className="text-sm text-muted">This account is inactive and cannot sign in.</p>}
    <div className="rounded-xl border border-border bg-surface p-4"><h3 className="pesaa-card-title">User access preview</h3><p className="mt-2 text-sm text-muted">All published sidebar entries remain visible. The list below shows which modules this user can actually open and edit. It previews access without signing in as them.</p>
      <ul className="mt-3 space-y-2">{a.modules.map((m) => <li key={m.key} className="flex justify-between gap-3 text-sm"><span>{m.name}</span><span className={a.user.is_active && m.effective_view ? "text-accent" : "text-muted"}>{!a.user.is_active ? "Account inactive" : m.effective_change ? "View and edit" : m.effective_view ? "View only" : "Unavailable"}</span></li>)}</ul>
    </div>
    {a.user.is_owner ? <p className="text-sm text-muted">Owner access follows the business feature settings and cannot be restricted per employee.</p> : <>
      <h3 className="pesaa-card-title">Employee feature switches</h3><p className="text-sm text-muted">Changes save immediately. Enable restores default view/edit and role permissions. Turning a feature off blocks it on the server.</p>
      {update.isError && <p role="alert" className="text-sm text-red-600">Could not update access. {update.error.message}</p>}
      {update.isSuccess && <p role="status" className="text-sm text-accent">Feature access saved.</p>}
      <ul className="divide-y divide-border">{a.modules.map((m) => <li key={m.key} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-semibold">{m.name}</p><p className="text-sm text-muted">{m.status === "restricted" ? "Restricted by platform" : m.status === "not_included" ? "Not included for business" : m.status === "available" ? "Business switched off writes" : m.blocked ? "Off for this employee" : "Enabled for this employee"}</p></div><Toggle checked={!m.blocked} disabled={update.isPending} label={`Allow ${m.name} for ${a.user.full_name}`} onChange={(enabled) => update.mutate({ tenantId, userId, module: m.key, enabled })} /></li>)}</ul>
    </>}
  </div>;
}
