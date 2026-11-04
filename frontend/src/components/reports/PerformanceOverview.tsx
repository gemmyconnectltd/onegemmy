"use client";

import Link from "next/link";
import { useState } from "react";
import { Info } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/charts/lazy";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Bars, Kpi, Section } from "@/components/reports/parts";
import { usePerformance } from "@/lib/api/hooks";
import type { PerformanceReport, SeriesPoint } from "@/lib/api/reports";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { fmtMoney } from "@/lib/config";
import { useReportFilters } from "@/lib/reportFilters";
import { cn } from "@/lib/utils";

type Metric = "sales" | "profit" | "expenses" | "orders";
const METRICS: { key: Metric; label: string }[] = [{ key: "sales", label: "Sales" }, { key: "profit", label: "Profit" }, { key: "expenses", label: "Expenses" }, { key: "orders", label: "Orders" }];

const dateLabel = (iso: string, grain: PerformanceReport["grain"]) => {
  const d = new Date(`${iso}T00:00:00`);
  return grain === "year" ? String(d.getFullYear()) : grain === "month" ? d.toLocaleDateString(undefined, { month: "short", year: "numeric" }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

function Skeleton() {
  return <div className="space-y-4" aria-busy="true" aria-label="Loading report"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[88px] animate-pulse rounded-xl bg-surface" />)}</div><div className="h-72 animate-pulse rounded-xl bg-surface" /><div className="grid gap-4 lg:grid-cols-2"><div className="h-48 animate-pulse rounded-xl bg-surface" /><div className="h-48 animate-pulse rounded-xl bg-surface" /></div></div>;
}

export function PerformanceOverview() {
  const { filters, range, update } = useReportFilters();
  const { theme, currencySymbol } = useAppConfig();
  const palette = chartPalette(theme === "dark");
  const [metric, setMetric] = useState<Metric>("sales");
  const q = usePerformance({ from: range.from, to: range.to, branch: filters.branch, compare: filters.compare, compareFrom: filters.compareFrom, compareTo: filters.compareTo });
  const r = q.data;
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtMoney(n, currencySymbol));
  const scoped = (href: string, from?: string, to?: string) => `${href}?from=${from ?? ""}&to=${to ?? ""}`;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="pesaa-page-title text-foreground">Business performance</h1>
        <p className="mt-0.5 text-sm text-muted">Sales, profit and growth for any period. Pick dates, compare, and open the records behind each number.</p>
      </div>
      <ReportFilterBar filters={filters} update={update} range={range} />

      {q.isLoading && <Skeleton />}
      {q.isError && <p role="alert" className="rounded-xl border border-border bg-card py-10 text-center text-sm text-red-600">Couldn&apos;t load the report. <button className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></p>}
      {r && <Body r={r} metric={metric} setMetric={setMetric} money={money} palette={palette} scoped={scoped} />}
    </div>
  );
}

function Body({ r, metric, setMetric, money, palette, scoped }: { r: PerformanceReport; metric: Metric; setMetric: (m: Metric) => void; money: (n: number | null | undefined) => string; palette: ReturnType<typeof chartPalette>; scoped: (href: string, from?: string, to?: string) => string }) {
  const c = r.current, cmp = r.comparison, ch = cmp?.changes ?? {};
  const hasSales = c.orders > 0;
  const compareLabel = cmp?.has_data ? cmp.label : undefined;
  const available = METRICS.filter((m) => m.key === "profit" ? r.series.some((p) => p.profit !== null) : m.key === "expenses" ? r.can_see_expenses : true);
  const active = available.some((m) => m.key === metric) ? metric : "sales";
  const value = (p: SeriesPoint) => (active === "sales" ? p.sales : active === "orders" ? p.orders : active === "expenses" ? p.expenses : p.profit) ?? 0;
  const data = r.series.map((p) => ({ label: dateLabel(p.date, r.grain), value: value(p) }));
  const sales = scoped("/sales/orders", r.from_date, r.to_date);
  return (
    <>
      {cmp && !cmp.has_data && <p role="status" className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2 text-[13px] text-muted"><Info size={14} aria-hidden />There are no records for {cmp.label}, so no comparison is shown.</p>}
      {cmp?.has_data && <p className="text-[12px] text-muted">Compared with <strong className="text-foreground">{cmp.label}</strong>.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sales" value={money(c.sales)} href={sales} percent={ch.sales?.percent} compareLabel={compareLabel} note={c.discount ? `${money(c.discount)} discounts` : undefined} />
        <Kpi label="Gross profit" value={money(c.gross_profit)} percent={ch.gross_profit?.percent} compareLabel={compareLabel} note={c.gross_margin !== null ? `${c.gross_margin}% margin` : c.items_missing_cost ? "Some items have no cost" : undefined} />
        <Kpi label="Expenses" value={r.can_see_expenses ? money(c.expenses) : "—"} href={r.can_see_expenses ? scoped("/expenses/list", r.from_date, r.to_date) : undefined} percent={ch.expenses?.percent} inverse compareLabel={compareLabel} note={r.can_see_expenses ? undefined : "No access"} />
        <Kpi label="Net profit" value={money(c.net_profit)} percent={ch.net_profit?.percent} compareLabel={compareLabel} note={c.net_profit === null ? "Needs costs and expenses" : undefined} />
        <Kpi label="Orders" value={c.orders.toLocaleString()} href={sales} percent={ch.orders?.percent} compareLabel={compareLabel} />
        <Kpi label="Average order" value={money(c.average_order)} percent={ch.average_order?.percent} compareLabel={compareLabel} />
      </div>

      <Section title="Business growth" action={<div role="group" aria-label="Chart measure" className="flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">{available.map((m) => <button key={m.key} type="button" aria-pressed={active === m.key} onClick={() => setMetric(m.key)} className={cn("rounded-md px-2.5 py-1 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent", active === m.key ? "bg-accent text-white" : "text-muted hover:text-foreground")}>{m.label}</button>)}</div>}>
        {!hasSales && !r.series.some((p) => (p.expenses ?? 0) > 0) ? <p className="py-16 text-center text-sm text-muted">No sales or expenses were recorded in this period.</p> : (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.tick }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: palette.tick }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v) => (active === "orders" ? Number(v).toLocaleString() : money(Number(v)))} contentStyle={palette.tooltip} />
                <Area type="monotone" dataKey="value" name={METRICS.find((m) => m.key === active)?.label} stroke={palette.primary} fill={palette.primary} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Grouped by {r.grain === "day" ? "day" : r.grain}. {r.definitions.sales}</p>
      </Section>

      {r.insights.length > 0 && (
        <Section title="What needs your attention">
          <ul className="space-y-2">{r.insights.map((i, n) => (
            <li key={n} className="flex items-start gap-2.5 text-[13px] text-foreground"><span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.tone === "positive" ? "bg-emerald-500" : i.tone === "negative" ? "bg-red-500" : "bg-muted")} />
              <span>{i.text}{i.href && <> <Link href={scoped(i.href, r.from_date, r.to_date)} className="font-semibold text-accent hover:underline">View</Link></>}</span></li>
          ))}</ul>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Top-selling products" action={<Link href={sales} className="text-[12px] font-semibold text-accent hover:underline">View sales</Link>}>
          <Bars money={money} empty="No products sold in this period." rows={r.top_products.map((p) => ({ key: p.name, label: p.name, value: p.revenue, sub: `${p.quantity.toLocaleString()} sold` }))} />
        </Section>
        <Section title="Sales by branch">
          <Bars money={money} empty="No branch sales in this period." rows={r.by_branch.map((b) => ({ key: b.id ?? "none", label: b.name, value: b.sales, sub: `${b.orders.toLocaleString()} orders` }))} />
        </Section>
        <Section title="Sales by payment method">
          <Bars money={money} empty="No sales in this period." rows={r.by_payment.map((p) => ({ key: p.method, label: p.method, value: p.sales, sub: `${p.orders.toLocaleString()} orders` }))} />
        </Section>
        <Section title="Money owed and stock">
          <dl className="space-y-3 text-[13px]">
            {r.receivables !== null && <div className="flex items-center justify-between gap-3"><dt className="text-muted">Customers owe you now</dt><dd><Link href="/debts/receivables" className="font-semibold text-accent hover:underline">{money(r.receivables)}</Link></dd></div>}
            {r.stock && <>
              <div className="flex items-center justify-between gap-3"><dt className="text-muted">Stock value (at cost)</dt><dd className="font-semibold">{money(r.stock.valuation)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-muted">Low or out of stock</dt><dd><Link href="/inventory/products" className="font-semibold text-accent hover:underline">{r.stock.low_stock} product{r.stock.low_stock === 1 ? "" : "s"}{r.stock.out_of_stock ? ` (${r.stock.out_of_stock} out)` : ""}</Link></dd></div>
            </>}
            {r.receivables === null && !r.stock && <p className="text-muted">No access to receivables or stock.</p>}
          </dl>
          <p className="mt-3 text-[11px] text-muted">These show the position today, not the selected period.</p>
        </Section>
      </div>
      <p className="text-[11px] text-muted">All amounts are in your business currency ({r.currency}), using each record&apos;s own exchange rate. {r.definitions.gross_profit}</p>
    </>
  );
}
