"use client";

import { useState } from "react";
import { Layers, Search, PackagePlus, Trash2, Edit2, Plus, Loader2 } from "lucide-react";
import { type ApiVariantListItem } from "@/lib/api";
import { useAllVariants, useProducts, useCreateVariant, useUpdateVariant, useRestockVariant, useDeleteVariant } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { Button } from "@/components/ui/Button";

const INV_COLOR = "#059669";

const fmt = (v: number) => fmtMoney(v);
function margin(v: ApiVariantListItem) { return v.price > 0 ? Math.round(((v.price - v.cost) / v.price) * 100) : 0; }

const attrLabel = (v: ApiVariantListItem) => {
  const entries = Object.entries(v.attributes);
  return entries.length ? entries.map(([k, val]) => `${k}: ${val}`).join(" · ") : "No attributes";
};

type EditForm = { sku: string; price: number; cost: number; stock: number; min_stock: number; is_active: boolean; attributes: Record<string, string> };

const EMPTY_CREATE: EditForm & { product_id: string } = { product_id: "", sku: "", price: 0, cost: 0, stock: 0, min_stock: 0, is_active: true, attributes: {} };

function AttributeEditor({ attrs, onChange }: { attrs: Record<string, string>; onChange: (a: Record<string, string>) => void }) {
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");
  const entries = Object.entries(attrs);

  const add = () => {
    if (!key.trim()) return;
    onChange({ ...attrs, [key.trim()]: val.trim() });
    setKey(""); setVal("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-border text-foreground">
            {k}: {v}
            <button onClick={() => { const n = { ...attrs }; delete n[k]; onChange(n); }} className="text-muted hover:text-red-500 ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. Color"
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface/50 outline-none focus:border-foreground/30" />
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Red"
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface/50 outline-none focus:border-foreground/30" />
        <button onClick={add} className="px-3 py-1.5 text-sm font-semibold bg-surface border border-border rounded-lg hover:bg-surface/80">Add</button>
      </div>
    </div>
  );
}

export default function VariantsPage() {
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [restocking, setRestocking] = useState<ApiVariantListItem | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [restockMode, setRestockMode] = useState<"restock" | "adjust">("restock");
  const [deleteTarget, setDeleteTarget] = useState<ApiVariantListItem | null>(null);
  const [editing, setEditing] = useState<ApiVariantListItem | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [adding, setAdding] = useState(false);
  const [createForm, setCreateForm] = useState<EditForm & { product_id: string }>(EMPTY_CREATE);

  const { data, isLoading } = useAllVariants(1, 200);
  const { data: productsData, isFetching: loadingProducts } = useProducts(1, 200, { enabled: adding });
  const createVariant = useCreateVariant();
  const updateVariant = useUpdateVariant();
  const restockVariant = useRestockVariant();
  const deleteVariant = useDeleteVariant();
  const variants = data?.items ?? [];
  const products = productsData?.items ?? [];

  const filtered = variants.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch =
      (v.product_name ?? "").toLowerCase().includes(q) ||
      (v.product_sku ?? "").toLowerCase().includes(q) ||
      (v.sku ?? "").toLowerCase().includes(q) ||
      attrLabel(v).toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? v.is_active : !v.is_active);
    return matchSearch && matchStatus;
  });

  const handleRestock = async () => {
    if (!restocking || restockVariant.isPending) return;
    try {
      await restockVariant.mutateAsync({ productId: restocking.product_id, id: restocking.id, data: { qty: restockQty, mode: restockMode } });
      setRestocking(null);
      setRestockQty(0);
    } catch { /* ignore */ }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteVariant.mutateAsync({ productId: deleteTarget.product_id, id: deleteTarget.id });
      setDeleteTarget(null);
    } catch { /* ignore */ }
  };

  const openEdit = (v: ApiVariantListItem) => {
    setEditing(v);
    setEditForm({ sku: v.sku ?? "", price: v.price, cost: v.cost, stock: v.stock, min_stock: v.min_stock, is_active: v.is_active, attributes: v.attributes });
  };

  const openAdd = () => {
    setCreateForm(EMPTY_CREATE);
    setAdding(true);
  };

  const handleCreate = async () => {
    if (!createForm.product_id || createVariant.isPending) return;
    try {
      const { product_id, ...payload } = createForm;
      await createVariant.mutateAsync({ productId: product_id, data: { ...payload, sku: payload.sku || null } });
      setAdding(false);
    } catch { /* ignore */ }
  };

  const handleUpdate = async () => {
    if (!editing || !editForm || updateVariant.isPending) return;
    try {
      await updateVariant.mutateAsync({ productId: editing.product_id, id: editing.id, data: { ...editForm, sku: editForm.sku || null } });
      setEditing(null);
      setEditForm(null);
    } catch { /* ignore */ }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Variants</h1>
          <p className="text-sm text-muted mt-0.5">{variants.length} variants · {variants.filter((v) => v.is_active).length} active</p>
        </div>
        <Button onClick={openAdd} color={INV_COLOR} className="rounded-lg">
          <Plus size={15} /> Add Variant
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search variants..." value={search} onChange={(e) => setSearch(e.target.value)}
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
                {["Product", "Attributes", "SKU", "Cost", "Price", "Margin", "Stock", "Status", ""].map((h, i) => (
                  <th key={i} className={`px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider ${["Cost","Price","Margin","Stock"].includes(h) ? "text-right" : h === "Status" ? "text-center" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-surface/40 transition-colors group">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-foreground">{v.product_name ?? "—"}</p>
                    {v.product_sku && <p className="text-[11px] text-muted font-mono">{v.product_sku}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex max-w-56 truncate text-xs font-semibold px-2 py-0.5 rounded-full bg-surface text-muted">
                      {attrLabel(v)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted font-mono">{v.sku ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{fmt(v.cost)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(v.price)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{margin(v)}%</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-bold text-foreground tabular-nums">{v.stock}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${v.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${v.is_active ? "bg-emerald-500" : "bg-muted"}`} />
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEdit(v)}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                        <Edit2 size={13} /> Edit
                      </button>
                      <button onClick={() => { setRestocking(v); setRestockQty(0); setRestockMode("restock"); }}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                        <PackagePlus size={13} /> Restock
                      </button>
                      <button onClick={() => setDeleteTarget(v)}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <Layers size={36} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-semibold text-muted">No variants found</p>
                    <p className="text-xs text-muted/70 mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border bg-surface/30 flex items-center justify-between">
          <p className="text-xs text-muted">{filtered.length} of {variants.length} variants</p>
          <p className="text-xs text-muted">Total stock value: <span className="font-semibold text-foreground">{fmt(filtered.reduce((s, v) => s + v.stock * v.cost, 0))}</span></p>
        </div>
      </div>

      {restocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRestocking(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-sm font-semibold text-foreground">Update stock</p>
              <p className="text-xs text-muted mt-0.5">{restocking.product_name ?? "Product"} · {attrLabel(restocking)} · Current: {restocking.stock}</p>
            </div>
            <div className="flex gap-2">
              {(["restock", "adjust"] as const).map((m) => (
                <button key={m} onClick={() => setRestockMode(m)}
                  style={restockMode === m ? { backgroundColor: INV_COLOR } : {}}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${restockMode === m ? "text-white" : "border border-border text-muted"}`}>
                  {m}
                </button>
              ))}
            </div>
            <input type="number" value={restockQty} onChange={(e) => setRestockQty(+e.target.value)}
              placeholder={restockMode === "adjust" ? "Set stock to…" : "Add qty…"}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRestocking(null)} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
              <Button onClick={handleRestock} disabled={restockVariant.isPending} color={INV_COLOR} className="flex-1 rounded-lg text-[13px] text-white">
                {restockVariant.isPending ? "Saving…" : "Update Stock"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <p className="text-sm font-semibold text-foreground">Delete variant?</p>
            <p className="text-xs text-muted">{deleteTarget.product_name ?? "Product"} · {attrLabel(deleteTarget)}</p>
            <p className="text-xs text-muted">This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} className="flex-1 rounded-lg text-[13px]">Delete</Button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAdding(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-[26rem] space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-sm font-semibold text-foreground">Add variant</p>
              <p className="text-xs text-muted mt-0.5">Track different sizes, colors, etc.</p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Product</label>
              {loadingProducts ? (
                <div className="mt-1 flex items-center justify-center py-2">
                  <Loader2 size={16} className="animate-spin text-muted" />
                </div>
              ) : (
                <select value={createForm.product_id} onChange={(e) => setCreateForm((f) => ({ ...f, product_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30">
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">SKU</label>
                <input value={createForm.sku} onChange={(e) => setCreateForm((f) => ({ ...f, sku: e.target.value }))} placeholder="Optional"
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Price</label>
                <input type="number" value={createForm.price} onChange={(e) => setCreateForm((f) => ({ ...f, price: +e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Cost</label>
                <input type="number" value={createForm.cost} onChange={(e) => setCreateForm((f) => ({ ...f, cost: +e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Stock</label>
                <input type="number" value={createForm.stock} onChange={(e) => setCreateForm((f) => ({ ...f, stock: +e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Min stock</label>
                <input type="number" value={createForm.min_stock} onChange={(e) => setCreateForm((f) => ({ ...f, min_stock: +e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Attributes</label>
                <div className="mt-1">
                  <AttributeEditor attrs={createForm.attributes} onChange={(a) => setCreateForm((f) => ({ ...f, attributes: a }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAdding(false)} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
              <Button onClick={handleCreate} disabled={createVariant.isPending || !createForm.product_id} color={INV_COLOR} className="flex-1 rounded-lg text-[13px] text-white">
                {createVariant.isPending ? "Saving…" : "Create Variant"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editing && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditing(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-[26rem] space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-sm font-semibold text-foreground">Edit variant</p>
              <p className="text-xs text-muted mt-0.5">{editing.product_name ?? "Product"} · {attrLabel(editing)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">SKU</label>
                <input value={editForm.sku} onChange={(e) => setEditForm((f) => f && { ...f, sku: e.target.value })} placeholder="Optional"
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Price</label>
                <input type="number" value={editForm.price} onChange={(e) => setEditForm((f) => f && { ...f, price: +e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Cost</label>
                <input type="number" value={editForm.cost} onChange={(e) => setEditForm((f) => f && { ...f, cost: +e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Stock</label>
                <input type="number" value={editForm.stock} onChange={(e) => setEditForm((f) => f && { ...f, stock: +e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Min stock</label>
                <input type="number" value={editForm.min_stock} onChange={(e) => setEditForm((f) => f && { ...f, min_stock: +e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:border-foreground/30" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Attributes</label>
                <div className="mt-1">
                  <AttributeEditor attrs={editForm.attributes} onChange={(a) => setEditForm((f) => f && { ...f, attributes: a })} />
                </div>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-foreground/70">
                <input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm((f) => f && { ...f, is_active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setEditing(null); setEditForm(null); }} className="flex-1 rounded-lg text-[13px]">Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateVariant.isPending} color={INV_COLOR} className="flex-1 rounded-lg text-[13px] text-white">
                {updateVariant.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
