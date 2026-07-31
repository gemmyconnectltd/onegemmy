"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, Loader2, Check, X } from "lucide-react";
import { inventoryApi, type ApiSupplier } from "@/lib/api";
import { Button } from "@/components/ui/Button";

const INV_COLOR = "#059669";

type SupplierForm = { name: string; email: string; phone: string; address: string };
const emptyForm = (): SupplierForm => ({ name: "", email: "", phone: "", address: "" });

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SupplierForm>(emptyForm());

  const load = useCallback(async () => {
    try {
      const res = await inventoryApi.listSuppliers();
      setSuppliers(res.data.items);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (s.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await inventoryApi.createSupplier({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      setSuppliers((prev) => [...prev, res.data]);
      setForm(emptyForm()); setAdding(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await inventoryApi.updateSupplier(id, {
        name: editForm.name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
      });
      setSuppliers((prev) => prev.map((s) => s.id === id ? res.data : s));
      setEditingId(null);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this supplier?")) return;
    try {
      await inventoryApi.deleteSupplier(id);
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
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
            <Button onClick={handleAdd} disabled={saving || !form.name.trim()} color={INV_COLOR}>
              {saving ? "Saving…" : "Save"}
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
          <div key={s.label} className="bg-card border border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />
            <p className="text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
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
                    <Button onClick={() => handleEdit(s.id)} disabled={saving} size="sm" color={INV_COLOR} className="rounded">
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
                    }} className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <Trash2 size={13} />
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
