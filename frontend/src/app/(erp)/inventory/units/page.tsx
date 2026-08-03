"use client";

import { useState } from "react";
import { Ruler, Plus, Edit2, Trash2, Loader2, Check, X } from "lucide-react";
import { type ApiUnit } from "@/lib/api";
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";

const INV_COLOR = "#059669";

export default function UnitsPage() {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAbbr, setEditAbbr] = useState("");

  const { data, isLoading } = useUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();
  const units = data?.items ?? [];

  async function handleAdd() {
    if (!newName.trim() || createUnit.isPending) return;
    try {
      await createUnit.mutateAsync({ name: newName.trim(), abbreviation: newAbbr.trim() || null });
      setNewName(""); setNewAbbr(""); setAdding(false);
    } catch { /* ignore */ }
  }

  async function handleEdit(id: string) {
    if (!editName.trim() || updateUnit.isPending) return;
    try {
      await updateUnit.mutateAsync({ id, data: { name: editName.trim(), abbreviation: editAbbr.trim() || null } });
      setEditingId(null);
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this unit?")) return;
    try {
      await deleteUnit.mutateAsync(id);
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
          <h1 className="text-xl font-bold text-foreground">Units of Measure</h1>
          <p className="text-xs text-muted mt-0.5">{units.length} units defined</p>
        </div>
        <Button onClick={() => setAdding(true)} color={INV_COLOR}>
          <Plus size={15} /> Add Unit
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">New Unit</p>
          <div className="grid grid-cols-2 gap-3">
            <input autoFocus type="text" placeholder="Unit name (e.g. Piece)" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
            <input type="text" placeholder="Abbreviation (e.g. pcs)" value={newAbbr}
              onChange={(e) => setNewAbbr(e.target.value)}
              className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={createUnit.isPending || !newName.trim()} color={INV_COLOR}>
              {createUnit.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Ruler size={14} className="text-muted" />
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">All Units</p>
        </div>
        <div className="divide-y divide-border">
          {units.map((u) => (
            <div key={u.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface/40 transition-colors">
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${INV_COLOR}15` }}>
                <span className="text-xs font-bold" style={{ color: INV_COLOR }}>{u.abbreviation || u.name[0]}</span>
              </div>
              {editingId === u.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 border border-border text-sm focus:border-foreground/30 outline-none" />
                  <input value={editAbbr} onChange={(e) => setEditAbbr(e.target.value)} placeholder="Abbr"
                    className="w-20 px-2 py-1 border border-border text-sm focus:border-foreground/30 outline-none" />
                  <button onClick={() => handleEdit(u.id)} disabled={updateUnit.isPending}
                    className="w-6 h-6 flex items-center justify-center rounded transition-colors disabled:opacity-50"
                    style={{ color: INV_COLOR }}>
                    <Check size={13} />
                  </button>
                  <button onClick={() => setEditingId(null)}
                    className="w-6 h-6 flex items-center justify-center text-muted hover:bg-surface rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{u.name}</p>
                    {u.abbreviation && <p className="text-xs text-muted">Abbreviation: {u.abbreviation}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingId(u.id); setEditName(u.name); setEditAbbr(u.abbreviation ?? ""); }}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(u.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {units.length === 0 && (
            <div className="px-4 py-10 text-center">
              <Ruler size={32} className="text-border mx-auto mb-3" />
              <p className="text-sm text-muted">No units defined yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
