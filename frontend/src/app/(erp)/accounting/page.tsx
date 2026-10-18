"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFinancialOverview } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import dynamic from "next/dynamic";
const AccountingChart = dynamic(() => import("@/components/accounting/AccountingChart"), { ssr: false, loading: () => <PageLoader variant="compact" /> });
import { AccountingLinks, BranchFilter, FinancialError, FinancialHeader, SummaryCards, useFinancialMoney } from "@/components/accounting/FinancialShared";
import { CashBalanceWarning } from "@/components/accounting/CashBalanceWarning";
import { JournalDetail } from "@/components/accounting/JournalDetail";

export default function AccountingPage() {
  const { activeBranchId } = useAuth();
  const q = useFinancialOverview(activeBranchId);
  const [journal, setJournal] = useState<string | null>(null);
  const data = q.data;
  const fmt = useFinancialMoney(data?.currency);
  const trend = data?.trend.map(row => ({ month: row.month, income: Number(row.income), expenses: Number(row.expenses), cash: Number(row.cash_change) })) ?? [];
  return <div className="space-y-5"><FinancialHeader title="Accounting Overview" description="Revenue, costs, profit and cash from posted accounting entries." actions={<Link href="/accounting/reports"><Button variant="outline">Financial reports <ArrowRight size={14} /></Button></Link>} /><div className="flex flex-wrap items-center justify-between gap-3"><AccountingLinks /><div className="w-full sm:w-52"><BranchFilter /></div></div>
    <CashBalanceWarning /><FinancialError error={q.error} />{q.isLoading || q.isFetching ? <PageLoader variant="compact" /> : data && <><p className="text-xs text-muted">Fiscal year to date: {data.from_date} – {data.to_date} · {data.currency} · Cash balance through {data.to_date}</p><SummaryCards values={{ "Total Revenue": data.revenue, "Total Expenses": data.expenses, "Net Profit": data.net_profit, "Cash Balance": data.cash_balance }} currency={data.currency} />
      <div className="grid gap-4 xl:grid-cols-2"><section className="min-w-0 rounded-xl border border-border bg-card p-4"><h2 className="text-sm font-bold">Income vs Expenses</h2><p className="mt-1 text-xs text-muted">Monthly posted revenue and all expenses, including cost of goods sold</p><div className="mt-4 h-56"><AccountingChart data={trend} currency={data.currency} /></div></section>
      <section className="min-w-0 rounded-xl border border-border bg-card p-4"><h2 className="text-sm font-bold">Cash Flow</h2><p className="mt-1 text-xs text-muted">Monthly net movement across cash, bank and mobile money accounts</p><div className="mt-4 h-56"><AccountingChart data={trend} currency={data.currency} cash /></div></section></div>
      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-bold">Recent Journal Entries</h2><Link href="/accounting/ledger" className="text-xs font-semibold text-accent hover:underline">View ledger</Link></div><TableScroll><table className="w-full min-w-[690px] text-left text-[13px]"><thead><tr className="border-b border-border bg-surface/40">{["Date", "Journal reference", "Description", "Debit", "Credit", "Status"].map(h => <th key={h} className="px-4 py-3 text-[11px] font-semibold text-muted">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.journals.map(row => <tr key={String(row.id)} className="hover:bg-surface/40"><td className="px-4 py-3">{String(row.transaction_date)}</td><td className="px-4 py-3"><button className="font-semibold text-accent hover:underline" onClick={() => setJournal(String(row.id))}>{String(row.reference)}</button></td><td className="max-w-sm px-4 py-3">{String(row.description ?? "—")}</td><td className="px-4 py-3 tabular-nums">{fmt(String(row.debit))}</td><td className="px-4 py-3 tabular-nums">{fmt(String(row.credit))}</td><td className="px-4 py-3"><span className="rounded-full bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">Posted</span></td></tr>)}{data.journals.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">No posted journals yet. Set up the chart of accounts and post authorized transactions to populate this view.</td></tr>}</tbody></table></TableScroll></section>
    </>}<JournalDetail id={journal} onClose={() => setJournal(null)} /></div>;
}
