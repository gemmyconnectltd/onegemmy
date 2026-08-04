"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { getSales, subscribeSales } from "@/lib/invoices";
import type { SaleResult } from "@/components/pos/types";

export default function MobileSalesPage() {
  const { currencySymbol, fmt } = useMobilePos();
  const [sales, setSales] = useState<SaleResult[]>(() => getSales());

  useEffect(() => subscribeSales(() => setSales(getSales())), []);

  const today = sales.filter((s) => {
    const d = new Date(s.timestamp);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const todayTotal = today.reduce((sum, s) => sum + s.total, 0);
  const list = today.length > 0 ? today : sales;

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-bold text-foreground">Sales</h1>
        <p className="text-[11px] text-muted mt-0.5">
          Today: {today.length} sale{today.length !== 1 ? "s" : ""} ·{" "}
          <span className="font-mono text-accent font-semibold">{currencySymbol} {fmt(todayTotal)}</span>
        </p>
      </header>

      <div className="flex-1 px-3 py-2">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ReceiptText size={28} className="text-muted/40 mb-2" />
            <p className="text-[13px] text-muted">No sales yet</p>
            <Link href="/m" className="mt-4 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
              Make a sale
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((sale) => (
              <Link
                key={sale.orderId + sale.invoiceNumber}
                href={`/m/sales/${encodeURIComponent(sale.orderId)}`}
                className="flex items-center justify-between bg-card border border-border rounded-xl px-3.5 py-3 active:bg-surface transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {sale.isInvoice ? sale.invoiceNumber : sale.orderId}
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
