"use client";

import { useState } from "react";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Kpi, Section } from "@/components/reports/parts";
import { ExportButton } from "@/components/ui/ExportButton";
import { TableScroll } from "@/components/ui/TableScroll";
import { useSalesBreakdown } from "@/lib/api/hooks";
import type { SalesDimension } from "@/lib/api/reports";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { periodLabel } from "@/lib/period";
import { useReportFilters } from "@/lib/reportFilters";
import { cn } from "@/lib/utils";

const DIMENSIONS: { key: SalesDimension; label: string; column: string }[] = [
  { key: "product", label: "Products", column: "Product" }, { key: "category", label: "Categories", column: "Category" },
  { key: "customer", label: "Customers", column: "Customer" }, { key: "branch", label: "Branches", column: "Branch" },
  { key: "employee", label: "Salespeople", column: "Salesperson" }, { key: "payment", label: "Payment methods", column: "Payment method" },
];

export function SalesProfitability() {
  const { filters, range, update } = useReportFilters();
  const { currencySymbol } = useAppConfig();
  const [dimension, setDimension] = useState<SalesDimension>("product");
  const q = useSalesBreakdown({ from: range.from, to: range.to, branch: filters.branch }, dimension);
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtMoney(n, currencySymbol));
  const d = q.data, t = d?.totals, col = DIMENSIONS.find((x) => x.key === dimension)!;
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="pesaa-page-title text-foreground">Sales &amp; profitability</h1>
        <p className="mt-0.5 text-sm text-muted">What sold, to whom, and what it earned. Choose how to group the figures below.</p>
      </div>
      <ReportFilterBar filters={{ ...filters, compare: "none" }} update={update} range={range} hideCompare />
      {q.isError && <p role="alert" className="rounded-xl border border-border bg-card py-10 text-center text-sm text-red-600">Couldn&apos;t load the report. <button className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></p>}
      {q.isLoading && <div className="h-64 animate-pulse rounded-xl bg-surface" aria-busy="true" aria-label="Loading report" />}
      {d && t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Sales" value={money(t.sales)} note={`${t.orders.toLocaleString()} orders`} />
            <Kpi label="Net sales (no VAT)" value={money(t.net_sales)} />
            <Kpi label="Gross profit" value={money(t.gross_profit)} note={t.gross_margin !== null ? `${t.gross_margin}% margin` : t.items_missing_cost ? `${t.items_missing_cost} items have no cost` : undefined} />
            <Kpi label="Discounts given" value={money(t.discount)} />
            <Kpi label="Returns refunded" value={money(t.returns)} />
            <Kpi label="Average order" value={money(t.average_order)} />
          </div>
          <Section title={`Sales by ${col.column.toLowerCase()} · ${periodLabel(filters.period)}`}
            action={<ExportButton label="Export" build={async () => ({ filename: `sales-by-${dimension}`, headers: [col.column, "Orders", "Quantity", "Sales", "Cost", "Gross profit", "Margin %"], rows: d.rows.map((r) => [r.name, r.orders, r.quantity, r.sales, r.cost, r.gross_profit, r.margin]) })} />}>
            <div role="tablist" aria-label="Group sales by" className="no-scrollbar mb-3 flex gap-1 overflow-x-auto">
              {DIMENSIONS.map((x) => <button key={x.key} role="tab" aria-selected={dimension === x.key} onClick={() => setDimension(x.key)} className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent", dimension === x.key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground")}>{x.label}</button>)}
            </div>
            {d.rows.length === 0 ? <p className="py-10 text-center text-sm text-muted">No sales in this period.</p> : (
              <TableScroll><table className="w-full min-w-[640px] text-left text-sm">
                <thead><tr className="border-b border-border text-[12px] text-muted">{[col.column, "Orders", "Qty", "Sales", "Gross profit", "Margin"].map((h, i) => <th key={h} scope="col" className={cn("px-3 py-2.5 font-semibold", i > 0 && "text-right")}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">{d.rows.map((r) => (
                  <tr key={r.name} className="hover:bg-surface/50"><td className="max-w-[260px] truncate px-3 py-2.5 font-medium text-foreground">{r.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.orders.toLocaleString()}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money(r.sales)}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(r.gross_profit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.margin !== null ? `${r.margin}%` : "—"}</td></tr>
                ))}</tbody>
              </table></TableScroll>
            )}
            <p className="mt-3 text-[11px] text-muted">{d.note} Top 50 shown. Amounts are in your business currency ({d.currency}).</p>
          </Section>
        </>
      )}
    </div>
  );
}
