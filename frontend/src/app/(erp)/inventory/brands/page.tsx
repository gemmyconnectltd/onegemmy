"use client";

import { useState } from "react";
import { Tag, Plus, Search, Edit2, Trash2, Globe } from "lucide-react";

const initialBrands = [
  { id: "1", name: "Generic",  origin: "China",  products: 3, status: "active" },
  { id: "2", name: "Anker",    origin: "USA",    products: 1, status: "active" },
  { id: "3", name: "Samsung",  origin: "Korea",  products: 1, status: "active" },
  { id: "4", name: "Xiaomi",   origin: "China",  products: 1, status: "active" },
  { id: "5", name: "JBL",      origin: "USA",    products: 1, status: "active" },
  { id: "6", name: "Ugreen",   origin: "China",  products: 1, status: "active" },
  { id: "7", name: "Apple",    origin: "USA",    products: 0, status: "active" },
];

export default function BrandsPage() {
  const [brands, setBrands] = useState(initialBrands);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOrigin, setNewOrigin] = useState("");

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  function handleAdd() {
    if (!newName.trim()) return;
    setBrands((prev) => [
      ...prev,
      { id: String(Date.now()), name: newName.trim(), origin: newOrigin.trim() || "—", products: 0, status: "active" },
    ]);
    setNewName(""); setNewOrigin(""); setAdding(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Brands</h1>
          <p className="text-xs text-muted mt-0.5">{brands.length} brands</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={15} /> Add Brand
        </button>
      </div>

      {adding && (
        <div className="bg-card border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">New Brand</p>
          <div className="grid grid-cols-2 gap-3">
            <input autoFocus type="text" placeholder="Brand name" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
            <input type="text" placeholder="Country of origin" value={newOrigin} onChange={(e) => setNewOrigin(e.target.value)}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors">Save</button>
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
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{b.name}</p>
                <div className="flex items-center gap-1 text-xs text-muted mt-0.5">
                  <Globe size={10} /> {b.origin} · {b.products} products
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded transition-colors">
                  <Edit2 size={13} />
                </button>
                <button className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 px-4 py-10 text-center text-sm text-muted">No brands found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
