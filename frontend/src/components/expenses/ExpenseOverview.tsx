"use client";
import { useState } from "react";
import Link from "next/link";
import { Receipt, Wallet } from "lucide-react";
import { useExpenseOverview } from "@/lib/api/hooks";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { StatusBadge } from "@/components/hr/State";
import { ExpenseDenied, ExpenseHeader, useExpenseContext } from "./ExpenseShared";
export function ExpenseOverview() {
  const { scope } = useExpenseContext();
  return <Overview key={scope} />;
}
function Overview() {
  const { can, scope, money } = useExpenseContext();
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 7) + "-01");
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const query = useExpenseOverview({ from_date: from, to_date: to }, scope, can("read"));
  const summary = query.data?.summary;
  return <div className="space-y-5"><ExpenseHeader title="Overview" description="Business expenses for your selected period." />
    <div className="flex flex-wrap gap-3"><label className="text-xs text-muted">From<Input aria-label="Period from" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs text-muted">To<Input aria-label="Period to" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label></div>
    {!can("read") ? <ExpenseDenied /> : query.isLoading ? <PageLoader variant="compact" /> : query.error ? <FinancialError error={query.error} /> : summary && <>
      <div className="grid gap-3 sm:grid-cols-2">{[{ label: "Total expenses", value: money(summary.total, query.data?.currency), icon: Wallet }, {label: "Expense transactions", value: summary.count, icon: Receipt}].map(item => <div key={item.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><span className="rounded-lg bg-accent/10 p-2.5 text-accent"><item.icon size={21} /></span><div><p className="text-[11px] text-muted">{item.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{item.value}</p></div></div>)}</div>
      <p className="text-[11px] text-muted">Includes pending and approved expenses. Rejected expenses are excluded from totals.</p>
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.4fr]"><section className="rounded-xl border border-border bg-card p-4"><h2 className="mb-4 text-sm font-semibold">Expenses by category</h2>{!summary.categories.length && <p className="py-8 text-center text-xs text-muted">No expenses in this period.</p>}<div className="space-y-4">{summary.categories.map(category => <div key={category.name}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span>{category.name}</span><span className="font-semibold tabular-nums">{money(category.amount, query.data?.currency)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-accent" style={{width: `${Number(summary.total) ? Number(category.amount) / Number(summary.total) * 100 : 0}%`}} /></div></div>)}{Number(summary.other_amount) > 0 && <p className="text-xs text-muted">Other categories: {money(summary.other_amount, query.data?.currency)}</p>}</div></section>
      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-4"><h2 className="text-sm font-semibold">Recent expenses</h2><Link href="/expenses/list" className="text-xs font-semibold text-accent">View all</Link></div><ul className="divide-y divide-border">{query.data?.items.map(expense => <li key={expense.id}><Link href={`/expenses/list?record=${expense.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface"><div className="min-w-0"><p className="truncate text-xs font-semibold">{expense.title}</p><p className="mt-1 text-[11px] text-muted">{expense.category} · {expense.expense_date}</p></div><div className="shrink-0 space-y-1 text-right"><p className="text-xs font-semibold tabular-nums">{money(expense.amount, expense.currency_code || undefined)}</p><StatusBadge status={expense.status} /></div></Link></li>)}</ul>{!query.data?.items.length && <p className="p-10 text-center text-xs text-muted">No recent expenses.</p>}</section></div>
    </>}
  </div>;
}
