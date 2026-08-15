"use client";

import { useState } from "react";
import { Plus, TrendingDown, Check, X, Trash2 } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useExpenses, useCreateExpense, useApproveExpense, useRejectExpense, useDeleteExpense } from "@/lib/api/hooks";
import type { FinanceExpense } from "@/lib/api/finance";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter } from "@/components/ui/Form";
import { EmptyState, ErrorState, StatusBadge } from "@/components/hr/State";

const CATEGORIES = ["Rent", "Utilities", "Salaries", "Inventory", "Transport", "Marketing", "Supplies", "Other"];
const FILTERS = ["All", "Pending", "Approved", "Rejected"];

export default function ExpensesPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    category: "Other",
    notes: "",
  });
  const [acting, setActing] = useState<string | null>(null);

  const expensesQ = useExpenses(filter === "All" ? undefined : filter);
  const expenses = expensesQ.data?.items ?? [];
  const loading = expensesQ.isLoading;
  const error = expensesQ.isError ? "Could not load expenses." : null;

  const createExpense = useCreateExpense();
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const deleteExpense = useDeleteExpense();
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

  const act = (e: FinanceExpense, action: "approve" | "reject") => {
    setActing(e.id);
    const handler = action === "approve" ? approveExpense : rejectExpense;
    handler.mutate(e.id, {
      onSettled: () => setActing(null),
      onError: () => setNotice("Could not update the expense."),
    });
  };

  const remove = (e: FinanceExpense) => {
    if (!window.confirm(`Delete expense “${e.title}”?`)) return;
    deleteExpense.mutate(e.id, {
      onError: () => setNotice("Could not delete the expense."),
    });
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const pendingTotal = expenses.filter((e) => e.status === "Pending").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Expenses</h1>
          <p className="text-sm text-muted mt-0.5">
            Total: <span className="font-bold text-red-500">{fmt(total)}</span>
            {pendingTotal > 0 && <span className="text-muted"> · {fmt(pendingTotal)} pending approval</span>}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 text-sm font-semibold transition-colors rounded-lg"
          style={{ backgroundColor: "#b45309" }}
        >
          <Plus size={15} /> Add Expense
        </button>
      </div>

      {notice && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "text-white" : "text-muted hover:bg-surface"}`}
            style={filter === f ? { backgroundColor: "#b45309" } : undefined}
          >
            {f}
          </button>
        ))}
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
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
                      <button type="button" onClick={() => remove(e)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </Field>
          <FormFooter submitLabel={saving ? "Saving…" : "Add Expense"} onCancel={() => setShowForm(false)} disabled={saving} />
        </form>
      </Drawer>
    </div>
  );
}
