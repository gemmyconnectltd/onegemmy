"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Minus, PackagePlus, Plus, Search } from "lucide-react";

import { useProducts, useRestockProduct, type ApiProduct } from "@/lib/api/hooks";
import { LOW_STOCK_THRESHOLD } from "@/components/pos/constants";
import { addStockMovement } from "@/lib/stockMovements";

export default function MobileRestockPage() {
  const productsQ = useProducts(1, 200);
  const restock = useRestockProduct();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ApiProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [successId, setSuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const products = useMemo(
    () =>
      (productsQ.data?.items ?? []).filter((p) =>
        !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()) || (p.sku ?? "").toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [productsQ.data, query],
  );

  const isLow = (p: ApiProduct) => p.stock <= Math.max(p.min_stock, LOW_STOCK_THRESHOLD);

  const pick = (p: ApiProduct) => {
    setSelected(p);
    setQty(Math.max(1, p.min_stock - p.stock));
    setReason("");
    setError(null);
  };

  const submit = async () => {
    if (!selected || qty <= 0) return;
    setError(null);
    try {
      await restock.mutateAsync({
        id: selected.id,
        data: { qty, mode: "restock", reason: reason.trim() || "Stock in (mobile)" },
      });
      addStockMovement({
        productName: selected.name,
        qty,
        reason: reason.trim() || "Manual restock",
      });
      setSuccessId(selected.id);
      setSelected(null);
      setQty(1);
      setReason("");
      setTimeout(() => setSuccessId(null), 2000);
    } catch (e) {
      setError((e as { detail?: string })?.detail ?? "Failed to receive stock");
    }
  };

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-8 h-8 flex items-center justify-center text-muted" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[15px] font-bold text-foreground">Receive Stock</h1>
            <p className="text-[11px] text-muted mt-0.5">Add stock to inventory</p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-3">
        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
            className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
          />
        </div>

        {/* Selected product editor */}
        {selected && (
          <div className="bg-card border border-accent/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-foreground">{selected.name}</p>
              <button onClick={() => setSelected(null)} className="text-[11px] text-muted font-semibold">
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-muted">
              Current stock: <span className="font-semibold text-foreground">{selected.stock}</span> · Low at{" "}
              <span className="font-semibold text-foreground">{selected.min_stock || LOW_STOCK_THRESHOLD}</span>
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground">Quantity</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface border border-border text-foreground">
                  <Minus size={15} />
                </button>
                <span className="w-10 text-center text-[16px] font-bold font-mono text-foreground">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-accent text-white">
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional) — e.g. Purchase, Return"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[12px] text-foreground placeholder:text-muted outline-none"
            />
            {error && <p className="text-[12px] text-red-500 font-medium">{error}</p>}
            <button
              onClick={submit}
              disabled={restock.isPending}
              className="w-full py-3 rounded-xl bg-accent text-white text-[13px] font-semibold disabled:opacity-40"
            >
              {restock.isPending ? "Receiving..." : `Receive ${qty} unit${qty !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        {/* Product list */}
        <div className="space-y-2">
          {products.map((p) => {
            const low = isLow(p);
            const success = successId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => pick(p)}
                className={`w-full flex items-center justify-between bg-card border rounded-xl px-3.5 py-3 active:bg-surface transition-colors ${
                  success ? "border-green-500/50" : "border-border"
                }`}
              >
                <div className="min-w-0 text-left">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {success ? "Stock received ✓ " : ""}
                    {p.name}
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">
                    {p.sku || "No SKU"} · Stock {p.stock}
                  </p>
                </div>
                {low ? (
                  <span className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-500 text-[10px] font-semibold">
                    <AlertTriangle size={11} /> Low
                  </span>
                ) : success ? (
                  <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                ) : (
                  <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-surface text-accent text-[10px] font-semibold">
                    <PackagePlus size={12} className="inline" /> In
                  </span>
                )}
              </button>
            );
          })}
          {products.length === 0 && (
            <p className="py-10 text-center text-[12px] text-muted">No products match your search</p>
          )}
        </div>
      </div>
    </div>
  );
}
