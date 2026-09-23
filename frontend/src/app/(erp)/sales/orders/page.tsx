"use client";
import { fmtMoney } from "@/lib/config";
import { fmtDateTime } from "@/lib/date";
import {
  Plus, Search, ShoppingCart, CheckCircle2, Clock, XCircle,
  Eye, Edit2, AlertCircle, Package, ChevronDown, Upload,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useState, useEffect, useRef } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { useOrders, useCustomers, useProducts, useCreateOrder, useUpdateOrder, useDeleteOrder, useBulkCreateOrders } from "@/lib/api/hooks";
import type { ApiOrder, ApiProduct, ApiVariant } from "@/lib/api";
import { accountingApi } from "@/lib/api/accounting";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CsvImportDrawer } from "@/components/ui/CsvImportDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

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

// ── CSV order import ─────────────────────────────────────────────────────────
// One row per order line; rows sharing the same orderReference become one
// order (the backend groups them), so a multi-item historical sale is just
// that reference repeated across rows.
const ORDER_CSV_HEADERS = ["orderReference", "customer", "orderedAt", "status", "paymentMethod", "notes", "sku", "quantity", "unitPrice"];

interface OrderImportRow {
  order_reference: string;
  customer: string | null;
  ordered_at: string | null;
  status: string;
  payment_method: string | null;
  notes: string | null;
  sku: string;
  quantity: number;
  unit_price: number;
}

function parseOrderRow(raw: Record<string, string>): { data: OrderImportRow; errors: string[] } {
  const errors: string[] = [];
  if (!raw.orderreference) errors.push("orderReference required");
  if (!raw.sku) errors.push("sku required");
  if (!raw.unitprice || isNaN(Number(raw.unitprice))) errors.push("invalid unitPrice");
  if (raw.quantity !== undefined && raw.quantity !== "" && isNaN(Number(raw.quantity))) errors.push("invalid quantity");
  const status = (raw.status || "Completed").trim();
  if (status && !["Completed", "Pending"].includes(status)) errors.push("status must be Completed or Pending");
  return {
    data: {
      order_reference: raw.orderreference?.trim() ?? "",
      customer: raw.customer?.trim() || null,
      ordered_at: raw.orderedat?.trim() || null,
      status: status || "Completed",
      payment_method: raw.paymentmethod?.trim() || null,
      notes: raw.notes?.trim() || null,
      sku: raw.sku?.trim() ?? "",
      quantity: raw.quantity ? Number(raw.quantity) : 1,
      unit_price: Number(raw.unitprice),
    },
    errors,
  };
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
  const { brandColor: SAL } = useAppConfig();

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
  const { currencySymbol, brandColor } = useAppConfig();
  const SAL = brandColor;
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<ApiOrder | null>(null);
  const [viewing, setViewing] = useState<ApiOrder | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<ItemRow[]>([newItem()]);

  // Reset to page 1 right where a filter changes, not via an effect.
  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };
  const onStatusFilterChange = (s: string) => { setStatusFilter(s); setPage(1); };

  const ordersQ = useOrders(page, pageSize, statusFilter === "All" ? undefined : statusFilter, debouncedSearch || undefined);
  // Customer/product pickers for the create/edit form need the full lists, not
  // the current table page — kept as their own, separately-paginated fetches.
  const customersQ = useCustomers(1, 200);
  const productsQ = useProducts(1, 500);
  const loading = ordersQ.isLoading || customersQ.isLoading || productsQ.isLoading;
  const orders = ordersQ.data?.items ?? [];
  const total = ordersQ.data?.total ?? 0;
  const customers = customersQ.data?.items ?? [];
  const products = productsQ.data?.items ?? [];

  // Stat cards summarise the whole tenant, not just the current filtered page:
  // cheap page_size=1 calls read `.total` for the status breakdown, and a
  // capped fetch of Completed orders (same pattern the dashboard uses) feeds
  // the revenue/VAT sums.
  const totalOrdersQ = useOrders(1, 1);
  const completedCountQ = useOrders(1, 1, "Completed");
  const pendingCountQ = useOrders(1, 1, "Pending");
  const revenueQ = useOrders(1, 500, "Completed");
  const statsLoading = totalOrdersQ.isLoading || completedCountQ.isLoading || pendingCountQ.isLoading || revenueQ.isLoading;
  const revenueOrders = revenueQ.data?.items ?? [];
  const revenue = revenueOrders.reduce((s, o) => s + o.total, 0);
  const totalVAT = revenueOrders.reduce((s, o) => s + o.tax, 0);

  const loadError = ordersQ.error ?? customersQ.error ?? productsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load orders" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();
  const bulkCreateOrders = useBulkCreateOrders();
  const saving = createOrder.isPending || updateOrder.isPending;

  const stats = [
    { label: "Total Orders", value: String(totalOrdersQ.data?.total ?? 0),    icon: ShoppingCart, color: SAL },
    { label: "Completed",    value: String(completedCountQ.data?.total ?? 0), icon: CheckCircle2, color: "#10b981" },
    { label: "Pending",      value: String(pendingCountQ.data?.total ?? 0),   icon: Clock,        color: "#f59e0b" },
    { label: "Revenue",      value: fmt(revenue),                            icon: ShoppingCart, color: "#3b82f6" },
  ];

  const bulk = useBulkSelection(orders.map((o) => o.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Orders",
      message: `Delete ${bulk.count} selected order${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteOrder.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

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
            accountingApi.backfillSales().catch(() => null);
          }
          setError(null); closeDrawer();
        },
        onError,
      });
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Orders</h1>
          <p className="text-sm text-muted mt-0.5">{total} total order{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import</Button>
          <Button color={SAL} onClick={openAdd}><Plus size={15} /> New Order</Button>
        </div>
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
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{statsLoading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
            {["All", "Completed", "Pending", "Cancelled"].map((s) => (
              <button key={s} onClick={() => onStatusFilterChange(s)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${statusFilter === s ? "text-white" : "text-foreground/50 hover:text-foreground"}`}
                style={statusFilter === s ? { backgroundColor: SAL } : undefined}>{s}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 border border-border rounded-lg px-3 py-2 w-52">
            <Search size={14} className="text-muted flex-shrink-0" />
            <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search orders..."
              className="flex-1 text-[13px] outline-none bg-transparent text-foreground placeholder:text-muted" />
          </div>
        </div>

        {bulk.count > 0 && (
          <div className="p-4 border-b border-border">
            <BulkActionBar count={bulk.count} label="order" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
          </div>
        )}

        {loading ? (
          <PageLoader variant="compact" />
        ) : (
          <table className={`w-full min-w-160 transition-opacity ${ordersQ.isFetching ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 w-10">
                  <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={orders.length === 0} />
                </th>
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
              {orders.map((o) => {
                const Icon = STATUS_ICON[o.status] ?? Clock;
                return (
                  <tr key={o.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="p-4">
                      <input type="checkbox" checked={bulk.selected.has(o.id)} onChange={() => bulk.toggle(o.id)} className="w-4 h-4 rounded" />
                    </td>
                    <td className="p-4 text-sm font-mono font-bold" style={{ color: SAL }}>{o.order_number}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{o.customer?.name ?? <span className="italic text-muted">Walk-in</span>}</td>
                    <td className="p-4 text-sm text-muted">{o.items.length} item{o.items.length !== 1 ? "s" : ""}</td>
                    <td className="p-4 text-sm text-muted whitespace-nowrap">{fmtDateTime(o.ordered_at)}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[o.status] ?? "bg-slate-100 text-slate-600"}`}>
                        <Icon size={11} /> {o.status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm tabular-nums" style={{ color: "#6366f1" }}>{fmt(o.tax)}</td>
                    <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums">{fmt(o.total)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewing(o)} aria-label="View order" title="View" className="w-7 h-7 rounded-md flex items-center justify-center bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors"><Eye size={13} /></button>
                        <button onClick={() => openEdit(o)} aria-label="Edit order" title="Edit" className="w-7 h-7 rounded-md flex items-center justify-center bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors"><Edit2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && orders.length === 0 && (
          <div className="py-16 text-center">
            <ShoppingCart size={32} className="text-border mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">No orders found</p>
          </div>
        )}
        {!loading && orders.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="orders" color={SAL} />
        )}
        {!statsLoading && revenueOrders.length > 0 && (
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
              { label: "Date",     value: fmtDateTime(viewing.ordered_at) },
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

      <CsvImportDrawer<OrderImportRow>
        open={showImport}
        onClose={() => setShowImport(false)}
        onSubmit={async (items) => { await bulkCreateOrders.mutateAsync(items); }}
        title="Import Orders"
        itemNoun="order"
        templateFilename="orders_template.xlsx"
        templateHeaders={ORDER_CSV_HEADERS}
        templateSampleRows={[
          ["INV-1001", "Jean Pierre", "2025-01-05", "Completed", "Cash", "", "PC-001", "2", "5000"],
          ["INV-1001", "Jean Pierre", "2025-01-05", "Completed", "Cash", "", "UC-002", "1", "3000"],
        ]}
        previewColumns={[
          { key: "orderreference", label: "Order Ref", required: true },
          { key: "customer", label: "Customer" },
          { key: "orderedat", label: "Date" },
          { key: "sku", label: "SKU", required: true },
          { key: "quantity", label: "Qty", align: "right" },
          { key: "unitprice", label: "Unit Price", align: "right", required: true },
          { key: "status", label: "Status" },
          { key: "paymentmethod", label: "Payment" },
          { key: "notes", label: "Notes" },
        ]}
        parseRow={parseOrderRow}
        color={SAL}
      />
    </div>
  );
}
