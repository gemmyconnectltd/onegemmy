"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Ruler, Plus, Edit2, Trash2, Check, X, Sparkles } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type ApiUnit } from "@/lib/api";
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import ImportUnitsModal from "./ImportUnitsModal";

export default function UnitsPage() {
  const { brandColor } = useAppConfig();
  const INV_COLOR = brandColor;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAbbr, setEditAbbr] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();
  const units = data?.items ?? [];
  const bulk = useBulkSelection(units.map((u) => u.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Units",
      message: `Delete ${bulk.count} selected unit${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteUnit.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

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

  function handleDelete(id: string) {
    confirm({
      title: "Delete Unit",
      message: "Delete this unit? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteUnit.mutate(id),
    });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Units of Measure</h1>
          <p className="text-xs text-muted mt-0.5">{units.length} units defined</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Sparkles size={15} /> Import Common Units
          </Button>
          <Button onClick={() => setAdding(true)} color={INV_COLOR}>
            <Plus size={15} /> Add Unit
          </Button>
        </div>
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
          {units.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-muted cursor-pointer ml-auto">
              <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" />
              Select all
            </label>
          )}
        </div>
        {bulk.count > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <BulkActionBar count={bulk.count} label="unit" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
          </div>
        )}
        <div className="divide-y divide-border">
          {units.map((u) => (
            <div key={u.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface/40 transition-colors">
              <input
                type="checkbox"
                checked={bulk.selected.has(u.id)}
                onChange={() => bulk.toggle(u.id)}
                className="w-4 h-4 rounded flex-shrink-0"
              />
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
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Edit2 size={13} /> Edit
                    </button>
                    <button onClick={() => handleDelete(u.id)}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Trash2 size={13} /> Delete
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

      <ImportUnitsModal open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
