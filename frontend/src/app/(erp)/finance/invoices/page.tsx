"use client";

import { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, CircleDollarSign, Clock, Eye, FileText, Printer,
  Search, ShoppingCart, Trash2,
} from "lucide-react";

import { IconBadge, getBusinessIcon } from "@/components/pos/icons";
import { Receipt } from "@/components/pos/Receipt";
import type { SaleResult } from "@/components/pos/types";
import { useAppConfig } from "@/lib/appConfig";
import {
  deleteSale, getSalesSnapshot, markInvoicePaid, subscribeSales,
} from "@/lib/invoices";

const EMPTY_SALES: SaleResult[] = [];

type Tab = "invoices" | "outstanding" | "paid" | "all";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile: "Mobile Money",
  card: "Card",
  invoice: "Invoice",
};

export default function InvoicesPage() {
  const { currencySymbol } = useAppConfig();
  const sales = useSyncExternalStore(subscribeSales, getSalesSnapshot, () => EMPTY_SALES);

  const [tab, setTab] = useState<Tab>("invoices");
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<SaleResult | null>(null);
  const [printSale, setPrintSale] = useState<SaleResult | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fmt = (v: number) => `${currencySymbol} ${v.toLocaleString()}`;

  const invoices = sales.filter((s) => s.isInvoice);
  const outstanding = invoices.filter((s) => !s.paid);
  const paid = invoices.filter((s) => s.paid);

  const invoicedTotal = invoices.reduce((s, i) => s + i.total, 0);
  const outstandingTotal = outstanding.reduce((s, i) => s + i.total, 0);
  const paidTotal = paid.reduce((s, i) => s + i.total, 0);
  const revenueTotal = sales.reduce((s, x) => s + x.total, 0);

  const filtered = (
    tab === "invoices" ? invoices
    : tab === "outstanding" ? outstanding
    : tab === "paid" ? paid
    : sales
  ).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const ref = (s.invoiceNumber ?? s.orderId).toLowerCase();
    return ref.includes(q) || s.customerName.toLowerCase().includes(q);
  });

  if (printSale) {
    return (
      <Receipt
        sale={printSale}
        currencySymbol={currencySymbol}
        fmt={fmt}
        newSaleLabel="Back to Invoices"
        onNewSale={() => setPrintSale(null)}
      />
    );
  }

  const stats = [
    { label: "Invoiced", value: fmt(invoicedTotal), sub: `${invoices.length} invoices`, icon: FileText, color: "#4f46e5" },
    { label: "Outstanding", value: fmt(outstandingTotal), sub: `${outstanding.length} awaiting payment`, icon: Clock, color: "#b45309" },
    { label: "Paid", value: fmt(paidTotal), sub: `${paid.length} settled`, icon: BadgeCheck, color: "#059669" },
    { label: "Total sales", value: fmt(revenueTotal), sub: `${sales.length} transactions`, icon: CircleDollarSign, color: "#6f1a07" },
  ];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "invoices", label: "Invoices", count: invoices.length },
    { key: "outstanding", label: "Outstanding", count: outstanding.length },
    { key: "paid", label: "Paid", count: paid.length },
    { key: "all", label: "All sales", count: sales.length },
  ];

  const handleMarkPaid = (id: string) => {
    markInvoicePaid(id);
    setViewing((v) => (v && v.invoiceNumber === id ? { ...v, paid: true, paidAt: new Date().toISOString() } : v));
  };

  const handleDelete = (id: string) => {
    deleteSale(id);
    setConfirmDeleteId(null);
    if (viewing && (viewing.invoiceNumber === id || viewing.orderId === id)) setViewing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted mt-1">
            Sales issued at the POS appear here automatically.
          </p>
        </div>
        <Link
          href="/pos"
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <ShoppingCart size={16} /> Open POS
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border-y border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${s.color}15` }}>
                <s.icon size={15} style={{ color: s.color }} />
              </div>
              <p className="text-[11px] text-muted font-medium">{s.label}</p>
            </div>
            <p className="text-xl font-extrabold text-foreground mt-2">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                tab === t.key ? "bg-accent text-white" : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref or customer..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border p-12 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 flex items-center justify-center bg-accent/10 rounded-full">
            <FileText size={20} className="text-accent" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {sales.length === 0 ? "No sales yet" : "Nothing matches your filters"}
          </p>
          <p className="text-[13px] text-muted max-w-sm">
            {sales.length === 0
              ? "Ring up a sale at the POS and choose the Invoice payment method to issue your first invoice."
              : "Try a different search term or filter."}
          </p>
          {sales.length === 0 && (
            <Link href="/pos" className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium mt-2 hover:bg-accent/90 transition-colors">
              <ShoppingCart size={16} /> Open POS <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-medium">Reference</th>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Customer</th>
                <th className="p-4 font-medium">Business</th>
                <th className="p-4 font-medium">Items</th>
                <th className="p-4 font-medium text-right">Total</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => {
                const ref = s.invoiceNumber ?? s.orderId;
                return (
                  <tr key={ref} className="hover:bg-surface/50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <IconBadge
                          Icon={getBusinessIcon(s.business)}
                          size={13}
                          color={s.business.accent}
                          className="w-7 h-7"
                          rounded="rounded-lg"
                        />
                        <span className={`text-[13px] font-bold ${s.isInvoice ? "text-foreground" : "text-foreground/60"}`}>
                          {ref}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-[13px] text-muted whitespace-nowrap">
                      {s.timestamp.toLocaleDateString()} <span className="text-muted/60">{s.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td className="p-4 text-[13px] text-foreground">{s.customerName || "Walk-in"}</td>
                    <td className="p-4 text-[13px] text-muted">{s.business.label}</td>
                    <td className="p-4 text-[13px] text-muted">{s.items.reduce((n, i) => n + i.qty, 0)}</td>
                    <td className="p-4 text-right text-[13px] font-bold text-foreground tabular-nums">{fmt(s.total)}</td>
                    <td className="p-4">
                      {s.isInvoice ? (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                          s.paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {s.paid ? <BadgeCheck size={11} /> : <Clock size={11} />}
                          {s.paid ? "Paid" : "Awaiting payment"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                          {PAYMENT_LABELS[s.payment] ?? s.payment}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewing(s)}
                          title="View invoice"
                          className="w-8 h-8 flex items-center justify-center border border-border text-foreground/50 hover:text-foreground hover:border-accent/40 transition-colors"
                        >
                          <Eye size={14} />
                        </button>
                        {s.isInvoice && !s.paid && (
                          <button
                            onClick={() => handleMarkPaid(ref)}
                            title="Mark as paid"
                            className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            <BadgeCheck size={13} /> Mark paid
                          </button>
                        )}
                        {confirmDeleteId === ref ? (
                          <button
                            onClick={() => handleDelete(ref)}
                            className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(ref)}
                            title="Delete"
                            className="w-8 h-8 flex items-center justify-center border border-border text-foreground/50 hover:text-red-600 hover:border-red-200 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted/70">Stored locally on this device.</p>

      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-card border border-border w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-bold text-muted">
                    {viewing.isInvoice ? "Invoice" : "Receipt"} · {viewing.invoiceNumber ?? viewing.orderId}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <IconBadge Icon={getBusinessIcon(viewing.business)} size={14} color={viewing.business.accent} className="w-8 h-8" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{viewing.business.label}</p>
                      <p className="text-[11px] text-muted">{viewing.timestamp.toLocaleString()}</p>
                    </div>
                  </div>
                  {viewing.customerName && (
                    <p className="text-[13px] text-foreground/80 mt-2">Customer: <span className="font-semibold">{viewing.customerName}</span></p>
                  )}
                </div>
                {viewing.isInvoice && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${
                    viewing.paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {viewing.paid ? <BadgeCheck size={11} /> : <Clock size={11} />}
                    {viewing.paid ? "Paid" : "Awaiting payment"}
                  </span>
                )}
              </div>
            </div>

            <div className="divide-y divide-border">
              {viewing.items.map((item) => (
                <div key={item.id} className="px-5 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{item.name}</p>
                    <p className="text-[11px] text-muted font-mono">{item.qty} × {currencySymbol} {fmt(item.price)}</p>
                  </div>
                  <span className="text-[13px] font-semibold text-foreground font-mono tabular-nums">
                    {currencySymbol} {fmt(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-5 space-y-2 border-t border-border font-mono">
              <div className="flex justify-between text-[13px] text-muted">
                <span>Subtotal</span><span>{currencySymbol} {fmt(viewing.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[13px] text-muted">
                <span>Tax (18%)</span><span>{currencySymbol} {fmt(viewing.tax)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-bold text-foreground border-t border-border pt-2">
                <span>{viewing.isInvoice ? "Amount due" : "Total"}</span><span>{currencySymbol} {fmt(viewing.total)}</span>
              </div>
              {viewing.isInvoice && !viewing.paid && (
                <div className="flex justify-between text-[13px] font-semibold text-amber-600">
                  <span>Status</span><span>Unpaid</span>
                </div>
              )}
              {viewing.paid && viewing.paidAt && (
                <div className="flex justify-between text-[13px] font-semibold text-emerald-600">
                  <span>Paid on</span><span>{new Date(viewing.paidAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              {viewing.isInvoice && !viewing.paid && (
                <button
                  onClick={() => handleMarkPaid(viewing.invoiceNumber ?? "")}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 text-[13px] font-bold hover:bg-emerald-700 transition-colors"
                >
                  <BadgeCheck size={15} /> Mark as paid
                </button>
              )}
              <button
                onClick={() => setPrintSale(viewing)}
                className="flex-1 flex items-center justify-center gap-2 bg-accent text-white px-4 py-2.5 text-[13px] font-bold hover:bg-accent/90 transition-colors"
              >
                <Printer size={15} /> Print
              </button>
              <button
                onClick={() => setViewing(null)}
                className="px-4 py-2.5 text-[13px] font-semibold border border-border text-foreground/60 hover:text-foreground hover:bg-surface transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
