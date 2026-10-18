"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBilling } from "@/lib/billing/store";
import { formatMoney } from "@/lib/billing/money";
import { Badge, EmptyState, fmtDate, Notice } from "@/components/billing/ui";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useBilling();
  const inv = state!.invoices.find((i) => i.id === id);
  if (!inv) return <EmptyState title="Invoice not found" action={<Link href="/invoices" className="text-accent underline">Back to invoices</Link>} />;
  const c = inv.currency;
  const pays = state!.payments.filter((p) => p.invoiceId === inv.id);
  // The invoice header uses today's billing settings only for the "from" line; every amount comes from the frozen invoice.
  const from = state!.settings.billingEmail;

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden !important; } .print-area, .print-area * { visibility: visible !important; } .print-area { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/invoices" className="flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-foreground"><ArrowLeft size={13} /> Invoices</Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          <Button variant="outline" onClick={() => window.print()} title="Choose “Save as PDF” in the print dialog"><Download size={14} /> Download PDF</Button>
        </div>
      </div>
      <Notice tone="blue">Demo invoice. “Download PDF” opens the print dialog — choose “Save as PDF”. The billing API will generate official PDFs.</Notice>

      <article className="print-area mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-5 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-extrabold">Invoice {inv.number}</h1><p className="text-[12px] text-muted">From {from}</p></div>
          <Badge value={inv.status} />
        </header>
        <div className="grid gap-4 text-[13px] sm:grid-cols-3">
          <div><p className="text-[11px] uppercase tracking-wider text-muted">Billed to</p><p className="font-semibold">{inv.tenantName}</p></div>
          <div><p className="text-[11px] uppercase tracking-wider text-muted">Issued / due</p><p className="font-semibold">{fmtDate(inv.issuedAt)} / {fmtDate(inv.dueAt)}</p></div>
          <div><p className="text-[11px] uppercase tracking-wider text-muted">Period</p><p className="font-semibold">{fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</p></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-[13px]">
          <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted"><th className="py-2 font-semibold">Description</th><th className="py-2 text-right font-semibold">Qty</th><th className="py-2 text-right font-semibold">Unit</th><th className="py-2 text-right font-semibold">Amount</th></tr></thead>
          <tbody className="divide-y divide-border">{inv.lines.map((l) => <tr key={l.id}><td className="py-2">{l.description}</td><td className="py-2 text-right">{l.quantity}</td><td className="py-2 text-right">{formatMoney(l.unitAmount, c)}</td><td className="py-2 text-right font-semibold">{formatMoney(l.amount, c)}</td></tr>)}</tbody>
        </table></div>
        <dl className="ml-auto w-full max-w-xs space-y-1 text-[13px]">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(inv.subtotal, c)}</dd></div>
          {inv.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount{inv.couponCode ? ` (${inv.couponCode})` : ""}</dt><dd>−{formatMoney(inv.discount, c)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">{state!.settings.taxLabel} ({(inv.taxRateBps / 100).toFixed(2)}%)</dt><dd>{formatMoney(inv.tax, c)}</dd></div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-extrabold"><dt>Total</dt><dd>{formatMoney(inv.total, c)} {c}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{formatMoney(inv.paid, c)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Outstanding</dt><dd>{formatMoney(inv.status === "void" ? 0 : inv.total - inv.paid, c)}</dd></div>
        </dl>
      </article>

      <section className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">Payment history</h2>
        {pays.length === 0 ? <p className="mt-2 text-[12.5px] text-muted">No payments recorded for this invoice.</p> : (
          <ul className="mt-2 divide-y divide-border">{pays.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]"><span>{fmtDate(p.createdAt)} · {p.method}</span><span className="flex items-center gap-2 font-semibold">{formatMoney(p.amount, p.currency)} <Badge value={p.status} /></span></li>)}</ul>
        )}
      </section>
    </div>
  );
}
