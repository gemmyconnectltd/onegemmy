"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Boxes, Search, ShieldCheck, UserCheck, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { Pill } from "@/components/users/AccessParts";
import { useAccessSummary, useMyBranches, useMyModules, useRoleSummaries } from "@/lib/api/hooks";
import { branchLabel, moduleSummary } from "@/lib/accessView";

function Stat({ label, value, sub, icon: Icon }: { label: string; value: number | string; sub?: string; icon: typeof UsersIcon }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={16} /></span>
      <div className="min-w-0"><p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p><p className="text-xl font-extrabold leading-tight text-foreground">{value}</p>{sub && <p className="truncate text-[11px] text-muted">{sub}</p>}</div>
    </div>
  );
}

export default function AccessManagementPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const query = useAccessSummary({ page, search: search.trim() || undefined, roleId: roleId || undefined, branchId: branchId || undefined, status: status || undefined });
  const roles = useRoleSummaries();
  const branches = useMyBranches();
  const modules = useMyModules();
  const names = useMemo(() => Object.fromEntries((modules.data?.modules ?? []).map((m) => [m.key, m.name])), [modules.data]);
  const reset = (fn: () => void) => { fn(); setPage(1); };

  if (query.isLoading && !query.data) return <PageLoader variant="compact" />;
  if (query.isError || !query.data) return <p role="alert" className="py-8 text-center text-sm text-red-600">Couldn&apos;t load access. <button className="font-semibold underline" onClick={() => void query.refetch()}>Try again</button></p>;
  const { items, total, summary } = query.data;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Access Management</h1>
        <p className="mt-0.5 text-sm text-muted">Who can use what. A person&apos;s access is their role&apos;s permissions, applied to the modules your business has switched on.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Users" value={summary.total_users} sub={`${summary.active_users} active`} icon={UsersIcon} />
        <Stat label="With a role" value={summary.with_role} sub={summary.without_role ? `${summary.without_role} active without a role` : "Everyone active has one"} icon={ShieldCheck} />
        <Stat label="Roles" value={summary.roles} icon={UserCheck} />
        <Stat label="Modules on" value={`${summary.modules_on} of ${summary.modules_total}`} icon={Boxes} />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input className="pl-9" aria-label="Search people" placeholder="Search name or email" value={search} onChange={(e) => reset(() => setSearch(e.target.value))} /></div>
        <Select aria-label="Role" value={roleId} onChange={(e) => reset(() => setRoleId(e.target.value))} className="w-auto"><option value="">All roles</option>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        <Select aria-label="Branch" value={branchId} onChange={(e) => reset(() => setBranchId(e.target.value))} className="w-auto"><option value="">All branches</option>{branches.data?.items.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        <Select aria-label="Account status" value={status} onChange={(e) => reset(() => setStatus(e.target.value as "" | "active" | "inactive"))} className="w-auto"><option value="">Any status</option><option value="active">Active</option><option value="inactive">Deactivated</option></Select>
      </div>
      {items.length === 0 ? <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted">No one matches these filters.</p> : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <TableScroll><table className="w-full min-w-[820px] text-left text-sm">
            <thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className="px-4 py-3 font-semibold">Employee</th><th scope="col" className="px-4 py-3 font-semibold">Role</th><th scope="col" className="px-4 py-3 font-semibold">Branches</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-4 py-3 font-semibold">Can open</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">{items.map((u) => {
              const mods = moduleSummary(u, names);
              return (
                <tr key={u.id} className="hover:bg-surface/50">
                  <td className="px-4 py-3"><p className="font-semibold text-foreground">{u.full_name}</p><p className="text-[12px] text-muted">{u.email}</p></td>
                  <td className="px-4 py-3">{u.is_owner ? <Pill tone="green">Owner</Pill> : u.role ? <span className="capitalize">{u.role}</span> : <Pill tone="amber">No role</Pill>}</td>
                  <td className="px-4 py-3 text-[13px] text-muted">{branchLabel(u.all_branches, u.branches)}</td>
                  <td className="px-4 py-3"><Pill tone={u.is_active ? "green" : "slate"}>{u.is_active ? "Active" : "Deactivated"}</Pill></td>
                  <td className="px-4 py-3 text-[12px] text-muted">{mods.shown.length ? <>{mods.shown.join(", ")}{mods.more > 0 && ` +${mods.more} more`}</> : "Nothing yet"}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/settings/users/access/${u.id}`}><Button variant="secondary" size="sm">Manage access</Button></Link></td>
                </tr>
              );
            })}</tbody>
          </table></TableScroll>
        </div>
      )}
      <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} itemLabel="people" />
    </div>
  );
}
