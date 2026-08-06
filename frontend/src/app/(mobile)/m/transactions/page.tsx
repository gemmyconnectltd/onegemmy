"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote, CreditCard, FileText, ReceiptText, Search, Smartphone,
} from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { getSales, subscribeSales } from "@/lib/invoices";
import { PeriodSelector, inPeriod, type PeriodKey } from "@/components/mobile/PeriodSelector";
import type { PaymentMethod, SaleResult } from "@/components/pos/types";

const PAYMENT_META: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "mobile", label: "Mobile", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "invoice", label: "Invoice", icon: FileText },
];

function dayKey(d: Date) {
  return d.toDateString();
}

function dayLabel(d: Date) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date();
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function MobileTransactionsPage() {
  const { currencySymbol, fmt } = useMobilePos();
  const [sales, setSales] = useState<SaleResult[]>(() => getSales());
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [payment, setPayment] = useState<PaymentMethod | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => subscribeSales(() => setSales(getSales())), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales
      .filter((s) => inPeriod(new Date(s.timestamp), period))
      .filter((s) => payment === "all" || s.payment === payment)
      .filter((s) => {
        if (!q) return true;
        const itemsText = s.items.map((i) => `${i.name} ${i.qty}`).join(" ");
        return (
          `${s.orderId} ${s.invoiceNumber ?? ""}`.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          (s.notes ?? "").toLowerCase().includes(q) ||
          itemsText.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [sales, period, payment, query]);

  const total = filtered.reduce((sum, s) => sum + s.total, 0);

  const breakdown = useMemo(
    () =>
      PAYMENT_META.map((p) => ({
        ...p,
        amount: sales
          .filter((s) => s.payment === p.key && inPeriod(new Date(s.timestamp), period))
          .reduce((sum, s) => sum + s.total, 0),
      })),
    [sales, period],
  );

  const groups = useMemo(() => {
    const map = new Map<string, SaleResult[]>();
    for (const s of filtered) {
      const k = dayKey(new Date(s.timestamp));
      const arr = map.get(k);
      if (arr) arr.push(s);
      else map.set(k, [s]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Transactions</h1>
        <p className="text-[11px] text-muted mt-0.5">
          {filtered.length} sale{filtered.length !== 1 ? "s" : ""} ·{" "}
          <span className="font-mono text-accent font-semibold">{currencySymbol} {fmt(total)}</span>
        </p>
      </header>

      <div className="flex-1 px-3 pt-3 space-y-3">
        <PeriodSelector value={period} onChange={setPeriod} />

        {/* Payment filter */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setPayment("all")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
              payment === "all" ? "bg-accent border-accent text-white" : "border-border text-muted bg-card"
            }`}
          >
            All
          </button>
          {breakdown.map((p) => (
            <button
              key={p.key}
              onClick={() => setPayment(payment === p.key ? "all" : p.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                payment === p.key ? "bg-accent border-accent text-white" : "border-border text-muted bg-card"
              }`}
            >
              <p.icon size={11} />
              {p.label}
              <span className="font-mono opacity-70">{currencySymbol} {fmt(p.amount)}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search receipts, customers, items…"
            className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
          />
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ReceiptText size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">No transactions in this period</p>
            <Link href="/m/pos" className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
              Make a sale
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([key, list]) => (
              <div key={key}>
                <p className="text-[10px] text-muted uppercase tracking-wider font-semibold px-1 mb-1.5">
                  {dayLabel(new Date(key))}
                </p>
                <div className="space-y-2">
                  {list.map((sale) => {
                    const num = sale.isInvoice ? sale.invoiceNumber : sale.orderId;
                    const meta = PAYMENT_META.find((p) => p.key === sale.payment);
                    const itemsCount = sale.items.reduce((n, i) => n + i.qty, 0);
                    const first = sale.items[0];
                    return (
                      <Link
                        key={sale.orderId + sale.invoiceNumber}
                        href={`/m/sales/${encodeURIComponent(sale.orderId)}`}
                        className="block bg-card rounded-2xl px-3.5 py-3 active:bg-surface transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ReceiptText size={15} className="text-accent flex-shrink-0" />
                          <p className="font-mono text-[12px] font-bold text-foreground truncate">{num}</p>
                          <span
                            className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                              sale.isInvoice
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-surface text-muted"
                            }`}
                          >
                            {meta?.icon && <meta.icon size={9} />}
                            {sale.isInvoice ? "Invoice" : meta?.label}
                          </span>
                          <span className="ml-auto flex-shrink-0 text-[11px] text-muted font-mono">
                            {new Date(sale.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="text-[11px] text-muted truncate min-w-0">
                            {first
                              ? `${first.name}${itemsCount > 1 ? ` · +${itemsCount - 1} more` : ""}`
                              : `${itemsCount} items`}
                            {sale.customerName && <span className="text-foreground/70"> · {sale.customerName}</span>}
                          </p>
                          <span className="flex-shrink-0 text-[14px] font-bold font-mono text-accent">
                            {currencySymbol} {fmt(sale.total)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
