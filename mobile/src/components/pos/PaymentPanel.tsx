"use client";

import { AlertCircle, Banknote, CreditCard, Delete, Smartphone } from "lucide-react";

import { CASH_PRESETS } from "./constants";
import type { PaymentMethod } from "./types";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash",    label: "Cash",    icon: Banknote   },
  { id: "mobile",  label: "Mobile",  icon: Smartphone },
  { id: "card",    label: "Card",    icon: CreditCard },
];

const NUMPAD = ["7","8","9","4","5","6","1","2","3","00","0","⌫"] as const;

function presetLabel(v: number): string {
  if (v === 0) return "Exact";
  if (v >= 1000 && v % 1000 === 0) return `+${v / 1000}k`;
  if (v >= 1000) return `+${(v / 1000).toFixed(1)}k`;
  return `+${v}`;
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
  currencySymbol: string;
  fmt: (v: number) => string;
  saving?: boolean;
  saleError?: string | null;
  onPaymentChange: (m: PaymentMethod) => void;
  onCashChange: (v: string) => void;
  onCharge: () => void;
}

export function PaymentPanel({
  payment, cashGiven, subtotal, discount, tax, total, change, cashShort,
  cartCount, hasCustomer, currencySymbol, fmt,
  saving, saleError,
  onPaymentChange, onCashChange, onCharge,
}: PaymentPanelProps) {
  const isCash = payment === "cash";
  const chargeDisabled =
    cartCount === 0 ||
    saving ||
    (isCash && cashShort);

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
    <div className="bg-primary text-primary-foreground rounded-2xl p-3.5 shadow-lg shadow-primary/20 space-y-3">

      {/* Totals — big total dominates */}
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

      {/* Payment method segmented control */}
      <div className="grid grid-cols-4 gap-1.5">
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

      {/* Cash numpad */}
      {isCash && (
        <div className="space-y-2">
          {/* Cash display */}
          <div className={`flex items-center justify-between rounded-xl px-3 py-2 border transition-colors ${
            cashShort
              ? "border-red-400/40 bg-red-500/20"
              : cashGiven && Number(cashGiven) >= total
              ? "border-emerald-400/40 bg-emerald-500/20"
              : "border-white/15 bg-white/10"
          }`}>
            <span className="text-[11px] text-primary-foreground/70 font-medium">Cash given</span>
            <span className={`text-[15px] font-bold font-mono ${
              cashShort ? "text-red-300" : cashGiven ? "text-primary-foreground" : "text-primary-foreground/40"
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
                    ? "bg-red-500/20 text-red-300 border border-red-400/30 hover:bg-red-500/30"
                    : "bg-white/10 border border-white/10 text-primary-foreground hover:bg-white/20"
                }`}
              >
                {key === "⌫" ? <Delete size={14} className="mx-auto" /> : key}
              </button>
            ))}
          </div>

          {/* Quick presets */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {CASH_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => onCashChange(String(total + preset))}
                className="px-2.5 py-1.5 text-[10px] font-semibold border border-white/15 rounded-lg text-primary-foreground/80 hover:border-white/40 hover:text-primary-foreground transition-colors flex-shrink-0 bg-white/5"
              >
                {presetLabel(preset)}
              </button>
            ))}
          </div>

          {/* Change / short feedback */}
          {cashGiven && Number(cashGiven) >= total ? (
            <div className="flex justify-between items-center px-3 py-2 bg-emerald-500/20 border border-emerald-400/40 rounded-xl">
              <span className="text-[12px] font-semibold text-emerald-200">Change</span>
              <span className="text-[14px] font-bold text-emerald-200 font-mono">{currencySymbol} {fmt(change)}</span>
            </div>
          ) : cashShort ? (
            <div className="flex justify-between items-center px-3 py-2 bg-red-500/20 border border-red-400/40 rounded-xl">
              <span className="text-[12px] font-semibold text-red-200">Short by</span>
              <span className="text-[14px] font-bold text-red-200 font-mono">{currencySymbol} {fmt(total - Number(cashGiven))}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Charge button */}
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
