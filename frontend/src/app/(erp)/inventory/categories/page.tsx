"use client";

import { useState, useEffect } from "react";
import { Layers, Plus, Search, Edit2, Trash2, Package, Loader2, Check, X } from "lucide-react";
import { inventoryApi, type ApiCategory } from "@/lib/api";
import { Button } from "@/components/ui/Button";

const INV_COLOR = "#059669";

const COLORS = [
  "bg-violet-100 text-violet-600", "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600", "bg-amber-100 text-amber-600",
  "bg-pink-100 text-pink-600", "bg-cyan-100 text-cyan-600",
  "bg-orange-100 text-orange-600", "bg-indigo-100 text-indigo-600",
];
function colorFor(name: string) { return COLORS[name.charCodeAt(0) % COLORS.length]; }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

useEffect(() => {
    inventoryApi.listCategories()
      .then((res) => setCategories(res.data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  async function handleAdd() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await inventoryApi.createCategory({ name: newName.trim(), description: newDesc.trim() || null });
      setCategories((prev) => [...prev, res.data]);
      setNewName(""); setNewDesc(""); setAdding(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleEdit(id: string) {
    if (!editName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await inventoryApi.updateCategory(id, { name: editName.trim(), description: editDesc.trim() || null });
      setCategories((prev) => prev.map((c) => c.id === id ? res.data : c));
      setEditingId(null);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this category?")) return;
    try {
      await inventoryApi.deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch { /* ignore */ }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Categories</h1>
          <p className="text-sm text-muted mt-0.5">{categories.length} categories</p>
        </div>
        <Button onClick={() => setAdding(!adding)} color={INV_COLOR} className="rounded-lg">
          <Plus size={15} /> Add Category
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-sm font-bold text-foreground mb-4">New Category</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Name</label>
              <input autoFocus type="text" placeholder="e.g. Electronics" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Description</label>
              <input type="text" placeholder="Short description (optional)" value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={saving || !newName.trim()} color={INV_COLOR} className="rounded-lg">
              {saving ? "Saving…" : "Save Category"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-card" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-foreground/15 transition-all group">
            {editingId === c.id ? (
              <div className="space-y-2">
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description"
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => handleEdit(c.id)} disabled={saving} color={INV_COLOR} className="rounded-lg">
                    <Check size={12} /> Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(null)} className="rounded-lg">
                    <X size={12} /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorFor(c.name)}`}>
                    <Layers size={18} />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); setEditDesc(c.description ?? ""); }}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">{c.name}</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">{c.description || "No description"}</p>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Package size={12} />
                    <span>Category</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-3 py-16 text-center">
            <Layers size={36} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No categories found</p>
          </div>
        )}
      </div>
    </div>
  );
}
