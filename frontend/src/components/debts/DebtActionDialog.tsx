"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Form";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { DebtDrawer } from "./DebtDrawer";
import { reasonError, type DebtEditInput, type DebtRecord } from "./types";

export type DebtAction = "edit" | "write-off" | "void";
const copy = {
  "edit": { title: "Edit debt", cta: "Save changes", note: "Change the due date or notes. Amounts and payments cannot be edited; record a payment or write the balance off instead." },
  "write-off": { title: "Write off balance", cta: "Write off", note: "Forgive all or part of the remaining balance. It is booked as a bad-debt expense (or other income for a supplier debt), stays in history, and the reason is audited. This cannot be undone." },
  "void": { title: "Void debt", cta: "Void debt", note: "Remove an opening balance that was entered by mistake. Only debts without payments can be voided. The reason is audited." },
} as const;

export function DebtActionDialog({ action, record, onClose, onEdit, onReason }: {
  action: DebtAction; record: DebtRecord; onClose: () => void;
  onEdit: (data: DebtEditInput) => Promise<void>; onReason: (reason: string, amount?: number) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [due, setDue] = useState(record.due_date?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);
  const outstanding = Number(record.outstanding);
  const amountNumber = amount.trim() ? Number(amount) : undefined;
  const amountInvalid = action === "write-off" && amountNumber !== undefined && !(amountNumber > 0 && amountNumber <= outstanding) ? `Enter an amount between 0 and ${outstanding}, or leave it empty to write off everything.` : null;
  const invalid = action !== "edit" && (reasonError(reason) || amountInvalid);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;
    setBusy(true); setError(null);
    try {
      if (action === "edit") await onEdit({ ...(due ? { due_date: due } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) });
      else await onReason(reason.trim(), action === "write-off" ? amountNumber : undefined);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  }
  return <DebtDrawer open onClose={() => { if (!busy) onClose(); }} title={copy[action].title} description={`${record.name} · ${record.reference}`}>
    <form onSubmit={submit} className="space-y-4 p-5" noValidate>
      <p className="text-xs leading-relaxed text-muted">{copy[action].note}</p>
      {action === "edit" ? <>
        <label className="block text-xs font-medium">Due date<Input aria-label="Due date" type="date" min={record.issue_date?.slice(0, 10)} value={due} onChange={e => setDue(e.target.value)} /></label>
        {(record.kind === "receivable" || record.is_manual) && <label className="block text-xs font-medium">Notes<Textarea aria-label="Notes" rows={3} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} /></label>}
      </> : <>{action === "write-off" && <label className="block text-xs font-medium">Amount to write off (optional)<Input aria-label="Amount to write off" type="number" min="0" step="0.01" max={outstanding} placeholder={`All ${outstanding}`} value={amount} onChange={e => setAmount(e.target.value)} /></label>}<label className="block text-xs font-medium">Reason (required)
        <Textarea aria-label="Reason" aria-invalid={touched && !!invalid} aria-describedby="reason-error" rows={3} maxLength={500} autoFocus value={reason} onChange={e => setReason(e.target.value)} />
        {touched && invalid && <span id="reason-error" role="alert" className="mt-1 block text-[11px] text-red-600">{invalid}</span>}
      </label></>}
      <FinancialError error={error} />
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}{copy[action].cta}</Button>
      </div>
    </form>
  </DebtDrawer>;
}
