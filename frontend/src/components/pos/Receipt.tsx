"use client";
import { Check, Copy, Download, Eye, Loader2, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fmtDateTime } from "@/lib/date";
import { salesApi } from "@/lib/api/sales";
import { printReceipt, type ReceiptPaper } from "@/lib/pos/printReceipt";
import type { Tenant } from "@/lib/api";
import type { SaleResult } from "./types";
import { ReceiptDocument, paymentLabel } from "./ReceiptDocument";
import { SaleDocumentById } from "@/components/sales/SaleDocumentDrawer";

interface ReceiptProps { sale: SaleResult; currencySymbol: string; fmt: (value: number) => string; vatEnabled: boolean; onNewSale: () => void; onClose?: () => void; tenant?: Tenant; }
export function Receipt({ sale, currencySymbol, fmt, vatEnabled, onNewSale, onClose, tenant }: ReceiptProps) {
  const receipt = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(false);
  const [paper, setPaper] = useState<ReceiptPaper>("80mm");
  const [busy, setBusy] = useState<"print" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const handlePrint = async () => {
    const document = receipt.current?.querySelector<HTMLElement>("[data-pos-receipt]");
    if (!document || busy) return;
    setBusy("print"); setError("");
    try { await printReceipt(document, paper); } catch { setError("Could not open receipt printing. Please try again."); } finally { setBusy(null); }
  };
  const handlePdf = async () => {
    if (!sale.backendOrderId || busy) return;
    setBusy("pdf"); setError("");
    try { await salesApi.downloadInvoicePdf(sale.backendOrderId, sale.orderId); } catch { setError("Could not download the receipt document. Please try again."); } finally { setBusy(null); }
  };
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(receipt.current?.textContent ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Could not copy the receipt. You can print or download it instead."); }
  };
  return <div data-pos-confirmation className="bg-card p-5">
    {!view ? <><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-accent"><Check size={23} /></div><h2 className="text-lg font-semibold text-foreground">{sale.balanceDue ? "Sale completed" : "Payment received"}</h2><p className="mt-1 text-xs text-muted">{sale.orderId} · {fmtDateTime(sale.timestamp)}</p><dl className="my-5 space-y-2 rounded-lg border border-border p-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted">Total amount</dt><dd className="font-semibold tabular-nums text-foreground">{currencySymbol} {fmt(sale.total)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Payment method</dt><dd className="font-medium text-foreground">{paymentLabel(sale.payment)}</dd></div>{!!sale.balanceDue && <div className="flex justify-between gap-3"><dt className="text-muted">Outstanding</dt><dd className="font-medium tabular-nums text-foreground">{currencySymbol} {fmt(sale.balanceDue)}</dd></div>}</dl></> : <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Transaction receipt</h2><Button size="sm" variant="ghost" onClick={() => setView(false)}>Back</Button></div>}
    <div ref={receipt} className={view ? "mb-4 max-h-[50dvh] overflow-y-auto rounded-lg border border-border" : "hidden"} aria-hidden={!view}><ReceiptDocument sale={sale} tenant={tenant} currencySymbol={currencySymbol} fmt={fmt} vatEnabled={vatEnabled} /></div>
    <div className="mb-3 flex items-center justify-between gap-3 text-xs"><label htmlFor="receipt-paper" className="text-muted">Print paper</label><select id="receipt-paper" value={paper} onChange={event => setPaper(event.target.value as ReceiptPaper)} className="h-8 rounded-lg border border-border bg-card px-2 text-foreground"><option value="58mm">58mm thermal</option><option value="80mm">80mm thermal</option><option value="A4">A4</option></select></div>
    {error && <p role="alert" className="mb-3 text-xs text-red-600">{error}</p>}
    <Button onClick={onNewSale} className="w-full">New Sale</Button>
    <div className="mt-2 grid grid-cols-2 gap-2"><Button variant="secondary" disabled={!!busy} onClick={handlePrint}>{busy === "print" ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}Print Receipt</Button><Button variant="secondary" disabled={!!busy || !sale.backendOrderId} onClick={handlePdf}>{busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Download PDF</Button></div>
    <div className="mt-2 flex justify-between gap-2"><Button size="sm" variant="ghost" onClick={() => setView(value => !value)}><Eye size={14} />{view ? "Hide Receipt" : "View Receipt"}</Button>{sale.backendOrderId && <Button size="sm" variant="ghost" onClick={() => setInvoice(true)}><Eye size={14} />Invoice</Button>}<Button size="sm" variant="ghost" onClick={handleCopy}><Copy size={14} />{copied ? "Copied" : "Copy"}</Button>{onClose && <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}</div>
  {invoice && sale.backendOrderId && <SaleDocumentById orderId={sale.backendOrderId} onClose={() => setInvoice(false)} />}</div>;
}
