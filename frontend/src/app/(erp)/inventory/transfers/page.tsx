"use client";
import { Input, Select } from "@/components/ui/Form";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
import { ALL_TIME, periodRange, type PeriodValue } from "@/lib/period";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, Trash2, ArrowLeftRight, AlertCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { type ApiProduct, type ApiStockTransfer } from "@/lib/api";
import { useTransfers, useTransferDestinations, useCreateTransfer, useUpdateTransfer, useDeleteTransfer, useMyBranches, useProducts, useProduct, useWarehouses, useStockByWarehouse } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TableState } from "@/components/ui/TableState";

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

/** "Request from <branch>" and "Move between branches" open the form already filled: the product, both branches and a quantity. */
interface TransferPrefill { fromBranch?: string; toBranch?: string; quantity?: number }

function TransfersContent({initialProduct, create = false, initialStatus = "", prefill}: {initialProduct?: ApiProduct; create?: boolean; initialStatus?: string; prefill?: TransferPrefill}) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [period, setPeriod] = useState<PeriodValue>(ALL_TIME);
  const range = periodRange(period);
  const [adding, setAdding] = useState(create);
  const [search, setSearch] = useState("");
  const [fromBranch, setFromBranch] = useState(prefill?.fromBranch ?? "");
  const [toBranch, setToBranch] = useState(prefill?.toBranch ?? "");
  const [fromWarehouseChosen, setFromWarehouse] = useState("");
  const [toWarehouseChosen, setToWarehouse] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>(() => initialProduct ? [{...newItem(),product_id:initialProduct.id,product_name:initialProduct.name,sku:initialProduct.sku||"",available_stock:Number(initialProduct.stock),quantity:prefill?.quantity && prefill.quantity > 0 ? prefill.quantity : 1}] : [newItem()]);
  const [createError, setCreateError] = useState("");

  const { data, isLoading, isError, error: loadError, refetch } = useTransfers(1, 100, status || undefined, undefined, range);
  const destinations = useTransferDestinations().data ?? [];
  // A business that has switched warehouses on moves stock between warehouses; otherwise transfers stay between branches, as before.
  const warehouseList = useWarehouses().data;
  const byWarehouse = !!warehouseList?.enabled;
  const activeWarehouses = (warehouseList?.items ?? []).filter((w) => w.is_active);
  // With warehouses on, the branches asked for become each branch's own warehouse until someone picks another.
  const ownWarehouse = (branch?: string) => (branch ? activeWarehouses.find((w) => w.branch_id === branch)?.id ?? "" : "");
  const fromWarehouse = fromWarehouseChosen || ownWarehouse(prefill?.fromBranch);
  const toWarehouse = toWarehouseChosen || ownWarehouse(prefill?.toBranch);
  const { data: branchesData } = useMyBranches();
  const { data: productsData } = useProducts(1, 500);
  const createTransfer = useCreateTransfer();
  const updateTransfer = useUpdateTransfer();
  const deleteTransfer = useDeleteTransfer();

  const transfers = data?.items ?? [];
  const branches = branchesData?.items ?? [];
  const products = initialProduct && !productsData?.items.some(p=>p.id===initialProduct.id) ? [initialProduct,...(productsData?.items??[])] : productsData?.items ?? [];
  // With warehouses, what can be sent is what the FROM warehouse holds, not the business total.
  const sourceStock = useStockByWarehouse(1, { warehouse_id: fromWarehouse }, { enabled: byWarehouse && !!fromWarehouse }, 100).data?.items;
  const available = (productId: string, fallback: number) =>
    byWarehouse ? (fromWarehouse ? sourceStock?.filter((r) => r.product_id === productId && !r.variant_id).reduce((n, r) => n + r.available, 0) ?? 0 : 0) : fallback;
  const { user } = useAuth();
  // Branch staff follow transfers and mark those into their branch received; starting, cancelling and deleting stay with company-wide users.
  const branchLimited = !!(user?.branchIds?.length || user?.branchId) && !user?.isSuperuser;

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
          available_stock: product ? available(product.id, Number(product.stock)) : 0,
        }
      )
    );
  }

  function updateQty(index: number, qty: number) {
    setItems((rows) => rows.map((r, i) => i !== index ? r : { ...r, quantity: qty }));
  }

  // Re-read what each line may take whenever the source warehouse (or its stock) changes.
  const rows = items.map((r) => r.product_id ? { ...r, available_stock: available(r.product_id, r.available_stock) } : r);
  const validItems = rows.filter((r) => r.product_id && r.quantity > 0);
  const stockErrors = validItems.filter((r) => r.quantity > r.available_stock);

  async function handleAdd() {
    setCreateError("");
    if (validItems.length === 0 || createTransfer.isPending) return;
    if (byWarehouse ? !fromWarehouse || !toWarehouse || fromWarehouse === toWarehouse : fromBranch === toBranch) return;
    if (stockErrors.length > 0) {
      setCreateError("Some items exceed available stock.");
      return;
    }
    try {
      await createTransfer.mutateAsync({
        ...(byWarehouse ? { from_warehouse_id: fromWarehouse, to_warehouse_id: toWarehouse } : { from_branch_id: fromBranch || null, to_branch_id: toBranch || null }),
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
      setFromBranch(""); setToBranch(""); setFromWarehouse(""); setToWarehouse(""); setNotes("");
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
  const bulk = useBulkSelection(filtered.filter((t) => t.status === "pending" && !branchLimited).map((t) => t.id));
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function handleDelete(id: string) {
    confirm({
      title: "Delete Transfer",
      message: "Delete this transfer? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteTransfer.mutateAsync(id),
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


  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between pesaa-responsive-toolbar">
        <div>
          <h1 className="pesaa-page-title">Transfers</h1>
          <p className="text-sm text-muted mt-0.5">{transfers.length} transfer{transfers.length === 1 ? "" : "s"} · stock moves between {byWarehouse ? "warehouses" : "branches"}</p>
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

          {byWarehouse ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted mb-1.5 block">From warehouse</label>
                  <Select value={fromWarehouse} onChange={(e) => setFromWarehouse(e.target.value)} className="w-full"><option value="">Choose…</option>{activeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted mb-1.5 block">To warehouse</label>
                  <Select value={toWarehouse} onChange={(e) => setToWarehouse(e.target.value)} className="w-full"><option value="">Choose…</option>{activeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
                </div>
              </div>
              {fromWarehouse && fromWarehouse === toWarehouse && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Source and destination must be different.</p>}
              <p className="text-xs text-muted">Stock leaves the first warehouse when you dispatch, and enters the second only when it is received.</p>
            </>
          ) : (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">From branch</label>
              <Select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)} className="w-full">
                <option value="">— Any / Main store</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.location ? ` · ${b.location}` : ""}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">To branch</label>
              <Select value={toBranch} onChange={(e) => setToBranch(e.target.value)} className="w-full">
                <option value="">— Any / Main store</option>
                {(destinations.length ? destinations : branches).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          </div>
          {fromBranch === toBranch && (
            <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Source and destination must be different.</p>
          )}

            </>
          )}

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">Items</p>
            {rows.map((row, i) => {
              const overStock = row.product_id && row.quantity > row.available_stock;
              return (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-start">
                  <div>
                    <Select value={row.product_id} onChange={(e) => selectProduct(i, e.target.value)} className="w-full">
                      <option value="">Select product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.sku ? ` (${p.sku})` : ""}{byWarehouse && !fromWarehouse ? "" : ` — available: ${available(p.id, Number(p.stock))}`}
                        </option>
                      ))}
                    </Select>
                    {overStock && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={11} /> Only {row.available_stock} available{byWarehouse ? " in the source warehouse" : ""}
                      </p>
                    )}
                  </div>
                  <Input type="number" min={1} step="0.01" placeholder="Qty" value={row.quantity} onChange={(e) => updateQty(i, Number(e.target.value) || 0)} className={`w-24 px-3 py-2 border rounded-lg text-sm outline-none ${overStock ? "border-red-400" : "border-border"}`} />
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
            <Input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full" />
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
          <Input type="text" placeholder="Search transfers…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search transfers" className="w-full pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
        <PeriodFilter value={period} onChange={setPeriod} label="Created" />
      </div>

      <BulkActionBar count={bulk.count} label="transfer" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />

      {/* List */}
      <div className="space-y-3">
        {filtered.map((t: ApiStockTransfer) => (
          <div key={t.id} className={`bg-card border rounded-xl p-5 hover:shadow-md transition-shadow ${bulk.selected.has(t.id) ? "border-accent" : "border-border"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                {t.status === "pending" && !branchLimited && <input type="checkbox" aria-label={`Select ${t.transfer_number}`} checked={bulk.selected.has(t.id)} onChange={() => bulk.toggle(t.id)} className="w-4 h-4 rounded" />}
                <span className="font-mono text-sm font-bold text-foreground">{t.transfer_number}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[t.status] ?? "bg-surface text-muted"}`}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!branchLimited && t.status === "pending" && <Button size="sm" variant="outline" disabled={updateTransfer.isPending} onClick={() => void handleStatus(t.id, "in_transit")}>Dispatch</Button>}
                {!branchLimited && t.status === "pending" && <Button size="sm" disabled={updateTransfer.isPending} onClick={() => confirm({ title: `Dispatch and receive ${t.transfer_number}?`, message: `${t.items.map((it) => `${Number(it.quantity)} × ${it.product_name}`).join(", ")} move from ${t.from_warehouse_name ?? t.from_branch_name ?? "Main store"} to ${t.to_warehouse_name ?? t.to_branch_name ?? "Main store"} now, in one step. This can't be undone; a mistake is fixed with a transfer back.`, confirmLabel: "Dispatch and receive", onConfirm: () => handleStatus(t.id, "completed") })}>Dispatch and receive</Button>}
                {t.status === "in_transit" && <Button size="sm" disabled={updateTransfer.isPending} onClick={() => void handleStatus(t.id, "completed")}>Mark received</Button>}
                {!branchLimited && (t.status === "pending" || t.status === "in_transit") && <Button size="sm" variant="outline" disabled={updateTransfer.isPending} onClick={() => confirm({ title: `Cancel ${t.transfer_number}?`, message: t.status === "in_transit" && t.from_warehouse_id ? "The stock on its way goes back to the source warehouse." : "Nothing will be moved.", confirmLabel: "Cancel transfer", danger: true, onConfirm: () => handleStatus(t.id, "cancelled") })}>Cancel</Button>}
                {/* History is never edited: only a transfer that never moved can be deleted. */}
                {!branchLimited && t.status === "pending" && <button onClick={() => handleDelete(t.id)}
                  className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-xs font-semibold">
                  <Trash2 size={14} /> Delete
                </button>}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="font-semibold text-foreground">{t.from_warehouse_name ?? t.from_branch_name ?? "Main store"}</span>
              <ArrowLeftRight size={14} className="text-muted" />
              <span className="font-semibold text-foreground">{t.to_warehouse_name ?? t.to_branch_name ?? "Main store"}</span>
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
        {isLoading || (isError && !data) ? (
          <TableState loading={isLoading} error={isError ? loadError : undefined} onRetry={() => void refetch()} rows={3} />
        ) : filtered.length === 0 && (
          <div className="py-16 text-center bg-card border border-border rounded-xl">
            <ArrowLeftRight size={36} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No transfers found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TransferFromProduct() {
  const params = useSearchParams();
  const id = params.get("product") || undefined;
  const product = useProduct(id);
  if (id && product.isLoading) return <PageLoader variant="page"/>;
  if (id && (product.error || !product.data)) return <div role="alert" className="space-y-3"><p>The selected product is unavailable.</p><Button variant="secondary" onClick={()=>void product.refetch()}>Try again</Button></div>;
  const statusParam = params.get("status") || "";
  const initialStatus = ["pending", "in_transit", "completed", "cancelled"].includes(statusParam) ? statusParam : "";
  const prefill = { fromBranch: params.get("from_branch") || undefined, toBranch: params.get("to_branch") || undefined, quantity: Number(params.get("qty")) || undefined };
  return <TransfersContent key={`${id||"all"}:${initialStatus}`} initialProduct={product.data} create={params.get("create")==="1"} initialStatus={initialStatus} prefill={prefill}/>;
}
export default function TransfersPage() { return <Suspense fallback={<PageLoader variant="page" />}><TransferFromProduct/></Suspense>; }
