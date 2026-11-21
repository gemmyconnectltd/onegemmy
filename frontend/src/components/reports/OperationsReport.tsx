"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ReportExport } from "@/components/reports/ReportExport";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Bars, Kpi, MiniTable, Section } from "@/components/reports/parts";
import { useOperationsReport } from "@/lib/api/hooks";
import type { OperationsReport as Ops } from "@/lib/api/reports";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useReportFilters } from "@/lib/reportFilters";

/** Stock, Customers and Purchases share one server report (/reports/operations); each tab shows its own part of it. */
function OpsPage({ tab, title, description, children }: { tab: "stock" | "customers" | "purchases"; title: string; description: ReactNode; children: (d: Ops, money: (n: number | null | undefined) => string) => ReactNode }) {
  const { filters, range, update } = useReportFilters();
  const { currencySymbol } = useAppConfig();
  const q = useOperationsReport({ from: range.from, to: range.to, branch: filters.branch });
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtMoney(n, currencySymbol));
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pesaa-page-title text-foreground">{title}</h1>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
        <ReportExport tab={tab} scope={{ from: range.from, to: range.to, branch: filters.branch }} />
      </div>
      <ReportFilterBar filters={{ ...filters, compare: "none" }} update={update} range={range} hideCompare />
      {q.isError && <p role="alert" className="rounded-xl border border-border bg-card py-10 text-center text-sm text-red-600">Couldn&apos;t load the report. <button className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></p>}
      {q.isLoading && <div className="h-64 animate-pulse rounded-xl bg-surface" aria-busy="true" aria-label="Loading report" />}
      {q.data && children(q.data, money)}
    </div>
  );
}

const NoAccess = ({ what }: { what: string }) => <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted">Your role has no access to {what}, or the module is switched off for this business.</p>;

export function StockReport() {
  return (
    <OpsPage tab="stock" title="Stock" description="What you have, what is running out and what is not selling. Stock figures are today's position.">
      {(d, money) => !d.inventory ? <NoAccess what="stock reports" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Stock value (at cost)" value={money(d.inventory.valuation)} href="/inventory/products" />
            <Kpi label="Active products" value={d.inventory.products.toLocaleString()} />
            <Kpi label="Low stock" value={String(d.inventory.low_stock)} note="At or below minimum" href="/inventory/products" />
            <Kpi label="Out of stock" value={String(d.inventory.out_of_stock)} href="/inventory/products" />
          </div>
          <Section title="What to reorder" action={<Link href="/procurement/orders/new" className="text-[12px] font-semibold text-accent hover:underline">Create purchase order</Link>}>
            <MiniTable label="Products to reorder" head={["Product", "In stock", "Minimum", "Short by"]} empty="Nothing is running low."
              rows={d.inventory.low.map((p) => [p.name, p.stock, p.min_stock, Math.max(0, p.min_stock - p.stock)])} />
          </Section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Selling fastest"><MiniTable label="Fast-moving products" head={["Product", "Sold", "In stock"]} empty="No sales in this period." rows={d.inventory.fast_moving.map((p) => [p.name, p.sold, p.stock])} /></Section>
            <Section title="Not selling (money on the shelf)"><MiniTable label="Slow-moving products" head={["Product", "In stock", "Value at cost"]} empty="Everything in stock sold in this period." rows={d.inventory.slow_moving.map((p) => [p.name, p.stock, money(p.value)])} /></Section>
          </div>
          <p className="text-[11px] text-muted">{d.inventory.note}</p>
        </>
      )}
    </OpsPage>
  );
}

export function CustomersReport() {
  return (
    <OpsPage tab="customers" title="Customers" description="Who buys, who comes back and who owes you. Walk-in sales without a customer are not counted here.">
      {(d, money) => !d.customers ? <NoAccess what="customer reports" /> : (() => {
        const c = d.customers;
        const returningPct = c.buying_customers ? Math.round((c.returning / c.buying_customers) * 100) : null;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi label="Customers who bought" value={c.buying_customers.toLocaleString()} href="/customers" />
              <Kpi label="New customers" value={c.new_customers.toLocaleString()} />
              <Kpi label="Returning" value={returningPct === null ? "—" : `${returningPct}%`} note={`${c.returning.toLocaleString()} bought before`} />
              <Kpi label="Orders per customer" value={c.orders_per_customer?.toString() ?? "—"} />
              {c.receivables !== null && <Kpi label="Owed to you now" value={money(c.receivables)} href="/debts/receivables" note="Today, all dates" />}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Section title="Top customers" action={<Link href="/customers" className="text-[12px] font-semibold text-accent hover:underline">All customers</Link>}>
                <MiniTable label="Top customers" head={["Customer", "Orders", "Sales"]} empty="No customer purchases in this period." rows={c.top.map((t) => [t.name, t.orders, money(t.sales)])} />
              </Section>
              <Section title="Money owed to you" action={<Link href="/debts/receivables" className="text-[12px] font-semibold text-accent hover:underline">Debts</Link>}>
                {c.receivables === null ? <p className="text-sm text-muted">No access to receivables.</p> : (
                  <div className="space-y-2 text-[13px]">
                    <p className="text-2xl font-bold tabular-nums text-foreground">{money(c.receivables)}</p>
                    <p className="text-muted">What customers owe today across the selected branches. Send statements and reminders from Debt management.</p>
                  </div>
                )}
              </Section>
            </div>
          </>
        );
      })()}
    </OpsPage>
  );
}

export function PurchasesReport() {
  return (
    <OpsPage tab="purchases" title="Purchases" description="What you bought and from whom, by purchase order status.">
      {(d, money) => !d.purchases ? <NoAccess what="purchase reports" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Purchased" value={money(d.purchases.total)} href="/procurement/orders" />
            <Kpi label="Purchase orders" value={d.purchases.orders.toLocaleString()} />
            <Kpi label="Suppliers used" value={d.purchases.top_suppliers.length.toLocaleString()} />
            <Kpi label="Still open" value={d.purchases.by_status.filter((s) => !["Received", "Completed", "Closed", "Draft"].includes(s.status)).reduce((n, s) => n + s.orders, 0).toLocaleString()} note="Ordered, not yet received" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Top suppliers" action={<Link href="/procurement/suppliers" className="text-[12px] font-semibold text-accent hover:underline">Suppliers</Link>}>
              <Bars money={money} empty="No purchases in this period." rows={d.purchases.top_suppliers.map((s) => ({ key: s.name, label: s.name, value: s.amount, sub: `${s.orders} orders` }))} />
            </Section>
            <Section title="Purchase orders by status" action={<Link href="/procurement/orders" className="text-[12px] font-semibold text-accent hover:underline">Purchase orders</Link>}>
              <MiniTable label="Purchase orders by status" head={["Status", "Orders", "Amount"]} empty="No purchases in this period." rows={d.purchases.by_status.map((s) => [s.status, s.orders, money(s.amount)])} />
            </Section>
          </div>
        </>
      )}
    </OpsPage>
  );
}
