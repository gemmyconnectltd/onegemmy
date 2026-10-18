"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { billingApi, useBillingConfirm, useBillingPreview } from "@/lib/api/hooks";
import type { BillingQuote, ChangePlanInput } from "@/lib/api/billing";
import { currencyDecimals, formatMoney } from "@/lib/money";

export const billingMoney = (amount: number, currency: string) => formatMoney(amount / 10 ** currencyDecimals(currency), currency);
export const billingDate = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
export function BillingStatus({ value }: { value: string }) {
  const cls = ["active", "paid", "succeeded"].includes(value) ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ["failed", "overdue", "suspended", "past_due"].includes(value) ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-surface text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${cls}`}>{value.replaceAll("_", " ")}</span>;
}
export function BillingError({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as { detail?: string; message?: string };
  return <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{e.detail || e.message || "Could not complete this billing request. Please retry."}</p>;
}
export function BillingPagination({ page, total, onPage, size = 20 }: { page: number; total: number; onPage: (p: number) => void; size?: number }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted"><span>{total} records · Page {page} of {Math.max(1, Math.ceil(total / size))}</span><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page * size >= total} onClick={() => onPage(page + 1)}>Next</Button></div></div>;
}
export function PlanChange({ input, tenantId, onClose, onDone }: { input: ChangePlanInput; tenantId?: string; onClose: () => void; onDone: () => void }) {
  const preview = useBillingPreview();
  const confirm = useBillingConfirm();
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  return <Drawer open title="Review plan change" onClose={onClose} side="center" size="lg"><div className="space-y-4 p-5">
    <p className="text-sm text-muted">Get a current quote before confirming. Existing invoices remain due.</p>
    <BillingError error={preview.error || confirm.error} />
    {!quote ? <Button disabled={preview.isPending} onClick={async () => { try { const r = await preview.mutateAsync({ data: input, tenantId }); setQuote(r.data); } catch { /* mutation displays error */ } }}>Calculate financial impact</Button> : <>
      <h3 className="text-sm font-bold">{quote.plan_name} · {quote.cycle}</h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt className="text-muted">Recurring subtotal</dt><dd className="text-right">{billingMoney(quote.subtotal, quote.currency)}</dd>
        <dt className="text-muted">Tax per cycle</dt><dd className="text-right">{billingMoney(quote.tax, quote.currency)}</dd>
        <dt className="text-muted">Recurring total</dt><dd className="text-right font-semibold">{billingMoney(quote.recurring, quote.currency)}</dd>
        <dt className="text-muted">Prorated adjustment</dt><dd className="text-right">{billingMoney(quote.adjustment, quote.currency)}</dd>
        <dt className="text-muted">Credit applied / added</dt><dd className="text-right">{billingMoney(quote.credit_applied, quote.currency)} / {billingMoney(quote.credit_added, quote.currency)}</dd>
        <dt className="font-semibold">Due now</dt><dd className="text-right font-bold">{billingMoney(quote.due_now, quote.currency)}</dd>
        <dt className="text-muted">Effective date</dt><dd className="text-right">{billingDate(quote.effective_at)} UTC</dd>
        <dt className="text-muted">Next billing date</dt><dd className="text-right">{billingDate(quote.period_end)} UTC</dd>
        <dt className="text-muted">Billable users / branches</dt><dd className="text-right">{quote.seats} / {quote.branches}</dd>
      </dl>
      {quote.trial && <p className="text-xs text-muted">Your free trial ends on the next billing date shown above.</p>}
      <p className="text-xs text-muted">Quote expires {new Date(quote.expires_at).toISOString().slice(11, 16)} UTC. Confirming creates an invoice when payment is due.</p>
      <Button disabled={confirm.isPending} onClick={async () => { try { await confirm.mutateAsync({ quoteId: quote.quote_id, key, tenantId }); onDone(); } catch { /* mutation displays error */ } }}>{confirm.isPending ? "Confirming…" : "Confirm plan change"}</Button>
    </>}
    {preview.isPending && <PageLoader variant="compact" />}
  </div></Drawer>;
}
export function DownloadInvoice({ id, receipt }: { id: string; receipt?: string }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return <><Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await billingApi.pdf(id, receipt); } catch (e) { setError(e); } finally { setBusy(false); } }}>{busy ? "Downloading…" : receipt ? "Receipt" : "Download PDF"}</Button><BillingError error={error} /></>;
}
