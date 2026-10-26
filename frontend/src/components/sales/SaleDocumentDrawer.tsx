"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Loader2, Printer } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useCurrentTenant, useOrder } from "@/lib/api/hooks";
import { salesApi, type ApiOrder } from "@/lib/api/sales";
import { fmtMoney } from "@/lib/config";
import { printReceipt, type ReceiptPaper } from "@/lib/pos/printReceipt";
import { orderToSale } from "@/lib/saleDocument";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { InvoiceDocument } from "@/components/accounting/InvoiceDocument";
import { ReceiptDocument } from "@/components/pos/ReceiptDocument";

export type SaleLayout = "invoice" | "receipt";

/** The one place a sale is shown, printed, downloaded or copied. POS, Sales Orders, Accounting, Debts and Customers all use it. */
export function SaleDocumentDrawer({ order, onClose, initialLayout = "invoice", extraActions, onReversePayment }: {
  order: ApiOrder; onClose: () => void; initialLayout?: SaleLayout; extraActions?: ReactNode; onReversePayment?: (paymentId: string) => void;
}) {
  const { currencySymbol, brandColor, vatEnabled } = useAppConfig();
  const { data: tenant } = useCurrentTenant();
  const [layout, setLayout] = useState<SaleLayout>(initialLayout);
  const [paper, setPaper] = useState<ReceiptPaper>("80mm");
  const [busy, setBusy] = useState<"print" | "pdf" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const receipt = useRef<HTMLDivElement>(null);
  const invoice = useRef<HTMLDivElement>(null);
  const sale = orderToSale(order);
  const fmt = (value: number) => fmtMoney(value, currencySymbol);

  async function print() {
    if (busy) return;
    setError("");
    if (layout === "invoice") { window.print(); return; }
    const node = receipt.current?.querySelector<HTMLElement>("[data-pos-receipt]");
    if (!node) return;
    setBusy("print");
    try { await printReceipt(node, paper); } catch { setError("Could not open printing. Please try again."); } finally { setBusy(null); }
  }
  async function pdf() {
    if (busy) return;
    setBusy("pdf"); setError("");
    try { await salesApi.downloadInvoicePdf(order.id, order.order_number); } catch { setError("Could not download the document. Please try again."); } finally { setBusy(null); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText((layout === "invoice" ? invoice : receipt).current?.textContent ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Could not copy. You can print or download it instead."); }
  }
  const invoiceDocument = (interactive: boolean) => <InvoiceDocument order={order} tenant={tenant} brandColor={brandColor} fmt={fmt} onReversePayment={interactive ? onReversePayment : undefined} />;

  return <>
    <Drawer open onClose={onClose} title={layout === "invoice" ? "Invoice" : "Receipt"} description={order.order_number} size="lg"
      footer={<div className="space-y-2">
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Document layout" className="flex rounded-lg border border-border p-0.5 text-xs font-semibold">
            {(["invoice", "receipt"] as const).map(value => <button key={value} type="button" aria-pressed={layout === value} onClick={() => setLayout(value)} className={`rounded-md px-3 py-1.5 ${layout === value ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>{value === "invoice" ? "Invoice (A4)" : "Receipt"}</button>)}
          </div>
          {layout === "receipt" && <label className="flex items-center gap-1.5 text-xs text-muted">Paper<select aria-label="Print paper" value={paper} onChange={e => setPaper(e.target.value as ReceiptPaper)} className="rounded-md border border-border bg-card px-2 py-1.5 text-foreground"><option value="58mm">58 mm</option><option value="80mm">80 mm</option><option value="A4">A4</option></select></label>}
        </div>
        <div className="flex flex-wrap gap-2">
          {extraActions}
          <Button variant="secondary" disabled={!!busy} onClick={() => void pdf()}>{busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}PDF</Button>
          <Button variant="secondary" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</Button>
          <Button disabled={!!busy} onClick={() => void print()}>{busy === "print" ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}Print</Button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>}>
      <div ref={invoice} className={layout === "invoice" ? "" : "hidden"}>{invoiceDocument(true)}</div>
      <div ref={receipt} className={layout === "receipt" ? "p-4" : "hidden"}><div className="mx-auto max-w-sm rounded-lg border border-border"><ReceiptDocument sale={sale} tenant={tenant} currencySymbol={currencySymbol} fmt={n => n.toLocaleString()} vatEnabled={vatEnabled} /></div></div>
    </Drawer>
    {layout === "invoice" && typeof document !== "undefined" && createPortal(<div className="hidden print:block">{invoiceDocument(false)}</div>, document.body)}
  </>;
}

/** Opens the shared document for an order known only by id (POS confirmation, Debts, Customer profile). */
export function SaleDocumentById({ orderId, onClose, initialLayout }: { orderId: string; onClose: () => void; initialLayout?: SaleLayout }) {
  const query = useOrder(orderId);
  if (query.data) return <SaleDocumentDrawer order={query.data} onClose={onClose} initialLayout={initialLayout} />;
  return <Drawer open onClose={onClose} title="Invoice" size="lg"><div className="p-5">{query.error ? <p role="alert" className="text-sm text-red-600">Could not load this document.</p> : <PageLoader variant="compact" />}</div></Drawer>;
}
