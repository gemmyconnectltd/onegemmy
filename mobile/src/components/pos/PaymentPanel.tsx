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
  cartCount, currencySymbol, fmt,
  saving, saleError,
  onPaymentChange, onCharge,
}: PaymentPanelProps) {
  const chargeDisabled = cartCount === 0 || saving;

  return (
    <div className="bg-primary text-primary-foreground rounded-2xl p-3.5 shadow-lg shadow-primary/20 space-y-3">

      {/* Totals */}
      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex justify-between text-primary-foreground/60">
          <span>Items (incl. VAT)</span>
          <span>{currencySymbol} {fmt(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-300 font-semibold">
            <span>Discount</span>
            <span>-{currencySymbol} {fmt(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-primary-foreground/60">
          <span>VAT (18%, included)</span>
          <span>{currencySymbol} {fmt(tax)}</span>
        </div>
        <div className="flex items-end justify-between pt-1.5 mt-1 border-t border-primary-foreground/20">
          <span className="text-[12px] font-bold uppercase tracking-wide">Total</span>
          <span className="text-[26px] leading-none font-extrabold tabular-nums">{currencySymbol} {fmt(total)}</span>
        </div>
      </div>

      {/* Payment method tabs */}
      <div className="grid grid-cols-3 gap-1.5">
        {PAYMENT_METHODS.map((m) => {
          const active = payment === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onPaymentChange(m.id)}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold border rounded-xl transition-all ${
                active
                  ? "bg-primary-foreground text-primary border-transparent shadow"
                  : "bg-white/10 text-primary-foreground border-white/15 hover:bg-white/20"
              }`}
            >
              <m.icon size={14} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error + Charge */}
      {saleError && (
        <div className="flex items-start gap-1.5 text-[11px] font-medium text-red-200 bg-red-500/20 border border-red-400/40 rounded-lg px-2.5 py-2">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{saleError}</span>
        </div>
      )}
      <button
        disabled={chargeDisabled}
        onClick={onCharge}
        className="w-full py-3.5 bg-primary-foreground text-primary font-bold text-[15px] rounded-xl hover:opacity-90 active:scale-[0.98] transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {saving
          ? "Saving sale…"
          : `Charge${cartCount > 0 ? ` ${currencySymbol} ${fmt(total)}` : ""}`}
      </button>
    </div>
  );
}
