"use client";
import { useState } from "react";
import Link from "next/link";
import { procurementApi } from "@/lib/api/procurement";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { usePurchaseOrder, usePurchaseAction, useCancelPurchaseOrder, usePurchaseActivity, usePurchaseAttachments } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableWrap } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PurchaseHeader, PurchaseStatus, receivingStatus, usePurchasingScope } from "./PurchaseShared";
import { BillList, ReceiptList } from "./PurchaseDocuments";

export function PurchaseDetails({id}: {id: string}) {
  const scope = usePurchasingScope();
  const query = usePurchaseOrder(id, undefined, scope), action = usePurchaseAction(), cancel = useCancelPurchaseOrder();
  const {hasPermission} = useAuth(), {currency} = useAppConfig();
  const [activityPage, setActivityPage] = useState(1);
  const attachments = usePurchaseAttachments(id, scope);
  const activity = usePurchaseActivity(id, activityPage, scope);
  const [error, setError] = useState<unknown>(null); const [downloading, setDownloading] = useState(false); const {confirm, dialog} = useConfirmDialog();
  if (query.isLoading) return <PageLoader />;
  if (query.error || !query.data) return <FinancialError error={query.error || {detail: "Purchase not found"}} />;
  const order = query.data, code = order.currency_code || currency;
  const money = (amount: number) => formatMoney(amount, code, {showCode: true});
  const busy = action.isPending || cancel.isPending, canUpdate = hasPermission("purchase_orders:update");
  async function transition(value: string) {setError(null); try {await action.mutateAsync({id, action: value});} catch (cause) {setError(cause);}}
  return <div className="space-y-5">{dialog}<PurchaseHeader title={order.reference} description={order.supplier?.name || "Supplier not specified"} actions={<>
    {order.status === "Draft" && canUpdate && <><Link href={`/procurement/orders/${id}/edit`}><Button variant="outline">Edit draft</Button></Link><Button disabled={busy} onClick={() => void transition("submit")}>Submit for approval</Button></>}
    {order.status === "PendingApproval" && hasPermission("purchase_orders:approve") && <Button disabled={busy} onClick={() => void transition("approve")}>Approve</Button>}
    {order.status === "Approved" && canUpdate && <Button variant="outline" disabled={busy} onClick={() => confirm({title: "Mark order sent?", message: "Confirm you have sent this order to the supplier. This records the status; it does not send an email.", confirmLabel: "Mark sent", onConfirm: () => transition("send")})}>Mark sent to supplier</Button>}
    {["Approved", "Sent", "PartiallyReceived"].includes(order.status) && canUpdate && <Link href={`/procurement/orders/${id}/receive`}><Button disabled={busy}>Receive goods</Button></Link>}
    {order.status === "Received" && canUpdate && <Button variant="outline" disabled={busy} onClick={() => void transition("close")}>Complete purchase</Button>}
    {["Draft", "PendingApproval", "Approved", "Sent"].includes(order.status) && canUpdate && <Button variant="ghost" disabled={busy} onClick={() => confirm({title: "Cancel purchase order?", message: `Cancel ${order.reference}? No inventory or payment is posted.`, confirmLabel: "Cancel order", danger: true, onConfirm: async () => {try {await cancel.mutateAsync(id);} catch (cause) {setError(cause);}}})}>Cancel order</Button>}
    <Button variant="outline" disabled={downloading} onClick={async () => {setDownloading(true); try {await procurementApi.downloadPurchase(id);} catch (cause) {setError(cause);} finally {setDownloading(false);}}}>{downloading ? "Preparing…" : "Download / print PDF"}</Button>
    <Link href="/procurement/orders"><Button variant="outline">Back to orders</Button></Link>
  </>} /><FinancialError error={error} />
    <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
      <div><p className="text-xs text-muted">Order status</p><div className="mt-1"><PurchaseStatus status={order.status} /></div></div>
      <div><p className="text-xs text-muted">Billing</p><div className="mt-1"><PurchaseStatus status={order.billing_status || "NotBilled"} /></div></div><div><p className="text-xs text-muted">Receiving</p><p className="mt-1 text-sm font-medium">{receivingStatus(order)}</p></div>
      {[["Order date", fmtDate(order.order_date || order.created_at)], ["Expected delivery", fmtDate(order.expected_date)], ["Branch", order.branch_id || "Main branch"], ["Purchase commitment", money(order.total)], ["Supplier reference", order.supplier_reference || "—"], ["Payment terms", order.payment_terms_days == null ? "Not specified" : `Net ${order.payment_terms_days}`]].map(([label, value]) => <div key={label}><p className="text-xs text-muted">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>)}
    </section>
    <section className="space-y-3"><h2 className="pesaa-card-title">Ordered items</h2><TableWrap><table className="w-full min-w-[800px] text-left text-sm"><thead><tr>{["Product", "SKU", "Ordered", "Received", "Remaining", "Unit cost", "Line total"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{order.items.map(item => {
      const received = Number(item.received_quantity ?? (order.status === "Received" ? item.quantity : 0));
      return <tr key={item.id}><td className="p-4">{item.product_name}{item.variant_attributes && <span className="block text-xs text-muted">{Object.values(item.variant_attributes).join(" / ")}</span>}</td><td className="p-4 text-muted">{item.sku || "—"}</td><td className="p-4">{item.quantity}</td><td className="p-4">{received}</td><td className="p-4">{item.quantity - received}</td><td className="p-4 text-right tabular-nums">{money(item.unit_cost)}</td><td className="p-4 text-right font-semibold tabular-nums">{money(item.line_total)}</td></tr>;
    })}</tbody></table></TableWrap><p className="text-xs text-muted">Unit costs are inclusive. Inventory changes only for confirmed receipts; branch attribution does not create a separate warehouse balance.</p></section>
    {(order.notes || order.delivery_instructions) && <section className="space-y-2 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Notes and delivery</h2><p className="whitespace-pre-wrap text-sm">{order.notes}</p><p className="whitespace-pre-wrap text-sm text-muted">{order.delivery_instructions}</p></section>}
    <section className="space-y-3"><h2 className="pesaa-card-title">Attachments</h2><FinancialError error={attachments.error} />{attachments.isLoading ? <PageLoader variant="compact" /> : <ul className="flex flex-wrap gap-2">{attachments.data?.map(file => <li key={file.id}><Button variant="outline" size="sm" onClick={async () => {try {await procurementApi.downloadAttachment(id, file.id);} catch (cause) {setError(cause);}}}>{file.name} · {Math.ceil(file.size / 1024)} KB</Button></li>)}</ul>}{!attachments.isLoading && !attachments.data?.length && <p className="text-sm text-muted">No attachments.</p>}</section>
    <ReceiptList orderId={id} /><BillList orderId={id} />
    <div className="flex flex-wrap gap-4 text-sm"><Link href="/procurement/suppliers" className="text-accent hover:underline">Supplier directory</Link>{order.supplier_id && <Link href={`/procurement/orders?supplier_id=${order.supplier_id}`} className="text-accent hover:underline">Supplier purchase history</Link>}<Link href="/procurement/returns" className="text-accent hover:underline">Purchase returns</Link></div>
    <section className="space-y-3"><h2 className="pesaa-card-title">Activity</h2>{activity.isLoading ? <PageLoader variant="compact" /> : activity.error ? <FinancialError error={activity.error} /> : <><ul className="divide-y divide-border rounded-xl border border-border bg-card">{activity.data?.items.map(item => <li key={item.id} className="p-4 text-sm"><p>{item.summary}</p><p className="mt-1 text-xs text-muted">{fmtDateTime(item.created_at)}{item.actor ? ` · ${item.actor}` : ""}</p></li>)}</ul>{!activity.data?.items.length && <p className="text-sm text-muted">No recorded activity for this historical purchase.</p>}<Pagination page={activityPage} pageSize={25} total={activity.data?.total || 0} onPageChange={setActivityPage} itemLabel="events" /></>}</section>
  </div>;
}
