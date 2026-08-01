"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck, Clock, FileText, Search, Eye, Printer,
  CircleDollarSign, TrendingUp, AlertCircle, Plus,
  Download, MoreHorizontal, ChevronDown,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { useAppConfig } from "@/lib/appConfig";
import { salesApi, type ApiOrder } from "@/lib/api/sales";
import { fmtMoney } from "@/lib/config";

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

export default function InvoicesPage() {
  const { currencySymbol } = useAppConfig();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewing, setViewing] = useState<ApiOrder | null>(null);

  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  useEffect(() => {
    salesApi.listOrders(1, 200).then((r) => {
      setOrders(r.data.items);
    }).finally(() => setLoading(false));
  }, []);

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
            style={{ backgroundColor: "#b45309" }}
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
              style={statusFilter === t.key ? { backgroundColor: "#b45309" } : undefined}
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
      {loading ? (
        <div className="bg-card border border-border rounded-xl p-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-16 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#b4530915" }}>
            <FileText size={20} style={{ color: "#b45309" }} />
          </div>
          <p className="text-sm font-semibold text-foreground">No invoices found</p>
          <p className="text-[13px] text-muted">Try adjusting your filters or create a new invoice.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
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
                    {o.ordered_at ? new Date(o.ordered_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
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
          </table>
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
              <button className="flex items-center justify-center gap-2 text-white px-4 py-2.5 text-[13px] font-bold transition-colors rounded-lg" style={{ backgroundColor: "#b45309" }}>
                <Printer size={15} /> Print
              </button>
              <button onClick={() => setViewing(null)} className="px-4 py-2.5 text-[13px] font-semibold border border-border rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface transition-colors">
                Close
              </button>
            </div>
          )
        }
      >
        {viewing && (
          <div className="flex flex-col h-full">
            {/* Invoice header */}
            <div className="p-6 border-b border-border bg-surface/30">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Invoice Number</p>
                  <p className="text-[20px] font-extrabold text-foreground font-mono">{viewing.order_number}</p>
                </div>
                <StatusBadge status={viewing.status} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-muted uppercase tracking-wide mb-1">Bill To</p>
                  <p className="text-[13px] font-semibold text-foreground">{viewing.customer?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted uppercase tracking-wide mb-1">Date Issued</p>
                  <p className="text-[13px] font-semibold text-foreground">
                    {viewing.ordered_at ? new Date(viewing.ordered_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface/50">
                    <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-muted uppercase tracking-wide">Item</th>
                    <th className="px-5 py-2.5 text-center text-[11px] font-semibold text-muted uppercase tracking-wide">Qty</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wide">Unit Price</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-muted uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {viewing.items.map((item) => (
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
              </table>

              {/* Totals */}
              <div className="px-5 py-4 border-t border-border space-y-2 bg-surface/20">
                <div className="flex justify-between text-[13px] text-muted">
                  <span>Subtotal</span><span className="tabular-nums">{fmt(viewing.subtotal)}</span>
                </div>
                {viewing.discount > 0 && (
                  <div className="flex justify-between text-[13px] text-emerald-600">
                    <span>Discount</span><span className="tabular-nums">-{fmt(viewing.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[13px] text-muted">
                  <span>Tax</span><span className="tabular-nums">{fmt(viewing.tax)}</span>
                </div>
                <div className="flex justify-between text-[15px] font-extrabold text-foreground border-t border-border pt-2.5 mt-1">
                  <span>Total Due</span><span className="tabular-nums">{fmt(viewing.total)}</span>
                </div>
              </div>

              {viewing.notes && (
                <div className="px-5 py-4 border-t border-border">
                  <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-[13px] text-foreground/70">{viewing.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
