"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { useRecordOrderPayment } from "@/lib/api/hooks";
import type { ApiOrder } from "@/lib/api";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

interface Props {
  order: ApiOrder | null;
  onClose: () => void;
  color: string;
  fmt: (v: number) => string;
}

export function RecordPaymentDrawer({ order, onClose, color, fmt }: Props) {
  const recordPayment = useRecordOrderPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clientPaymentId] = useState(() => `pay-${crypto.randomUUID()}`);

  function reset() {
    setAmount(""); setMethod("cash"); setReference(""); setNotes(""); setError(null);
    setPaidAt(new Date().toISOString().slice(0, 10));
  }

  function close() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!order) return;
    setError(null);
    try {
      await recordPayment.mutateAsync({
        orderId: order.id,
        data: {
          amount: Number(amount),
          payment_method: method,
          reference_number: reference || null,
          notes: notes || null,
          paid_at: `${paidAt}T00:00:00`,
          client_payment_id: clientPaymentId,
        },
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment.");
    }
  }

  if (!order) return null;

  const outstanding = order.outstanding_balance;
  const amountNum = Number(amount) || 0;
  const canSubmit = amountNum > 0 && amountNum <= outstanding + 0.01;

  return (
    <Drawer open={!!order} onClose={close} title="Record Payment" description={order.order_number} side="right" size="md">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

        <div className="bg-surface border border-border rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-muted">Invoice</span>
            <span className="font-semibold text-foreground">{order.order_number}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-muted">Customer</span>
            <span className="font-semibold text-foreground">{order.customer?.name ?? "Walk-in"}</span>
          </div>
          <div className="flex justify-between text-[13px] pt-1.5 border-t border-border">
            <span className="text-muted">Original Total</span>
            <span className="tabular-nums text-foreground">{fmt(order.total)}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-muted">Already Paid</span>
            <span className="tabular-nums text-foreground">{fmt(order.amount_paid)}</span>
          </div>
          <div className="flex justify-between text-[14px] font-bold pt-1.5 border-t border-border">
            <span className="text-foreground">Outstanding</span>
            <span className="tabular-nums text-amber-600">{fmt(outstanding)}</span>
          </div>
        </div>

        <Field label="Payment Amount" required hint={`Up to ${fmt(outstanding)} — the remaining balance`}>
          <Input required type="number" min="0.01" step="0.01" max={outstanding} value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
        </Field>

        <Field label="Payment Method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>

        <Field label="Reference" hint="Transaction/receipt number (optional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TX123456" />
        </Field>

        <Field label="Payment Date" required>
          <Input required type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>

        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>

        <FormFooter
          submitLabel={recordPayment.isPending ? "Recording…" : "Record Payment"}
          onCancel={close}
          disabled={recordPayment.isPending || !canSubmit}
          color={color}
        />
      </form>
    </Drawer>
  );
}
