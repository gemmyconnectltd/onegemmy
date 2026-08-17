"use client";

import { AlertCircle, Banknote, CreditCard, Smartphone } from "lucide-react";

import type { PaymentMethod } from "./types";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash",    label: "Cash",    icon: Banknote   },
  { id: "mobile",  label: "Mobile",  icon: Smartphone },
  { id: "card",    label: "Card",    icon: CreditCard },
];

interface PaymentPanelProps {
  payment: PaymentMethod;
  cashGiven: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  change: number;
  cashShort: boolean;
  cartCount: number;
  hasCustomer: boolean;
  vatEnabled: boolean;
  currencySymbol: string;
  fmt: (v: number) => string;
  saving?: boolean;
  saleError?: string | null;
  onPaymentChange: (m: PaymentMethod) => void;
  onCashChange: (v: string) => void;
  onCharge: () => void;
}

export function PaymentPanel({
  payment, subtotal, discount, tax, total,
  cartCount, vatEnabled, currencySymbol, fmt,
  saving, saleError,
  onPaymentChange, onCharge,
}: PaymentPanelProps) {
  const chargeDisabled = cartCount === 0 || saving;

  return (
    <div className="space-y-2.5">

      {/* Totals */}
      <div className="space-y-1 font-mono text-[12px]">
        <div className="flex justify-between text-muted">
          <span>{vatEnabled ? "Subtotal (incl. VAT)" : "Subtotal"}</span>
          <span>{currencySymbol} {fmt(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-600 font-semibold">
            <span>Discount</span>
            <span>-{currencySymbol} {fmt(discount)}</span>
          </div>
        )}
        {vatEnabled && (
          <div className="flex justify-between text-muted">
            <span>VAT (18%, included)</span>
            <span>{currencySymbol} {fmt(tax)}</span>
          </div>
        )}
        <div className="flex justify-between text-[14px] font-bold text-foreground border-t border-border pt-1.5">
          <span>Total</span>
          <span className="text-accent">{currencySymbol} {fmt(total)}</span>
        </div>
      </div>

      {/* Payment method tabs */}
      <div className="grid grid-cols-3 gap-1">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => onPaymentChange(m.id)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold border-2 rounded-xl transition-all ${
              payment === m.id
                ? "border-accent bg-accent text-white shadow-sm"
                : "border-border text-foreground/60 hover:border-accent/50 hover:text-foreground"
            }`}
          >
            <m.icon size={13} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* Error + Charge */}
      {saleError && (
        <div className="flex items-start gap-1.5 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{saleError}</span>
        </div>
      )}
      <button
        disabled={chargeDisabled}
        onClick={onCharge}
        className="w-full py-3 bg-accent text-white font-bold text-[14px] rounded-xl hover:opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {saving
          ? "Saving sale…"
          : `Charge${cartCount > 0 ? ` ${currencySymbol} ${fmt(total)}` : ""}`}
      </button>
    </div>
  );
}
