"use client";

import { useState } from "react";
import { Plus, TrendingDown, Check, X, Trash2, Upload, Search } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useExpenses, useCreateExpense, useApproveExpense, useRejectExpense, useDeleteExpense, useBulkCreateExpenses } from "@/lib/api/hooks";
import type { AccountingExpense } from "@/lib/api/accounting";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, FormFooter } from "@/components/ui/Form";
import { EmptyState, ErrorState, StatusBadge } from "@/components/hr/State";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CsvImportDrawer } from "@/components/ui/CsvImportDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { SelectWithOther } from "@/components/ui/SelectWithOther";

const CATEGORIES = ["Rent", "Utilities", "Salaries", "Inventory", "Transport", "Marketing", "Supplies", "Other"];
const FILTERS = ["All", "Pending", "Approved", "Rejected"];

const EXPENSE_CSV_HEADERS = ["title", "amount", "expenseDate", "category", "notes"];

interface ExpenseImportRow {
  title: string;
  amount: number;
  expense_date: string;
  category: string;
  notes: string | null;
}

function parseExpenseRow(raw: Record<string, string>): { data: ExpenseImportRow; errors: string[] } {
  const errors: string[] = [];
  if (!raw.title) errors.push("title required");
  if (!raw.amount || isNaN(Number(raw.amount))) errors.push("invalid amount");
  const date = raw.expensedate || "";
  if (!date || isNaN(new Date(date).getTime())) errors.push("invalid expenseDate");
  // Any category text is accepted (the backend has no fixed list) — a value
  // outside the preset dropdown options just imports as its own free-text
  // category instead of being silently collapsed into "Other".
  const category = raw.category?.trim() || "Other";
  return {
    data: {
      title: raw.title?.trim() ?? "",
      amount: Number(raw.amount),
      expense_date: date,
      category,
      notes: raw.notes?.trim() || null,
    },
    errors,
  };
}

export default function ExpensesPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    category: "Other",
    notes: "",
  });
  const [acting, setActing] = useState<string | null>(null);

  // Reset to page 1 right where a filter changes, not via an effect.
  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };
  const onFilterChange = (f: string) => { setFilter(f); setPage(1); };

  const expensesQ = useExpenses(filter === "All" ? undefined : filter, page, pageSize, debouncedSearch || undefined);
  const expenses = expensesQ.data?.items ?? [];
  const total = expensesQ.data?.total ?? 0;
  const loading = expensesQ.isLoading;
  const error = expensesQ.isError ? "Could not load expenses." : null;

  // Money totals summarise the whole filtered set, not just the current page —
  // a separate capped fetch (same pattern used on the Orders page) feeds them,
  // decoupled from the small page the table itself requests. Pending-approval
  // total always reflects every Pending expense, regardless of which status
  // tab is selected.
  const totalStatsQ = useExpenses(filter === "All" ? undefined : filter, 1, 500);
  const pendingStatsQ = useExpenses("Pending", 1, 500);
  const totalAmount = (totalStatsQ.data?.items ?? []).reduce((s, e) => s + e.amount, 0);
  const pendingTotal = (pendingStatsQ.data?.items ?? []).reduce((s, e) => s + e.amount, 0);

  const createExpense = useCreateExpense();
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const deleteExpense = useDeleteExpense();
  const bulkCreateExpenses = useBulkCreateExpenses();
  const saving = createExpense.isPending;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.title || !form.amount) return;
    setNotice(null);
    createExpense.mutate(
      {
        title: form.title,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        category: form.category,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setForm({ title: "", amount: "", expense_date: new Date().toISOString().slice(0, 10), category: "Other", notes: "" });
        },
        onError: () => setNotice("Could not add the expense."),
      },
    );
  };

  const act = (e: AccountingExpense, action: "approve" | "reject") => {
    setActing(e.id);
    const handler = action === "approve" ? approveExpense : rejectExpense;
    handler.mutate(e.id, {
      onSettled: () => setActing(null),
      onError: () => setNotice("Could not update the expense."),
    });
  };

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const bulk = useBulkSelection(expenses.map((e) => e.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const remove = (e: AccountingExpense) => {
    confirm({
      title: "Delete Expense",
      message: `Delete expense "${e.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteExpense.mutate(e.id, {
        onError: (err: unknown) => setNotice((err as { detail?: string })?.detail ?? "Could not delete the expense."),
      }),
    });
  };

  function confirmBulkDelete() {
    confirm({
      title: "Delete Expenses",
      message: `Delete ${bulk.count} selected expense${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        const results = await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteExpense.mutateAsync(id)));
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          setNotice(`${failed} expense${failed === 1 ? "" : "s"} couldn't be deleted (approved expenses can't be deleted).`);
        }
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Expenses</h1>
          <p className="text-sm text-muted mt-0.5">
            Total: <span className="font-bold text-red-500">{fmt(totalAmount)}</span>
            {pendingTotal > 0 && <span className="text-muted"> · {fmt(pendingTotal)} pending approval</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 border border-border px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg text-foreground hover:bg-surface"
          >
            <Upload size={15} /> Import
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
            style={{ backgroundColor: brandColor }}
          >
            <Plus size={15} /> Add Expense
          </button>
        </div>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "text-white" : "text-muted hover:bg-surface"}`}
              style={filter === f ? { backgroundColor: brandColor } : undefined}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 border border-border rounded-lg px-3 py-2 w-52">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search expenses..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted" />
        </div>
      </div>

      {loading ? (
        <PageLoader variant="compact" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => expensesQ.refetch()} />
      ) : expenses.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState message="No expenses here yet." />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {bulk.count > 0 && (
            <div className="p-4 border-b border-border">
              <BulkActionBar count={bulk.count} label="expense" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
            </div>
          )}
          <table className={`w-full min-w-160 transition-opacity ${expensesQ.isFetching ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 w-10">
                  <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={expenses.length === 0} />
                </th>
                <th className="p-4 font-semibold">Description</th>
                <th className="p-4 font-semibold">Category</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold text-right">Amount</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-surface/50 transition-colors">
                  <td className="p-4">
                    <input type="checkbox" checked={bulk.selected.has(e.id)} onChange={() => bulk.toggle(e.id)} className="w-4 h-4 rounded" />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <TrendingDown size={14} className="text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{e.title}</p>
                        <p className="text-xs text-muted font-mono">{e.reference}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-muted">{e.category}</td>
                  <td className="p-4 text-sm text-muted">{e.expense_date}</td>
                  <td className="p-4 text-right text-sm font-bold text-red-500">{fmt(e.amount)}</td>
                  <td className="p-4"><StatusBadge status={e.status} /></td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {e.status === "Pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => act(e, "approve")}
                            disabled={acting === e.id}
                            className="w-7 h-7 rounded-md flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-40"
                            aria-label="Approve"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => act(e, "reject")}
                            disabled={acting === e.id}
                            className="w-7 h-7 rounded-md flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40"
                            aria-label="Reject"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      {e.status !== "Approved" && (
                        <button type="button" onClick={() => remove(e)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="expenses" color={brandColor} />
        </div>
      )}

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Add Expense" description="Record a business expense">
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Title" required>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Rent Payment" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" required>
              <Input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Date" required>
              <Input type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
          </div>
          <Field label="Category">
            <SelectWithOther
              options={CATEGORIES}
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              placeholder="e.g. Bank Fees"
            />
          </Field>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </Field>
          <FormFooter submitLabel={saving ? "Saving…" : "Add Expense"} onCancel={() => setShowForm(false)} disabled={saving} />
        </form>
      </Drawer>

      <CsvImportDrawer<ExpenseImportRow>
        open={showImport}
        onClose={() => setShowImport(false)}
        onSubmit={async (items) => { await bulkCreateExpenses.mutateAsync(items); }}
        title="Import Expenses"
        itemNoun="expense"
        templateFilename="expenses_template.xlsx"
        templateHeaders={EXPENSE_CSV_HEADERS}
        templateSampleRows={[
          ["Rent Payment", "150000", "2025-01-05", "Rent", "January rent"],
          ["Internet Bill", "45000", "2025-01-10", "Utilities", ""],
        ]}
        previewColumns={[
          { key: "title", label: "Title", required: true },
          { key: "amount", label: "Amount", align: "right", required: true },
          { key: "expensedate", label: "Date", required: true },
          { key: "category", label: "Category" },
          { key: "notes", label: "Notes" },
        ]}
        parseRow={parseExpenseRow}
        color={brandColor}
      />
    </div>
  );
}
