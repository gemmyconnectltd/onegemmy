import { Check, Copy, Printer, Share2, UserRound, X } from "lucide-react";
import { useState } from "react";

import { BarcodeStripe } from "./BarcodeStripe";
import { getProductIcon, IconBadge } from "./icons";
import type { SaleResult } from "./types";

interface ReceiptProps {
  sale: SaleResult;
  currencySymbol: string;
  fmt: (v: number) => string;
  vatEnabled: boolean;
  onNewSale: () => void;
  onClose?: () => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile: "Mobile Money",
  card: "Card",
};

export function Receipt({ sale, currencySymbol, fmt, vatEnabled, onNewSale, onClose }: ReceiptProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySummary = () => {
    const lines = [
      `Receipt ${sale.orderId}`,
      sale.timestamp.toLocaleString(),
      "",
      ...sale.items.map((i) => {
        const line = `  ${i.name}  ${i.qty}× ${currencySymbol} ${fmt(i.price)}`;
        return i.discount > 0 ? `${line}  (-${fmt(i.discount)})` : line;
      }),
      "",
      `Subtotal: ${currencySymbol} ${fmt(sale.subtotal)}`,
      ...(sale.discount > 0 ? [`Discount: -${currencySymbol} ${fmt(sale.discount)}`] : []),
      ...(vatEnabled && sale.tax > 0 ? [`VAT (18%): ${currencySymbol} ${fmt(sale.tax)}`] : []),
      `Total: ${currencySymbol} ${fmt(sale.total)}`,
      `Paid: ${PAYMENT_LABELS[sale.payment] ?? sale.payment}`,
      ...(sale.payment === "cash" && sale.cashGiven ? [`Change: ${currencySymbol} ${fmt(sale.change)}`] : []),
      "",
      "Thank you!",
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header — success state */}
      <div className="relative px-5 pt-8 pb-5 text-center">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-surface text-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}
        <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/25">
          <Check size={24} className="text-white" strokeWidth={3} />
        </div>
        <h2 className="text-[17px] font-bold text-foreground">Payment received</h2>
        <p className="text-[12px] text-muted mt-1 font-mono tracking-wide">{sale.orderId}</p>
        <p className="text-[11px] text-muted/70 mt-0.5">{sale.timestamp.toLocaleString()}</p>
        {sale.customerName && (
          <p className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-surface text-[11px] text-foreground/70 font-medium">
            <UserRound size={11} /> {sale.customerName}
          </p>
        )}
      </div>

      <BarcodeStripe />

      {/* Items — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-3 space-y-0.5">
          <p className="text-[9px] text-muted uppercase tracking-wider font-semibold mb-2 px-1">Items purchased</p>
          {sale.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 py-2 px-1">
              <div className="flex items-center gap-2.5 min-w-0">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <IconBadge
                    Icon={getProductIcon({ emoji: item.emoji })}
                    size={12}
                    color="var(--primary)"
                    className="w-8 h-8 flex-shrink-0"
                    rounded="rounded-lg"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{item.name}</p>
                  {item.variant_attributes && Object.keys(item.variant_attributes).length > 0 && (
                    <p className="text-[10px] text-muted truncate">
                      {Object.entries(item.variant_attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </p>
                  )}
                  <p className="text-[11px] text-muted font-mono">
                    {item.qty} × {currencySymbol} {fmt(item.price)}
                    {item.discount > 0 && <span className="text-emerald-600 font-semibold"> (−{fmt(item.discount)})</span>}
                  </p>
                </div>
              </div>
              <span className="text-[13px] font-semibold text-foreground font-mono tabular-nums flex-shrink-0">
                {currencySymbol} {fmt(item.price * item.qty - item.discount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary — sticky bottom */}
      <div className="border-t border-border">
        <div className="px-4 py-3 space-y-1 font-mono text-[12px]">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span><span>{currencySymbol} {fmt(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between text-emerald-600 font-semibold">
              <span>Discount</span><span>−{currencySymbol} {fmt(sale.discount)}</span>
            </div>
          )}
          {vatEnabled && sale.tax > 0 && (
            <div className="flex justify-between text-muted">
              <span>VAT (18%)</span><span>{currencySymbol} {fmt(sale.tax)}</span>
            </div>
          )}
          <div className="flex justify-between text-[15px] font-bold text-foreground border-t border-border pt-2 mt-1">
            <span>Total</span>
            <span className="text-primary">{currencySymbol} {fmt(sale.total)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-muted pt-0.5">
            <span>Paid via</span>
            <span className="font-semibold text-foreground">{PAYMENT_LABELS[sale.payment] ?? sale.payment}</span>
          </div>
          {sale.payment === "cash" && sale.cashGiven && (
            <div className="flex justify-between text-[11px] text-muted">
              <span>Change</span><span className="font-semibold text-foreground">{currencySymbol} {fmt(sale.change)}</span>
            </div>
          )}
        </div>

        <div className="px-4 pb-2">
          <p className="text-center text-[10px] text-muted/60 italic mb-3">Thank you for your purchase!</p>
        </div>

        {/* Actions — fixed at very bottom */}
        <div className="px-4 pb-4 grid grid-cols-[1fr_auto_auto] gap-2">
          <button
            onClick={onNewSale}
            className="py-3 bg-primary text-primary-foreground font-bold text-[14px] rounded-xl hover:opacity-90 active:scale-[0.98] transition"
          >
            New Sale
          </button>
          <button
            onClick={handleCopySummary}
            aria-label="Copy receipt"
            className="w-12 flex items-center justify-center border border-border rounded-xl text-foreground/60 hover:text-foreground hover:bg-surface transition-colors"
          >
            {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
          </button>
          <button
            onClick={() => window.print()}
            aria-label="Print receipt"
            className="w-12 flex items-center justify-center border border-border rounded-xl text-foreground/60 hover:text-foreground hover:bg-surface transition-colors"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
