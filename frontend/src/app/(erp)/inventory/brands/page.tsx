"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag, Plus, Search, Edit2, Trash2, Loader2, Check, X } from "lucide-react";
import { inventoryApi, type ApiBrand } from "@/lib/api";

export default function BrandsPage() {
  const [brands, setBrands] = useState<ApiBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await inventoryApi.listBrands();
      setBrands(res.data.items);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  async function handleAdd() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await inventoryApi.createBrand({ name: newName.trim(), description: newDesc.trim() || null });
      setBrands((prev) => [...prev, res.data]);
      setNewName(""); setNewDesc(""); setAdding(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleEdit(id: string) {
    if (!editName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await inventoryApi.updateBrand(id, { name: editName.trim(), description: editDesc.trim() || null });
      setBrands((prev) => prev.map((b) => b.id === id ? res.data : b));
      setEditingId(null);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this brand?")) return;
    try {
      await inventoryApi.deleteBrand(id);
      setBrands((prev) => prev.filter((b) => b.id !== id));
    } catch { /* ignore */ }
  }

  if (loading) return (
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
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={15} /> Add Brand
        </button>
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
            <button onClick={handleAdd} disabled={saving || !newName.trim()}
              className="px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-border text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search brands..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {filtered.map((b) => (
            <div key={b.id} className="bg-card p-4 flex items-center gap-3 hover:bg-surface/40 transition-colors">
              <div className="w-10 h-10 bg-foreground/5 flex items-center justify-center flex-shrink-0 text-sm font-bold text-foreground/40">
                {b.name[0]}
              </div>
              {editingId === b.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 border border-border text-sm focus:border-foreground/30 outline-none" />
                  <button onClick={() => handleEdit(b.id)} disabled={saving}
                    className="w-6 h-6 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50">
                    <Check size={13} />
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="w-6 h-6 flex items-center justify-center text-muted hover:bg-surface rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{b.name}</p>
                    {b.description && <p className="text-xs text-muted mt-0.5 truncate">{b.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingId(b.id); setEditName(b.name); setEditDesc(b.description ?? ""); }}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(b.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 px-4 py-10 text-center">
              <Tag size={32} className="text-border mx-auto mb-3" />
              <p className="text-sm text-muted">No brands found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
