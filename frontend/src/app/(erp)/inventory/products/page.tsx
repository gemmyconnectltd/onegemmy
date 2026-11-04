"use client";
import { Input } from "@/components/ui/Form";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ExportButton } from "@/components/ui/ExportButton";
import { fetchEvery } from "@/lib/exportTable";
import { inventoryApi } from "@/lib/api/inventory";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
import { ALL_TIME, periodRange, type PeriodValue } from "@/lib/period";
import { TableScroll } from "@/components/ui/TableScroll";
import { useAppConfig } from "@/lib/appConfig";

import { useState } from "react";
import { AlertTriangle, Package, PackageX, Plus, Search, Layers, Settings2, Upload, Wallet } from "lucide-react";
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
import { type ApiProduct } from "@/lib/api";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useRestockProduct, useBulkCreateProducts, useUploadProductImage, useValuationReport } from "@/lib/api/hooks";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

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
  };
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
  const [moreFilters, setMoreFilters] = useState(false);
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
    const query = next.toString();
    window.history.replaceState(null,"",`/inventory/products${query?`?${query}`:""}`);
  }, [search,statusFilter,page,pageSize,range.from,range.to]);
  const onPeriodChange = (v: PeriodValue) => { setPeriod(v); setPage(1); };
  const [stockMode, setStockMode] = useState<"restock" | "adjust">("restock");
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"single" | "bulk">("single");
  const [editing, setEditing] = useState<ApiProduct | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ApiProduct | null>(null);
  const [restockTarget, setRestockTarget] = useState<ApiProduct | null>(null);
  const [requestTarget, setRequestTarget] = useState<ApiProduct | null>(null);
  const can = useCan();
  const {user} = useAuth();
  const restricted = user?.branchIds != null || user?.branchId != null;
  const [statusError, setStatusError] = useState("");
  const [statusPending, setStatusPending] = useState(false);
  const canEdit = can("items", "update"), canDelete = can("items", "delete"), canRestock = can("stock", "create") && !restricted, canAdd = can("items", "create");
  const canAskPrice = !canEdit && can("pricing", "create"), canAskStock = !canEdit && can("stock", "create");
  const hasRowActions = canEdit || canDelete || canRestock || canAskPrice || canAskStock || can("items", "read");
  const [variantsTarget, setVariantsTarget] = useState<ApiProduct | null>(null);

  const isActive = statusFilter === "all" ? undefined : statusFilter === "active";
  const { data, isLoading, isFetching } = useProducts(page, pageSize, debouncedSearch || undefined, isActive, undefined, range);
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

  const handleBulkSubmit = async (items: ProductBulkRow[]) => {
    await bulkCreateProducts.mutateAsync(items.map((v) => ({
      name: v.name, sku: v.sku || null,
      barcode: v.barcode || null, subcategory: v.subcategory || null,
      category_id: v.category_id && !v.category_id.startsWith("__fb") ? v.category_id : null,
      brand_id: v.brand_id && !v.brand_id.startsWith("__fb") ? v.brand_id : null,
      unit_id: v.unit_id && !v.unit_id.startsWith("__fb") ? v.unit_id : null,
      price: v.price, cost: v.cost, stock: v.stock, min_stock: v.minStock,
      batch_number: v.batchNumber || null,
      expiry_date: v.expiryDate || null,
      manufactured_date: v.manufacturedDate || null,
    })));
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

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {confirmDialog}
      {statusError && <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-red-600">{statusError}</p>}
      <div className="flex items-center justify-between pesaa-responsive-toolbar">
        <div>
          <h1 className="pesaa-page-title">Products</h1>
          <p className="text-sm text-muted mt-0.5">{total} product{total === 1 ? "" : "s"} in your catalog</p>
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
            return { filename: "products", headers: PRODUCT_CSV_HEADERS, rows: items.map((x) => [x.name, x.sku, x.category?.name, x.brand?.name, x.unit?.name, x.cost, x.price, x.stock, x.min_stock, "", "", "", x.barcode, x.subcategory]) };
          }} />
          {canAdd && <Button variant="secondary" onClick={() => { setEditing(null); setFormMode("bulk"); setFormKey((k) => k + 1); setShowForm(true); }} className="rounded-lg">
            <Upload size={15} /> Import
          </Button>}
          {canAdd && <Button onClick={() => { setEditing(null); setFormMode("single"); setFormKey((k) => k + 1); setShowForm(true); }} color={INV_COLOR} className="rounded-lg">
            <Plus size={15} /> Add Product
          </Button>}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Catalog value", value: fmt(summary.cost_value), hint: "At cost", href: "/inventory/stock", icon: Wallet },
            { label: "Low stock", value: String(summary.low_stock_count), hint: "Need reorder", href: "/inventory/stock?status=low", icon: AlertTriangle },
            { label: "Out of stock", value: String(summary.out_of_stock_count), hint: "Immediate action", href: "/inventory/stock?status=out", icon: PackageX },
            { label: "Units on hand", value: String(summary.total_units), hint: "Business-wide", href: "/inventory/stock", icon: Package },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">{card.label}</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">{card.value}</p>
                  <p className="mt-1 text-xs text-muted">{card.hint}</p>
                </div>
                <span className="rounded-lg bg-accent/10 p-2.5 text-accent"><card.icon size={16} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 pesaa-responsive-toolbar">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input type="text" placeholder="Search products..." value={search} onChange={(e) => onSearchChange(e.target.value)} aria-label="Search products" className="w-full pl-9" />
          </div>
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button key={f} onClick={() => onStatusFilterChange(f)}
                style={statusFilter === f ? { backgroundColor: INV_COLOR } : {}}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${statusFilter === f ? "text-white" : "text-muted hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setMoreFilters((v) => !v)} aria-expanded={moreFilters}>
            {moreFilters ? "Hide filters" : "More filters"}
          </Button>
          <span className="text-xs text-muted ml-auto">{total} result{total === 1 ? "" : "s"}</span>
        </div>
        {moreFilters && (
          <div className="border-b border-border bg-surface/40 px-5 py-4">
            <PeriodFilter value={period} onChange={onPeriodChange} label="Date added" />
          </div>
        )}

        {bulk.count > 0 && (
          <div className="px-5 py-3 border-b border-border">
            <BulkActionBar count={bulk.count} label="product" onDelete={confirmBulkDelete} onClear={bulk.clear} deleting={bulkDeleting} />
          </div>
        )}

        <div className="md:hidden" aria-label="Product cards">
          <label className="flex min-h-11 items-center gap-3 border-b border-border px-4 text-sm"><input type="checkbox" aria-label="Select all products" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} disabled={!products.length} />Select this page</label>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {products.map((p) => <article key={p.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3"><ProductAvatar name={p.name} imageUrl={p.image_url} size={48} className="rounded-lg" /><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold"><Link className="hover:underline text-accent" href={`/inventory/products/${p.id}`}>{p.name}</Link></h2><p className="break-all text-xs text-muted">{p.sku || "No SKU"}</p><p className="mt-1 text-xs text-muted">{p.category?.name || "Uncategorized"} · {p.is_active ? "Active" : "Inactive"}</p></div><label className="flex h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" aria-label={`Select ${p.name}`} checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} /></label></div>
              <div className="mt-3 flex justify-end">{productActions(p)}</div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted">Selling price</dt><dd className="font-semibold">{fmt(p.price)}</dd></div><div><dt className="text-xs text-muted">Stock</dt><dd className="font-semibold">{variantStock(p)}</dd></div><div><dt className="text-xs text-muted">Cost</dt><dd>{fmt(p.cost)}</dd></div><div><dt className="text-xs text-muted">Margin</dt><dd>{margin(p)}%</dd></div></dl>
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
        </div>
        <div className={`hidden md:block overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          <TableScroll><table className="w-full min-w-160">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left">
                <th className="px-5 py-3 w-10">
                  <input type="checkbox" checked={bulk.allSelected} ref={(el) => { if (el) el.indeterminate = bulk.someSelected; }} onChange={bulk.toggleAll} className="w-4 h-4 rounded" disabled={products.length === 0} />
                </th>
                {["Product", "Category", "Brand", "Cost", "Price", "Margin", "Stock", "Status", ""].map((h, i) => (
                  <th key={i} className={`p-4 text-xs font-semibold text-muted ${["Cost","Price","Margin","Stock"].includes(h) ? "text-right" : h === "Status" ? "text-center" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-surface/40 transition-colors group">
                  <td className="px-5 py-3.5">
                    <input type="checkbox" checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} className="w-4 h-4 rounded" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <ProductAvatar name={p.name} imageUrl={p.image_url ?? undefined} size={32} className="rounded-lg" />
                      <div>
                        <Link className="text-sm font-semibold text-foreground hover:underline" href={`/inventory/products/${p.id}`}>{p.name}</Link>
                        <p className="text-xs text-muted font-mono">{p.sku}</p>
                        {p.has_variants && (p.variants?.length ?? 0) > 0 && (
                          <button onClick={() => setVariantsTarget(p)}
                            className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: INV_COLOR }}>
                            <Layers size={11} /> {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface text-muted">
                      {p.category?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted">{p.brand?.name ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-muted tabular-nums">{fmt(p.cost)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-foreground tabular-nums">{fmt(p.price)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{margin(p)}%</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-bold text-foreground tabular-nums">{variantStock(p)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? "bg-emerald-500" : "bg-muted"}`} />
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 relative">
                    {hasRowActions && productActions(p)}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <Package size={36} className="text-border mx-auto mb-3" />
                    <p className="text-sm font-semibold text-muted">No products found</p>
                    <p className="text-xs text-muted/70 mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table></TableScroll>
          </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} itemLabel="products" color={INV_COLOR} />
      </div>

      <ProductFormDrawer
        key={formKey}
        open={showForm}
        mode={formMode}
        onClose={() => { setShowForm(false); setEditing(null); }}
        initial={editing ? toFormValues(editing) : null}
        onSubmit={handleSubmit}
        onBulkSubmit={handleBulkSubmit}
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

export default function ProductsPage() { return <Suspense fallback={<PageLoader variant="page"/>}><ProductsContent/></Suspense>; }
