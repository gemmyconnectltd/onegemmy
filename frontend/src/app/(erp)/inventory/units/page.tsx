"use client";

import { useState } from "react";
import { Ruler, Plus, Edit2, Trash2 } from "lucide-react";

const initialUnits = [
  { id: "1", name: "Piece",     abbreviation: "pcs",  type: "Count",  products: 7 },
  { id: "2", name: "Box",       abbreviation: "box",  type: "Count",  products: 2 },
  { id: "3", name: "Kilogram",  abbreviation: "kg",   type: "Weight", products: 0 },
  { id: "4", name: "Gram",      abbreviation: "g",    type: "Weight", products: 0 },
  { id: "5", name: "Litre",     abbreviation: "L",    type: "Volume", products: 0 },
  { id: "6", name: "Metre",     abbreviation: "m",    type: "Length", products: 1 },
  { id: "7", name: "Pack",      abbreviation: "pack", type: "Count",  products: 0 },
];

const types = ["Count", "Weight", "Volume", "Length", "Other"];

export default function UnitsPage() {
  const [units, setUnits] = useState(initialUnits);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [newType, setNewType] = useState("Count");

  function handleAdd() {
    if (!newName.trim()) return;
    setUnits((prev) => [
      ...prev,
      { id: String(Date.now()), name: newName.trim(), abbreviation: newAbbr.trim(), type: newType, products: 0 },
    ]);
    setNewName(""); setNewAbbr(""); setNewType("Count"); setAdding(false);
  }

  const grouped = types.map((t) => ({ type: t, items: units.filter((u) => u.type === t) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Units of Measure</h1>
          <p className="text-xs text-muted mt-0.5">{units.length} units defined</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors">
          <Plus size={15} /> Add Unit
        </button>
      </div>

      {adding && (
        <div className="bg-white border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">New Unit</p>
          <div className="grid grid-cols-3 gap-3">
            <input autoFocus type="text" placeholder="Unit name (e.g. Piece)" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
            <input type="text" placeholder="Abbreviation (e.g. pcs)" value={newAbbr} onChange={(e) => setNewAbbr(e.target.value)}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
            <select value={newType} onChange={(e) => setNewType(e.target.value)}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none bg-white">
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors">Save</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-border text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {grouped.map((g) => (
          <div key={g.type} className="bg-white border border-border">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Ruler size={14} className="text-muted" />
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">{g.type}</p>
            </div>
            <div className="divide-y divide-border">
              {g.items.map((u) => (
                <div key={u.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface/40 transition-colors">
                  <div className="w-10 h-10 bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-accent">{u.abbreviation}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{u.name}</p>
                    <p className="text-xs text-muted">{u.products} products using this unit</p>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
