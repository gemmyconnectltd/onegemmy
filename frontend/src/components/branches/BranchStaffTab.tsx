"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { Pill, Stat } from "@/components/branches/parts";
import { useAccessSummary, useRoleSummaries, useUpdateCompanyUser } from "@/lib/api/hooks";
import type { AccessRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { withBranch, withoutBranch } from "@/lib/branchView";

/** A branch's people. Roles, permissions and branch scope stay in Team & Access: this lists who is assigned here and uses the same
 *  user update to assign or remove, so there is only one place the rules live. */
export function BranchStaffTab({ branchId, branchName }: { branchId: string; branchName: string }) {
  const { hasPermission } = useAuth();
  const canAssign = hasPermission("users:update");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const roles = useRoleSummaries({ enabled: hasPermission("roles:read") });
  const query = useAccessSummary({ page, branchId, assignedOnly: true, search: search.trim() || undefined, roleId: roleId || undefined, status: status || undefined });
  const update = useUpdateCompanyUser();
  const { confirm, dialog } = useConfirmDialog();
  const rows = query.data?.items ?? [];

  const remove = (u: AccessRow) => {
    const ids = u.branches.map((b) => b.id);
    const last = ids.length === 1;
    confirm({
      title: `Remove ${u.full_name} from ${branchName}?`,
      message: last ? "This is their only branch. They keep their account and role but can't work anywhere until you assign a branch again." : "They keep their other branches, their account and their role.",
      confirmLabel: "Remove", danger: true,
      onConfirm: () => void update.mutateAsync({ id: u.id, data: withoutBranch(ids, branchId) }).then(() => setProblem(null)).catch((e: { detail?: string }) => setProblem(e?.detail ?? "Couldn't remove this person.")),
    });
  };

  if (query.isLoading && !query.data) return <PageLoader variant="compact" />;
  if (query.isError) return <p role="alert" className="py-8 text-center text-sm text-red-600">You don&apos;t have access to this branch&apos;s staff.</p>;
  const total = query.data?.total ?? 0;
  const noFilter = !search.trim() && !roleId && !status;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label="Assigned" value={noFilter ? total : "—"} sub="People assigned to this branch" />
        <Stat label="Active" value={noFilter ? rows.filter((r) => r.is_active).length : "—"} sub={total > 20 ? "On this page" : undefined} />
        <Stat label="Branch managers" value={noFilter ? rows.filter((r) => r.role === "Branch Manager").length : "—"} sub="Holding the Branch Manager role" />
      </div>
      <p className="text-[12px] text-muted">People who have no branch limit (such as owners) work in every branch and aren&apos;t listed here. Roles and permissions are managed in <Link href="/settings/users" className="font-semibold text-accent hover:underline">Team &amp; Access</Link>.</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input className="pl-9" aria-label="Search staff" placeholder="Search name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        {roles.data && <Select aria-label="Role" value={roleId} onChange={(e) => { setRoleId(e.target.value); setPage(1); }} className="w-auto"><option value="">All roles</option>{roles.data.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as "" | "active" | "inactive"); setPage(1); }} className="w-auto"><option value="">Any status</option><option value="active">Active</option><option value="inactive">Deactivated</option></Select>
        {canAssign && <Button className="ml-auto" onClick={() => setAdding(true)}><Plus size={15} /> Assign employee</Button>}
      </div>
      {problem && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-700 dark:text-red-400">{problem}</p>}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted">{noFilter ? "Nobody is assigned to this branch yet." : "No one matches these filters."}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <TableScroll label="Branch staff"><table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className="px-4 py-3 font-semibold">Employee</th><th scope="col" className="px-4 py-3 font-semibold">Role</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-4 py-3 font-semibold">Branches</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">{rows.map((u) => (
              <tr key={u.id} className="hover:bg-surface/50">
                <td className="px-4 py-3"><p className="font-semibold text-foreground">{u.full_name}</p><p className="text-[12px] text-muted">{u.email}</p></td>
                <td className="px-4 py-3 capitalize">{u.role ?? <Pill tone="amber">No role</Pill>}</td>
                <td className="px-4 py-3"><Pill tone={u.is_active ? "green" : "slate"}>{u.is_active ? "Active" : "Deactivated"}</Pill></td>
                <td className="px-4 py-3 text-[12px] text-muted">{u.branches.map((b) => b.name).join(", ")}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2"><Link href={`/settings/users/access/${u.id}`}><Button variant="secondary" size="sm">View access</Button></Link>{canAssign && <Button variant="outline" size="sm" onClick={() => remove(u)} disabled={update.isPending}>Remove</Button>}</div></td>
              </tr>
            ))}</tbody>
          </table></TableScroll>
        </div>
      )}
      <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} itemLabel="people" />
      <AssignDrawer open={adding} onClose={() => setAdding(false)} branchId={branchId} branchName={branchName} />
      {dialog}
    </div>
  );
}

function AssignDrawer({ open, onClose, branchId, branchName }: { open: boolean; onClose: () => void; branchId: string; branchName: string }) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const q = useAccessSummary({ page: 1, search: search.trim() || undefined, status: "active" }, { enabled: open });
  const update = useUpdateCompanyUser();
  // Only people who already have a branch list can be given another one. Someone with no limit already works here, and adding a
  // branch to them would quietly restrict them to it.
  const eligible = (q.data?.items ?? []).filter((u) => !u.all_branches && !u.branches.some((b) => b.id === branchId));
  const everywhere = (q.data?.items ?? []).filter((u) => u.all_branches).length;
  const assign = async (u: AccessRow) => {
    setError(null);
    try { await update.mutateAsync({ id: u.id, data: withBranch(u.branches.map((b) => b.id), branchId) }); }
    catch (e: unknown) { setError((e as { detail?: string })?.detail ?? "Couldn't assign this person."); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Assign to ${branchName}`} size="md">
      <div className="space-y-3 p-5">
        <p className="text-[13px] text-muted">Pick someone who works in other branches. They keep those and gain this one.</p>
        <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input className="pl-9" aria-label="Search employees" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {error && <p role="alert" className="text-[12px] font-medium text-red-600">{error}</p>}
        {q.isLoading ? <PageLoader variant="compact" /> : eligible.length === 0 ? <p className="py-6 text-center text-sm text-muted">No one else can be assigned here.{everywhere > 0 && ` ${everywhere} ${everywhere === 1 ? "person already works" : "people already work"} in every branch.`}</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border">{eligible.map((u) => <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{u.full_name}</p><p className="truncate text-[12px] text-muted">{u.role ?? "No role"} · {u.branches.map((b) => b.name).join(", ") || "No branch"}</p></div><Button size="sm" disabled={update.isPending} onClick={() => void assign(u)}>Assign</Button></li>)}</ul>
        )}
      </div>
    </Drawer>
  );
}
