import {
  BadgeCheck, Clock, FileText, AlertCircle, Mail, Phone, MapPin, Globe, CreditCard,
} from "lucide-react";
import { resolveUploadUrl } from "@/lib/api/client";
import { fmtDateTime } from "@/lib/date";
import type { ApiOrder, Tenant } from "@/lib/api";

// The backend's Order.status is stored Title Case ("Pending"/"Completed"/
// "Cancelled") — these keys must match exactly, not just read as labels.
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  Pending:   { label: "Pending",   bg: "bg-amber-100",   text: "text-amber-700",   icon: Clock },
  Completed: { label: "Paid",      bg: "bg-emerald-100", text: "text-emerald-700", icon: BadgeCheck },
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

/** Diagonal stamp overlay for a settled/void invoice — the classic "rubber
 *  stamp" cue that makes a printed invoice read as authoritative at a glance. */
function InvoiceStamp({ status }: { status: string }) {
  if (status !== "Completed" && status !== "Cancelled") return null;
  const paid = status === "Completed";
  return (
    <div
      className="absolute top-6 right-6 border-[3px] rounded-lg px-4 py-1.5 font-extrabold text-[20px] tracking-[0.15em] uppercase select-none pointer-events-none"
      style={{
        color: paid ? "#059669" : "#dc2626",
        borderColor: paid ? "#059669" : "#dc2626",
        transform: "rotate(-10deg)",
        opacity: 0.45,
      }}
    >
      {paid ? "Paid" : "Void"}
    </div>
  );
}

/** The invoice/order document — business branding, bill-to, line items,
 *  totals. Shared by every place an order needs to be shown or printed as an
 *  invoice: Accounting > Invoices, Sales > Orders, and anywhere else that
 *  adds this view later, so branding only has to be built once. */
export function InvoiceDocument({ order, tenant, brandColor, fmt }: { order: ApiOrder; tenant: Tenant | undefined; brandColor: string; fmt: (v: number) => string }) {
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
            <div className="mt-2 flex justify-start"><StatusBadge status={order.status} /></div>
          </div>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col overflow-hidden">
        <InvoiceStamp status={order.status} />

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
                <span>Total Due</span><span className="tabular-nums">{fmt(order.total)}</span>
              </div>
            </div>
          </div>

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
