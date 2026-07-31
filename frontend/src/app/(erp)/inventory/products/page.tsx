"use client";

import { useState } from "react";
import { Package, Plus, Search, Edit2, Trash2, MoreVertical, SlidersHorizontal } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/config";

const products = [
  { id: "1", name: "Phone Case - iPhone",  sku: "PC-001", category: "Accessories", brand: "Generic", unit: "Piece", price: 5000,  cost: 2500,  stock: 45,  status: "active"   },
  { id: "2", name: "USB-C Cable 1m",        sku: "UC-002", category: "Cables",      brand: "Anker",   unit: "Piece", price: 3000,  cost: 1200,  stock: 120, status: "active"   },
  { id: "3", name: "Screen Protector",      sku: "SP-003", category: "Accessories", brand: "Generic", unit: "Piece", price: 2000,  cost: 800,   stock: 200, status: "active"   },
  { id: "4", name: "Wireless Earbuds",      sku: "WE-004", category: "Audio",       brand: "Samsung", unit: "Piece", price: 15000, cost: 8000,  stock: 25,  status: "active"   },
  { id: "5", name: "Phone Charger 20W",     sku: "CH-005", category: "Chargers",    brand: "Xiaomi",  unit: "Piece", price: 8000,  cost: 4000,  stock: 35,  status: "active"   },
  { id: "6", name: "Bluetooth Speaker",     sku: "BS-006", category: "Audio",       brand: "JBL",     unit: "Piece", price: 25000, cost: 15000, stock: 12,  status: "active"   },
  { id: "7", name: "Phone Cases - Samsung", sku: "PC-007", category: "Accessories", brand: "Generic", unit: "Piece", price: 4000,  cost: 2000,  stock: 3,   status: "active"   },
  { id: "8", name: "HDMI Cable 2m",         sku: "HC-008", category: "Cables",      brand: "Ugreen",  unit: "Piece", price: 6000,  cost: 3000,  stock: 0,   status: "inactive" },
];

const categoryColors: Record<string, string> = {
  Accessories: "bg-violet-50 text-violet-700",
  Cables:      "bg-blue-50 text-blue-700",
  Audio:       "bg-emerald-50 text-emerald-700",
  Chargers:    "bg-amber-50 text-amber-700",
};

function fmt(v: number) { return `${CURRENCY_SYMBOL} ${v.toLocaleString()}`; }

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const margin = (p: typeof products[0]) => Math.round(((p.price - p.cost) / p.price) * 100);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Products</h1>
          <p className="text-sm text-muted mt-0.5">{products.length} products · {products.filter(p => p.status === "active").length} active</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-semibold hover:bg-accent/90 transition-colors rounded-lg">
          <Plus size={15} /> Add Product
        </button>
      </div>

      {/* Table card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-surface/50"
            />
          </div>
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${
                  statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >{f}</button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs text-muted hover:text-foreground transition-colors ml-auto">
            <SlidersHorizontal size={13} /> Filter
          </button>
          <span className="text-xs text-muted">{filtered.length} results</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left">
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Product</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Category</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Brand</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider text-right">Cost</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider text-right">Price</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider text-right">Margin</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider text-right">Stock</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider text-center">Status</th>
                <th className="px-5 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-surface/40 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center flex-shrink-0">
                        <Package size={14} className="text-muted" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        <p className="text-[11px] text-muted font-mono">{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${categoryColors[p.category] ?? "bg-surface text-muted"}`}>
                      {p.category}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted">{p.brand}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{fmt(p.cost)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(p.price)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{margin(p)}%</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-bold text-foreground tabular-nums">{p.stock}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                      p.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.status === "active" ? "bg-emerald-500" : "bg-muted"}`} />
                      {p.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 relative">
                    <button onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <MoreVertical size={14} />
                    </button>
                    {openMenu === p.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-4 top-full mt-1 w-36 bg-card border border-border rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
                          <button className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface transition-colors">
                            <Edit2 size={13} className="text-muted" /> Edit
                          </button>
                          <button className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <Package size={36} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-semibold text-muted">No products found</p>
                    <p className="text-xs text-muted/70 mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border bg-surface/30 flex items-center justify-between">
          <p className="text-xs text-muted">{filtered.length} of {products.length} products</p>
          <p className="text-xs text-muted">Avg margin: <span className="font-semibold text-foreground">{Math.round(filtered.reduce((s, p) => s + margin(p), 0) / (filtered.length || 1))}%</span></p>
        </div>
      </div>
    </div>
  );
}
