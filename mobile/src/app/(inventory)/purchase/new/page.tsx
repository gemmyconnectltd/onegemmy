"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Minus, Plus, Search, Truck, X } from "lucide-react";

import { useMobilePos } from "@/components/mobile/MobilePosProvider";
import { useProducts, useSuppliers, useCreatePurchaseOrder, type ApiProduct } from "@/lib/api/hooks";

interface PurchaseLine {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit_cost: number;
}

export default function MobileNewPurchasePage() {
  const { currencySymbol, fmt } = useMobilePos();
  const productsQ = useProducts(1, 200);
  const suppliersQ = useSuppliers();
  const createPurchase = useCreatePurchaseOrder();

  const [query, setQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [doneRef, setDoneRef] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suppliers = suppliersQ.data?.items ?? [];

  const filtered = useMemo(
    () =>
      (productsQ.data?.items ?? [])
        .filter((p) => !p.has_variants)
        .filter((p) =>
          !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()) || (p.sku ?? "").toLowerCase().includes(query.trim().toLowerCase()),
        ),
    [productsQ.data, query],
  );

  const addLine = (p: ApiProduct) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.id);
      if (existing) return prev.map((l) => (l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku, qty: 1, unit_cost: p.cost || p.price }];
    });
    setQuery("");
    setError(null);
  };

  const updateLine = (id: string, patch: Partial<PurchaseLine>) =>
    setLines((prev) => prev.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));

  const total = lines.reduce((sum, l) => sum + l.qty * l.unit_cost, 0);
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  const handleSubmit = async () => {
    if (lines.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await createPurchase.mutateAsync({
        supplier_id: supplierId || null,
        status: "Received",
        notes: notes || null,
        items: lines.map((l) => ({
          product_id: l.product_id,
          product_name: l.name,
          sku: l.sku,
          unit_cost: l.unit_cost,
          quantity: l.qty,
        })),
      });
      setDoneRef(data.reference);
    } catch (e) {
      setError((e as { detail?: string })?.detail ?? "Failed to record purchase");
    } finally {
      setSaving(false);
    }
  };

  if (doneRef) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-8 text-center">
        <CheckCircle2 size={40} className="text-green-500 mb-3" />
        <p className="text-[15px] font-bold text-foreground">Purchase recorded</p>
        <p className="text-[12px] text-muted mt-1">
          {doneRef} · {totalQty} items · {currencySymbol} {fmt(total)}
        </p>
        <p className="text-[11px] text-muted mt-2">Stock has been added to inventory</p>
        <Link href="/transactions" className="mt-6 w-full py-3 rounded-2xl bg-accent text-white text-[13px] font-semibold">
          View transactions
        </Link>
        <Link href="/inventory" className="mt-2 w-full py-3 rounded-2xl border border-border text-[13px] font-semibold text-foreground">
          Check inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col pb-6">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-8 h-8 flex items-center justify-center text-muted" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[15px] font-bold text-foreground">New Purchase</h1>
            <p className="text-[11px] text-muted mt-0.5">Buy stock from a supplier</p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Supplier */}
        <div>
          <label className="text-[10px] text-muted font-semibold block mb-1">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent"
          >
            <option value="">Walk-in / No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Add items */}
        <div>
          <label className="text-[10px] text-muted font-semibold block mb-1">Add items</label>
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 mb-2">
            <Search size={15} className="text-muted flex-shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product to add"
              className="w-full bg-transparent py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
            />
          </div>
          {query.trim() && (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {filtered.slice(0, 8).map((p) => (
                <button key={p.id} onClick={() => addLine(p)} className="w-full flex items-center justify-between px-3.5 py-2.5 active:bg-surface">
                  <span className="text-[12px] font-medium text-foreground truncate">{p.name}</span>
                  <span className="flex-shrink-0 text-[11px] text-accent font-semibold">Add <Plus size={11} className="inline" /></span>
                </button>
              ))}
              {filtered.length === 0 && <p className="px-3.5 py-3 text-[11px] text-muted">No products found</p>}
            </div>
          )}
        </div>

        {/* Lines */}
        {lines.length > 0 && (
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {lines.map((line) => (
              <div key={line.product_id} className="px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-foreground truncate pr-2">{line.name}</p>
                  <button onClick={() => setLines((prev) => prev.filter((l) => l.product_id !== line.product_id))} className="text-muted flex-shrink-0" aria-label="Remove">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 bg-surface rounded-lg px-1 py-0.5">
                    <button onClick={() => updateLine(line.product_id, { qty: Math.max(1, line.qty - 1) })} className="w-7 h-7 flex items-center justify-center text-foreground">
                      <Minus size={13} />
                    </button>
                    <span className="w-7 text-center text-[13px] font-bold font-mono text-foreground">{line.qty}</span>
                    <button onClick={() => updateLine(line.product_id, { qty: line.qty + 1 })} className="w-7 h-7 flex items-center justify-center text-accent">
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="text-[11px] text-muted">×</span>
                  <input
                    value={line.unit_cost}
                    onChange={(e) => updateLine(line.product_id, { unit_cost: Number(e.target.value) || 0 })}
                    inputMode="numeric"
                    className="w-24 bg-surface border border-border rounded-lg px-2 py-1.5 text-[12px] font-mono text-foreground outline-none"
                  />
                  <span className="ml-auto text-[13px] font-bold font-mono text-foreground">
                    {currencySymbol} {fmt(line.qty * line.unit_cost)}
                  </span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[12px] text-muted font-medium">Total ({totalQty} items)</span>
              <span className="text-[16px] font-bold font-mono text-foreground">
                {currencySymbol} {fmt(total)}
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted outline-none"
        />

        {error && <p className="text-[12px] text-red-500 font-medium">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={lines.length === 0 || saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-accent text-white text-[13px] font-semibold disabled:opacity-40 active:scale-[0.98] transition"
        >
          <Truck size={16} />
          {saving ? "Recording & restocking..." : lines.length === 0 ? "Add items to continue" : `Record purchase · ${currencySymbol} ${fmt(total)}`}
          {!saving && lines.length > 0 && <ArrowRight size={15} />}
        </button>

        <p className="text-[10px] text-muted text-center pb-2">
          Recording a purchase adds the quantity to your inventory stock.
        </p>
      </div>
    </div>
  );
}
