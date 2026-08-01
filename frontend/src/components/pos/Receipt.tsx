import { BadgeCheck, Check, FileText, Printer, UserRound } from "lucide-react";

import { BarcodeStripe } from "./BarcodeStripe";
import { getProductIcon, IconBadge } from "./icons";
import type { SaleResult } from "./types";

interface ReceiptProps {
  sale: SaleResult;
  currencySymbol: string;
  fmt: (v: number) => string;
  onNewSale: () => void;
}

export function Receipt({ sale, currencySymbol, fmt, onNewSale }: ReceiptProps) {
  return (
    <div className="bg-card">
      {/* Header */}
      <div className="p-6 text-center bg-accent/5 border-b border-border">
        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-3 shadow-sm">
          {sale.isInvoice
            ? <FileText size={20} className="text-white" strokeWidth={2.5} />
            : <Check size={20} className="text-white" strokeWidth={3} />}
        </div>
        <h2 className="text-[16px] font-bold text-foreground">
          {sale.isInvoice ? "Invoice issued" : "Payment complete"}
        </h2>
        <p className="text-[11px] text-muted mt-0.5 font-mono">
          {sale.isInvoice ? sale.invoiceNumber : sale.orderId}
        </p>
        <p className="text-[10px] text-muted/70 mt-1">{sale.timestamp.toLocaleString()}</p>
        {sale.customerName && (
          <p className="text-[11px] text-foreground/70 mt-1 flex items-center justify-center gap-1">
            <UserRound size={11} /> {sale.customerName}
          </p>
        )}
        {sale.notes && (
          <p className="text-[10px] text-muted mt-1 italic">"{sale.notes}"</p>
        )}
        {sale.isInvoice && (
          <span className={`mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
            sale.paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}>
            <BadgeCheck size={11} /> {sale.paid ? "Paid" : "Awaiting payment"}
          </span>
        )}
      </div>

      <BarcodeStripe />

      {/* Items */}
      <div className="divide-y divide-border max-h-[220px] overflow-y-auto">
        {sale.items.map((item) => (
          <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt={item.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <IconBadge
                  Icon={getProductIcon({ emoji: item.emoji })}
                  size={12}
                  color="var(--accent)"
                  className="w-7 h-7 flex-shrink-0"
                  rounded="rounded-lg"
                />
              )}
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-foreground truncate">{item.name}</p>
                {item.variant_attributes && Object.keys(item.variant_attributes).length > 0 && (
                  <p className="text-[10px] text-muted truncate">
                    {Object.entries(item.variant_attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </p>
                )}
                <p className="text-[10px] text-muted font-mono">
                  {item.qty} × {currencySymbol} {fmt(item.price)}
                  {item.discount > 0 && <span className="text-emerald-600"> (-{fmt(item.discount)})</span>}
                </p>
              </div>
            </div>
            <span className="text-[12px] font-semibold text-foreground font-mono tabular-nums flex-shrink-0">
              {currencySymbol} {fmt(item.price * item.qty - item.discount)}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="px-4 py-4 space-y-1.5 border-t border-border font-mono text-[12px]">
        <div className="flex justify-between text-muted">
          <span>Subtotal</span><span>{currencySymbol} {fmt(sale.subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-emerald-600 font-semibold">
            <span>Discount</span><span>-{currencySymbol} {fmt(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted">
          <span>Tax (18%)</span><span>{currencySymbol} {fmt(sale.tax)}</span>
        </div>
        <div className="flex justify-between text-[14px] font-bold text-foreground border-t border-border pt-1.5">
          <span>{sale.isInvoice ? "Amount due" : "Total"}</span>
          <span>{currencySymbol} {fmt(sale.total)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Payment</span>
          <span className="capitalize">{sale.payment === "mobile" ? "Mobile Money" : sale.payment}</span>
        </div>
        {!sale.isInvoice && sale.payment === "cash" && sale.cashGiven && (
          <div className="flex justify-between font-semibold text-accent">
            <span>Change</span><span>{currencySymbol} {fmt(sale.change)}</span>
          </div>
        )}
        {sale.isInvoice && (
          <div className="flex justify-between font-semibold text-amber-600">
            <span>Status</span><span>{sale.paid ? "Paid" : "Unpaid"}</span>
          </div>
        )}
      </div>

      <BarcodeStripe />

      <div className="px-4 py-3 text-center">
        <p className="text-[10px] text-muted">
          {sale.isInvoice ? `Invoice ${sale.invoiceNumber} — payable on demand.` : "Thanks for shopping with us."}
        </p>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 grid grid-cols-[1fr_auto] gap-2">
        <button
          onClick={onNewSale}
          className="py-3 bg-accent text-white font-bold text-[14px] rounded-xl hover:opacity-90 active:scale-[0.98] transition"
        >
          New Sale
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
  );
}
