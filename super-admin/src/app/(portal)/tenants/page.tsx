"use client";
import { PlanChange } from "@/components/billing/BillingShared";
import { COUNTRY_NAMES } from "@/lib/countries";
import { BillingPagination } from "@/components/billing/BillingShared";
import { TableScroll } from "@/components/ui/TableScroll";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Archive, CreditCard, Factory, Globe, ShoppingCart, SlidersHorizontal, Bell, Building2, Download, Eye, Loader2, Plus, Power, UserRound, Users as UsersIcon, X,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { fmtRelative } from "@/lib/date";
import { adminApi, tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";
import { resolveUploadUrl } from "@/lib/api/client";
import { useTenants, useCreateTenant, useActivateTenant, useAdminFeatureUsage, useTenantFilterOptions, useTenantSummary, useAdminStats, useBillingRecords } from "@/lib/api/hooks";
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

type StatusFilter = "all" | "active" | "pending" | "suspended" | "trial" | "cancelled";
type SortKey = "name" | "created" | "users" | "plan";
interface Filters { q: string; status: StatusFilter; plan: string; country: string; from: string; to: string; industry: string; businessType: string; heardAbout: string; size: string; feature: string; featureState: "using" | "not_using" }
const EMPTY: Filters = { q: "", status: "all", plan: "all", country: "", from: "", to: "", industry: "", businessType: "", heardAbout: "", size: "", feature: "", featureState: "using" };

function fromParams(p: URLSearchParams): Filters {
  const s = p.get("status");
  return {
    q: p.get("q") ?? "", status: s === "active" || s === "pending" || s === "suspended" || s === "trial" || s === "cancelled" ? s : "all", plan: p.get("plan") ?? "all", country: p.get("country") ?? "",
    from: p.get("from") ?? "", to: p.get("to") ?? "", industry: p.get("industry") ?? "", businessType: p.get("businessType") ?? "", heardAbout: p.get("heardAbout") ?? "",
    size: p.get("size") ?? "", feature: p.get("feature") ?? "", featureState: p.get("featureState") === "not_using" ? "not_using" : "using",
  };
}
function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.status !== "all") p.set("status", f.status);
  if (f.plan !== "all") p.set("plan", f.plan);
  for (const k of ["country", "from", "to", "industry", "businessType", "heardAbout", "size", "feature"] as const) if (f[k]) p.set(k, f[k]);
  if (f.feature && f.featureState === "not_using") p.set("featureState", "not_using");
  const s = p.toString();
  return s ? `?${s}` : "";
}
const isFiltered = (f: Filters) => (Object.keys(EMPTY) as (keyof Filters)[]).some((k) => k === "featureState" ? !!f.feature && f.featureState !== EMPTY.featureState : f[k] !== EMPTY[k]);

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

  const [showMore, setShowMore] = useState(false);
  const moreCount = [f.businessType, f.heardAbout, f.feature, f.from, f.to].filter(Boolean).length;
  const filtered = isFiltered(f);
  const queryFilters = { ...f, created_from: f.from, created_to: f.to, sort: sort.key, dir: sort.dir };
  // The same group the filters select, so the usage numbers below always describe the businesses in the table.
  const usageFilters: Record<string, string> = Object.fromEntries(Object.entries({ q: f.q, status: f.status === "all" ? "" : f.status, plan: f.plan === "all" ? "" : f.plan, country: f.country, industry: f.industry,
    businessType: f.businessType, heardAbout: f.heardAbout, size: f.size, created_from: f.from, created_to: f.to }).filter(([, v]) => v));
  const active = useTenants(page, PAGE_SIZE, undefined, queryFilters);
  const stats = useAdminStats();
  const { data: featureUsage } = useAdminFeatureUsage(usageFilters);
  const summaryFilters: Record<string, string> = { ...usageFilters, ...(f.feature ? { feature: f.feature, featureState: f.featureState } : {}) };
  const summary = useTenantSummary(summaryFilters).data;
  const options = useTenantFilterOptions().data;
  const loaded = useMemo(() => active.data?.items ?? [], [active.data]);
  const total = active.data?.total ?? 0;
  const pageRows = loaded;

  const createTenant = useCreateTenant();
  const activateTenant = useActivateTenant();

  const update = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    setPage(1);
    router.replace(`/tenants${toQuery(next)}${toQuery(next) ? "&" : "?"}sort=${sort.key}&dir=${sort.dir}`, { scroll: false });
  };
  const clearAll = () => update({ ...EMPTY });
  const toggleSort = (key: SortKey) => {
    const next = { key, dir: (sort.key === key ? sort.dir === "asc" ? "desc" : "asc" : key === "created" || key === "users" ? "desc" : "asc") as "asc" | "desc" };
    setSort(next); setPage(1);
    router.replace(`/tenants${toQuery(f)}${toQuery(f) ? "&" : "?"}sort=${next.key}&dir=${next.dir}`, { scroll: false });
  };

  const plans = useMemo(() => Array.from(new Set([...Object.keys(stats.data?.plans ?? {}), ...loaded.map((t) => t.subscription_plan)])).sort(), [stats.data, loaded]);

  const closeCreate = () => { setShowCreate(false); setSelectedPrice(""); setCreatedTenant(null); setNotice(null); setForm({ name: "", slug: "", owner_full_name: "", owner_email: "", phone: "", city: "", country: "Rwanda" }); };

  // Suspending and archiving need a reason and a typed confirmation, so they live on the business's Operations tab.
  // Approving or reactivating needs neither, so it still happens in place.
  const toggleStatus = (t: AdminTenant) => {
    if (t.is_active) { router.push(`/tenants/${t.id}?tab=operations`); return; }
    setActing(t.id);
    activateTenant.mutate({ id: t.id }, { onError: () => setError("Failed to activate tenant"), onSettled: () => setActing(null) });
  };

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
      const head = ["Business", "Slug", "Plan", "Industry", "Business size", "Account status", "Subscription status", "Users", "Country", "City", "Phone", "Created"];
      const lines = [head, ...out.map((t) => [t.name, t.slug, t.subscription_plan, t.industry ?? "", t.employee_count ?? "", tenantStatusLabel(t), t.subscription_status, t.usage?.users ?? "", t.country ?? "", t.city ?? "", t.phone ?? "", t.created_at?.slice(0, 10) ?? ""])];
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
    ...(f.size ? [{ label: `Size: ${f.size}`, clear: () => update({ size: "" }) }] : []),
    ...(f.country ? [{ label: `Country: ${f.country}`, clear: () => update({ country: "" }) }] : []),
    ...(f.businessType ? [{ label: `Business type: ${BUSINESS_TYPE_LABELS[f.businessType] ?? f.businessType}`, clear: () => update({ businessType: "" }) }] : []),
    ...(f.plan !== "all" ? [{ label: `Plan: ${stats.data?.plan_names?.[f.plan] ?? f.plan}`, clear: () => update({ plan: "all" }) }] : []),
    ...(f.heardAbout ? [{ label: `Found us via: ${f.heardAbout}`, clear: () => update({ heardAbout: "" }) }] : []),
    ...(f.feature ? [{ label: `${f.featureState === "using" ? "Uses" : "Has not used"}: ${featureUsage?.modules.find((m) => m.key === f.feature)?.label ?? f.feature}`, clear: () => update({ feature: "" }) }] : []),
    ...(f.status !== "all" ? [{ label: `Status: ${f.status}`, clear: () => update({ status: "all" }) }] : []),
    ...(f.from || f.to ? [{ label: `Registered ${f.from || "…"} to ${f.to || "…"}`, clear: () => update({ from: "", to: "" }) }] : []),
    ...(f.q ? [{ label: `Search: ${f.q}`, clear: () => update({ q: "" }) }] : []),
  ];
  // Menu entries for a filter: real values with how many businesses have each. A value already chosen stays listed even if nobody has it now.
  const pick = (list: { value: string; count: number }[] | undefined, current: string, label: (v: string) => string | undefined = () => undefined) => {
    const rows = list ?? [];
    const all = current && !rows.some((r) => r.value === current) ? [...rows, { value: current, count: 0 }] : rows;
    return all.map((r) => <option key={r.value} value={r.value}>{label(r.value) ?? r.value} ({r.count})</option>);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Tenants (Businesses)" subtitle="Manage all businesses on the Pesaa platform."
        actions={<>
          <Link href="/users"><Button variant="outline"><UserRound size={14} /> Search all users</Button></Link>
          <Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Add Tenant</Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Market summary">
        <Metric label="Businesses" value={summary?.total ?? "—"} sub={summary ? `+${summary.new_30_days} in 30 days` : undefined} icon={Building2} tone="bg-violet-500/10 text-violet-600" />
        <Metric label="Top industry" value={summary?.top_industry?.name ?? "—"} sub={summary?.top_industry ? `${summary.top_industry.percent}% of businesses` : undefined} icon={Factory} tone="bg-sky-500/10 text-sky-600" />
        <Metric label="Top country" value={summary?.top_country?.name ?? "—"} sub={summary?.top_country ? `${summary.top_country.percent}% of businesses` : undefined} icon={Globe} tone="bg-emerald-500/10 text-emerald-600" />
        <Metric label="Common size" value={summary?.top_size?.name ?? "—"} sub={summary?.top_size ? `${summary.top_size.percent}% of businesses` : undefined} icon={UsersIcon} tone="bg-amber-500/10 text-amber-600" />
        <Metric label="On a paid plan" value={summary ? `${summary.paying.percent}%` : "—"} sub={summary ? `${summary.paying.count} of ${summary.total}` : undefined} icon={CreditCard} tone="bg-rose-500/10 text-rose-600" />
        <Metric label="Recording sales" value={summary ? `${summary.recording_sales.percent}%` : "—"} sub={summary ? `${summary.recording_sales.count} of ${summary.total}` : undefined} icon={ShoppingCart} tone="bg-slate-500/10 text-slate-600" />
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={15} /> {error}<button onClick={() => setError(null)} className="ml-auto text-xs font-medium text-muted hover:text-foreground">Dismiss</button></div>
      )}

      {/* Filters: one compact row; the less-used ones sit behind "More filters" */}
      <section aria-label="Filters" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={f.q} onChange={(v) => update({ q: v })} placeholder="Search name, phone, website" />
          <Select aria-label="Industry" value={f.industry} onChange={(e) => update({ industry: e.target.value })} className="w-auto! max-w-[180px]"><option value="">All industries</option>{pick(options?.industries, f.industry)}</Select>
          <Select aria-label="Business size (people)" value={f.size} onChange={(e) => update({ size: e.target.value })} className="w-auto!"><option value="">Any size</option>{pick(options?.sizes, f.size)}</Select>
          <Select aria-label="Country" value={f.country} onChange={(e) => update({ country: e.target.value })} className="w-auto! max-w-[170px]"><option value="">All countries</option>{pick(options?.countries, f.country)}</Select>
          <Select aria-label="Plan" value={f.plan} onChange={(e) => update({ plan: e.target.value })} className="w-auto! capitalize"><option value="all">Any plan</option>{plans.map((p) => <option key={p} value={p}>{stats.data?.plan_names?.[p] ?? p}</option>)}</Select>
          <Select aria-label="Account status" value={f.status} onChange={(e) => update({ status: e.target.value as StatusFilter })} className="w-auto!"><option value="all">Any status</option><option value="active">Active</option><option value="pending">Pending activation</option><option value="suspended">Suspended</option><option value="trial">On trial</option><option value="cancelled">Cancelled</option></Select>
          <Button variant="outline" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}><SlidersHorizontal size={14} /> More{moreCount > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{moreCount}</span>}</Button>
          {filtered && <Button variant="ghost" onClick={clearAll}><X size={13} /> Clear</Button>}
          <Button variant="outline" className="ml-auto" onClick={() => void exportCsv()} disabled={exporting} title="Exports every business that matches the current filters">{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export</Button>
        </div>
        {showMore && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5">
            <Select aria-label="Business type" value={f.businessType} onChange={(e) => update({ businessType: e.target.value })} className="w-auto!"><option value="">Any business type</option>{pick(options?.business_types, f.businessType, (v) => BUSINESS_TYPE_LABELS[v])}</Select>
            <Select aria-label="How they found us" value={f.heardAbout} onChange={(e) => update({ heardAbout: e.target.value })} className="w-auto!"><option value="">Any source</option>{pick(options?.heard_about, f.heardAbout)}</Select>
            <Select aria-label="Feature" value={f.feature} onChange={(e) => update({ feature: e.target.value })} className="w-auto!"><option value="">Any feature</option>{(featureUsage?.modules ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>
            <Select aria-label="Feature use" value={f.featureState} disabled={!f.feature} onChange={(e) => update({ featureState: e.target.value as Filters["featureState"] })} className="w-auto!"><option value="using">Uses it</option><option value="not_using">Has not used it</option></Select>
            <label className="flex items-center gap-1.5 text-[12px] text-muted">Registered<Input type="date" aria-label="Registered from" value={f.from} max={f.to || undefined} onChange={(e) => update({ from: e.target.value })} className="w-auto!" /></label>
            <label className="flex items-center gap-1.5 text-[12px] text-muted">to<Input type="date" aria-label="Registered to" value={f.to} min={f.from || undefined} onChange={(e) => update({ to: e.target.value })} className="w-auto!" /></label>
          </div>
        )}
        {chips.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{chips.map((c) => <button key={c.label} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[12px] font-semibold text-accent hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-accent">{c.label}<X size={11} aria-hidden /><span className="sr-only"> remove filter</span></button>)}<span className="ml-1 text-[12px] text-muted"><strong className="text-foreground">{total}</strong> business{total === 1 ? "" : "es"}</span></div>}
      </section>

      {/* Feature usage for exactly the businesses the filters select: one slim strip */}
      {featureUsage && featureUsage.modules.length > 0 && (
        <section aria-label="Feature usage" className="rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="mb-2 text-[12px] text-muted"><strong className="text-[13px] text-foreground">Feature usage</strong> · businesses using each feature, out of {featureUsage.total_tenants}. Select one to list them.{f.feature && <> <button type="button" onClick={() => update({ feature: "" })} className="font-semibold text-accent hover:underline">Show all</button></>}</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4 xl:grid-cols-8">
            {featureUsage.modules.map((m) => {
              const on = f.feature === m.key;
              return (
                <li key={m.key}>
                  <button type="button" aria-pressed={on} title={`${m.tenants_using} of ${featureUsage.total_tenants} businesses · ${m.total_records.toLocaleString()} records`} onClick={() => update({ feature: on ? "" : m.key, featureState: "using" })} className={cn("w-full rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", on ? "bg-accent/10" : "hover:bg-surface")}>
                    <span className="flex items-center justify-between gap-1 text-[12px]"><span className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-foreground"><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: MODULE_COLORS[m.key] ?? "#64748b" }} />{m.label}</span><span className="shrink-0 font-bold tabular-nums text-foreground">{m.adoption_pct}%</span></span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full" style={{ width: `${m.adoption_pct}%`, backgroundColor: MODULE_COLORS[m.key] ?? "#64748b" }} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {active.isLoading ? <PageLoader variant="compact" /> : active.isError ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={15} /> Failed to load tenants <button onClick={() => void active.refetch()} className="ml-auto font-semibold underline">Retry</button></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <TableScroll label="Tenants"><table className="w-full min-w-[1240px] text-left">
            <thead><tr className="border-b border-border bg-surface/50">
              {sortTh("name", "Business")}{sortTh("plan", "Plan")}{th("Industry")}{th("Size")}{sortTh("users", "Users")}{th("Contact via")}{th("Branches")}{th("Status")}{th("Last active")}{sortTh("created", "Created")}{th("Country")}<th scope="col" aria-label="Actions" className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((t) => (
                <tr key={t.id} className="group transition-colors hover:bg-surface/40">
                  <td className="px-4 py-3"><Link href={`/tenants/${t.id}`} className="flex items-center gap-3"><TenantLogo name={t.name} src={resolveUploadUrl(t.logo_url)} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent">{t.name}</span><span className="block truncate font-mono text-[11px] text-muted">{t.slug}</span></span></Link></td>
                  <td className="px-4 py-3"><span className={`rounded-lg px-2 py-1 text-[11px] font-semibold capitalize ${PLAN_COLORS[t.subscription_plan] ?? "bg-surface text-muted"}`}>{stats.data?.plan_names?.[t.subscription_plan] ?? t.subscription_plan}</span></td>
                  <td className="max-w-[150px] truncate px-4 py-3 text-[12px] text-muted" title={t.industry ?? undefined}>{t.industry || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[12px] text-muted">{t.employee_count || "—"}</td>
                  <td className="px-4 py-3 text-[13px] font-semibold">{t.usage?.users ?? "—"}</td>
                  <td className="px-4 py-3"><ContactBadge value={t.preferred_contact} />{(t.preferred_contact === "phone" || t.preferred_contact === "whatsapp" || t.preferred_contact === "all") && t.phone && <span className="mt-0.5 block text-[11px] text-muted">{t.phone}</span>}</td>
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
                      { label: t.is_active ? "Suspend access…" : t.subscription_status === "pending" ? "Approve" : "Reactivate", icon: <Power size={14} />, disabled: !!t.archived_at, onSelect: () => toggleStatus(t) },
                      { label: "Send message", icon: <Bell size={14} />, onSelect: () => router.push(`/tenants/${t.id}?tab=operations`) },
                      { label: "Export data", icon: <Download size={14} />, onSelect: () => router.push(`/tenants/${t.id}?tab=operations`) },
                      { label: "Archive business…", icon: <Archive size={14} />, danger: true, disabled: !!t.archived_at, onSelect: () => router.push(`/tenants/${t.id}?tab=operations`) },
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

      <Drawer open={showCreate} onClose={closeCreate} dirty={showCreate && !createdTenant && (!!form.name || !!form.slug || !!form.owner_full_name || !!form.owner_email || !!form.phone || !!form.city)} title="Onboard New Tenant" description="Create a new business on the platform">
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
