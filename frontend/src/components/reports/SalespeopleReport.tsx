"use client";

import { useState } from "react";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Kpi, Section } from "@/components/reports/parts";
import { ExportButton } from "@/components/ui/ExportButton";
import { Select } from "@/components/ui/Form";
import { TableScroll } from "@/components/ui/TableScroll";
import { useSalesTeam, useSalespeopleReport } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { periodLabel } from "@/lib/period";
import { useReportFilters } from "@/lib/reportFilters";
import { cn } from "@/lib/utils";

const PAYMENT = [["", "Any payment status"], ["Paid", "Paid"], ["PartiallyPaid", "Partly paid"], ["Unpaid", "Unpaid"]] as const;

export function SalespeopleReport() {
  const { filters, range, update } = useReportFilters();
  const { currencySymbol } = useAppConfig();
  const [seller, setSeller] = useState("");
  const [payment, setPayment] = useState("");
  const team = useSalesTeam();
  const q = useSalespeopleReport({ from: range.from, to: range.to, branch: filters.branch }, { salesperson_id: seller || undefined, payment_status: payment || undefined });
  const money = (n: number | null | undefined) => fmtMoney(n ?? 0, currencySymbol);
  const d = q.data, t = d?.totals;
  const th = "px-3 py-2.5 font-medium";
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="pesaa-page-title text-foreground">Sales by salesperson</h1>
        <p className="mt-0.5 text-sm text-muted">Who sold what, what was collected and what is still owed. Choose a person to see the sales behind their figures.</p>
      </div>
      <ReportFilterBar filters={{ ...filters, compare: "none" }} update={update} range={range} hideCompare />
      <div className="flex flex-wrap gap-2">
        {(team.data?.length ?? 0) > 1 && <Select aria-label="Salesperson" className="w-auto" value={seller} onChange={(e) => setSeller(e.target.value)}><option value="">All salespeople</option>{team.data!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
        <Select aria-label="Payment status" className="w-auto" value={payment} onChange={(e) => setPayment(e.target.value)}>{PAYMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      </div>
      {q.isError && <p role="alert" className="rounded-xl border border-border bg-card py-10 text-center text-sm text-red-600">Couldn&apos;t load the report. <button className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></p>}
      {q.isLoading && <div className="h-64 animate-pulse rounded-xl bg-surface" aria-busy="true" aria-label="Loading report" />}
      {d && t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Sales" value={money(t.sales)} note={`${t.orders.toLocaleString()} sales`} />
            <Kpi label="Returns" value={money(t.returns)} />
            <Kpi label="Net sales" value={money(t.net_sales)} />
            <Kpi label="Collected" value={money(t.collected)} note="Money received" />
            <Kpi label="Still owed" value={money(t.outstanding)} note="Not yet paid" />
          </div>

          <Section title={`Salespeople · ${periodLabel(filters.period)}`}
            action={<ExportButton label="Export" build={async () => ({ filename: "sales-by-salesperson", headers: ["Salesperson", "Sales", "Sales value", "Returns", "Net sales", "Collected", "Still owed", "Awaiting approval"], rows: d.people.map((p) => [p.salesperson, p.orders, p.sales, p.returns, p.net_sales, p.collected, p.outstanding, p.awaiting_approval.value]) })} />}>
            {d.people.length === 0 ? <p className="py-10 text-center text-sm text-muted">No sales in this period.</p> : (
              <TableScroll mobileLayout="cards" label="Salespeople"><table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className={th}>Salesperson</th>{["Sales", "Returns", "Net sales", "Collected", "Still owed", "Awaiting approval"].map((h) => <th key={h} scope="col" className={cn(th, "text-right")}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">{d.people.map((p) => (
                  <tr key={p.salesperson_id ?? "none"} className={cn("hover:bg-surface/50", seller && seller === p.salesperson_id && "bg-accent/5")}>
                    <td className="px-3 py-2.5 font-medium"><button className="text-left text-accent hover:underline disabled:text-foreground" disabled={!p.salesperson_id} onClick={() => setSeller(seller === p.salesperson_id ? "" : p.salesperson_id!)}>{p.salesperson}</button><span className="block text-xs font-normal text-muted">{p.orders} sales</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(p.sales)}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(p.returns)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money(p.net_sales)}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(p.collected)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(p.outstanding)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.awaiting_approval.orders ? `${p.awaiting_approval.orders} · ${money(p.awaiting_approval.value)}` : "—"}</td></tr>
                ))}</tbody>
              </table></TableScroll>
            )}
          </Section>

          {d.targets.length > 0 && (
            <Section title="Targets this month">
              <ul className="divide-y divide-border">{d.targets.map((x) => (
                <li key={x.id} className="space-y-1.5 px-1 py-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.name} <span className="font-normal text-muted">· {d.people.find((p) => p.salesperson_id === x.salesperson_id)?.salesperson ?? "Salesperson"}</span></span><span className="tabular-nums">{x.unit === "currency" ? `${money(x.actual)} of ${money(x.target)}` : `${x.actual} of ${x.target}`}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.min(100, x.progress ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label={`${x.name} progress`}><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, x.progress ?? 0)}%` }} /></div>
                </li>))}</ul>
            </Section>
          )}

          <Section title={seller ? "Sales behind these figures" : "Recent sales"}
            action={<ExportButton label="Export" build={async () => ({ filename: "salesperson-sales", headers: ["Sale", "Date", "Customer", "Salesperson", "Products", "Gross", "Discount", "Total", "Returns", "Collected", "Still owed", "Approval"], rows: (d.orders ?? []).map((o) => [o.order_number, o.date.slice(0, 10), o.customer ?? "Walk-in", o.salesperson ?? "", o.items.map((i) => `${i.name} × ${i.quantity}`).join("; "), o.gross, o.discount, o.total, o.returns, o.collected, o.outstanding, o.approval_status]) })} />}>
            {(d.orders ?? []).length === 0 ? <p className="py-10 text-center text-sm text-muted">No sales match these filters.</p> : (
              <TableScroll mobileLayout="cards" label="Sales"><table className="w-full min-w-[820px] text-left text-sm">
                <thead><tr className="border-b border-border text-[12px] text-muted"><th scope="col" className={th}>Sale</th><th scope="col" className={th}>Customer</th><th scope="col" className={th}>Salesperson</th><th scope="col" className={th}>Products</th>{["Total", "Returns", "Collected", "Still owed"].map((h) => <th key={h} scope="col" className={cn(th, "text-right")}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">{d.orders!.map((o) => (
                  <tr key={o.id} className="align-top hover:bg-surface/50">
                    <td className="px-3 py-2.5 font-medium">{o.order_number}<span className="block text-xs font-normal text-muted">{o.date.slice(0, 10)}</span></td>
                    <td className="px-3 py-2.5">{o.customer ?? <span className="text-muted">Walk-in</span>}</td><td className="px-3 py-2.5">{o.salesperson ?? "—"}</td>
                    <td className="max-w-[260px] px-3 py-2.5 text-xs text-muted">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{money(o.total)}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(o.returns)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(o.collected)}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(o.outstanding)}</td></tr>
                ))}</tbody>
              </table></TableScroll>
            )}
            <p className="mt-3 text-[11px] text-muted">Up to the 200 most recent sales are listed. {d.definitions.sales} {d.definitions.collected} {d.definitions.awaiting_approval} Amounts are in {d.currency}.</p>
          </Section>
        </>
      )}
    </div>
  );
}
