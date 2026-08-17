"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3, Banknote, CreditCard, Package, ReceiptText,
  ShoppingBasket, Smartphone, TrendingUp, Users,
} from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useOrders } from "@/lib/api/hooks";
import { orderToSale } from "@/lib/orders";
import { PeriodSelector, inPeriod, type PeriodKey } from "@/components/mobile/PeriodSelector";
import type { PaymentMethod } from "@/components/pos/types";

const PAYMENT_META: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "mobile", label: "Mobile Money", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
];

export default function MobileStatsPage() {
  const { currencySymbol, fmt, heldOrders } = useMobilePos();
  const ordersQ = useOrders(1, 500);
  const [period, setPeriod] = useState<PeriodKey>("today");

  const sales = useMemo(
    () => (ordersQ.data?.items ?? []).filter((o) => o.status === "Completed").map(orderToSale),
    [ordersQ.data],
  );

  const filtered = useMemo(
    () => sales.filter((s) => inPeriod(new Date(s.timestamp), period)),
    [sales, period],
  );

  const revenue = filtered.reduce((sum, s) => sum + s.total, 0);
  const itemsSold = filtered.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.qty, 0), 0);
  const avgSale = filtered.length > 0 ? Math.round(revenue / filtered.length) : 0;

  const paymentBreakdown = useMemo(() => {
    return PAYMENT_META.map((p) => {
      const amount = filtered
        .filter((s) => s.payment === p.key)
        .reduce((sum, s) => sum + s.total, 0);
      return { ...p, amount, count: filtered.filter((s) => s.payment === p.key).length };
    });
  }, [filtered]);

  const maxPayment = Math.max(1, ...paymentBreakdown.map((p) => p.amount));

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const s of filtered) {
      for (const i of s.items) {
        const cur = map.get(i.name) ?? { name: i.name, qty: 0, total: 0 };
        cur.qty += i.qty;
        cur.total += i.price * i.qty - i.discount;
        map.set(i.name, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [filtered]);

  const maxProductQty = Math.max(1, ...topProducts.map((p) => p.qty));

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Stats</h1>
        <p className="text-[11px] text-muted mt-0.5">Your sales at a glance</p>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-4">
        <PeriodSelector value={period} onChange={setPeriod} />

        {/* KPIs */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div>
            <p className="flex items-center gap-1 text-[11px] text-muted font-medium">
              <TrendingUp size={12} /> Total revenue
            </p>
            <p className="text-[28px] font-bold text-foreground font-mono mt-1">
              {currencySymbol} {fmt(revenue)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Sales" value={String(filtered.length)} icon={<ReceiptText size={14} />} />
            <Kpi label="Items sold" value={String(itemsSold)} icon={<Package size={14} />} />
            <Kpi label="Avg / sale" value={fmt(avgSale)} icon={<BarChart3 size={14} />} />
          </div>
        </div>

        {/* Held orders */}
        <Link
          href="/held"
          className="flex items-center justify-between px-4 py-3.5 bg-card border border-border rounded-2xl active:bg-surface transition-colors"
        >
          <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
            <ShoppingBasket size={16} className="text-accent" />
            Held sales
          </span>
          <span className="text-[13px] font-bold font-mono text-foreground">
            {heldOrders.length}
          </span>
        </Link>

        {/* Payment breakdown */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-3">By payment method</p>
          <div className="space-y-3">
            {paymentBreakdown.map((p) => (
              <div key={p.key}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="flex items-center gap-1.5 text-foreground font-medium">
                    <p.icon size={12} className="text-accent" /> {p.label}
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {currencySymbol} {fmt(p.amount)}
                    <span className="text-muted font-normal"> · {p.count}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(p.amount / maxPayment) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-3">Top products</p>
          {topProducts.length === 0 ? (
            <p className="text-[12px] text-muted">No sales in this period yet.</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, idx) => (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-center text-[10px] font-bold text-muted flex-shrink-0">{idx + 1}</span>
                      <span className="truncate text-foreground font-medium">{p.name}</span>
                    </span>
                    <span className="font-mono font-semibold text-foreground flex-shrink-0">
                      {p.qty} × {currencySymbol} {fmt(p.total)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden ml-6">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${(p.qty / maxProductQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">Recent activity</p>
            <Link href="/sales" className="text-[11px] font-semibold text-accent">
              View all
            </Link>
          </div>
          {filtered.length === 0 ? (
            <p className="text-[12px] text-muted">No sales in this period yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.slice(0, 5).map((sale) => (
                <div key={sale.orderId} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate">
                      {sale.orderId}
                    </p>
                    <p className="text-[10px] text-muted flex items-center gap-1">
                      <Users size={9} /> {sale.customerName || "Walk-in"} ·{" "}
                      {new Date(sale.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="text-[12px] font-bold font-mono text-foreground flex-shrink-0">
                    {currencySymbol} {fmt(sale.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface p-2.5">
      <p className="flex items-center gap-1 text-[9px] text-muted font-medium uppercase tracking-wide">
        {icon} {label}
      </p>
      <p className="text-[16px] font-bold text-foreground font-mono mt-1 truncate">{value}</p>
    </div>
  );
}
