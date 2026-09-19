"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck, Clock, FileText, Search, Eye, Printer,
  TrendingUp, AlertCircle, Plus,
  Download, MoreHorizontal, Mail, Phone, MapPin, Globe,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Drawer } from "@/components/ui/Drawer";
import { useAppConfig } from "@/lib/appConfig";
import { useOrders, useCurrentTenant } from "@/lib/api/hooks";
import type { ApiOrder, Tenant } from "@/lib/api";
import { resolveUploadUrl } from "@/lib/api/client";
import { fmtMoney } from "@/lib/config";
import { fmtDateTime } from "@/lib/date";

type StatusFilter = "all" | "pending" | "completed" | "cancelled";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   bg: "bg-amber-100",   text: "text-amber-700",   icon: Clock },
  completed: { label: "Paid",      bg: "bg-emerald-100", text: "text-emerald-700", icon: BadgeCheck },
  cancelled: { label: "Cancelled", bg: "bg-red-100",     text: "text-red-600",     icon: AlertCircle },
  draft:     { label: "Draft",     bg: "bg-slate-100",   text: "text-slate-600",   icon: FileText },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

/** The invoice itself — business branding, bill-to, line items, totals. Rendered
 *  both in the on-screen detail drawer and (via a portal) as the print-only view. */
function InvoiceDocument({ order, tenant, brandColor, fmt }: { order: ApiOrder; tenant: Tenant | undefined; brandColor: string; fmt: (v: number) => string }) {
  const businessLocation = [tenant?.address, tenant?.city, tenant?.country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col h-full">
      {/* Business branding strip */}
      <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: brandColor }} />

      {/* Business header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {tenant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveUploadUrl(tenant.logo_url) ?? undefined}
                alt={tenant.name}
                className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-border"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-extrabold text-lg"
                style={{ backgroundColor: brandColor }}
              >
                {(tenant?.name ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[16px] font-extrabold text-foreground truncate">{tenant?.name ?? "Your Business"}</p>
              <div className="mt-1 space-y-0.5">
                {businessLocation && (
                  <p className="flex items-center gap-1.5 text-[12px] text-muted"><MapPin size={11} className="flex-shrink-0" /> {businessLocation}</p>
                )}
                {tenant?.phone && (
                  <p className="flex items-center gap-1.5 text-[12px] text-muted"><Phone size={11} className="flex-shrink-0" /> {tenant.phone}</p>
                )}
                {tenant?.website && (
                  <p className="flex items-center gap-1.5 text-[12px] text-muted"><Globe size={11} className="flex-shrink-0" /> {tenant.website}</p>
                )}
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: brandColor }}>Invoice</p>
            <p className="text-[18px] font-extrabold text-foreground font-mono mt-0.5">{order.order_number}</p>
            <div className="mt-2"><StatusBadge status={order.status} /></div>
          </div>
        </div>
      </div>

      {/* Bill to / dates */}
      <div className="px-6 py-4 border-b border-border bg-surface/30">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Bill To</p>
            <p className="text-[13px] font-semibold text-foreground">{order.customer?.name ?? "Walk-in customer"}</p>
            {order.customer?.email && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted mt-0.5"><Mail size={11} className="flex-shrink-0" /> {order.customer.email}</p>
            )}
            {order.customer?.phone && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted mt-0.5"><Phone size={11} className="flex-shrink-0" /> {order.customer.phone}</p>
            )}
            {order.customer?.address && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted mt-0.5"><MapPin size={11} className="flex-shrink-0" /> {order.customer.address}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted uppercase tracking-wide mb-1">Date Issued</p>
            <p className="text-[13px] font-semibold text-foreground">
              {fmtDateTime(order.ordered_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-surface/50">
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-muted uppercase tracking-wide">Item</th>
              <th className="px-5 py-2.5 text-center text-[11px] font-semibold text-muted uppercase tracking-wide">Qty</th>
              <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wide">Unit Price</th>
              <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wide">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="px-5 py-3">
                  <p className="text-[13px] font-medium text-foreground">{item.product_name}</p>
                  {item.sku && <p className="text-[11px] text-muted font-mono">{item.sku}</p>}
                </td>
                <td className="px-5 py-3 text-center text-[13px] text-muted">{item.quantity}</td>
                <td className="px-5 py-3 text-right text-[13px] text-muted tabular-nums">{fmt(item.unit_price)}</td>
                <td className="px-5 py-3 text-right text-[13px] font-semibold text-foreground tabular-nums">{fmt(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-border space-y-2 bg-surface/20">
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
          <div className="flex justify-between text-[15px] font-extrabold text-foreground border-t border-border pt-2.5 mt-1">
            <span>Total Due</span><span className="tabular-nums">{fmt(order.total)}</span>
          </div>
        </div>

        {order.notes && (
          <div className="px-5 py-4 border-t border-border">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Notes</p>
            <p className="text-[13px] text-foreground/70">{order.notes}</p>
          </div>
        )}

        <div className="px-5 py-4 border-t border-border text-center">
          <p className="text-[12px] font-semibold text-foreground">Thank you for your business{tenant?.name ? ` — ${tenant.name}` : ""}!</p>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const { data, isLoading } = useOrders(1, 200);
  const { data: tenant } = useCurrentTenant();
  const orders = data?.items ?? [];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewing, setViewing] = useState<ApiOrder | null>(null);

  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const printInvoice = (order: ApiOrder) => {
    setViewing(order);
    // Wait a tick for the drawer (and its printable content) to render before
    // invoking the browser's print dialog.
    window.setTimeout(() => window.print(), 50);
  };

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      o.order_number.toLowerCase().includes(q) ||
      (o.customer?.name ?? "").toLowerCase().includes(q)
    );
  });

  const total = orders.reduce((s, o) => s + o.total, 0);
  const paid = orders.filter((o) => o.status === "completed");
  const pending = orders.filter((o) => o.status === "pending");
  const paidTotal = paid.reduce((s, o) => s + o.total, 0);
  const pendingTotal = pending.reduce((s, o) => s + o.total, 0);

  const stats = [
    { label: "Total Invoiced",  value: fmt(total),        sub: `${orders.length} invoices`,          icon: FileText,         color: "#4f46e5" },
    { label: "Collected",       value: fmt(paidTotal),    sub: `${paid.length} paid`,                icon: BadgeCheck,       color: "#059669" },
    { label: "Outstanding",     value: fmt(pendingTotal), sub: `${pending.length} awaiting payment`, icon: Clock,            color: "#b45309" },
    { label: "Avg. Invoice",    value: fmt(orders.length ? total / orders.length : 0), sub: "per invoice", icon: TrendingUp,  color: "#0284c7" },
  ];

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all",       label: "All",       count: orders.length },
    { key: "pending",   label: "Pending",   count: pending.length },
    { key: "completed", label: "Paid",      count: paid.length },
    { key: "cancelled", label: "Cancelled", count: orders.filter((o) => o.status === "cancelled").length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Invoices</h1>
          <p className="text-sm text-muted mt-0.5">Manage and track all customer invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold border border-border rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface transition-colors">
            <Download size={14} /> Export
          </button>
          <button
            className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold text-white rounded-lg transition-colors"
            style={{ backgroundColor: brandColor }}
          >
            <Plus size={14} /> New Invoice
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-semibold text-muted uppercase tracking-wide">{s.label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                <s.icon size={15} style={{ color: s.color }} />
              </div>
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 text-[13px] font-semibold transition-colors rounded-lg ${
                statusFilter === t.key ? "text-white" : "text-foreground/50 hover:text-foreground"
              }`}
              style={statusFilter === t.key ? { backgroundColor: brandColor } : undefined}
            >
              {t.label}
              {t.count > 0 && <span className="ml-1.5 opacity-60">({t.count})</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 w-60">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice or customer..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <PageLoader variant="compact" />
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-16 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${brandColor}15` }}>
            <FileText size={20} style={{ color: brandColor }} />
          </div>
          <p className="text-sm font-semibold text-foreground">No invoices found</p>
          <p className="text-[13px] text-muted">Try adjusting your filters or create a new invoice.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted uppercase tracking-wide">Invoice</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted uppercase tracking-wide">Items</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-surface/40 transition-colors group">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <FileText size={13} className="text-accent" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-foreground font-mono">{o.order_number}</p>
                        <p className="text-[11px] text-muted">Order</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-[13px] font-semibold text-foreground">{o.customer?.name ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-muted whitespace-nowrap">
                    {fmtDateTime(o.ordered_at)}
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-muted">
                    {o.items.length} {o.items.length === 1 ? "item" : "items"}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[14px] font-bold text-foreground tabular-nums">{fmt(o.total)}</p>
                    {o.discount > 0 && <p className="text-[11px] text-muted">-{fmt(o.discount)} disc.</p>}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewing(o)}
                        title="View"
                        className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-muted hover:text-foreground hover:border-accent/40 transition-colors"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => printInvoice(o)}
                        title="Print"
                        className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-muted hover:text-foreground transition-colors"
                      >
                        <Printer size={13} />
                      </button>
                      <button
                        title="More"
                        className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-muted hover:text-foreground transition-colors"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <p className="text-[12px] text-muted">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</p>
            <p className="text-[12px] font-semibold text-foreground">
              Total: <span className="font-bold">{fmt(filtered.reduce((s, o) => s + o.total, 0))}</span>
            </p>
          </div>
        </div>
      )}

      {/* Invoice Detail Drawer */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Invoice Detail"
        description={viewing ? `${viewing.order_number}` : undefined}
        side="right"
        size="lg"
        footer={
          viewing && (
            <div className="flex gap-2">
              {viewing.status === "pending" && (
                <button className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 text-[13px] font-bold hover:bg-emerald-700 transition-colors rounded-lg">
                  <BadgeCheck size={15} /> Mark as Paid
                </button>
              )}
              <button onClick={() => window.print()} className="flex items-center justify-center gap-2 text-white px-4 py-2.5 text-[13px] font-bold transition-colors rounded-lg" style={{ backgroundColor: brandColor }}>
                <Printer size={15} /> Print
              </button>
              <button onClick={() => setViewing(null)} className="px-4 py-2.5 text-[13px] font-semibold border border-border rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface transition-colors">
                Close
              </button>
            </div>
          )
        }
      >
        {viewing && <InvoiceDocument order={viewing} tenant={tenant} brandColor={brandColor} fmt={fmt} />}
      </Drawer>

      {/* Print-only view: portaled out of the app shell (which is hidden via
          print:hidden) so printing shows just the invoice, nothing else. */}
      {viewing && typeof document !== "undefined" && createPortal(
        <div className="hidden print:block">
          <InvoiceDocument order={viewing} tenant={tenant} brandColor={brandColor} fmt={fmt} />
        </div>,
        document.body,
      )}
    </div>
  );
}
