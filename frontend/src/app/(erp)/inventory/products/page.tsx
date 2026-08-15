"use client";

import { useState } from "react";
import { Package, Plus, Search, Edit2, Trash2, MoreVertical, PackagePlus, Layers, Upload } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { CURRENCY_SYMBOL, fmtMoney } from "@/lib/config";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { ProductFormDrawer, type ProductFormValues } from "@/components/inventory/ProductFormDrawer";
import { RestockDrawer, type RestockValues } from "@/components/inventory/RestockDrawer";
import { ProductAvatar } from "@/components/inventory/ProductAvatar";
import { VariantsDrawer } from "@/components/inventory/VariantsDrawer";
import { type ApiProduct } from "@/lib/api";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useRestockProduct, useBulkCreateProducts, useUploadProductImage } from "@/lib/api/hooks";

const INV_COLOR = "#059669";

const fmt = (v: number) => fmtMoney(v);
function margin(p: ApiProduct) { return p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0; }
function variantStock(p: ApiProduct) {
  if (!p.has_variants || !p.variants?.length) return p.stock;
  return p.variants.reduce((s, v) => s + v.stock, 0);
}

function toFormValues(p: ApiProduct): ProductFormValues {
  return {
    name: p.name,
    sku: p.sku ?? "",
    category: p.category?.name ?? "",
    category_id: p.category_id ?? "",
    brand: p.brand?.name ?? "",
    brand_id: p.brand_id ?? "",
    unit: p.unit?.name ?? "",
    unit_id: p.unit_id ?? "",
    price: p.price,
    cost: p.cost,
    stock: p.stock,
    minStock: p.min_stock,
  };
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"single" | "bulk">("single");
  const [editing, setEditing] = useState<ApiProduct | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ApiProduct | null>(null);
  const [restockTarget, setRestockTarget] = useState<ApiProduct | null>(null);
  const [variantsTarget, setVariantsTarget] = useState<ApiProduct | null>(null);

  const { data, isLoading } = useProducts(1, 200);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const restockProduct = useRestockProduct();
  const bulkCreateProducts = useBulkCreateProducts();
  const uploadProductImage = useUploadProductImage();
  const products = data?.items ?? [];

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category?.name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? p.is_active : !p.is_active);
    return matchSearch && matchStatus;
  });

  const handleSubmit = async (v: ProductFormValues, imageFile?: File) => {
    const payload = {
      name: v.name, sku: v.sku,
      category_id: v.category_id && !v.category_id.startsWith("__fb") ? v.category_id : null,
      brand_id: v.brand_id && !v.brand_id.startsWith("__fb") ? v.brand_id : null,
      unit_id: v.unit_id && !v.unit_id.startsWith("__fb") ? v.unit_id : null,
      price: v.price, cost: v.cost, stock: v.stock, min_stock: v.minStock,
    };
    if (editing) {
      await updateProduct.mutateAsync({ id: editing.id, data: payload });
      if (imageFile) await uploadProductImage.mutateAsync({ id: editing.id, file: imageFile });
      setEditing(null);
    } else {
      const res = await createProduct.mutateAsync(payload);
      if (imageFile) await uploadProductImage.mutateAsync({ id: res.data.id, file: imageFile });
    }
  };

  const handleBulkSubmit = async (items: ProductFormValues[]) => {
    await bulkCreateProducts.mutateAsync(items.map((v) => ({
      name: v.name, sku: v.sku,
      category_id: v.category_id && !v.category_id.startsWith("__fb") ? v.category_id : null,
      brand_id: v.brand_id && !v.brand_id.startsWith("__fb") ? v.brand_id : null,
      unit_id: v.unit_id && !v.unit_id.startsWith("__fb") ? v.unit_id : null,
      price: v.price, cost: v.cost, stock: v.stock, min_stock: v.minStock,
    })));
  };

  const handleRestock = async (v: RestockValues) => {
    if (!restockTarget) return;
    await restockProduct.mutateAsync({ id: restockTarget.id, data: { qty: v.qty, mode: v.mode, reason: v.reason, notes: v.notes } });
    setRestockTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteProduct.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Products</h1>
          <p className="text-sm text-muted mt-0.5">{products.length} products · {products.filter((p) => p.is_active).length} active</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { setEditing(null); setFormMode("bulk"); setFormKey((k) => k + 1); setShowForm(true); }} className="rounded-lg">
            <Upload size={15} /> Import
          </Button>
          <Button onClick={() => { setEditing(null); setFormMode("single"); setFormKey((k) => k + 1); setShowForm(true); }} color={INV_COLOR} className="rounded-lg">
            <Plus size={15} /> Add Product
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-surface/50" />
          </div>
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                style={statusFilter === f ? { backgroundColor: INV_COLOR } : {}}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${statusFilter === f ? "text-white" : "text-muted hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted ml-auto">{filtered.length} results</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left">
                {["Product", "Category", "Brand", "Cost", "Price", "Margin", "Stock", "Status", ""].map((h, i) => (
                  <th key={i} className={`px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider ${["Cost","Price","Margin","Stock"].includes(h) ? "text-right" : h === "Status" ? "text-center" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-surface/40 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <ProductAvatar name={p.name} imageUrl={p.image_url ?? undefined} size={32} className="rounded-lg" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        <p className="text-[11px] text-muted font-mono">{p.sku}</p>
                        {p.has_variants && (p.variants?.length ?? 0) > 0 && (
                          <button onClick={() => setVariantsTarget(p)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: INV_COLOR }}>
                            <Layers size={11} /> {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface text-muted">
                      {p.category?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted">{p.brand?.name ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{fmt(p.cost)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(p.price)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{margin(p)}%</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-bold text-foreground tabular-nums">{variantStock(p)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? "bg-emerald-500" : "bg-muted"}`} />
                      {p.is_active ? "Active" : "Inactive"}
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
                          <button onClick={() => { setOpenMenu(null); setEditing(p); setFormMode("single"); setFormKey((k) => k + 1); setShowForm(true); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface transition-colors">
                            <Edit2 size={13} className="text-muted" /> Edit
                          </button>
                          <button onClick={() => { setOpenMenu(null); setRestockTarget(p); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface transition-colors">
                            <PackagePlus size={13} style={{ color: INV_COLOR }} /> Restock
                          </button>
                          <button onClick={() => { setOpenMenu(null); setVariantsTarget(p); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface transition-colors">
                            <Layers size={13} className="text-muted" /> Variants
                          </button>
                          <button onClick={() => { setOpenMenu(null); setDeleteTarget(p); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
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

      <ProductFormDrawer
        key={formKey}
        open={showForm}
        mode={formMode}
        onClose={() => { setShowForm(false); setEditing(null); }}
        initial={editing ? toFormValues(editing) : null}
        onSubmit={handleSubmit}
        onBulkSubmit={handleBulkSubmit}
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

      <VariantsDrawer
        open={!!variantsTarget}
        onClose={() => setVariantsTarget(null)}
        productId={variantsTarget?.id ?? ""}
        productName={variantsTarget?.name ?? ""}
        color={INV_COLOR}
      />

      <Drawer
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Product"
        description="This action cannot be undone."
        side="center"
        size="sm"
        footer={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg text-[13px]">
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirmDelete} className="flex-1 rounded-lg text-[13px] font-bold">
              Delete
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <p className="text-sm text-foreground/70">
            Are you sure you want to delete <span className="font-semibold text-foreground">&quot;{deleteTarget?.name}&quot;</span>? This will remove it from your inventory.
          </p>
        </div>
      </Drawer>
    </div>
  );
}
