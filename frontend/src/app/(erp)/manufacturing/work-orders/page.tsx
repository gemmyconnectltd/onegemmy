"use client";
import { useState } from "react";
import {
  Factory, Plus, Layers, CheckCircle2, Boxes, Trash2, AlertCircle,
  PlayCircle, Package, Calendar, X,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useProductionOrders, useProducts, useCreateProductionOrder, useCompleteProductionOrder, useDeleteProductionOrder } from "@/lib/api/hooks";
import type { ApiProductionOrder } from "@/lib/api/manufacturing";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea, FormFooter } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

const COLOR = "#0f766e";

const STATUS_OPTS = ["Draft", "Scheduled", "In Progress", "Completed", "Cancelled"];
const statusBadge: Record<string, string> = {
  "Draft": "bg-surface text-muted border border-border",
  "Scheduled": "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  "Completed": "bg-emerald-100 text-emerald-700",
  "Cancelled": "bg-red-100 text-red-600",
};

type ComponentRow = { id: string; product_id: string; quantity_required: number };
const EMPTY_FORM = { product_id: "", quantity: 1, scheduled_date: "", notes: "", components: [] as ComponentRow[] };

export default function WorkOrdersPage() {
  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const ordersQ = useProductionOrders(1, 500);
  const productsQ = useProducts(1, 500);
  const loading = ordersQ.isLoading || productsQ.isLoading;
  const orders = ordersQ.data?.items ?? [];
  const products = productsQ.data?.items ?? [];

  const loadError = ordersQ.error ?? productsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load production orders" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createOrder = useCreateProductionOrder();
  const completeOrder = useCompleteProductionOrder();
  const deleteOrder = useDeleteProductionOrder();
  const saving = createOrder.isPending;
  const completing = completeOrder.isPending;

  const completedOrders = orders.filter((o) => o.status === "Completed");
  const unitsProduced = completedOrders.reduce((s, o) => s + o.quantity, 0);
  const inProgress = orders.filter((o) => o.status === "In Progress" || o.status === "Scheduled").length;

  const stats = [
    { label: "Work Orders", value: orders.length, icon: Factory, color: COLOR },
    { label: "In Progress", value: inProgress, icon: Layers, color: "#0284c7" },
    { label: "Completed", value: completedOrders.length, icon: CheckCircle2, color: "#10b981" },
    { label: "Units Produced", value: unitsProduced, icon: Boxes, color: "#b45309" },
  ];

  const displayed = orders.filter((o) => filter === "All" || o.status === filter);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, components: [] });
    setFormError(null);
    setShowAdd(true);
  };
  const closeDrawer = () => setShowAdd(false);

  const addComponent = () =>
    setForm((f) => ({ ...f, components: [...f.components, { id: crypto.randomUUID(), product_id: products[0]?.id ?? "", quantity_required: 1 }] }));
  const setComponent = (i: number, patch: Partial<ComponentRow>) =>
    setForm((f) => ({ ...f, components: f.components.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  const removeComponent = (i: number) =>
    setForm((f) => ({ ...f, components: f.components.filter((_, idx) => idx !== i) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const product = products.find((p) => p.id === form.product_id);
    const items = form.components
      .filter((c) => c.product_id)
      .map((c) => {
        const p = products.find((x) => x.id === c.product_id);
        return { product_id: c.product_id, product_name: p?.name ?? null, quantity_required: c.quantity_required };
      });
    if (!form.product_id || !product) {
      setFormError("Select the finished product for this work order.");
      return;
    }
    const payload = {
      product_id: form.product_id,
      product_name: product.name,
      quantity: form.quantity,
      status: "Draft",
      scheduled_date: form.scheduled_date || null,
      notes: form.notes.trim() || null,
      items,
    };
    createOrder.mutate(payload, {
      onSuccess: () => { setError(null); closeDrawer(); },
      onError: (err: Error) => setFormError((err as { detail?: string })?.detail ?? "Failed to create work order"),
    });
  };

  const handleComplete = (o: ApiProductionOrder) => {
    if (!confirm(`Complete work order ${o.order_number}?\nThis consumes ${o.items.length} component(s) from stock and adds ${o.quantity} × ${o.product_name ?? "product"} to stock.`)) return;
    completeOrder.mutate(o.id, {
      onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to complete work order"),
    });
  };

  const handleDelete = (o: ApiProductionOrder) => {
    if (!confirm(`Delete work order ${o.order_number}?`)) return;
    deleteOrder.mutate(o.id, {
      onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete work order"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Work Orders</h1>
          <p className="text-sm text-muted mt-0.5">{loading ? "Loading..." : `${orders.length} work orders`}</p>
        </div>
        <Button color={COLOR} onClick={openAdd}><Plus size={15} /> New Work Order</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit flex-wrap">
        {["All", ...STATUS_OPTS].map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${filter === t ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
            style={filter === t ? { backgroundColor: COLOR } : undefined}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <PageLoader variant="compact" />
        ) : displayed.length === 0 ? (
          <div className="py-20 text-center">
            <Factory size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No work orders yet</p>
            <p className="text-xs text-muted mt-1 mb-4">Create a work order to assemble finished goods from components</p>
            <Button color={COLOR} size="sm" onClick={openAdd}><Plus size={13} /> New Work Order</Button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Order</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Product</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">Qty</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Components</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Scheduled</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((o) => (
                <tr key={o.id} className="hover:bg-surface/50 transition-colors group">
                  <td className="px-4 py-3 text-sm font-bold text-foreground">{o.order_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package size={13} className="text-muted" />
                      <span className="text-sm font-medium text-foreground">{o.product_name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-foreground tabular-nums">{o.quantity}</td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {o.items.length > 0
                      ? o.items.map((i) => `${i.product_name ?? "?"} ×${i.quantity_required}`).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                      <Calendar size={12} /> {o.scheduled_date ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadge[o.status] ?? "bg-surface text-muted"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      {o.status !== "Completed" && o.status !== "Cancelled" && (
                        <button onClick={() => handleComplete(o)}
                          disabled={completing}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors text-[12px] font-semibold disabled:opacity-40">
                          <PlayCircle size={14} /> Complete
                        </button>
                      )}
                      {o.status !== "Completed" && (
                        <button onClick={() => handleDelete(o)}
                          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={showAdd} onClose={closeDrawer}
        title="New Work Order"
        description="Assemble finished goods from stock components"
        size="md">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Finished Product" required>
              <Select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}>
                <option value="">Select product...</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Quantity to Produce" required>
              <Input type="number" min={1} value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))} />
            </Field>
          </div>
          <Field label="Scheduled Date">
            <Input type="date" value={form.scheduled_date}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-muted">Components (consumed from stock)</p>
              <button type="button" onClick={addComponent}
                className="text-[12px] font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
                style={{ color: COLOR }}>
                <Plus size={13} /> Add Component
              </button>
            </div>
            {form.components.length === 0 ? (
              <p className="text-[12px] text-muted bg-surface border border-dashed border-border rounded-lg px-3 py-2.5">
                No components — completion will only add the finished product to stock.
              </p>
            ) : (
              <div className="space-y-2">
                {form.components.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Select value={c.product_id}
                      onChange={(e) => setComponent(i, { product_id: e.target.value })} className="flex-1">
                      <option value="">Select component...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                    </Select>
                    <Input type="number" min={1} value={c.quantity_required}
                      onChange={(e) => setComponent(i, { quantity_required: Number(e.target.value) || 1 })}
                      className="w-24 text-center" />
                    <button type="button" onClick={() => removeComponent(i)}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50 flex-shrink-0">
                      <X size={14} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Notes">
            <Textarea rows={2} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Production notes..." />
          </Field>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <FormFooter
            submitLabel={saving ? "Creating..." : "Create Work Order"}
            onCancel={closeDrawer}
            disabled={saving || !form.product_id}
            color={COLOR}
          />
        </form>
      </Drawer>
    </div>
  );
}
