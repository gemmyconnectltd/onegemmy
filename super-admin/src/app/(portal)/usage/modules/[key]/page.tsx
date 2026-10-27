"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { Activity, Boxes, Building2, Database } from "lucide-react";
import { useUsageModule } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Metric } from "@/components/ui/Metric";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Form";
import { TrendChart, type ChartTheme } from "@/components/charts/lazyTraffic";
import { Breadcrumbs, EngagementDistribution, MODULE_ICON, StatusPill, TenantLink, TIER_LABEL, UsageCard, UsagePeriodSelect, fmtCount, fmtWhen, usePeriodParam } from "@/components/usage/UsageShared";

const KEYS = ["sales", "inventory", "accounting", "hr", "procurement", "manufacturing", "crm", "repairs"];

export default function ModuleUsagePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  if (!KEYS.includes(key)) notFound();
  return <ModuleUsage moduleKey={key} />;
}

function ModuleUsage({ moduleKey }: { moduleKey: string }) {
  const { period, set: setPeriod, query: periodQuery } = usePeriodParam("30");
  const [f, setF] = useState({ page: 1, q: "", status: "all" });
  const patch = (p: Partial<typeof f>) => setF((cur) => ({ ...cur, ...p, page: p.page ?? 1 }));
  const query = useUsageModule(moduleKey, period, f);
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const data = query.data;
  const Icon = MODULE_ICON[moduleKey] ?? Boxes;
  const info = data?.summary.module;
  const label = info?.label ?? moduleKey;
  const periodLabel = period === "all" ? "all time" : `last ${period} days`;
  const points = (data?.summary.trend ?? []).map((t) => ({ label: new Date(t.month).toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" }), value: t.tenants_using, previousLabel: null, previous: null }));
  return <div className="space-y-5">
    <div><Breadcrumbs items={[{ label: "Platform Usage", href: "/usage" }, { label: `${label} usage` }]} />
      <PageHeader title={<span className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={18} aria-hidden /></span>{label} Usage</span>}
        subtitle={info?.description ?? "Module usage across tenants."} actions={<UsagePeriodSelect period={period} onChange={setPeriod} />} /></div>
    {query.isLoading ? <PageLoader variant="page" /> : query.isError || !data ? <ErrorState message="Could not load module usage." onRetry={() => void query.refetch()} /> : <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Tenants using" value={data.summary.kpis.tenants_using} sub={`${data.summary.kpis.adoption_pct}% of ${fmtCount(data.summary.kpis.total_tenants)} · all time`} icon={Building2} />
        <Metric label="Active tenants" value={data.summary.kpis.active_tenants_in_period} sub={`Created records · ${periodLabel}`} icon={Activity} />
        <Metric label="Total records" value={data.summary.kpis.total_records} sub="All time" icon={Database} />
        <Metric label="Records created" value={data.summary.kpis.records_in_period} sub={periodLabel} icon={Boxes} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <UsageCard title="Adoption over time" subtitle="Tenants that had created their first record by each month">
          {points.length > 1 ? <div className="h-56"><TrendChart points={points} color={c.primary} name="Tenants using" theme={chartTheme} /></div> : <p className="py-10 text-center text-sm text-muted">{points.length ? "Only one month of history so far." : "No tenant has used this module yet."}</p>}
        </UsageCard>
        <UsageCard title="Tenants by engagement level" subtitle={`Tenants using ${label}, by overall platform engagement`}>
          {data.summary.engagement_mix && data.total > 0 ? <EngagementDistribution counts={data.summary.engagement_mix} query={periodQuery} /> : <p className="py-10 text-center text-sm text-muted">No tenants to show.</p>}
        </UsageCard>
      </div>
      <section className="space-y-3"><h2 className="text-sm font-bold">Tenants using {label}</h2>
        <div className="flex flex-wrap gap-2"><SearchBox value={f.q} onChange={(q) => patch({ q })} placeholder="Search businesses" />
          <Select aria-label="Status" className="w-auto!" value={f.status} onChange={(e) => patch({ status: e.target.value })}><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></Select></div>
        {!data.items.length ? <EmptyState icon={Icon} title={f.q || f.status !== "all" ? "No businesses match" : `No business uses ${label} yet`} description={f.q || f.status !== "all" ? "Try a different search or status." : "A business counts as using a module once it has created at least one record in it."} /> :
          <DataCard label={`Tenants using ${label}`}><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{["Business", "Status", "Users", "Records", "Engagement", "Last activity"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}<th scope="col" className={thClass}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">{data.items.map((t) => <tr key={t.id}><td className="px-4 py-3"><TenantLink tenant={t} /></td><td className="px-4 py-3"><StatusPill status={t.status} /></td><td className="px-4 py-3 tabular-nums">{fmtCount(t.users)}</td><td className="px-4 py-3 tabular-nums">{fmtCount(t.records)}</td><td className="px-4 py-3">{TIER_LABEL[t.tier]}</td><td className="px-4 py-3 text-muted">{fmtWhen(t.last_activity)}</td><td className="px-4 py-3 text-right"><TenantLink tenant={{ id: t.id, name: "View" }} /></td></tr>)}</tbody></table></DataCard>}
        <Pagination page={f.page} pageSize={25} total={data.total} onPage={(page) => patch({ page })} noun="business" />
      </section>
    </>}
  </div>;
}
