"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Building2, ShoppingCart, Users } from "lucide-react";
import { useAdminFeatureUsage, useAdminUsageBreakdown, useAdminStats, useTenants } from "@/lib/api/hooks";
import { formatMoney } from "@/lib/money";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Metric } from "@/components/ui/Metric";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Form";
import { ErrorState } from "@/components/ui/EmptyState";
import { TenantLogo, TenantStatusBadge } from "@/components/tenants/StatusBadge";
import { AiUsagePanel } from "@/components/admin/AiUsagePanel";

function CurrencyAmounts({ amounts }: { amounts: Record<string, number> }) {
  const entries = Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b));
  return <>{entries.length ? entries.map(([currency, amount]) => <p key={currency}>{formatMoney(amount, currency, { showCode: true })}</p>) : "—"}</>;
}

export default function AdminUsagePage() {
  const report = useAdminUsageBreakdown();
  const stats = useAdminStats();
  const modules = useAdminFeatureUsage();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: "", plan: "all", status: "all", sort: "created", dir: "desc" });
  const tenants = useTenants(page, 25, undefined, filters);
  const set = (key: keyof typeof filters, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); };
  const data = report.data;
  if (report.isLoading) return <PageLoader variant="page" />;
  if (report.isError || !data) return <ErrorState message="Could not load platform usage." onRetry={() => void report.refetch()} />;
  return <div className="space-y-5">
    <PageHeader title="Platform Usage" subtitle="All-time platform totals. Tenant sales use completed orders, separated by currency, matching Overview." />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Businesses" value={data.summary.total_tenants} icon={Building2} />
      <Metric label="Users" value={data.summary.total_users} icon={Users} />
      <Metric label="Orders" value={data.summary.total_orders} icon={ShoppingCart} />
      <Metric label="Active in 30 days" value={data.summary.active_30d} icon={Activity} />
    </div>
    <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-bold">Tenant Sales</h2><p className="mb-3 text-xs text-muted">Per currency, not combined · all time</p><div className="space-y-1 text-lg font-semibold"><CurrencyAmounts amounts={data.summary.revenue_by_currency} /></div></section>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5"><h2 className="mb-3 text-sm font-bold">Tenant Engagement</h2>{data.engagement.map(t => <div key={t.tier} className="flex justify-between border-b border-border py-2 text-sm"><span className="capitalize">{t.tier}</span><span>{t.tenants}</span></div>)}</section>
      <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-bold">Module Adoption</h2><p className="mb-3 text-xs text-muted">Share of tenants using each module across all {modules.data?.total_tenants ?? "—"} businesses</p>{modules.data?.modules.map(m => <div key={m.key} className="flex justify-between border-b border-border py-2 text-sm"><span>{m.label}</span><span>{m.tenants_using} tenants · {m.adoption_pct}% · {m.total_records} records</span></div>)}</section>
    </div>
    <DataCard label="Usage by plan"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{["Plan", "Businesses", "Users", "Orders", "Products", "Sales per currency"].map(h => <th key={h} className={thClass}>{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.by_plan.map(p => <tr key={p.plan}><td className="px-4 py-3 capitalize">{p.plan_name ?? p.plan}</td><td className="px-4 py-3">{p.tenants}</td><td className="px-4 py-3">{p.users}</td><td className="px-4 py-3">{p.orders}</td><td className="px-4 py-3">{p.products}</td><td className="px-4 py-3"><CurrencyAmounts amounts={p.revenue_by_currency} /></td></tr>)}</tbody></table></DataCard>
    <DataCard label="Top tenants by order volume"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr>{["Business", "Orders", "Users", "Tenant sales"].map(h => <th key={h} className={thClass}>{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.top_tenants.map(t => <tr key={t.id}><td className="px-4 py-3"><Link className="font-semibold text-accent" href={`/tenants/${t.id}`}>{t.name.trim()}</Link></td><td className="px-4 py-3">{t.orders}</td><td className="px-4 py-3">{t.users}</td><td className="px-4 py-3">{formatMoney(t.revenue, t.currency, { showCode: true })}</td></tr>)}</tbody></table></DataCard>
    <section className="space-y-3"><h2 className="text-sm font-bold">Tenant Directory</h2><p className="text-xs text-muted">These filters apply to the directory below. Platform totals above always include every business.</p>
      <div className="flex flex-wrap gap-2"><SearchBox value={filters.q} onChange={v => set("q", v)} placeholder="Search businesses" /><Select aria-label="Plan" className="w-auto!" value={filters.plan} onChange={e => set("plan", e.target.value)}><option value="all">All Plans</option>{Object.keys(stats.data?.plans ?? {}).map(p => <option key={p} value={p}>{stats.data?.plan_names?.[p] ?? p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</Select><Select aria-label="Status" className="w-auto!" value={filters.status} onChange={e => set("status", e.target.value)}><option value="all">All Statuses</option>{["active", "pending", "suspended", "trial", "cancelled"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</Select><Select aria-label="Sort" className="w-auto!" value={filters.sort} onChange={e => set("sort", e.target.value)}><option value="created">Newest</option><option value="name">Business</option><option value="users">Users</option><option value="plan">Plan</option></Select></div>
      {tenants.isLoading ? <PageLoader variant="compact" /> : tenants.isError ? <ErrorState message="Could not load businesses." onRetry={() => void tenants.refetch()} /> : <DataCard label="Businesses"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr>{["Business", "Plan", "Status", "Users", "Orders", "Sales"].map(h => <th key={h} className={thClass}>{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{tenants.data?.items.map(t => <tr key={t.id}><td className="px-4 py-3"><Link href={`/tenants/${t.id}`} className="flex items-center gap-2"><TenantLogo name={t.name} /><span>{t.name.trim()}</span></Link></td><td className="px-4 py-3 capitalize">{stats.data?.plan_names?.[t.subscription_plan] ?? t.subscription_plan}</td><td className="px-4 py-3"><TenantStatusBadge tenant={t} /></td><td className="px-4 py-3">{t.usage?.users}</td><td className="px-4 py-3">{t.usage?.orders}</td><td className="px-4 py-3">{formatMoney(t.usage?.revenue ?? 0, t.currency, { showCode: true })}</td></tr>)}</tbody></table></DataCard>}
      <Pagination page={page} pageSize={25} total={tenants.data?.total ?? 0} onPage={setPage} noun="business" />
    </section>
    <AiUsagePanel />
  </div>;
}
