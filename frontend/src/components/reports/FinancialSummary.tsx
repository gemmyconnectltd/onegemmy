"use client";

import Link from "next/link";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Bars, Kpi, Section } from "@/components/reports/parts";
import { TableScroll } from "@/components/ui/TableScroll";
import { useFinancialBreakdown } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useReportFilters } from "@/lib/reportFilters";

const FORMAL = [
  { href: "/accounting/reports", title: "Profit & loss, balance sheet, cash flow", text: "Formal statements from posted accounting entries." },
  { href: "/accounting/receivables", title: "Accounts receivable", text: "Who owes you, with ageing." },
  { href: "/accounting/payables", title: "Accounts payable", text: "What you owe suppliers." },
  { href: "/accounting/tax", title: "Tax summary", text: "VAT collected and paid." },
];

export function FinancialSummary() {
  const { filters, range, update } = useReportFilters();
  const { currencySymbol } = useAppConfig();
  const q = useFinancialBreakdown({ from: range.from, to: range.to, branch: filters.branch });
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtMoney(n, currencySymbol));
  const d = q.data;
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="pesaa-page-title text-foreground">Financial reports</h1>
        <p className="mt-0.5 text-sm text-muted">Where the money went in the period, and where to find the formal statements.</p>
      </div>
      <ReportFilterBar filters={{ ...filters, compare: "none" }} update={update} range={range} hideCompare />
      {q.isError && <p role="alert" className="rounded-xl border border-border bg-card py-8 text-center text-sm text-muted">Expense reports aren&apos;t available for your role or this business.</p>}
      {q.isLoading && <div className="h-64 animate-pulse rounded-xl bg-surface" aria-busy="true" aria-label="Loading report" />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Approved expenses" value={money(d.expenses_total)} href={`/expenses/list?from=${d.from_date}&to=${d.to_date}`} />
            <Kpi label="Waiting for approval" value={String(d.pending_expenses)} note="not counted above" />
            <Kpi label="Net profit" value={money(d.metrics.net_profit)} note={d.metrics.net_profit === null ? "Needs costs on sold items" : undefined} />
            {d.receivables !== null && <Kpi label="Owed to you now" value={money(d.receivables)} href="/debts/receivables" />}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Expenses by category"><Bars money={money} empty="No approved expenses in this period." rows={d.by_category.map((c) => ({ key: c.name, label: c.name, value: c.amount, sub: `${c.share}% of expenses · ${c.count} records` }))} /></Section>
            <Section title="Expenses by branch"><Bars money={money} empty="No approved expenses in this period." rows={d.by_branch.map((b) => ({ key: b.name, label: b.name, value: b.amount }))} /></Section>
          </div>
          <Section title="Largest expenses">
            {d.largest.length === 0 ? <p className="py-6 text-center text-sm text-muted">No approved expenses in this period.</p> : (
              <TableScroll><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-border text-[12px] text-muted"><th className="px-3 py-2 font-semibold">Expense</th><th className="px-3 py-2 font-semibold">Category</th><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 text-right font-semibold">Amount</th></tr></thead>
                <tbody className="divide-y divide-border">{d.largest.map((e, i) => <tr key={i}><td className="max-w-[240px] truncate px-3 py-2 font-medium text-foreground">{e.title}</td><td className="px-3 py-2 text-muted">{e.category}</td><td className="px-3 py-2 text-muted">{e.date}</td><td className="px-3 py-2 text-right tabular-nums">{money(e.amount)}</td></tr>)}</tbody></table></TableScroll>
            )}
          </Section>
        </>
      )}
      <Section title="Formal accounting reports">
        <ul className="grid gap-3 sm:grid-cols-2">{FORMAL.map((f) => <li key={f.href}><Link href={f.href} className="block rounded-lg border border-border p-3 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"><span className="block text-sm font-semibold text-foreground">{f.title}</span><span className="mt-0.5 block text-[12px] text-muted">{f.text}</span></Link></li>)}</ul>
        <p className="mt-3 text-[11px] text-muted">The figures above are operational. Formal statements follow posted entries and accounting periods, so they can differ.</p>
      </Section>
    </div>
  );
}
