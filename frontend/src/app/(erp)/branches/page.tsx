"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Pagination } from "@/components/ui/Pagination";
import { TableScroll } from "@/components/ui/TableScroll";
import { BranchForm } from "@/components/branches/BranchForm";
import { MainBadge, RowMenu, Stat, StatusPill } from "@/components/branches/parts";
import { useBranchOverview, useCreateMyBranch, useUpdateMyBranch } from "@/lib/api/hooks";
import type { BranchRow } from "@/lib/api";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import { presetRange, type PeriodPreset } from "@/lib/branchView";
import { fmtMoney } from "@/lib/config";

const PRESETS: { id: PeriodPreset; label: string }[] = [{ id: "today", label: "Today" }, { id: "week", label: "Last 7 days" }, { id: "month", label: "This month" }, { id: "custom", label: "Custom" }];

export default function BranchesPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { currencySymbol } = useAppConfig();
  const canCreate = hasPermission("branches:create");
  const canEdit = hasPermission("branches:update");
  const { confirm, dialog } = useConfirmDialog();

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [filters, setFilters] = useState<{ search: string; status: "" | "active" | "inactive"; sort: "name" | "created" | "sales" | "staff" }>({ search: "", status: "", sort: "name" });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const range = useMemo(() => (preset === "custom" ? (custom.from && custom.to && custom.from <= custom.to ? custom : null) : presetRange(preset)), [preset, custom]);
  const query = useBranchOverview({ page, search: filters.search.trim() || undefined, status: filters.status || undefined, sort: filters.sort, dir: filters.sort === "name" ? "asc" : "desc", from: range?.from, to: range?.to });
  const create = useCreateMyBranch();
  const update = useUpdateMyBranch();
  const filtered = !!filters.search.trim() || !!filters.status || filters.sort !== "name";
  const reset = () => { setFilters({ search: "", status: "", sort: "name" }); setPage(1); };
  const money = (v: number | null) => (v == null ? "—" : fmtMoney(v, currencySymbol));
  const summary = query.data?.summary;

  const closeAdd = () => { if (!formDirty) { setAdding(false); return; } confirm({ title: "Discard this branch?", message: "What you entered hasn't been saved.", confirmLabel: "Discard", danger: true, onConfirm: () => { setFormDirty(false); setAdding(false); } }); };
  const toggle = (b: BranchRow) => {
    const turnOff = b.status === "active";
    confirm({
      title: turnOff ? `Deactivate ${b.name}?` : `Reactivate ${b.name}?`,
      message: turnOff ? "It stops being available for new work. Its sales, transfers and expenses stay in your history. You can reactivate it any time." : "It becomes available for work again.",
      confirmLabel: turnOff ? "Deactivate" : "Reactivate", danger: turnOff,
      onConfirm: () => void update.mutateAsync({ id: b.id, data: { status: turnOff ? "inactive" : "active" } }).then(() => setNotice(null)).catch((e: { detail?: string }) => setNotice(e?.detail ?? "Couldn't change the branch status.")),
    });
  };

  const menu = (b: BranchRow) => [
    { label: "View details", href: `/branches/${b.id}` },
    ...(canEdit ? [{ label: "Edit branch", href: `/branches/${b.id}?tab=settings` }] : []),
    { label: "Manage staff", href: `/branches/${b.id}?tab=staff` },
    { label: "View operations", href: `/branches/${b.id}?tab=sales` },
    ...(canEdit && !b.is_main ? [{ label: b.status === "active" ? "Deactivate" : "Reactivate", onSelect: () => toggle(b), danger: b.status === "active" }] : []),
  ];

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[22px] font-bold tracking-tight text-foreground">Branches</h1><p className="mt-0.5 text-sm text-muted">Manage your business locations, teams, and operations.</p></div>
        {canCreate && <Button onClick={() => setAdding(true)}><Plus size={15} /> Add Branch</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Reporting period" className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {PRESETS.map((p) => <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); setPage(1); }} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${preset === p.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}>{p.label}</button>)}
        </div>
        {preset === "custom" && <div className="flex items-center gap-2"><Input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-auto" /><span className="text-muted">to</span><Input type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-auto" /></div>}
        {summary && <span className="text-[12px] text-muted">Sales shown for {summary.from_date} to {summary.to_date}</span>}
      </div>

      {query.isLoading && !query.data ? <PageLoader variant="compact" /> : query.isError || !query.data ? (
        <div role="alert" className="rounded-xl border border-border bg-card py-12 text-center">
          <p className="text-sm text-red-600">{(query.error as { status?: number } | null)?.status === 403 ? "You don't have permission to view branches." : "Couldn't load your branches."}</p>
          <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat label="Total branches" value={summary.total} />
              <Stat label="Active" value={summary.active} sub={summary.inactive ? `${summary.inactive} inactive` : "All active"} />
              <Stat label="Assigned staff" value={summary.assigned_staff} sub={summary.works_in_all_branches ? `${summary.works_in_all_branches} more work in every branch` : undefined} />
              {summary.sales != null ? <Stat label="Sales" value={money(summary.sales)} sub={`${summary.orders ?? 0} orders · ${summary.from_date} to ${summary.to_date}`} /> : <Stat label="Sales" value="—" sub="You don't have access to sales figures" />}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input className="pl-9" aria-label="Search branches" placeholder="Search name, location or contact" value={filters.search} onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }} /></div>
            <Select aria-label="Status" value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value as "" | "active" | "inactive" }); setPage(1); }} className="w-auto"><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></Select>
            <Select aria-label="Sort by" value={filters.sort} onChange={(e) => { setFilters({ ...filters, sort: e.target.value as typeof filters.sort }); setPage(1); }} className="w-auto"><option value="name">Sort: Name</option><option value="created">Sort: Newest</option><option value="staff">Sort: Most staff</option>{summary?.sales != null && <option value="sales">Sort: Highest sales</option>}</Select>
            {filtered && <Button variant="ghost" size="sm" onClick={reset}><X size={13} /> Clear filters</Button>}
          </div>

          {notice && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-700 dark:text-red-400">{notice}</p>}

          {query.data.items.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-14 text-center">
              <p className="text-sm font-semibold text-foreground">{filtered ? "No branches match these filters" : "No branches yet"}</p>
              <p className="mt-1 text-[13px] text-muted">{filtered ? "Try a different search or clear the filters." : "Add your first branch to start organising your locations."}</p>
              {filtered ? <Button variant="outline" className="mt-3" onClick={reset}>Clear filters</Button> : canCreate && <Button className="mt-3" onClick={() => setAdding(true)}><Plus size={15} /> Add Branch</Button>}
            </div>
          ) : (
            <>
              <ul className="space-y-3 md:hidden" aria-label="Branches">
                {query.data.items.map((b) => (
                  <li key={b.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><Link href={`/branches/${b.id}`} className="font-semibold text-foreground hover:text-accent hover:underline">{b.name}</Link><p className="truncate text-[12px] text-muted">{b.location || "No location set"}</p></div>
                      <RowMenu label={`Actions for ${b.name}`} items={menu(b)} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill status={b.status} />{b.is_main && <MainBadge />}</div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]"><div><dt className="text-muted">Staff</dt><dd className="font-semibold">{b.staff}</dd></div><div><dt className="text-muted">Sales</dt><dd className="font-semibold">{money(b.sales)}</dd></div></dl>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
                <TableScroll label="Branches"><table className="w-full min-w-[760px] text-left text-sm">
                  <thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className="px-4 py-3 font-semibold">Branch</th><th scope="col" className="px-4 py-3 font-semibold">Contact</th><th scope="col" className="px-4 py-3 text-right font-semibold">Staff</th><th scope="col" className="px-4 py-3 text-right font-semibold">Sales</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody className="divide-y divide-border">{query.data.items.map((b) => (
                    <tr key={b.id} className="cursor-pointer hover:bg-surface/50" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,[role=menu]")) router.push(`/branches/${b.id}`); }}>
                      <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><Link href={`/branches/${b.id}`} className="font-semibold text-foreground hover:text-accent hover:underline">{b.name}</Link>{b.is_main && <MainBadge />}</div><p className="text-[12px] text-muted">{b.location || "No location set"}</p></td>
                      <td className="px-4 py-3 text-[12px] text-muted">{b.phone || b.email ? <>{b.phone && <p>{b.phone}</p>}{b.email && <p className="break-all">{b.email}</p>}</> : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{b.staff}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(b.sales)}{b.orders != null && <span className="block text-[11px] text-muted">{b.orders} orders</span>}</td>
                      <td className="px-4 py-3"><StatusPill status={b.status} /></td>
                      <td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><Link href={`/branches/${b.id}`}><Button variant="secondary" size="sm">Manage</Button></Link><RowMenu label={`Actions for ${b.name}`} items={menu(b)} /></div></td>
                    </tr>
                  ))}</tbody>
                </table></TableScroll>
              </div>
              <Pagination page={page} pageSize={20} total={query.data.total} onPageChange={setPage} itemLabel="branches" />
            </>
          )}
        </>
      )}

      <Drawer open={adding} onClose={closeAdd} title="Add branch" size="md">
        <div className="p-5">
          <BranchForm key={adding ? "open" : "closed"} others={(query.data?.items ?? []).map((b) => b.name)} submitLabel="Create branch" focusFirst onDirtyChange={setFormDirty} onCancel={closeAdd}
            onSubmit={async (v) => { const res = await create.mutateAsync({ name: v.name, location: v.location || null, phone: v.phone || null, email: v.email || null }); setFormDirty(false); setAdding(false); router.push(`/branches/${(res.data as { id: string }).id}`); }} />
        </div>
      </Drawer>
      {dialog}
    </div>
  );
}
