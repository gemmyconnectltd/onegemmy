"use client";

import { useState } from "react";
import { Plus, AlertTriangle, X } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type InventoryBatch } from "@/lib/api";
import { useBatches, useCreateBatch, useDeleteBatch } from "@/lib/api/hooks";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

const EMPTY_FORM = {
  product_id: "", batch_number: "", quantity: "",
  unit_cost: "", manufactured_date: "", expiry_date: "",
  supplier_id: "", notes: "",
};

function expiryClass(days: number | null) {
  if (days === null) return "";
  if (days < 0) return "bg-red-100 text-red-700";
  if (days <= 30) return "bg-orange-100 text-orange-700";
  if (days <= 90) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function expiryLabel(days: number | null) {
  if (days === null) return "No expiry";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days}d left`;
}

export default function BatchesPage() {
  const [expiringFilter, setExpiringFilter] = useState<number | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useBatches(undefined, expiringFilter);
  const createBatch = useCreateBatch();
  const deleteBatch = useDeleteBatch();
  const batches: InventoryBatch[] = data?.items ?? [];

  function patch(k: keyof typeof EMPTY_FORM, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.product_id || !form.batch_number || !form.quantity || createBatch.isPending) return;
    await createBatch.mutateAsync({
      product_id: form.product_id,
      batch_number: form.batch_number,
      quantity: Number(form.quantity),
      unit_cost: Number(form.unit_cost) || 0,
      manufactured_date: form.manufactured_date || null,
      expiry_date: form.expiry_date || null,
      supplier_id: form.supplier_id || null,
      notes: form.notes || null,
    });
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  const bulk = useBulkSelection(batches.map((b) => b.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Batches",
      message: `Delete ${bulk.count} selected batch${bulk.count === 1 ? "" : "es"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteBatch.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  const expiredCount = batches.filter((b) => b.days_to_expiry !== null && b.days_to_expiry < 0).length;
  const soonCount = batches.filter((b) => b.days_to_expiry !== null && b.days_to_expiry >= 0 && b.days_to_expiry <= 30).length;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Batches & Expiry</h1>
          <p className="text-sm text-muted mt-0.5">{batches.length} batch{batches.length !== 1 ? "es" : ""}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:opacity-90">
          <Plus size={15} /> Add Batch
        </button>
      </div>

      {/* Alert banners */}
      {expiredCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">
          <AlertTriangle size={16} /> {expiredCount} batch{expiredCount > 1 ? "es have" : " has"} expired — review immediately
        </div>
      )}
      {soonCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700 font-semibold">
          <AlertTriangle size={16} /> {soonCount} batch{soonCount > 1 ? "es expire" : " expires"} within 30 days
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "All", value: undefined },
          { label: "Expiring in 7 days", value: 7 },
          { label: "Expiring in 30 days", value: 30 },
          { label: "Expiring in 90 days", value: 90 },
        ].map(({ label, value }) => (
          <button key={label} onClick={() => setExpiringFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${expiringFilter === value ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-foreground">Add Batch</p>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-muted" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Product ID *", key: "product_id", type: "text" },
              { label: "Batch / Lot Number *", key: "batch_number", type: "text" },
              { label: "Quantity *", key: "quantity", type: "number" },
              { label: "Unit Cost", key: "unit_cost", type: "number" },
              { label: "Manufactured Date", key: "manufactured_date", type: "date" },
              { label: "Expiry Date", key: "expiry_date", type: "date" },
              { label: "Supplier ID", key: "supplier_id", type: "text" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-muted mb-1 block">{label}</label>
                <input type={type} value={form[key as keyof typeof EMPTY_FORM]}
                  onChange={(e) => patch(key as keyof typeof EMPTY_FORM, e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/30" />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold text-muted mb-1 block">Notes</label>
              <input value={form.notes} onChange={(e) => patch("notes", e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/30" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={createBatch.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:opacity-90 disabled:opacity-50">
              {createBatch.isPending ? "Saving…" : "Save Batch"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden"><div className="overflow-x-auto">
        {bulk.count > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <BulkActionBar count={bulk.count} label="batch" pluralLabel="batches" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
          </div>
        )}
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={batches.length === 0} />
              </th>
              <th className="px-4 py-3 font-semibold">Batch #</th>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Qty Remaining</th>
              <th className="px-4 py-3 font-semibold">Expiry Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Supplier</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-border/60 last:border-0 hover:bg-surface/50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={bulk.selected.has(b.id)} onChange={() => bulk.toggle(b.id)} className="w-4 h-4 rounded" />
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-foreground">{b.batch_number}</td>
                <td className="px-4 py-3 font-semibold text-foreground">{b.product_name ?? b.product_id}</td>
                <td className="px-4 py-3 text-foreground">{b.quantity_remaining} / {b.quantity}</td>
                <td className="px-4 py-3 text-muted">{b.expiry_date ?? "—"}</td>
                <td className="px-4 py-3">
                  {b.expiry_date ? (
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${expiryClass(b.days_to_expiry)}`}>
                      {expiryLabel(b.days_to_expiry)}
                    </span>
                  ) : <span className="text-muted text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-muted">{b.supplier_name ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => confirm({
                    title: "Delete Batch",
                    message: "Delete this batch? This cannot be undone.",
                    confirmLabel: "Delete",
                    danger: true,
                    onConfirm: () => deleteBatch.mutateAsync(b.id),
                  })}
                    className="text-xs text-muted hover:text-red-500 transition-colors font-semibold">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-muted text-sm">
                No batches recorded yet. Add a batch to start tracking expiry dates.
              </td></tr>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
