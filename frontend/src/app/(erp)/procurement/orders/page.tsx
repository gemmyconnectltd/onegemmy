"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import { useAuth } from "@/lib/auth";
import { Pagination } from "@/components/ui/Pagination";
import { formatMoney } from "@/lib/money";
import { fmtMoney } from "@/lib/config";
import { useDeferredValue, useEffect, useState } from "react";
import { Ban, CheckCircle2, Eye, FileText, Pencil, Plus, Search, Trash2, Truck, X } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fmtDateTime } from "@/lib/date";
import {
  usePurchaseOrders, useReceivePurchaseOrder, useCancelPurchaseOrder, useDeletePurchaseOrder,
} from "@/lib/api/hooks";
import { PurchaseEditor } from "@/components/procurement/PurchaseEditor";
import type { PurchaseOrder } from "@/lib/api";

type Status = "Draft" | "Received" | "Cancelled";
const STATUS_ORDER: (Status | "All")[] = ["All", "Draft", "Received", "Cancelled"];
const STATUS_STYLES: Record<Status, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Received: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-50 text-red-600",
};

export default function PurchaseOrdersPage() {
  const { currencySymbol, brandColor, currency } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [filter, setFilter] = useState<Status | "All">("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { user, activeBranchId, hasPermission } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | undefined>(undefined);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  const { data, isLoading, error: historyError } = usePurchaseOrders(filter === "All" ? undefined : filter, page, 25, undefined, {search: useDeferredValue(search), from_date: fromDate, to_date: toDate}, `${user?.tenantId}:${activeBranchId}`);
  const orders = data?.items ?? [];

  const receivePurchase = useReceivePurchaseOrder();
  const cancelPurchase = useCancelPurchaseOrder();
  const deletePurchase = useDeletePurchaseOrder();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const filtered = orders;

  const deletableIds = hasPermission("purchase_orders:delete") ? filtered.filter((p) => p.status === "Draft").map((p) => p.id) : [];
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
    { label: "Drafts", value: data?.summary?.counts.Draft || 0, color: "#64748b" },
    { label: "Received", value: data?.summary?.counts.Received || 0, color: "#059669" },
    { label: "Cancelled", value: data?.summary?.counts.Cancelled || 0, color: "#dc2626" },
    { label: "Value (excluding cancelled)", value: fmt(Number(data?.summary?.total_value || 0)), color: "#b45309", isStr: true },
  ];

  const openAdd = () => { setEditing(undefined); setShowModal(true); };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      queueMicrotask(() => setShowModal(true));
    }
  }, []);

  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [billDueDate, setBillDueDate] = useState("");
  const handleReceive = (p: PurchaseOrder) => { setBillDueDate(""); setReceiving(p); };

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
      <div className="flex flex-wrap items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase History</h1>
          <p className="text-sm text-muted mt-1">Review purchases, supplier costs and receiving history.</p>
        </div>
        <Button onClick={openAdd} color={brandColor} disabled={!hasPermission("purchase_orders:create")}>
          <Plus size={16} /> New Purchase
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
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
              onClick={() => {setFilter(s); setPage(1);}}
              className={`px-3 py-1.5 text-[13px] font-semibold transition-colors rounded-lg ${
                filter === s ? "text-white" : "text-foreground/50 hover:text-foreground"
              }`}
              style={filter === s ? { backgroundColor: brandColor } : undefined}
            >
              {s} <span className="opacity-70">({s === "All" ? data?.summary?.total || 0 : data?.summary?.counts[s] || 0})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => {setSearch(e.target.value); setPage(1);}}
            placeholder="Search reference or supplier..."
            className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3"><label className="text-xs text-muted">From<Input aria-label="Purchase date from" type="date" value={fromDate} max={toDate || undefined} onChange={event => {setFromDate(event.target.value); setPage(1);}} /></label><label className="text-xs text-muted">To<Input aria-label="Purchase date to" type="date" value={toDate} min={fromDate || undefined} onChange={event => {setToDate(event.target.value); setPage(1);}} /></label></div>
      {historyError && <p role="alert" className="text-sm text-red-600">{(historyError as {detail?: string}).detail || "Could not load purchase history."}</p>}
      {bulk.count > 0 && (
        <BulkActionBar count={bulk.count} label="purchase order" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <TableScroll><table className="w-full min-w-[1050px]">
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
                  {p.status === "Draft" && hasPermission("purchase_orders:delete") && (
                    <input type="checkbox" checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} className="w-4 h-4 rounded" />
                  )}
                </td>
                <td className="whitespace-nowrap p-3 text-[12px] font-semibold text-foreground">{p.reference}</td>
                <td className="p-4 text-[13px] text-foreground">{p.supplier?.name ?? "—"}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{fmtDateTime(p.created_at)}</td>
                <td className="p-4 text-[13px] text-muted">{p.items.length}</td>
                <td className="p-4 text-right text-[13px] font-bold text-foreground tabular-nums">{formatMoney(p.total, p.currency_code || currency, {showCode: true})}</td>
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
                    {p.status === "Draft" && hasPermission("purchase_orders:update") && (
                      <>
                        <button onClick={() => {setEditing(p); setShowModal(true);}} aria-label={`Edit ${p.reference}`} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10"><Pencil size={13} />Edit</button>
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
                        <button disabled={!hasPermission("purchase_orders:delete")} onClick={() => handleDelete(p)}
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
        </table></TableScroll>
      </div>

      <Pagination page={page} pageSize={25} total={data?.total || 0} onPageChange={setPage} itemLabel="purchases" />
      {showModal && <PurchaseEditor initial={editing} onClose={() => setShowModal(false)} onSaved={() => {setShowModal(false); setEditing(undefined);}} />}

      {/* View */}
      <Drawer open={!!receiving} onClose={() => setReceiving(null)} title="Receive Purchase Order"><form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); if (receiving) receivePurchase.mutate({ id: receiving.id, dueDate: billDueDate || undefined }, { onSuccess: () => setReceiving(null) }); }}><p className="text-sm">Receive {receiving?.reference}, update stock and create the supplier bill.</p><Field label="Supplier bill due date (from agreed terms)"><Input type="date" min={new Date().toISOString().slice(0, 10)} value={billDueDate} onChange={e => setBillDueDate(e.target.value)} /></Field><p className="text-xs text-muted">Leave blank only if terms are unknown. Bills without a due date remain Current and are labelled No due date in aging.</p>{receivePurchase.error && <p role="alert" className="text-sm text-red-600">{receivePurchase.error.message}</p>}<Button type="submit" disabled={receivePurchase.isPending}>Receive & create bill</Button></form></Drawer>
      <Drawer open={!!viewing} onClose={() => setViewing(null)} title="Purchase Order" description={viewing?.reference} size="md">
        {viewing && (
          <div className="p-5 space-y-4">
            {[
              { label: "Supplier", value: viewing.supplier?.name ?? "—" },
              { label: "Status", value: viewing.status },
              { label: "Ordered", value: fmtDateTime(viewing.created_at) },
              { label: "Expected", value: viewing.expected_date ?? "—" },
              { label: "Received", value: viewing.received_at ? fmtDateTime(viewing.received_at) : "—" },
              { label: "Total", value: formatMoney(viewing.total, viewing.currency_code || currency, {showCode: true}) },
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
                        <p className="text-[11px] text-muted">×{it.quantity} @ {formatMoney(it.unit_cost, viewing.currency_code || currency, {showCode: true})}</p>
                        {it.update_catalog_cost && <p className="mt-1 text-[11px] text-accent">Catalog cost update {viewing.status === "Received" ? "applied at receipt" : "on receipt"}</p>}
                        {it.selling_price != null && <p className="mt-1 text-[11px] text-accent">Selling price {viewing.status === "Received" ? "at receipt" : "on receipt"}: {formatMoney(Number(it.selling_price), currency, {showCode: true})}</p>}
                      </div>
                      <span className="text-[13px] font-bold text-foreground tabular-nums flex-shrink-0 ml-2">{formatMoney(it.line_total, viewing.currency_code || currency, {showCode: true})}</span>
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
