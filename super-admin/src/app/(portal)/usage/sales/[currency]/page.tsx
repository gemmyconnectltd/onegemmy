"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { Building2, Receipt, ShoppingCart, TrendingUp } from "lucide-react";
import { useUsageSales } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Metric } from "@/components/ui/Metric";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { TrendChart, type ChartTheme } from "@/components/charts/lazyTraffic";
import { Breadcrumbs, StatusPill, TenantLink, UsageCard, UsagePeriodSelect, fmtCount, formatMoney, usePeriodParam } from "@/components/usage/UsageShared";

export default function CurrencySalesPage({ params }: { params: Promise<{ currency: string }> }) {
  const { currency } = use(params);
  if (!/^[A-Za-z]{3}$/.test(currency)) notFound();
  return <CurrencySales code={currency.toUpperCase()} />;
}

function CurrencySales({ code }: { code: string }) {
  const { period, set: setPeriod } = usePeriodParam("all");
  const [f, setF] = useState({ page: 1, q: "" });
  const query = useUsageSales(code, period, f);
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const data = query.data;
  const money = (v: number) => formatMoney(v, code, { showCode: true });
  const grouping = data?.summary.grouping ?? "month";
  const points = (data?.summary.trend ?? []).map((t) => ({ label: new Date(t.date).toLocaleDateString("en", grouping === "day" ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }), value: t.sales, previousLabel: null, previous: null }));
  const periodLabel = period === "all" ? "All time" : `Last ${period} days`;
  return <div className="space-y-5">
    <div><Breadcrumbs items={[{ label: "Platform Usage", href: "/usage" }, { label: `${code} sales` }]} />
      <PageHeader title={`${code} Sales`} subtitle={`Completed orders from businesses that trade in ${code} · ${periodLabel}. Other currencies are never added in.`} actions={<UsagePeriodSelect period={period} onChange={(p) => { setPeriod(p); setF({ page: 1, q: "" }); }} />} /></div>
    {query.isLoading ? <PageLoader variant="page" /> : query.isError || !data ? <ErrorState message={`Could not load ${code} sales.`} onRetry={() => void query.refetch()} /> : <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Completed sales" value={money(data.summary.kpis.total_sales)} icon={TrendingUp} />
        <Metric label="Transactions" value={data.summary.kpis.transactions} icon={ShoppingCart} />
        <Metric label="Average order" value={money(data.summary.kpis.average_order_value)} icon={Receipt} />
        <Metric label="Selling tenants" value={data.summary.kpis.selling_tenants} icon={Building2} />
      </div>
      <UsageCard title="Sales over time" subtitle={`${grouping === "day" ? "Daily" : "Monthly"} completed sales in ${code}`}>
        {points.length > 1 ? <div className="h-64"><TrendChart points={points} color={c.primary} name={`${code} sales`} theme={chartTheme} /></div> : <p className="py-10 text-center text-sm text-muted">{points.length ? "Only one period has sales so far, so there is no trend to draw." : "No completed sales in this period."}</p>}
      </UsageCard>
      <section className="space-y-3"><h2 className="text-sm font-bold">Top tenants by sales</h2>
        <SearchBox value={f.q} onChange={(q) => setF({ page: 1, q })} placeholder="Search businesses" />
        {!data.items.length ? <EmptyState title={f.q ? "No businesses match" : "No sales in this period"} description={f.q ? "Try a different search." : `No completed ${code} orders were recorded for ${periodLabel.toLowerCase()}.`} /> :
          <DataCard label="Top tenants by sales"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr><th scope="col" className={thClass}>#</th>{["Business", "Status", "Transactions", "Sales"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}<th scope="col" className={thClass}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">{data.items.map((t, i) => <tr key={t.id}><td className="px-4 py-3 text-muted">{(f.page - 1) * 25 + i + 1}</td><td className="px-4 py-3"><TenantLink tenant={t} /></td><td className="px-4 py-3"><StatusPill status={t.status} /></td><td className="px-4 py-3 tabular-nums">{fmtCount(t.orders)}</td><td className="px-4 py-3 font-semibold tabular-nums">{money(t.sales)}</td><td className="px-4 py-3 text-right"><TenantLink tenant={{ id: t.id, name: "View" }} /></td></tr>)}</tbody></table></DataCard>}
        <Pagination page={f.page} pageSize={25} total={data.total} onPage={(page) => setF((cur) => ({ ...cur, page }))} noun="business" />
      </section>
    </>}
  </div>;
}
