"use client";

import { AlertCircle, Banknote, CreditCard, Smartphone, Wallet } from "lucide-react";

import type { PaymentMethod } from "./types";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash",    label: "Cash",    icon: Banknote   },
  { id: "mobile",  label: "Mobile",  icon: Smartphone },
  { id: "card",    label: "Card",    icon: CreditCard },
];

/** Quick amount-received suggestions: the exact total, then rounded up to the
 * nearest common note denominations — mirrors how cashiers actually think. */
function quickAmounts(total: number): number[] {
  const roundUps = [100, 500, 1000, 5000]
    .map((step) => Math.ceil(total / step) * step)
    .filter((v) => v > total);
  return [...new Set([total, ...roundUps])].slice(0, 4);
}

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
  payment, cashGiven, subtotal, discount, tax, total,
  change, cashShort, cartCount, vatEnabled, currencySymbol, fmt,
  saving, saleError,
  onPaymentChange, onCashChange, onCharge,
}: PaymentPanelProps) {
  const chargeDisabled = cartCount === 0 || saving || cashShort;
  const amounts = quickAmounts(total);

  return (
    <div className="bg-primary text-primary-foreground rounded-2xl p-3.5 shadow-lg shadow-primary/20 space-y-3">

      {/* Totals */}
      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex justify-between text-primary-foreground/60">
          <span>{vatEnabled ? "Subtotal (incl. VAT)" : "Subtotal"}</span>
          <span>{currencySymbol} {fmt(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-300 font-semibold">
            <span>Discount</span>
            <span>-{currencySymbol} {fmt(discount)}</span>
          </div>
        )}
        {vatEnabled && (
          <div className="flex justify-between text-primary-foreground/60">
            <span>VAT (18%, included)</span>
            <span>{currencySymbol} {fmt(tax)}</span>
          </div>
        )}
        <div className="flex items-end justify-between pt-1.5 mt-1 border-t border-primary-foreground/20">
          <span className="text-[12px] font-bold uppercase tracking-wide">Total</span>
          <span className="text-[20px] leading-none font-extrabold tabular-nums">{currencySymbol} {fmt(total)}</span>
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

      {/* Amount received — applies no matter the payment method; left blank
          it defaults to the full total (see the provider's payload builder). */}
      {cartCount > 0 && (
        <div className="bg-white/10 rounded-xl px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground/80">
            <Wallet size={11} /> Amount Received
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-mono text-primary-foreground/50">{currencySymbol}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={cashGiven}
              onChange={(e) => onCashChange(e.target.value)}
              placeholder={fmt(total)}
              className={`w-full pl-10 pr-3 py-2 rounded-lg border bg-white/10 text-primary-foreground placeholder:text-primary-foreground/40 text-[14px] font-mono font-bold tabular-nums outline-none transition-colors ${
                cashShort ? "border-red-400" : "border-white/20 focus:border-primary-foreground/50"
              }`}
            />
          </div>
          {cashGiven === "" ? (
            <p className="text-[10.5px] text-primary-foreground/60">Leave blank to charge the full amount</p>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {amounts.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => onCashChange(String(amt))}
                  className="px-2 py-1 rounded-md bg-white/10 border border-white/15 text-[10.5px] font-semibold text-primary-foreground/80 hover:bg-white/20 transition-colors"
                >
                  {currencySymbol} {fmt(amt)}
                </button>
              ))}
            </div>
          )}
          {cashGiven !== "" && (
            cashShort ? (
              <p className="text-[11.5px] font-semibold text-red-300">
                Short by {currencySymbol} {fmt(total - Number(cashGiven))}
              </p>
            ) : (
              <div className="flex justify-between items-center pt-1.5 border-t border-white/15">
                <span className="text-[11px] font-bold text-primary-foreground/80">Change Due</span>
                <span className="text-[14px] font-extrabold text-emerald-300 font-mono tabular-nums">{currencySymbol} {fmt(change)}</span>
              </div>
            )
          )}
        </div>
      )}

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
