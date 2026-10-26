"use client";

import { useState } from "react";
import { CreditCard, Receipt, Users, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Drawer } from "@/components/ui/Drawer";
import { PageLoader } from "@/components/ui/PageLoader";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import {
  useBillingOverview, useBillingRecords, useBillingMethods, useBillingAction,
  useBillingPay, useBillingRefresh, useBillingDetail,
} from "@/lib/api/hooks";
import type { BillingInvoice, ChangePlanInput } from "@/lib/api/billing";
import { BillingError, BillingPagination, BillingStatus, billingDate, billingMoney, DownloadInvoice, PlanChange } from "./BillingShared";

function InvoicePanel({ invoice, onClose, canManage }: { invoice: BillingInvoice; onClose: () => void; canManage: boolean }) {
  const methods = useBillingMethods();
  const pay = useBillingPay();
  const refresh = useBillingRefresh();
  const latest = useBillingDetail("invoices", invoice.id);
  const payments = useBillingRecords("payments", { page: 1, page_size: 20, invoice_id: invoice.id });
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const item = latest.data ?? invoice;
  const available = methods.data?.methods.filter(m => m.currency === item.currency) ?? [];
  const payment = payments.data?.items.find(p => p.invoice_id === item.id);
  const pending = payment && ["pending", "processing"].includes(payment.status);
  return <Drawer open title={item.number} onClose={onClose} size="lg"><div className="space-y-5 p-5">
    <BillingStatus value={item.status} />
    <p className="text-xs text-muted">{billingDate(item.period_start)} – {billingDate(item.period_end)} · Due {billingDate(item.due_at)} UTC</p>
    <div className="divide-y divide-border">{item.lines.map((line, i) => <div key={i} className="flex justify-between gap-4 py-3 text-sm"><span>{line.description}</span><span>{billingMoney(line.amount, item.currency)}</span></div>)}</div>
    <dl className="grid grid-cols-2 gap-3 text-sm"><dt>Subtotal</dt><dd className="text-right">{billingMoney(item.subtotal, item.currency)}</dd><dt>Tax</dt><dd className="text-right">{billingMoney(item.tax, item.currency)}</dd><dt>Total</dt><dd className="text-right font-bold">{billingMoney(item.total, item.currency)}</dd><dt>Paid</dt><dd className="text-right">{billingMoney(item.paid, item.currency)}</dd><dt>Outstanding</dt><dd className="text-right font-bold">{billingMoney(item.total - item.paid, item.currency)}</dd></dl>
    <DownloadInvoice id={item.id} />
    <BillingError error={methods.error || pay.error || refresh.error || latest.error} />
    {payment && <div className="space-y-2 rounded-xl border border-border p-3"><BillingStatus value={payment.status} /><p className="break-all text-xs text-muted">Reference: {payment.reference}</p>{payment.status === "succeeded" ? <DownloadInvoice id={item.id} receipt={payment.reference} /> : <Button variant="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate(payment.reference)}>Check payment status</Button>}</div>}
    {item.total > item.paid && canManage && !pending && <form className="space-y-3 border-t border-border pt-4" onSubmit={async e => { e.preventDefault(); const idempotencyKey = payment?.status === "failed" ? crypto.randomUUID() : key ?? crypto.randomUUID(); setKey(idempotencyKey); try { await pay.mutateAsync({ id: item.id, phone, provider: network, key: idempotencyKey }); } catch { /* error shown */ } }}>
      <h3 className="text-sm font-bold">Pay with mobile money</h3>
      {available.length ? <><Field label="Mobile money provider"><Select required value={network} onChange={e => { setNetwork(e.target.value); setKey(null); }}><option value="">Choose provider</option>{available.map(m => <option key={m.provider} value={m.provider}>{m.name} · {m.country}</option>)}</Select></Field><Field label="Phone number" hint="Country code and number, digits only."><Input required type="tel" autoComplete="tel" pattern="[1-9][0-9]{7,14}" value={phone} onChange={e => { setPhone(e.target.value); setKey(null); }} placeholder="2507…" /></Field><p className="text-xs text-muted">Approve the request on your phone. Payment is confirmed after provider verification.</p><Button type="submit" disabled={pay.isPending || !phone || !network}>{pay.isPending ? "Requesting…" : `Pay ${billingMoney(item.total - item.paid, item.currency)}`}</Button></> : <p className="text-sm text-muted">No payment provider is currently available for this invoice currency. Contact Pesaa support.</p>}
    </form>}
    {pending && <p role="status" className="text-sm text-muted">Approve the request on your phone, then check payment status. Please don’t submit another payment while this one is processing.</p>}
  </div></Drawer>;
}

export function TenantBilling() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("billing:read");
  const canManage = hasPermission("billing:update");
  if (!canRead) return <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">You need billing access to view this page. Ask your business owner.</p>;
  return <BillingContent canManage={canManage} />;
}

function BillingContent({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState("Overview");
  const [page, setPage] = useState(1);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [change, setChange] = useState<ChangePlanInput | null>(null);
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const overview = useBillingOverview();
  const plans = useBillingRecords("plans", { page, page_size: 20 }, tab === "Plans");
  const invoices = useBillingRecords("invoices", { page, page_size: 20 }, tab === "Invoices");
  const methods = useBillingMethods();
  const action = useBillingAction();
  const { confirm, dialog } = useConfirmDialog();
  const sub = overview.data?.subscription;
  const error = overview.error || (tab === "Plans" ? plans.error : tab === "Invoices" ? invoices.error : null);
  const cancel = () => confirm({ title: sub?.cancel_at_end ? "Keep your subscription?" : "Cancel at period end?", message: sub?.cancel_at_end ? "Your current subscription will continue renewing." : "Your subscription will end after the current billing period. Outstanding invoices remain due and historical records stay readable.", danger: !sub?.cancel_at_end, onConfirm: () => action.mutate({ data: { action: sub?.cancel_at_end ? "reactivate" : "cancel", reason: "Business requested subscription change", at_period_end: true }, key: crypto.randomUUID() }) });
  if (overview.error && !overview.data) return <div className="space-y-4"><h1 className="text-[22px] font-bold">Subscription & Billing</h1><BillingError error={overview.error} /><Button variant="secondary" onClick={() => void overview.refetch()}>Try again</Button></div>;
  return <div className="space-y-5">
    <div className="flex items-center gap-3"><CreditCard size={22} className="text-accent" /><div><h1 className="text-[22px] font-bold tracking-tight">Subscription & Billing</h1><p className="mt-0.5 text-sm text-muted">Manage your Pesaa subscription and billing.</p></div></div>
    <nav aria-label="Plans and billing" className="flex overflow-x-auto border-b border-border">{["Overview", "Plans", "Invoices", "Payment Methods"].map(t => <button key={t} onClick={() => { setTab(t); setPage(1); }} aria-current={tab === t ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-4 py-3 text-[13px] font-semibold ${tab === t ? "border-accent text-accent" : "border-transparent text-muted"}`}>{t}</button>)}</nav>
    <BillingError error={error || action.error} />
    {overview.isLoading ? <PageLoader variant="compact" /> : tab === "Overview" ? <>
      <section className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs text-muted">Current plan</p><h2 className="mt-1 text-xl font-bold">{overview.data?.plan_name ?? overview.data?.legacy_plan ?? "No subscription"}</h2>{sub ? <div className="mt-2"><BillingStatus value={sub.status} /></div> : <p className="mt-2 text-sm text-muted">{overview.data?.enrollment_required ? "Choose a plan to activate your business. Your account and billing history stay available." : "Your existing business access is unchanged. Choose a plan to start managed billing."}</p>}</div>{sub && <div className="text-right"><p className="text-xl font-bold">{billingMoney(sub.recurring, sub.currency)}</p><p className="text-xs text-muted">per {sub.cycle === "annual" ? "year" : "month"}, including configured tax</p><p className="mt-2 text-xs text-muted">Next billing: {billingDate(sub.period_end)} UTC</p></div>}</div>
      <div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => { setTab("Plans"); setPage(1); }} disabled={!canManage}>Change plan</Button>{sub && !["canceled", "expired"].includes(sub.status) && <Button variant="secondary" disabled={!canManage || action.isPending} onClick={cancel}>{sub.cancel_at_end ? "Keep subscription" : "Manage subscription"}</Button>}<Button variant="secondary" onClick={() => { setTab("Invoices"); setPage(1); }}>View invoices</Button></div>{sub?.cancel_at_end && <p className="mt-3 text-xs text-muted">Cancellation scheduled for {billingDate(sub.period_end)}.</p>}</section>
      <div className="grid gap-4 sm:grid-cols-2"><section className="rounded-xl border border-border bg-card p-4"><Users size={17} className="mb-2 text-accent" /><h3 className="text-sm font-semibold">Users</h3><p className="mt-2 text-sm">{overview.data?.usage.users ?? 0} active · {sub?.terms.included_users ?? "—"} included</p><p className="mt-1 text-xs text-muted">{sub?.terms.bill_active_users ? "Active users, including owners and admins, are billable." : "Seat billing is not enabled for this agreement."}</p></section><section className="rounded-xl border border-border bg-card p-4"><Building2 size={17} className="mb-2 text-accent" /><h3 className="text-sm font-semibold">Branches</h3><p className="mt-2 text-sm">{overview.data?.usage.branches ?? 0} active · {sub?.terms.included_branches ?? "—"} included</p></section></div>
      <section className="rounded-xl border border-border bg-card p-4"><h3 className="text-sm font-bold">Outstanding balance</h3>{overview.data?.outstanding.length ? <div className="mt-3 flex flex-wrap items-center gap-4">{overview.data.outstanding.map(o => <span key={o.currency} className="font-semibold">{billingMoney(o.amount, o.currency)}</span>)}<Button onClick={() => { setTab("Invoices"); setPage(1); }}>Pay outstanding invoice</Button></div> : <p className="mt-2 text-sm text-muted">No outstanding invoices.</p>}</section>
    </> : tab === "Plans" ? <>
      <div className="flex items-center gap-3"><span className="text-sm text-muted">Billing cycle</span><Select aria-label="Billing cycle" className="max-w-40" value={cycle} onChange={e => setCycle(e.target.value as typeof cycle)}><option value="monthly">Monthly</option><option value="annual">Yearly</option></Select></div>
      {plans.isLoading ? <PageLoader variant="compact" /> : <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.data?.items.map(p => <article key={p.id} className="flex flex-col rounded-xl border border-border bg-card p-5"><h2 className="text-base font-bold">{p.name}</h2><p className="mt-1 text-sm text-muted">{p.description}</p>{p.prices.map(price => <div key={price.currency} className="mt-4 space-y-3 border-t border-border pt-4"><p className="text-xl font-bold">{billingMoney(cycle === "annual" ? price.annual : price.monthly, price.currency)}<span className="text-xs font-normal text-muted"> /{cycle === "annual" ? "year" : "month"} before tax</span></p><p className="text-xs text-muted">{price.included_users} included users · {price.included_branches} included branches</p><p className="text-xs text-muted">Extra user: {billingMoney(price.seat_monthly, price.currency)}/month · Extra branch: {billingMoney(price.branch_monthly, price.currency)}/month</p><div className="flex flex-wrap gap-1">{price.modules.map(m => <span key={m} className="rounded bg-surface px-2 py-1 text-[11px] text-muted">{m}</span>)}</div>{price.trial_days > 0 && <p className="text-xs text-muted">{price.trial_days}-day trial for new subscriptions</p>}<Button disabled={!canManage || (sub?.plan_id === p.id && !["canceled", "expired"].includes(sub.status) && sub.currency === price.currency && sub.cycle === cycle)} onClick={() => setChange({ plan_id: p.id, currency: price.currency, cycle })}>{sub?.plan_id === p.id && !["canceled", "expired"].includes(sub.status) && sub.currency === price.currency && sub.cycle === cycle ? "Current plan" : "Review plan"}</Button></div>)}</article>)}</div>}
      {plans.data?.total === 0 && <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">No plans are currently published. Contact Pesaa support.</p>}<BillingPagination page={page} total={plans.data?.total ?? 0} onPage={setPage} />
    </> : tab === "Invoices" ? <>
      {invoices.isLoading ? <PageLoader variant="compact" /> : <div className="divide-y divide-border rounded-xl border border-border bg-card">{invoices.data?.items.map(i => <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><Receipt size={17} className="text-muted" /><div><p className="text-sm font-semibold">{i.number}</p><p className="text-xs text-muted">{billingDate(i.created_at)} · Due {billingDate(i.due_at)}</p></div></div><div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold">{billingMoney(i.total, i.currency)}</span><BillingStatus value={i.status} /><Button variant="secondary" onClick={() => setInvoice(i)}>View{canManage && i.paid < i.total ? " / Pay" : ""}</Button></div></div>)}{invoices.data?.total === 0 && <p className="p-5 text-sm text-muted">No subscription invoices yet.</p>}</div>}<BillingPagination page={page} total={invoices.data?.total ?? 0} onPage={setPage} />
    </> : <section className="space-y-3 rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-bold">Mobile money through pawaPay</h2><BillingError error={methods.error} />{methods.isLoading ? <PageLoader variant="compact" /> : methods.error && !methods.data ? null : <><p className="text-sm text-muted">{methods.data?.configured ? `Connected in ${methods.data.mode} mode.` : "Payments are not configured yet."}</p><div className="flex flex-wrap gap-2">{methods.data?.methods.map(m => <span key={`${m.provider}-${m.currency}`} className="rounded-lg border border-border px-3 py-2 text-xs">{m.name} · {m.country} · {m.currency}</span>)}</div><p className="text-xs text-muted">Pay from an invoice using an available mobile money provider. Saved cards and automatic wallet debits are not offered.</p></>}</section>}
    {change && <PlanChange input={change} onClose={() => setChange(null)} onDone={() => { setChange(null); setTab("Overview"); }} />}
    {invoice && <InvoicePanel invoice={invoice} canManage={canManage} onClose={() => setInvoice(null)} />}{dialog}
  </div>;
}
