"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Form";
import { useReverseOrderPayment } from "@/lib/api/hooks";
import type { ApiOrderPayment } from "@/lib/api";

interface Props {
  payment: ApiOrderPayment | null;
  onClose: () => void;
  fmt: (v: number) => string;
}

export function ReversePaymentDrawer({ payment, onClose, fmt }: Props) {
  const reversePayment = useReverseOrderPayment();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason(""); setError(null);
    onClose();
  }

  async function handleReverse() {
    if (!payment) return;
    setError(null);
    try {
      await reversePayment.mutateAsync({ paymentId: payment.id, reason: reason || undefined });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reverse this payment.");
    }
  }

  return (
    <Drawer
      open={!!payment}
      onClose={close}
      title="Reverse Payment"
      description={payment?.reference}
      side="center"
      size="sm"
      footer={
        payment && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={close} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
            <Button type="button" variant="danger" onClick={handleReverse} disabled={reversePayment.isPending} className="flex-1 rounded-lg text-[13px] font-bold">
              {reversePayment.isPending ? "Reversing…" : "Reverse Payment"}
            </Button>
          </div>
        )
      }
    >
      {payment && (
        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-sm text-foreground/70">
            This restores <span className="font-semibold text-foreground">{fmt(payment.amount)}</span> to the invoice&apos;s outstanding balance and reverses its accounting entry. The payment record stays visible, marked as reversed — this cannot be undone.
          </p>
          <Field label="Reason" hint="Optional, but recommended for the audit trail">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered in error, wrong amount" />
          </Field>
        </div>
      )}
    </Drawer>
  );
}
