"use client";
import { useDeferredValue, useEffect, useState } from "react";
import { Check, Eye, Search, Trash2, Upload, X } from "lucide-react";
import { useExpenseWorkspace, useExpenseCategories, useExpenseAction, useBulkCreateExpenses } from "@/lib/api/hooks";
import type { ExpenseFilters } from "@/lib/api/expenseWorkspace";
import { Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { StatusBadge } from "@/components/hr/State";
import { FinancialError, FinancialPagination } from "@/components/accounting/FinancialShared";
import { CashBalanceWarning } from "@/components/accounting/CashBalanceWarning";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CsvImportDrawer } from "@/components/ui/CsvImportDrawer";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { EXPENSE_METHODS, ExpenseDenied, ExpenseHeader, useExpenseContext } from "./ExpenseShared";
import { useRouter } from "next/navigation";
import { ExpenseEditor } from "./ExpenseEditor";
import { ExpenseDetails } from "./ExpenseDetails";
interface ImportExpense { title: string; amount: number; expense_date: string; category: string; notes: string | null; }
function parseImport(raw: Record<string, string>) {
  const errors: string[] = [];
  if (!raw.title?.trim()) errors.push("Description required");
  if (!(Number(raw.amount) > 0)) errors.push("Amount must be positive");
  if (!raw.expensedate || Number.isNaN(Date.parse(raw.expensedate))) errors.push("Valid expenseDate required");
  return { data: { title: raw.title, amount: Number(raw.amount), expense_date: raw.expensedate, category: raw.category || "Other", notes: raw.notes || null }, errors };
}
export function ExpenseList() { const { scope } = useExpenseContext(); return <List key={scope} />; }
function List() {
  const { scope, can, money } = useExpenseContext();
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const deferred = useDeferredValue(filters);
  const [page, setPage] = useState(1);
  const query = useExpenseWorkspace(deferred, page, scope, can("read"));
  const categories = useExpenseCategories(1, deferred.category || "", scope, can("read"));
  const router = useRouter();
  const [editor, setEditor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const action = useExpenseAction();
  const importExpenses = useBulkCreateExpenses();
  const { confirm, dialog } = useConfirmDialog();
  const records = query.data?.items ?? [];
  const bulk = useBulkSelection(records.filter(record => record.status !== "Approved").map(record => record.id));
  const filter = (patch: ExpenseFilters) => { setFilters(previous => ({...previous, ...patch})); setPage(1); };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("record"), edit = params.get("edit");
    queueMicrotask(() => {
      if (edit && /^[0-9a-f-]{36}$/i.test(edit)) setEditor(edit);
      else if (params.get("create") === "1") setEditor("new");
      else if (id && /^[0-9a-f-]{36}$/i.test(id)) setSelected(id);
    });
  }, []);
  function act(id: string, operation: string) {
    const perform = () => { setError(null); action.mutate({ id, action: operation }, { onSuccess: () => { if (operation === "delete") setSelected(null); }, onError: setError }); };
    if (operation === "delete" || operation === "approve") confirm({ title: operation === "delete" ? "Delete expense?" : "Approve expense?", message: operation === "delete" ? "This removes the unapproved expense. This cannot be undone." : "This posts the expense and pays it from its recorded payment account. Review the amount, receipt and available balance first.", confirmLabel: operation === "delete" ? "Delete" : "Approve Expense", danger: operation === "delete", onConfirm: perform });
    else perform();
  }
  return <div className="space-y-5">{dialog}<ExpenseHeader title="Expenses" description="Record, review and approve business expenses." record onRecord={() => {setSelected(null); setEditor("new");}} />
    {can("update") && <CashBalanceWarning />}
    <FinancialError error={error} />
    {!can("read") ? <ExpenseDenied /> : <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
        <label className="relative min-w-44 flex-1"><span className="sr-only">Search expenses</span><Search size={14} className="absolute left-3 top-3 text-muted" /><Input aria-label="Search expenses" className="pl-8" value={filters.search || ""} onChange={e => filter({search: e.target.value})} placeholder="Description or reference…" /></label>
        <label className="w-40 text-[11px] text-muted">Category<Input aria-label="Category filter" list="expense-category-options" placeholder="All categories" value={filters.category || ""} onChange={e => filter({category: e.target.value})} /><datalist id="expense-category-options">{categories.data?.items.map(category => <option key={category.id} value={category.name} />)}</datalist></label>
        <label className="w-36 text-[11px] text-muted">Payment method<Select aria-label="Payment method filter" value={filters.payment_method || ""} onChange={e => filter({payment_method: e.target.value})}><option value="">All methods</option>{EXPENSE_METHODS.map(method => <option key={method}>{method}</option>)}</Select></label>
        <label className="w-32 text-[11px] text-muted">Status<Select aria-label="Status filter" value={filters.status || ""} onChange={e => filter({status: e.target.value})}><option value="">All statuses</option>{["Pending", "Approved", "Rejected"].map(status => <option key={status}>{status}</option>)}</Select></label>
        <label className="w-36 text-[11px] text-muted">From<Input aria-label="Expense date from" type="date" value={filters.from_date || ""} max={filters.to_date || undefined} onChange={e => filter({from_date: e.target.value})} /></label>
        <label className="w-36 text-[11px] text-muted">To<Input aria-label="Expense date to" type="date" value={filters.to_date || ""} min={filters.from_date || undefined} onChange={e => filter({to_date: e.target.value})} /></label>
        {Object.values(filters).some(Boolean) && <Button variant="ghost" onClick={() => { setFilters({}); setPage(1); }}>Clear</Button>}
        {can("create") && <Button variant="outline" onClick={() => setImporting(true)}><Upload size={14} />Import</Button>}
      </div>
      {bulk.count > 0 && <div className="p-3"><BulkActionBar count={bulk.count} label="expense" onClear={bulk.clear} deleting={action.isPending} onDelete={() => confirm({title: "Delete selected expenses?", message: "Only unapproved expenses will be removed. This cannot be undone.", danger: true, confirmLabel: "Delete", onConfirm: async () => { setError(null); const results = await Promise.allSettled([...bulk.selected].map(id => action.mutateAsync({id, action: "delete"}))); if (results.some(result => result.status === "rejected")) setError({detail: "Some expenses could not be deleted. Refresh and review their status."}); bulk.clear(); }})} /></div>}
      {query.isLoading ? <PageLoader variant="compact" /> : query.error ? <div className="p-4"><FinancialError error={query.error} /><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div> : <>
      <TableScroll><table className="w-full min-w-[850px] text-left text-xs" aria-busy={query.isFetching}><thead className="border-b border-border bg-surface/60 text-[10px] uppercase tracking-wide text-muted"><tr>{can("delete") && <th className="px-3 py-3"><input aria-label="Select unapproved expenses" type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} /></th>}{["Description", "Category", "Date", "Payment", "Amount", "Status", "Actions"].map(label => <th key={label} className={`px-3 py-3 font-semibold ${label === "Amount" ? "text-right" : ""}`}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{records.map(record => <tr key={record.id} className="hover:bg-surface/50">{can("delete") && <td className="px-3 py-3"><input aria-label={`Select ${record.reference}`} type="checkbox" disabled={record.status === "Approved"} checked={bulk.selected.has(record.id)} onChange={() => bulk.toggle(record.id)} /></td>}<td className="max-w-56 px-3 py-3"><button onClick={() => setSelected(record.id)} className="block max-w-full truncate text-left font-semibold hover:text-accent">{record.title}</button><span className="mt-1 block text-[10px] text-muted">{record.reference}</span></td><td className="px-3 py-3 text-muted">{record.category}</td><td className="whitespace-nowrap px-3 py-3 text-muted">{record.expense_date}</td><td className="px-3 py-3 text-muted">{record.payment_method}</td><td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{money(record.amount, record.currency_code || undefined)}</td><td className="px-3 py-3"><StatusBadge status={record.status} /></td><td className="px-3 py-3"><div className="flex items-center gap-1"><Button size="sm" variant="ghost" aria-label={`View ${record.reference}`} onClick={() => setSelected(record.id)}><Eye size={14} /></Button>{record.status === "Pending" && can("update") && <><Button size="sm" variant="ghost" aria-label={`Approve ${record.reference}`} disabled={action.isPending} onClick={() => act(record.id, "approve")}><Check size={14} /></Button><Button size="sm" variant="ghost" aria-label={`Reject ${record.reference}`} disabled={action.isPending} onClick={() => act(record.id, "reject")}><X size={14} /></Button></>}{record.status !== "Approved" && can("delete") && <Button size="sm" variant="ghost" aria-label={`Delete ${record.reference}`} disabled={action.isPending} onClick={() => act(record.id, "delete")}><Trash2 size={14} /></Button>}</div></td></tr>)}</tbody></table></TableScroll>
      {!records.length && <div className="p-10 text-center"><p className="text-sm font-semibold">No expenses found</p><p className="mt-1 text-xs text-muted">Record an expense or adjust your filters.</p></div>}
      <div className="px-4 pb-2"><FinancialPagination page={page} total={query.data?.total || 0} size={25} onPage={setPage} /></div></>}
    </section>}
    {editor && <ExpenseEditor key={editor} id={editor === "new" ? null : editor} onClose={() => {setEditor(null); router.replace("/expenses/list", {scroll: false});}} onSaved={id => {setEditor(null); setSelected(id); router.replace(`/expenses/list?record=${id}`, {scroll: false});}} />}
    {selected && <ExpenseDetails key={selected} id={selected} onEdit={() => {setEditor(selected); setSelected(null);}} onClose={() => setSelected(null)} onAction={act} busy={action.isPending} />}
    <CsvImportDrawer<ImportExpense> open={importing} onClose={() => setImporting(false)} onSubmit={async items => { const result = await importExpenses.mutateAsync(items); if (result.data.failed) throw new Error(`${result.data.failed} rows could not be imported. ${result.data.errors.join("; ")}`); }} title="Import Expenses" itemNoun="expense" templateFilename="expenses_template.xlsx" templateHeaders={["title", "amount", "expenseDate", "category", "notes"]} templateSampleRows={[["Rent", "150000", "2026-10-01", "Rent", "Monthly rent"]]} previewColumns={[{key: "title", label: "Description", required: true}, {key: "amount", label: "Amount", required: true}, {key: "expensedate", label: "Date", required: true}, {key: "category", label: "Category"}, {key: "notes", label: "Notes"}]} parseRow={parseImport} />
  </div>;
}
