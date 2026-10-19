/* Receipt logos are cloned into an isolated print document and must remain native images. */
/* eslint-disable @next/next/no-img-element */
import { resolveUploadUrl } from "@/lib/api/client";
import { fmtDateTime } from "@/lib/date";
import type { Tenant } from "@/lib/api";
import type { SaleResult } from "./types";

export const paymentLabel = (method: string) => ({ cash: "Cash", mobile: "Mobile Money", card: "Card" })[method] ?? method;

/** Single receipt rendering for viewing and isolated printing, using the persisted completed sale. */
export function ReceiptDocument({ sale, tenant, currencySymbol, fmt, vatEnabled }: {
  sale: SaleResult; tenant?: Tenant; currencySymbol: string; fmt: (value: number) => string; vatEnabled: boolean;
}) {
  const money = (value: number) => `${currencySymbol} ${fmt(value)}`;
  const row = (label: string, value: string) => <div className="receipt-row flex justify-between gap-3 py-0.5"><span>{label}</span><strong className="text-right tabular-nums">{value}</strong></div>;
  return <article className="pos-receipt bg-card p-4 text-xs text-foreground" data-pos-receipt>
    <header className="receipt-heading mb-3 border-b border-dashed border-border pb-3 text-center">
      {tenant?.logo_url && <img className="receipt-logo mx-auto mb-2 max-h-12 max-w-32 object-contain" src={resolveUploadUrl(tenant.logo_url) ?? undefined} alt={tenant.name} />}
      <h1 className="text-base font-bold">{tenant?.name ?? "Receipt"}</h1>
      {tenant && <p>{[tenant.address, tenant.city, tenant.country].filter(Boolean).join(", ")}</p>}
      {tenant?.phone && <p>{tenant.phone}</p>}{tenant?.website && <p>{tenant.website}</p>}
      <p className="mt-2 font-semibold">Receipt {sale.orderId}</p><p>{fmtDateTime(sale.timestamp)}</p>
      {sale.cashierName && <p>Cashier: {sale.cashierName}</p>}{sale.customerName && <p>Customer: {sale.customerName}</p>}
    </header>
    <table className="w-full table-fixed text-left"><thead><tr><th className="border-b border-border pb-2">Item / quantity × price</th><th className="w-[31%] border-b border-border pb-2 text-right">Amount</th></tr></thead><tbody>{sale.items.map(item => <tr key={item.id}><td className="py-2 pr-2 align-top"><p className="receipt-item-name break-words font-medium">{item.name}</p>{item.variant_attributes && <small className="receipt-meta block text-muted">{Object.entries(item.variant_attributes).map(([key,value]) => `${key}: ${value}`).join(" · ")}</small>}<small className="receipt-meta block text-muted">{item.qty} × {money(item.price)}</small>{item.discount > 0 && <small className="receipt-meta block text-muted">Discount: {money(item.discount)}</small>}</td><td className="py-2 text-right align-top font-medium tabular-nums">{money(item.price * item.qty - item.discount)}</td></tr>)}</tbody></table>
    <section className="receipt-totals mt-3 border-t border-dashed border-border pt-2">
      {row(vatEnabled ? "Subtotal (VAT inclusive)" : "Subtotal", money(sale.subtotal))}
      {sale.discount > 0 && row("Discount", `−${money(sale.discount)}`)}
      {vatEnabled && sale.tax > 0 && row("VAT (18%, included)", money(sale.tax))}
      <div className="receipt-grand mt-2 border-t border-border pt-2 text-base font-bold">{row("Total", money(sale.total))}</div>
      {row("Payment", paymentLabel(sale.payment))}{row("Amount paid", money(sale.amountPaid ?? sale.total))}
      {!!sale.balanceDue && sale.balanceDue > 0 ? <>{row("Balance due", money(sale.balanceDue))}{sale.dueDate && row("Due date", sale.dueDate)}</> : row("Change", money(sale.change))}
    </section>
    <footer className="receipt-footer mt-4 text-center text-xs text-muted">Thank you for your purchase!</footer>
  </article>;
}
