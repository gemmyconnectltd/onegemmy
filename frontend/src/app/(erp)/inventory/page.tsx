"use client";

import { useState } from "react";
import {
  Package, AlertTriangle, XCircle, Layers,
  Search, Plus, ArrowUpRight, BarChart3, PackagePlus, Upload,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { CURRENCY_SYMBOL, fmtMoney } from "@/lib/config";
import { type ApiProduct } from "@/lib/api";
import { useProducts, useCreateProduct, useBulkCreateProducts, useRestockProduct, useUploadProductImage } from "@/lib/api/hooks";
import { ProductFormDrawer, type ProductFormValues } from "@/components/inventory/ProductFormDrawer";
import { RestockDrawer, type RestockValues } from "@/components/inventory/RestockDrawer";
import { ProductAvatar } from "@/components/inventory/ProductAvatar";
import { Button } from "@/components/ui/Button";

const INV_COLOR = "#059669";

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

const fmt = (v: number) => fmtMoney(v);

function variantStock(p: ApiProduct) {
  if (!p.has_variants || !p.variants?.length) return p.stock;
  return p.variants.reduce((s, v) => s + v.stock, 0);
}

function variantMinStock(p: ApiProduct) {
  if (!p.has_variants || !p.variants?.length) return p.min_stock;
  return p.variants.reduce((s, v) => s + v.min_stock, 0);
}

function variantValue(p: ApiProduct) {
  if (!p.has_variants || !p.variants?.length) return p.stock * p.cost;
  return p.variants.reduce((s, v) => s + v.stock * v.cost, 0);
}

function toRow(p: ApiProduct) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? "",
    category: p.category?.name ?? "",
    stock: variantStock(p),
    minStock: variantMinStock(p),
    price: p.price,
    cost: p.cost,
    value: variantValue(p),
    hasVariants: p.has_variants && (p.variants?.length ?? 0) > 0,
    variantCount: p.variants?.length ?? 0,
  };
}

export default function InventoryOverviewPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"single" | "bulk">("single");
  const [formKey, setFormKey] = useState(0);
  const [restockTarget, setRestockTarget] = useState<ReturnType<typeof toRow> | null>(null);

  const { data, isLoading } = useProducts(1, 200);
  const createProduct = useCreateProduct();
  const uploadProductImage = useUploadProductImage();
  const bulkCreateProducts = useBulkCreateProducts();
  const restockProduct = useRestockProduct();
  const inventory = (data?.items ?? []).map(toRow);

  const handleCreate = async (v: ProductFormValues, imageFile?: File) => {
    const payload = {
      name: v.name, sku: v.sku,
      category_id: v.category_id && !v.category_id.startsWith("__fb") ? v.category_id : null,
      brand_id: v.brand_id && !v.brand_id.startsWith("__fb") ? v.brand_id : null,
      unit_id: v.unit_id && !v.unit_id.startsWith("__fb") ? v.unit_id : null,
      price: v.price, cost: v.cost,
      stock: v.stock, min_stock: v.minStock,
    };
    const res = await createProduct.mutateAsync(payload);
    if (imageFile) await uploadProductImage.mutateAsync({ id: res.data.id, file: imageFile });
  };

  const handleBulkCreate = async (items: ProductFormValues[]) => {
    await bulkCreateProducts.mutateAsync(items.map((v) => ({
      name: v.name, sku: v.sku,
      category_id: v.category_id && !v.category_id.startsWith("__fb") ? v.category_id : null,
      brand_id: v.brand_id && !v.brand_id.startsWith("__fb") ? v.brand_id : null,
      unit_id: v.unit_id && !v.unit_id.startsWith("__fb") ? v.unit_id : null,
      price: v.price, cost: v.cost,
      stock: v.stock, min_stock: v.minStock,
    })));
  };

  const handleRestock = async (v: RestockValues) => {
    if (!restockTarget) return;
    await restockProduct.mutateAsync({ id: restockTarget.id, data: { qty: v.qty, mode: v.mode, reason: v.reason, notes: v.notes } });
    setRestockTarget(null);
  };

  const filtered = inventory.filter((i) => {
    const match = i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase());
    const s = getStatus(i.stock, i.minStock);
    return match && (filter === "all" || s === filter);
  });

  const totalValue = inventory.reduce((s, i) => s + i.value, 0);
  const lowCount   = inventory.filter((i) => getStatus(i.stock, i.minStock) === "low").length;
  const outCount   = inventory.filter((i) => getStatus(i.stock, i.minStock) === "out").length;
  const inCount    = inventory.filter((i) => getStatus(i.stock, i.minStock) === "in_stock").length;
  const totalVariants = inventory.reduce((s, i) => s + i.variantCount, 0);
  const topByValue = [...inventory].sort((a, b) => b.value - a.value).slice(0, 4);

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Inventory Overview</h1>
          <p className="text-sm text-muted mt-0.5">Monitor stock levels, value, and alerts across all products</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => { setFormMode("bulk"); setFormKey((k) => k + 1); setShowForm(true); }}
          >
            <Upload size={15} /> Import
          </Button>
          <Button
            onClick={() => { setFormMode("single"); setFormKey((k) => k + 1); setShowForm(true); }}
            color={INV_COLOR}
          >
            <Plus size={15} /> Add Product
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Products", value: String(inventory.length + totalVariants), sub: "SKUs tracked",     icon: Package,       color: "#af9164", change: null },
          { label: "Stock Value",    value: fmt(totalValue),          sub: "At cost price",    icon: BarChart3,     color: "#6f1a07", change: "+4.2%" },
          { label: "Low Stock",      value: String(lowCount),         sub: "Need reorder",     icon: AlertTriangle, color: "#f59e0b", change: null },
          { label: "Out of Stock",   value: String(outCount),         sub: "Immediate action", icon: XCircle,       color: "#ef4444", change: null },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${s.color}10` }}>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
              {s.change && (
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
                  <ArrowUpRight size={11} />{s.change}
                </span>
              )}
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Stock health + top products */}
      {inventory.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="bg-card border border-border p-5">
            <p className="text-sm font-bold text-foreground mb-4">Stock Health</p>
            <div className="space-y-3">
              {[
                { label: "In Stock",    count: inCount,  total: inventory.length, color: "bg-emerald-500" },
                { label: "Low Stock",   count: lowCount, total: inventory.length, color: "bg-amber-400"   },
                { label: "Out of Stock",count: outCount, total: inventory.length, color: "bg-red-500"     },
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

          <div className="lg:col-span-2 bg-card border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-foreground">Top Products by Value</p>
              <span className="text-[11px] text-muted">At cost price</span>
            </div>
            <div className="space-y-3">
              {topByValue.map((item, i) => {
                const value = item.value;
                const maxValue = topByValue[0].value;
                const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-muted w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                        <span className="text-xs font-bold text-foreground ml-2 flex-shrink-0">{fmt(value)}</span>
                      </div>
                      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: `${INV_COLOR}66` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
                style={filter === f ? { backgroundColor: INV_COLOR } : {}}
                className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  filter === f ? "text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "low" ? "Low" : "Out"}
              </button>
            ))}
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
                <th className="px-5 py-3" />
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
                        <ProductAvatar name={item.name} size={32} />
                        <div>
                          <span className="text-sm font-medium text-foreground">{item.name}</span>
                          {item.hasVariants && (
                            <a href={`/inventory/variants?q=${encodeURIComponent(item.name)}`}
                              className="block text-[11px] font-semibold mt-0.5 hover:underline" style={{ color: INV_COLOR }}>
                              {item.variantCount} variant{item.variantCount !== 1 ? "s" : ""} ›
                            </a>
                          )}
                        </div>
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
                    <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(item.value)}</td>
                    <td className="px-5 py-3.5">
                      {(s === "low" || s === "out") && (
                        item.hasVariants ? (
                          <a href={`/inventory/variants?q=${encodeURIComponent(item.name)}`}
                            className="flex items-center gap-1.5 text-[11px] font-semibold hover:underline whitespace-nowrap"
                            style={{ color: INV_COLOR }}>
                            <Layers size={12} /> Manage Variants
                          </a>
                        ) : (
                          <button
                            onClick={() => setRestockTarget(item)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold hover:underline whitespace-nowrap"
                            style={{ color: INV_COLOR }}
                          >
                            <PackagePlus size={12} /> Restock
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
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
          <p className="text-xs text-muted">Total value: <span className="font-semibold text-foreground">{fmt(filtered.reduce((s, i) => s + i.value, 0))}</span></p>
        </div>
      </div>

      <ProductFormDrawer
        key={formKey}
        open={showForm}
        mode={formMode}
        onClose={() => setShowForm(false)}
        onSubmit={handleCreate}
        onBulkSubmit={handleBulkCreate}
        color={INV_COLOR}
      />

      <RestockDrawer
        open={!!restockTarget}
        onClose={() => setRestockTarget(null)}
        productName={restockTarget?.name ?? ""}
        currentStock={restockTarget?.stock ?? 0}
        onSubmit={handleRestock}
        color={INV_COLOR}
      />
    </div>
  );
}
