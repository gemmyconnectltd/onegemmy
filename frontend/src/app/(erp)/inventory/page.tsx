"use client";

import { useState } from "react";
import {
  Package, AlertTriangle, CheckCircle, XCircle, TrendingUp,
  Search, Plus, ArrowUpRight, BarChart3, Filter,
} from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/config";

const inventory = [
  { id: "1", name: "Phone Case - iPhone",  sku: "PC-001", category: "Accessories", stock: 45,  minStock: 10, price: 5000,  cost: 2500  },
  { id: "2", name: "USB-C Cable 1m",        sku: "UC-002", category: "Cables",      stock: 120, minStock: 20, price: 3000,  cost: 1200  },
  { id: "3", name: "Screen Protector",      sku: "SP-003", category: "Accessories", stock: 200, minStock: 30, price: 2000,  cost: 800   },
  { id: "4", name: "Wireless Earbuds",      sku: "WE-004", category: "Audio",       stock: 25,  minStock: 5,  price: 15000, cost: 8000  },
  { id: "5", name: "Phone Charger 20W",     sku: "CH-005", category: "Chargers",    stock: 35,  minStock: 10, price: 8000,  cost: 4000  },
  { id: "6", name: "Bluetooth Speaker",     sku: "BS-006", category: "Audio",       stock: 12,  minStock: 5,  price: 25000, cost: 15000 },
  { id: "7", name: "Phone Cases - Samsung", sku: "PC-007", category: "Accessories", stock: 3,   minStock: 10, price: 4000,  cost: 2000  },
  { id: "8", name: "HDMI Cable 2m",         sku: "HC-008", category: "Cables",      stock: 0,   minStock: 15, price: 6000,  cost: 3000  },
];

function getStatus(stock: number, min: number) {
  if (stock === 0) return "out";
  if (stock <= min) return "low";
  return "in_stock";
}

const statusCfg = {
  in_stock: { label: "In Stock",  bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  low:      { label: "Low Stock", bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500"   },
  out:      { label: "Out",       bg: "bg-red-50",     text: "text-red-600",     dot: "bg-red-500"     },
};

function fmt(v: number) { return `${CURRENCY_SYMBOL} ${v.toLocaleString()}`; }

export default function InventoryOverviewPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");

  const filtered = inventory.filter((i) => {
    const match = i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase());
    const s = getStatus(i.stock, i.minStock);
    return match && (filter === "all" || s === filter);
  });

  const totalValue = inventory.reduce((s, i) => s + i.stock * i.cost, 0);
  const lowCount   = inventory.filter((i) => getStatus(i.stock, i.minStock) === "low").length;
  const outCount   = inventory.filter((i) => getStatus(i.stock, i.minStock) === "out").length;
  const inCount    = inventory.filter((i) => getStatus(i.stock, i.minStock) === "in_stock").length;

  const topByValue = [...inventory].sort((a, b) => (b.stock * b.cost) - (a.stock * a.cost)).slice(0, 4);

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Inventory Overview</h1>
          <p className="text-sm text-muted mt-0.5">Monitor stock levels, value, and alerts across all products</p>
        </div>
        <button className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-semibold hover:bg-accent/90 transition-colors">
          <Plus size={15} /> Add Product
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Products",   value: String(inventory.length), sub: "SKUs tracked",       icon: Package,       color: "#af9164", change: null },
          { label: "Stock Value",      value: fmt(totalValue),          sub: "At cost price",      icon: BarChart3,     color: "#6f1a07", change: "+4.2%" },
          { label: "Low Stock",        value: String(lowCount),         sub: "Need reorder",       icon: AlertTriangle, color: "#f59e0b", change: null },
          { label: "Out of Stock",     value: String(outCount),         sub: "Immediate action",   icon: XCircle,       color: "#ef4444", change: null },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border p-5 relative overflow-hidden group hover:shadow-sm transition-shadow">
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: s.color }} />
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ backgroundColor: `${s.color}12` }}>
                <s.icon size={17} style={{ color: s.color }} />
              </div>
              {s.change && (
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
                  <ArrowUpRight size={11} />{s.change}
                </span>
              )}
            </div>
            <p className="text-2xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] font-semibold text-foreground/70 mt-0.5">{s.label}</p>
            <p className="text-[10px] text-muted mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Stock health + top products */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Stock health */}
        <div className="bg-card border border-border p-5">
          <p className="text-sm font-bold text-foreground mb-4">Stock Health</p>
          <div className="space-y-3">
            {[
              { label: "In Stock",   count: inCount,   total: inventory.length, color: "bg-emerald-500" },
              { label: "Low Stock",  count: lowCount,  total: inventory.length, color: "bg-amber-400"   },
              { label: "Out of Stock", count: outCount, total: inventory.length, color: "bg-red-500"    },
            ].map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted font-medium">{r.label}</span>
                  <span className="text-xs font-bold text-foreground">{r.count} <span className="text-muted font-normal">/ {r.total}</span></span>
                </div>
                <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${r.color}`} style={{ width: `${(r.count / r.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-muted">Overall health score</p>
            <p className="text-2xl font-extrabold text-foreground mt-1">
              {Math.round((inCount / inventory.length) * 100)}<span className="text-sm font-medium text-muted">%</span>
            </p>
          </div>
        </div>

        {/* Top products by value */}
        <div className="lg:col-span-2 bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-foreground">Top Products by Value</p>
            <span className="text-[11px] text-muted">At cost price</span>
          </div>
          <div className="space-y-3">
            {topByValue.map((item, i) => {
              const value = item.stock * item.cost;
              const maxValue = topByValue[0].stock * topByValue[0].cost;
              const pct = (value / maxValue) * 100;
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-muted w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                      <span className="text-xs font-bold text-foreground ml-2 flex-shrink-0">{fmt(value)}</span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(lowCount > 0 || outCount > 0) && (
        <div className="bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-bold">{outCount} product{outCount !== 1 ? "s" : ""} out of stock</span> and{" "}
            <span className="font-bold">{lowCount} running low</span> — review and reorder soon.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-foreground/30 outline-none bg-surface/50"
            />
          </div>
          <div className="flex items-center gap-1 border border-border p-0.5">
            {(["all", "low", "out"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  filter === f ? "bg-foreground text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "low" ? "Low" : "Out"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted border border-border px-3 py-2 cursor-pointer hover:text-foreground transition-colors">
            <Filter size={12} /> Filter
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface/40 text-left text-[10px] font-semibold text-muted uppercase tracking-wider">
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3 text-right">Stock</th>
                <th className="px-5 py-3 text-right">Min</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => {
                const s = getStatus(item.stock, item.minStock);
                const cfg = statusCfg[s];
                return (
                  <tr key={item.id} className="hover:bg-surface/40 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface border border-border flex items-center justify-center flex-shrink-0 group-hover:border-foreground/20 transition-colors">
                          <Package size={13} className="text-muted" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-mono text-muted">{item.sku}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs bg-surface px-2 py-0.5 text-foreground/60 font-medium">{item.category}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-bold tabular-nums ${s === "out" ? "text-red-600" : s === "low" ? "text-amber-600" : "text-foreground"}`}>
                        {item.stock}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{item.minStock}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(item.stock * item.cost)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Package size={32} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-medium text-muted">No products found</p>
                    <p className="text-xs text-muted/60 mt-1">Try adjusting your search or filter</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted">{filtered.length} of {inventory.length} products</p>
          <p className="text-xs text-muted">Total value: <span className="font-semibold text-foreground">{fmt(filtered.reduce((s, i) => s + i.stock * i.cost, 0))}</span></p>
        </div>
      </div>
    </div>
  );
}
