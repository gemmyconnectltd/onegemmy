"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Package, AlertTriangle, TrendingDown, Layers, Loader2 } from "lucide-react";
import { inventoryApi } from "@/lib/api";
import { fmtMoney } from "@/lib/config";
import type { ApiProduct } from "@/lib/api";

const ACCENT = "#059669";

export default function InventoryReportPage() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await inventoryApi.listProducts(1, 500);
      setProducts(res.data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = products.filter((p) => p.is_active);
  const lowStock = products.filter((p) => !p.has_variants && p.stock <= p.min_stock && p.stock > 0);
  const outOfStock = products.filter((p) => !p.has_variants && p.stock === 0);
  const totalValue = products.reduce((s, p) => s + p.cost * p.stock, 0);
  const totalRetailValue = products.reduce((s, p) => s + p.price * p.stock, 0);

  // Stock by category
  const byCat: Record<string, { name: string; count: number; value: number }> = {};
  products.forEach((p) => {
    const k = p.category?.name ?? "Uncategorized";
    if (!byCat[k]) byCat[k] = { name: k, count: 0, value: 0 };
    byCat[k].count += p.stock;
    byCat[k].value += p.cost * p.stock;
  });
  const catChart = Object.values(byCat).sort((a, b) => b.value - a.value).slice(0, 8);

  // Top by stock value
  const topByValue = [...products].sort((a, b) => (b.cost * b.stock) - (a.cost * a.stock)).slice(0, 10);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-muted" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Inventory Report</h1>
        <p className="text-sm text-muted mt-0.5">{products.length} products tracked</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active Products", value: active.length.toString(), icon: Package, color: ACCENT },
          { label: "Stock Value (Cost)", value: fmtMoney(totalValue), icon: TrendingDown, color: "#6366f1" },
          { label: "Retail Value", value: fmtMoney(totalRetailValue), icon: Layers, color: "#0284c7" },
          { label: "Low / Out of Stock", value: `${lowStock.length} / ${outOfStock.length}`, icon: AlertTriangle, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Stock Value by Category</h2>
          {catChart.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip formatter={(v) => [fmtMoney(Number(v)), "Value"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }} />
                  <Bar dataKey="value" fill={ACCENT} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-muted py-10 text-center">No products yet</p>}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Low / Out of Stock</h2>
          {outOfStock.length + lowStock.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {[...outOfStock.map(p => ({ ...p, _type: "out" })), ...lowStock.map(p => ({ ...p, _type: "low" }))].map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="text-[11px] text-muted font-mono">{p.sku ?? "No SKU"}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${p._type === "out" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                    {p._type === "out" ? "Out of stock" : `${p.stock} left`}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted py-10 text-center">All products are well stocked 🎉</p>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Top Products by Stock Value</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {["Product", "SKU", "Stock", "Cost", "Stock Value", "Retail Value"].map((h) => (
                <th key={h} className="pb-3 text-[11px] font-semibold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {topByValue.map((p) => (
              <tr key={p.id}>
                <td className="py-2.5 font-medium text-foreground">{p.name}</td>
                <td className="py-2.5 font-mono text-xs text-muted">{p.sku ?? "—"}</td>
                <td className="py-2.5 text-foreground">{p.stock}</td>
                <td className="py-2.5 text-muted">{fmtMoney(p.cost)}</td>
                <td className="py-2.5 font-semibold text-foreground">{fmtMoney(p.cost * p.stock)}</td>
                <td className="py-2.5 text-emerald-600 font-semibold">{fmtMoney(p.price * p.stock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
