"use client";
import { Package, AlertCircle, Layers, ClipboardList } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useProductionOrders, useBoms, useProducts } from "@/lib/api/hooks";

type MaterialUsage = {
  key: string;
  name: string;
  stock: number | null;
  fromOrders: number;
  fromBoms: number;
};

export default function MaterialsPage() {
  const ordersQ = useProductionOrders(1, 500);
  const bomsQ = useBoms(1, 500);
  const productsQ = useProducts(1, 500);
  const loading = ordersQ.isLoading || bomsQ.isLoading || productsQ.isLoading;
  const orders = ordersQ.data?.items ?? [];
  const boms = bomsQ.data?.items ?? [];
  const products = productsQ.data?.items ?? [];

  const loadError = ordersQ.error ?? bomsQ.error ?? productsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load materials" : null;

  const stockByProductId = new Map(products.map((p) => [p.id, p.stock]));

  const usage = new Map<string, MaterialUsage>();
  const bump = (key: string, name: string, productId: string | null, field: "fromOrders" | "fromBoms", qty: number) => {
    const existing = usage.get(key) ?? {
      key, name, stock: productId ? stockByProductId.get(productId) ?? null : null,
      fromOrders: 0, fromBoms: 0,
    };
    existing[field] += qty;
    usage.set(key, existing);
  };

  for (const o of orders) {
    // Only orders still consuming stock going forward — Completed orders
    // already happened, Cancelled ones never will. This reads as
    // "what's currently committed", not a historical ledger.
    if (o.status === "Completed" || o.status === "Cancelled") continue;
    for (const item of o.items) {
      const key = item.product_id ?? `name:${item.product_name}`;
      bump(key, item.product_name ?? "Unnamed component", item.product_id, "fromOrders", item.quantity_required);
    }
  }
  for (const b of boms) {
    for (const item of b.items) {
      const key = item.component_product_id ?? `name:${item.component_product_name}`;
      bump(key, item.component_product_name ?? "Unnamed component", item.component_product_id, "fromBoms", item.quantity_required);
    }
  }

  const rows = [...usage.values()].sort((a, b) => (b.fromOrders + b.fromBoms) - (a.fromOrders + a.fromBoms));
  const lowStock = rows.filter((r) => r.stock !== null && r.stock < r.fromOrders);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Materials</h1>
        <p className="text-sm text-muted mt-0.5">
          {loading ? "Loading..." : `${rows.length} components used across your work orders and BOMs`}
        </p>
      </div>

      {loadErrorMessage && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {loadErrorMessage}
        </div>
      )}

      {!loading && lowStock.length > 0 && (
        <div className="flex items-start gap-2.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{lowStock.length} component{lowStock.length === 1 ? "" : "s"} short on stock for open work orders</p>
            <p className="text-amber-600/80 mt-0.5">{lowStock.map((r) => r.name).join(", ")}</p>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <PageLoader variant="compact" />
        ) : rows.length === 0 ? (
          <div className="py-20 text-center">
            <Package size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No components tracked yet</p>
            <p className="text-xs text-muted mt-1">Add components to a work order or BOM to see usage here</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Component</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">In Stock</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                  <span className="inline-flex items-center gap-1"><ClipboardList size={11} /> Open Orders Need</span>
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                  <span className="inline-flex items-center gap-1"><Layers size={11} /> Used in BOMs</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const short = r.stock !== null && r.stock < r.fromOrders;
                return (
                  <tr key={r.key} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package size={13} className="text-muted" />
                        <span className="text-sm font-medium text-foreground">{r.name}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${short ? "text-red-600" : "text-foreground"}`}>
                      {r.stock ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted tabular-nums">{r.fromOrders || "—"}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted tabular-nums">{r.fromBoms || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
