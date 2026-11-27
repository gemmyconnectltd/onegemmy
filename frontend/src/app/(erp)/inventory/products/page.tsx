"use client";
import { Field, Input, Select } from "@/components/ui/Form";
import { VatClassifyDrawer } from "@/components/inventory/VatClassifyDrawer";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect } from "react";
import { ExportButton } from "@/components/ui/ExportButton";
import { fetchEvery } from "@/lib/exportTable";
import { inventoryApi } from "@/lib/api/inventory";
import { useQueryClient } from "@tanstack/react-query";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
import { ALL_TIME, periodLabel, periodRange, type PeriodValue } from "@/lib/period";
import { StatCard } from "@/components/ui/StatCard";
import { FilterChips, MoreFilters, useWideScreen, type FilterChip } from "@/components/ui/ListFilters";
import { ProductQuickPanel } from "@/components/inventory/ProductQuickPanel";
import { TableScroll } from "@/components/ui/TableScroll";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { AlertTriangle, ImagePlus, Package, PackageX, Plus, Search, Layers, Settings2, Upload, Wallet } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { fmtMoney } from "@/lib/config";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { ProductFormDrawer, CSV_HEADERS as PRODUCT_CSV_HEADERS, type ProductFormValues, type ProductBulkRow } from "@/components/inventory/ProductFormDrawer";
import { RequestChangeDrawer } from "@/components/inventory/RequestChangeDrawer";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/can";
import { RestockDrawer, type RestockValues } from "@/components/inventory/RestockDrawer";
import { ProductActionsMenu } from "@/components/inventory/ProductActionsMenu";
import { ProductAvatar } from "@/components/inventory/ProductAvatar";
import { VariantsDrawer } from "@/components/inventory/VariantsDrawer";
import { type ApiProduct, type ProductMoreFilters } from "@/lib/api";
import type { ImportOutcome, ImportRowMeta } from "@/components/ui/CsvImportDrawer";
import { importsApi } from "@/lib/api/imports";
import { ImportPicturesDrawer } from "@/components/inventory/ImportPicturesDrawer";
import { useBranchStockSummary, useBrands, useCategories, useSuppliers, useUnits, useWarehouses, useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useRestockProduct, useBulkCreateProducts, useUploadProductImage, useValuationReport, useProductVatSummary, useVatRate, useBranchPricingStatus, useMyEntitlements } from "@/lib/api/hooks";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { BranchPicker } from "@/components/inventory/BranchPicker";
import { StockPill } from "@/components/inventory/BranchStock";
import { MAX_BRANCH_COLUMNS, type BranchStockRow } from "@/lib/api/branchStock";
import { BranchVisibilityDrawer } from "@/components/inventory/BranchVisibilityDrawer";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { TableState } from "@/components/ui/TableState";
import { Refreshing } from "@/components/ui/LoadState";
import { isRefreshing } from "@/lib/loadState";

function margin(p: ApiProduct) { return p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0; }
function variantStock(p: ApiProduct) {
  if (!p.has_variants || !p.variants?.length) return p.stock;
  return p.variants.reduce((s, v) => s + v.stock, 0);
}

function toFormValues(p: ApiProduct): ProductFormValues {
  return {
    name: p.name,
    sku: p.sku ?? "",
    barcode: p.barcode ?? "",
    subcategory: p.subcategory ?? "",
    category: p.category?.name ?? "",
    category_id: p.category_id ?? "",
    brand: p.brand?.name ?? "",
    brand_id: p.brand_id ?? "",
    unit: p.unit?.name ?? "",
    unit_id: p.unit_id ?? "",
    price: p.price,
    cost: p.cost,
    stock: p.stock,
    minStock: p.min_stock,
    image_url: p.image_url,
    vatTreatment: p.vat_treatment ?? "",
    taxCode: p.tax_code ?? "",
    vatReason: p.vat_reason ?? "",
  };
}

type StockStatus = NonNullable<ProductMoreFilters["stock"]>;
type ProductKind = NonNullable<ProductMoreFilters["kind"]>;
const STOCK_FILTERS: [StockStatus | "", string][] = [["", "Stock: All"], ["in", "In stock"], ["low", "Low stock"], ["out", "Out of stock"], ["negative", "Below zero"]];
const KINDS: [ProductKind | "", string][] = [["", "Any type"], ["simple", "Simple"], ["variants", "With variants"], ["serials", "Serial numbers"], ["weight", "Sold by weight"]];
const VAT_FILTERS = [["", "All VAT"], ["not_reviewed", "Not reviewed"], ["standard", "Standard-rated"], ["zero_rated", "Zero-rated"], ["exempt", "Exempt"], ["out_of_scope", "Out of scope"]] as const;

/** The product's VAT treatment as a compact badge; the standard rate shows its percentage. */
function VatBadge({ treatment, rate }: { treatment?: string | null; rate?: number }) {
  if (!treatment) return <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Not reviewed</span>;
  const label = treatment === "standard" ? `Standard${rate ? ` (${rate}%)` : ""}` : treatment === "zero_rated" ? "Zero-rated (0%)" : treatment === "exempt" ? "Exempt" : "Out of scope";
  return <span className="inline-flex whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-border">{label}</span>;
}

function ProductsContent() {
  const params = useSearchParams();
  const { brandColor, currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const INV_COLOR = brandColor;
  const [search, setSearch] = useState(params.get("q") || "");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">((params.get("status") === "active" || params.get("status") === "inactive") ? params.get("status") as "active" | "inactive" : "all");
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1));
  const [pageSize, setPageSize] = useState([10,20,50,100].includes(Number(params.get("size"))) ? Number(params.get("size")) : 20);
  // A new search/filter can't still be showing page 4 of the old result set —
  // reset it right where the filter changes, not via an effect (which would
  // set state on top of the render that just committed it).
  const onSearchChange = (v: string) => { setSearch(v); setPage(1); };
  const onStatusFilterChange = (f: "all" | "active" | "inactive") => { setStatusFilter(f); setPage(1); };
  const [period, setPeriod] = useState<PeriodValue>(params.get("from") || params.get("to") ? {key:"custom",from:params.get("from")||"",to:params.get("to")||""} : ALL_TIME);
  const [vatFilter, setVatFilter] = useState<string>(params.get("vat") ?? "");
  // Filters like Sales History: the everyday ones in the bar, the rest under "More filters", every applied one as a chip.
  const [categoryId, setCategoryId] = useState(params.get("category") ?? "");
  const [stockFilter, setStockFilter] = useState<StockStatus | "">(STOCK_FILTERS.some(([v]) => v === params.get("stock")) ? params.get("stock") as StockStatus : "");
  const [brandId, setBrandId] = useState(""), [supplierId, setSupplierId] = useState(""), [unitId, setUnitId] = useState("");
  const [kind, setKind] = useState<ProductKind | "">("");
  const [priceMin, setPriceMin] = useState(""), [priceMax, setPriceMax] = useState("");
  const [updated, setUpdated] = useState<PeriodValue>(ALL_TIME);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "View stock in": this page's own branch (?branch=), so one branch's shelf can be seen without switching the top bar.
  const [viewBranch, setViewBranchState] = useState<string | null>(params.get("branch"));
  const setViewBranch = (id: string | null) => { setViewBranchState(id); setPage(1); setSelectedId(null); };
  const wide = useWideScreen();
  const categoriesQ = useCategories(), brandsQ = useBrands(), unitsQ = useUnits(), suppliersQ = useSuppliers(1, 200);
  const upd = periodRange(updated);
  const more: ProductMoreFilters | undefined = (brandId || supplierId || unitId || kind || stockFilter || priceMin || priceMax || upd.from || upd.to) ? {
    stockBranch: stockFilter && viewBranch ? viewBranch : undefined,
    brandId: brandId || undefined, supplierId: supplierId || undefined, unitId: unitId || undefined, kind: kind || undefined, stock: stockFilter || undefined,
    priceMin: priceMin === "" ? undefined : Number(priceMin), priceMax: priceMax === "" ? undefined : Number(priceMax), updated: upd.from || upd.to ? upd : undefined,
  } : undefined;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const onVatFilterChange = (v: string) => { setVatFilter(v); setPage(1); };
  const [classifyOpen, setClassifyOpen] = useState(false);
  const vatSummary = useProductVatSummary();
  const vatRate = useVatRate();
  const canClassifyVat = vatSummary.data?.can_classify ?? false;
  const notReviewed = vatSummary.data?.counts.not_reviewed ?? 0;
  const range = periodRange(period);
  const valuation = useValuationReport(1, "all");
  const summary = valuation.data?.summary;
  useEffect(() => {
    const next = new URLSearchParams();
    if(search) next.set("q", search);
    if(statusFilter!=="all") next.set("status",statusFilter);
    if(page!==1) next.set("page",String(page));
    if(pageSize!==20) next.set("size",String(pageSize));
    if(range.from) next.set("from",range.from);
    if(range.to) next.set("to",range.to);
    if(vatFilter) next.set("vat",vatFilter);
    if(categoryId) next.set("category",categoryId);
    if(stockFilter) next.set("stock",stockFilter);
    if(viewBranch) next.set("branch",viewBranch);
    const query = next.toString();
    window.history.replaceState(null,"",`/inventory/products${query?`?${query}`:""}`);
  }, [search,statusFilter,page,pageSize,range.from,range.to,vatFilter,categoryId,stockFilter,viewBranch]);
  const onPeriodChange = (v: PeriodValue) => { setPeriod(v); setPage(1); };
  const [stockMode, setStockMode] = useState<"restock" | "adjust">("restock");
  // Branch prices: bulk hide/show in a branch, offered while the business has them on and this person may change a branch.
  const branchStatus = useBranchPricingStatus({ enabled: useMyEntitlements().data?.features?.branch_pricing === true });
  const [branchVisibility, setBranchVisibility] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(() => params.get("create") === "1");  // ?create=1 (Overview "Add product") opens the form
  const [formMode, setFormMode] = useState<"single" | "bulk">("single");
  const [editing, setEditing] = useState<ApiProduct | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [picturesOpen, setPicturesOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiProduct | null>(null);
  const [restockTarget, setRestockTarget] = useState<ApiProduct | null>(null);
  const [requestTarget, setRequestTarget] = useState<ApiProduct | null>(null);
  const can = useCan();
  const {user, activeBranchId} = useAuth();
  const restricted = user?.branchIds != null || user?.branchId != null;
  const [statusError, setStatusError] = useState("");
  const [statusPending, setStatusPending] = useState(false);
  const canEdit = can("items", "update"), canDelete = can("items", "delete"), canRestock = can("stock", "create") && !restricted, canAdd = can("items", "create");
  const canAskPrice = !canEdit && can("pricing", "create"), canAskStock = !canEdit && can("stock", "create");
  const hasRowActions = canEdit || canDelete || canRestock || canAskPrice || canAskStock || can("items", "read");
  const [variantsTarget, setVariantsTarget] = useState<ApiProduct | null>(null);

  const isActive = statusFilter === "all" ? undefined : statusFilter === "active";
  // Stock by branch: one catalogue, every branch keeps its own stock. Up to five branches show side by side; more become a
  // total, "N of M branches" and an expandable row; with one branch picked, a single "In <branch>" column.
  const warehousesQ = useWarehouses();
  const usesWarehouses = !!warehousesQ.data?.enabled;
  const branchSummary = useBranchStockSummary(1, "name", false, { enabled: usesWarehouses }, 500);
  const branchRows = (branchSummary.data?.items ?? []).filter((r): r is BranchStockRow & { branch_id: string } => !!r.branch_id);
  const severalBranches = usesWarehouses && branchRows.length > 1;
  // The page's own pick wins; otherwise the branch in the top bar.
  const shownBranch = viewBranch ?? activeBranchId;
  const openBranch = shownBranch ? branchRows.find((r) => r.branch_id === shownBranch) ?? null : null;
  const stockLayout: "plain" | "columns" | "compact" | "one" = !severalBranches ? "plain" : openBranch ? "one" : branchRows.length <= MAX_BRANCH_COLUMNS ? "columns" : "compact";
  const perBranch = stockLayout !== "plain";
  const [expanded, setExpanded] = useState<string | null>(null);
  const openBranchPage = (id: string) => setViewBranch(id);
  const productsQ = useProducts(page, pageSize, debouncedSearch || undefined, isActive, undefined, range, categoryId || undefined, vatFilter || undefined, undefined, perBranch, more);
  const { data, isLoading } = productsQ;
  const listFailed = productsQ.isError && !data;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const restockProduct = useRestockProduct();
  const bulkCreateProducts = useBulkCreateProducts();
  const uploadProductImage = useUploadProductImage();
  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  const bulk = useBulkSelection(products.map((p) => p.id));
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function confirmBulkDelete() {
    confirm({
      title: "Delete Products",
      message: `Delete ${bulk.count} selected product${bulk.count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkDeleting(true);
        await Promise.allSettled(Array.from(bulk.selected).map((id) => deleteProduct.mutateAsync(id)));
        setBulkDeleting(false);
        bulk.clear();
      },
    });
  }

  const handleSubmit = async (v: ProductFormValues, imageFile?: File) => {
    const payload = {
      name: v.name, sku: v.sku || null,
      barcode: v.barcode || null, subcategory: v.subcategory || null,
      category_id: v.category_id && !v.category_id.startsWith("__fb") ? v.category_id : null,
      brand_id: v.brand_id && !v.brand_id.startsWith("__fb") ? v.brand_id : null,
      unit_id: v.unit_id && !v.unit_id.startsWith("__fb") ? v.unit_id : null,
      price: v.price, cost: v.cost, ...(!restricted && can("stock","update") ? {stock:v.stock} : {}), min_stock: v.minStock,
      // VAT fields are only sent once a treatment is chosen; the server ignores them when nothing changed.
      ...(v.vatTreatment ? { vat_treatment: v.vatTreatment, tax_code: v.taxCode || null, vat_reason: v.vatReason || null } : {}),
    };
    if (editing) {
      await updateProduct.mutateAsync({ id: editing.id, data: payload });
      if (imageFile) await uploadProductImage.mutateAsync({ id: editing.id, file: imageFile });
      setEditing(null);
    } else {
      const res = await createProduct.mutateAsync(payload);
      if (imageFile) await uploadProductImage.mutateAsync({ id: res.data.id, file: imageFile });
    }
  };

  const queryClient = useQueryClient();
  const handleBulkSubmit = async (items: ProductBulkRow[], file?: File, progress?: (status: string) => void, rows?: ImportRowMeta[]): Promise<ImportOutcome> => {
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    progress?.(`Importing ${plural(items.length, "product")}…`);
    const created = (await bulkCreateProducts.mutateAsync(items.map((v) => ({
      name: v.name, sku: v.sku || null,
      barcode: v.barcode || null, subcategory: v.subcategory || null,
      category_id: v.category_id && !v.category_id.startsWith("__fb") ? v.category_id : null,
      brand_id: v.brand_id && !v.brand_id.startsWith("__fb") ? v.brand_id : null,
      unit_id: v.unit_id && !v.unit_id.startsWith("__fb") ? v.unit_id : null,
      price: v.price, cost: v.cost, stock: v.stock, min_stock: v.minStock,
      batch_number: v.batchNumber || null,
      expiry_date: v.expiryDate || null,
      manufactured_date: v.manufacturedDate || null,
      image_url: v.imageUrl || null,
    })))).data;
    const problems: { label: string; reason: string }[] = (created.errors ?? []).map((reason) => ({ label: "Product", reason }));
    let summary = `${plural(created.created, "product")} imported${created.failed ? `, ${created.failed} not imported` : ""}`;
    const ids = created.ids ?? [];
    // Pictures follow their own row to the product just created from it, so corrections made during review never mismatch them.
    // A problem with pictures never undoes the products that were created.
    const sheetRows: Record<number, string> = {};
    const chosen: { id: string; file: File; row: number }[] = [];
    rows?.forEach((meta, i) => {
      const id = ids[i];
      if (!id) return;
      if (meta.picture instanceof File) chosen.push({ id, file: meta.picture, row: meta.sheetRow });
      else if (meta.picture === undefined && meta.sheetRow) sheetRows[meta.sheetRow] = id;
    });
    let attached = 0, extras = 0;
    if (file && /\.xlsx$/i.test(file.name) && Object.keys(sheetRows).length && (await countWorkbookPictures(file)) !== 0) {
      progress?.("Products imported. Attaching the pictures from your sheet…");
      try {
        const pictures = (await importsApi.attachSheetPictures(file, sheetRows)).data;
        attached += pictures.total_pictures; extras += pictures.extra_pictures;
        problems.push(...pictures.problems.map((p) => ({ label: p.file, reason: p.reason })));
      } catch (e) {
        problems.push({ label: "Pictures", reason: (e as { detail?: string })?.detail ?? "The pictures in the sheet could not be attached" });
      }
    }
    for (const [n, pick] of chosen.entries()) {
      progress?.(`Attaching pictures ${n + 1}/${chosen.length}…`);
      try {
        const res = await inventoryApi.uploadProductImage(pick.id, pick.file);
        if (!(res as { data?: unknown }).data) throw res;
        attached += 1;
      } catch (e) {
        problems.push({ label: `Row ${pick.row}`, reason: (e as { detail?: string; message?: string })?.detail ?? (e as { message?: string })?.message ?? "The picture could not be uploaded" });
      }
    }
    if (attached || chosen.length) await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    if (attached) summary += `, ${plural(attached, "picture")} attached${extras ? ` (${extras} extra)` : ""}`;
    return { summary: `${summary}.`, problems, imported: created.created, failed: created.failed };
  };

  const handleRestock = async (v: RestockValues) => {
    if (!restockTarget) return;
    await restockProduct.mutateAsync({ id: restockTarget.id, data: { qty: v.qty, mode: v.mode, reason: v.reason, notes: v.notes } });
    setRestockTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteProduct.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  function confirmStatus(p: ApiProduct) {
    if (statusPending) return;
    setStatusError("");
    confirm({title:p.is_active?"Deactivate product":"Activate product", message:p.is_active?`Deactivate ${p.name}? Existing transactions and history will remain available.`:`Activate ${p.name} for new sales?`,confirmLabel:p.is_active?"Deactivate":"Activate",danger:p.is_active,onConfirm:async()=>{
      setStatusPending(true);
      try {await updateProduct.mutateAsync({id:p.id,data:{is_active:!p.is_active}});}
      catch(e) {setStatusError((e as {detail?:string}).detail||"Could not change product status. Try again.");}
      finally {setStatusPending(false);}
    }});
  }

  const productActions = (p: ApiProduct) => (<ProductActionsMenu product={p}
                      onEdit={() => { setEditing(p); setFormMode("single"); setFormKey(k=>k+1); setShowForm(true); }}
                      onAdjust={() => { if(p.has_variants) setVariantsTarget(p); else {setStockMode("adjust");setRestockTarget(p);} }}
                      onRestock={() => { if(p.has_variants) setVariantsTarget(p); else {setStockMode("restock");setRestockTarget(p);} }}
                      onStatus={() => confirmStatus(p)}
                      onVariants={() => setVariantsTarget(p)}
                      onRequest={canAskPrice || canAskStock ? () => setRequestTarget(p) : undefined}
                      onDelete={canDelete ? () => setDeleteTarget(p) : undefined}
                    />);


  const cellOf = (p: ApiProduct, branchId: string) => p.branch_stock?.find((c) => c.branch_id === branchId);
  const qty = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString());
  const stockHeads: { label: string; right: boolean; branchId?: string }[] =
    stockLayout === "columns" ? [...branchRows.map((r) => ({ label: r.name, right: true, branchId: r.branch_id })), { label: "Total", right: true }]
    : stockLayout === "compact" ? [{ label: "Total", right: true }, { label: "Branches", right: false }]
    : stockLayout === "one" ? [{ label: `In ${openBranch!.name}`, right: true }, { label: "Reorder level", right: true }]
    : [{ label: "Stock", right: true }];
  const heads: { label: string; right: boolean; branchId?: string }[] = [...["Product", "Cost", "Price", "VAT", "Margin"].map((label) => ({ label, right: ["Cost", "Price", "Margin"].includes(label) })),
    ...stockHeads, { label: "Status", right: false }, { label: "", right: false }];
  const columnCount = heads.length + 1;
  const total_ = (p: ApiProduct) => (p.branch_stock ? p.branch_stock.reduce((n, c) => n + (c.quantity ?? 0), 0) : variantStock(p));
  const stockCells = (p: ApiProduct) => {
    if (stockLayout === "columns") return <>{branchRows.map((r) => { const c = cellOf(p, r.branch_id); return <td key={r.branch_id} className="px-5 py-3.5 text-right text-sm tabular-nums">
      <span className="inline-flex items-center gap-2"><StockPill status={c?.status ?? "none"} /><span className={c?.quantity ? "font-semibold" : "text-muted"}>{qty(c?.quantity)}</span></span></td>; })}
      <td className="px-5 py-3.5 text-right text-sm font-bold tabular-nums">{qty(total_(p))}</td></>;
    if (stockLayout === "compact") return <>
      <td className="px-5 py-3.5 text-right text-sm font-bold tabular-nums">{qty(total_(p))}</td>
      <td className="px-5 py-3.5 text-sm"><button type="button" aria-expanded={expanded === p.id} onClick={(e) => { e.stopPropagation(); setExpanded((x) => (x === p.id ? null : p.id)); }} className="text-left hover:underline">
        <span className="block font-medium">{p.held_in ?? 0} of {branchRows.length} branches</span>
        {!!p.out_in?.length && <span className="block text-xs text-red-700 dark:text-red-300">Out in {p.out_in.slice(0, 2).join(", ")}{p.out_in.length > 2 ? ` +${p.out_in.length - 2}` : ""}</span>}
      </button></td></>;
    if (stockLayout === "one") { const c = cellOf(p, openBranch!.branch_id); return <>
      <td className="px-5 py-3.5 text-right text-sm tabular-nums"><span className="inline-flex items-center gap-2"><StockPill status={c?.status ?? "none"} /><span className="font-semibold">{qty(c?.quantity ?? variantStock(p))}</span></span></td>
      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-muted">{qty(c?.reorder_level ?? p.min_stock)}</td></>; }
    return <td className="px-5 py-3.5 text-right text-sm font-bold text-foreground tabular-nums">{variantStock(p)}</td>;
  };
  const expandedRow = (p: ApiProduct) => stockLayout === "compact" && expanded === p.id ? <tr><td colSpan={columnCount} className="bg-surface/40 px-5 py-3">
    <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">{branchRows.map((r) => { const c = cellOf(p, r.branch_id); return <li key={r.branch_id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <button type="button" className="min-w-0 truncate text-left text-accent hover:underline" onClick={() => openBranchPage(r.branch_id)}>{r.name}</button>
      <span className="inline-flex shrink-0 items-center gap-2"><StockPill status={c?.status ?? "none"} /><span className="font-semibold tabular-nums">{qty(c?.quantity)}</span></span></li>; })}</ul>
  </td></tr> : null;
  const mobileStock = (p: ApiProduct) => stockLayout === "plain" || !p.branch_stock ? variantStock(p)
    : stockLayout === "one" ? qty(cellOf(p, openBranch!.branch_id)?.quantity ?? variantStock(p))
    : <span className="block space-y-0.5 font-normal">{branchRows.map((r) => { const c = cellOf(p, r.branch_id); return <span key={r.branch_id} className="flex items-center justify-between gap-2"><span className="text-muted">{r.name}</span><span className="inline-flex items-center gap-1.5"><StockPill status={c?.status ?? "none"} /><span className="font-semibold tabular-nums">{qty(c?.quantity)}</span></span></span>; })}</span>;
  const totals = branchSummary.data?.summary.totals;
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string) => list?.find((x) => x.id === id)?.name ?? "Selected";
  const money = (v: string) => fmt(Number(v));
  const chips: FilterChip[] = [
    ...(search.trim() ? [{ key: "q", label: "Search", value: `"${search.trim()}"`, clear: () => onSearchChange("") }] : []),
    ...(period.key !== "all" ? [{ key: "added", label: "Added", value: periodLabel(period), clear: () => onPeriodChange(ALL_TIME) }] : []),
    ...(stockFilter ? [{ key: "stock", label: "Stock", value: STOCK_FILTERS.find(([v]) => v === stockFilter)?.[1] ?? stockFilter, clear: () => reset(setStockFilter)("") }] : []),
    ...(categoryId ? [{ key: "category", label: "Category", value: nameOf(categoriesQ.data?.items, categoryId), clear: () => reset(setCategoryId)("") }] : []),
    ...(statusFilter !== "all" ? [{ key: "status", label: "Status", value: statusFilter === "active" ? "Active" : "Inactive", clear: () => onStatusFilterChange("all") }] : []),
    ...(brandId ? [{ key: "brand", label: "Brand", value: nameOf(brandsQ.data?.items, brandId), clear: () => reset(setBrandId)("") }] : []),
    ...(supplierId ? [{ key: "supplier", label: "Supplier", value: nameOf(suppliersQ.data?.items, supplierId), clear: () => reset(setSupplierId)("") }] : []),
    ...(kind ? [{ key: "kind", label: "Type", value: KINDS.find(([v]) => v === kind)?.[1] ?? kind, clear: () => reset(setKind)("") }] : []),
    ...(unitId ? [{ key: "unit", label: "Unit", value: nameOf(unitsQ.data?.items, unitId), clear: () => reset(setUnitId)("") }] : []),
    ...(vatFilter ? [{ key: "vat", label: "VAT", value: VAT_FILTERS.find(([v]) => v === vatFilter)?.[1] ?? vatFilter, clear: () => onVatFilterChange("") }] : []),
    ...(priceMin || priceMax ? [{ key: "price", label: "Price", value: priceMin && priceMax ? `${money(priceMin)} – ${money(priceMax)}` : priceMin ? `from ${money(priceMin)}` : `up to ${money(priceMax)}`, clear: () => { setPriceMin(""); setPriceMax(""); setPage(1); } }] : []),
    ...(updated.key !== "all" ? [{ key: "updated", label: "Changed", value: periodLabel(updated), clear: () => reset(setUpdated)(ALL_TIME) }] : []),
  ];
  const clearAll = () => { setSearch(""); setStatusFilter("all"); setPeriod(ALL_TIME); setVatFilter(""); setCategoryId(""); setStockFilter(""); setBrandId(""); setSupplierId(""); setUnitId(""); setKind(""); setPriceMin(""); setPriceMax(""); setUpdated(ALL_TIME); setPage(1); };
  const selected = products.find((p) => p.id === selectedId) ?? null;
  const stockLabelFor = stockLayout === "one" || (openBranch && !severalBranches) ? `In ${openBranch?.name ?? "this branch"}` : severalBranches ? "In all branches" : "In stock";
  const panel = selected && <ProductQuickPanel key={selected.id} product={selected} fmt={fmt} canEdit={canEdit} stockLabel={stockLabelFor} onClose={() => setSelectedId(null)}
    onEditAll={() => { setEditing(selected); setFormMode("single"); setFormKey((k) => k + 1); setShowForm(true); }} actions={hasRowActions ? productActions(selected) : null} />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      {branchVisibility !== null && <BranchVisibilityDrawer productIds={Array.from(bulk.selected)} visible={branchVisibility} onClose={() => setBranchVisibility(null)} onDone={() => { setBranchVisibility(null); bulk.clear(); }} />}
      {classifyOpen && <VatClassifyDrawer productIds={Array.from(bulk.selected)} onClose={() => setClassifyOpen(false)} onDone={() => { setClassifyOpen(false); bulk.clear(); }} />}
      {statusError && <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-red-600">{statusError}</p>}
      <div className="flex items-center justify-between pesaa-responsive-toolbar">
        <div className="min-w-0">
          <h1 className="pesaa-page-title text-foreground">{stockLayout === "one" ? `Products · ${openBranch!.name}` : "Products"}</h1>
          <p className="text-sm text-muted mt-0.5">{total} product{total === 1 ? "" : "s"}{stockLayout === "one" ? ` · stock in ${openBranch!.name} only` : severalBranches ? " · stock in each branch side by side. Pick a branch to see only its shelf." : " in your catalog"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory/products/settings">
            <Button variant="secondary" className="rounded-lg">
              <Settings2 size={15} /> Manage attributes
            </Button>
          </Link>
          <ExportButton build={async () => {
            const items = await fetchEvery((p, s) => inventoryApi.listProducts(p, s, debouncedSearch || undefined, isActive, range), 500);
            // Batch and date columns stay empty: they belong to batches, not to the product itself.
            return { filename: "products", headers: PRODUCT_CSV_HEADERS, rows: items.map((x) => [x.name, x.sku, x.category?.name, x.brand?.name, x.unit?.name, x.cost, x.price, x.stock, x.min_stock, "", "", "", x.barcode, x.subcategory, x.image_url && /^(https:\/\/|\/uploads\/)/.test(x.image_url) ? x.image_url : ""]) };
          }} />
          {canAdd && <Button variant="secondary" onClick={() => { setEditing(null); setFormMode("bulk"); setFormKey((k) => k + 1); setShowForm(true); }} className="rounded-lg">
            <Upload size={15} /> Import
          </Button>}
          {canAdd && <Button variant="secondary" onClick={() => setPicturesOpen(true)} className="rounded-lg"><ImagePlus size={15} /> Import pictures</Button>}
          {canAdd && <Button onClick={() => { setEditing(null); setFormMode("single"); setFormKey((k) => k + 1); setShowForm(true); }} color={INV_COLOR} className="rounded-lg">
            <Plus size={15} /> Add Product
          </Button>}
        </div>
      </div>

      {summary && (() => {
        // With branches, the numbers are the branch being shown (or every branch), the same as the Inventory overview.
        const r = usesWarehouses && branchRows.length ? openBranch ?? (branchRows.length === 1 ? branchRows[0] : null) : null;
        const t = usesWarehouses && !r ? totals : null;
        const value = r ? r.value_cost : t ? t.value_cost : Number(summary.cost_value);
        const low = r ? r.low : t ? t.low : summary.low_stock_count;
        const out = r ? r.out : t ? t.out : summary.out_of_stock_count;
        const units = r ? r.units : t ? t.units : Number(summary.total_units);
        const stockHref = (q = "") => `/inventory${q || openBranch ? "?" : ""}${new URLSearchParams({ ...(openBranch ? { branch: openBranch.branch_id } : {}), ...(q ? { status: q } : {}) })}`;
        return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Stock value at cost" value={fmt(value)} hint={r && severalBranches ? `In ${r.name}` : "At cost"} icon={Wallet} href={stockHref()} />
          <StatCard label="Low stock" value={String(low)} hint="Below the reorder level" icon={AlertTriangle} tone={low ? "warning" : "default"} href={stockHref("low")} />
          <StatCard label="Out of stock" value={String(out)} hint={r || t ? "In stock before, none left now" : "None left"} icon={PackageX} tone={out ? "danger" : "default"} href={stockHref("out")} />
          <StatCard label="Units on hand" value={units.toLocaleString()} hint={r && severalBranches ? `In ${r.name}` : "On hand"} icon={Package} href={stockHref()} />
        </div>;
      })()}

      {notReviewed > 0 && vatFilter !== "not_reviewed" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span>{notReviewed} product{notReviewed === 1 ? " has" : "s have"} no VAT treatment yet. {notReviewed === 1 ? "It is" : "They are"} sold at the standard rate until reviewed.</span>
          <Button variant="outline" size="sm" onClick={() => onVatFilterChange("not_reviewed")}>Review VAT</Button>
        </div>
      )}
      <div className={`grid items-start gap-4 ${selected && wide ? "grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
      <div className="min-w-0 bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className={`flex flex-wrap items-center gap-2 border-b border-border p-3 ${selected && wide ? "" : "xl:flex-nowrap"}`}>
          <div className="relative w-full lg:w-auto lg:min-w-[12rem] lg:flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-9" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Name, SKU or barcode" aria-label="Search products" />
          </div>
          <PeriodFilter value={period} onChange={onPeriodChange} label="Added" className="min-w-0 flex-1 sm:flex-none lg:shrink-0" />
          {severalBranches && <BranchPicker branches={branchRows.map((r) => ({ id: r.branch_id, name: r.name, units: r.units }))} totalUnits={totals?.units}
            value={openBranch?.branch_id ?? null} onChange={setViewBranch} label="View stock in" allLabel={activeBranchId ? "Top bar branch" : "All branches"} className="min-w-0 flex-1 sm:w-48 sm:flex-none lg:shrink-0" />}
          <Select aria-label="Stock" value={stockFilter} onChange={(e) => reset(setStockFilter)(e.target.value as StockStatus | "")} className="min-w-0 flex-1 sm:w-auto sm:flex-none lg:shrink-0">
            {STOCK_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select aria-label="Category" value={categoryId} onChange={(e) => reset(setCategoryId)(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none lg:shrink-0">
            <option value="">Category: All</option>
            {(categoriesQ.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="Status" value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value as "all" | "active" | "inactive")} className="min-w-0 flex-1 sm:w-auto sm:flex-none lg:shrink-0">
            <option value="all">Status: All</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </Select>
          <MoreFilters active={[brandId, supplierId, unitId, kind, vatFilter, priceMin || priceMax, upd.from || upd.to].filter(Boolean).length} width="w-80">
            <Field label="Brand"><Select value={brandId} onChange={(e) => reset(setBrandId)(e.target.value)}><option value="">Any brand</option>{(brandsQ.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="Supplier"><Select value={supplierId} onChange={(e) => reset(setSupplierId)(e.target.value)}><option value="">Any supplier</option>{(suppliersQ.data?.items ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><Select value={kind} onChange={(e) => reset(setKind)(e.target.value as ProductKind | "")}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Unit"><Select value={unitId} onChange={(e) => reset(setUnitId)(e.target.value)}><option value="">Any unit</option>{(unitsQ.data?.items ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            </div>
            <Field label="VAT treatment"><Select value={vatFilter} onChange={(e) => onVatFilterChange(e.target.value)}>
              {VAT_FILTERS.map(([value, label]) => <option key={value} value={value}>{value ? label : "Any VAT treatment"}{value && vatSummary.data ? ` (${vatSummary.data.counts[value] ?? 0})` : ""}</option>)}
            </Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price from"><Input type="number" min={0} step="any" inputMode="decimal" value={priceMin} onChange={(e) => reset(setPriceMin)(e.target.value)} /></Field>
              <Field label="Price to"><Input type="number" min={0} step="any" inputMode="decimal" value={priceMax} onChange={(e) => reset(setPriceMax)(e.target.value)} /></Field>
            </div>
            <div className="text-xs text-muted"><span className="mb-1 block font-medium">Last changed</span><PeriodFilter value={updated} onChange={reset(setUpdated)} label="Changed" /></div>
          </MoreFilters>
        </div>
        <FilterChips chips={chips} onClearAll={clearAll} count={`${total} product${total === 1 ? "" : "s"} match`} />

        {bulk.count > 0 && (
          <div className="px-5 py-3 border-b border-border">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1"><BulkActionBar count={bulk.count} label="product" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} /></div>
              {canClassifyVat && <Button variant="outline" size="sm" onClick={() => setClassifyOpen(true)}>Set VAT treatment</Button>}
              {branchStatus.data?.enabled && (branchStatus.data.editable_branch_ids.length ?? 0) > 0 && <>
                <Button variant="outline" size="sm" onClick={() => setBranchVisibility(false)}>Hide in branch…</Button>
                <Button variant="outline" size="sm" onClick={() => setBranchVisibility(true)}>Show in branch…</Button>
              </>}
            </div>
          </div>
        )}

        {(isLoading || listFailed) && <div className="p-4"><TableState loading={isLoading} error={listFailed ? productsQ.error : undefined} onRetry={() => void productsQ.refetch()} /></div>}
        {!isLoading && !listFailed && (
        <div className="md:hidden" aria-label="Product cards">
          <label className="flex min-h-11 items-center gap-3 border-b border-border px-4 text-sm"><input type="checkbox" aria-label="Select all products" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} disabled={!products.length} />Select this page</label>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {products.map((p) => <article key={p.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3"><ProductAvatar name={p.name} imageUrl={p.image_url} size={48} className="rounded-lg" /><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold"><button type="button" className="text-left text-accent hover:underline" onClick={() => setSelectedId(p.id)}>{p.name}</button></h2><p className="break-all text-xs text-muted">{p.sku || "No SKU"}</p><p className="mt-1 text-xs text-muted">{p.category?.name || "Uncategorized"} · {p.is_active ? "Active" : "Inactive"}</p><div className="mt-1.5"><VatBadge treatment={p.vat_treatment} rate={vatRate.data?.rate} /></div></div><label className="flex h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" aria-label={`Select ${p.name}`} checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} /></label></div>
              <div className="mt-3 flex justify-end">{productActions(p)}</div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted">Selling price</dt><dd className="font-semibold">{fmt(p.price)}</dd></div><div className={stockLayout === "columns" || stockLayout === "compact" ? "col-span-2" : ""}><dt className="text-xs text-muted">{stockLayout === "one" ? `In ${openBranch!.name}` : "Stock"}</dt><dd className="font-semibold">{mobileStock(p)}</dd></div><div><dt className="text-xs text-muted">Cost</dt><dd>{fmt(p.cost)}</dd></div><div><dt className="text-xs text-muted">Margin</dt><dd>{margin(p)}%</dd></div></dl>
              {hasRowActions && <details className="mt-3 border-t border-border"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent">Product actions</summary><div className="flex flex-wrap gap-2">
                {canEdit && <Button variant="outline" onClick={() => { setEditing(p); setFormMode("single"); setFormKey((k) => k + 1); setShowForm(true); }}>Edit</Button>}
                {(canAskPrice || canAskStock) && <Button variant="outline" onClick={() => setRequestTarget(p)}>Request change</Button>}
                {canRestock && <Button variant="outline" onClick={() => {setStockMode("restock");setRestockTarget(p);}}>Restock</Button>}
                <Button variant="outline" onClick={() => setVariantsTarget(p)}>Variants</Button>
                {canDelete && <Button variant="destructive" onClick={() => setDeleteTarget(p)}>Delete</Button>}
              </div></details>}
            </article>)}
            {!products.length && <p className="p-4 text-sm text-muted">No products found. Try another search or filter.</p>}
          </div>
        </div>)}
        {!isLoading && !listFailed && (
        <Refreshing busy={isRefreshing(productsQ)} className="hidden md:block overflow-x-auto">
          <TableScroll><table className="w-full min-w-160">
            <thead>
              {stockLayout === "columns" && <tr>
                <th colSpan={6} aria-hidden />
                <th colSpan={branchRows.length + 1} scope="colgroup" className="p-2 text-center text-xs font-semibold text-muted">Units on hand</th>
                <th colSpan={2} aria-hidden />
              </tr>}
              <tr className="border-b border-border bg-surface/50 text-left">
                <th className="px-5 py-3 w-10">
                  <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={products.length === 0} />
                </th>
                {heads.map((h, i) => (
                  <th key={i} className={`p-4 text-xs font-semibold text-muted ${h.right ? "text-right" : h.label === "Status" ? "text-center" : ""}`}>
                    {h.branchId ? <button type="button" className="font-semibold hover:text-accent hover:underline" title={`Show only ${h.label}`} onClick={() => openBranchPage(h.branchId!)}>{h.label}</button> : h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (<Fragment key={p.id}>
                <tr onClick={() => setSelectedId(selectedId === p.id ? null : p.id)} aria-selected={selectedId === p.id}
                  className={`cursor-pointer transition-colors group ${selectedId === p.id ? "bg-accent/5" : "hover:bg-surface/40"}`}>
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} className="w-4 h-4 rounded" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <ProductAvatar name={p.name} imageUrl={p.image_url ?? undefined} size={32} className="rounded-lg" />
                      <div>
                        <button type="button" className="text-left text-sm font-semibold text-foreground hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent" onClick={(e) => { e.stopPropagation(); setSelectedId(p.id); }}>{p.name}</button>
                        <p className="text-xs text-muted font-mono">{p.sku}</p>
                        {p.has_variants && (p.variants?.length ?? 0) > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); setVariantsTarget(p); }}
                            className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: INV_COLOR }}>
                            <Layers size={11} /> {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{fmt(p.cost)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(p.price)}</td>
                  <td className="px-5 py-3.5"><VatBadge treatment={p.vat_treatment} rate={vatRate.data?.rate} /></td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{margin(p)}%</span>
                  </td>
                  {stockCells(p)}
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? "bg-emerald-500" : "bg-muted"}`} />
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 relative" onClick={(e) => e.stopPropagation()}>
                    {hasRowActions && productActions(p)}
                  </td>
                </tr>
                {expandedRow(p)}
              </Fragment>))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="py-16 text-center">
                    <Package size={36} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-semibold text-muted">No products found</p>
                    <p className="text-xs text-muted/70 mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
            {stockLayout === "columns" && totals && products.length > 0 && <tfoot>
              <tr className="border-t border-border bg-surface/50">
                <td colSpan={6} className="px-5 py-3 text-sm font-semibold">Stock value at cost</td>
                {branchRows.map((r) => <td key={r.branch_id} className="px-5 py-3 text-right text-sm font-semibold tabular-nums">{fmt(r.value_cost)}</td>)}
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">{fmt(branchRows.reduce((n, r) => n + r.value_cost, 0))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>}
          </table></TableScroll>
        </Refreshing>)}
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="products" color={INV_COLOR} />
      </div>
      {selected && wide && <div className="sticky top-20">{panel}</div>}
      </div>
      {/* Below desktop width the picked product opens in a drawer instead of beside the list. */}
      {!wide && <Drawer open={!!selected} onClose={() => setSelectedId(null)} title={selected?.name ?? "Product"} size="md">{panel && <div className="p-3">{panel}</div>}</Drawer>}

      {picturesOpen && <ImportPicturesDrawer onClose={() => setPicturesOpen(false)} />}
      <ProductFormDrawer
        key={formKey}
        open={showForm}
        mode={formMode}
        onClose={() => { setShowForm(false); setEditing(null); }}
        initial={editing ? toFormValues(editing) : null}
        onSubmit={handleSubmit}
        onBulkSubmit={handleBulkSubmit}
        money={fmt}
        color={INV_COLOR}
      />

      {requestTarget && <RequestChangeDrawer product={requestTarget} canPrice={can("pricing", "create")} canStock={can("stock", "create")} onClose={() => setRequestTarget(null)} />}
      <RestockDrawer
        key={`${restockTarget?.id}:${stockMode}`}
        initialMode={stockMode}
        open={!!restockTarget}
        onClose={() => setRestockTarget(null)}
        productName={restockTarget?.name ?? ""}
        currentStock={restockTarget?.stock ?? 0}
        onSubmit={handleRestock}
        color={INV_COLOR}
      />

      <VariantsDrawer
        open={!!variantsTarget}
        onClose={() => setVariantsTarget(null)}
        productId={variantsTarget?.id ?? ""}
        productName={variantsTarget?.name ?? ""}
        color={INV_COLOR}
      />

      <Drawer
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Product"
        description="This action cannot be undone."
        side="center"
        size="sm"
        footer={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg text-sm">
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirmDelete} className="flex-1 rounded-lg text-sm font-bold">
              Delete
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <p className="text-sm text-foreground/70">
            Are you sure you want to delete <span className="font-semibold text-foreground">&quot;{deleteTarget?.name}&quot;</span>? This will remove it from your inventory.
          </p>
        </div>
      </Drawer>
    </div>
  );
}

/** How many pictures are pasted into an .xlsx (it is a ZIP; pictures live in xl/media). null when it can't be told. */
async function countWorkbookPictures(file: File): Promise<number | null> {
  try {
    const XLSX = await import("xlsx");
    const zip = XLSX.CFB.read(new Uint8Array(await file.arrayBuffer()), { type: "array" }) as { FullPaths: string[] };
    return zip.FullPaths.filter((p) => /(^|\/)xl\/media\/[^/]+$/i.test(p)).length;
  } catch { return null; }
}

export default function ProductsPage() { return <Suspense fallback={<PageLoader variant="page" />}><ProductsContent/></Suspense>; }
