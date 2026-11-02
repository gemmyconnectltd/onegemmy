"use client";
import { Suspense, useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Download } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import { usePurchaseOrders, useDeletePurchaseOrder, useSuppliers } from "@/lib/api/hooks";
import { procurementApi } from "@/lib/api/procurement";
import { useBulkSelection } from "@/lib/useBulkSelection";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableWrap } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { PurchaseHeader, PurchaseStatus, receivingStatus, usePurchasingScope } from "@/components/procurement/PurchaseShared";

function PurchaseOrdersPageInner() {
  const params = useSearchParams(), router = useRouter();
  useEffect(() => {if (params.get("new") === "1") router.replace("/procurement/orders/new");}, [params, router]);
  const {hasPermission} = useAuth(), {currency} = useAppConfig(), scope = usePurchasingScope();
  const [status, setStatus] = useState(params.get("status") || ""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [sort, setSort] = useState("created"), [direction, setDirection] = useState("desc");
  const [supplier, setSupplier] = useState(params.get("supplier_id") || ""), [supplierSearch, setSupplierSearch] = useState(""), [supplierPage, setSupplierPage] = useState(1);
  const suppliers = useSuppliers(supplierPage, 25, useDeferredValue(supplierSearch));
  const filters = {search: useDeferredValue(search), from_date: from, to_date: to, supplier_id: supplier, sort, direction};
  const query = usePurchaseOrders(status || undefined, page, 25, undefined, filters, scope);
  const [error, setError] = useState<unknown>(null), [exporting, setExporting] = useState(false), [deleting, setDeleting] = useState(false);
  const remove = useDeletePurchaseOrder(), {confirm, dialog} = useConfirmDialog();
  const bulk = useBulkSelection(hasPermission("purchase_orders:delete") ? (query.data?.items || []).filter(order => order.status === "Draft").map(order => order.id) : []);
  function deleteSelected() {confirm({title: "Delete selected drafts?", message: `Delete ${bulk.count} draft purchase orders? This cannot be undone.`, confirmLabel: "Delete drafts", danger: true, onConfirm: async () => {setDeleting(true); setError(null); const results = await Promise.allSettled([...bulk.selected].map(id => remove.mutateAsync(id))); if (results.some(result => result.status === "rejected")) setError({detail: "Some drafts could not be deleted. Refresh and retry the remaining selections."}); bulk.clear(); setDeleting(false);}});}
  return <div className="space-y-5">{dialog}<PurchaseHeader title="Purchase Orders" description="Manage supplier commitments, deliveries and receiving progress." actions={<>{hasPermission("purchase_orders:create") && <Link href="/procurement/orders/new"><Button><Plus size={15} />Create Purchase Order</Button></Link>}<Button variant="outline" disabled={exporting} onClick={async () => {setExporting(true); setError(null); try {await procurementApi.exportOrders(status, filters);} catch (cause) {setError(cause);} finally {setExporting(false);}}}><Download size={14} />{exporting ? "Exporting…" : "Export CSV"}</Button></>} />
    <section aria-label="Purchase order filters" className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-muted">Search<Input aria-label="Search purchase orders" placeholder="PO number or supplier…" value={search} onChange={event => {setSearch(event.target.value); setPage(1);}} /></label>
      <label className="text-xs text-muted">Status<Select value={status} onChange={event => {setStatus(event.target.value); setPage(1);}}><option value="">All statuses</option>{["Draft", "PendingApproval", "Approved", "Sent", "PartiallyReceived", "Received", "Closed", "Cancelled"].map(value => <option key={value} value={value}>{value.replace(/([a-z])([A-Z])/g, "$1 $2")}</option>)}</Select></label>
      <label className="text-xs text-muted">From<Input type="date" value={from} max={to || undefined} onChange={event => {setFrom(event.target.value); setPage(1);}} /></label><label className="text-xs text-muted">To<Input type="date" value={to} min={from || undefined} onChange={event => {setTo(event.target.value); setPage(1);}} /></label>
      <label className="text-xs text-muted">Sort<Select value={sort} onChange={event => {setSort(event.target.value); setPage(1);}}><option value="created">Order date</option><option value="reference">PO number</option><option value="total">Amount</option><option value="expected">Expected delivery</option></Select></label><Select aria-label="Sort direction" className="w-auto!" value={direction} onChange={event => {setDirection(event.target.value); setPage(1);}}><option value="desc">Descending</option><option value="asc">Ascending</option></Select>
      <details className="w-full"><summary className="cursor-pointer text-sm text-accent">Supplier filter{supplier ? " (active)" : ""}</summary><div className="mt-2 max-w-sm space-y-2"><Input aria-label="Find supplier filter" placeholder="Search suppliers…" value={supplierSearch} onChange={event => {setSupplierSearch(event.target.value); setSupplierPage(1);}} /><Select aria-label="Filter supplier" value={supplier} onChange={event => {setSupplier(event.target.value); setPage(1);}}><option value="">All suppliers</option>{supplier && !suppliers.data?.items.some(item => item.id === supplier) && <option value={supplier}>Selected supplier</option>}{suppliers.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Pagination page={supplierPage} pageSize={25} total={suppliers.data?.total || 0} onPageChange={setSupplierPage} itemLabel="suppliers" /><FinancialError error={suppliers.error} /></div></details>
    </section><p className="text-xs text-muted">Branch access follows the branch selector in the top bar. Amounts retain each order’s currency.</p><FinancialError error={error || query.error} />
    {bulk.count > 0 && <BulkActionBar count={bulk.count} label="draft purchase order" onDelete={deleteSelected} onClear={bulk.clear} deleting={deleting} />}
    {query.isLoading ? <PageLoader variant="compact" /> : !query.error && <><TableWrap mobileLayout="cards"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr><th className="p-4"><input aria-label="Select all deletable drafts" type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} /></th>{["PO number", "Supplier", "Branch", "Order date", "Expected", "Amount", "Order status", "Receiving", "Billing", "Payment", "Actions"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{query.data?.items.map(order => <tr key={order.id} className="hover:bg-surface/50"><td className="p-4">{order.status === "Draft" && hasPermission("purchase_orders:delete") && <input aria-label={`Select ${order.reference}`} type="checkbox" checked={bulk.selected.has(order.id)} onChange={() => bulk.toggle(order.id)} />}</td><td className="p-4"><Link className="font-semibold text-accent hover:underline" href={`/procurement/orders/${order.id}`}>{order.reference}</Link></td><td className="p-4">{order.supplier?.name || "—"}</td><td className="max-w-40 truncate p-4 text-xs text-muted" title={order.branch_id || ""}>{order.branch_id || "Main branch"}</td><td className="p-4">{fmtDate(order.order_date || order.created_at)}</td><td className="p-4">{fmtDate(order.expected_date)}</td><td className="p-4 text-right font-semibold tabular-nums">{formatMoney(order.total, order.currency_code || currency, {showCode: true})}</td><td className="p-4"><PurchaseStatus status={order.status} /></td><td className="p-4 text-xs">{receivingStatus(order)}</td><td className="p-4"><PurchaseStatus status={order.billing_status || "NotBilled"} /></td><td className="p-4">{hasPermission("accounts_payable:read") ? <PurchaseStatus status={order.payment_status || "Unpaid"} /> : "—"}</td><td className="p-4"><Link href={`/procurement/orders/${order.id}`}><Button variant="outline" size="sm">View</Button></Link></td></tr>)}</tbody></table></TableWrap>{!query.data?.items.length && <p className="py-8 text-center text-sm text-muted">No purchase orders match your filters.</p>}<Pagination page={page} pageSize={25} total={query.data?.total || 0} onPageChange={setPage} itemLabel="purchase orders" /></>}
  </div>;
}

export default function PurchaseOrdersPage() {return <Suspense fallback={<PageLoader />}><PurchaseOrdersPageInner /></Suspense>;}
