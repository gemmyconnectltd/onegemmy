"use client";
import { useState } from "react";
import { useFinancialInvoice, useFinancialBill, useFinancialBillPayment, useCurrentTenant } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { InvoiceDocument } from "./InvoiceDocument";
import { RecordPaymentDrawer } from "./RecordPaymentDrawer";
import { FinancialError, useFinancialMoney } from "./FinancialShared";
export function SourceDocumentDetail({ id, payable, onClose }: { id: string; payable: boolean; onClose: () => void }) {
  const invoice = useFinancialInvoice(payable ? null : id), bill = useFinancialBill(payable ? id : null), tenant = useCurrentTenant();
  const { brandColor } = useAppConfig(); const { hasPermission } = useAuth();
  const [payment, setPayment] = useState(false);
  const [key] = useState(() => `SUP-${crypto.randomUUID()}`);
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState("bank");
  const pay = useFinancialBillPayment();
  const money = useFinancialMoney(payable ? bill.data?.currency_code || undefined : invoice.data?.currency_code || undefined);
  const q = payable ? bill : invoice;
  return <><Drawer open onClose={onClose} title={payable ? "Supplier bill" : "Customer invoice"} size="xl"><div className="space-y-4 p-5"><FinancialError error={q.error || pay.error} />{q.isFetching ? <PageLoader variant="compact" /> : payable && bill.data ? <><h2 className="text-lg font-bold">{bill.data.reference}</h2><p className="text-sm">{bill.data.supplier_name || "Supplier"} · {bill.data.po_reference} · {bill.data.bill_date}</p><dl className="grid grid-cols-2 gap-4 rounded-xl border border-border p-4 text-sm"><dt>Total</dt><dd className="text-right">{money(bill.data.amount)}</dd><dt>Paid</dt><dd className="text-right">{money(bill.data.amount_paid)}</dd><dt>Outstanding</dt><dd className="text-right font-bold">{money(bill.data.balance)}</dd><dt>Status</dt><dd className="text-right">{bill.data.status}</dd></dl>{Number(bill.data.balance) > 0 && hasPermission("accounts_payable:create") && <form className="space-y-4 rounded-xl border border-border p-4" onSubmit={e => { e.preventDefault(); pay.mutate({ id, data: { amount, payment_method: method, client_reference: key, currency_code: bill.data?.currency_code || undefined } }, { onSuccess: () => setAmount("") }); }}><h3 className="text-sm font-semibold">Record supplier payment</h3><p className="text-xs text-muted">Amount is in the bill currency. The existing supplier settlement service posts the payment and any exchange difference.</p><Field label="Payment amount"><Input required type="number" min="0.01" step="0.01" max={Number(bill.data.balance)} value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field label="Payment method"><Select value={method} onChange={e => setMethod(e.target.value)}><option value="bank">Bank</option><option value="cash">Cash</option><option value="mobile_money">Mobile money</option></Select></Field><Button disabled={pay.isPending || pay.isSuccess}>{pay.isPending ? "Recording…" : pay.isSuccess ? "Payment recorded — reopen for another" : "Record payment"}</Button></form>}</> : invoice.data && <><InvoiceDocument order={invoice.data} tenant={tenant.data} brandColor={brandColor} fmt={money} />{invoice.data.payment_status !== "Paid" && hasPermission("accounts_receivable:create") && <Button onClick={() => setPayment(true)}>Record customer payment</Button>}</>}</div></Drawer>{payment && invoice.data && <RecordPaymentDrawer order={invoice.data} onClose={() => setPayment(false)} color={brandColor} fmt={money} />}</>;
}
