"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Boxes, PackagePlus, Search } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useProducts, type ApiProduct } from "@/lib/api/hooks";
import { LOW_STOCK_THRESHOLD } from "@/components/pos/constants";

export default function MobileInventoryPage() {
  const { currencySymbol, fmt } = useMobilePos();
  const productsQ = useProducts(1, 200);
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const isLow = (p: ApiProduct) => p.stock <= Math.max(p.min_stock, LOW_STOCK_THRESHOLD);

  const filtered = useMemo(
    () =>
      (productsQ.data?.items ?? []).filter((p) => {
        const q = query.trim().toLowerCase();
        const match = !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
        return match && (!lowOnly || isLow(p));
      }),
    [productsQ.data, query, lowOnly],
  );

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-8 h-8 flex items-center justify-center text-muted" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[15px] font-bold text-foreground">Inventory</h1>
            <p className="text-[11px] text-muted mt-0.5">{filtered.length} products</p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
            className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setLowOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
              lowOnly ? "bg-amber-500/10 text-amber-500 border border-amber-500/30" : "bg-card border border-border text-muted"
            }`}
          >
            <AlertTriangle size={12} /> Low stock only
          </button>
          <Link href="/restock" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-white text-[11px] font-semibold">
            <PackagePlus size={12} /> Receive stock
          </Link>
        </div>

        <div className="space-y-2">
          {filtered.map((p) => {
            const low = isLow(p);
            return (
              <div key={p.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-3.5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${low ? "bg-amber-500/10 text-amber-500" : "bg-surface text-accent"}`}>
                    <Boxes size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-[10px] text-muted mt-0.5 truncate">
                      {p.sku || "No SKU"} · {p.category?.name ?? "Uncategorized"}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-[14px] font-bold font-mono ${low ? "text-amber-500" : "text-foreground"}`}>{p.stock}</p>
                  <p className="text-[10px] text-muted">
                    {currencySymbol} {fmt(p.price)}
                  </p>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[12px] text-muted">No products found</p>
              <Link href="/products/new" className="mt-3 inline-block px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-semibold">
                Add a product
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
