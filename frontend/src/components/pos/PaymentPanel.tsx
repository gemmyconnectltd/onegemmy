import { Banknote, CreditCard, FileText, Smartphone, Wallet } from "lucide-react";

import { CASH_PRESETS } from "./constants";
import type { PaymentMethod } from "./types";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "mobile", label: "Mobile Money", icon: Smartphone },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "invoice", label: "Invoice", icon: FileText },
];

interface PaymentPanelProps {
  payment: PaymentMethod;
  cashGiven: string;
  subtotal: number;
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
  payment, cashGiven, subtotal, tax, total, change, cashShort,
  cartCount, hasCustomer, currencySymbol, fmt, onPaymentChange, onCashChange, onCharge,
}: PaymentPanelProps) {
  const isInvoice = payment === "invoice";
  const chargeDisabled = cartCount === 0 || (payment === "cash" && cashShort) || (isInvoice && !hasCustomer);

  return (
    <div className="space-y-3.5">
      <div className="space-y-1.5 font-mono">
        <div className="flex justify-between text-[13px] text-muted"><span>Subtotal</span><span>{currencySymbol} {fmt(subtotal)}</span></div>
        <div className="flex justify-between text-[13px] text-muted"><span>Tax (18%)</span><span>{currencySymbol} {fmt(tax)}</span></div>
        <div className="flex justify-between text-[16px] font-bold text-foreground border-t border-border pt-2">
          <span>{isInvoice ? "Amount due" : "Total"}</span>
          <span className="text-accent">{currencySymbol} {fmt(total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => onPaymentChange(m.id)}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold border-2 rounded-xl transition-all ${
              payment === m.id
                ? "border-accent bg-accent text-white shadow-sm"
                : "border-border text-foreground/60 hover:border-accent/50"
            }`}
          >
            <m.icon size={14} />
            {m.label}
          </button>
        ))}
      </div>

      {isInvoice && !hasCustomer && (
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Wallet size={13} /> Add a customer name to issue this invoice.
        </div>
      )}

      {payment === "cash" && (
        <div className="space-y-2">
          <label className="text-[12px] text-muted font-medium">Cash given</label>
          <input
            type="number"
            value={cashGiven}
            onChange={(e) => onCashChange(e.target.value)}
            placeholder={currencySymbol}
            className={`w-full border rounded-xl px-3 py-2 text-[14px] font-semibold text-foreground outline-none transition-colors font-mono ${
              cashShort ? "border-red-300 focus:border-red-400" : "border-border focus:border-accent"
            }`}
          />
          <div className="grid grid-cols-4 gap-1.5">
            {CASH_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => onCashChange(String(total + preset))}
                className="py-1.5 text-[11px] font-semibold border border-border rounded-lg text-foreground/70 hover:border-accent hover:text-accent transition-colors"
              >
                {preset === 0 ? "Exact" : `+${preset >= 1000 ? `${preset / 1000}k` : preset}`}
              </button>
            ))}
          </div>
          {cashGiven && Number(cashGiven) >= total ? (
            <p className="text-[13px] font-bold text-accent">Change: {currencySymbol} {fmt(change)}</p>
          ) : cashShort ? (
            <p className="text-[12px] font-medium text-red-500">Short by {currencySymbol} {fmt(total - Number(cashGiven))}</p>
          ) : null}
        </div>
      )}

      <button
        disabled={chargeDisabled}
        onClick={onCharge}
        className="w-full py-3.5 bg-accent text-white font-bold text-[15px] rounded-xl hover:opacity-90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {isInvoice
          ? `Issue Invoice ${cartCount > 0 ? `· ${currencySymbol} ${fmt(total)}` : ""}`
          : `Charge ${cartCount > 0 ? fmt(total) : ""}`}
      </button>
    </div>
  );
}
