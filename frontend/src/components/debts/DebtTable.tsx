"use client";

import { useState } from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { FinancialPagination } from "@/components/accounting/FinancialShared";
import { DebtBadge, debtDate, useDebtMoney } from "./DebtShared";
import type { DebtFilters, DebtKind, DebtRecord } from "./types";

export interface DebtTableActions {
  canPay: boolean; canEdit: boolean; canRemind: boolean;
  selected: string[]; onSelected: (ids: string[]) => void;
  onPay: (record: DebtRecord) => void; onEdit: (record: DebtRecord) => void;
  onExport: (format: "xlsx" | "pdf", ids: string[]) => void; onRemind: (ids: string[]) => void;
  exporting?: boolean;
}
const open = (record: DebtRecord) => Number(record.outstanding) > 0;

export function DebtTable({ kind, records, total, filters, onFilters, onSelect, actions, busy = false, failed = false }: {
  kind: DebtKind; records: DebtRecord[]; total: number; filters: DebtFilters;
  onFilters: (next: DebtFilters) => void; onSelect: (record: DebtRecord) => void; actions?: DebtTableActions; busy?: boolean; failed?: boolean;
}) {
  const money = useDebtMoney();
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const filter = (patch: Partial<DebtFilters>) => onFilters({ ...filters, ...patch, page: 1 });
  const selected = actions?.selected ?? [];
  const pageIds = records.map(record => record.id);
  const allOn = pageIds.length > 0 && pageIds.every(id => selected.includes(id));
  const toggle = (id: string) => actions?.onSelected(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
  const filtered = filters.search || filters.status !== "all" || filters.due_from || filters.due_to;
  const party = kind === "receivable" ? "Customer" : "Supplier";
  const rowActions = (record: DebtRecord) => <div className="flex flex-wrap items-center gap-1">
    {actions?.canPay && open(record) && <Button size="sm" variant="secondary" aria-label={`Record payment for ${record.reference}`} onClick={() => actions.onPay(record)}>Record payment</Button>}
    <Button variant="ghost" size="sm" aria-label={`View ${record.reference}`} onClick={() => onSelect(record)}>View</Button>
    {actions?.canEdit && open(record) && <Button variant="ghost" size="sm" aria-label={`Edit ${record.reference}`} onClick={() => actions.onEdit(record)}>Edit</Button>}
  </div>;
  return <div className="space-y-4 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-48 basis-full flex-1 xl:basis-0"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted" /><Input aria-label={`Search ${kind}s`} placeholder={`Search ${party.toLowerCase()} or reference…`} className="pl-9" value={filters.search} onChange={e => filter({ search: e.target.value })} /></div>
      <div className="w-full shrink-0 xl:w-36"><Select aria-label="Debt status" value={filters.status} onChange={e => filter({ status: e.target.value as DebtFilters["status"] })}><option value="all">All statuses</option><option value="Unpaid">Unpaid</option><option value="PartiallyPaid">Partially Paid</option><option value="Paid">Paid</option><option value="Overdue">Overdue</option><option value="WrittenOff">Written off</option></Select></div>
      <label className="min-w-0 w-[calc(50%_-_6px)] text-[11px] text-muted xl:w-40">Due from<Input aria-label="Due from" type="date" value={filters.due_from} max={filters.due_to || undefined} onChange={e => filter({ due_from: e.target.value })} /></label>
      <label className="min-w-0 w-[calc(50%_-_6px)] text-[11px] text-muted xl:w-40">Due to<Input aria-label="Due to" type="date" value={filters.due_to} min={filters.due_from || undefined} onChange={e => filter({ due_to: e.target.value })} /></label>
      {filtered && <Button variant="ghost" onClick={() => onFilters({ page: 1, search: "", status: "all", due_from: "", due_to: "" })}>Clear</Button>}
      {actions && <div className="ml-auto flex items-end gap-2"><Select aria-label="Export format" className="w-24" value={format} onChange={e => setFormat(e.target.value as "xlsx" | "pdf")}><option value="xlsx">Excel</option><option value="pdf">PDF</option></Select><Button variant="secondary" disabled={actions.exporting || !total} onClick={() => actions.onExport(format, selected)}><Download size={14} />{selected.length ? `Export ${selected.length}` : "Export"}</Button></div>}
    </div>
    {actions && selected.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/20 bg-accent/5 px-4 py-2.5 text-xs"><span>{selected.length} selected</span><div className="flex gap-2">{actions.canRemind && <Button size="sm" onClick={() => actions.onRemind(selected)}>Send reminder</Button>}<Button size="sm" variant="ghost" onClick={() => actions.onSelected([])}>Clear selection</Button></div></div>}
    <div className="rounded-lg bg-card" aria-busy={busy}>
      <ul className="space-y-3 md:hidden" aria-label={`${party} debts`}>{records.map(record => <li key={record.id} className="rounded-lg border border-border p-3">
        <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2">{actions && <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-accent)]" aria-label={`Select ${record.reference}`} checked={selected.includes(record.id)} onChange={() => toggle(record.id)} />}<div className="min-w-0"><p className="truncate text-[13px] font-semibold">{record.name}</p><p className="mt-0.5 text-[11px] text-muted">{record.reference}</p></div></div><DebtBadge record={record} /></div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]"><div><dt className="text-muted">Original</dt><dd className="mt-0.5 font-medium tabular-nums">{money(record.original, record.currency)}</dd></div><div><dt className="text-muted">Paid</dt><dd className="mt-0.5 font-medium tabular-nums text-accent">{money(record.paid, record.currency)}</dd></div><div><dt className="text-muted">Outstanding</dt><dd className="mt-0.5 font-semibold tabular-nums text-amber-600">{money(record.outstanding, record.currency)}</dd></div></dl>
        <p className={`mt-2 text-[11px] ${record.is_overdue ? "text-red-600" : "text-muted"}`}>Due {debtDate(record.due_date)}</p><div className="mt-2">{rowActions(record)}</div></li>)}</ul>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] text-left text-[12px]">
        <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted"><tr>
          {actions && <th scope="col" className="w-10 px-4 py-3"><input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" aria-label="Select all on this page" checked={allOn} onChange={() => actions.onSelected(allOn ? selected.filter(id => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])])} /></th>}
          {[party, "Reference", "Original amount", "Paid", "Outstanding", "Due date", "Status", "Actions"].map((heading, i) => <th key={heading} scope="col" className={`px-4 py-3 font-medium ${i >= 2 && i <= 4 ? "text-right" : ""}`}>{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{records.map(record => <tr key={record.id} className="hover:bg-surface/50">
          {actions && <td className="px-4 py-3.5"><input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" aria-label={`Select ${record.reference}`} checked={selected.includes(record.id)} onChange={() => toggle(record.id)} /></td>}
          <td className="max-w-52 px-4 py-3.5"><button className="flex w-full items-center gap-2.5 text-left font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={() => onSelect(record)}><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] text-accent">{record.name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><span className="truncate">{record.name}</span></button></td>
          <td className="px-4 py-3.5 text-muted">{record.reference}</td><td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{money(record.original, record.currency)}</td><td className="whitespace-nowrap px-4 py-3.5 text-right text-accent tabular-nums">{money(record.paid, record.currency)}</td><td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-amber-600 tabular-nums">{money(record.outstanding, record.currency)}</td><td className={`whitespace-nowrap px-4 py-3.5 ${record.is_overdue ? "text-red-600" : "text-muted"}`}>{debtDate(record.due_date)}</td><td className="whitespace-nowrap px-4 py-3.5"><DebtBadge record={record} /></td><td className="px-4 py-3.5">{rowActions(record)}</td></tr>)}</tbody>
      </table></div>
      {!records.length && <div className="px-5 py-14 text-center"><p className="text-sm font-semibold">{failed ? "Could not load debts" : <>No {kind}s found</>}</p><p className="mt-1 text-[12px] text-muted">{failed ? "Try again, or change your filters." : total === 0 && !filtered ? `Your ${kind === "receivable" ? "customer debts" : "supplier bills"} will appear here. Use “Add ${kind === "receivable" ? "Receivable" : "Payable"}” above to record an opening balance or a credit ${kind === "receivable" ? "sale" : "purchase"}.` : "Try another search or clear your filters."}</p></div>}
    </div>
    <FinancialPagination page={filters.page} total={total} size={25} onPage={page => onFilters({ ...filters, page })} />
  </div>;
}
