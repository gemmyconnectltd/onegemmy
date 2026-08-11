"use client";

import { useState } from "react";
import { Loader2, Plus, Search, X, ArrowLeftRight } from "lucide-react";
import { type ApiStockTransfer } from "@/lib/api";
import { useTransfers, useCreateTransfer, useUpdateTransfer, useDeleteTransfer, useMyBranches } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_transit: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

interface ItemRow { product_name: string; sku: string; quantity: number; }

export default function TransfersPage() {
  const [status, setStatus] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ product_name: "", sku: "", quantity: 1 }]);

  const { data, isLoading } = useTransfers(1, 100, status || undefined);
  const { data: branchesData } = useMyBranches();
  const createTransfer = useCreateTransfer();
  const updateTransfer = useUpdateTransfer();
  const deleteTransfer = useDeleteTransfer();
  const transfers = data?.items ?? [];
  const branches = branchesData?.items ?? [];

  const filtered = transfers.filter((t) =>
    !search || t.transfer_number.toLowerCase().includes(search.toLowerCase())
    || t.from_branch_name?.toLowerCase().includes(search.toLowerCase())
    || t.to_branch_name?.toLowerCase().includes(search.toLowerCase()));

  function updateRow(i: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleAdd() {
    const valid = items.filter((r) => r.product_name.trim() && r.quantity > 0);
    if (valid.length === 0 || createTransfer.isPending) return;
    if (fromBranch && fromBranch === toBranch) return;
    try {
      await createTransfer.mutateAsync({
        from_branch_id: fromBranch || null,
        to_branch_id: toBranch || null,
        notes: notes.trim() || null,
        items: valid,
      });
      setAdding(false);
      setFromBranch(""); setToBranch(""); setNotes("");
      setItems([{ product_name: "", sku: "", quantity: 1 }]);
    } catch { /* ignore */ }
  }

  async function handleStatus(id: string, next: string) {
    try { await updateTransfer.mutateAsync({ id, data: { status: next } }); } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this transfer?")) return;
    try { await deleteTransfer.mutateAsync(id); } catch { /* ignore */ }
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
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Branch Stock Transfers</h1>
          <p className="text-sm text-muted mt-0.5">{transfers.length} transfers</p>
        </div>
        <Button onClick={() => setAdding(!adding)} color="#059669" className="rounded-lg">
          <Plus size={15} /> New Transfer
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2"><ArrowLeftRight size={14} /> Create Transfer</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">From branch</label>
              <select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.location ? ` · ${b.location}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">To branch</label>
              <select value={toBranch} onChange={(e) => setToBranch(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.location ? ` · ${b.location}` : ""}</option>)}
              </select>
            </div>
          </div>
          {fromBranch && toBranch && fromBranch === toBranch && (
            <p className="text-xs text-red-600">Source and destination branch must be different.</p>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">Items</p>
            {items.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                <div className="md:col-span-2">
                  <input type="text" placeholder="Product name" value={row.product_name}
                    onChange={(e) => updateRow(i, { product_name: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
                </div>
                <div>
                  <input type="text" placeholder="SKU (optional)" value={row.sku}
                    onChange={(e) => updateRow(i, { sku: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
                </div>
                <div className="flex gap-2">
                  <input type="number" min={0} step="0.01" placeholder="Qty" value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: Number(e.target.value) || 0 })}
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
                  <Button size="sm" variant="secondary" onClick={() => setItems((rows) => rows.filter((_, idx) => idx !== i))} className="rounded-lg">−</Button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setItems((rows) => [...rows, { product_name: "", sku: "", quantity: 1 }])} className="rounded-lg">
              <Plus size={12} /> Add item
            </Button>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">Notes</label>
            <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none" />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={createTransfer.isPending || items.filter((r) => r.product_name.trim() && r.quantity > 0).length === 0} color="#059669" className="rounded-lg">
              {createTransfer.isPending ? "Saving…" : "Create Transfer"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search transfers…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:border-foreground/30 outline-none bg-card" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((t: ApiStockTransfer) => (
          <div key={t.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-foreground">{t.transfer_number}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[t.status] ?? "bg-surface text-muted"}`}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {t.status === "pending" && (
                  <select value="" onChange={(e) => e.target.value && handleStatus(t.id, e.target.value)}
                    className="px-2 py-1.5 border border-border rounded-lg text-xs bg-card outline-none">
                    <option value="">Update…</option>
                    {["in_transit", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                )}
                <button onClick={() => handleDelete(t.id)}
                  className="w-7 h-7 inline-flex items-center justify-center text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="font-semibold text-foreground">{t.from_branch_name ?? "Main store"}</span>
              <ArrowLeftRight size={14} className="text-muted" />
              <span className="font-semibold text-foreground">{t.to_branch_name ?? "Main store"}</span>
              <span className="text-xs text-muted ml-auto">
                {t.created_at ? new Date(t.created_at).toLocaleDateString() : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {t.items.map((it) => (
                <span key={it.id} className="inline-flex items-center gap-1.5 bg-surface rounded-lg px-2.5 py-1 text-xs text-muted">
                  {it.product_name}
                  {it.sku && <span className="font-mono text-muted/70">{it.sku}</span>}
                  <span className="font-semibold text-foreground">×{it.quantity}</span>
                </span>
              ))}
              {t.notes && <p className="w-full text-xs text-muted mt-1">{t.notes}</p>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-16 text-center bg-card border border-border rounded-xl">
            <ArrowLeftRight size={36} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No transfers found</p>
          </div>
        )}
      </div>
    </div>
  );
}
