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
    <div className="space-y-3">

      {/* Totals */}
      <div className="bg-surface rounded-xl px-3.5 py-3 space-y-1.5">
        <div className="flex justify-between text-[12px] font-mono text-muted">
          <span>{vatEnabled ? "Subtotal (incl. VAT)" : "Subtotal"}</span>
          <span>{currencySymbol} {fmt(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-[12px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
            <span>Discount</span>
            <span>-{currencySymbol} {fmt(discount)}</span>
          </div>
        )}
        {vatEnabled && (
          <div className="flex justify-between text-[12px] font-mono text-muted">
            <span>VAT (18%, included)</span>
            <span>{currencySymbol} {fmt(tax)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline border-t border-border pt-2 mt-1.5">
          <span className="text-[12px] font-bold text-foreground uppercase tracking-wide">Total</span>
          <span className="text-[24px] font-extrabold text-accent font-mono tabular-nums tracking-tight">{currencySymbol} {fmt(total)}</span>
        </div>
      </div>

      {/* Payment method tabs */}
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => onPaymentChange(m.id)}
            className={`flex flex-col items-center justify-center gap-1.5 py-3 text-[11px] font-bold rounded-xl border-2 transition-all ${
              payment === m.id
                ? "border-accent bg-accent text-white shadow-md shadow-accent/20"
                : "border-border text-foreground/70 hover:border-accent/40 hover:bg-surface"
            }`}
          >
            <m.icon size={18} strokeWidth={2} />
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
        className="w-full py-4 bg-accent text-white font-bold text-[16px] rounded-xl shadow-lg shadow-accent/25 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
      >
        {saving ? (
          "Saving sale…"
        ) : (
          <>
            Charge
            {cartCount > 0 && <span className="font-mono tabular-nums">{currencySymbol} {fmt(total)}</span>}
          </>
        )}
      </button>
    </div>
  );
}
