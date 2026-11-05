"use client";
import { useDeferredValue, useRef, useState } from "react";
import Link from "next/link";

import { useCreateRecurringExpense, useExpenseCategories, useExpenseDetail, useExpenseReceipt, useSaveExpense, useSuppliers } from "@/lib/api/hooks";
import type { ExpenseRecord } from "@/lib/api/expenseWorkspace";
import { useAuth } from "@/lib/auth";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { FileDropzone, FormActions, FormErrorSummary, FormRow, FormSection, MoneyField } from "@/components/ui/FormKit";
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
  const [onCredit, setOnCredit] = useState(!!initial?.on_credit);
  const [repeat, setRepeat] = useState<"none" | "weekly" | "monthly">("none");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const createRecurring = useCreateRecurringExpense();
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
        const result = await save.mutateAsync({id: initial?.id, data: {...form, title: form.title.trim(), notes: form.notes.trim() || null, supplier_id: form.supplier_id || null, reference_number: form.reference_number.trim() || null, ...(initial ? {} : {client_reference: retryKey.current, on_credit: onCredit, allow_duplicate: allowDuplicate})}});
        id = result.data.id; setSavedId(id);
        if (!initial && repeat !== "none") {
          const next = new Date(`${form.expense_date}T00:00:00`);
          if (repeat === "weekly") next.setDate(next.getDate() + 7); else next.setMonth(next.getMonth() + 1);
          await createRecurring.mutateAsync({ title: form.title.trim(), amount: form.amount, category: form.category, frequency: repeat, next_date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`, payment_method: form.payment_method, supplier_id: form.supplier_id || null, on_credit: onCredit });
        }
      }
      if (file) await attach.mutateAsync({id, file});
      onSaved(id);
    } catch (cause) { setError(cause); }
    finally {submitting.current = false; onBusy(false); }
  }
  const failure = error == null ? null : ((error as { detail?: string })?.detail ?? (error as Error)?.message ?? "The expense could not be saved.");
  const duplicate = failure?.startsWith("Possible duplicate") && !allowDuplicate;
  const code = initial?.currency_code || currency;
  return <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
    <FormErrorSummary errors={failure} />
    {duplicate && <Button type="button" variant="outline" onClick={() => { setAllowDuplicate(true); setError(null); }}>This is a different expense. Allow it, then save again</Button>}
    {savedId && error != null && <p className="text-xs text-muted">The expense is saved. Retry Save Expense to attach the receipt; this will not create another expense.</p>}
    <div className="@container"><div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <FormSection title="Expense details" description="Record the expense now. Approval posts it to the books.">
          <Field label="Date" required><Input aria-label="Expense date" type="date" required value={form.expense_date} onChange={e => set("expense_date", e.target.value)} disabled={frozen} /></Field>
          <MoneyField aria-label="Expense amount" label={`Amount (${code})`} required currency={code} value={form.amount} onChange={value => set("amount", value)} disabled={frozen} />
          <FormRow><Field label="Description" required><Input aria-label="Expense description" required maxLength={255} value={form.title} onChange={e => set("title", e.target.value)} placeholder="What was this expense for?" disabled={frozen} /></Field></FormRow>
        </FormSection>
        <FormSection title="Classification" description="Where it shows in your reports.">
          <div><Field label="Category" required><Input aria-label="Search category" placeholder="Find category…" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} disabled={frozen} className="mb-1.5" /><Select aria-label="Expense category" required value={form.category} onChange={e => set("category", e.target.value)} disabled={frozen}><option value="">Select category</option>{form.category && !categoryQuery.data?.items.some(category => category.name === form.category) && <option>{form.category}</option>}{categoryQuery.data?.items.filter(category => category.is_active || category.name === form.category).map(category => <option key={category.id}>{category.name}</option>)}</Select></Field>{categoryQuery.isLoading && <PageLoader variant="compact" />}<FinancialError error={categoryQuery.error} /><Link href="/expenses/categories" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-accent">Manage expense categories</Link></div>
          <div>{hasPermission("vendors:read") ? <Field label="Supplier"><Input aria-label="Search supplier" placeholder="Find supplier…" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} disabled={frozen} className="mb-1.5" /><Select aria-label="Expense supplier" value={form.supplier_id} onChange={e => set("supplier_id", e.target.value)} disabled={frozen}><option value="">No supplier</option>{form.supplier_id && !suppliers.data?.items.some(supplier => supplier.id === form.supplier_id) && <option value={form.supplier_id}>Selected supplier</option>}{suppliers.data?.items.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field> : <p className="text-[11px] text-muted">Supplier selection requires supplier viewing permission.</p>}<FinancialError error={suppliers.error} /></div>
        </FormSection>
        <FormSection title="Payment" description={onCredit ? "Booked as unpaid. You choose how you pay when you record the payment." : "Approval posts the payment from the method you choose."}>
          {!initial && <FormRow><label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" className="mt-1" checked={onCredit} onChange={e => setOnCredit(e.target.checked)} disabled={frozen} /><span>Pay later<span className="block text-xs font-normal text-muted">Owed to the supplier until you record the payment.</span></span></label></FormRow>}
          {!onCredit && <Field label="Payment method"><Select aria-label="Expense payment method" value={form.payment_method} onChange={e => set("payment_method", e.target.value)} disabled={frozen}>{EXPENSE_METHODS.map(method => <option key={method}>{method}</option>)}</Select></Field>}
          <Field label="Reference number"><Input aria-label="Expense reference number" maxLength={100} value={form.reference_number} onChange={e => set("reference_number", e.target.value)} placeholder="Receipt or payment reference" disabled={frozen} /></Field>
        </FormSection>
        <FormSection title="Attachments" columns={1}>
          <FileDropzone label="Receipt or invoice" files={file ? [file] : []} existing={initial?.receipt_name ? [initial.receipt_name] : undefined} maxFiles={1} onChange={files => { setFile(files[0] ?? null); setError(null); }} disabled={busy || !can("update")} hint="PDF, PNG or JPEG, up to 5 MB. Private to authorized expense users." />
          {!can("update") && <p className="text-[11px] text-muted">Expense update permission is required to attach a receipt.</p>}
        </FormSection>
        <FormSection title="Additional settings">
          {!initial && <Field label="Repeat"><Select aria-label="Repeat this expense" value={repeat} onChange={e => setRepeat(e.target.value as "none" | "weekly" | "monthly")} disabled={frozen}><option value="none">Does not repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option></Select></Field>}
          <FormRow><Field label="Notes"><Textarea aria-label="Expense notes" rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} disabled={frozen} /></Field></FormRow>
        </FormSection>
      </div>
      <aside aria-label="Summary" className="space-y-3 rounded-xl border border-border bg-card p-4 @3xl:sticky @3xl:top-2"><h2 className="pesaa-card-title">Summary</h2>
        <dl className="space-y-2.5 text-xs">
          <div className="flex justify-between gap-3"><dt className="text-muted">Amount</dt><dd className="font-bold tabular-nums">{money(Number(form.amount) || 0, code)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Category</dt><dd className="text-right">{form.category || "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Payment</dt><dd className="text-right">{onCredit ? "Unpaid (pay later)" : form.payment_method}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Approval</dt><dd>Pending approval</dd></div>
        </dl>
        <p className="border-t border-border pt-3 text-[11px] text-muted">Recording, approving and paying are separate steps. Nothing is posted to the books until it is approved.</p>
      </aside>
    </div></div>
    <FormActions sticky onCancel={onClose} busy={busy} submitLabel="Save Expense" />
  </form>;
}
