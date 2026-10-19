"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { FinancialPagination } from "@/components/accounting/FinancialShared";
import { DebtBadge, debtDate, useDebtMoney } from "./DebtShared";
import type { DebtFilters, DebtKind, DebtRecord } from "./types";

export function DebtTable({ kind, records, total, filters, onFilters, onSelect, busy = false, failed = false }: {
  kind: DebtKind; records: DebtRecord[]; total: number; filters: DebtFilters;
  onFilters: (next: DebtFilters) => void; onSelect: (record: DebtRecord) => void; busy?: boolean; failed?: boolean;
}) {
  const money = useDebtMoney();
  const filter = (patch: Partial<DebtFilters>) => onFilters({ ...filters, ...patch, page: 1 });
  return <div className="space-y-4 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-48 basis-full flex-1 xl:basis-0"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted" /><Input aria-label={`Search ${kind}s`} placeholder={`Search ${kind === "receivable" ? "customer" : "supplier"} or reference…`} className="pl-9" value={filters.search} onChange={e => filter({ search: e.target.value })} /></div>
      <div className="w-full shrink-0 xl:w-36"><Select aria-label="Debt status" value={filters.status} onChange={e => filter({ status: e.target.value as DebtFilters["status"] })}><option value="all">All statuses</option><option value="Unpaid">Unpaid</option><option value="PartiallyPaid">Partially Paid</option><option value="Paid">Paid</option><option value="Overdue">Overdue</option></Select></div>
      <label className="min-w-0 w-[calc(50%_-_6px)] text-[11px] text-muted xl:w-40">Due from<Input aria-label="Due from" type="date" value={filters.due_from} max={filters.due_to || undefined} onChange={e => filter({ due_from: e.target.value })} /></label>
      <label className="min-w-0 w-[calc(50%_-_6px)] text-[11px] text-muted xl:w-40">Due to<Input aria-label="Due to" type="date" value={filters.due_to} min={filters.due_from || undefined} onChange={e => filter({ due_to: e.target.value })} /></label>
      {(filters.search || filters.status !== "all" || filters.due_from || filters.due_to) && <Button variant="ghost" onClick={() => onFilters({ page: 1, search: "", status: "all", due_from: "", due_to: "" })}>Clear</Button>}
    </div>
    <div className="overflow-hidden rounded-lg bg-card" aria-busy={busy}>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[12px]">
        <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted"><tr>{[kind === "receivable" ? "Customer" : "Supplier", "Reference", "Original amount", "Paid", "Outstanding", "Due date", "Status", "Actions"].map((heading, i) => <th key={heading} scope="col" className={`px-4 py-3 font-medium ${i >= 2 && i <= 4 ? "text-right" : ""}`}>{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{records.map(record => <tr key={record.id} className="hover:bg-surface/50"><td className="max-w-52 px-4 py-3.5"><button className="flex w-full items-center gap-2.5 text-left font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={() => onSelect(record)}><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] text-accent">{record.name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><span className="truncate">{record.name}</span></button></td><td className="px-4 py-3.5 text-muted">{record.reference}</td><td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{money(record.original, record.currency)}</td><td className="whitespace-nowrap px-4 py-3.5 text-right text-accent tabular-nums">{money(record.paid, record.currency)}</td><td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-amber-600 tabular-nums">{money(record.outstanding, record.currency)}</td><td className={`whitespace-nowrap px-4 py-3.5 ${record.is_overdue ? "text-red-600" : "text-muted"}`}>{debtDate(record.due_date)}</td><td className="px-4 py-3.5"><DebtBadge record={record} /></td><td className="px-4 py-3.5"><Button variant="ghost" size="sm" aria-label={`View ${record.reference}`} onClick={() => onSelect(record)}>View</Button></td></tr>)}</tbody>
      </table></div>
      {!records.length && <div className="px-5 py-14 text-center"><p className="text-sm font-semibold">{failed ? "Could not load debts" : <>No {kind}s found</>}</p><p className="mt-1 text-[12px] text-muted">{failed ? "Try again, or change your filters." : total === 0 && !filters.search && filters.status === "all" && !filters.due_from && !filters.due_to ? `Your ${kind === "receivable" ? "customer debts" : "supplier bills"} will appear here.` : "Try another search or clear your filters."}</p></div>}
    </div>
    <FinancialPagination page={filters.page} total={total} size={25} onPage={page => onFilters({ ...filters, page })} />
  </div>;
}
