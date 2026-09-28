"use client";

import { useState } from "react";
import { Plus, Search, Trash2, ArrowLeftRight, AlertCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type ApiStockTransfer } from "@/lib/api";
import { useTransfers, useCreateTransfer, useUpdateTransfer, useDeleteTransfer, useMyBranches, useProducts } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-700",
  in_transit: "bg-blue-100 text-blue-700",
  completed:  "bg-emerald-100 text-emerald-700",
  cancelled:  "bg-red-100 text-red-700",
};

interface ItemRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  sku: string;
  quantity: number;
  available_stock: number;
}

const newItem = (): ItemRow => ({
  id: crypto.randomUUID(),
  product_id: "",
  variant_id: null,
  product_name: "",
  sku: "",
  quantity: 1,
  available_stock: 0,
});

export default function TransfersPage() {
  const [status, setStatus] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([newItem()]);
  const [createError, setCreateError] = useState("");

  const { data, isLoading } = useTransfers(1, 100, status || undefined);
  const { data: branchesData } = useMyBranches();
  const { data: productsData } = useProducts(1, 500);
  const createTransfer = useCreateTransfer();
  const updateTransfer = useUpdateTransfer();
  const deleteTransfer = useDeleteTransfer();

  const transfers = data?.items ?? [];
  const branches = branchesData?.items ?? [];
  const products = productsData?.items ?? [];

  const filtered = transfers.filter((t) =>
    !search ||
    t.transfer_number.toLowerCase().includes(search.toLowerCase()) ||
    t.from_branch_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.to_branch_name?.toLowerCase().includes(search.toLowerCase())
  );

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    setItems((rows) =>
      rows.map((r, i) =>
        i !== index ? r : {
          ...r,
          product_id: productId,
          variant_id: null,
          product_name: product?.name ?? "",
          sku: product?.sku ?? "",
          available_stock: product ? Number(product.stock) : 0,
        }
      )
    );
  }

  function updateQty(index: number, qty: number) {
    setItems((rows) => rows.map((r, i) => i !== index ? r : { ...r, quantity: qty }));
  }

  const validItems = items.filter((r) => r.product_id && r.quantity > 0);
  const stockErrors = validItems.filter((r) => r.quantity > r.available_stock);

  async function handleAdd() {
    setCreateError("");
    if (validItems.length === 0 || createTransfer.isPending) return;
    if (fromBranch && toBranch && fromBranch === toBranch) return;
    if (stockErrors.length > 0) {
      setCreateError("Some items exceed available stock.");
      return;
    }
    try {
      await createTransfer.mutateAsync({
        from_branch_id: fromBranch || null,
        to_branch_id: toBranch || null,
        notes: notes.trim() || null,
        items: validItems.map((r) => ({
          product_id: r.product_id,
          variant_id: r.variant_id,
          product_name: r.product_name,
          sku: r.sku || null,
          quantity: r.quantity,
        })),
      });
      setAdding(false);
      setFromBranch(""); setToBranch(""); setNotes("");
      setItems([newItem()]);
    } catch (err) {
      setCreateError((err as { detail?: string })?.detail ?? "Failed to create transfer");
    }
  }

  async function handleStatus(id: string, next: string) {
    try {
      await updateTransfer.mutateAsync({ id, data: { status: next } });
    } catch (err) {
      alert((err as { detail?: string })?.detail ?? "Failed to update transfer");
    }
  }

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const bulk = useBulkSelection(filtered.map((t) => t.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function handleDelete(id: string) {
    confirm({
      title: "Delete Transfer",
      message: "Delete this transfer? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteTransfer.mutate(id),
    });
  }

  function confirmBulkDelete() {
    confirm({
      title: "Delete Transfers",
      message: `Delete ${bulk.count} selected transfer${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteTransfer.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Branch Stock Transfers</h1>
          <p className="text-sm text-muted mt-0.5">{transfers.length} transfers</p>
        </div>
        <Button onClick={() => { setAdding(!adding); setCreateError(""); }} color="#059669" className="rounded-lg">
          <Plus size={15} /> New Transfer
        </Button>
      </div>

      {adding && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <ArrowLeftRight size={14} /> Create Transfer
          </p>

          {/* Branches */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">From branch</label>
              <select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
                <option value="">— Any / Main store</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.location ? ` · ${b.location}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">To branch</label>
              <select value={toBranch} onChange={(e) => setToBranch(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
                <option value="">— Any / Main store</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.location ? ` · ${b.location}` : ""}</option>)}
              </select>
            </div>
          </div>
          {fromBranch && toBranch && fromBranch === toBranch && (
            <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Source and destination must be different.</p>
          )}

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">Items</p>
            {items.map((row, i) => {
              const overStock = row.product_id && row.quantity > row.available_stock;
              return (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-start">
                  <div>
                    <select
                      value={row.product_id}
                      onChange={(e) => selectProduct(i, e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card outline-none"
                    >
                      <option value="">Select product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.sku ? ` (${p.sku})` : ""} — stock: {Number(p.stock)}
                        </option>
                      ))}
                    </select>
                    {overStock && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={11} /> Only {row.available_stock} in stock
                      </p>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    placeholder="Qty"
                    value={row.quantity}
                    onChange={(e) => updateQty(i, Number(e.target.value) || 0)}
                    className={`w-24 px-3 py-2 border rounded-lg text-sm outline-none ${overStock ? "border-red-400" : "border-border"}`}
                  />
                  <Button size="sm" variant="secondary" onClick={() => setItems((rows) => rows.filter((_, idx) => idx !== i))} className="rounded-lg">−</Button>
                </div>
              );
            })}
            <Button size="sm" variant="secondary" onClick={() => setItems((rows) => [...rows, newItem()])} className="rounded-lg">
              <Plus size={12} /> Add item
            </Button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">Notes</label>
            <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none" />
          </div>

          {createError && (
            <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle size={14} /> {createError}</p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleAdd}
              disabled={createTransfer.isPending || validItems.length === 0 || stockErrors.length > 0 || (!!fromBranch && fromBranch === toBranch)}
              color="#059669"
              className="rounded-lg"
            >
              {createTransfer.isPending ? "Saving…" : "Create Transfer"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search transfers…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm outline-none bg-card" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2.5 border border-border rounded-lg text-sm bg-card outline-none">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      <BulkActionBar count={bulk.count} label="transfer" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />

      {/* List */}
      <div className="space-y-3">
        {filtered.map((t: ApiStockTransfer) => (
          <div key={t.id} className={`bg-card border rounded-xl p-5 hover:shadow-md transition-shadow ${bulk.selected.has(t.id) ? "border-accent" : "border-border"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={bulk.selected.has(t.id)} onChange={() => bulk.toggle(t.id)} className="w-4 h-4 rounded" />
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
                {t.status === "in_transit" && (
                  <select value="" onChange={(e) => e.target.value && handleStatus(t.id, e.target.value)}
                    className="px-2 py-1.5 border border-border rounded-lg text-xs bg-card outline-none">
                    <option value="">Update…</option>
                    {["completed", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                )}
                <button onClick={() => handleDelete(t.id)}
                  className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="font-semibold text-foreground">{t.from_branch_name ?? "Main store"}</span>
              <ArrowLeftRight size={14} className="text-muted" />
              <span className="font-semibold text-foreground">{t.to_branch_name ?? "Main store"}</span>
              <span className="text-xs text-muted ml-auto">{t.created_at ? new Date(t.created_at).toLocaleDateString() : ""}</span>
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
