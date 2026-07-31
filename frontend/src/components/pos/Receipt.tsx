import { ArrowLeft, BadgeCheck, Check, FileText, Printer, UserRound } from "lucide-react";

import { BarcodeStripe } from "./BarcodeStripe";
import { IconBadge, getBusinessIcon, getProductIcon } from "./icons";
import type { SaleResult } from "./types";

interface ReceiptProps {
  sale: SaleResult;
  currencySymbol: string;
  fmt: (v: number) => string;
  onNewSale: () => void;
  newSaleLabel?: string;
}

export function Receipt({ sale, currencySymbol, fmt, onNewSale, newSaleLabel = "New Sale" }: ReceiptProps) {
  const handlePrint = () => window.print();

  return (
    <div
      className="min-h-screen bg-surface flex flex-col"
      style={{ ["--accent" as string]: sale.business.accent }}
    >
      <div className="h-14 bg-white border-b border-border flex items-center px-6 gap-3 print:hidden">
        <button
          onClick={onNewSale}
          className="flex items-center gap-2 text-[13px] font-medium text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} /> {newSaleLabel}        </button>
        <span className="ml-auto text-[13px] text-muted">{sale.timestamp.toLocaleString()}</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white border border-border w-full max-w-sm rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-border text-center bg-accent/5">
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-3">
              {sale.isInvoice ? (
                <FileText size={22} className="text-white" strokeWidth={2.5} />
              ) : (
                <Check size={22} className="text-white" strokeWidth={3} />
              )}
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {sale.isInvoice ? "Invoice issued" : "Payment complete"}
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              {sale.isInvoice ? sale.invoiceNumber : sale.orderId}
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-2 text-[12px] font-medium text-foreground/70">
              <IconBadge Icon={getBusinessIcon(sale.business)} size={13} color="currentColor" bg="transparent" rounded="rounded" />
              <span>{sale.business.label}</span>
            </div>
            <p className="text-[11px] text-muted/70 mt-0.5">{sale.timestamp.toLocaleString()}</p>
            {sale.customerName && (
              <p className="text-[12px] text-foreground/70 mt-1 flex items-center justify-center gap-1">
                <UserRound size={12} /> {sale.customerName}
              </p>
            )}
            {sale.isInvoice && (
              <p
                className={`mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                  sale.paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                <BadgeCheck size={12} /> {sale.paid ? "Paid" : "Awaiting payment"}
              </p>
            )}
          </div>

          <BarcodeStripe />

          <div className="divide-y divide-border max-h-[260px] overflow-y-auto">
            {sale.items.map((item) => (
              <div key={item.id} className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconBadge
                    Icon={getProductIcon({ ...item, category: "", stock: 99, emoji: item.emoji })}
                    size={13}
                    color={sale.business.accent}
                    className="w-7 h-7"
                    rounded="rounded-lg"
                  />
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{item.name}</p>
                    <p className="text-[11px] text-muted font-mono">
                      {item.qty} × {currencySymbol} {fmt(item.price)}
                    </p>
                  </div>
                </div>
                <span className="text-[13px] font-semibold text-foreground font-mono tabular-nums">
                  {currencySymbol} {fmt(item.price * item.qty)}
                </span>
              </div>
            ))}
          </div>

          <div className="p-5 space-y-2 border-t border-border font-mono">
            <div className="flex justify-between text-[13px] text-muted">
              <span>Subtotal</span><span>{currencySymbol} {fmt(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between text-[13px] text-muted">
              <span>Tax (18%)</span><span>{currencySymbol} {fmt(sale.tax)}</span>
            </div>
            <div className="flex justify-between text-[15px] font-bold text-foreground border-t border-border pt-2">
              <span>{sale.isInvoice ? "Amount due" : "Total"}</span><span>{currencySymbol} {fmt(sale.total)}</span>
            </div>
            <div className="flex justify-between text-[13px] text-muted">
              <span>Payment</span>
              <span className="capitalize">{sale.payment === "mobile" ? "Mobile Money" : sale.payment}</span>
            </div>
            {!sale.isInvoice && sale.payment === "cash" && sale.cashGiven && (
              <div className="flex justify-between text-[13px] font-semibold text-accent">
                <span>Change</span><span>{currencySymbol} {fmt(sale.change)}</span>
              </div>
            )}
            {sale.isInvoice && (
              <div className="flex justify-between text-[13px] font-semibold text-amber-600">
                <span>Status</span><span>{sale.paid ? "Paid" : "Unpaid"}</span>
              </div>
            )}
          </div>

          <BarcodeStripe />

          <div className="p-5 pt-4 text-center">
            <p className="text-[11px] text-muted">
              {sale.isInvoice ? `Invoice ${sale.invoiceNumber} — payable on demand.` : "Thanks for shopping with us."}
            </p>
          </div>

          <div className="p-5 pt-0 grid grid-cols-[1fr_auto] gap-2 print:hidden">
            <button
              onClick={onNewSale}
              className="py-3 bg-accent text-white font-bold text-[14px] rounded-xl hover:opacity-90 active:scale-[0.98] transition"
            >
              {newSaleLabel}             </button>
            <button
              onClick={handlePrint}
              aria-label="Print receipt"
              className="w-12 flex items-center justify-center border border-border rounded-xl text-foreground/60 hover:text-foreground hover:bg-surface transition-colors"
            >
              <Printer size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
