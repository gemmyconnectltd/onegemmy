import {
  BadgeCheck, Clock, FileText, AlertCircle, Mail, Phone, MapPin, Globe, CreditCard, CalendarClock,
} from "lucide-react";
import { resolveUploadUrl } from "@/lib/api/client";
import { fmtDateTime } from "@/lib/date";
import type { ApiOrder, Tenant } from "@/lib/api";

// The backend's Order.status is stored Title Case ("Pending"/"Completed"/
// "Cancelled") — these keys must match exactly, not just read as labels.
// This is the order's FULFILLMENT state — whether the sale itself went
// through — deliberately distinct from payment_status (below), which is
// whether the customer has actually paid for it. A Completed order can
// still be Unpaid (a credit sale) or PartiallyPaid.
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  Pending:   { label: "Pending",   bg: "bg-amber-100",   text: "text-amber-700",   icon: Clock },
  Completed: { label: "Completed", bg: "bg-emerald-100", text: "text-emerald-700", icon: BadgeCheck },
  Cancelled: { label: "Cancelled", bg: "bg-red-100",     text: "text-red-600",     icon: AlertCircle },
  Draft:     { label: "Draft",     bg: "bg-slate-100",   text: "text-slate-600",   icon: FileText },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  Paid:           { label: "Paid",           bg: "bg-emerald-100", text: "text-emerald-700", icon: BadgeCheck },
  PartiallyPaid:  { label: "Partially Paid", bg: "bg-amber-100",   text: "text-amber-700",   icon: Clock },
  Unpaid:         { label: "Unpaid",         bg: "bg-red-100",     text: "text-red-600",     icon: AlertCircle },
};

export function PaymentStatusBadge({ paymentStatus, isOverdue }: { paymentStatus: string; isOverdue?: boolean }) {
  const cfg = PAYMENT_STATUS_CONFIG[paymentStatus] ?? PAYMENT_STATUS_CONFIG.Unpaid;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
        <Icon size={11} /> {cfg.label}
      </span>
      {isOverdue && (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-red-100 text-red-600">
          <CalendarClock size={11} /> Overdue
        </span>
      )}
    </span>
  );
}

/** Diagonal stamp overlay — "Paid" is keyed off payment_status (has the
 *  money actually come in), not the order's fulfillment status, so a
 *  Completed-but-unpaid credit sale is never mis-stamped. "Void" still
 *  reflects fulfillment status: the sale itself was cancelled. */
function InvoiceStamp({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  if (status === "Cancelled") {
    return (
      <div className="absolute top-6 right-6 border-[3px] rounded-lg px-4 py-1.5 font-extrabold text-[20px] tracking-[0.15em] uppercase select-none pointer-events-none"
        style={{ color: "#dc2626", borderColor: "#dc2626", transform: "rotate(-10deg)", opacity: 0.45 }}>
        Void
      </div>
    );
  }
  if (paymentStatus !== "Paid") return null;
  return (
    <div className="absolute top-6 right-6 border-[3px] rounded-lg px-4 py-1.5 font-extrabold text-[20px] tracking-[0.15em] uppercase select-none pointer-events-none"
      style={{ color: "#059669", borderColor: "#059669", transform: "rotate(-10deg)", opacity: 0.45 }}>
      Paid
    </div>
  );
}

/** The invoice/order document — business branding, bill-to, line items,
 *  totals. Shared by every place an order needs to be shown or printed as an
 *  invoice: Accounting > Invoices, Sales > Orders, and anywhere else that
 *  adds this view later, so branding only has to be built once. */
export function InvoiceDocument({ order, tenant, brandColor, fmt, onReversePayment }: {
  order: ApiOrder; tenant: Tenant | undefined; brandColor: string; fmt: (v: number) => string;
  /** Optional — only the interactive on-screen instance should pass this,
   * not the print portal's. Rendered inside a `print:hidden` wrapper either
   * way, so a printed invoice never shows an action button regardless. */
  onReversePayment?: (paymentId: string) => void;
}) {
  const businessLocation = [tenant?.address, tenant?.city, tenant?.country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Branded header — the tenant's color and logo, full-bleed */}
      <div className="relative overflow-hidden px-7 py-7 flex-shrink-0" style={{ backgroundColor: brandColor }}>
        {/* Soft decorative circle, purely visual */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {tenant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveUploadUrl(tenant.logo_url) ?? undefined}
                alt={tenant.name}
                className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border-2 border-white/40 bg-white"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/15 border-2 border-white/40 text-white font-extrabold text-2xl">
                {(tenant?.name ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[19px] font-extrabold text-white leading-tight truncate">{tenant?.name ?? "Your Business"}</p>
              <div className="mt-1.5 space-y-0.5">
                {businessLocation && (
                  <p className="flex items-center gap-1.5 text-[12px] text-white/80"><MapPin size={11} className="flex-shrink-0" /> {businessLocation}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {tenant?.phone && (
                    <p className="flex items-center gap-1.5 text-[12px] text-white/80"><Phone size={11} className="flex-shrink-0" /> {tenant.phone}</p>
                  )}
                  {tenant?.website && (
                    <p className="flex items-center gap-1.5 text-[12px] text-white/80"><Globe size={11} className="flex-shrink-0" /> {tenant.website}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/70">Invoice</p>
            <p className="text-[22px] font-extrabold text-white font-mono mt-0.5 leading-tight">{order.order_number}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={order.status} />
              {order.status === "Completed" && <PaymentStatusBadge paymentStatus={order.payment_status} isOverdue={order.is_overdue} />}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col overflow-hidden">
        <InvoiceStamp status={order.status} paymentStatus={order.payment_status} />

        {/* Bill to / dates */}
        <div className="px-7 py-5 border-b border-border">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: brandColor }}>Bill To</p>
              <p className="text-[14px] font-bold text-foreground">{order.customer?.name ?? "Walk-in customer"}</p>
              {order.customer?.email && (
                <p className="flex items-center gap-1.5 text-[12px] text-muted mt-1"><Mail size={11} className="flex-shrink-0" /> {order.customer.email}</p>
              )}
              {order.customer?.phone && (
                <p className="flex items-center gap-1.5 text-[12px] text-muted mt-0.5"><Phone size={11} className="flex-shrink-0" /> {order.customer.phone}</p>
              )}
              {order.customer?.address && (
                <p className="flex items-center gap-1.5 text-[12px] text-muted mt-0.5"><MapPin size={11} className="flex-shrink-0" /> {order.customer.address}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] text-muted uppercase tracking-wide mb-1.5">Date Issued</p>
              <p className="text-[13px] font-semibold text-foreground">{fmtDateTime(order.ordered_at)}</p>
              {order.payment_method && (
                <p className="flex items-center justify-start gap-1.5 text-[12px] text-muted mt-2">
                  <CreditCard size={11} className="flex-shrink-0" /> {order.payment_method}
                </p>
              )}
              {order.due_date && order.outstanding_balance > 0 && (
                <p className="flex items-center justify-start gap-1.5 text-[12px] text-muted mt-1">
                  <CalendarClock size={11} className="flex-shrink-0" /> Due {new Date(order.due_date).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr style={{ backgroundColor: `${brandColor}12` }}>
                <th className="px-7 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>Item</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>Qty</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>Unit Price</th>
                <th className="px-7 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: brandColor }}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-7 py-3">
                    <p className="text-[13px] font-medium text-foreground">{item.product_name}</p>
                    {item.sku && <p className="text-[11px] text-muted font-mono">{item.sku}</p>}
                  </td>
                  <td className="px-5 py-3 text-left text-[13px] text-muted">{item.quantity}</td>
                  <td className="px-5 py-3 text-left text-[13px] text-muted tabular-nums">{fmt(item.unit_price)}</td>
                  <td className="px-7 py-3 text-left text-[13px] font-semibold text-foreground tabular-nums">{fmt(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="px-7 py-5 flex justify-start">
            <div className="w-full max-w-[280px] space-y-2">
              <div className="flex justify-between text-[13px] text-muted">
                <span>Subtotal</span><span className="tabular-nums">{fmt(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-[13px] text-emerald-600">
                  <span>Discount</span><span className="tabular-nums">-{fmt(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[13px] text-muted">
                <span>Tax</span><span className="tabular-nums">{fmt(order.tax)}</span>
              </div>
              <div
                className="flex justify-between items-center text-[15px] font-extrabold rounded-lg px-3.5 py-2.5 mt-2"
                style={{ backgroundColor: `${brandColor}14`, color: brandColor }}
              >
                <span>Total</span><span className="tabular-nums">{fmt(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Payment summary — deliberately separate from the sale-value
              totals above: this is money actually received vs. what's
              still outstanding, not another way of stating the total. */}
          {order.status === "Completed" && (
            <div className="px-7 pb-5">
              <div className="w-full max-w-[280px] ml-auto space-y-2 border border-border rounded-lg p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1">Payment Summary</p>
                <div className="flex justify-between text-[13px] text-muted">
                  <span>Total Paid</span><span className="tabular-nums font-semibold text-foreground">{fmt(order.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-[13px] text-muted">
                  <span>Outstanding</span>
                  <span className={`tabular-nums font-semibold ${order.outstanding_balance > 0 ? "text-amber-600" : "text-foreground"}`}>{fmt(order.outstanding_balance)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-border">
                  <span className="text-[12px] font-bold text-foreground">Status</span>
                  <PaymentStatusBadge paymentStatus={order.payment_status} isOverdue={order.is_overdue} />
                </div>
              </div>
            </div>
          )}

          {/* Payment history */}
          {order.payments.length > 0 && (
            <div className="px-7 pb-6 border-t border-border pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Payment History</p>
              <div className="space-y-2">
                {order.payments.map((p) => (
                  <div key={p.id} className={`flex items-center justify-between gap-3 text-[12px] rounded-lg px-3 py-2 ${p.status === "Reversed" ? "bg-red-50" : "bg-surface"}`}>
                    <div className="min-w-0">
                      <p className={`font-semibold ${p.status === "Reversed" ? "text-red-500 line-through" : "text-foreground"}`}>{fmtDateTime(p.paid_at)}</p>
                      <p className="text-muted">
                        {p.payment_method ?? "—"}{p.reference_number ? ` · Ref: ${p.reference_number}` : ""}{p.received_by_name ? ` · ${p.received_by_name}` : ""}
                      </p>
                      {p.status === "Reversed" && <p className="text-red-500">Reversed{p.reversal_reason ? `: ${p.reversal_reason}` : ""}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`font-bold tabular-nums ${p.status === "Reversed" ? "text-red-400 line-through" : "text-foreground"}`}>{fmt(p.amount)}</span>
                      {p.status === "Completed" && onReversePayment && (
                        <button
                          type="button"
                          onClick={() => onReversePayment(p.id)}
                          className="print:hidden text-[11px] font-semibold text-red-500 hover:underline"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.notes && (
            <div className="px-7 py-4 border-t border-border">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Notes</p>
              <p className="text-[13px] text-foreground/70">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Branded footer */}
        <div className="flex-shrink-0 border-t border-border">
          <div className="h-1" style={{ backgroundColor: brandColor }} />
          <div className="px-7 py-4 text-left">
            <p className="text-[12px] font-bold text-foreground">Thank you for your business{tenant?.name ? ` — ${tenant.name}` : ""}!</p>
            {(tenant?.website || tenant?.phone) && (
              <p className="text-[11px] text-muted mt-1">
                {[tenant?.website, tenant?.phone].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
