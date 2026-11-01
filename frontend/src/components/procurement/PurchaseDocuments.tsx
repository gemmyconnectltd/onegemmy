"use client";
import { useState } from "react";
import Link from "next/link";
import { useAppConfig } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { useGoodsReceipts, usePurchasingBills, usePurchasingBill, usePurchasingPayments, usePayPurchasingBill, usePurchaseOrder, useUpdatePurchasingBill } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/Pagination";
import { TableWrap } from "@/components/ui/Table";
import { Drawer } from "@/components/ui/Drawer";
import { FinancialError } from "@/components/accounting/FinancialShared";
import { DebtPaymentForm } from "@/components/debts/DebtPaymentForm";
import { PurchaseHeader, PurchaseStatus, usePurchasingScope } from "./PurchaseShared";

export function ReceiptList({orderId}: {orderId?: string}) {
  const [page, setPage] = useState(1); const scope = usePurchasingScope();
  const query = useGoodsReceipts(page, scope, orderId); const {currency} = useAppConfig();
  return <section className="space-y-3"><h2 className="pesaa-card-title">Goods receipts</h2>
    {query.isLoading ? <PageLoader variant="compact" /> : query.error ? <FinancialError error={query.error} /> : <>
      <TableWrap><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{["Receipt", "Purchase order", "Supplier", "Received", "Lines", "Value", "Status"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{query.data?.items.map(receipt => <tr key={receipt.id}><td className="p-4 font-medium">{receipt.reference}</td><td className="p-4"><Link className="text-accent hover:underline" href={`/procurement/orders/${receipt.purchase_order_id}`}>{receipt.po_reference}</Link></td><td className="p-4">{receipt.supplier_name || "—"}</td><td className="p-4">{fmtDateTime(receipt.received_at)}</td><td className="p-4">{receipt.lines.length}</td><td className="p-4 tabular-nums">{formatMoney(Number(receipt.amount), receipt.currency_code || currency, {showCode: true})}</td><td className="p-4"><PurchaseStatus status="Received" /></td></tr>)}</tbody></table></TableWrap>
      {!query.data?.items.length && <p className="text-sm text-muted">No recorded receipts. Historical deliveries remain visible on their purchase orders.</p>}
      <Pagination page={page} pageSize={25} total={query.data?.total || 0} onPageChange={setPage} itemLabel="receipts" />
    </>}
  </section>;
}

export function BillList({orderId}: {orderId?: string}) {
  const [page, setPage] = useState(1), [status, setStatus] = useState(""); const scope = usePurchasingScope();
  const {hasPermission} = useAuth(); const allowed = hasPermission("accounts_payable:read");
  const query = usePurchasingBills(page, scope, orderId, status || undefined, allowed); const {currency} = useAppConfig();
  if (!allowed) return <p className="text-sm text-muted">Accounts payable read permission is required to view supplier bills.</p>;
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="pesaa-card-title">Supplier bills</h2><Select aria-label="Bill payment status" className="w-auto!" value={status} onChange={event => {setStatus(event.target.value); setPage(1);}}><option value="">All statuses</option><option value="Unpaid">Unpaid</option><option value="PartiallyPaid">Partially paid</option><option value="Paid">Paid</option></Select></div>
    {query.isLoading ? <PageLoader variant="compact" /> : query.error ? <FinancialError error={query.error} /> : <>
      <TableWrap><table className="w-full min-w-[850px] text-left text-sm"><thead><tr>{["Bill", "Supplier", "Purchase order", "Bill date", "Due date", "Total", "Paid", "Outstanding", "Status"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{query.data?.items.map(bill => <tr key={bill.id}><td className="p-4"><Link className="font-medium text-accent hover:underline" href={`/procurement/bills/${bill.id}`}>{bill.reference}</Link></td><td className="p-4">{bill.supplier_name || "—"}</td><td className="p-4"><Link href={`/procurement/orders/${bill.purchase_order_id}`} className="hover:text-accent">{bill.po_reference}</Link></td><td className="p-4">{fmtDate(bill.bill_date)}</td><td className="p-4">{fmtDate(bill.due_date)}</td>{[bill.amount, bill.amount_paid, bill.balance].map((amount, index) => <td key={index} className="p-4 text-right tabular-nums">{formatMoney(amount, bill.currency_code || currency, {showCode: true})}</td>)}<td className="p-4"><PurchaseStatus status={bill.is_overdue ? "Overdue" : bill.status} /></td></tr>)}</tbody></table></TableWrap>
      {!query.data?.items.length && <p className="text-sm text-muted">No supplier bills match. Confirm a goods receipt to post a bill for that delivery.</p>}
      <Pagination page={page} pageSize={25} total={query.data?.total || 0} onPageChange={setPage} itemLabel="bills" />
    </>}
  </section>;
}

export function PurchasingBillDetails({id}: {id: string}) {
  const [paymentPage, setPaymentPage] = useState(1);
  const scope = usePurchasingScope(), query = usePurchasingBill(id, scope), payments = usePurchasingPayments(id, scope, paymentPage);
  const {currency} = useAppConfig(); const {hasPermission} = useAuth(); const payment = usePayPurchasingBill();
  const [paying, setPaying] = useState(false), [editing, setEditing] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState(""), [dueDate, setDueDate] = useState("");
  const updateBill = useUpdatePurchasingBill();
  const bill = query.data;
  const order = usePurchaseOrder(bill?.purchase_order_id, undefined, scope);
  if (query.isLoading) return <PageLoader />;
  if (query.error || !bill) return <FinancialError error={query.error || {detail: "Supplier bill not found"}} />;
  const code = bill.currency_code || currency;
  const money = (amount: number) => formatMoney(amount, code, {showCode: true});
  return <div className="space-y-5"><PurchaseHeader title={bill.reference} description={`${bill.supplier_name || "Supplier"} · ${bill.po_reference || "Purchase"}`} actions={<>{hasPermission("accounts_payable:update") && <Button variant="outline" onClick={() => {setInvoiceRef(bill.supplier_invoice_reference || ""); setDueDate(bill.due_date || ""); setEditing(true);}}>Record supplier invoice</Button>}{bill.balance > 0 && hasPermission("accounts_payable:create") && <Button onClick={() => setPaying(true)}>Record payment</Button>}<Link href={`/procurement/orders/${bill.purchase_order_id}`}><Button variant="outline">View purchase order</Button></Link></>} />
    <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">{[["Bill date", fmtDate(bill.bill_date)], ["Due date", fmtDate(bill.due_date)], ["Bill total", money(bill.amount)], ["Outstanding", money(bill.balance)]].map(([label, value]) => <div key={label}><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}<div><PurchaseStatus status={bill.is_overdue ? "Overdue" : bill.status} /></div></section>
    {bill.supplier_invoice_reference && <p className="text-sm">Supplier invoice: {bill.supplier_invoice_reference}</p>}
    <p className="text-sm text-muted">This liability was posted for a confirmed delivery. It is separate from the purchase commitment and from payments.</p>
    {order.data && <p className="text-sm">Payment terms: {order.data.payment_terms_days == null ? "Not specified" : `Net ${order.data.payment_terms_days} days`}. <Link href="/procurement/suppliers" className="text-accent hover:underline">View suppliers</Link></p>}
    <section className="space-y-3"><h2 className="pesaa-card-title">Payment history</h2>{payments.isLoading ? <PageLoader variant="compact" /> : payments.error ? <FinancialError error={payments.error} /> : <TableWrap><table className="w-full min-w-[560px] text-left text-sm"><thead><tr>{["Reference", "Date", "Method", "Amount"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{payments.data?.items.map(item => <tr key={item.id}><td className="p-4">{item.reference}</td><td className="p-4">{fmtDateTime(item.paid_at)}</td><td className="p-4">{item.payment_method}</td><td className="p-4 text-right tabular-nums">{formatMoney(item.amount, item.currency_code || code, {showCode: true})}</td></tr>)}</tbody></table></TableWrap>}{!payments.isLoading && !payments.error && !payments.data?.items.length && <p className="text-sm text-muted">No payments recorded.</p>}<Pagination page={paymentPage} pageSize={25} total={payments.data?.total || 0} onPageChange={setPaymentPage} itemLabel="payments" /></section>
    {editing && <Drawer open title="Supplier invoice details" onClose={() => setEditing(false)}><form className="space-y-4 p-5" onSubmit={async event => {event.preventDefault(); try {await updateBill.mutateAsync({id, data: {supplier_invoice_reference: invoiceRef, due_date: dueDate || null}}); setEditing(false);} catch { /* The mutation error is displayed below. */ }}}><Field label="Supplier invoice reference" required><Input required maxLength={100} value={invoiceRef} onChange={event => setInvoiceRef(event.target.value)} /></Field><Field label="Due date"><Input type="date" min={bill.bill_date} value={dueDate} onChange={event => setDueDate(event.target.value)} /></Field><p className="text-xs text-muted">The delivery liability is already posted. Recording an invoice reference does not create another bill or journal.</p><FinancialError error={updateBill.error} /><Button type="submit" disabled={updateBill.isPending}>Save invoice details</Button></form></Drawer>}
    {paying && <Drawer open title={`Pay ${bill.reference}`} onClose={() => setPaying(false)}><div className="p-5"><DebtPaymentForm supplierMetadataSupported record={{id, kind: "payable", name: bill.supplier_name || "Supplier", reference: bill.reference, original: String(bill.amount), paid: String(bill.amount_paid), outstanding: String(bill.balance), currency: code, issue_date: bill.bill_date, due_date: bill.due_date, status: bill.status as "Unpaid" | "PartiallyPaid" | "Paid", is_overdue: false}} onCancel={() => setPaying(false)} onRecord={async data => {await payment.mutateAsync({id, data: {...data, client_reference: data.client_payment_id}}); setPaying(false);}} /></div></Drawer>}
  </div>;
}
