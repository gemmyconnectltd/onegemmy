"use client";
import { fmtMoney } from "@/lib/config";
import { useState } from "react";
import { CheckCircle2, Package, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fmtDateTime } from "@/lib/date";
import {
  usePurchaseReturns, usePurchaseOrders,
  useCreatePurchaseReturn, useRefundPurchaseReturn, useReplacePurchaseReturn, useDeletePurchaseReturn,
} from "@/lib/api/hooks";
import type { PurchaseReturn } from "@/lib/api";

type Status = "Processing" | "Refunded" | "Replaced";
const STATUS_STYLES: Record<Status, string> = {
  Processing: "bg-amber-100 text-amber-700",
  Refunded: "bg-emerald-100 text-emerald-700",
  Replaced: "bg-blue-50 text-blue-700",
};
const EMPTY_FORM = { purchase_order_id: "", item_index: "", quantity: "1", amount: "", reason: "" };

export default function PurchaseReturnsPage() {
  const { currencySymbol, brandColor } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = usePurchaseReturns();
  const { data: poData } = usePurchaseOrders("Received", 1, 200, { enabled: showModal });
  const returns = data?.items ?? [];
  const receivedOrders = poData?.items ?? [];

  const createReturn = useCreatePurchaseReturn();
  const refundReturn = useRefundPurchaseReturn();
  const replaceReturn = useReplacePurchaseReturn();
  const deleteReturn = useDeletePurchaseReturn();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const filtered = returns.filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || (r.supplier_name ?? "").toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || r.product_name.toLowerCase().includes(q);
  });

  const totalRefunded = returns.filter((r) => r.status === "Refunded").reduce((s, r) => s + r.amount, 0);
  const processingCount = returns.filter((r) => r.status === "Processing").length;

  const selectedPo = receivedOrders.find((p) => p.id === form.purchase_order_id);
  const selectedItem = selectedPo?.items[Number(form.item_index)];

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  };

  const pickItem = (poId: string, itemIndex: string) => {
    const po = receivedOrders.find((p) => p.id === poId);
    const item = po?.items[Number(itemIndex)];
    setForm((f) => ({
      ...f,
      purchase_order_id: poId,
      item_index: itemIndex,
      amount: item ? String(item.unit_cost) : "",
    }));
  };

  const submitReturn = async () => {
    setFormError(null);
    if (!selectedPo || !selectedItem) {
      setFormError("Select a purchase order and item.");
      return;
    }
    try {
      await createReturn.mutateAsync({
        purchase_order_id: selectedPo.id,
        product_id: selectedItem.product_id,
        variant_id: selectedItem.variant_id,
        product_name: selectedItem.product_name,
        quantity: Number(form.quantity) || 1,
        amount: Number(form.amount) || 0,
        reason: form.reason.trim() || null,
      });
      setShowModal(false);
    } catch (e: unknown) {
      setFormError((e as { detail?: string })?.detail ?? "Failed to record return");
    }
  };

  const handleRefund = (r: PurchaseReturn) => {
    confirm({
      title: "Mark as Refunded",
      message: `Mark return ${r.reference} as refunded (${fmt(r.amount)})?`,
      confirmLabel: "Mark Refunded",
      onConfirm: () => refundReturn.mutate(r.id),
    });
  };

  const handleReplace = (r: PurchaseReturn) => {
    confirm({
      title: "Mark as Replaced",
      message: `Mark return ${r.reference} as replaced by the supplier?`,
      confirmLabel: "Mark Replaced",
      onConfirm: () => replaceReturn.mutate(r.id),
    });
  };

  const handleDelete = (r: PurchaseReturn) => {
    confirm({
      title: "Delete Return",
      message: `Delete return ${r.reference}? This restores the returned stock. Cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => deleteReturn.mutate(r.id),
    });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Returns</h1>
          <p className="text-sm text-muted mt-1">Track items sent back to suppliers and refunds.</p>
        </div>
        <Button onClick={openAdd} color={brandColor}>
          <Plus size={16} /> New Return
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: "Returns", value: returns.length, color: brandColor },
          { label: "Refunded", value: fmt(totalRefunded), color: "#059669" },
          { label: "Processing", value: processingCount, color: "#b45309" },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-card border border-border px-3 py-2 w-56">
        <Search size={14} className="text-muted flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search returns..."
          className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted"
        />
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="p-4 font-medium">Return</th>
              <th className="p-4 font-medium">PO</th>
              <th className="p-4 font-medium">Supplier</th>
              <th className="p-4 font-medium">Item</th>
              <th className="p-4 font-medium text-right">Qty</th>
              <th className="p-4 font-medium text-right">Amount</th>
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium">Reason</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                <td className="p-4">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                    <RotateCcw size={14} className="text-accent" />{r.reference}
                  </span>
                </td>
                <td className="p-4 text-[13px] text-muted">{r.po_reference ?? "—"}</td>
                <td className="p-4 text-[13px] text-foreground">{r.supplier_name ?? "—"}</td>
                <td className="p-4 text-[13px] text-foreground">{r.product_name}</td>
                <td className="p-4 text-right text-[13px] font-semibold text-foreground tabular-nums">{r.quantity}</td>
                <td className="p-4 text-right text-[13px] font-bold text-foreground tabular-nums">{fmt(r.amount)}</td>
                <td className="p-4 text-[13px] text-muted whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="p-4 text-[13px] text-muted">{r.reason ?? "—"}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLES[r.status as Status] ?? "bg-surface text-muted"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.status === "Processing" && (
                      <>
                        <button onClick={() => handleRefund(r)}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                          <CheckCircle2 size={13} /> Refund
                        </button>
                        <button onClick={() => handleReplace(r)}
                          className="flex items-center gap-1 px-2.5 h-8 text-[12px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">
                          <Package size={13} /> Replace
                        </button>
                        <button onClick={() => handleDelete(r)}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-10 text-center text-sm text-muted">No returns match.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      <Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Purchase Return"
        description="Send an item from a received order back to its supplier."
        side="right"
        footer={
          <form onSubmit={(e) => { e.preventDefault(); submitReturn(); }}>
            <FormFooter submitLabel={createReturn.isPending ? "Recording…" : "Record return"} onCancel={() => setShowModal(false)} disabled={createReturn.isPending} />
          </form>
        }
      >
        <div className="p-5 space-y-4">
          <Field label="Purchase Order" required>
            <Select value={form.purchase_order_id} onChange={(e) => setForm((f) => ({ ...f, purchase_order_id: e.target.value, item_index: "" }))}>
              <option value="">— Select a received order —</option>
              {receivedOrders.map((p) => <option key={p.id} value={p.id}>{p.reference} — {p.supplier?.name ?? "No supplier"}</option>)}
            </Select>
          </Field>
          {selectedPo && (
            <Field label="Item" required>
              <Select value={form.item_index} onChange={(e) => pickItem(form.purchase_order_id, e.target.value)}>
                <option value="">— Select item —</option>
                {selectedPo.items.map((it, i) => <option key={it.id} value={i}>{it.product_name} (×{it.quantity})</option>)}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty">
              <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            </Field>
            <Field label={`Refund Amount (${currencySymbol})`}>
              <Input type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="font-mono" />
            </Field>
          </div>
          <Field label="Reason">
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Damaged in transit" />
          </Field>
          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
