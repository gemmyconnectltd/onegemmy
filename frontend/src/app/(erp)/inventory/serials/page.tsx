"use client";

import { useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type ApiSerial } from "@/lib/api";
import { useSerials, useCreateSerials, useDeleteSerial } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

const STATUS_COLORS: Record<string, string> = {
  in_stock: "bg-emerald-100 text-emerald-700",
  reserved: "bg-amber-100 text-amber-700",
  sold: "bg-blue-100 text-blue-700",
  returned: "bg-violet-100 text-violet-700",
  under_repair: "bg-red-100 text-red-700",
};

type BulkRow = { id: string; product_id: string; serial_number: string; imei: string; warranty_months: number; purchase_price: number; notes: string };
const newRow = (patch: Partial<BulkRow> = {}): BulkRow => ({
  id: crypto.randomUUID(),
  product_id: patch.product_id ?? "",
  serial_number: patch.serial_number ?? "",
  imei: patch.imei ?? "",
  warranty_months: patch.warranty_months ?? 0,
  purchase_price: patch.purchase_price ?? 0,
  notes: patch.notes ?? "",
});

export default function SerialsPage() {
  const [status, setStatus] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState<BulkRow[]>([newRow()]);
  const [result, setResult] = useState<string | null>(null);

  const { data, isLoading } = useSerials(1, 100, undefined, status || undefined);
  const createSerials = useCreateSerials();
  const deleteSerial = useDeleteSerial();
  const serials = data?.items ?? [];

  function updateRow(i: number, patch: Partial<BulkRow>) {
    setBulk((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleAdd() {
    const valid = bulk.filter((r) => r.product_id && r.serial_number.trim());
    if (valid.length === 0 || createSerials.isPending) return;
    try {
      const res = await createSerials.mutateAsync(valid);
      setResult(`Registered ${res?.data?.items?.length ?? valid.length} serial(s)`);
      setAdding(false);
      setBulk([newRow()]);
    } catch { setResult("Failed to register serials"); }
  }

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const bulkSel = useBulkSelection(serials.map((s) => s.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function handleDelete(id: string) {
    confirm({
      title: "Delete Serial",
      message: "Delete this serial? Only unsold serials can be removed. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteSerial.mutate(id),
    });
  }

  function confirmBulkDelete() {
    confirm({
      title: "Delete Serials",
      message: `Delete ${bulkSel.count} selected serial${bulkSel.count === 1 ? "" : "s"}? Only unsold serials can be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulkSel.selected).map((id) => deleteSerial.mutateAsync(id)));
        setBulkDeleting(false);
        bulkSel.clear();
      },
    });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Serials & IMEI</h1>
          <p className="text-sm text-muted mt-0.5">{serials.length} serials</p>
        </div>
        <Button onClick={() => setAdding(!adding)} color="#059669" className="rounded-lg">
          <Plus size={15} /> Register Serial
        </Button>
      </div>

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
          <span>{result}</span>
          <button onClick={() => setResult(null)} className="text-emerald-600"><X size={14} /></button>
        </div>
      )}

      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <p className="text-sm font-bold text-foreground">Register Serials</p>
          {bulk.map((row, i) => (
            <div key={row.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-muted mb-1 block">Product ID</label>
                <input type="text" placeholder="product id" value={row.product_id}
                  onChange={(e) => updateRow(i, { product_id: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-muted mb-1 block">Serial / IMEI</label>
                <input type="text" placeholder="e.g. S/N-1001" value={row.serial_number}
                  onChange={(e) => updateRow(i, { serial_number: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-muted mb-1 block">IMEI 2</label>
                <input type="text" placeholder="IMEI (optional)" value={row.imei ?? ""}
                  onChange={(e) => updateRow(i, { imei: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-muted mb-1 block">Warranty (mo)</label>
                <input type="number" min={0} value={row.warranty_months}
                  onChange={(e) => updateRow(i, { warranty_months: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-muted mb-1 block">Cost</label>
                <input type="number" min={0} step="0.01" value={row.purchase_price}
                  onChange={(e) => updateRow(i, { purchase_price: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setBulk((rows) => [...rows, newRow(rows[rows.length - 1])])} className="rounded-lg">+ Row</Button>
                {bulk.length > 1 && (
                  <Button size="sm" variant="secondary" onClick={() => setBulk((rows) => rows.filter((_, idx) => idx !== i))} className="rounded-lg">−</Button>
                )}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={createSerials.isPending} color="#059669" className="rounded-lg">
              {createSerials.isPending ? "Saving…" : "Save Serials"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search serials…" className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-card" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden"><div className="overflow-x-auto">
        {bulkSel.count > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <BulkActionBar count={bulkSel.count} label="serial" onDelete={confirmBulkDelete} onClear={bulkSel.clear} deleting={bulkDeleting} />
          </div>
        )}
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={bulkSel.allSelected} ref={(el) => { if (el) el.indeterminate = bulkSel.someSelected; }} onChange={bulkSel.toggleAll} className="w-4 h-4 rounded" disabled={serials.length === 0} />
              </th>
              <th className="px-4 py-3 font-semibold">Serial</th>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">IMEI</th>
              <th className="px-4 py-3 font-semibold">Warranty</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {serials.map((s: ApiSerial) => (
              <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-surface/50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={bulkSel.selected.has(s.id)} onChange={() => bulkSel.toggle(s.id)} className="w-4 h-4 rounded" />
                </td>
                <td className="px-4 py-3 font-mono text-foreground">{s.serial_number}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-foreground">{s.product_name ?? s.product_id}</div>
                  {s.variant_attributes && <div className="text-xs text-muted">{Object.values(s.variant_attributes).join(" / ")}</div>}
                </td>
                <td className="px-4 py-3 text-muted font-mono">{s.imei || "—"}</td>
                <td className="px-4 py-3 text-muted">{s.warranty_months > 0 ? `${s.warranty_months} mo` : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[s.status] ?? "bg-surface text-muted"}`}>
                    {s.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(s.id)}
                    className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                    <Trash2 size={13} /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {serials.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted text-sm">No serials registered yet. Use “Register Serial” to add stock with trackable units.</td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
