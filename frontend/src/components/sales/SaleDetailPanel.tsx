"use client";

import { X } from "lucide-react";
import type { ApiOrder } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { RowMenu, type MenuItem } from "@/components/branches/parts";
import { fmtDateTime } from "@/lib/date";

/** One label and badge style for a sale's state in the list and the panel: sale status first, then payment. */
export function saleState(o: ApiOrder): { label: string; tone: "success" | "warning" | "error" | "neutral" } {
  if (o.status === "Cancelled") return { label: "Voided", tone: "neutral" };
  if (o.status === "Rejected") return { label: "Rejected", tone: "error" };
  if (o.status === "Awaiting Approval") return { label: "Pending approval", tone: "warning" };
  if (o.status === "Pending") return { label: "Pending", tone: "warning" };
  if (o.is_overdue) return { label: "Overdue", tone: "error" };
  if (o.payment_status === "Paid") return { label: "Paid", tone: "success" };
  if (o.payment_status === "PartiallyPaid") return { label: "Partly paid", tone: "warning" };
  return { label: "Unpaid", tone: "error" };
}

export function SaleStateBadge({ order }: { order: ApiOrder }) {
  const s = saleState(order);
  return <span className={`pesaa-badge pesaa-badge-${s.tone}`}>{s.label}</span>;
}

const METHOD: Record<string, string> = { cash: "Cash", mobile: "Mobile money", momo: "Mobile money", mobile_money: "Mobile money", card: "Card", bank: "Bank transfer", credit: "On credit", split: "Split" };
/** How a sale was paid, in words ("On credit" when nothing was paid yet on a completed sale). */
export function paidWith(o: ApiOrder): string {
  const methods = new Set((o.payments ?? []).filter((p) => p.status !== "Reversed").map((p) => (p.payment_method ?? "").toLowerCase()).filter(Boolean));
  if (methods.size > 1) return "Split";
  const one = [...methods][0] ?? (o.payment_method ?? "").toLowerCase();
  if (o.status === "Completed" && Number(o.amount_paid) <= 0) return "On credit";
  return METHOD[one] ?? (one ? one.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—");
}

const daysLate = (due: string) => Math.max(0, Math.floor((Date.now() - new Date(`${due}T00:00:00`).getTime()) / 86_400_000));

/** The selected sale beside the list: what was sold, what is owed, and what to do next. Every action is the existing one. */
export function SaleDetailPanel({ order, branchName, fmt, onClose, onRecordPayment, onOpenInvoice, onSend, more }: {
  order: ApiOrder; branchName?: string | null; fmt: (n: number) => string; onClose: () => void;
  onRecordPayment?: () => void; onOpenInvoice: () => void; onSend: () => void; more: MenuItem[];
}) {
  const o = order;
  const owed = o.status === "Completed" ? Number(o.outstanding_balance) : 0;
  const credit = o.status === "Completed" && o.due_date && owed > 0;
  return (
    <section aria-label={`Sale ${o.order_number}`} className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-muted">{o.order_number}</p>
          <h2 className="mt-0.5 truncate text-base font-semibold text-foreground">{o.customer?.name ?? "Walk-in customer"}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SaleStateBadge order={o} />
            {o.is_overdue && o.due_date && <span className="pesaa-badge pesaa-badge-error">Overdue {daysLate(o.due_date)} day{daysLate(o.due_date) === 1 ? "" : "s"}</span>}
            {credit && <span className="pesaa-badge pesaa-badge-neutral">On credit · due {new Date(`${o.due_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close sale details" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><X size={16} /></button>
      </header>
      <div className="space-y-4 px-4 py-4 text-sm">
        <ul className="space-y-2">
          {o.items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words">{i.product_name}{i.quantity !== 1 && <span className="text-muted"> × {i.quantity}</span>}</span>
              <span className="shrink-0 tabular-nums">{fmt(Number(i.line_total))}</span>
            </li>
          ))}
          {Number(o.discount) > 0 && <li className="flex justify-between gap-3 text-muted"><span>Discount</span><span className="tabular-nums">− {fmt(Number(o.discount))}</span></li>}
        </ul>
        <dl className="space-y-1.5 border-t border-border pt-3">
          <div className="flex justify-between gap-3 font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmt(Number(o.total))}</dd></div>
          {Number(o.tax) > 0 && <div className="flex justify-between gap-3 text-xs text-muted"><dt>VAT included</dt><dd className="tabular-nums">{fmt(Number(o.tax))}</dd></div>}
          {o.status === "Completed" && <div className="flex justify-between gap-3 text-muted"><dt>Paid</dt><dd className="tabular-nums">{fmt(Number(o.amount_paid))}</dd></div>}
          {owed > 0 && <div className="flex justify-between gap-3 font-semibold text-destructive"><dt>Balance due</dt><dd className="tabular-nums">{fmt(owed)}</dd></div>}
        </dl>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs">
          <dt className="text-muted">Sold by</dt><dd className="truncate text-right">{o.salesperson_name ?? "Not recorded"}</dd>
          <dt className="text-muted">Branch</dt><dd className="truncate text-right">{branchName ?? "—"}</dd>
          <dt className="text-muted">Date</dt><dd className="text-right">{fmtDateTime(o.ordered_at)}</dd>
          <dt className="text-muted">Paid with</dt><dd className="text-right">{paidWith(o)}</dd>
        </dl>
      </div>
      <footer className="mt-auto space-y-2 border-t border-border px-4 py-3">
        {onRecordPayment && <Button className="w-full" onClick={onRecordPayment}>Record payment</Button>}
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={onOpenInvoice}>Invoice</Button>
          <Button variant="outline" className="flex-1" onClick={onSend}>Send</Button>
          {more.length > 0 && <RowMenu label={`More actions for ${o.order_number}`} items={more} />}
        </div>
      </footer>
    </section>
  );
}
