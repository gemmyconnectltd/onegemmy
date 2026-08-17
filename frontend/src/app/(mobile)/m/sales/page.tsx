"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, CreditCard, ReceiptText, Smartphone } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useOrders } from "@/lib/api/hooks";
import { orderToSale } from "@/lib/orders";
import { PeriodSelector, inPeriod, type PeriodKey } from "@/components/mobile/PeriodSelector";
import type { PaymentMethod } from "@/components/pos/types";

const PAYMENT_META: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "mobile", label: "Mobile", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
];

export default function MobileSalesPage() {
  const { currencySymbol, fmt } = useMobilePos();
  const ordersQ = useOrders(1, 500);
  const [period, setPeriod] = useState<PeriodKey>("today");

  const sales = useMemo(
    () => (ordersQ.data?.items ?? []).filter((o) => o.status === "Completed").map(orderToSale),
    [ordersQ.data],
  );

  const list = useMemo(
    () => sales.filter((s) => inPeriod(new Date(s.timestamp), period)),
    [sales, period],
  );

  const total = list.reduce((sum, s) => sum + s.total, 0);

  const breakdown = useMemo(
    () =>
      PAYMENT_META.map((p) => ({
        ...p,
        amount: list.filter((s) => s.payment === p.key).reduce((sum, s) => sum + s.total, 0),
      })),
    [list],
  );

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Sales</h1>
        <p className="text-[11px] text-muted mt-0.5">
          {list.length} sale{list.length !== 1 ? "s" : ""} ·{" "}
          <span className="font-mono text-accent font-semibold">{currencySymbol} {fmt(total)}</span>
        </p>
      </header>

      <div className="flex-1 px-3 pt-3 space-y-3">
        <PeriodSelector value={period} onChange={setPeriod} />

        {/* Payment breakdown */}
        {list.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {breakdown.map((p) => (
              <div
                key={p.key}
                className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-card border border-border rounded-xl"
              >
                <p.icon size={12} className="text-accent" />
                <span className="text-[10px] text-muted font-medium">{p.label}</span>
                <span className="text-[10px] font-bold font-mono text-foreground">
                  {currencySymbol} {fmt(p.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ReceiptText size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">No sales in this period</p>
            <Link href="/m/pos" className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
              Make a sale
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((sale) => (
              <Link
                key={sale.orderId}
                href={`/m/sales/${encodeURIComponent(sale.orderId)}`}
                className="flex items-center justify-between bg-card border border-border rounded-xl px-3.5 py-3 active:bg-surface transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {sale.orderId}
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">
                    {new Date(sale.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {sale.items.reduce((n, i) => n + i.qty, 0)} items ·{" "}
                    <span className="capitalize">{sale.payment === "mobile" ? "mobile money" : sale.payment}</span>
                  </p>
                </div>
                <span className="text-[14px] font-bold font-mono text-foreground flex-shrink-0">
                  {currencySymbol} {fmt(sale.total)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
