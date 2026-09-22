"use client";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { Truck, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, Check, X, Upload } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, useBulkCreateSuppliers } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CsvImportDrawer } from "@/components/ui/CsvImportDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type SupplierForm = { name: string; email: string; phone: string; address: string };
const emptyForm = (): SupplierForm => ({ name: "", email: "", phone: "", address: "" });

const SUPPLIER_CSV_HEADERS = ["name", "email", "phone", "address"];

interface SupplierImportRow {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

function parseSupplierRow(raw: Record<string, string>): { data: SupplierImportRow; errors: string[] } {
  const errors: string[] = [];
  if (!raw.name) errors.push("name required");
  return {
    data: {
      name: raw.name?.trim() ?? "",
      email: raw.email?.trim() || null,
      phone: raw.phone?.trim() || null,
      address: raw.address?.trim() || null,
    },
    errors,
  };
}

/** Shared supplier CRUD UI — rendered from both Inventory > Suppliers and
 *  Procurement > Suppliers, which are two entry points onto the exact same
 *  real supplier data (not separate features). */
export function SuppliersManager() {
  const { brandColor } = useAppConfig();
  const INV_COLOR = brandColor;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [adding, setAdding] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SupplierForm>(emptyForm());

  // Reset to page 1 right where the search changes, not via an effect.
  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };

  const { data, isLoading, isFetching } = useSuppliers(page, pageSize, debouncedSearch || undefined);
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();
  const bulkCreateSuppliers = useBulkCreateSuppliers();
  const suppliers = data?.items ?? [];
  const total = data?.total ?? 0;

  const bulk = useBulkSelection(suppliers.map((s) => s.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Suppliers",
      message: `Delete ${bulk.count} selected supplier${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteSupplier.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

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

  function handleDelete(id: string) {
    confirm({
      title: "Delete Supplier",
      message: "Delete this supplier? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteSupplier.mutate(id),
    });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Suppliers</h1>
          <p className="text-xs text-muted mt-0.5">{total} supplier{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import</Button>
          <Button onClick={() => setAdding(true)} color={INV_COLOR}>
            <Plus size={15} /> Add Supplier
          </Button>
        </div>
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

      <div className="bg-card border border-border">
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search suppliers..." value={search} onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border text-sm focus:border-foreground/30 outline-none" />
          </div>
          {suppliers.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-muted cursor-pointer">
              <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" />
              Select all
            </label>
          )}
        </div>
        {bulk.count > 0 && (
          <div className="p-4 border-b border-border">
            <BulkActionBar count={bulk.count} label="supplier" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
          </div>
        )}
        <div className={`divide-y divide-border transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          {suppliers.map((s) => (
            <div key={s.id} className="px-4 py-4 flex items-start gap-4 hover:bg-surface/40 transition-colors">
              <input
                type="checkbox"
                checked={bulk.selected.has(s.id)}
                onChange={() => bulk.toggle(s.id)}
                className="w-4 h-4 rounded flex-shrink-0 mt-2.5"
              />
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
          {suppliers.length === 0 && (
            <div className="px-4 py-10 text-center">
              <Truck size={32} className="text-border mx-auto mb-3" />
              <p className="text-sm text-muted">No suppliers found.</p>
            </div>
          )}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="suppliers" color={INV_COLOR} />
      </div>

      <CsvImportDrawer<SupplierImportRow>
        open={showImport}
        onClose={() => setShowImport(false)}
        onSubmit={async (items) => { await bulkCreateSuppliers.mutateAsync(items); }}
        title="Import Suppliers"
        itemNoun="supplier"
        templateFilename="suppliers_template.xlsx"
        templateHeaders={SUPPLIER_CSV_HEADERS}
        templateSampleRows={[
          ["Kigali Wholesale", "orders@kigaliwholesale.rw", "+250 788 111 222", "Kigali"],
          ["Anker Distribution", "sales@anker.com", "+250 788 333 444", "Nyarugenge"],
        ]}
        previewColumns={[
          { key: "name", label: "Name", required: true },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "address", label: "Address" },
        ]}
        parseRow={parseSupplierRow}
        color={INV_COLOR}
      />
    </div>
  );
}
