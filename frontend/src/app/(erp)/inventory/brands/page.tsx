"use client";

import { useState } from "react";
import { Tag, Plus, Search, Edit2, Trash2, Loader2, Check, X } from "lucide-react";
import { type ApiBrand } from "@/lib/api";
import { useBrands, useCreateBrand, useUpdateBrand, useDeleteBrand } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";

const INV_COLOR = "#059669";

export default function BrandsPage() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const { data, isLoading } = useBrands();
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const deleteBrand = useDeleteBrand();
  const brands = data?.items ?? [];

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  async function handleAdd() {
    if (!newName.trim() || createBrand.isPending) return;
    try {
      await createBrand.mutateAsync({ name: newName.trim(), description: newDesc.trim() || null });
      setNewName(""); setNewDesc(""); setAdding(false);
    } catch { /* ignore */ }
  }

  async function handleEdit(id: string) {
    if (!editName.trim() || updateBrand.isPending) return;
    try {
      await updateBrand.mutateAsync({ id, data: { name: editName.trim(), description: editDesc.trim() || null } });
      setEditingId(null);
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this brand?")) return;
    try {
      await deleteBrand.mutateAsync(id);
    } catch { /* ignore */ }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Brands</h1>
          <p className="text-xs text-muted mt-0.5">{brands.length} brands</p>
        </div>
        <Button onClick={() => setAdding(true)} color={INV_COLOR}>
          <Plus size={15} /> Add Brand
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">New Brand</p>
          <div className="grid grid-cols-2 gap-3">
            <input autoFocus type="text" placeholder="Brand name" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
            <input type="text" placeholder="Description (optional)" value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={createBrand.isPending || !newName.trim()} color={INV_COLOR}>
              {createBrand.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search brands..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-foreground/30 outline-none bg-surface/50" />
          </div>
          <span className="text-xs text-muted">{filtered.length} results</span>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((b) => (
            <div key={b.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-surface/40 transition-colors group">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{ backgroundColor: `${INV_COLOR}15`, color: INV_COLOR }}>
                {b.name[0].toUpperCase()}
              </div>
              {editingId === b.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-border text-sm focus:border-foreground/30 outline-none rounded-lg" />
                  <button onClick={() => handleEdit(b.id)} disabled={updateBrand.isPending}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50"
                    style={{ color: INV_COLOR }}>
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="w-7 h-7 flex items-center justify-center text-muted hover:bg-surface rounded-lg transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{b.name}</p>
                    {b.description && <p className="text-xs text-muted mt-0.5 truncate">{b.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setEditingId(b.id); setEditName(b.name); setEditDesc(b.description ?? ""); }}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Edit2 size={13} /> Edit
                    </button>
                    <button onClick={() => handleDelete(b.id)}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-16 text-center">
              <Tag size={32} className="text-border mx-auto mb-3" />
              <p className="text-sm font-semibold text-muted">No brands found</p>
              <p className="text-xs text-muted/60 mt-1">Add your first brand to get started</p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border">
          <p className="text-xs text-muted">{brands.length} total brands</p>
        </div>
      </div>
    </div>
  );
}
