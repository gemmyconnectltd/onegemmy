"use client";

import { useState } from "react";
import {
  Warehouse, Package, Plus, AlertTriangle, CheckCircle, XCircle,
  Search, PackagePlus,
} from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/config";

const initialInventory = [
  { id: "1", name: "Phone Case - iPhone", sku: "PC-001", stock: 45, minStock: 10, price: 5000, cost: 2500 },
  { id: "2", name: "USB-C Cable 1m", sku: "UC-002", stock: 120, minStock: 20, price: 3000, cost: 1200 },
  { id: "3", name: "Screen Protector", sku: "SP-003", stock: 200, minStock: 30, price: 2000, cost: 800 },
  { id: "4", name: "Wireless Earbuds", sku: "WE-004", stock: 25, minStock: 5, price: 15000, cost: 8000 },
  { id: "5", name: "Phone Charger 20W", sku: "CH-005", stock: 35, minStock: 10, price: 8000, cost: 4000 },
  { id: "6", name: "Bluetooth Speaker", sku: "BS-006", stock: 12, minStock: 5, price: 25000, cost: 15000 },
  { id: "7", name: "Phone Cases - Samsung", sku: "PC-007", stock: 3, minStock: 10, price: 4000, cost: 2000 },
  { id: "8", name: "HDMI Cable 2m", sku: "HC-008", stock: 0, minStock: 15, price: 6000, cost: 3000 },
];

function getStatus(stock: number, minStock: number): "in_stock" | "low" | "out" {
  if (stock === 0) return "out";
  if (stock <= minStock) return "low";
  return "in_stock";
}

const statusConfig = {
  in_stock: { label: "In Stock", icon: CheckCircle, bg: "bg-emerald-50", text: "text-emerald-700", iconColor: "text-emerald-500" },
  low: { label: "Low", icon: AlertTriangle, bg: "bg-amber-50", text: "text-amber-700", iconColor: "text-amber-500" },
  out: { label: "Out", icon: XCircle, bg: "bg-red-50", text: "text-red-700", iconColor: "text-red-500" },
};

function fmtRWF(val: number) {
  return `${CURRENCY_SYMBOL} ${val.toLocaleString()}`;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState(initialInventory);
  const [search, setSearch] = useState("");
  const [addStockId, setAddStockId] = useState<string | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addNote, setAddNote] = useState("");

  const filtered = inventory.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalProducts = inventory.length;
  const lowStockItems = inventory.filter((i) => getStatus(i.stock, i.minStock) !== "in_stock").length;
  const totalStockValue = inventory.reduce((sum, i) => sum + i.stock * i.cost, 0);

  function handleAddStock(id: string) {
    const qty = parseInt(addQty, 10);
    if (!qty || qty <= 0) return;
    setInventory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, stock: item.stock + qty } : item))
    );
    setAddStockId(null);
    setAddQty("");
    setAddNote("");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center bg-accent/10">
            <Warehouse size={18} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inventory</h1>
            <p className="text-xs text-muted mt-0.5">Track and manage your stock levels</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Products", value: totalProducts, icon: Package, color: "#af9164" },
          { label: "Low Stock Items", value: lowStockItems, icon: AlertTriangle, color: lowStockItems > 0 ? "#f59e0b" : "#10B981" },
          { label: "Total Stock Value", value: fmtRWF(totalStockValue), icon: PackagePlus, color: "#6f1a07" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: stat.color }} />
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${stat.color}10` }}>
                <stat.icon size={16} style={{ color: stat.color }} />
              </div>
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{stat.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-border">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-border">
                <th className="p-4">Name</th>
                <th className="p-4">SKU</th>
                <th className="p-4 text-right">Current Stock</th>
                <th className="p-4 text-right">Min Stock</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Stock Value</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => {
                const status = getStatus(item.stock, item.minStock);
                const cfg = statusConfig[status];
                const StatusIcon = cfg.icon;
                const isAdding = addStockId === item.id;
                const rowHighlight =
                  status === "out" ? "bg-red-50/50" : status === "low" ? "bg-amber-50/30" : "";

                return (
                  <tr key={item.id} className={`hover:bg-surface/50 transition-colors ${rowHighlight}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 flex items-center justify-center bg-surface flex-shrink-0">
                          <Package size={13} className="text-muted" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-xs text-muted font-mono">{item.sku}</td>
                    <td className="p-4 text-right">
                      <span className={`text-sm font-bold ${status === "out" ? "text-red-600" : status === "low" ? "text-amber-600" : "text-foreground"}`}>
                        {item.stock}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm text-muted">{item.minStock}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 ${cfg.bg} ${cfg.text}`}>
                        <StatusIcon size={11} className={cfg.iconColor} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm font-semibold text-foreground">
                      {fmtRWF(item.stock * item.cost)}
                    </td>
                    <td className="p-4 text-right">
                      {!isAdding ? (
                        <button
                          onClick={() => { setAddStockId(item.id); setAddQty(""); setAddNote(""); }}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors"
                        >
                          <Plus size={12} />
                          Add Stock
                        </button>
                      ) : (
                        <div className="inline-flex flex-col gap-1.5 items-end">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              placeholder="Qty"
                              value={addQty}
                              onChange={(e) => setAddQty(e.target.value)}
                              className="w-20 px-2 py-1 border border-border rounded text-xs text-right focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/15"
                            />
                            <button
                              onClick={() => handleAddStock(item.id)}
                              disabled={!addQty || parseInt(addQty, 10) <= 0}
                              className="px-2 py-1 bg-accent text-white text-[11px] font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => { setAddStockId(null); setAddQty(""); setAddNote(""); }}
                              className="px-2 py-1 border border-border text-[11px] text-muted hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={addNote}
                            onChange={(e) => setAddNote(e.target.value)}
                            className="w-full px-2 py-1 border border-border rounded text-[11px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/15"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-muted">
                    No products match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
