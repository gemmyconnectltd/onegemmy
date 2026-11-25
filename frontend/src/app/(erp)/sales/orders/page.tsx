"use client";
import { ExportButton } from "@/components/ui/ExportButton";
import { fetchEvery } from "@/lib/exportTable";
import { salesApi } from "@/lib/api/sales";
import Link from "next/link";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
import { ALL_TIME, periodFromQuery, periodLabel, periodRange, type PeriodValue } from "@/lib/period";
import { TableScroll } from "@/components/ui/TableScroll";

import { fmtMoney } from "@/lib/config";
import { fmtDateTime } from "@/lib/date";
import { Plus, Search, AlertCircle, ChevronDown, Upload, XCircle, ShoppingCart, Wallet, Clock, TrendingUp, SlidersHorizontal, X } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { TableState } from "@/components/ui/TableState";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { ChangeSalespersonDialog } from "@/components/sales/ChangeSalespersonDialog";
import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, FormFooter, Textarea } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { useMyBranches, useOrdersSummary, useOrders, useSalesTeam, useCustomers, useProducts, useCreateOrder, useUpdateOrder, useApproveOrder, useRejectOrder, useCorrectOrder, useVoidOrder, useRequestVoid, useArchiveOrder, useRestoreOrder, useBulkCreateOrders } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import type { ApiOrder, ApiOrderPayment, ApiProduct, ApiSalesSummary, ApiVariant } from "@/lib/api";
import { SaleDetailPanel, SaleStateBadge, paidWith } from "@/components/sales/SaleDetailPanel";
import { BranchFilter } from "@/components/accounting/FinancialShared";
import { SaleDocumentDrawer } from "@/components/sales/SaleDocumentDrawer";
import { RecordPaymentDrawer } from "@/components/accounting/RecordPaymentDrawer";
import { ReversePaymentDrawer } from "@/components/accounting/ReversePaymentDrawer";
import { accountingApi } from "@/lib/api/accounting";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CsvImportDrawer, bulkOutcome } from "@/components/ui/CsvImportDrawer";
import { checkAmount, isIsoDate, type ImportIssue } from "@/lib/importValues";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { apiErrorMessage } from "@/lib/api/errors";
import { isPendingFor } from "@/lib/loadState";
import { Refreshing } from "@/components/ui/LoadState";
import { isRefreshing } from "@/lib/loadState";

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
const EMPTY_FORM = { salesperson_id: "", customer_id: "", status: "Pending", discount: "0", tax: "0", notes: "", sale_at: "", reason: "" };
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

function parseOrderRow(raw: Record<string, string>): { data: OrderImportRow; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  if (!raw.orderreference?.trim()) errors.push({ column: "orderreference", message: "Sale reference is required", summary: "missing Sale Ref" });
  if (!raw.sku?.trim()) errors.push({ column: "sku", message: "SKU is required", summary: "missing SKU" });
  const price = checkAmount(raw.unitprice, "unitprice", "Unit Price");
  if ("issue" in price) errors.push(price.issue);
  const qtyText = raw.quantity?.trim() ?? "";
  const qty = qtyText ? checkAmount(qtyText, "quantity", "Qty") : { value: 1 };
  if ("issue" in qty) errors.push(qty.issue);
  else if (qty.value <= 0) errors.push({ column: "quantity", message: `Qty must be more than 0 (got '${qtyText}')`, summary: "invalid Qty" });
  const date = raw.orderedat?.trim() ?? "";
  if (date && !isIsoDate(date.slice(0, 10))) errors.push({ column: "orderedat", message: `Date must be YYYY-MM-DD (got '${date}')`, summary: "invalid Date" });
  const status = (raw.status || "Completed").trim();
  const knownStatus = ["Completed", "Pending"].find((s) => s.toLowerCase() === status.toLowerCase());
  if (!knownStatus) errors.push({ column: "status", message: `Status must be Completed or Pending (got '${status}')`, summary: "invalid Status" });
  return {
    data: {
      order_reference: raw.orderreference?.trim() ?? "",
      customer: raw.customer?.trim() || null,
      ordered_at: date || null,
      status: knownStatus ?? "Completed",
      payment_method: raw.paymentmethod?.trim() || null,
      notes: raw.notes?.trim() || null,
      sku: raw.sku?.trim() ?? "",
      quantity: "value" in qty ? qty.value : 1,
      unit_price: "value" in price ? price.value : 0,
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

// Status tabs: what each one asks the server for. Counts come from the summary.
type TabKey = "All" | "Unpaid" | "PartlyPaid" | "Overdue" | "Awaiting Approval" | "Pending" | "Cancelled" | "Archived";
const TABS: { key: TabKey; label: string; status?: string; payment?: string; count: keyof ApiSalesSummary["counts"] }[] = [
  { key: "All", label: "All", count: "all" },
  { key: "Unpaid", label: "Unpaid", status: "Completed", payment: "Unpaid", count: "unpaid" },
  { key: "PartlyPaid", label: "Partly paid", status: "Completed", payment: "PartiallyPaid", count: "partly_paid" },
  { key: "Overdue", label: "Overdue", status: "Completed", payment: "Overdue", count: "overdue" },
  { key: "Awaiting Approval", label: "Pending approval", status: "Awaiting Approval", count: "awaiting_approval" },
  { key: "Pending", label: "Pending", status: "Pending", count: "pending" },
  { key: "Cancelled", label: "Voided", status: "Cancelled", count: "cancelled" },
  { key: "Archived", label: "Archived", count: "archived" },
];
const CARD_PLACEHOLDERS = [["Sales", ShoppingCart], ["Collected", Wallet], ["Outstanding", Clock], ["Average sale", TrendingUp]].map(([label, icon]) => ({ label: label as string, value: "", sub: undefined as string | undefined, icon: icon as typeof ShoppingCart, warn: false }));
const METHODS = [["", "Payment method: All"], ["cash", "Cash"], ["mobile", "Mobile money"], ["card", "Card"], ["bank", "Bank transfer"], ["credit", "On credit"]] as const;

/** "More filters": the less-used filters in a small panel, with how many are active on the button. Closes on outside click / Escape. */
function MoreFilters({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <Button variant="outline" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <SlidersHorizontal size={14} /> More filters{active > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{active}</span>}
      </Button>
      {open && (
        <div role="dialog" aria-label="More filters" className="absolute right-0 top-full z-30 mt-1 w-72 space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

/** Desktop (≥1280px): the selected sale sits beside the list; smaller screens open it in a drawer. */
const WIDE = "(min-width: 1280px)";
function useWideScreen() {
  return useSyncExternalStore(
    (change) => { const m = window.matchMedia(WIDE); m.addEventListener("change", change); return () => m.removeEventListener("change", change); },
    () => window.matchMedia(WIDE).matches,
    () => false,
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
  const [statusFilter, setStatusFilter] = useState<TabKey>("All");
  const [sellerFilter, setSellerFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const onStatusFilterChange = (s: TabKey) => { setStatusFilter(s); setPage(1); };
  const [period, setPeriod] = useState<PeriodValue>(ALL_TIME);
  const range = useMemo(() => periodRange(period), [period]);
  // Opened from a report number: show the sales behind it for the same dates.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const linked = periodFromQuery(window.location.search);
    queueMicrotask(() => {
      if (linked) setPeriod(linked);
      const status = q.get("status");
      if (status && TABS.some((t) => t.key === status)) setStatusFilter(status as TabKey);
      if (q.get("seller")) setSellerFilter(q.get("seller")!);
      if (q.get("method")) setMethodFilter(q.get("method")!);
      if (q.get("q")) setSearch(q.get("q")!);
    });
  }, []);
  // Keep the chosen filters in the address so a refresh or a shared link opens the same view.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const set = (k: string, v: string) => { if (v) q.set(k, v); else q.delete(k); };
    set("status", statusFilter === "All" ? "" : statusFilter); set("seller", sellerFilter); set("method", methodFilter); set("q", debouncedSearch.trim());
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [statusFilter, sellerFilter, methodFilter, debouncedSearch]);
  const onPeriodChange = (v: PeriodValue) => { setPeriod(v); setPage(1); };
  const filtersActive = statusFilter !== "All" || sellerFilter !== "" || methodFilter !== "" || period.key !== "all" || search.trim() !== "";
  const clearFilters = () => { setStatusFilter("All"); setSellerFilter(""); setMethodFilter(""); setPeriod(ALL_TIME); setSearch(""); setPage(1); };

  const showArchived = statusFilter === "Archived";
  const tab = TABS.find((t) => t.key === statusFilter) ?? TABS[0];
  const ordersQ = useOrders(page, pageSize, tab.status, debouncedSearch || undefined, tab.payment, undefined, range, showArchived, sellerFilter || undefined, methodFilter || undefined);
  // Customer/product pickers for the create/edit form need the full lists, not
  // the current table page — kept as their own, separately-paginated fetches.
  const customersQ = useCustomers(1, 200);
  const productsQ = useProducts(1, 500);
  const loading = ordersQ.isLoading || customersQ.isLoading || productsQ.isLoading;
  const listFailed = ordersQ.isError && !ordersQ.data;  // shown in place of the list, with a retry — never as "no records"
  const orders = ordersQ.data?.items ?? [];
  // Derived from the live list (not a captured snapshot) so the drawer
  // reflects a payment recorded/reversed while it's open.
  const viewing = orders.find((o) => o.id === viewingId) ?? null;
  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const branchesQ = useMyBranches();
  const branchName = (id: string | null) => branchesQ.data?.items.find((b) => b.id === id)?.name ?? null;
  const total = ordersQ.data?.total ?? 0;
  const customers = customersQ.data?.items ?? [];
  const products = productsQ.data?.items ?? [];

  // Cards and tab counts cover the whole filter (every page), computed by the server in the base currency.
  const summaryQ = useOrdersSummary({ search: debouncedSearch || undefined, period: range, salespersonId: sellerFilter || undefined, paymentMethod: methodFilter || undefined });
  const summary = summaryQ.data;
  const statsLoading = summaryQ.isLoading;

  const loadError = ordersQ.error ?? customersQ.error ?? productsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load sales" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const correctOrder = useCorrectOrder();
  const voidOrder = useVoidOrder();
  const requestVoid = useRequestVoid();
  const [voiding, setVoiding] = useState<ApiOrder | null>(null);
  const [voidNotice, setVoidNotice] = useState("");
  const archiveOrder = useArchiveOrder();
  const restoreOrder = useRestoreOrder();
  const bulkCreateOrders = useBulkCreateOrders();
  const saving = createOrder.isPending || updateOrder.isPending || correctOrder.isPending;

  const periodName = period.key === "all" ? "All time" : periodLabel(period);
  const averageChange = summary?.previous_average ? Math.round(((summary.average - summary.previous_average) / summary.previous_average) * 100) : null;
  const cards = summary ? [
    { label: `Sales · ${periodName}`, value: fmt(summary.sales), sub: `${summary.count} sale${summary.count === 1 ? "" : "s"}`, icon: ShoppingCart },
    { label: "Collected", value: fmt(summary.collected), sub: summary.collected_share == null ? "No sales yet" : `${summary.collected_share}% of sales`, icon: Wallet },
    { label: "Outstanding", value: fmt(summary.outstanding), sub: `${summary.outstanding_count} sale${summary.outstanding_count === 1 ? "" : "s"} · ${summary.overdue_count} overdue`, warn: summary.outstanding > 0, icon: Clock },
    { label: "Average sale", value: fmt(summary.average), sub: averageChange == null ? "Per completed sale" : `${averageChange >= 0 ? "↑" : "↓"} ${Math.abs(averageChange)}% vs previous period`, icon: TrendingUp },
  ] : [];

  const bulk = useBulkSelection(orders.map((o) => o.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  // Credit sales held over the daily limit wait here for someone with credit:approve (GM/CEO).
  const { hasPermission } = useAuth();
  const canApproveCredit = hasPermission("credit:approve");
  const canApproveSale = hasPermission("orders:approve");
  // Taking a payment against a sale is an accounts-receivable action; only offer it to people who may do it (the server checks too).
  const canRecordPayment = hasPermission("accounts_receivable:create");
  // A sale held by the business's approve-every-sale rule needs sale approval; one held for credit needs credit approval.
  const canDecide = (o: ApiOrder) => (o.held_reason === "policy" ? canApproveSale : canApproveCredit);
  const team = useSalesTeam();
  const sellers = (team.data ?? []).filter((m) => (m.sales ?? 0) > 0);  // the filter offers only people who have sold
  const activeTeam = (team.data ?? []).filter((m) => m.active !== false);  // who can be credited with a new sale
  const [rejectingSale, setRejectingSale] = useState<ApiOrder | null>(null);
  const [reassigning, setReassigning] = useState<ApiOrder | null>(null);
  const approveOrder = useApproveOrder();
  const rejectOrder = useRejectOrder();
  const decideBusy = approveOrder.isPending || rejectOrder.isPending;
  const decideCredit = (o: ApiOrder, action: "approve" | "reject") => {
    if (action === "reject") { setRejectingSale(o); return; }
    confirm({
      title: o.held_reason === "policy" ? "Approve this sale?" : "Approve this credit sale?",
      message: `${o.order_number} for ${o.customer?.name ?? "this customer"} will be completed: stock goes out and ${fmt(o.total)} is booked${o.held_reason === "policy" ? "." : ", with the unpaid balance as customer debt."}`,
      confirmLabel: "Approve",
      onConfirm: () => approveOrder.mutateAsync({ id: o.id }),
    });
  };
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
    setForm({ salesperson_id: o.salesperson_id ?? "", customer_id: o.customer_id ?? "", status: o.status, discount: String(o.discount), tax: String(o.tax), notes: o.notes ?? "", sale_at: toLocalInput(o.ordered_at), reason: "" });
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
      ...(!editing && form.salesperson_id ? { salesperson_id: form.salesperson_id } : {}),
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

  // What the selected sale's panel can do: the same actions the table row used to offer.
  const actionsFor = (o: ApiOrder) => [
    ...(o.status === "Awaiting Approval" && canDecide(o) ? [{ label: "Approve sale", onSelect: () => decideCredit(o, "approve"), disabled: decideBusy }, { label: "Reject sale", onSelect: () => decideCredit(o, "reject"), danger: true, disabled: decideBusy }] : []),
    { label: o.status === "Completed" && isOwner ? "Correct sale" : "Edit sale", onSelect: () => openEdit(o) },
    ...(canApproveSale && !showArchived ? [{ label: "Change salesperson", onSelect: () => setReassigning(o) }] : []),
    ...(o.status === "Completed" && !showArchived ? [{ label: isOwner ? "Void sale" : "Request void", onSelect: () => setVoiding(o), danger: true }] : []),
    ...(isOwner ? [{ label: showArchived ? "Restore sale" : "Archive sale", disabled: isPendingFor(restoreOrder, o.id) || isPendingFor(archiveOrder, o.id),
      onSelect: () => (showArchived ? restoreOrder.mutate(o.id, { onError: (e) => setError(apiErrorMessage(e, "The sale could not be restored.")) }) : confirm({ title: "Archive this sale?", message: `${o.order_number} leaves Sales History but stays in the books and reports. You can restore it from the Archived tab.`, confirmLabel: "Archive", onConfirm: () => archiveOrder.mutateAsync({ id: o.id, reason: "Archived from Sales History" }) })) }] : []),
  ];
  const panel = selected && (
    <SaleDetailPanel order={selected} branchName={branchName(selected.branch_id)} fmt={fmt} onClose={() => setSelectedId(null)}
      onRecordPayment={canRecordPayment && selected.status === "Completed" && selected.outstanding_balance > 0 ? () => setRecordingPaymentFor(selected) : undefined}
      onOpenInvoice={() => setViewingId(selected.id)} onSend={() => setViewingId(selected.id)} more={actionsFor(selected)} />
  );
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const chips = [
    ...(search.trim() ? [{ key: "q", label: "Search", value: `"${search.trim()}"`, clear: () => onSearchChange("") }] : []),
    ...(period.key !== "all" ? [{ key: "period", label: "Period", value: periodLabel(period), clear: () => onPeriodChange(ALL_TIME) }] : []),
    ...(statusFilter !== "All" ? [{ key: "status", label: "Status", value: tab.label, clear: () => onStatusFilterChange("All") }] : []),
    ...(sellerFilter ? [{ key: "seller", label: "Salesperson", value: sellers.find((m) => m.id === sellerFilter)?.name ?? "Selected", clear: () => { setSellerFilter(""); setPage(1); } }] : []),
    ...(methodFilter ? [{ key: "method", label: "Paid with", value: METHODS.find(([v]) => v === methodFilter)?.[1] ?? methodFilter, clear: () => { setMethodFilter(""); setPage(1); } }] : []),
  ];
  const wide = useWideScreen();

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="flex items-start justify-between gap-3 pesaa-responsive-toolbar">
        <div>
          <h1 className="pesaa-page-title text-foreground">Sales History</h1>
          <p className="text-sm text-muted mt-0.5">Every sale is also its invoice. Record payments, print receipts and follow up on balances.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton build={async () => {
            const sales = await fetchEvery((p, s) => salesApi.listOrders(p, s, tab.status, debouncedSearch || undefined, tab.payment, range, showArchived, sellerFilter || undefined, methodFilter || undefined), 500);
            // One row per item, the same layout the Import template uses, so the file can be imported back.
            const rows = sales.flatMap((o) => (o.items.length ? o.items : [null]).map((i) => [o.order_number, o.customer?.name ?? "", o.ordered_at ?? "", o.status, o.payment_method ?? "", o.notes ?? "", i?.sku ?? "", i?.quantity ?? "", i?.unit_price ?? ""]));
            return { filename: "sales", headers: ORDER_CSV_HEADERS, rows };
          }} />
          <Button variant="secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import</Button>
          <Link href="/pos"><Button><Plus size={15} /> New sale</Button></Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(cards.length ? cards : CARD_PLACEHOLDERS).map((c) => <StatCard key={c.label} label={c.label} value={c.value} hint={c.sub} icon={c.icon} tone={c.warn ? "warning" : "default"} loading={statsLoading} />)}
      </div>

      <div className={`grid items-start gap-4 ${selected && wide ? "grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* One line, broadest first: find a sale, then when, where and what state. Who sold it and how it was paid are one click away. */}
        <div className={`flex flex-wrap items-center gap-2 border-b border-border p-3 ${selected && wide ? "" : "lg:flex-nowrap"}`}>
          <div className="relative w-full lg:w-auto lg:min-w-[12rem] lg:flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-9" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Order #, customer or phone" aria-label="Search sales" />
          </div>
          <PeriodFilter value={period} onChange={onPeriodChange} label="Period" className="min-w-0 flex-1 sm:flex-none lg:shrink-0" />
          {!authUser?.branchId && <div className="min-w-0 flex-1 sm:w-44 sm:flex-none lg:w-40 lg:shrink-0"><BranchFilter /></div>}
          <Select aria-label="Status" value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value as TabKey)} className="min-w-0 flex-1 sm:w-auto sm:flex-none lg:max-w-[13rem] lg:shrink-0">
            {TABS.filter((t) => t.key !== "Archived" || isOwner).map((t) => {
              const n = summary?.counts[t.count];
              return <option key={t.key} value={t.key}>{t.key === "All" ? "Status: All" : t.label}{n != null ? ` (${n})` : ""}</option>;
            })}
          </Select>
          <MoreFilters active={(sellerFilter ? 1 : 0) + (methodFilter ? 1 : 0)}>
            {sellers.length > 0 && <Field label="Salesperson">
              <Select aria-label="Salesperson" value={sellerFilter} onChange={(e) => { setSellerFilter(e.target.value); setPage(1); }}>
                <option value="">Everyone</option>{sellers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.sales})</option>)}
              </Select>
            </Field>}
            <Field label="Paid with">
              <Select aria-label="Payment method" value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{v ? l : "Any method"}</option>)}
              </Select>
            </Field>
          </MoreFilters>
        </div>
        {/* What is applied, each removable on its own; "Clear all" resets everything. */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            {chips.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-0.5 pl-2.5 pr-1 text-xs">
                <span className="text-muted">{c.label}:</span><span className="font-semibold text-foreground">{c.value}</span>
                <button type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`} className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><X size={12} /></button>
              </span>
            ))}
            <button type="button" onClick={clearFilters} className="ml-1 text-xs font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">Clear all</button>
            <span className="ml-auto text-xs text-muted">{total} sale{total === 1 ? "" : "s"} match</span>
          </div>
        )}

        {bulk.count > 0 && isOwner && (
          <div className="border-b border-border p-3">
            <BulkActionBar count={bulk.count} label="sale" onDelete={confirmBulkArchive} onClear={bulk.clear} deleting={bulkDeleting} kind={showArchived ? "restore" : "archive"} />
          </div>
        )}

        {loading || listFailed ? (
          <TableState loading={loading} error={listFailed ? ordersQ.error : undefined} onRetry={() => void ordersQ.refetch()} />
        ) : (
          <TableScroll className="hidden md:block"><Refreshing busy={isRefreshing(ordersQ)}><table className="w-full min-w-[48rem]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-10 p-4">
                  <input type="checkbox" aria-label="Select all sales on this page" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="h-4 w-4 rounded" disabled={orders.length === 0} />
                </th>
                <th className="p-4 font-semibold whitespace-nowrap">Order</th>
                <th className="p-4 font-semibold whitespace-nowrap">Date</th>
                <th className="p-4 font-semibold whitespace-nowrap">Customer</th>
                <th className="p-4 font-semibold whitespace-nowrap">Salesperson</th>
                <th className="p-4 font-semibold whitespace-nowrap">Paid with</th>
                <th className="p-4 text-right font-semibold">Total</th>
                <th className="p-4 font-semibold whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => {
                const on = o.id === selectedId;
                return (
                  <tr key={o.id} onClick={() => setSelectedId(on ? null : o.id)} aria-selected={on}
                    className={`cursor-pointer transition-colors ${on ? "bg-accent/5" : "hover:bg-surface/60"}`}>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${o.order_number}`} checked={bulk.selected.has(o.id)} onChange={() => bulk.toggle(o.id)} className="h-4 w-4 rounded" />
                    </td>
                    <td className="whitespace-nowrap p-4"><button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(o.id); }} className="font-mono text-sm font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">{o.order_number}</button></td>
                    <td className="whitespace-nowrap p-4 text-sm text-muted">{fmtDateTime(o.ordered_at)}</td>
                    <td className="max-w-[14rem] truncate p-4 text-sm font-medium text-foreground">{o.customer?.name ?? <span className="font-normal text-muted">Walk-in customer</span>}</td>
                    <td className="whitespace-nowrap p-4 text-sm">{o.salesperson_name ?? <span className="text-muted">—</span>}</td>
                    <td className="whitespace-nowrap p-4 text-sm text-muted">{paidWith(o)}</td>
                    <td className="whitespace-nowrap p-4 text-right text-sm font-bold tabular-nums text-foreground">{fmt(o.total)}</td>
                    <td className="whitespace-nowrap p-4"><SaleStateBadge order={o} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table></Refreshing></TableScroll>
        )}
        {!loading && orders.length > 0 && <div className="space-y-3 p-3 md:hidden" aria-label="Sale cards"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} />Select this page</label>{orders.map((o) => <article key={o.id} className="min-w-0 rounded-xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><button type="button" className="min-w-0 text-left" onClick={() => setSelectedId(o.id)}><h2 className="break-all font-mono text-sm font-semibold text-accent">{o.order_number}</h2><p className="text-sm">{o.customer?.name || "Walk-in customer"}</p><p className="text-xs text-muted">{fmtDateTime(o.ordered_at)}{o.salesperson_name ? ` · ${o.salesperson_name}` : ""} · {paidWith(o)}</p></button><label className="flex h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" aria-label={`Select ${o.order_number}`} checked={bulk.selected.has(o.id)} onChange={() => bulk.toggle(o.id)} /></label></div><div className="mt-3 flex items-center justify-between gap-3"><span className="font-semibold tabular-nums">{fmt(o.total)}</span><SaleStateBadge order={o} /></div></article>)}</div>}
        {!loading && orders.length === 0 && <div className="p-3"><TableState error={ordersQ.error} onRetry={() => void ordersQ.refetch()} empty={!ordersQ.error} filtered={filtersActive} onClearFilters={clearFilters} title="No sales yet" hint="Completed sales appear here." /></div>}
        {!loading && orders.length > 0 && (
          <div className="border-t border-border">
            <p className="px-4 pt-3 text-xs text-muted">{first}–{first + orders.length - 1} of {total} · the cards above cover the whole filter, not just this page</p>
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="sales" />
          </div>
        )}
        {summary && summary.count > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border bg-surface/50 px-4 py-3 text-xs">
            <span className="font-semibold uppercase tracking-wider text-muted">Tax summary (completed sales)</span>
            <span>VAT collected: <strong className="tabular-nums">{fmt(summary.tax)}</strong></span>
            <span>Net (excl. VAT): <strong className="tabular-nums">{fmt(summary.net)}</strong></span>
            <span>Gross revenue: <strong className="tabular-nums">{fmt(summary.sales)}</strong></span>
          </div>
        )}
      </div>
      {panel && wide && <div className="sticky top-20">{panel}</div>}
      </div>
      {/* Below desktop width the selected sale opens in a drawer instead of beside the list. */}
      {!wide && <Drawer open={!!selected} onClose={() => setSelectedId(null)} title={selected?.order_number ?? "Sale"} size="md">{panel && <div className="p-3">{panel}</div>}</Drawer>}

      {/* ── Add / Edit Drawer ── */}
      <ReasonDialog open={!!rejectingSale} onClose={() => setRejectingSale(null)} danger title={`Reject ${rejectingSale?.order_number ?? "sale"}?`}
        message="The sale will be declined. Nothing was posted for it, so no stock or accounts change. The reason is kept with the sale." confirmLabel="Reject sale"
        onConfirm={async (reason) => { if (rejectingSale) await rejectOrder.mutateAsync({ id: rejectingSale.id, note: reason }); }} />
      {reassigning && <ChangeSalespersonDialog order={reassigning} onClose={() => setReassigning(null)} />}
      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} danger
        title={isOwner ? `Void ${voiding?.order_number ?? "sale"}?` : `Ask to void ${voiding?.order_number ?? "sale"}`}
        message={isOwner ? "The sale is cancelled: its entries and payments are reversed and the stock goes back. Nothing is deleted, and your reason is kept in the audit trail." : "An owner or approver will decide. If they approve, the sale is cancelled, its entries are reversed and the stock goes back."}
        confirmLabel={isOwner ? "Void sale" : "Send request"}
        onConfirm={async (reason) => { if (!voiding) return; if (isOwner) await voidOrder.mutateAsync({ id: voiding.id, reason }); else { await requestVoid.mutateAsync({ id: voiding.id, reason }); setVoidNotice(`Request to void ${voiding.order_number} sent. It appears in Approvals.`); } }} />
      {voidNotice && <p role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-card shadow-lg" onAnimationEnd={() => setVoidNotice("")}>{voidNotice} <button className="ml-2 underline" onClick={() => setVoidNotice("")}>OK</button></p>}
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
            {!editing && !!authUser?.isSuperuser && activeTeam.length > 1 && (
              <Field label="Salesperson" hint="Who is credited with this sale. Leave as Me if you made it.">
                <Select value={form.salesperson_id} onChange={(e) => setForm({ ...form, salesperson_id: e.target.value })}>
                  <option value="">Me</option>{activeTeam.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </Field>
            )}
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
            submitLabel={editing ? "Save Changes" : "Record Sale"} busy={saving} busyLabel="Saving…"
            onCancel={closeDrawer}
            disabled={saving || (!editing && items.every((i) => !i.product_name))}
            color={SAL}
          />
        </form>
      </Drawer>

      {viewing && <SaleDocumentDrawer order={viewing} onClose={() => setViewingId(null)}
        onReversePayment={(id) => setReversingPayment(viewing.payments.find((p) => p.id === id) ?? null)}
        extraActions={canRecordPayment && viewing.status === "Completed" && viewing.outstanding_balance > 0 ? <Button onClick={() => setRecordingPaymentFor(viewing)} color={SAL} className="rounded-lg">Record Payment</Button> : undefined} />}

      <RecordPaymentDrawer order={recordingPaymentFor} onClose={() => setRecordingPaymentFor(null)} color={SAL} fmt={fmt} />
      <ReversePaymentDrawer payment={reversingPayment} onClose={() => setReversingPayment(null)} fmt={fmt} />

      <CsvImportDrawer<OrderImportRow>
        open={showImport}
        onClose={() => setShowImport(false)}
        onSubmit={async (items) => bulkOutcome("sale", (await bulkCreateOrders.mutateAsync(items)).data)}
        module="sales"
        effects={(items) => {
          const sales = new Set(items.map((i) => i.order_reference)).size;
          return [
            `Records ${sales.toLocaleString()} sale${sales === 1 ? "" : "s"} from ${items.length.toLocaleString()} line${items.length === 1 ? "" : "s"}; lines with the same Sale Ref become one sale.`,
            "Each sale goes through the normal sale process, like a POS sale: VAT, stock deduction and accounting entries are recorded.",
            "Customers are matched by email or name; a customer that isn't found is created.",
          ];
        }}
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
