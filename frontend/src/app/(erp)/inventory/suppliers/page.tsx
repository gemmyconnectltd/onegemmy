"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Truck, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, Check, X } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type ApiSupplier } from "@/lib/api";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";

type SupplierForm = { name: string; email: string; phone: string; address: string };
const emptyForm = (): SupplierForm => ({ name: "", email: "", phone: "", address: "" });

export default function SuppliersPage() {
  const { brandColor } = useAppConfig();
  const INV_COLOR = brandColor;
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SupplierForm>(emptyForm());

  const { data, isLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();
  const suppliers = data?.items ?? [];

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (s.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd() {
    if (!form.name.trim() || createSupplier.isPending) return;
    try {
      await createSupplier.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      setForm(emptyForm()); setAdding(false);
    } catch { /* ignore */ }
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim() || updateSupplier.isPending) return;
    try {
      await updateSupplier.mutateAsync({
        id,
        data: {
          name: editForm.name.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          address: editForm.address.trim() || null,
        },
      });
      setEditingId(null);
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this supplier?")) return;
    try {
      await deleteSupplier.mutateAsync(id);
    } catch { /* ignore */ }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Suppliers</h1>
          <p className="text-xs text-muted mt-0.5">{suppliers.length} suppliers</p>
        </div>
        <Button onClick={() => setAdding(true)} color={INV_COLOR}>
          <Plus size={15} /> Add Supplier
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">New Supplier</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(["name", "email", "phone", "address"] as const).map((key) => (
              <input key={key} type="text" placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                className="px-3 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={createSupplier.isPending || !form.name.trim()} color={INV_COLOR}>
              {createSupplier.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Suppliers", value: suppliers.length, color: "#af9164" },
          { label: "Active", value: suppliers.filter((s) => s.is_active).length, color: "#10B981" },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate" title={String(s.value)}>{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
          </div>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((s) => (
            <div key={s.id} className="px-4 py-4 flex items-start gap-4 hover:bg-surface/40 transition-colors">
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0 text-sm font-bold" style={{ backgroundColor: `${INV_COLOR}15`, color: INV_COLOR }}>
                {s.name[0]}
              </div>
              {editingId === s.id ? (
                <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {(["name", "email", "phone", "address"] as const).map((key) => (
                    <input key={key} value={editForm[key]} placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                      onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                      className="px-2 py-1 border border-border text-sm focus:border-foreground/30 outline-none" />
                  ))}
                  <div className="col-span-2 lg:col-span-4 flex gap-2">
                    <Button onClick={() => handleEdit(s.id)} disabled={updateSupplier.isPending} size="sm" color={INV_COLOR} className="rounded">
                      <Check size={12} /> Save
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditingId(null)} className="rounded">
                      <X size={12} /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{s.name}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 ${s.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                        {s.is_active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {s.phone && <span className="flex items-center gap-1"><Phone size={10} /> {s.phone}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail size={10} /> {s.email}</span>}
                      {s.address && <span className="flex items-center gap-1"><MapPin size={10} /> {s.address}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => {
                      setEditingId(s.id);
                      setEditForm({ name: s.name, email: s.email ?? "", phone: s.phone ?? "", address: s.address ?? "" });
                    }} className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Edit2 size={13} /> Edit
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center">
              <Truck size={32} className="text-border mx-auto mb-3" />
              <p className="text-sm text-muted">No suppliers found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
