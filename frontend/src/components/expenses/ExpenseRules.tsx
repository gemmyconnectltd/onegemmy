"use client";
import { useState } from "react";
import { useRecurringExpenses, useRunRecurringExpenses, useSaveExpenseSettings, useExpenseSettings, useToggleRecurringExpense } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { useExpenseContext } from "./ExpenseShared";

/** Expense rules in one place: the limit under which expenses approve themselves, and the recurring expenses (rent, subscriptions). */
export function ExpenseRules() {
  const { can, money } = useExpenseContext();
  const settings = useExpenseSettings(), save = useSaveExpenseSettings();
  const recurring = useRecurringExpenses(), toggle = useToggleRecurringExpense(), run = useRunRecurringExpenses();
  const [limit, setLimit] = useState<string | null>(null);
  const [note, setNote] = useState("");
  if (!can("read")) return null;
  const shown = limit ?? settings.data?.auto_approve_below ?? "";
  return <details className="rounded-xl border border-border bg-card p-4">
    <summary className="cursor-pointer text-xs font-semibold text-muted">Expense rules{settings.data?.auto_approve_below ? ` · auto-approve up to ${money(Number(settings.data.auto_approve_below))}` : ""}{recurring.data?.length ? ` · ${recurring.data.length} recurring` : ""}</summary>
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <section className="space-y-2"><h3 className="text-xs font-semibold">Small expenses approve themselves</h3>
        <p className="text-xs text-muted">Any expense at or below this amount is approved and posted when it is recorded. Leave empty to approve everything by hand.</p>
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); setNote(""); save.mutate(shown.trim() === "" ? null : shown, { onSuccess: () => { setLimit(null); setNote("Saved."); } }); }}>
          <label className="block text-xs font-medium">Limit<Input aria-label="Automatic approval limit" type="number" min="0" step="0.01" value={shown} onChange={e => setLimit(e.target.value)} disabled={!can("approve")} placeholder="No limit" /></label>
          <Button disabled={save.isPending || !can("approve")}>Save</Button>
        </form>
        {note && <p role="status" className="text-xs text-emerald-700">{note}</p>}<FinancialError error={save.error} />
      </section>
      <section className="space-y-2"><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">Recurring expenses</h3>{can("create") && <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(undefined, { onSuccess: r => setNote(r.data.created ? `${r.data.created} expense${r.data.created === 1 ? "" : "s"} created for approval.` : "Nothing is due.") })}>Create due expenses</Button>}</div>
        <p className="text-xs text-muted">Set one up with “Repeat” when you record an expense. Due ones are created as pending expenses for approval.</p>
        {!recurring.data?.length ? <p className="text-xs text-muted">No recurring expenses yet.</p> : <ul className="divide-y divide-border rounded-lg border border-border">{recurring.data.map(r => <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span className="min-w-0"><span className="block truncate font-medium">{r.title}</span><span className="text-muted">{money(Number(r.amount))} · {r.frequency} · next {r.next_date}{r.on_credit ? " · pay later" : ""}</span></span>{can("update") && <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r.id)}>{r.is_active ? "Pause" : "Resume"}</Button>}</li>)}</ul>}
        <FinancialError error={recurring.error || run.error || toggle.error} />
      </section>
    </div>
  </details>;
}
