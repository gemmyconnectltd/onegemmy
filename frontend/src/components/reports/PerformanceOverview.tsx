"use client";

import { ReportExport } from "@/components/reports/ReportExport";
import Link from "next/link";
import { DailySheet } from "@/components/reports/DailySheet";
import { OverviewGlance } from "@/components/reports/OverviewGlance";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Kpi, Section } from "@/components/reports/parts";
import { useDailyBranchReport, useDebtOverview, useFinancialOverview, useOperationsReport, usePerformance } from "@/lib/api/hooks";
import { dateRangeLabel, periodLabel } from "@/lib/period";
import type { PerformanceReport } from "@/lib/api/reports";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { useReportFilters, withFilters, type ReportFilters } from "@/lib/reportFilters";
import { cn } from "@/lib/utils";


type Money = (n: number | null | undefined) => string;

/** Calendar days a range covers (inclusive), or null when open-ended. */
const periodDays = (r: { from?: string; to?: string }) => (r.from && r.to ? Math.round((new Date(`${r.to}T00:00:00`).getTime() - new Date(`${r.from}T00:00:00`).getTime()) / 86400000) + 1 : null);


function Skeleton() {
  return <div className="space-y-4" aria-busy="true" aria-label="Loading report"><div className="h-16 animate-pulse rounded-xl bg-surface" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[96px] animate-pulse rounded-xl bg-surface" />)}</div><div className="h-72 animate-pulse rounded-xl bg-surface" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-surface" />)}</div></div>;
}

/** Business reports → Overview: everything about the business on one page, each block opening its detailed tab. */
export function PerformanceOverview() {
  const { filters, range, update } = useReportFilters();
  const { currencySymbol } = useAppConfig();
  const q = usePerformance({ from: range.from, to: range.to, branch: filters.branch, compare: filters.compare, compareFrom: filters.compareFrom, compareTo: filters.compareTo });
  const money: Money = (n) => (n === null || n === undefined ? "—" : fmtMoney(n, currencySymbol));
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="pesaa-page-title text-foreground">Business reports</h1>
          <p className="mt-0.5 text-sm text-muted">Everything in one place. Open any block for the details.</p>
        </div>
        <ReportExport tab="overview" scope={{ from: range.from, to: range.to, branch: filters.branch }} />
      </div>
      <ReportFilterBar filters={filters} update={update} range={range} />
      {q.isLoading && <Skeleton />}
      {q.isError && <p role="alert" className="rounded-xl border border-border bg-card py-10 text-center text-sm text-red-600">Couldn&apos;t load the report. <button className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></p>}
      {q.data && <Body r={q.data} filters={filters} money={money} />}
    </div>
  );
}

function Body({ r, filters, money }: { r: PerformanceReport; filters: ReportFilters; money: Money }) {
  const c = r.current, cmp = r.comparison?.has_data ? r.comparison : null, ch = cmp?.changes ?? {};
  const compareLabel = cmp?.label;
  const link = (href: string) => withFilters(href, filters);
  const period = periodLabel(filters.period);
  const scope = { from: r.from_date, to: r.to_date, branch: filters.branch };
  const ops = useOperationsReport(scope);
  const cash = useFinancialOverview(filters.branch ?? null);
  const debts = useDebtOverview(filters.branch ?? null);
  const receivable = debts.data?.totals.receivable ?? null;
  const overdue = receivable ? Number(receivable.overdue) : null;

  const attention = [
    overdue ? { tone: "error", tag: "Owed", text: `${money(overdue)} overdue`, href: "/debts/receivables" } : null,
    r.stock?.low_stock ? { tone: "warning", tag: "Stock", text: `${r.stock.low_stock} product${r.stock.low_stock === 1 ? "" : "s"} to reorder${r.stock.out_of_stock ? ` · ${r.stock.out_of_stock} out` : ""}`, href: link("/reports/stock") } : null,
    c.items_missing_cost ? { tone: "warning", tag: "Cost", text: `${c.items_missing_cost} sold item${c.items_missing_cost === 1 ? "" : "s"} without a cost price`, href: "/inventory/products" } : null,
    ...r.insights.filter((i) => i.tone === "negative" && i.href).slice(0, 2).map((i) => ({ tone: "warning", tag: "Watch", text: i.text, href: link(i.href!) })),
  ].filter(Boolean).slice(0, 4) as { tone: "error" | "warning"; tag: string; text: string; href: string }[];

  return (
    <>
      {attention.length > 0 && (
        <section aria-label="Needs attention" className="flex flex-wrap overflow-hidden rounded-xl border border-border bg-card">
          {attention.map((a) => (
            <Link key={a.tag + a.text} href={a.href} className="flex min-w-[240px] flex-1 items-center gap-2.5 border-b border-r border-border px-4 py-3 text-[13px] text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium", a.tone === "error" ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400")}>{a.tag}</span>
              <span className="min-w-0 truncate">{a.text}</span>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sales" value={money(c.sales)} href={link("/reports/sales")} percent={ch.sales?.percent} compareLabel={compareLabel} note={`${c.orders.toLocaleString()} orders`} />
        <Kpi label="Expenses" value={r.can_see_expenses ? money(c.expenses) : "—"} href={r.can_see_expenses ? link("/reports/finance") : undefined} percent={ch.expenses?.percent} inverse compareLabel={compareLabel} note={r.can_see_expenses ? undefined : "No access"} />
        <Kpi label="Net profit" value={money(c.net_profit)} href={r.can_see_expenses ? link("/reports/finance") : undefined} percent={ch.net_profit?.percent} compareLabel={compareLabel} note={c.net_profit === null ? "Needs costs and expenses" : c.gross_margin !== null ? `${c.gross_margin}% gross margin` : undefined} />
        <Kpi label="Cash available" value={cash.data ? money(Number(cash.data.cash_balance)) : "—"} href={cash.data ? "/accounting/cash-bank" : undefined} note={cash.isError ? "No access" : "Today, all accounts"} />
        <Kpi label="Owed to you" value={receivable ? money(Number(receivable.outstanding)) : money(r.receivables)} href="/debts/receivables" note={overdue ? `${money(overdue)} overdue` : "Today"} />
        <Kpi label="Customers" value={ops.data?.customers ? `${ops.data.customers.buying_customers.toLocaleString()} bought` : "—"} href={link("/reports/customers")} note={ops.data?.customers ? `${ops.data.customers.new_customers} new · ${period}` : undefined} />
      </div>

      <BranchesForPeriod range={{ from: r.from_date, to: r.to_date }} branch={filters.branch} />


      <OverviewGlance r={r} filters={filters} period={period} money={money} ops={ops} debts={debts} cash={cash} lead={
      <Section title={`Earnings · ${period}`} action={<Link href={link("/reports/finance")} className="text-[12px] font-semibold text-accent hover:underline">Details →</Link>}>
        <dl className="divide-y divide-border text-[14px]">
          <div className="flex justify-between gap-3 py-2"><dt>Sales</dt><dd className="font-semibold tabular-nums">{money(c.sales)}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-muted">VAT</dt><dd className="tabular-nums text-muted">− {money(c.tax)}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-muted">Cost of goods sold</dt><dd className="tabular-nums text-muted">{c.cost_of_goods === null ? "—" : `− ${money(c.cost_of_goods)}`}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt>Gross profit</dt><dd className="font-semibold tabular-nums">{money(c.gross_profit)}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-muted">Expenses</dt><dd className="tabular-nums text-muted">{r.can_see_expenses ? `− ${money(c.expenses)}` : "—"}</dd></div>
          <div className="flex justify-between gap-3 py-2 text-[15px]"><dt className="font-semibold">Net profit</dt><dd className="font-bold tabular-nums text-accent">{money(c.net_profit)}</dd></div>
        </dl>
        {c.returns > 0 && <p className="mt-2 text-[12px] text-muted">{money(c.returns)} refunded on returns (shown separately, not subtracted).</p>}
      </Section>
      } />

      <details className="rounded-xl border border-border bg-card px-4 py-3 text-[13px]">
        <summary className="cursor-pointer font-semibold text-foreground">How these numbers are calculated</summary>
        <ul className="mt-2 space-y-1 text-muted">{Object.entries(r.definitions).map(([k, v]) => <li key={k}>{v}</li>)}
          <li>Amounts are in your business currency ({r.currency}). Cash, money owed, stock value, low stock and the pipeline are today&apos;s position (marked &quot;Today&quot;); everything else follows the period you pick, including the branch table.</li></ul>
      </details>
    </>
  );
}

/** The owner's daily sheet for the chosen period, one line per branch: stock value at the end, sales, debt, expense, deposit, Bank and MoMo. */
function BranchesForPeriod({ range, branch }: { range: { from: string; to: string }; branch?: string }) {
  const days = periodDays(range);
  const tooLong = days === null || days > 366;
  const q = useDailyBranchReport({ from_date: range.from, to_date: range.to, branch_id: branch, by: "branch" }, 1, { enabled: !tooLong });
  if (q.isError) return null;  // no access to the daily report: the rest of the overview still shows
  return (
    <section aria-labelledby="branches-h" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="branches-h" className="pesaa-section-title text-foreground">{dateRangeLabel(range.from, range.to)} by branch</h2>
        <Link href="/reports/daily" className="text-[13px] font-semibold text-accent hover:underline">Daily report →</Link>
      </div>
      {tooLong ? <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted">Pick a period of up to one year to see each branch.</p>
        : q.isLoading || !q.data ? <div className="h-40 animate-pulse rounded-xl bg-surface" aria-busy="true" aria-label="Loading branches" />
        : <DailySheet data={q.data} stockNote={days === 1 ? "At the end of the day" : "At the end of the period"} />}
    </section>
  );
}
