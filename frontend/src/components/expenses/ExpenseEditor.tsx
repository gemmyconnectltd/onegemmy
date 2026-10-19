"use client";
import { useDeferredValue, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Save } from "lucide-react";
import { useExpenseCategories, useExpenseDetail, useExpenseReceipt, useSaveExpense, useSuppliers } from "@/lib/api/hooks";
import type { ExpenseRecord } from "@/lib/api/expenseWorkspace";
import { useAuth } from "@/lib/auth";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { EXPENSE_METHODS, useExpenseContext } from "./ExpenseShared";

export function ExpenseEditor({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { scope, can } = useExpenseContext();
  const detail = useExpenseDetail(id, 1, scope, can("read"));
  const [busy, setBusy] = useState(false);
  return <Drawer open title={id ? "Edit Expense" : "Record Expense"} description="Record a business expense" size="xl" onClose={() => { if (!busy) onClose(); }}>
    {!can(id ? "update" : "create") ? <p role="alert" className="p-5 text-sm text-muted">You don’t have permission to {id ? "edit" : "record"} expenses.</p> : id && detail.isLoading ? <div className="p-5"><PageLoader variant="compact" /></div> : detail.error ? <div className="p-5"><FinancialError error={detail.error} /></div> : id && detail.data?.record.status !== "Pending" ? <p role="alert" className="p-5 text-sm text-muted">Only pending expenses can be edited.</p> : <ExpenseForm key={`${scope}:${id || "new"}`} initial={detail.data?.record} onClose={onClose} onSaved={onSaved} onBusy={setBusy} />}
  </Drawer>;
}
function ExpenseForm({ initial, onClose, onSaved, onBusy }: { initial?: ExpenseRecord; onClose: () => void; onSaved: (id: string) => void; onBusy: (busy: boolean) => void }) {
  const { scope, currency, can, money } = useExpenseContext();
  const { hasPermission } = useAuth();
  const [form, setForm] = useState({title: initial?.title || "", amount: initial ? String(initial.amount) : "", expense_date: initial?.expense_date || new Date().toISOString().slice(0, 10), category: initial?.category || "", payment_method: initial?.payment_method || "Cash", supplier_id: initial?.supplier_id || "", reference_number: initial?.reference_number || "", notes: initial?.notes || ""});
  const [categorySearch, setCategorySearch] = useState("");
  const categoryQuery = useExpenseCategories(1, useDeferredValue(categorySearch), scope);
  const [supplierSearch, setSupplierSearch] = useState("");
  const suppliers = useSuppliers(1, 25, useDeferredValue(supplierSearch), {enabled: hasPermission("vendors:read")});
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const retryKey = useRef<string | null>(null), submitting = useRef(false);
  const save = useSaveExpense(), attach = useExpenseReceipt();
  const busy = save.isPending || attach.isPending;
  const frozen = busy || !!savedId;
  const set = (field: keyof typeof form, value: string) => setForm(previous => ({...previous, [field]: value}));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!form.title.trim() || !form.category.trim() || !/^\d+(\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0) {setError({detail: "Enter a description, category and positive amount with up to two decimal places."}); return;}
    if (file && (file.size > 5 * 1024 * 1024 || !["application/pdf", "image/png", "image/jpeg"].includes(file.type))) {setError({detail: "Choose a PDF, PNG or JPEG receipt up to 5 MB."}); return;}
    submitting.current = true; onBusy(true); setError(null);
    try {
      let id = savedId;
      if (!id) {
        retryKey.current ||= crypto.randomUUID();
        const result = await save.mutateAsync({id: initial?.id, data: {...form, title: form.title.trim(), notes: form.notes.trim() || null, supplier_id: form.supplier_id || null, reference_number: form.reference_number.trim() || null, ...(initial ? {} : {client_reference: retryKey.current})}});
        id = result.data.id; setSavedId(id);
      }
      if (file) await attach.mutateAsync({id, file});
      onSaved(id);
    } catch (cause) { setError(cause); }
    finally {submitting.current = false; onBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-5 p-5">
    <section className="space-y-4"><p className="text-xs text-muted">Record the expense now. Approval posts it to your selected payment account.</p>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-medium">Date<Input aria-label="Expense date" type="date" required value={form.expense_date} onChange={e => set("expense_date", e.target.value)} disabled={frozen} /></label><label className="block text-xs font-medium">Amount ({initial?.currency_code || currency})<Input aria-label="Expense amount" required inputMode="decimal" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" disabled={frozen} /></label></div>
      <label className="block text-xs font-medium">Description<Input aria-label="Expense description" required maxLength={255} value={form.title} onChange={e => set("title", e.target.value)} placeholder="What was this expense for?" disabled={frozen} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className="block text-xs font-medium">Category<Input aria-label="Search category" placeholder="Find category…" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} disabled={frozen} /><Select aria-label="Expense category" required value={form.category} onChange={e => set("category", e.target.value)} disabled={frozen}><option value="">Select category</option>{form.category && !categoryQuery.data?.items.some(category => category.name === form.category) && <option>{form.category}</option>}{categoryQuery.data?.items.filter(category => category.is_active || category.name === form.category).map(category => <option key={category.id}>{category.name}</option>)}</Select></label>{categoryQuery.isLoading && <PageLoader variant="compact" />}<FinancialError error={categoryQuery.error} /><Link href="/expenses/categories" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-accent">Manage expense categories</Link></div><label className="block text-xs font-medium">Payment method<Select aria-label="Expense payment method" value={form.payment_method} onChange={e => set("payment_method", e.target.value)} disabled={frozen}>{EXPENSE_METHODS.map(method => <option key={method}>{method}</option>)}</Select></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-medium">Reference number (optional)<Input aria-label="Expense reference number" maxLength={100} value={form.reference_number} onChange={e => set("reference_number", e.target.value)} placeholder="Receipt or payment reference" disabled={frozen} /></label><div>{hasPermission("vendors:read") ? <label className="block text-xs font-medium">Supplier (optional)<Input aria-label="Search supplier" placeholder="Find supplier…" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} disabled={frozen} /><Select aria-label="Expense supplier" value={form.supplier_id} onChange={e => set("supplier_id", e.target.value)} disabled={frozen}><option value="">No supplier</option>{form.supplier_id && !suppliers.data?.items.some(supplier => supplier.id === form.supplier_id) && <option value={form.supplier_id}>Selected supplier</option>}{suppliers.data?.items.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></label> : <p className="text-[11px] text-muted">Supplier selection requires supplier viewing permission.</p>}<FinancialError error={suppliers.error} /></div></div>
      <label className="block text-xs font-medium">Notes (optional)<Textarea aria-label="Expense notes" rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} disabled={frozen} /></label>
      <FinancialError error={error} />{savedId && error != null && <p className="text-xs text-muted">The expense is saved. Retry Save Expense to attach the receipt; this will not create another expense.</p>}

    </section>
    <aside className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"><div className="flex items-center gap-2"><FileText size={17} className="text-accent" /><h2 className="text-sm font-semibold">Receipt & summary</h2></div><label className="block text-xs font-medium">Receipt attachment (optional)<Input aria-label="Receipt attachment" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy || !can("update")} onChange={e => {setFile(e.target.files?.[0] || null); setError(null);}} /></label><p className="text-[11px] leading-relaxed text-muted">PDF, PNG or JPEG · up to 5 MB. Receipts are private to authorized expense users.</p>{!can("update") && <p className="text-[11px] text-muted">Expense update permission is required to attach a receipt.</p>}{(file || initial?.receipt_name) && <p className="break-words rounded-lg bg-surface p-3 text-xs">{file?.name || initial?.receipt_name}</p>}<dl className="space-y-3 border-t border-border pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted">Category</dt><dd>{form.category || "—"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Payment</dt><dd>{form.payment_method}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Amount</dt><dd className="font-bold tabular-nums">{money(Number(form.amount) || 0, initial?.currency_code || undefined)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd>Pending approval</dd></div></dl></aside>
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}><Save size={14} />{busy ? "Saving…" : "Save Expense"}</Button></div>
  </form>;
}
