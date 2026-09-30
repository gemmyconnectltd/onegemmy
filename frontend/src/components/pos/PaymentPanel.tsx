"use client";

import { AlertCircle, Banknote, Calendar, CreditCard, Smartphone, UserRound, Wallet } from "lucide-react";

import type { PaymentMethod } from "./types";

/** Quick cash-received suggestions: the exact total, then rounded up to the
 * nearest common note denominations — mirrors how cashiers actually think. */
function quickCashAmounts(total: number): number[] {
  const roundUps = [100, 500, 1000, 5000]
    .map((step) => Math.ceil(total / step) * step)
    .filter((v) => v > total);
  return [...new Set([total, ...roundUps])].slice(0, 4);
}

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
  /** total - amount actually being paid now; > 0 means this sale leaves a
   * customer receivable (partial payment, or a fully-unpaid credit sale). */
  remainingBalance: number;
  cartCount: number;
  hasCustomer: boolean;
  dueDate: string;
  vatEnabled: boolean;
  currencySymbol: string;
  fmt: (v: number) => string;
  saving?: boolean;
  saleError?: string | null;
  /** Sum of cash recorded per cart line, when itemizing instead of one lump sum. */
  itemsCashReceivedSum?: number;
  onPaymentChange: (m: PaymentMethod) => void;
  onCashChange: (v: string) => void;
  onDueDateChange: (v: string) => void;
  onCharge: () => void;
}

export function PaymentPanel({
  payment, cashGiven, subtotal, discount, tax, total,
  change, remainingBalance, cartCount, hasCustomer, dueDate, vatEnabled, currencySymbol, fmt,
  saving, saleError, itemsCashReceivedSum,
  onPaymentChange, onCashChange, onDueDateChange, onCharge,
}: PaymentPanelProps) {
  const isCreditSale = remainingBalance > 0;
  const missingCreditFields = isCreditSale && (!hasCustomer || !dueDate);
  const chargeDisabled = cartCount === 0 || saving || Number(cashGiven || 0) < 0 || missingCreditFields;
  const quickAmounts = quickCashAmounts(total);
  const paymentStatus = remainingBalance <= 0 ? "Paid" : cashGiven === "0" ? "Unpaid" : "Partially Paid";

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

      {/* Amount Paid Now — applies to every payment method, not just cash;
          left blank it defaults to the full total (see the page's payload
          builder). An amount below the total is a partial or credit sale,
          not blocked — it just needs a customer and a due date, since it
          leaves a balance the business is owed. */}
      {cartCount > 0 && (
        <div className="bg-surface rounded-xl px-3.5 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground uppercase tracking-wide">
              <Wallet size={12} className="text-accent" /> Amount Paid Now
            </div>
            {!!itemsCashReceivedSum && itemsCashReceivedSum > 0 && String(itemsCashReceivedSum) !== cashGiven && (
              <button
                type="button"
                onClick={() => onCashChange(String(itemsCashReceivedSum))}
                className="text-[10.5px] font-semibold text-accent hover:underline whitespace-nowrap"
              >
                Use itemized: {currencySymbol} {fmt(itemsCashReceivedSum)}
              </button>
            )}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-mono text-muted">{currencySymbol}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={cashGiven}
              onChange={(e) => onCashChange(e.target.value)}
              placeholder={fmt(total)}
              className={`w-full pl-11 pr-3 py-2.5 rounded-lg border-2 bg-card text-[15px] font-mono font-bold tabular-nums outline-none transition-colors ${
                isCreditSale ? "border-amber-400 focus:border-amber-500" : "border-border focus:border-accent"
              }`}
            />
          </div>
          {cashGiven === "" && (
            <p className="text-[11px] text-muted">Leave blank to charge the full amount — {currencySymbol} {fmt(total)}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onCashChange(String(amt))}
                className="px-2.5 py-1 rounded-md bg-card border border-border text-[11px] font-semibold text-foreground/70 hover:border-accent/50 hover:text-accent transition-colors"
              >
                {currencySymbol} {fmt(amt)}
              </button>
            ))}
            {cashGiven !== "0" && (
              <button
                type="button"
                onClick={() => onCashChange("0")}
                className="px-2.5 py-1 rounded-md bg-card border border-border text-[11px] font-semibold text-amber-600 hover:border-amber-400 transition-colors"
              >
                Full credit (0)
              </button>
            )}
          </div>
          {cashGiven !== "" && (
            isCreditSale ? (
              <div className="space-y-2.5 pt-1.5 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] font-bold text-foreground">Remaining Balance</span>
                  <span className="text-[16px] font-extrabold text-amber-600 font-mono tabular-nums">{currencySymbol} {fmt(remainingBalance)}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">
                  {paymentStatus === "Unpaid" ? "Unpaid" : "Partially Paid"}
                </span>
                {!hasCustomer && (
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                    <UserRound size={12} /> Select a customer to allow a partial or credit sale
                  </p>
                )}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-foreground uppercase tracking-wide mb-1.5">
                    <Calendar size={12} className="text-accent" /> Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => onDueDateChange(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border-2 bg-card text-[13px] font-medium outline-none transition-colors ${
                      !dueDate ? "border-red-300 focus:border-red-400" : "border-border focus:border-accent"
                    }`}
                  />
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center pt-1.5 border-t border-border">
                <span className="text-[12px] font-bold text-foreground">Change Due</span>
                <span className="text-[16px] font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{currencySymbol} {fmt(change)}</span>
              </div>
            )
          )}
        </div>
      )}

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
            {isCreditSale ? "Complete Sale" : "Charge"}
            {cartCount > 0 && <span className="font-mono tabular-nums">{currencySymbol} {fmt(isCreditSale ? Number(cashGiven || 0) : total)}</span>}
          </>
        )}
      </button>
    </div>
  );
}
