"use client";
import { PlanChange } from "@/components/billing/BillingShared";
import { BillingPagination } from "@/components/billing/BillingShared";
import { COUNTRY_NAMES } from "@/lib/countries";
import { TableScroll } from "@/components/ui/TableScroll";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Ban, Building2, CheckCircle2, Clock3, Download, Eye, Loader2, Plus, Power, Trash2, UserRound, Users as UsersIcon, X, XCircle,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { fmtRelative } from "@/lib/date";
import { adminApi, tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";
import { resolveUploadUrl } from "@/lib/api/client";
import { useTenants, useCreateTenant, useSuspendTenant, useActivateTenant, useDeleteTenant, useAdminFeatureUsage, useAdminStats, useBillingRecords } from "@/lib/api/hooks";
import { ActionMenu } from "@/components/tenants/ActionMenu";
import { ContactBadge } from "@/components/tenants/ContactBadge";
import { TenantLogo, TenantStatusBadge } from "@/components/tenants/StatusBadge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Metric } from "@/components/ui/Metric";
import { SearchBox, Pagination, thClass } from "@/components/ui/DataTable";

const PAGE_SIZE = 25;
const SCAN_SIZE = 100; // backend page_size cap — used when a filter/sort needs more than one server page

const PLAN_COLORS: Record<string, string> = {
  free: "bg-surface text-muted border border-border",
  starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  professional: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20",
  enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
};
const BUSINESS_TYPE_LABELS: Record<string, string> = { sole: "Sole Proprietorship", partnership: "Partnership", llc: "Limited Liability (LLC)", unregistered: "Not Registered" };
const MODULE_COLORS: Record<string, string> = { sales: "#6366f1", inventory: "#0ea5e9", accounting: "#10b981", hr: "#8b5cf6", procurement: "#f59e0b", manufacturing: "#f43f5e", crm: "#06b6d4", repairs: "#64748b" };
const adoptionBadgeClass = (pct: number) => pct >= 66 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : pct >= 33 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-red-500/10 text-red-600 dark:text-red-400";

type StatusFilter = "all" | "active" | "pending" | "suspended" | "trial" | "cancelled";
type SortKey = "name" | "created" | "users" | "plan";
interface Filters { q: string; status: StatusFilter; plan: string; country: string; from: string; to: string; industry: string; businessType: string; heardAbout: string }
const EMPTY: Filters = { q: "", status: "all", plan: "all", country: "", from: "", to: "", industry: "", businessType: "", heardAbout: "" };

function fromParams(p: URLSearchParams): Filters {
  const s = p.get("status");
  return {
    q: p.get("q") ?? "", status: s === "active" || s === "pending" || s === "suspended" || s === "trial" || s === "cancelled" ? s : "all", plan: p.get("plan") ?? "all", country: p.get("country") ?? "",
    from: p.get("from") ?? "", to: p.get("to") ?? "", industry: p.get("industry") ?? "", businessType: p.get("businessType") ?? "", heardAbout: p.get("heardAbout") ?? "",
  };
}
function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.status !== "all") p.set("status", f.status);
  if (f.plan !== "all") p.set("plan", f.plan);
  for (const k of ["country", "from", "to", "industry", "businessType", "heardAbout"] as const) if (f[k]) p.set(k, f[k]);
  const s = p.toString();
  return s ? `?${s}` : "";
}
const isFiltered = (f: Filters) => JSON.stringify(f) !== JSON.stringify(EMPTY);

function sortRows(rows: AdminTenant[], key: SortKey, dir: "asc" | "desc"): AdminTenant[] {
  const val = (t: AdminTenant): string | number => key === "name" ? t.name.trim().toLowerCase() : key === "users" ? t.usage?.users ?? 0 : key === "plan" ? t.subscription_plan : t.created_at ?? "";
  return [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (dir === "asc" ? 1 : -1));
}

const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function AdminTenantsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [f, setF] = useState<Filters>(() => fromParams(searchParams));
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>(() => ({ key: (["name", "created", "users", "plan"].find(k => k === searchParams.get("sort")) ?? "created") as SortKey, dir: searchParams.get("dir") === "asc" ? "asc" : "desc" }));
  const [page, setPage] = useState(1);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planPage, setPlanPage] = useState(1);
  const planCatalog = useBillingRecords("plans", { status: "active", page: planPage, page_size: 20 });
  const [selectedPrice, setSelectedPrice] = useState("");
  const [createdTenant, setCreatedTenant] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", owner_full_name: "", owner_email: "", phone: "", city: "", country: "Rwanda" });

  const filtered = isFiltered(f);
  const queryFilters = { ...f, created_from: f.from, created_to: f.to, sort: sort.key, dir: sort.dir };
  const active = useTenants(page, PAGE_SIZE, undefined, queryFilters);
  const stats = useAdminStats();
  const { data: featureUsage } = useAdminFeatureUsage();
  const loaded = useMemo(() => active.data?.items ?? [], [active.data]);
  const total = active.data?.total ?? 0;
  const pageRows = loaded;

  const createTenant = useCreateTenant();
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const deleteTenant = useDeleteTenant();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const bulk = useBulkSelection(pageRows.map((t) => t.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const update = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    setPage(1);
    bulk.clear();
    router.replace(`/tenants${toQuery(next)}${toQuery(next) ? "&" : "?"}sort=${sort.key}&dir=${sort.dir}`, { scroll: false });
  };
  const clearAll = () => update({ ...EMPTY });
  const toggleSort = (key: SortKey) => {
    const next = { key, dir: (sort.key === key ? sort.dir === "asc" ? "desc" : "asc" : key === "created" || key === "users" ? "desc" : "asc") as "asc" | "desc" };
    setSort(next); setPage(1);
    router.replace(`/tenants${toQuery(f)}${toQuery(f) ? "&" : "?"}sort=${next.key}&dir=${next.dir}`, { scroll: false });
  };

  const plans = useMemo(() => Array.from(new Set([...Object.keys(stats.data?.plans ?? {}), ...loaded.map((t) => t.subscription_plan)])).sort(), [stats.data, loaded]);
  const countries = useMemo(() => Array.from(new Set([...COUNTRY_NAMES, ...(f.country ? [f.country] : [])])).sort(), [f.country]);

  const statTotal = stats.data?.total_tenants;
  const trial = stats.data?.trial_tenants ?? "—";
  const cancelled = stats.data?.cancelled_tenants ?? "—";
  const closeCreate = () => { setShowCreate(false); setSelectedPrice(""); setCreatedTenant(null); setNotice(null); setForm({ name: "", slug: "", owner_full_name: "", owner_email: "", phone: "", city: "", country: "Rwanda" }); };

  const toggleStatus = (t: AdminTenant) => {
    const run = () => {
      setActing(t.id);
      const done = { onError: () => setError(`Failed to ${t.is_active ? "suspend" : "activate"} tenant`), onSettled: () => setActing(null) };
      if (t.is_active) suspendTenant.mutate(t.id, done); else activateTenant.mutate({ id: t.id }, done);
    };
    if (t.is_active) confirm({ title: "Suspend organization?", message: `Suspend "${t.name}"? This logs out everyone in the company immediately.`, confirmLabel: "Suspend", danger: true, onConfirm: run });
    else run();
  };
  const remove = (t: AdminTenant) => confirm({
    title: "Delete organization?", confirmText: t.name.trim(), message: `Archive "${t.name}" and disable access? Records will be retained.`, confirmLabel: "Delete", danger: true,
    onConfirm: () => { setActing(t.id); deleteTenant.mutate(t.id, { onError: () => setError("Failed to delete tenant"), onSettled: () => setActing(null) }); },
  });
  const confirmBulkDelete = () => confirm({
    title: "Delete organizations?", confirmText: pageRows.filter(t => bulk.selected.has(t.id)).map(t => t.name.trim()).join(", "), message: `Archive ${bulk.count} selected businesses and disable access? All records will be retained.`, confirmLabel: "Delete", danger: true,
    onConfirm: async () => { setBulkDeleting(true); await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteTenant.mutateAsync(id))); setBulkDeleting(false); bulk.clear(); },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createTenant.mutate(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof form, {
      onSuccess: (res) => { if (selectedPrice) setCreatedTenant(res.data.id); else setShowCreate(false); setForm({ name: "", slug: "", owner_full_name: "", owner_email: "", phone: "", city: "", country: "Rwanda" }); },
      onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Failed to create tenant"),
    });
  };
  const handleNameChange = (name: string) => setForm((x) => ({ ...x, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));

  // Export honours the current filters and sort across the WHOLE list (it pages through the API), not just what is on screen.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: AdminTenant[] = [];
      for (let p = 1; ; p++) {
        const res = await adminApi.listTenants(p, SCAN_SIZE, queryFilters);
        all.push(...res.data.items);
        if (all.length >= res.data.total || res.data.items.length === 0) break;
      }
      const out = sortRows(all, sort.key, sort.dir);
      const head = ["Business", "Slug", "Plan", "Account status", "Subscription status", "Users", "Country", "City", "Phone", "Created"];
      const lines = [head, ...out.map((t) => [t.name, t.slug, t.subscription_plan, tenantStatusLabel(t), t.subscription_status, t.usage?.users ?? "", t.country ?? "", t.city ?? "", t.phone ?? "", t.created_at?.slice(0, 10) ?? ""])];
      const url = URL.createObjectURL(new Blob(["﻿" + lines.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `pesaa_tenants_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError("Export failed. Please try again."); }
    setExporting(false);
  };

  const sortTh = (key: SortKey, label: string, cls = "") => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-4 py-3 font-semibold", cls)}>
      <button type="button" onClick={() => toggleSort(key)} className={cn("inline-flex items-center gap-1 uppercase tracking-wider", sort.key === key && "text-foreground")}>{label}<span aria-hidden className="text-[9px]">{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span></button>
    </th>
  );
  const th = (label: string, cls = "") => <th scope="col" className={cn(thClass, cls)}>{label}</th>;

  const chips: { label: string; clear: () => void }[] = [
    ...(f.industry ? [{ label: `Industry: ${f.industry}`, clear: () => update({ industry: "" }) }] : []),
    ...(f.businessType ? [{ label: `Business type: ${BUSINESS_TYPE_LABELS[f.businessType] ?? f.businessType}`, clear: () => update({ businessType: "" }) }] : []),
    ...(f.heardAbout ? [{ label: `Heard about us: ${f.heardAbout}`, clear: () => update({ heardAbout: "" }) }] : []),
  ];

  return (
    <div className="space-y-5">
      {confirmDialog}
      <PageHeader title="Tenants (Businesses)" subtitle="Manage all businesses on the Pesaa platform."
        actions={<>
          <Link href="/users"><Button variant="outline"><UserRound size={14} /> Search all users</Button></Link>
          <Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Add Tenant</Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Total Tenants" value={statTotal ?? "—"} icon={Building2} tone="bg-violet-500/10 text-violet-600" />
        <Metric label="Active Tenants" value={stats.data?.active_tenants ?? "—"} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" />
        <Metric label="Trial Tenants" value={trial} icon={Clock3} tone="bg-sky-500/10 text-sky-600"  />
        <Metric label="Suspended Tenants" value={stats.data?.suspended_tenants ?? "—"} icon={Ban} tone="bg-red-500/10 text-red-600" />
        <Metric label="Cancelled Tenants" value={cancelled} icon={XCircle} tone="bg-slate-500/10 text-slate-600"  />
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={15} /> {error}<button onClick={() => setError(null)} className="ml-auto text-xs font-medium text-muted hover:text-foreground">Dismiss</button></div>
      )}

      {featureUsage && featureUsage.modules.length > 0 && (
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[12.5px] font-bold text-foreground">Feature usage <span className="text-[11px] font-normal text-muted">— share of tenants using each module across all {featureUsage.total_tenants} tenants</span><span className="ml-auto text-[11px] font-normal text-muted group-open:hidden">Show</span><span className="ml-auto hidden text-[11px] font-normal text-muted group-open:inline">Hide</span></summary>
          <div className="flex items-center gap-4 border-t border-border p-4">
            <div className="flex h-[76px] w-[76px] flex-shrink-0 flex-col items-center justify-center rounded-xl bg-surface"><UsersIcon size={20} className="text-accent" /><span className="mt-1 text-sm font-bold">{featureUsage.total_tenants}</span><span className="text-[9px] text-muted">businesses</span></div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
              {featureUsage.modules.map((m) => (
                <div key={m.key} className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: MODULE_COLORS[m.key] ?? "#64748b" }} /><span className="flex-1 truncate text-[10.5px] text-foreground/80">{m.label}</span><span className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${adoptionBadgeClass(m.adoption_pct)}`}>{m.adoption_pct}%</span></div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.q} onChange={(v) => update({ q: v })} placeholder="Search tenants" />
        <Select aria-label="Plan" value={f.plan} onChange={(e) => update({ plan: e.target.value })} className="w-auto! capitalize"><option value="all">All Plans</option>{plans.map((p) => <option key={p} value={p}>{stats.data?.plan_names?.[p] ?? p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</Select>
        <Select aria-label="Status" value={f.status} onChange={(e) => update({ status: e.target.value as StatusFilter })} className="w-auto!"><option value="all">All Statuses</option><option value="active">Active</option><option value="pending">Pending Approval</option><option value="suspended">Suspended</option><option value="trial">Trial</option><option value="cancelled">Cancelled</option></Select>
        <Select aria-label="Country" value={f.country} onChange={(e) => update({ country: e.target.value })} className="w-auto!"><option value="">All Countries</option>{countries.map((c) => <option key={c}>{c}</option>)}</Select>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">From<Input type="date" aria-label="Registered from" value={f.from} max={f.to || undefined} onChange={(e) => update({ from: e.target.value })} className="w-auto!" /></label>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">To<Input type="date" aria-label="Registered to" value={f.to} min={f.from || undefined} onChange={(e) => update({ to: e.target.value })} className="w-auto!" /></label>
        {filtered && <Button variant="ghost" onClick={clearAll}><X size={13} /> Clear filters</Button>}
        <Button variant="outline" className="ml-auto" onClick={() => void exportCsv()} disabled={exporting} title="Exports every business that matches the current filters">{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export</Button>
      </div>
      {chips.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold text-muted">Filtered by:</span>{chips.map((c) => <button key={c.label} onClick={c.clear} className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1 text-[12px] font-semibold text-accent hover:bg-accent/20">{c.label} <X size={11} /></button>)}</div>}


      {active.isLoading ? <PageLoader variant="compact" /> : active.isError ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={15} /> Failed to load tenants <button onClick={() => void active.refetch()} className="ml-auto font-semibold underline">Retry</button></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {bulk.count > 0 && <div className="border-b border-border px-5 py-3"><BulkActionBar count={bulk.count} label="organization" pluralLabel="organizations" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} /></div>}
          <TableScroll label="Tenants"><table className="w-full min-w-[1080px] text-left">
            <thead><tr className="border-b border-border bg-surface/50">
              <th scope="col" className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all on this page" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="h-4 w-4 rounded" disabled={pageRows.length === 0} /></th>
              {sortTh("name", "Business")}{sortTh("plan", "Plan")}{sortTh("users", "Users")}{th("Contact via")}{th("Branches")}{th("Status")}{th("Last active")}{sortTh("created", "Created")}{th("Country")}<th scope="col" aria-label="Actions" className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((t) => (
                <tr key={t.id} className="group transition-colors hover:bg-surface/40">
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${t.name}`} checked={bulk.selected.has(t.id)} onChange={() => bulk.toggle(t.id)} className="h-4 w-4 rounded" /></td>
                  <td className="px-4 py-3"><Link href={`/tenants/${t.id}`} className="flex items-center gap-3"><TenantLogo name={t.name} src={resolveUploadUrl(t.logo_url)} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent">{t.name}</span><span className="block truncate font-mono text-[11px] text-muted">{t.slug}</span></span></Link></td>
                  <td className="px-4 py-3"><span className={`rounded-lg px-2 py-1 text-[11px] font-semibold capitalize ${PLAN_COLORS[t.subscription_plan] ?? "bg-surface text-muted"}`}>{stats.data?.plan_names?.[t.subscription_plan] ?? t.subscription_plan}</span></td>
                  <td className="px-4 py-3 text-[13px] font-semibold">{t.usage?.users ?? "—"}</td>
                  <td className="px-4 py-3"><ContactBadge value={t.preferred_contact} />{(t.preferred_contact === "phone" || t.preferred_contact === "whatsapp") && t.phone && <span className="mt-0.5 block text-[11px] text-muted">{t.phone}</span>}</td>
                  <td className="px-4 py-3 text-[12px] text-muted">{t.multi_branch ? "Multi-branch" : "Single"}</td>
                  <td className="px-4 py-3">{acting === t.id ? <Loader2 size={14} className="animate-spin text-muted" /> : <TenantStatusBadge tenant={t} />}</td>
                  <td className="px-4 py-3 text-[12px] text-muted">{t.usage ? fmtRelative(t.usage.last_active_at) : "—"}</td>
                  <td className="px-4 py-3 text-[12px] text-muted">{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-[12px] text-muted">{t.country || "—"}</td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                    <Link href={`/tenants/${t.id}`}><Button variant="secondary" size="sm"><Eye size={13} /> View</Button></Link>
                    <ActionMenu label={`More actions for ${t.name}`} items={[
                      { label: "View details", icon: <Eye size={14} />, onSelect: () => router.push(`/tenants/${t.id}`) },
                      { label: "Manage users", icon: <UsersIcon size={14} />, onSelect: () => router.push(`/tenants/${t.id}?tab=users`) },
                      { label: t.is_active ? "Suspend" : t.subscription_status === "pending" ? "Approve" : "Reactivate", icon: <Power size={14} />, danger: t.is_active, disabled: !!t.archived_at, onSelect: () => toggleStatus(t) },
                      { label: "Delete", icon: <Trash2 size={14} />, danger: true, onSelect: () => remove(t) },
                    ]} />
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
          {pageRows.length === 0 && (
            <div className="py-16 text-center"><Building2 size={32} className="mx-auto mb-3 text-muted/30" /><p className="text-sm font-semibold text-foreground">{filtered ? "No tenants match your filters" : "No tenants yet"}</p><p className="mt-1 text-[12px] text-muted">{filtered ? "Try adjusting your search or filters" : "Add your first tenant to get started"}</p>{filtered && <button onClick={clearAll} className="mt-3 text-[13px] font-semibold text-accent underline">Clear filters</button>}</div>
          )}
        </div>
      )}
      {total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} noun="tenant" />}

      <Drawer open={showCreate} onClose={closeCreate} title="Onboard New Tenant" description="Create a new business on the platform">
        {createdTenant && selectedPrice ? <PlanChange tenantId={createdTenant} input={{ plan_id: selectedPrice.split(":")[0], currency: selectedPrice.split(":")[1], cycle: "monthly" }} onClose={closeCreate} onDone={closeCreate} /> : <form onSubmit={handleCreate} className="space-y-4 p-5">
          {notice && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{notice}</p>}
          <Field label="Owner full name" required><Input required value={form.owner_full_name} onChange={e => setForm({ ...form, owner_full_name: e.target.value })} /></Field>
          <Field label="Owner email" required><Input required type="email" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} /></Field>
          <Field label="Business Name" required><Input required value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Acme Corp" /></Field>
          <Field label="Slug (URL identifier)" required><Input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme-corp" /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Plan" hint="An active plan is reviewed after the owner account is created."><Select value={selectedPrice} onChange={e => setSelectedPrice(e.target.value)}><option value="">Assign later</option>{planCatalog.data?.items.flatMap(p => p.prices.map(price => <option key={`${p.id}:${price.currency}`} value={`${p.id}:${price.currency}`}>{p.name.charAt(0).toUpperCase() + p.name.slice(1)} · {price.currency}</option>))}</Select><BillingPagination page={planPage} total={planCatalog.data?.total ?? 0} onPage={setPlanPage} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+250..." /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Kigali" /></Field>
            <Field label="Country"><Select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>{COUNTRY_NAMES.map(c => <option key={c}>{c}</option>)}</Select></Field>
          </div>
          <FormFooter submitLabel={createTenant.isPending ? "Creating…" : "Create Tenant"} onCancel={closeCreate} disabled={createTenant.isPending} />
        </form>}
      </Drawer>
    </div>
  );
}

export default function AdminTenantsPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><AdminTenantsPageInner /></Suspense>;
}
