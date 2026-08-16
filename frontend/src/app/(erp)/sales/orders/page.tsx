"use client";
import { fmtMoney } from "@/lib/config";
import {
  Plus, Search, ShoppingCart, CheckCircle2, Clock, XCircle,
  Eye, Edit2, Trash2, AlertCircle, Package, ChevronDown,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useState, useEffect, useRef } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { useOrders, useCustomers, useProducts, useCreateOrder, useUpdateOrder, useDeleteOrder } from "@/lib/api/hooks";
import type { ApiOrder, ApiProduct, ApiVariant } from "@/lib/api";
import { financeApi } from "@/lib/api/finance";

const SAL = "#0284c7";

const STATUS_STYLE: Record<string, string> = {
  Completed: "bg-emerald-100 text-emerald-700",
  Pending:   "bg-amber-100 text-amber-700",
  Cancelled: "bg-red-100 text-red-600",
};
const STATUS_ICON: Record<string, React.ElementType> = {
  Completed: CheckCircle2, Pending: Clock, Cancelled: XCircle,
};

type ItemRow = {
  rowId: string;            // stable key for the editor row
  product_id: string;       // uuid or ""
  variant_id: string;       // uuid or ""
  product_name: string;
  sku: string;
  unit_price: string;
  quantity: string;
  discount: string;
  variant_attributes: Record<string, string> | null;
};

const EMPTY_ITEM: ItemRow = { rowId: "", product_id: "", variant_id: "", product_name: "", sku: "", unit_price: "", quantity: "1", discount: "0", variant_attributes: null };
const newItem = (): ItemRow => ({ ...EMPTY_ITEM, rowId: crypto.randomUUID() });
const EMPTY_FORM = { customer_id: "", status: "Pending", discount: "0", tax: "0", notes: "" };

function attrLabel(attrs: Record<string, string> | null | undefined) {
  if (!attrs) return "";
  const entries = Object.entries(attrs);
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
}

// ── Product picker cell ───────────────────────────────────────────────────────
function ProductPicker({
  item, products, onChange,
}: {
  item: ItemRow;
  products: ApiProduct[];
  onChange: (updated: Partial<ItemRow>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [variantsOf, setVariantsOf] = useState<ApiProduct | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.sku ?? "").toLowerCase().includes(q.toLowerCase())
  ).slice(0, 30);

  const pickProduct = (p: ApiProduct) => {
    if (p.has_variants && (p.variants?.length ?? 0) > 0) {
      setVariantsOf(p);
      return;
    }
    onChange({ product_id: p.id, variant_id: "", product_name: p.name, sku: p.sku ?? "", unit_price: String(p.price), variant_attributes: null });
    setOpen(false);
    setQ("");
  };

  const pickVariant = (p: ApiProduct, v: ApiVariant) => {
    onChange({
      product_id: p.id, variant_id: v.id, product_name: p.name,
      sku: v.sku ?? p.sku ?? "", unit_price: String(v.price),
      variant_attributes: v.attributes,
    });
    setOpen(false);
    setQ("");
    setVariantsOf(null);
  };

  const clear = () => onChange({ product_id: "", variant_id: "", product_name: "", sku: "", unit_price: "", variant_attributes: null });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-1 border border-border rounded-lg px-3 py-2 text-[13px] bg-transparent hover:border-foreground/30 transition-colors text-left"
      >
        <span className={item.product_name ? "text-foreground font-medium truncate" : "text-muted/60"}>
          {item.product_name || "Select product…"}
          {item.variant_attributes && <span className="text-muted"> · {attrLabel(item.variant_attributes)}</span>}
        </span>
        <ChevronDown size={13} className="text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border flex items-center gap-2">
            {variantsOf && (
              <button type="button" onClick={() => setVariantsOf(null)} className="text-[12px] font-semibold px-2 py-1 rounded-lg hover:bg-surface transition-colors" style={{ color: SAL }}>
                ← All products
              </button>
            )}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or SKU…"
              className="w-full text-[13px] px-3 py-1.5 border border-border rounded-lg outline-none bg-transparent placeholder:text-muted/60"
            />
          </div>

          {variantsOf ? (
            <div className="max-h-60 overflow-y-auto">
              <div className="px-3 pt-2.5 pb-1 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground">{variantsOf.name}</p>
                <p className="text-[11px] text-muted mt-0.5">{variantsOf.variants.length} variants · pick one</p>
              </div>
              <button
                type="button"
                onClick={() => pickProduct(variantsOf)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-left border-b border-border"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">Use the product itself</p>
                  <p className="text-[11px] text-muted">{variantsOf.sku ?? "No SKU"} · Stock: {variantsOf.stock}</p>
                </div>
                <span className="text-[12px] font-bold text-foreground tabular-nums flex-shrink-0">{fmtMoney(variantsOf.price, "")}</span>
              </button>
              {variantsOf.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => pickVariant(variantsOf, v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{attrLabel(v.attributes)}</p>
                    <p className="text-[11px] text-muted">{v.sku ?? "No SKU"} · Stock: {v.stock}</p>
                  </div>
                  <span className="text-[12px] font-bold text-foreground tabular-nums flex-shrink-0">{fmtMoney(v.price, "")}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="max-h-52 overflow-y-auto">
                {/* manual entry option */}
                <button
                  type="button"
                  onClick={() => { onChange({ product_id: "", variant_id: "", product_name: q || item.product_name, variant_attributes: null }); setOpen(false); setQ(""); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-muted hover:bg-surface transition-colors border-b border-border"
                >
                  <Plus size={12} /> Enter manually
                </button>
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-[12px] text-muted text-center">No products found</p>
                )}
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProduct(p)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-[11px] text-muted">{p.sku ?? "No SKU"} · Stock: {p.has_variants && (p.variants?.length ?? 0) > 0 ? `${p.variants.length} variants` : p.stock}</p>
                    </div>
                    <span className="text-[12px] font-bold text-foreground tabular-nums flex-shrink-0">
                      {fmtMoney(p.price, "")}
                    </span>
                  </button>
                ))}
              </div>
              {item.product_id && (
                <div className="p-2 border-t border-border">
                  <button type="button" onClick={clear} className="w-full text-[11px] text-muted hover:text-red-600 transition-colors py-1">
                    Clear selection
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SalesOrdersPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ApiOrder | null>(null);
  const [viewing, setViewing] = useState<ApiOrder | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<ItemRow[]>([newItem()]);

  const ordersQ = useOrders(1, 200);
  const customersQ = useCustomers(1, 200);
  const productsQ = useProducts(1, 500);
  const loading = ordersQ.isLoading || customersQ.isLoading || productsQ.isLoading;
  const orders = ordersQ.data?.items ?? [];
  const customers = customersQ.data?.items ?? [];
  const products = productsQ.data?.items ?? [];

  const loadError = ordersQ.error ?? customersQ.error ?? productsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load orders" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();
  const saving = createOrder.isPending || updateOrder.isPending;

  const completed = orders.filter((o) => o.status === "Completed");
  const pending   = orders.filter((o) => o.status === "Pending");
  const revenue   = completed.reduce((s, o) => s + o.total, 0);
  const totalVAT  = completed.reduce((s, o) => s + o.tax, 0);

  const stats = [
    { label: "Total Orders", value: String(orders.length),    icon: ShoppingCart, color: SAL },
    { label: "Completed",    value: String(completed.length), icon: CheckCircle2, color: "#10b981" },
    { label: "Pending",      value: String(pending.length),   icon: Clock,        color: "#f59e0b" },
    { label: "Revenue",      value: fmt(revenue),             icon: ShoppingCart, color: "#3b82f6" },
  ];

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = (o.customer?.name ?? "Walk-in").toLowerCase().includes(q) || o.order_number.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const itemsSubtotal = items.reduce((s, i) => s + (Number(i.unit_price) * Number(i.quantity)) - Number(i.discount), 0);
  const orderTotal = Math.max(0, itemsSubtotal - Number(form.discount) + Number(form.tax));

  const openAdd = () => { setForm(EMPTY_FORM); setItems([newItem()]); setShowAdd(true); };
  const openEdit = (o: ApiOrder) => {
    setEditing(o);
    setForm({ customer_id: o.customer_id ?? "", status: o.status, discount: String(o.discount), tax: String(o.tax), notes: o.notes ?? "" });
    setItems(o.items.length
      ? o.items.map((i) => ({ rowId: crypto.randomUUID(), product_id: i.product_id ?? "", variant_id: i.variant_id ?? "", product_name: i.product_name, sku: i.sku ?? "", unit_price: String(i.unit_price), quantity: String(i.quantity), discount: String(i.discount), variant_attributes: i.variant_attributes ?? null }))
      : [newItem()]);
  };
  const closeDrawer = () => { setShowAdd(false); setEditing(null); };

  const updateItem = (idx: number, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.product_name && i.unit_price);
    const payload = {
      customer_id: form.customer_id || null,
      status: form.status,
      discount: Number(form.discount),
      tax: Number(form.tax),
      notes: form.notes || null,
      items: validItems.map((i) => ({
        product_id: i.product_id || null,
        variant_id: i.variant_id || null,
        product_name: i.product_name,
        sku: i.sku || null,
        variant_attributes: i.variant_attributes,
        unit_price: Number(i.unit_price),
        quantity: Number(i.quantity),
        discount: Number(i.discount),
        line_total: (Number(i.unit_price) * Number(i.quantity)) - Number(i.discount),
      })),
    };
    const onError = (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to save order");
    const onSuccess = () => { setError(null); closeDrawer(); };
    if (editing) {
      updateOrder.mutate({
        id: editing.id,
        data: { customer_id: payload.customer_id, status: payload.status, discount: payload.discount, tax: payload.tax, notes: payload.notes },
      }, { onSuccess, onError });
    } else {
      createOrder.mutate(payload, {
        onSuccess: () => {
          if (payload.status === "Completed") {
            financeApi.backfillSales().catch(() => null);
          }
          setError(null); closeDrawer();
        },
        onError,
      });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this order?")) return;
    deleteOrder.mutate(id, { onError: (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to delete order") });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Orders</h1>
          <p className="text-sm text-muted mt-0.5">{orders.length} total orders</p>
        </div>
        <Button color={SAL} onClick={openAdd}><Plus size={15} /> New Order</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
            {["All", "Completed", "Pending", "Cancelled"].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${statusFilter === s ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
                style={statusFilter === s ? { backgroundColor: SAL } : undefined}>{s}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 border border-border rounded-lg px-3 py-2 w-52">
            <Search size={14} className="text-muted flex-shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders..."
              className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted" />
          </div>
        </div>

        {loading ? (
          <PageLoader variant="compact" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 font-semibold">Order ID</th>
                <th className="p-4 font-semibold">Customer</th>
                <th className="p-4 font-semibold">Items</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">VAT (18%)</th>
                <th className="p-4 font-semibold text-right">Total</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((o) => {
                const Icon = STATUS_ICON[o.status] ?? Clock;
                return (
                  <tr key={o.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="p-4 text-sm font-mono font-bold" style={{ color: SAL }}>{o.order_number}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{o.customer?.name ?? <span className="italic text-muted">Walk-in</span>}</td>
                    <td className="p-4 text-sm text-muted">{o.items.length} item{o.items.length !== 1 ? "s" : ""}</td>
                    <td className="p-4 text-sm text-muted">{o.ordered_at ? new Date(o.ordered_at).toLocaleDateString() : "—"}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[o.status] ?? "bg-slate-100 text-slate-600"}`}>
                        <Icon size={11} /> {o.status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm tabular-nums" style={{ color: "#6366f1" }}>{fmt(o.tax)}</td>
                    <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums">{fmt(o.total)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setViewing(o)} aria-label="View order" className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50"><Eye size={13} /> View</button>
                        <button onClick={() => openEdit(o)} aria-label="Edit order" className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[12px] font-semibold disabled:opacity-50"><Edit2 size={13} /> Edit</button>
                        <button onClick={() => handleDelete(o.id)} aria-label="Delete order" className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50"><Trash2 size={13} /> Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <ShoppingCart size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No orders found</p>
          </div>
        )}
        {!loading && completed.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-surface/50 flex flex-wrap items-center gap-6">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Tax Summary (completed orders)</span>
            <span className="text-[12px] font-bold" style={{ color: "#6366f1" }}>VAT Collected: {fmt(totalVAT)}</span>
            <span className="text-[12px] font-bold text-foreground">Net (excl. VAT): {fmt(revenue - totalVAT)}</span>
            <span className="text-[12px] font-bold text-foreground">Gross Revenue: {fmt(revenue)}</span>
          </div>
        )}
      </div>

      {/* ── Add / Edit Drawer ── */}
      <Drawer open={showAdd || !!editing} onClose={closeDrawer} title={editing ? "Edit Order" : "New Order"} description={editing ? editing.order_number : "Create a new sales order"} size="xl">
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer">
              <Select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">Walk-in</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Pending</option><option>Completed</option><option>Cancelled</option>
              </Select>
            </Field>
          </div>

          {/* ── Line items ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-semibold text-muted">
                Items
                <span className="ml-1.5 text-[11px] font-normal text-muted/60">
                  — pick from inventory or type manually
                </span>
              </label>
              <button type="button" onClick={() => setItems((p) => [...p, newItem()])}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-border hover:bg-surface transition-colors" style={{ color: SAL }}>
                + Add row
              </button>
            </div>

            {/* header row */}
            <div className="grid grid-cols-12 gap-2 mb-1 px-0.5">
              {["Product", "Price", "Qty", "Disc.", ""].map((h, i) => (
                <div key={i} className={`text-[11px] font-semibold text-muted ${i === 0 ? "col-span-5" : i === 4 ? "col-span-1" : "col-span-2"}`}>{h}</div>
              ))}
            </div>

            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={it.rowId} className="grid grid-cols-12 gap-2 items-center">
                  {/* product picker */}
                  <div className="col-span-5">
                    <ProductPicker
                      item={it}
                      products={products}
                      onChange={(patch) => updateItem(idx, patch)}
                    />
                  </div>
                  {/* unit price — auto-filled but editable */}
                  <div className="col-span-2">
                    <Input
                      type="number" min="0"
                      value={it.unit_price}
                      onChange={(e) => updateItem(idx, { unit_price: e.target.value })}
                      placeholder="Price"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number" min="1"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number" min="0"
                      value={it.discount}
                      onChange={(e) => updateItem(idx, { discount: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                        aria-label="Remove line"
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-surface text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-[12px] font-semibold disabled:opacity-50">
                        <XCircle size={13} /> Remove
                      </button>
                    )}
                  </div>
                  {/* line total preview */}
                  {it.unit_price && (
                    <div className="col-span-12 -mt-1 px-0.5">
                      <p className="text-[11px] text-muted text-right">
                        Line total: <span className="font-semibold text-foreground">{fmt((Number(it.unit_price) * Number(it.quantity)) - Number(it.discount))}</span>
                        {it.sku && <span className="ml-2 text-muted/60">SKU: {it.sku}</span>}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Order Discount">
              <Input type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </Field>
            <Field label="Tax">
              <Input type="number" min="0" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
            </Field>
          </div>

          {/* order total summary */}
          <div className="bg-surface border border-border rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-[12px] text-muted">
              <span>Subtotal</span><span className="tabular-nums">{fmt(itemsSubtotal)}</span>
            </div>
            {Number(form.discount) > 0 && (
              <div className="flex justify-between text-[12px] text-muted">
                <span>Discount</span><span className="tabular-nums text-red-500">−{fmt(Number(form.discount))}</span>
              </div>
            )}
            {Number(form.tax) > 0 && (
              <div className="flex justify-between text-[12px] text-muted">
                <span>Tax</span><span className="tabular-nums">{fmt(Number(form.tax))}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-foreground border-t border-border pt-1.5 mt-1">
              <span>Total</span><span className="tabular-nums">{fmt(orderTotal)}</span>
            </div>
          </div>

          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
          </Field>
          <FormFooter
            submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Create Order"}
            onCancel={closeDrawer}
            disabled={saving || (!editing && items.every((i) => !i.product_name))}
            color={SAL}
          />
        </form>
      </Drawer>

      {/* ── View Drawer ── */}
      <Drawer open={!!viewing} onClose={() => setViewing(null)} title="Order Details" description={viewing?.order_number} size="md">
        {viewing && (
          <div className="p-5 space-y-4">
            {[
              { label: "Customer", value: viewing.customer?.name ?? "Walk-in" },
              { label: "Status",   value: viewing.status },
              { label: "Date",     value: viewing.ordered_at ? new Date(viewing.ordered_at).toLocaleDateString() : "—" },
              { label: "Subtotal", value: fmt(viewing.subtotal) },
              { label: "Discount", value: fmt(viewing.discount) },
              { label: "Tax",      value: fmt(viewing.tax) },
              { label: "Total",    value: fmt(viewing.total) },
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
                      <div className="flex items-center gap-2 min-w-0">
                        <Package size={13} className="text-muted flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate">{it.product_name}</p>
                          {it.variant_attributes && <p className="text-[11px] text-muted">{attrLabel(it.variant_attributes)}</p>}
                          {it.sku && <p className="text-[11px] text-muted">SKU: {it.sku}</p>}
                        </div>
                        <span className="text-[11px] text-muted flex-shrink-0">×{it.quantity}</span>
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
