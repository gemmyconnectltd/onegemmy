"use client";

import { useState } from "react";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { type ApiSerial } from "@/lib/api";
import { useSerials, useCreateSerials, useDeleteSerial } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";

const STATUS_COLORS: Record<string, string> = {
  in_stock: "bg-emerald-100 text-emerald-700",
  reserved: "bg-amber-100 text-amber-700",
  sold: "bg-blue-100 text-blue-700",
  returned: "bg-violet-100 text-violet-700",
  under_repair: "bg-red-100 text-red-700",
};

export default function SerialsPage() {
  const [status, setStatus] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState([{ product_id: "", serial_number: "", imei: "", warranty_months: 0, purchase_price: 0, notes: "" }]);
  const [result, setResult] = useState<string | null>(null);

  const { data, isLoading } = useSerials(1, 100, undefined, status || undefined);
  const createSerials = useCreateSerials();
  const deleteSerial = useDeleteSerial();
  const serials = data?.items ?? [];

  function updateRow(i: number, patch: Partial<typeof bulk[number]>) {
    setBulk((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleAdd() {
    const valid = bulk.filter((r) => r.product_id && r.serial_number.trim());
    if (valid.length === 0 || createSerials.isPending) return;
    try {
      const res = await createSerials.mutateAsync(valid);
      setResult(`Registered ${res?.data?.items?.length ?? valid.length} serial(s)`);
      setAdding(false);
      setBulk([{ product_id: "", serial_number: "", imei: "", warranty_months: 0, purchase_price: 0, notes: "" }]);
    } catch { setResult("Failed to register serials"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this serial? Only unsold serials can be removed.")) return;
    try { await deleteSerial.mutateAsync(id); } catch { /* ignore */ }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
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
            <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
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
                <Button size="sm" variant="secondary" onClick={() => setBulk((rows) => [...rows, { ...bulk[bulk.length - 1] }])} className="rounded-lg">+ Row</Button>
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

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
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
                <td colSpan={6} className="px-4 py-16 text-center text-muted text-sm">No serials registered yet. Use “Register Serial” to add stock with trackable units.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
