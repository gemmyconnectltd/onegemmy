"use client";

import Link from "next/link";
import { Activity, Building2, ShoppingCart, Users } from "lucide-react";
import { useAdminFeatureUsage, useAdminUsageBreakdown } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Metric } from "@/components/ui/Metric";
import { ErrorState } from "@/components/ui/EmptyState";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { AiUsagePanel } from "@/components/admin/AiUsagePanel";
import { CurrencySalesList, EngagementDistribution, ModuleAdoptionTable, UsageCard, fmtCount, formatMoney } from "@/components/usage/UsageShared";

function CurrencyAmounts({ amounts }: { amounts: Record<string, number> }) {
  const entries = Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b));
  return <>{entries.length ? entries.map(([currency, amount]) => <p key={currency}>{formatMoney(amount, currency, { showCode: true })}</p>) : "—"}</>;
}

export default function AdminUsagePage() {
  const report = useAdminUsageBreakdown();
  const modules = useAdminFeatureUsage();
  const data = report.data;
  if (report.isLoading) return <PageLoader variant="page" />;
  if (report.isError || !data) return <ErrorState message="Could not load platform usage." onRetry={() => void report.refetch()} />;
  const counts = Object.fromEntries(data.engagement.map((t) => [t.tier, t.tenants])) as Record<"dormant" | "light" | "moderate" | "heavy", number>;
  const updated = report.dataUpdatedAt ? new Date(report.dataUpdatedAt).toLocaleTimeString() : null;
  return <div className="space-y-5">
    <PageHeader title="Platform Usage" subtitle={<>Key platform activity across all tenants. All-time totals{updated ? ` · updated ${updated}` : ""}.</>} />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Link href="/tenants" className="rounded-xl focus-visible:outline-2 focus-visible:outline-accent"><Metric label="Businesses" value={data.summary.total_tenants} icon={Building2} /></Link>
      <Metric label="Users" value={data.summary.total_users} icon={Users} />
      <Metric label="Orders" value={data.summary.total_orders} icon={ShoppingCart} />
      <Metric label="Active Businesses" value={data.summary.active_30d} sub="Ordered in the last 30 days" icon={Activity} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <UsageCard title="Tenant Sales" subtitle="Completed orders per currency · all time · never combined"><CurrencySalesList amounts={data.summary.revenue_by_currency} /></UsageCard>
      <UsageCard title="Tenant Engagement" subtitle={`By total orders recorded · ${fmtCount(data.summary.total_tenants)} businesses`}><EngagementDistribution counts={counts} /></UsageCard>
    </div>
    <UsageCard title="Module Adoption" subtitle={`Tenants with at least one record in the module, out of ${modules.data?.total_tenants ?? "—"} businesses. Having a feature switched on does not count as use.`}>
      {modules.isLoading ? <PageLoader variant="compact" /> : modules.isError || !modules.data ? <ErrorState message="Could not load module adoption." onRetry={() => void modules.refetch()} /> : <ModuleAdoptionTable modules={modules.data.modules} totalTenants={modules.data.total_tenants} />}
    </UsageCard>
    <DataCard label="Usage by plan"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{["Plan", "Businesses", "Users", "Orders", "Products", "Sales per currency"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.by_plan.map((p) => <tr key={p.plan}><td className="px-4 py-3 capitalize">{p.plan_name ?? p.plan}</td><td className="px-4 py-3">{p.tenants}</td><td className="px-4 py-3">{p.users}</td><td className="px-4 py-3">{p.orders}</td><td className="px-4 py-3">{p.products}</td><td className="px-4 py-3"><CurrencyAmounts amounts={p.revenue_by_currency} /></td></tr>)}</tbody></table></DataCard>
    <DataCard label="Top tenants by order volume"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr>{["Business", "Orders", "Users", "Tenant sales"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.top_tenants.map((t) => <tr key={t.id}><td className="px-4 py-3"><Link className="font-semibold text-accent hover:underline" href={`/tenants/${t.id}?tab=usage`}>{t.name.trim()}</Link></td><td className="px-4 py-3">{t.orders}</td><td className="px-4 py-3">{t.users}</td><td className="px-4 py-3">{formatMoney(t.revenue, t.currency, { showCode: true })}</td></tr>)}</tbody></table></DataCard>
    <AiUsagePanel />
  </div>;
}
