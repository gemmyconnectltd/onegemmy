"use client";

import { useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { useDebtMoney } from "./DebtShared";
import { paymentError, type DebtRecord } from "./types";

export type { DebtPaymentInput } from "@/lib/debts";
import type { DebtPaymentInput } from "@/lib/debts";
export function DebtPaymentForm({ record, onRecord, onCancel, supplierMetadataSupported = false }: { record: DebtRecord; onRecord: (data: DebtPaymentInput) => Promise<void>; onCancel: () => void; supplierMetadataSupported?: boolean }) {
  const money = useDebtMoney();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submitting = useRef(false);
  const key = useRef<string | null>(null);
  const supportsMetadata = record.kind === "receivable" || supplierMetadataSupported;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const invalid = paymentError(amount, record.outstanding);
    if (invalid) { setError(new Error(invalid)); return; }
    submitting.current = true;
    setBusy(true); setError(null);
    key.current ??= crypto.randomUUID();
    try { await onRecord({ amount, payment_method: method, paid_at: `${date}T12:00:00Z`, reference_number: reference.trim(), notes: notes.trim(), client_payment_id: key.current }); }
    catch (cause) { setError(cause); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="rounded-xl border border-border bg-surface px-4 py-3"><p className="mb-2 text-sm font-semibold">{record.name}</p><p className="text-[11px] text-muted">Outstanding · {record.reference}</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(record.outstanding, record.currency)}</p></div>
    <label className="block text-xs font-medium">Payment amount ({record.currency})<Input aria-label="Payment amount" autoFocus required inputMode="decimal" placeholder="0.00" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /><button type="button" disabled={busy} onClick={() => setAmount(record.outstanding)} className="mt-1.5 text-[11px] font-semibold text-accent hover:underline">Pay full balance</button></label>
    <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium">Payment date<Input aria-label="Payment date" type="date" required min={record.issue_date?.slice(0, 10)} value={date} max={new Date().toISOString().slice(0, 10)} disabled={busy || !supportsMetadata} onChange={e => setDate(e.target.value)} /></label><label className="block text-xs font-medium">Payment method<Select aria-label="Payment method" value={method} disabled={busy} onChange={e => setMethod(e.target.value)}>{["Cash", "Mobile Money", "Bank Transfer", "Card"].map(value => <option key={value}>{value}</option>)}</Select></label></div>
    {supportsMetadata && <><label className="block text-xs font-medium">Reference (optional)<Input aria-label="Payment reference" maxLength={50} value={reference} disabled={busy} onChange={e => setReference(e.target.value)} /></label><label className="block text-xs font-medium">Notes (optional)<Textarea aria-label="Payment notes" rows={3} value={notes} maxLength={1000} disabled={busy} onChange={e => setNotes(e.target.value)} /></label></>}
    {!supportsMetadata && <p className="text-[11px] text-muted">Supplier payments use today’s date and an automatically generated reference.</p>}
    <FinancialError error={error} />
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}{busy ? "Recording…" : "Record payment"}</Button></div>
  </form>;
}
