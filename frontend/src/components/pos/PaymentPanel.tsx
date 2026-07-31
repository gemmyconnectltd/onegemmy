"use client";

import { Banknote, CreditCard, Delete, FileText, Smartphone, Wallet } from "lucide-react";

import type { PaymentMethod } from "./types";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash",    label: "Cash",    icon: Banknote   },
  { id: "mobile",  label: "Mobile",  icon: Smartphone },
  { id: "card",    label: "Card",    icon: CreditCard },
  { id: "invoice", label: "Invoice", icon: FileText   },
];

const NUMPAD = ["7","8","9","4","5","6","1","2","3","00","0","⌫"] as const;

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
  onPaymentChange: (m: PaymentMethod) => void;
  onCashChange: (v: string) => void;
  onCharge: () => void;
}

export function PaymentPanel({
  payment, cashGiven, subtotal, discount, tax, total, change, cashShort,
  cartCount, hasCustomer, currencySymbol, fmt,
  onPaymentChange, onCashChange, onCharge,
}: PaymentPanelProps) {
  const isInvoice = payment === "invoice";
  const isCash = payment === "cash";
  const chargeDisabled =
    cartCount === 0 ||
    (isCash && cashShort) ||
    (isInvoice && !hasCustomer);

  const handleNumpad = (key: string) => {
    if (key === "⌫") {
      onCashChange(cashGiven.slice(0, -1));
    } else {
      // prevent leading zeros
      const next = cashGiven === "0" ? key : cashGiven + key;
      onCashChange(next);
    }
  };

  return (
    <div className="space-y-2.5">

      {/* Totals */}
      <div className="space-y-1 font-mono text-[12px]">
        <div className="flex justify-between text-muted">
          <span>Subtotal</span>
          <span>{currencySymbol} {fmt(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-600 font-semibold">
            <span>Discount</span>
            <span>-{currencySymbol} {fmt(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted">
          <span>Tax (18%)</span>
          <span>{currencySymbol} {fmt(tax)}</span>
        </div>
        <div className="flex justify-between text-[14px] font-bold text-foreground border-t border-border pt-1.5">
          <span>{isInvoice ? "Amount due" : "Total"}</span>
          <span className="text-accent">{currencySymbol} {fmt(total)}</span>
        </div>
      </div>

      {/* Payment method tabs */}
      <div className="grid grid-cols-4 gap-1">
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

      {/* Invoice warning */}
      {isInvoice && !hasCustomer && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <Wallet size={11} /> Add a customer name above to issue invoice.
        </div>
      )}

      {/* Cash numpad */}
      {isCash && (
        <div className="space-y-2">
          {/* Cash display */}
          <div className={`flex items-center justify-between rounded-xl px-3 py-2 border transition-colors ${
            cashShort
              ? "border-red-300 bg-red-50"
              : cashGiven && Number(cashGiven) >= total
              ? "border-emerald-300 bg-emerald-50"
              : "border-border bg-surface"
          }`}>
            <span className="text-[11px] text-muted font-medium">Cash given</span>
            <span className={`text-[15px] font-bold font-mono ${
              cashShort ? "text-red-500" : cashGiven ? "text-foreground" : "text-muted/40"
            }`}>
              {cashGiven ? `${currencySymbol} ${fmt(Number(cashGiven))}` : "—"}
            </span>
          </div>

          {/* Numpad — compact 3×4 */}
          <div className="grid grid-cols-3 gap-1">
            {NUMPAD.map((key) => (
              <button
                key={key}
                onClick={() => handleNumpad(key)}
                className={`py-2.5 rounded-xl text-[13px] font-bold transition-all active:scale-95 select-none ${
                  key === "⌫"
                    ? "bg-red-50 text-red-500 border border-red-200 hover:bg-red-100"
                    : "bg-surface border border-border text-foreground hover:bg-border"
                }`}
              >
                {key === "⌫" ? <Delete size={14} className="mx-auto" /> : key}
              </button>
            ))}
          </div>

          {/* Quick presets */}
          <div className="grid grid-cols-4 gap-1">
            {[0, 1000, 5000, 10000].map((preset) => (
              <button
                key={preset}
                onClick={() => onCashChange(String(total + preset))}
                className="py-1.5 text-[10px] font-semibold border border-border rounded-lg text-foreground/70 hover:border-accent hover:text-accent transition-colors"
              >
                {preset === 0 ? "Exact" : `+${preset >= 1000 ? `${preset / 1000}k` : preset}`}
              </button>
            ))}
          </div>

          {/* Change / short feedback */}
          {cashGiven && Number(cashGiven) >= total ? (
            <div className="flex justify-between items-center px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-[12px] font-semibold text-emerald-700">Change</span>
              <span className="text-[14px] font-bold text-emerald-700 font-mono">{currencySymbol} {fmt(change)}</span>
            </div>
          ) : cashShort ? (
            <div className="flex justify-between items-center px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-[12px] font-semibold text-red-600">Short by</span>
              <span className="text-[14px] font-bold text-red-600 font-mono">{currencySymbol} {fmt(total - Number(cashGiven))}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Charge button */}
      <button
        disabled={chargeDisabled}
        onClick={onCharge}
        className="w-full py-3 bg-accent text-white font-bold text-[14px] rounded-xl hover:opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {isInvoice
          ? `Issue Invoice${cartCount > 0 ? ` · ${currencySymbol} ${fmt(total)}` : ""}`
          : `Charge${cartCount > 0 ? ` ${currencySymbol} ${fmt(total)}` : ""}`}
      </button>
    </div>
  );
}
