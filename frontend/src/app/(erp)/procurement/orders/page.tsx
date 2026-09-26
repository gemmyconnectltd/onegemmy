"use client";
import { fmtMoney } from "@/lib/config";
import { useState } from "react";
import { Ban, CheckCircle2, Eye, FileText, Plus, Search, Trash2, Truck, X } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fmtDateTime } from "@/lib/date";
import {
  usePurchaseOrders, useSuppliers, useProducts,
  useCreatePurchaseOrder, useReceivePurchaseOrder, useCancelPurchaseOrder, useDeletePurchaseOrder,
} from "@/lib/api/hooks";
import type { PurchaseOrder, PurchaseItemInput } from "@/lib/api";

type Status = "Draft" | "Received" | "Cancelled";
const STATUS_ORDER: (Status | "All")[] = ["All", "Draft", "Received", "Cancelled"];
const STATUS_STYLES: Record<Status, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Received: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-50 text-red-600",
};

type ItemRow = { rowId: string; product_id: string; unit_cost: string; quantity: string };
const newRow = (): ItemRow => ({ rowId: crypto.randomUUID(), product_id: "", unit_cost: "", quantity: "1" });
const EMPTY_FORM = { supplier_id: "", expected_date: "", notes: "" };

export default function PurchaseOrdersPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [filter, setFilter] = useState<Status | "All">("All");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<ItemRow[]>([newRow()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  const { data, isLoading } = usePurchaseOrders();
  const { data: suppliersData } = useSuppliers();
  const { data: productsData } = useProducts(1, 500);
  const orders = data?.items ?? [];
  const suppliers = suppliersData?.items ?? [];
  const products = productsData?.items ?? [];

  const createPurchase = useCreatePurchaseOrder();
  const receivePurchase = useReceivePurchaseOrder();
  const cancelPurchase = useCancelPurchaseOrder();
  const deletePurchase = useDeletePurchaseOrder();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const filtered = orders.filter((p) => {
    const q = search.trim().toLowerCase();
    return (
      (filter === "All" || p.status === filter) &&
      (!q || p.reference.toLowerCase().includes(q) || (p.supplier?.name ?? "").toLowerCase().includes(q))
    );
  });

  const deletableIds = filtered.filter((p) => p.status === "Draft").map((p) => p.id);
  const bulk = useBulkSelection(deletableIds);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Purchase Orders",
      message: `Delete ${bulk.count} selected draft order${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deletePurchase.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  const stats = [
    { label: "Drafts", value: orders.filter((p) => p.status === "Draft").length, color: "#64748b" },
    { label: "Received", value: orders.filter((p) => p.status === "Received").length, color: "#059669" },
    { label: "Cancelled", value: orders.filter((p) => p.status === "Cancelled").length, color: "#dc2626" },
    { label: "Total Value", value: fmt(orders.reduce((s, p) => s + p.total, 0)), color: "#b45309", isStr: true },
  ];

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setItems([newRow()]);
    setFormError(null);
    setShowModal(true);
  };

  const updateRow = (i: number, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const pickProduct = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    updateRow(i, { product_id: productId, unit_cost: p ? String(p.cost) : "" });
  };

  const itemsTotal = items.reduce((s, r) => s + (Number(r.unit_cost) || 0) * (Number(r.quantity) || 0), 0);

  const createPo = async () => {
    setFormError(null);
    const validItems: PurchaseItemInput[] = items
      .filter((r) => r.product_id)
      .map((r) => {
        const p = products.find((x) => x.id === r.product_id)!;
        return {
          product_id: p.id,
          product_name: p.name,
          sku: p.sku ?? null,
          unit_cost: Number(r.unit_cost) || 0,
          quantity: Number(r.quantity) || 1,
        };
      });
    if (validItems.length === 0) {
      setFormError("Add at least one item.");
      return;
    }
    try {
      await createPurchase.mutateAsync({
        supplier_id: form.supplier_id || null,
        expected_date: form.expected_date || null,
        notes: form.notes.trim() || null,
        status: "Draft",
        items: validItems,
      });
      setShowModal(false);
    } catch (e: unknown) {
      setFormError((e as { detail?: string })?.detail ?? "Failed to create purchase order");
    }
  };

  const handleReceive = (p: PurchaseOrder) => {
    confirm({
      title: "Receive Purchase Order",
      message: `Mark ${p.reference} as received? This adds ${p.items.length} item(s) to your inventory stock.`,
      confirmLabel: "Receive",
      onConfirm: () => receivePurchase.mutate(p.id),
    });
  };

  const handleCancel = (p: PurchaseOrder) => {
    confirm({
      title: "Cancel Purchase Order",
      message: `Cancel ${p.reference}? This cannot be undone.`,
      confirmLabel: "Cancel Order",
      danger: true,
      onConfirm: () => cancelPurchase.mutate(p.id),
    });
  };

  const handleDelete = (p: PurchaseOrder) => {
    confirm({
      title: "Delete Purchase Order",
      message: `Delete draft ${p.reference}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deletePurchase.mutate(p.id),
    });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted mt-1">Create and track orders from your suppliers.</p>
        </div>
        <Button onClick={openAdd} color={brandColor}>
          <Plus size={16} /> New Purchase Order
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate" title={String(s.value)}>{s.isStr ? s.value : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-border p-1">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-[13px] font-semibold transition-colors rounded-lg ${
                filter === s ? "text-white" : "text-foreground/50 hover:text-foreground"
              }`}
              style={filter === s ? { backgroundColor: brandColor } : undefined}
            >
              {s} <span className="opacity-70">({s === "All" ? orders.length : orders.filter((p) => p.status === s).length})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference or supplier..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      {bulk.count > 0 && (
        <BulkActionBar count={bulk.count} label="purchase order" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
      )}

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 w-10">
                <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={deletableIds.length === 0} />
              </th>
              <th className="p-4 font-medium">Reference</th>
              <th className="p-4 font-medium">Supplier</th>
              <th className="p-4 font-medium">Ordered</th>
              <th className="p-4 font-medium">Items</th>
              <th className="p-4 font-medium text-right">Total</th>
              <th className="p-4 font-medium">Expected</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-surface/50">
                <td className="p-4">
                  {p.status === "Draft" && (
                    <input type="checkbox" checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} className="w-4 h-4 rounded" />
                  )}
                </td>
                <td className="p-4 text-[13px] font-bold text-foreground">{p.reference}</td>
                <td className="p-4 text-[13px] text-foreground">{p.supplier?.name ?? "—"}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{fmtDateTime(p.created_at)}</td>
                <td className="p-4 text-[13px] text-muted">{p.items.length}</td>
                <td className="p-4 text-right text-[13px] font-bold text-foreground tabular-nums">{fmt(p.total)}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{p.expected_date ?? "—"}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLES[p.status as Status] ?? "bg-surface text-muted"}`}>
                    {p.status === "Received" ? <CheckCircle2 size={11} /> : p.status === "Cancelled" ? <Ban size={11} /> : <FileText size={11} />}
                    {p.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => setViewing(p)}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold">
                      <Eye size={13} /> View
                    </button>
                    {p.status === "Draft" && (
                      <>
                        <button
                          onClick={() => handleReceive(p)}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                          <Truck size={13} /> Receive
                        </button>
                        <button
                          onClick={() => handleCancel(p)}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold"
                        >
                          <X size={14} /> Cancel
                        </button>
                        <button onClick={() => handleDelete(p)}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold">
                          <Trash2 size={13} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-sm text-muted">No purchase orders match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New Purchase Order */}
      <Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Purchase Order"
        description="Create a draft order for a supplier."
        side="right"
        size="lg"
        footer={
          <form onSubmit={(e) => { e.preventDefault(); createPo(); }}>
            <FormFooter submitLabel={createPurchase.isPending ? "Creating…" : "Create draft order"} onCancel={() => setShowModal(false)} disabled={createPurchase.isPending} />
          </form>
        }
      >
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <Select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
                <option value="">— Select supplier —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Expected Date">
              <Input type="date" value={form.expected_date} onChange={(e) => setForm((f) => ({ ...f, expected_date: e.target.value }))} />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-muted">Items</p>
              <button type="button" onClick={() => setItems((rows) => [...rows, newRow()])}
                className="text-[12px] font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ color: brandColor }}>
                <Plus size={13} /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((row, i) => (
                <div key={row.rowId} className="flex items-center gap-2">
                  <Select value={row.product_id} onChange={(e) => pickProduct(i, e.target.value)} className="flex-1">
                    <option value="">Select product...</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                  </Select>
                  <Input type="number" min={1} value={row.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} className="w-20 text-center" placeholder="Qty" />
                  <Input type="number" min={0} value={row.unit_cost} onChange={(e) => updateRow(i, { unit_cost: e.target.value })} className="w-28 font-mono" placeholder="Unit cost" />
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems((rows) => rows.filter((_, idx) => idx !== i))}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[12px] text-muted text-right mt-2">
              Items total: <span className="font-semibold text-foreground">{fmt(itemsTotal)}</span>
            </p>
          </div>

          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
          </Field>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}
        </div>
      </Drawer>

      {/* View */}
      <Drawer open={!!viewing} onClose={() => setViewing(null)} title="Purchase Order" description={viewing?.reference} size="md">
        {viewing && (
          <div className="p-5 space-y-4">
            {[
              { label: "Supplier", value: viewing.supplier?.name ?? "—" },
              { label: "Status", value: viewing.status },
              { label: "Ordered", value: fmtDateTime(viewing.created_at) },
              { label: "Expected", value: viewing.expected_date ?? "—" },
              { label: "Received", value: viewing.received_at ? fmtDateTime(viewing.received_at) : "—" },
              { label: "Total", value: fmt(viewing.total) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-[13px] text-muted font-medium">{label}</span>
                <span className="text-[13px] font-semibold text-foreground">{value}</span>
              </div>
            ))}
            {viewing.items.length > 0 && (
              <div className="pt-2">
                <p className="text-[12px] font-semibold text-muted mb-2">Line Items</p>
                <div className="space-y-2">
                  {viewing.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{it.product_name}</p>
                        <p className="text-[11px] text-muted">×{it.quantity} @ {fmt(it.unit_cost)}</p>
                      </div>
                      <span className="text-[13px] font-bold text-foreground tabular-nums flex-shrink-0 ml-2">{fmt(it.line_total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
