"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { useExpenseDetail, useExpensePay, useExpenseReclassify, useExpenseRefund, useExpenseReverse } from "@/lib/api/hooks";
import { AccountPicker } from "@/components/accounting/FinancialShared";
import { Input, Select, Textarea } from "@/components/ui/Form";
import { expenseWorkspaceApi } from "@/lib/api/expenseWorkspace";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/hr/State";
import { FinancialError, FinancialPagination } from "@/components/accounting/FinancialShared";
import { useExpenseContext } from "./ExpenseShared";
export function ExpenseDetails({ id, onClose, onEdit, onAction, busy }: { id: string; onEdit: () => void; onClose: () => void; onAction: (id: string, action: string) => void; busy: boolean }) {
  const { scope, can, money } = useExpenseContext();
  const [page, setPage] = useState(1);
  const query = useExpenseDetail(id, page, scope, can("read"));
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);
  const record = query.data?.record;
  const reverse = useExpenseReverse();
  const reclassify = useExpenseReclassify(), pay = useExpensePay(), refund = useExpenseRefund();
  const [panel, setPanel] = useState<null | "reclassify" | "refund" | "pay">(null);
  const [fields, setFields] = useState({ account: "", reason: "", amount: "", method: "Cash" });
  const [panelError, setPanelError] = useState<unknown>(null);
  const runPanel = async () => { setPanelError(null); try {
    if (panel === "reclassify") await reclassify.mutateAsync({ id, account_id: fields.account, reason: fields.reason.trim() });
    else if (panel === "refund") await refund.mutateAsync({ id, amount: fields.amount, method: fields.method, reason: fields.reason.trim() });
    else if (panel === "pay") await pay.mutateAsync({ id, method: fields.method });
    setPanel(null); setFields({ account: "", reason: "", amount: "", method: "Cash" });
  } catch (cause) { setPanelError(cause); } };
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState("");
  const [reverseError, setReverseError] = useState<unknown>(null);
  return <Drawer open onClose={() => { if (!busy) onClose(); }} title="Expense details" description={record?.reference} size="lg">
    <div className="space-y-5 p-5">{query.isLoading ? <PageLoader variant="compact" /> : query.error ? <FinancialError error={query.error} /> : record && <>
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{record.title}</h2><p className="mt-2 text-2xl font-bold text-accent tabular-nums">{money(record.amount, record.currency_code || undefined)}</p></div><StatusBadge status={record.status} /></div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-border py-4">{[["Date", record.expense_date], ["Category", record.category], ["Payment method", record.payment_method], ["Payment reference", record.reference_number || "—"], ["Supplier", query.data?.supplier || "—"], ["Expense account", record.account?.name || "Default expense account"]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-muted">{label}</dt><dd className="mt-1 break-words text-xs font-medium">{value}</dd></div>)}</dl>
      {record.notes && <div><h3 className="text-xs font-semibold">Notes</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">{record.notes}</p></div>}
      <div><h3 className="mb-2 text-xs font-semibold">Receipt</h3>{record.receipt_name ? <Button variant="outline" disabled={downloading} onClick={async () => { setDownloading(true); setDownloadError(null); try { await expenseWorkspaceApi.receipt(record.id, record.receipt_name!); } catch (error) { setDownloadError(error); } finally { setDownloading(false); } }}><Download size={14} />{downloading ? "Downloading…" : record.receipt_name}</Button> : <p className="text-xs text-muted">No receipt attached.</p>}<FinancialError error={downloadError} /></div>
      <section className="border-t border-border pt-4"><h3 className="mb-3 text-xs font-semibold">Activity history</h3><ul className="space-y-4">{query.data?.history.map((event, index) => <li key={`${event.date}:${index}`} className="border-l-2 border-accent/20 pl-3"><p className="text-xs">{event.summary}</p><p className="mt-1 text-[11px] text-muted">{event.actor || "System"} · {new Date(event.date).toLocaleString()}</p></li>)}</ul>{!query.data?.history.length && <p className="text-xs text-muted">No recorded activity.</p>}{(query.data?.history_total ?? 0) > 20 && <FinancialPagination page={page} size={20} total={query.data!.history_total} onPage={setPage} />}</section>
      {record.on_credit && record.status === "Approved" && <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">{record.paid_at ? `Paid on ${new Date(record.paid_at).toLocaleDateString()}` : "Booked as unpaid: it is owed to the supplier until you record the payment."}</p>}
      {Number(record.refunded_amount ?? 0) > 0 && <p className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">Refunded by the supplier: {money(Number(record.refunded_amount), record.currency_code || undefined)}</p>}
      {record.status === "Approved" && can("approve") && <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {record.on_credit && !record.paid_at && <Button variant="outline" onClick={() => setPanel("pay")}>Record payment</Button>}
        <Button variant="outline" onClick={() => setPanel("reclassify")}>Change category / account</Button>
        <Button variant="outline" onClick={() => setPanel("refund")}>Record supplier refund</Button>
      </div>}
      {panel && <section className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="text-xs font-semibold">{panel === "reclassify" ? "Move this expense to another account" : panel === "refund" ? "Record a supplier refund or credit note" : "Record the payment"}</h3>
        <p className="text-xs text-muted">{panel === "reclassify" ? "An adjusting entry moves the amount. The original entry stays." : panel === "refund" ? "The money received is booked against this expense." : "Choose where the money is paid from."}</p>
        {panel === "reclassify" && <label className="block text-xs font-medium">New expense account<AccountPicker label="New expense account" type="Expense" optional={false} required value={fields.account} onChange={value => setFields({ ...fields, account: value })} /></label>}
        {panel === "refund" && <label className="block text-xs font-medium">Amount refunded<Input aria-label="Refund amount" type="number" min="0" step="0.01" value={fields.amount} onChange={e => setFields({ ...fields, amount: e.target.value })} /></label>}
        {panel !== "reclassify" && <label className="block text-xs font-medium">{panel === "pay" ? "Paid from" : "Received into"}<Select aria-label="Method" value={fields.method} onChange={e => setFields({ ...fields, method: e.target.value })}><option>Cash</option><option>Bank Transfer</option><option>Mobile Money</option></Select></label>}
        {panel !== "pay" && <label className="block text-xs font-medium">Reason (required)<Textarea aria-label="Reason" rows={2} maxLength={500} value={fields.reason} onChange={e => setFields({ ...fields, reason: e.target.value })} /></label>}
        <FinancialError error={panelError} />
        <div className="flex gap-2"><Button variant="outline" onClick={() => { setPanel(null); setPanelError(null); }}>Cancel</Button><Button disabled={reclassify.isPending || pay.isPending || refund.isPending || (panel === "reclassify" && (!fields.account || fields.reason.trim().length < 3)) || (panel === "refund" && (!fields.amount || fields.reason.trim().length < 3))} onClick={() => void runPanel()}>Save</Button></div>
      </section>}
      {record.status === "Approved" && can("approve") && (reversing
        ? <section className="space-y-3 border-t border-border pt-4"><h3 className="text-xs font-semibold">Reverse this expense</h3>
          <p className="text-xs leading-relaxed text-muted">The original entry stays in the books. A reversing entry is added dated today, and the reason is recorded in the audit trail. To correct an amount, reverse it and record the expense again.</p>
          <label className="block text-xs font-medium">Reason (required)<Textarea aria-label="Reason" rows={3} maxLength={500} autoFocus value={reason} onChange={e => setReason(e.target.value)} /></label>
          <FinancialError error={reverseError} />
          <div className="flex gap-2"><Button variant="outline" disabled={reverse.isPending} onClick={() => { setReversing(false); setReason(""); setReverseError(null); }}>Cancel</Button>
            <Button disabled={reverse.isPending || reason.trim().length < 3} onClick={async () => { setReverseError(null); try { await reverse.mutateAsync({ id, reason: reason.trim() }); setReversing(false); setReason(""); } catch (error) { setReverseError(error); } }}>{reverse.isPending ? "Reversing…" : "Reverse expense"}</Button></div></section>
        : <div className="border-t border-border pt-4"><Button variant="outline" onClick={() => setReversing(true)}>Reverse expense</Button></div>)}
      {record.status === "Reversed" && <p className="rounded-lg bg-muted/10 p-3 text-xs text-muted">Reversed{record.reversal_reason ? `: ${record.reversal_reason}` : ""}. The original entry and its reversing entry both remain in the ledger.</p>}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">{record.status === "Pending" && can("update") && <><Button variant="outline" disabled={busy} onClick={onEdit}>Edit Expense</Button><Button disabled={busy} onClick={() => onAction(id, "approve")}>Approve</Button><Button variant="outline" disabled={busy} onClick={() => onAction(id, "reject")}>Reject</Button></>}{record.status !== "Approved" && can("delete") && <Button variant="outline" disabled={busy} onClick={() => onAction(id, "delete")}>Delete</Button>}</div>
    </>}</div>
  </Drawer>;
}
