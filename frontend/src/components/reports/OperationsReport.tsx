"use client";

import Link from "next/link";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Bars, Kpi, Section } from "@/components/reports/parts";
import { TableScroll } from "@/components/ui/TableScroll";
import { useOperationsReport } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useReportFilters } from "@/lib/reportFilters";

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return <TableScroll><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-border text-[12px] text-muted">{head.map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{rows.map((r, n) => <tr key={n}>{r.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? "max-w-[240px] truncate font-medium text-foreground" : "text-right tabular-nums"}`}>{c}</td>)}</tr>)}</tbody></table></TableScroll>;
}

export function OperationsReport() {
  const { filters, range, update } = useReportFilters();
  const { currencySymbol } = useAppConfig();
  const q = useOperationsReport({ from: range.from, to: range.to, branch: filters.branch });
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtMoney(n, currencySymbol));
  const d = q.data;
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="pesaa-page-title text-foreground">Operations</h1>
        <p className="mt-0.5 text-sm text-muted">Stock, purchases and customers. For what each branch did on a day, open the <Link href="/reports/daily" className="font-semibold text-accent hover:underline">daily branch activity</Link> report.</p>
      </div>
      <ReportFilterBar filters={{ ...filters, compare: "none" }} update={update} range={range} hideCompare />
      {q.isError && <p role="alert" className="rounded-xl border border-border bg-card py-10 text-center text-sm text-red-600">Couldn&apos;t load the report. <button className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></p>}
      {q.isLoading && <div className="h-64 animate-pulse rounded-xl bg-surface" aria-busy="true" aria-label="Loading report" />}
      {d && (
        <>
          {d.inventory && (
            <Section title="Inventory" action={<Link href="/inventory/products" className="text-[12px] font-semibold text-accent hover:underline">View products</Link>}>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Stock value (at cost)" value={money(d.inventory.valuation)} /><Kpi label="Active products" value={d.inventory.products.toLocaleString()} />
                <Kpi label="Low stock" value={String(d.inventory.low_stock)} /><Kpi label="Out of stock" value={String(d.inventory.out_of_stock)} />
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                <div><h3 className="mb-1 text-[13px] font-semibold text-foreground">Running low</h3><Table head={["Product", "In stock", "Minimum"]} empty="Nothing is running low." rows={d.inventory.low.map((p) => [p.name, p.stock, p.min_stock])} /></div>
                <div><h3 className="mb-1 text-[13px] font-semibold text-foreground">Fast-moving</h3><Table head={["Product", "Sold", "In stock"]} empty="No sales in this period." rows={d.inventory.fast_moving.map((p) => [p.name, p.sold, p.stock])} /></div>
                <div><h3 className="mb-1 text-[13px] font-semibold text-foreground">Slow-moving</h3><Table head={["Product", "In stock", "Value"]} empty="Everything in stock sold." rows={d.inventory.slow_moving.map((p) => [p.name, p.stock, money(p.value)])} /></div>
              </div>
              <p className="mt-3 text-[11px] text-muted">{d.inventory.note}</p>
            </Section>
          )}
          {d.purchases && (
            <Section title="Purchases" action={<Link href="/procurement/orders" className="text-[12px] font-semibold text-accent hover:underline">View purchases</Link>}>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Purchased" value={money(d.purchases.total)} note={`${d.purchases.orders.toLocaleString()} orders`} /></div>
              <div className="grid gap-5 lg:grid-cols-2">
                <div><h3 className="mb-2 text-[13px] font-semibold text-foreground">Top suppliers</h3><Bars money={money} empty="No purchases in this period." rows={d.purchases.top_suppliers.map((s) => ({ key: s.name, label: s.name, value: s.amount, sub: `${s.orders} orders` }))} /></div>
                <div><h3 className="mb-1 text-[13px] font-semibold text-foreground">By status</h3><Table head={["Status", "Orders", "Amount"]} empty="No purchases in this period." rows={d.purchases.by_status.map((s) => [s.status, s.orders, money(s.amount)])} /></div>
              </div>
            </Section>
          )}
          {d.customers && (
            <Section title="Customers" action={<Link href="/customers" className="text-[12px] font-semibold text-accent hover:underline">View customers</Link>}>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Kpi label="New customers" value={d.customers.new_customers.toLocaleString()} /><Kpi label="Customers who bought" value={d.customers.buying_customers.toLocaleString()} />
                <Kpi label="Returning" value={d.customers.returning.toLocaleString()} note="bought before this period" />
                <Kpi label="Orders per customer" value={d.customers.orders_per_customer?.toString() ?? "—"} />
                {d.customers.receivables !== null && <Kpi label="Owed to you now" value={money(d.customers.receivables)} href="/debts/receivables" />}
              </div>
              <h3 className="mb-1 text-[13px] font-semibold text-foreground">Top customers</h3>
              <Table head={["Customer", "Orders", "Sales"]} empty="No customer purchases in this period." rows={d.customers.top.map((c) => [c.name, c.orders, money(c.sales)])} />
              <p className="mt-3 text-[11px] text-muted">Walk-in sales with no customer attached are not counted here.</p>
            </Section>
          )}
          {!d.inventory && !d.purchases && !d.customers && <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted">Your role has no access to stock, purchase or customer reports.</p>}
        </>
      )}
    </div>
  );
}
