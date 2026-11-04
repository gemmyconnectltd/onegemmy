"use client";

import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import type { Checkout } from "./PaymentPanel";
import type { CartItem } from "./types";
import { paymentLabel } from "./ReceiptDocument";

/** One last look before a split, a debt or a past-dated sale is recorded. Nothing is saved until Confirm. */
export function ConfirmSaleDialog({ checkout, cart, total, customerName, saleAt, currencySymbol, fmt, saving, onCancel, onConfirm }: {
  checkout: Checkout; cart: CartItem[]; total: number; customerName: string; saleAt: string | null; currencySymbol: string; fmt: (v: number) => string;
  saving: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const money = (v: number) => `${currencySymbol} ${fmt(v)}`;
  const label = checkout.kind === "credit" ? "Confirm Credit Sale" : checkout.outstanding > 0 ? "Complete Partial Payment Sale" : "Complete Sale";
  return (
    <Drawer open onClose={() => { if (!saving) onCancel(); }} side="center" size="md" title="Review the sale">
      <div className="space-y-4 p-5 text-sm">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
          <dt className="text-muted">Customer</dt><dd className="font-semibold text-foreground">{customerName || "Walk-in customer"}</dd>
          <dt className="text-muted">Sale date</dt><dd className="font-semibold text-foreground">{saleAt ? new Date(saleAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Now"}</dd>
        </dl>
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {cart.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"><span className="min-w-0 truncate">{i.qty} × {i.name}</span><span className="shrink-0 font-mono tabular-nums">{money(i.price * i.qty - i.discount)}</span></li>)}
        </ul>
        <dl className="space-y-1.5 rounded-lg bg-surface p-3">
          <div className="flex justify-between font-bold"><dt>Total</dt><dd className="font-mono tabular-nums">{money(total)}</dd></div>
          {checkout.payments.map((p, i) => <div key={i} className="flex justify-between text-[13px]"><dt className="text-muted">{paymentLabel(p.method)}{p.reference ? ` · ${p.reference}` : ""}</dt><dd className="font-mono tabular-nums">{money(p.amount)}</dd></div>)}
          {checkout.change > 0 && <div className="flex justify-between text-[13px]"><dt className="text-muted">Change given</dt><dd className="font-mono tabular-nums">{money(checkout.change)}</dd></div>}
          {checkout.outstanding > 0 && <div className="flex justify-between border-t border-border pt-1.5 font-bold text-amber-700 dark:text-amber-300"><dt>Customer will owe</dt><dd className="font-mono tabular-nums">{money(checkout.outstanding)}</dd></div>}
          {checkout.outstanding > 0 && checkout.dueDate && <div className="flex justify-between text-[13px]"><dt className="text-muted">Pay by</dt><dd className="font-semibold">{new Date(`${checkout.dueDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</dd></div>}
        </dl>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" disabled={saving} onClick={onCancel}>Back</Button>
          <Button className="flex-1" disabled={saving} aria-busy={saving} onClick={onConfirm}>{saving ? "Saving sale…" : label}</Button>
        </div>
      </div>
    </Drawer>
  );
}
