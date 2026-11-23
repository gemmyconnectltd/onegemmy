"use client";

import type { ReactNode } from "react";
import { Bars, DetailsLink, Row } from "@/components/reports/parts";
import { useFinancialBreakdown, useSalesBreakdown, type useDebtOverview, type useFinancialOverview, type useOperationsReport } from "@/lib/api/hooks";
import type { PerformanceReport } from "@/lib/api/reports";
import { AGING_BUCKETS, type DebtSummaryTotals } from "@/lib/debts";
import { withFilters, type ReportFilters } from "@/lib/reportFilters";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/LoadState";

type Money = (n: number | null | undefined) => string;
type Ops = ReturnType<typeof useOperationsReport>;
type Debts = ReturnType<typeof useDebtOverview>;
type Cash = ReturnType<typeof useFinancialOverview>;

function Block({ title, sub, href, children, className }: { title: string; sub?: string; href?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card", className)} aria-label={title}>
      <header className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0"><h3 className="pesaa-card-title truncate text-foreground">{title}</h3>{sub && <p className="text-[12px] text-muted">{sub}</p>}</div>
        {href && <DetailsLink href={href} />}
      </header>
      <div className="flex-1 px-4 pb-4 pt-3">{children}</div>
    </section>
  );
}

const Loading = () => <Skeleton className="h-28" label="Loading section" />;
const Unavailable = ({ text = "Not available for your role." }: { text?: string }) => <p className="py-4 text-center text-[13px] text-muted">{text}</p>;
const Big = ({ children }: { children: ReactNode }) => <p className="text-[22px] font-bold tabular-nums text-foreground">{children}</p>;

const AGING_COLORS = ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-600"];
function Aging({ totals, money }: { totals: DebtSummaryTotals; money: Money }) {
  const values = AGING_BUCKETS.map((b) => Number(totals.aging[b] ?? 0));
  const sum = values.reduce((a, b) => a + b, 0);
  return (
    <div className="mt-2 space-y-2">
      {sum > 0 && <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={AGING_BUCKETS.map((b, i) => `${b} days ${money(values[i])}`).join(", ")}>{values.map((v, i) => v > 0 && <span key={i} className={AGING_COLORS[i]} style={{ flex: v }} />)}</div>}
      {AGING_BUCKETS.map((b, i) => <Row key={b} label={`${b} days`} value={money(values[i])} tone={i === 3 && values[i] > 0 ? "error" : undefined} />)}
    </div>
  );
}

/**
 * Overview "Everything at a glance": one block per area of the business, each linking to the tab with the details.
 * Every block reads the same server reports as its tab (same period and branch), so the numbers always agree.
 */
export function OverviewGlance({ r, filters, period, money, ops, debts, cash, lead }: { r: PerformanceReport; filters: ReportFilters; period: string; money: Money; ops: Ops; debts: Debts; cash: Cash; lead?: ReactNode }) {
  const scope = { from: r.from_date, to: r.to_date, branch: filters.branch };
  const categories = useSalesBreakdown(scope, "category");
  const finance = useFinancialBreakdown(scope, { enabled: r.can_see_expenses });
  const link = (href: string) => withFilters(href, filters);
  const receivable = debts.data?.totals.receivable ?? null;
  const payable = debts.data?.totals.payable ?? null;
  const month = cash.data?.trend.at(-1);
  const inv = ops.data?.inventory ?? null;

  return (
    <>
      <h2 className="pesaa-section-title pt-1 text-foreground">Everything at a glance</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lead}
        <Block title="Sales by category" sub={`${period} · revenue`} href={link("/reports/sales")}>
          {categories.isLoading ? <Loading /> : categories.isError ? <Unavailable /> :
            <Bars money={money} empty="No sales in this period." rows={(categories.data?.rows ?? []).slice(0, 5).map((c) => ({ key: c.name, label: c.name, value: c.sales, sub: c.margin !== null ? `${c.margin}% margin` : undefined }))} />}
        </Block>

        <Block title="Expenses by category" sub={finance.data?.pending_expenses ? `${finance.data.pending_expenses} waiting for approval` : `${period} · approved`} href={r.can_see_expenses ? link("/reports/finance") : undefined}>
          {!r.can_see_expenses ? <Unavailable /> : finance.isLoading ? <Loading /> : finance.isError ? <Unavailable /> :
            <Bars money={money} empty="No approved expenses in this period." rows={(finance.data?.by_category ?? []).slice(0, 5).map((c) => ({ key: c.name, label: c.name, value: c.amount, sub: `${c.share}% of expenses` }))} />}
        </Block>

        <Block title="Stock value" sub="Today · at cost" href={link("/reports/stock")}>
          {ops.isLoading ? <Loading /> : !inv ? <Unavailable /> : (
            <div>
              <Big>{money(inv.valuation)}</Big>
              <p className="mb-2 text-[12px] text-muted">{inv.products.toLocaleString()} active products</p>
              <Row label="Low stock" value={inv.low_stock} tone={inv.low_stock ? "warning" : undefined} />
              <Row label="Out of stock" value={inv.out_of_stock} tone={inv.out_of_stock ? "error" : undefined} />
              <Row label={`Not sold · ${period}`} value={inv.slow_moving.length >= 10 ? "10+ products" : `${inv.slow_moving.length} products`} />
            </div>
          )}
        </Block>

        <Block title="Cash" sub="Today · all cash and bank accounts" href={cash.data ? "/accounting/cash-bank" : undefined}>
          {cash.isLoading ? <Loading /> : !cash.data ? <Unavailable /> : (
            <div>
              <Big>{money(Number(cash.data.cash_balance))}</Big>
              {month && <>
                <p className="mb-2 text-[12px] text-muted">This month</p>
                <Row label="Money in" value={money(Number(month.income))} />
                <Row label="Money out" value={money(Number(month.expenses))} />
                <Row label="Change in cash" value={money(Number(month.cash_change))} tone={Number(month.cash_change) < 0 ? "error" : undefined} />
              </>}
            </div>
          )}
        </Block>

        <Block title="Money customers owe" sub="Today · by how long it's been unpaid" href="/debts/receivables">
          {debts.isLoading ? <Loading /> : !receivable ? <Unavailable /> : (
            <div><Big>{money(Number(receivable.outstanding))}</Big><p className="text-[12px] text-muted">{money(Number(receivable.overdue))} overdue</p><Aging totals={receivable} money={money} /></div>
          )}
        </Block>

        <Block title="You owe suppliers" sub="Today · unpaid bills" href="/debts/payables">
          {debts.isLoading ? <Loading /> : !payable ? <Unavailable /> : (
            <div><Big>{money(Number(payable.outstanding))}</Big><p className="text-[12px] text-muted">{money(Number(payable.overdue))} overdue</p><Aging totals={payable} money={money} /></div>
          )}
        </Block>

        <Block title="Customers" sub={period} href={link("/reports/customers")}>
          {ops.isLoading ? <Loading /> : !ops.data?.customers ? <Unavailable /> : (() => {
            const c = ops.data.customers;
            return (
              <div>
                <dl className="mb-2 grid grid-cols-3 gap-2">
                  <div><dt className="text-[12px] text-muted">Bought</dt><dd className="text-xl font-bold tabular-nums">{c.buying_customers}</dd></div>
                  <div><dt className="text-[12px] text-muted">New</dt><dd className="text-xl font-bold tabular-nums">{c.new_customers}</dd></div>
                  <div><dt className="text-[12px] text-muted">Returning</dt><dd className="text-xl font-bold tabular-nums">{c.buying_customers ? `${Math.round((c.returning / c.buying_customers) * 100)}%` : "—"}</dd></div>
                </dl>
                {c.top.slice(0, 3).map((t) => <Row key={t.name} label={t.name} value={money(t.sales)} />)}
              </div>
            );
          })()}
        </Block>

        <Block title="Pipeline by stage" sub="Today · CRM deals, all branches" href={r.pipeline ? "/sales/deals" : undefined}>
          {!r.pipeline ? <Unavailable /> : r.pipeline.length === 0 ? <Unavailable text="No deals in the pipeline yet." /> :
            r.pipeline.map((p) => <Row key={p.stage} label={`${p.stage} · ${p.deals} deal${p.deals === 1 ? "" : "s"}`} value={money(p.value)} />)}
        </Block>

      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Block title="Top products" sub={period} href={link("/reports/sales")}>
          <Bars money={money} empty="No products sold in this period." rows={r.top_products.map((p) => ({ key: p.name, label: p.name, value: p.revenue, sub: `${p.quantity.toLocaleString()} sold` }))} />
        </Block>
        <Block title="Low stock" sub={inv ? `Today · ${inv.low_stock} to reorder` : "Today"} href={link("/reports/stock")}>
          {ops.isLoading ? <Loading /> : !inv ? <Unavailable /> : inv.low.length === 0 ? <Unavailable text="Nothing is running low." /> :
            inv.low.slice(0, 6).map((p) => <Row key={p.name} label={p.name} value={p.stock <= 0 ? "Out" : `${p.stock} left`} tone={p.stock <= 0 ? "error" : "warning"} />)}
        </Block>
      </div>
    </>
  );
}
