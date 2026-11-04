"use client";
import { ExportButton } from "@/components/ui/ExportButton";
import { fetchEvery } from "@/lib/exportTable";
import { salesApi } from "@/lib/api/sales";
import Link from "next/link";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
import { ALL_TIME, periodFromQuery, periodLabel, periodRange, type PeriodValue } from "@/lib/period";
import { TableScroll } from "@/components/ui/TableScroll";

import { orderBaseTax, orderBaseTotal } from "@/lib/baseMoney";
import { fmtMoney } from "@/lib/config";
import { fmtDateTime } from "@/lib/date";
import {
  Plus, Search, ShoppingCart, CheckCircle2, Clock, XCircle,
  Eye, Edit2, AlertCircle, ChevronDown, Upload,
  Archive, ArchiveRestore,
} from "lucide-react";
import { TableState } from "@/components/ui/TableState";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { useOrders, useCustomers, useProducts, useCreateOrder, useUpdateOrder, useApproveOrder, useRejectOrder, useCorrectOrder, useArchiveOrder, useRestoreOrder, useBulkCreateOrders } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import type { ApiOrder, ApiOrderPayment, ApiProduct, ApiVariant } from "@/lib/api";
import { PaymentStatusBadge } from "@/components/accounting/InvoiceDocument";
import { SaleDocumentDrawer } from "@/components/sales/SaleDocumentDrawer";
import { RecordPaymentDrawer } from "@/components/accounting/RecordPaymentDrawer";
import { ReversePaymentDrawer } from "@/components/accounting/ReversePaymentDrawer";
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
  "Awaiting Approval": "bg-violet-100 text-violet-700",
  Rejected:  "bg-red-100 text-red-600",
};
const STATUS_ICON: Record<string, React.ElementType> = {
  Completed: CheckCircle2, Pending: Clock, Cancelled: XCircle, "Awaiting Approval": Clock, Rejected: XCircle,
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
const EMPTY_FORM = { customer_id: "", status: "Pending", discount: "0", tax: "0", notes: "", sale_at: "", reason: "" };
/** An ISO moment as the local value a datetime-local input expects. */
const toLocalInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

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
  if (!raw.orderreference) errors.push("Sale reference required");
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
                className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-left border-b border-border"
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
                  className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-left"
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
                    className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-left"
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
  const { user: authUser } = useAuth();
  // Owners and administrators run the books: only they archive/restore a sale or move its date. Nobody deletes a sale.
  const isOwner = !!authUser?.isSuperuser || ["admin", "owner", "owner/ceo"].includes((authUser?.role ?? "").toLowerCase());
  const [statusFilter, setStatusFilter] = useState("All");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<ApiOrder | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [recordingPaymentFor, setRecordingPaymentFor] = useState<ApiOrder | null>(null);
  const [reversingPayment, setReversingPayment] = useState<ApiOrderPayment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<ItemRow[]>([newItem()]);

  // Reset to page 1 right where a filter changes, not via an effect.
  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };
  const onStatusFilterChange = (s: string) => { setStatusFilter(s); setPage(1); };
  const onPaymentStatusFilterChange = (s: string) => { setPaymentStatusFilter(s); setPage(1); };
  const [period, setPeriod] = useState<PeriodValue>(ALL_TIME);
  const range = useMemo(() => periodRange(period), [period]);
  // Opened from a report number: show the sales behind it for the same dates.
  useEffect(() => { const linked = periodFromQuery(window.location.search); if (linked) queueMicrotask(() => setPeriod(linked)); }, []);
  const onPeriodChange = (v: PeriodValue) => { setPeriod(v); setPage(1); };
  const filtersActive = statusFilter !== "All" || paymentStatusFilter !== "All" || period.key !== "all" || search.trim() !== "";
  const clearFilters = () => { setStatusFilter("All"); setPaymentStatusFilter("All"); setPeriod(ALL_TIME); setSearch(""); setPage(1); };

  const showArchived = statusFilter === "Archived";
  const ordersQ = useOrders(page, pageSize, statusFilter === "All" || showArchived ? undefined : statusFilter, debouncedSearch || undefined, paymentStatusFilter === "All" ? undefined : paymentStatusFilter, undefined, range, showArchived);
  // Customer/product pickers for the create/edit form need the full lists, not
  // the current table page — kept as their own, separately-paginated fetches.
  const customersQ = useCustomers(1, 200);
  const productsQ = useProducts(1, 500);
  const loading = ordersQ.isLoading || customersQ.isLoading || productsQ.isLoading;
  const orders = ordersQ.data?.items ?? [];
  // Derived from the live list (not a captured snapshot) so the drawer
  // reflects a payment recorded/reversed while it's open.
  const viewing = orders.find((o) => o.id === viewingId) ?? null;
  const total = ordersQ.data?.total ?? 0;
  const customers = customersQ.data?.items ?? [];
  const products = productsQ.data?.items ?? [];

  // Stat cards summarise the whole tenant, not just the current filtered page:
  // cheap page_size=1 calls read `.total` for the status breakdown, and a
  // capped fetch of Completed orders (same pattern the dashboard uses) feeds
  // the revenue/VAT sums.
  const totalOrdersQ = useOrders(1, 1, undefined, undefined, undefined, undefined, range);
  const completedCountQ = useOrders(1, 1, "Completed", undefined, undefined, undefined, range);
  const pendingCountQ = useOrders(1, 1, "Pending", undefined, undefined, undefined, range);
  const revenueQ = useOrders(1, 500, "Completed", undefined, undefined, undefined, range);
  const statsLoading = totalOrdersQ.isLoading || completedCountQ.isLoading || pendingCountQ.isLoading || revenueQ.isLoading;
  const revenueOrders = revenueQ.data?.items ?? [];
  const revenue = revenueOrders.reduce((s, o) => s + orderBaseTotal(o), 0);
  const totalVAT = revenueOrders.reduce((s, o) => s + orderBaseTax(o), 0);

  const loadError = ordersQ.error ?? customersQ.error ?? productsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load sales" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const correctOrder = useCorrectOrder();
  const archiveOrder = useArchiveOrder();
  const restoreOrder = useRestoreOrder();
  const bulkCreateOrders = useBulkCreateOrders();
  const saving = createOrder.isPending || updateOrder.isPending || correctOrder.isPending;

  const stats = [
    { label: "Total Sales", value: String(totalOrdersQ.data?.total ?? 0),    icon: ShoppingCart, color: SAL },
    { label: "Completed",    value: String(completedCountQ.data?.total ?? 0), icon: CheckCircle2, color: "#10b981" },
    { label: "Pending",      value: String(pendingCountQ.data?.total ?? 0),   icon: Clock,        color: "#f59e0b" },
    { label: "Revenue",      value: fmt(revenue),                            icon: ShoppingCart, color: "#3b82f6" },
  ];

  const bulk = useBulkSelection(orders.map((o) => o.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  // Credit sales held over the daily limit wait here for someone with credit:approve (GM/CEO).
  const { hasPermission } = useAuth();
  const canApproveCredit = hasPermission("credit:approve");
  const approveOrder = useApproveOrder();
  const rejectOrder = useRejectOrder();
  const decideBusy = approveOrder.isPending || rejectOrder.isPending;
  const decideCredit = (o: ApiOrder, action: "approve" | "reject") => confirm({
    title: action === "approve" ? "Approve this credit sale?" : "Reject this credit sale?",
    message: action === "approve"
      ? `${o.order_number} for ${o.customer?.name ?? "this customer"} will be completed: stock goes out and ${fmt(o.total)} is booked, with the unpaid balance as customer debt.`
      : `${o.order_number} will be declined. Nothing was posted for it, so no stock or accounts change.`,
    confirmLabel: action === "approve" ? "Approve" : "Reject",
    danger: action === "reject",
    onConfirm: () => (action === "approve" ? approveOrder : rejectOrder).mutate({ id: o.id }),
  });
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkArchive() {
    const restoring = showArchived;
    confirm({
      title: restoring ? "Restore sales" : "Archive sales",
      message: restoring
        ? `Restore ${bulk.count} selected sale${bulk.count === 1 ? "" : "s"} to Sales History?`
        : `Archive ${bulk.count} selected sale${bulk.count === 1 ? "" : "s"}? They leave Sales History but stay in the books and reports, and can be restored from the Archived tab.`,
      confirmLabel: restoring ? "Restore" : "Archive",
      onConfirm: async () => {
        setBulkDeleting(true);
        const results = await Promise.allSettled(Array.from(bulk.selected).map((id) => restoring ? restoreOrder.mutateAsync(id) : archiveOrder.mutateAsync({ id, reason: "Archived from Sales History" })));
        setBulkDeleting(false);
        bulk.clear();
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed) setError(`${failed} sale${failed === 1 ? "" : "s"} could not be ${restoring ? "restored" : "archived"}.`);
      },
    });
  }

  const itemsSubtotal = items.reduce((s, i) => s + (Number(i.unit_price) * Number(i.quantity)) - Number(i.discount), 0);
  const orderTotal = Math.max(0, itemsSubtotal - Number(form.discount) + Number(form.tax));

  const openEdit = (o: ApiOrder) => {
    setEditing(o);
    setForm({ customer_id: o.customer_id ?? "", status: o.status, discount: String(o.discount), tax: String(o.tax), notes: o.notes ?? "", sale_at: toLocalInput(o.ordered_at), reason: "" });
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
    const onError = (err: Error) => setError((err as { detail?: string })?.detail ?? "Failed to save sale");
    const onSuccess = () => { setError(null); closeDrawer(); };
    if (editing) {
      // A posted sale is not repriced or reopened (the ledger is built on it): only its notes, and, for an owner, its date, can change.
      const posted = editing.status === "Completed";
      const dateChanged = isOwner && !!form.sale_at && form.sale_at !== toLocalInput(editing.ordered_at);
      const dateField = dateChanged ? { ordered_at: new Date(form.sale_at).toISOString() } : {};
      if (posted && isOwner) {
        // An owner can correct what was sold: the old books entry is reversed and a corrected one posted (never edited in place).
        if (form.reason.trim().length < 3) { setError("Say why you are correcting this sale. It is kept in the audit trail."); return; }
        const correction = { items: payload.items.map((line) => ({ product_id: line.product_id, variant_id: line.variant_id, product_name: line.product_name, sku: line.sku, variant_attributes: line.variant_attributes, unit_price: line.unit_price, quantity: line.quantity, discount: line.discount })), discount: payload.discount, customer_id: payload.customer_id, notes: payload.notes, reason: form.reason.trim() };
        correctOrder.mutate({ id: editing.id, data: correction }, {
          onError,
          onSuccess: () => { if (dateChanged) updateOrder.mutate({ id: editing.id, data: dateField }, { onSuccess, onError }); else onSuccess(); },
        });
        return;
      }
      updateOrder.mutate({
        id: editing.id,
        data: posted
          ? { notes: payload.notes, ...dateField }
          : { customer_id: payload.customer_id, status: payload.status, discount: payload.discount, tax: payload.tax, notes: payload.notes, ...dateField },
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
      <div className="flex items-center justify-between pesaa-responsive-toolbar">
        <div>
          <h1 className="pesaa-page-title text-foreground">Sales History</h1>
          <p className="text-sm text-muted mt-0.5">{total} total sale{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton build={async () => {
            const sales = await fetchEvery((p, s) => salesApi.listOrders(p, s, statusFilter === "All" ? undefined : statusFilter, debouncedSearch || undefined, paymentStatusFilter === "All" ? undefined : paymentStatusFilter, range), 500);
            // One row per item, the same layout the Import template uses, so the file can be imported back.
            const rows = sales.flatMap((o) => (o.items.length ? o.items : [null]).map((i) => [o.order_number, o.customer?.name ?? "", o.ordered_at ?? "", o.status, o.payment_method ?? "", o.notes ?? "", i?.sku ?? "", i?.quantity ?? "", i?.unit_price ?? ""]));
            return { filename: "sales", headers: ORDER_CSV_HEADERS, rows };
          }} />
          <Button variant="secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import</Button>
          <Link href="/pos"><Button color={SAL}><Plus size={15} /> New Sale</Button></Link>
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
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate" title={statsLoading ? undefined : String(s.value)}>{statsLoading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div role="tablist" aria-label="Sale status" className="no-scrollbar flex overflow-x-auto border-b border-border px-2">
          {["All", "Completed", "Pending", "Awaiting Approval", "Cancelled", ...(isOwner ? ["Archived"] : [])].map((s) => (
            <button key={s} role="tab" aria-selected={statusFilter === s} onClick={() => onStatusFilterChange(s)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] sm:px-3.5 font-semibold focus-visible:outline-2 focus-visible:outline-accent ${statusFilter === s ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>{s}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-9" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search reference or customer" aria-label="Search sales" />
          </div>
          <PeriodFilter value={period} onChange={onPeriodChange} label="Sale date" className="min-w-0 flex-1 sm:flex-none" />
          <Select aria-label="Payment status" value={paymentStatusFilter} onChange={(e) => onPaymentStatusFilterChange(e.target.value)} className="min-w-0 flex-1 sm:w-auto sm:flex-none">
            <option value="All">All payments</option>
            <option value="Paid">Paid</option>
            <option value="PartiallyPaid">Partially paid</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Overdue">Overdue</option>
          </Select>
          {filtersActive && <button type="button" onClick={clearFilters} className="ml-auto text-[13px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">Clear filters</button>}
        </div>
        {(period.key !== "all" || filtersActive) && (
          <p role="status" className="border-b border-border bg-surface/50 px-4 py-2 text-[12px] text-muted">
            Showing <strong className="text-foreground">{total}</strong> sale{total === 1 ? "" : "s"}{period.key !== "all" && <> from <strong className="text-foreground">{periodLabel(period)}</strong></>}. The totals above follow the same dates.
          </p>
        )}

        {bulk.count > 0 && (
          <div className="p-4 border-b border-border">
            {isOwner && <BulkActionBar count={bulk.count} label="sale" onDelete={confirmBulkArchive} onClear={bulk.clear} deleting={bulkDeleting} kind={showArchived ? "restore" : "archive"} />}
          </div>
        )}

        {loading ? (
          <TableState loading />
        ) : (
          <TableScroll className="hidden md:block"><table className={`w-full min-w-[64rem] transition-opacity ${ordersQ.isFetching ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-4 w-10">
                  <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={orders.length === 0} />
                </th>
                <th className="p-4 font-semibold whitespace-nowrap">Sale Reference</th>
                <th className="p-4 font-semibold min-w-36">Customer</th>
                <th className="p-4 font-semibold">Items</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right whitespace-nowrap">VAT</th>
                <th className="p-4 font-semibold text-right">Total</th>
                <th className="p-4 font-semibold text-right">Balance</th>
                <th className="p-4 font-semibold whitespace-nowrap">Due Date</th>
                <th className="p-4 font-semibold">Payment</th>
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
                    <td className="p-4 text-sm font-mono font-bold whitespace-nowrap" style={{ color: SAL }}>{o.order_number}</td>
                    <td className="p-4 text-sm font-medium text-foreground min-w-36">{o.customer?.name ?? <span className="italic text-muted">Walk-in</span>}</td>
                    <td className="p-4 text-sm text-muted whitespace-nowrap">{o.items.length} item{o.items.length !== 1 ? "s" : ""}</td>
                    <td className="p-4 text-sm text-muted whitespace-nowrap">{fmtDateTime(o.ordered_at)}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[o.status] ?? "bg-slate-100 text-slate-600"}`}>
                        <Icon size={11} /> {o.status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm tabular-nums whitespace-nowrap" style={{ color: "#6366f1" }}>{fmt(o.tax)}</td>
                    <td className="p-4 text-right text-sm font-bold text-foreground tabular-nums whitespace-nowrap">{fmt(o.total)}</td>
                    <td className="p-4 text-right text-sm tabular-nums whitespace-nowrap">
                      {o.status === "Completed" ? (
                        <span className={o.outstanding_balance > 0 ? "font-semibold text-amber-600" : "text-muted"}>{fmt(o.outstanding_balance)}</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="p-4 text-sm whitespace-nowrap">
                      {o.due_date && o.outstanding_balance > 0 ? (
                        <span className={o.is_overdue ? "font-semibold text-red-600" : "text-muted"}>{new Date(o.due_date).toLocaleDateString()}</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="p-4">
                      {o.status === "Completed" && <PaymentStatusBadge paymentStatus={o.payment_status} isOverdue={o.is_overdue} />}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewingId(o.id)} aria-label="View sale" title="View" className="w-7 h-7 rounded-md flex items-center justify-center bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors"><Eye size={13} /></button>
                        {o.status === "Awaiting Approval" && canApproveCredit && (
                          <>
                            <button onClick={() => decideCredit(o, "approve")} disabled={decideBusy} aria-label="Approve credit sale" title="Approve credit" className="h-7 px-2 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50">Approve</button>
                            <button onClick={() => decideCredit(o, "reject")} disabled={decideBusy} aria-label="Reject credit sale" title="Reject credit" className="h-7 px-2 rounded-md text-[11px] font-semibold bg-red-500/10 text-red-600 hover:bg-red-500/20 disabled:opacity-50">Reject</button>
                          </>
                        )}
                        <button onClick={() => openEdit(o)} aria-label="Edit sale" title="Edit" className="w-7 h-7 rounded-md flex items-center justify-center bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors"><Edit2 size={13} /></button>
                        {isOwner && <button onClick={() => (showArchived ? restoreOrder.mutate(o.id) : confirm({ title: "Archive this sale?", message: `${o.order_number} leaves Sales History but stays in the books and reports. You can restore it from the Archived tab.`, confirmLabel: "Archive", onConfirm: () => archiveOrder.mutate({ id: o.id, reason: "Archived from Sales History" }) }))} aria-label={showArchived ? "Restore sale" : "Archive sale"} title={showArchived ? "Restore" : "Archive"} className="w-7 h-7 rounded-md flex items-center justify-center bg-surface text-muted hover:text-accent hover:bg-accent/10 transition-colors">{showArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></TableScroll>
        )}
        {!loading && orders.length > 0 && <div className="space-y-3 p-3 md:hidden" aria-label="Sale cards"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} />Select this page</label>{orders.map((o) => <article key={o.id} className="min-w-0 rounded-xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-all text-sm font-semibold">{o.order_number}</h2><p className="text-sm text-muted">{o.customer?.name || "Walk-in"}</p><p className="text-xs text-muted">{o.status} · {o.items.length} items</p></div><label className="flex h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" aria-label={`Select ${o.order_number}`} checked={bulk.selected.has(o.id)} onChange={() => bulk.toggle(o.id)} /></label></div><dl className="my-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted">Total</dt><dd className="font-semibold">{fmt(o.total)}</dd></div><div><dt className="text-xs text-muted">Outstanding</dt><dd>{fmt(o.outstanding_balance)}</dd></div></dl><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setViewingId(o.id)}>View sale</Button><Button variant="outline" onClick={() => openEdit(o)}>Edit</Button>{isOwner && <Button variant="outline" onClick={() => (showArchived ? restoreOrder.mutate(o.id) : archiveOrder.mutate({ id: o.id, reason: "Archived from Sales History" }))}>{showArchived ? "Restore" : "Archive"}</Button>}{o.status === "Awaiting Approval" && canApproveCredit && <><Button disabled={decideBusy} onClick={() => decideCredit(o, "approve")}>Approve</Button><Button variant="destructive" disabled={decideBusy} onClick={() => decideCredit(o, "reject")}>Reject</Button></>}</div></article>)}</div>}
        {!loading && orders.length === 0 && <div className="p-3"><TableState error={ordersQ.error} onRetry={() => void ordersQ.refetch()} empty={!ordersQ.error} filtered={filtersActive} onClearFilters={clearFilters} title="No sales yet" hint="Completed sales appear here." /></div>}
        {!loading && orders.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="sales" color={SAL} />
        )}
        {!statsLoading && revenueOrders.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-surface/50 flex flex-wrap items-center gap-6">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Tax Summary (completed sales)</span>
            <span className="text-[12px] font-bold" style={{ color: "#6366f1" }}>VAT Collected: {fmt(totalVAT)}</span>
            <span className="text-[12px] font-bold text-foreground">Net (excl. VAT): {fmt(revenue - totalVAT)}</span>
            <span className="text-[12px] font-bold text-foreground">Gross Revenue: {fmt(revenue)}</span>
          </div>
        )}
      </div>

      {/* ── Add / Edit Drawer ── */}
      <Drawer open={showAdd || !!editing} onClose={closeDrawer} title={editing ? "Edit Sale" : "New Sale"} description={editing ? editing.order_number : "Record a new sale"} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-5">
          {editing?.status === "Completed" && (isOwner
            ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">You are correcting a posted sale. The old entry in the books is reversed and a corrected one is posted, stock is adjusted, and your reason is kept in the audit trail. The new total cannot be less than what is already paid.</p>
            : <p className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs text-muted">This sale is posted to the books, so its items, prices and customer are locked. You can edit the notes. To change what was sold, ask the owner, or record a return or a new sale.</p>)}
          {editing && isOwner && <Field label="Sale date" hint="Moves the sale and its sale entry to this day. Closed accounting periods can't be changed."><Input type="datetime-local" max={toLocalInput(new Date().toISOString())} value={form.sale_at} onChange={(e) => setForm({ ...form, sale_at: e.target.value })} /></Field>}
          <fieldset disabled={editing?.status === "Completed" && !isOwner} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-70">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {/* The drawer is a fixed 480px column, so every line is a compact card at any screen size: product on top, then its numbers. */}
            <div className="space-y-2">
              {items.map((it, idx) => {
                const lineTotal = (Number(it.unit_price) || 0) * (Number(it.quantity) || 0) - (Number(it.discount) || 0);
                return (
                  <div key={it.rowId} className="space-y-2 rounded-xl border border-border p-3">
                    <div>
                      <ProductPicker item={it} products={products} onChange={(patch) => updateItem(idx, patch)} />
                      {it.sku && <p className="mt-1 truncate px-1 text-[11px] text-muted">SKU {it.sku}</p>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block text-[11px] font-medium text-muted">Price
                        <Input type="number" min="0" inputMode="decimal" className="mt-1 text-right tabular-nums" aria-label={`Line ${idx + 1} unit price`} value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} placeholder="Price" />
                      </label>
                      <label className="block text-[11px] font-medium text-muted">Qty
                        <Input type="number" min="1" inputMode="decimal" className="mt-1 text-right tabular-nums" aria-label={`Line ${idx + 1} quantity`} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} />
                      </label>
                      <label className="block text-[11px] font-medium text-muted">Discount
                        <Input type="number" min="0" inputMode="decimal" className="mt-1 text-right tabular-nums" aria-label={`Line ${idx + 1} discount`} value={it.discount} onChange={(e) => updateItem(idx, { discount: e.target.value })} />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                      <p className="text-sm tabular-nums text-foreground"><span className="mr-2 text-[11px] text-muted">Line total</span><span className="font-semibold">{it.unit_price ? fmt(lineTotal) : "—"}</span></p>
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} aria-label={`Remove line ${idx + 1}`} title="Remove line"
                          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-accent">
                          <XCircle size={15} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Sale Discount">
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

          </fieldset>
          {editing?.status === "Completed" && isOwner && <Field label="Reason for the correction" required><Input value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Customer took 8 units, not 10" /></Field>}
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
          </Field>
          <FormFooter
            submitLabel={saving ? "Saving..." : editing ? "Save Changes" : "Record Sale"}
            onCancel={closeDrawer}
            disabled={saving || (!editing && items.every((i) => !i.product_name))}
            color={SAL}
          />
        </form>
      </Drawer>

      {viewing && <SaleDocumentDrawer order={viewing} onClose={() => setViewingId(null)}
        onReversePayment={(id) => setReversingPayment(viewing.payments.find((p) => p.id === id) ?? null)}
        extraActions={viewing.status === "Completed" && viewing.outstanding_balance > 0 ? <Button onClick={() => setRecordingPaymentFor(viewing)} color={SAL} className="rounded-lg">Record Payment</Button> : undefined} />}

      <RecordPaymentDrawer order={recordingPaymentFor} onClose={() => setRecordingPaymentFor(null)} color={SAL} fmt={fmt} />
      <ReversePaymentDrawer payment={reversingPayment} onClose={() => setReversingPayment(null)} fmt={fmt} />

      <CsvImportDrawer<OrderImportRow>
        open={showImport}
        onClose={() => setShowImport(false)}
        onSubmit={async (items) => { await bulkCreateOrders.mutateAsync(items); }}
        title="Import Sales"
        itemNoun="sale"
        templateFilename="sales_template.xlsx"
        templateHeaders={ORDER_CSV_HEADERS}
        templateSampleRows={[
          ["INV-1001", "Jean Pierre", "2025-01-05", "Completed", "Cash", "", "PC-001", "2", "5000"],
          ["INV-1001", "Jean Pierre", "2025-01-05", "Completed", "Cash", "", "UC-002", "1", "3000"],
        ]}
        previewColumns={[
          { key: "orderreference", label: "Sale Ref", required: true },
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
