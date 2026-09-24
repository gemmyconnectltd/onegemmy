"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Building2, Plus, Search, Edit2, Trash2, Users, Check, X, Sparkles } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useDepartments, useCreateOwnDepartment, useUpdateOwnDepartment, useDeleteOwnDepartment } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import ImportTemplatesModal from "./ImportTemplatesModal";

const COLORS = [
  "bg-violet-100 text-violet-600", "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600", "bg-amber-100 text-amber-600",
  "bg-pink-100 text-pink-600", "bg-cyan-100 text-cyan-600",
  "bg-orange-100 text-orange-600", "bg-indigo-100 text-indigo-600",
];
function colorFor(name: string) { return COLORS[name.charCodeAt(0) % COLORS.length]; }

export default function DepartmentsPage() {
  const { brandColor } = useAppConfig();
  const HR_COLOR = brandColor;
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useDepartments();
  const createDepartment = useCreateOwnDepartment();
  const updateDepartment = useUpdateOwnDepartment();
  const deleteDepartment = useDeleteOwnDepartment();
  const departments = data?.items ?? [];

  const filtered = departments.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));
  const bulk = useBulkSelection(filtered.map((d) => d.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Departments",
      message: `Delete ${bulk.count} selected department${bulk.count === 1 ? "" : "s"}? Employees in them will be unassigned, not deleted.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteDepartment.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  async function handleAdd() {
    if (!newName.trim() || createDepartment.isPending) return;
    try {
      await createDepartment.mutateAsync({ name: newName.trim(), description: newDesc.trim() || null });
      setNewName(""); setNewDesc(""); setAdding(false);
    } catch { /* ignore */ }
  }

  async function handleEdit(id: string) {
    if (!editName.trim() || updateDepartment.isPending) return;
    try {
      await updateDepartment.mutateAsync({ id, data: { name: editName.trim(), description: editDesc.trim() || null } });
      setEditingId(null);
    } catch { /* ignore */ }
  }

  function handleDelete(id: string) {
    confirm({
      title: "Delete Department",
      message: "Delete this department? Employees in it will be unassigned, not deleted.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteDepartment.mutate(id),
    });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Departments</h1>
          <p className="text-sm text-muted mt-0.5">{departments.length} departments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)} className="rounded-lg">
            <Sparkles size={15} /> Import Department Templates
          </Button>
          <Button onClick={() => setAdding(!adding)} color={HR_COLOR} className="rounded-lg">
            <Plus size={15} /> Add Department
          </Button>
        </div>
      </div>

      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-sm font-bold text-foreground mb-4">New Department</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">Name</label>
              <input autoFocus type="text" placeholder="e.g. Logistics" value={newName}
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
            <Button onClick={handleAdd} disabled={createDepartment.isPending || !newName.trim()} color={HR_COLOR} className="rounded-lg">
              {createDepartment.isPending ? "Saving…" : "Save Department"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search departments..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-card" />
        </div>
        {filtered.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-muted cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" />
            Select all
          </label>
        )}
      </div>

      <BulkActionBar count={bulk.count} label="department" pluralLabel="departments" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((d) => (
          <div key={d.id} className={`bg-card border rounded-xl p-5 hover:shadow-md transition-all group ${bulk.selected.has(d.id) ? "border-accent" : "border-border hover:border-foreground/15"}`}>
            {editingId === d.id ? (
              <div className="space-y-2">
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description"
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => handleEdit(d.id)} disabled={updateDepartment.isPending} color={HR_COLOR} className="rounded-lg">
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
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={bulk.selected.has(d.id)}
                      onChange={() => bulk.toggle(d.id)}
                      className="w-4 h-4 rounded flex-shrink-0"
                    />
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorFor(d.name)}`}>
                      <Building2 size={18} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setEditingId(d.id); setEditName(d.name); setEditDesc(d.description ?? ""); }}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Edit2 size={13} /> Edit
                    </button>
                    <button onClick={() => handleDelete(d.id)}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">{d.name}</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">{d.description || "No description"}</p>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Users size={12} />
                    <span>Department</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-3 py-16 text-center">
            <Building2 size={36} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No departments found</p>
          </div>
        )}
      </div>

      <ImportTemplatesModal open={showImport} onClose={() => setShowImport(false)} color={HR_COLOR} />
    </div>
  );
}
