"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DebtBadge, debtDate, useDebtMoney } from "./DebtShared";
import type { DebtRecord } from "./types";

export function DebtUpcoming({ records }: { records: DebtRecord[] }) {
  const money = useDebtMoney();
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Upcoming & Overdue</h2><span className="text-[11px] text-muted">Next obligations</span></div>{records.length ? <ul className="divide-y divide-border">{records.map(record => <li key={`${record.kind}-${record.id}`}><Link href={`/debts/${record.kind === "receivable" ? "receivables" : "payables"}?record=${encodeURIComponent(record.id)}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3.5 hover:bg-surface/50 sm:grid-cols-[1.4fr_1fr_1fr_auto]"><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{record.name}</p><p className="mt-1 text-[10px] text-muted">{record.kind === "receivable" ? "Receivable" : "Payable"} · {record.reference}</p></div><div className="text-right sm:text-left"><p className="text-[12px] font-semibold tabular-nums">{money(record.outstanding, record.currency)}</p><p className="mt-1 text-[10px] text-muted">{debtDate(record.due_date)}</p></div><div className="hidden sm:block"><DebtBadge record={record} /></div><ArrowRight size={14} className="hidden text-muted sm:block" /></Link></li>)}</ul> : <p className="px-5 py-12 text-center text-sm text-muted">No upcoming or overdue obligations.</p>}</section>;
}
