"use client";

import { useState } from "react";
import { Layers, Plus, Search, Edit2, Trash2, Package, ChevronRight } from "lucide-react";

const initialCategories = [
  { id: "1", name: "Accessories", description: "Phone cases, screen protectors, etc.", products: 3, status: "active",   color: "bg-violet-100 text-violet-600" },
  { id: "2", name: "Cables",      description: "USB, HDMI, and charging cables",        products: 2, status: "active",   color: "bg-blue-100 text-blue-600"   },
  { id: "3", name: "Audio",       description: "Earbuds, speakers, headphones",         products: 2, status: "active",   color: "bg-emerald-100 text-emerald-600" },
  { id: "4", name: "Chargers",    description: "Wall chargers, wireless chargers",      products: 1, status: "active",   color: "bg-amber-100 text-amber-600" },
  { id: "5", name: "Storage",     description: "Memory cards, USB drives",              products: 0, status: "inactive", color: "bg-surface text-muted"       },
  { id: "6", name: "Networking",  description: "Routers, switches, cables",             products: 0, status: "active",   color: "bg-pink-100 text-pink-600"   },
];

export default function CategoriesPage() {
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState(initialCategories);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  function handleAdd() {
    if (!newName.trim()) return;
    setCategories((prev) => [...prev, {
      id: String(Date.now()), name: newName.trim(), description: newDesc.trim(),
      products: 0, status: "active", color: "bg-surface text-muted",
    }]);
    setNewName(""); setNewDesc(""); setAdding(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Categories</h1>
          <p className="text-sm text-muted mt-0.5">{categories.length} categories · {categories.filter(c => c.status === "active").length} active</p>
        </div>
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 text-sm font-semibold hover:bg-accent/90 transition-colors rounded-lg">
          <Plus size={15} /> Add Category
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-sm font-bold text-foreground mb-4">New Category</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Name</label>
              <input autoFocus type="text" placeholder="e.g. Electronics" value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Description</label>
              <input type="text" placeholder="Short description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent/90 transition-colors">Save Category</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-border text-sm text-muted rounded-lg hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-card" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-foreground/15 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
                <Layers size={18} />
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors">
                  <Edit2 size={13} />
                </button>
                <button className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <h3 className="text-sm font-bold text-foreground mb-1">{c.name}</h3>
            <p className="text-xs text-muted leading-relaxed mb-4">{c.description || "No description"}</p>
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Package size={12} />
                <span>{c.products} products</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                  {c.status}
                </span>
                <ChevronRight size={13} className="text-muted" />
              </div>
            </div>
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
