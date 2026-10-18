"use client";

import { currencyDecimals } from "@/lib/money";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import {
  billingApi, useBillingRecords, useBillingDetail, useBillingSavePlan, useFeatureFlags,
  useBillingReport, useBillingSettings, useBillingSaveSettings, useBillingMethods,
  useBillingAction, useBillingOverview, useBillingRefresh, useTenants, useBillingRefunds, useBillingRefund, useBillingRefreshRefund, useBillingHistory,
} from "@/lib/api/hooks";
import type { BillingKind, BillingPayment, BillingPlan, BillingTerms, BillingSettings, ChangePlanInput } from "@/lib/api/billing";
import { BillingError, BillingPagination, BillingStatus, billingMoney, billingDate, DownloadInvoice, PlanChange } from "./BillingShared";

const title = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

export function LiveBillingList({ kind, tenantId, initialPlan = "" }: { kind: BillingKind; tenantId?: string; initialPlan?: string }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [planId, setPlanId] = useState(initialPlan);
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useBillingRecords(kind, { page, page_size: 20, q, status, currency, tenant_id: tenantId, plan_id: planId,
    from_date: from ? `${from}T00:00:00Z` : undefined, to_date: to ? `${to}T23:59:59Z` : undefined });
  const refresh = useBillingRefresh();
  const [assign, setAssign] = useState(false);
  const [refund, setRefund] = useState<BillingPayment | null>(null);
  const statuses = kind === "plans" ? ["draft", "active", "archived"] : kind === "subscriptions" ? ["active", "trialing", "past_due", "suspended", "canceled"] : kind === "invoices" ? ["open", "partially_paid", "paid", "overdue", "void", "uncollectible"] : ["pending", "processing", "succeeded", "failed"];
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[22px] font-bold">{title(kind)}</h1><p className="mt-1 text-sm text-muted">{kind === "plans" ? "Versioned prices and entitlements. Existing agreements retain their prices." : "Authoritative platform subscription billing records."}</p></div>{kind === "plans" && <Link href="/plans/new"><Button>Create plan</Button></Link>}{kind === "subscriptions" && <Button onClick={() => setAssign(true)}>Assign subscription</Button>}</div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><Input aria-label="Search business or plan" placeholder="Search name…" className="max-w-64" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /><Select aria-label="Status" className="max-w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All Statuses</option>{statuses.map(s => <option key={s} value={s}>{s.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}</Select><Input aria-label="Currency filter" placeholder="Currency, e.g. RWF" className="max-w-44" maxLength={3} value={currency} onChange={e => { setCurrency(e.target.value.toUpperCase()); setPage(1); }} /><Input aria-label="Created from" type="date" className="max-w-44" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /><Input aria-label="Created through" type="date" className="max-w-44" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></div>
    {kind === "subscriptions" && <div className="max-w-xs"><PlanPicker value={planId} onChange={value => { setPlanId(value); setPage(1); }} /></div>}
    <BillingError error={rows.error || refresh.error} />
    {rows.isLoading ? <PageLoader variant="compact" /> : <div className="overflow-hidden rounded-xl border border-border bg-card"><TableScroll><table className="w-full min-w-[780px] text-left text-[13px]"><thead className="border-b border-border bg-surface text-xs text-muted"><tr><th className="px-4 py-3">{kind === "plans" ? "Plan" : "Business / Tenant ID"}</th><th className="px-4 py-3">{kind === "subscriptions" ? "Agreement" : "Reference"}</th><th className="px-4 py-3">Amount / Currency</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-border">
      {rows.data?.items.map(row => {
        if ("prices" in row) return <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.name}<p className="mt-1 text-xs font-normal text-muted">{row.description}</p></td><td className="px-4 py-3">Version {row.version}</td><td className="px-4 py-3">{row.prices.map(p => <p key={p.currency}>{billingMoney(p.monthly, p.currency)} /mo · {billingMoney(p.annual, p.currency)} /yr</p>)}</td><td className="px-4 py-3"><BillingStatus value={row.status} /></td><td className="px-4 py-3">{row.prices.map(p => <p key={p.currency} className="text-xs">{p.currency}: {p.included_users} users / {p.included_branches} branches</p>)}</td><td className="px-4 py-3"><div className="space-y-2"><Link href={`/plans/${row.id}/edit`} className="block text-accent hover:underline">Edit / Archive</Link><Link href={`/subscriptions?plan=${row.id}`} className="block text-xs text-accent hover:underline">Subscribers</Link></div></td></tr>;
        const name = row.tenant_name ?? row.tenant_id;
        if ("recurring" in row) return <tr key={row.id}><td className="px-4 py-3 font-semibold">{name}<p className="mt-1 text-[11px] font-normal text-muted">{row.tenant_id}</p></td><td className="px-4 py-3">{row.cycle} · {row.seats} users<p className="text-xs text-muted">{row.plan_name ?? row.plan_id}</p></td><td className="px-4 py-3">{billingMoney(row.recurring, row.currency)}</td><td className="px-4 py-3"><BillingStatus value={row.status} /></td><td className="px-4 py-3">Next: {billingDate(row.period_end)}</td><td className="px-4 py-3"><Link className="text-accent hover:underline" href={`/subscriptions/${row.id}`}>Manage</Link></td></tr>;
        if ("number" in row) return <tr key={row.id}><td className="px-4 py-3">{name}<p className="text-[11px] text-muted">{row.tenant_id}</p></td><td className="px-4 py-3">{row.number}<p className="text-xs text-muted">{billingDate(row.period_start)} – {billingDate(row.period_end)}</p></td><td className="px-4 py-3">{billingMoney(row.total, row.currency)}<p className="text-xs text-muted">Balance {billingMoney(row.total - row.paid, row.currency)}</p></td><td className="px-4 py-3"><BillingStatus value={row.status} /></td><td className="px-4 py-3">Due {billingDate(row.due_at)}</td><td className="px-4 py-3"><Link className="text-accent hover:underline" href={`/invoices/${row.id}`}>View invoice</Link></td></tr>;
        return <tr key={row.id}><td className="px-4 py-3">{name}<p className="text-[11px] text-muted">{row.tenant_id}</p></td><td className="break-all px-4 py-3 text-xs">{row.reference}<Link className="block text-accent" href={`/invoices/${row.invoice_id}`}>Related invoice</Link></td><td className="px-4 py-3">{billingMoney(row.amount, row.currency)}</td><td className="px-4 py-3"><BillingStatus value={row.status} /></td><td className="px-4 py-3">{row.provider} · {row.method}<p className="text-xs text-muted">{billingDate(row.created_at)}</p></td><td className="px-4 py-3">{row.status === "succeeded" ? <div className="flex flex-wrap gap-2"><DownloadInvoice id={row.invoice_id} receipt={row.reference} /><Button variant="secondary" onClick={() => setRefund(row)}>Refund</Button></div> : <Button variant="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate(row.reference)}>Reconcile</Button>}</td></tr>;
      })}
      {rows.data?.total === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted">No matching {kind}.</td></tr>}
    </tbody></table></TableScroll></div>}
    <BillingPagination page={page} total={rows.data?.total ?? 0} onPage={setPage} />
    {kind === "payments" && <LiveRefunds />}
    {refund && <RefundPanel payment={refund} onClose={() => setRefund(null)} />}
    {assign && <AssignSubscription onClose={() => setAssign(false)} />}
  </div>;
}

export function LivePlanEditor({ id }: { id?: string }) {
  const plan = useBillingDetail("plans", id ?? "");
  if (id && plan.isLoading) return <PageLoader variant="compact" />;
  if (id && !plan.data) return <BillingError error={plan.error} />;
  return <PlanForm key={id ?? "new"} plan={plan.data} />;
}

function PlanForm({ plan }: { plan?: BillingPlan }) {
  const router = useRouter();
  const save = useBillingSavePlan();
  const features = useFeatureFlags();
  const { confirm, dialog } = useConfirmDialog();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [status, setStatus] = useState<BillingPlan["status"]>(plan?.status ?? "draft");
  const [prices, setPrices] = useState<BillingTerms[]>(() => plan?.prices.map(price => { const p = { ...price }; delete p.id; delete p.version; return p; }) ?? []);
  const [key] = useState(() => crypto.randomUUID());
  const setPrice = (index: number, patch: Partial<BillingTerms>) => setPrices(p => p.map((v, i) => i === index ? { ...v, ...patch } : v));
  const submit = () => confirm({ title: plan ? "Publish a new plan version?" : "Create this plan?", message: `Existing agreements keep their prices. New subscriptions use: ${prices.map(price => `${price.currency}: ${billingMoney(price.monthly, price.currency)}/month or ${billingMoney(price.annual, price.currency)}/year before tax`).join("; ")}.`, onConfirm: () => { save.mutate({ id: plan?.id, key, data: { name, description, status, prices, expected_version: plan?.version } }, { onSuccess: () => router.push("/plans") }); } });
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}><div><h1 className="text-[22px] font-bold">{plan ? "Edit plan" : "Create plan"}</h1><p className="mt-1 text-sm text-muted">Configure prices in each selected currency. New versions preserve existing subscription agreements.</p></div><BillingError error={save.error || features.error} />
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-2"><Field label="Plan name"><Input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Status"><Select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></Select></Field><Field label="Description" className="md:col-span-2"><Textarea maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></Field></section>
    {prices.map((p, i) => <section key={i} className="space-y-4 rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">Currency price {i + 1}</h2><Button type="button" variant="ghost" onClick={() => setPrices(x => x.filter((_, n) => n !== i))}>Remove</Button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="ISO currency"><Input required pattern="[A-Z]{3}" maxLength={3} value={p.currency} onChange={e => setPrice(i, { currency: e.target.value.toUpperCase() })} /></Field>{([ ["monthly", "Monthly price"], ["annual", "Annual price"], ["seat_monthly", "Extra user / month"], ["branch_monthly", "Extra branch / month"], ["included_users", "Included users"], ["included_branches", "Included branches"], ["trial_days", "Trial days"], ["tax_bps", "Tax (%)"] ] as const).map(([field, label]) => <Field key={field} label={label}>{["monthly", "annual", "seat_monthly", "branch_monthly", "tax_bps"].includes(field) ? <DecimalInput key={`${field}-${p.currency}`} amount={p[field]} decimals={field === "tax_bps" ? 2 : currencyDecimals(p.currency)} onChange={amount => setPrice(i, { [field]: amount })} /> : <Input required type="number" min={field.startsWith("included") ? 1 : 0} step={1} value={p[field]} onChange={e => setPrice(i, { [field]: Number(e.target.value) })} />}</Field>)}{([ ["max_users", "Maximum users"], ["max_branches", "Maximum branches"], ["max_products", "Maximum products"], ["max_storage_mb", "Storage MB"] ] as const).map(([field, label]) => <Field key={field} label={label} hint="Blank means unlimited"><Input type="number" min={1} step={1} value={p[field] ?? ""} onChange={e => setPrice(i, { [field]: e.target.value ? Number(e.target.value) : null })} /></Field>)}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.bill_active_users} onChange={e => setPrice(i, { bill_active_users: e.target.checked })} />Bill additional active tenant users, including owners and admins</label><p className="text-xs text-muted">Disabled users are excluded. Extra branches count active branches. Mid-cycle changes create prorated adjustments.</p><fieldset><legend className="mb-2 text-xs font-semibold text-muted">Included modules</legend><div className="flex flex-wrap gap-3">{features.data?.filter(f => f.is_active).map(f => <label key={f.key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.modules.includes(f.key)} onChange={e => setPrice(i, { modules: e.target.checked ? [...p.modules, f.key] : p.modules.filter(m => m !== f.key) })} />{f.name}</label>)}</div></fieldset>
    </section>)}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setPrices(p => [...p, { currency: "", monthly: 0, annual: 0, seat_monthly: 0, branch_monthly: 0, included_users: 1, included_branches: 1, max_users: null, max_branches: null, max_products: null, max_storage_mb: null, modules: [], trial_days: 0, tax_bps: 1800, bill_active_users: false }])}>Add currency price</Button><Button type="submit" disabled={save.isPending || prices.length === 0 || features.isLoading}>{save.isPending ? "Saving…" : "Review and save"}</Button><Link href="/plans"><Button variant="ghost">Cancel</Button></Link></div>{dialog}
  </form>;
}

function AssignSubscription({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(1);
  const tenants = useTenants(page, 20);
  const [tenant, setTenant] = useState("");
  return <Drawer open title="Assign a subscription" onClose={onClose} size="lg"><div className="space-y-4 p-5"><p className="text-sm text-muted">Choose an existing business. Review the quote before assignment.</p><BillingError error={tenants.error} />{tenants.isLoading ? <PageLoader variant="compact" /> : <Select aria-label="Business" value={tenant} onChange={e => setTenant(e.target.value)}><option value="">Choose business</option>{tenants.data?.items.map(t => <option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}</Select>}<BillingPagination page={page} total={tenants.data?.total ?? 0} onPage={setPage} />{tenant && <SubscriptionManager tenantId={tenant} onDone={onClose} />}</div></Drawer>;
}

export function SubscriptionManager({ tenantId, onDone }: { tenantId: string; onDone?: () => void }) {
  const overview = useBillingOverview(tenantId);
  const [page, setPage] = useState(1);
  const plans = useBillingRecords("plans", { page, page_size: 20, status: "active" });
  const action = useBillingAction();
  const [selection, setSelection] = useState<ChangePlanInput | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const [discount, setDiscount] = useState(0);
  const { confirm, dialog } = useConfirmDialog();
  const sub = overview.data?.subscription;
  const applyAction = (data: Parameters<typeof action.mutate>[0]["data"]) => confirm({ title: "Confirm subscription adjustment?", message: `${data.action.replaceAll("_", " ")} for this business. The change and your reason will be audited.`, danger: data.action === "cancel", onConfirm: () => action.mutate({ tenantId, key: crypto.randomUUID(), data }) });
  return <div className="space-y-4"><BillingError error={overview.error || plans.error || action.error} />{overview.isLoading ? <PageLoader variant="compact" /> : <><div className="rounded-xl border border-border bg-card p-4"><h2 className="text-base font-bold">{overview.data?.plan_name ?? "No managed subscription"}</h2>{sub && <><BillingStatus value={sub.status} /><p className="mt-2 text-sm">{billingMoney(sub.recurring, sub.currency)} / {sub.cycle} · {sub.seats} active users · {sub.branches} branches</p><p className="text-xs text-muted">Next billing: {billingDate(sub.period_end)} UTC · Credit {billingMoney(sub.credit, sub.currency)}</p></>}</div><Field label="Cycle for plan change"><Select value={cycle} onChange={e => setCycle(e.target.value as typeof cycle)}><option value="monthly">Monthly</option><option value="annual">Annual</option></Select></Field><div className="flex flex-wrap gap-2">{plans.data?.items.map(p => p.prices.map(price => <Button key={`${p.id}-${price.currency}`} variant="secondary" onClick={() => setSelection({ plan_id: p.id, currency: price.currency, cycle })}>{p.name} · {billingMoney(cycle === "annual" ? price.annual : price.monthly, price.currency)}</Button>))}</div><BillingPagination page={page} total={plans.data?.total ?? 0} onPage={setPage} />
    {sub && <section className="space-y-3 rounded-xl border border-border bg-card p-4"><Field label="Approval reason"><Input minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={reason.trim().length < 3 || action.isPending} onClick={() => applyAction({ action: "cancel", reason, at_period_end: true })}>Cancel at period end</Button><Button variant="secondary" disabled={!sub.cancel_at_end || reason.trim().length < 3 || action.isPending} onClick={() => applyAction({ action: "reactivate", reason })}>Withdraw cancellation</Button></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Trial extension (days)"><Input type="number" min={1} max={365} value={days} onChange={e => setDays(Number(e.target.value))} /></Field><Button variant="secondary" disabled={sub.status !== "trialing" || reason.trim().length < 3 || action.isPending} onClick={() => applyAction({ action: "extend_trial", reason, days })}>Extend trial</Button><Field label="Approved recurring discount (%)"><DecimalInput amount={discount} decimals={2} onChange={setDiscount} /></Field><Button variant="secondary" disabled={reason.trim().length < 3 || action.isPending} onClick={() => applyAction({ action: "discount", reason, discount_bps: discount })}>Apply to future invoices</Button></div></section>}
    {sub && <AuditHistory id={sub.id} />}
    </>}{selection && <PlanChange input={selection} tenantId={tenantId} onClose={() => setSelection(null)} onDone={() => { setSelection(null); onDone?.(); }} />}{dialog}</div>;
}

export function LiveSubscriptionDetail({ id }: { id: string }) {
  const detail = useBillingDetail("subscriptions", id);
  return <div className="space-y-4"><h1 className="text-[22px] font-bold">Subscription details</h1><BillingError error={detail.error} />{detail.isLoading ? <PageLoader variant="compact" /> : detail.data && <><p className="text-sm">{detail.data.tenant_name} · {detail.data.tenant_id}</p><SubscriptionManager tenantId={detail.data.tenant_id} /></>}</div>;
}

export function LiveInvoiceDetail({ id }: { id: string }) {
  const detail = useBillingDetail("invoices", id);
  const i = detail.data;
  return <div className="space-y-4"><h1 className="text-[22px] font-bold">Invoice details</h1><BillingError error={detail.error} />{detail.isLoading ? <PageLoader variant="compact" /> : i && <section className="space-y-4 rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">{i.number}</h2><p className="text-sm text-muted">{i.tenant_name} · {i.tenant_id}</p></div><BillingStatus value={i.status} /></div><p className="text-xs text-muted">Issued {billingDate(i.created_at)} · Due {billingDate(i.due_at)} · Period {billingDate(i.period_start)} – {billingDate(i.period_end)} UTC</p>{i.lines.map((l, n) => <div key={n} className="flex justify-between border-b border-border py-3 text-sm"><span>{l.description}</span><span>{billingMoney(l.amount, i.currency)}</span></div>)}<dl className="grid max-w-lg grid-cols-2 gap-3 text-sm">{[["Subtotal", i.subtotal], ["Tax", i.tax], ["Total", i.total], ["Paid", i.paid], ["Outstanding", i.total - i.paid]].map(([label, amount]) => <div key={label} className="contents"><dt className="text-muted">{label}</dt><dd className="text-right font-semibold">{billingMoney(Number(amount), i.currency)}</dd></div>)}</dl><DownloadInvoice id={i.id} /><p className="text-xs text-muted">Issued financial records are immutable. Payment status follows verified provider transactions.</p></section>}</div>;
}

export function LiveBillingOverview() {
  const [currency, setCurrency] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const report = useBillingReport({ currency, plan_id: planId, status, from_date: from, to_date: to });
  const data = report.data;
  const currencies = [...new Set([...(data?.subscriptions.map(r => r.currency) ?? []), ...(data?.outstanding.map(r => r.currency) ?? []), ...(data?.payments.map(r => r.currency) ?? [])])];
  return <div className="space-y-4"><div><h1 className="text-[22px] font-bold">Billing Overview</h1><p className="mt-1 text-sm text-muted">Worker-prepared billing totals, separated by currency.</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><Input aria-label="Currency" placeholder="Currency" className="max-w-40" value={currency} maxLength={3} onChange={e => setCurrency(e.target.value.toUpperCase())} /><Input aria-label="Financial activity from" type="date" className="max-w-44" value={from} onChange={e => setFrom(e.target.value)} /><Input aria-label="Financial activity through" type="date" className="max-w-44" value={to} onChange={e => setTo(e.target.value)} /><PlanPicker value={planId} onChange={setPlanId} /><Select aria-label="Subscription status" className="max-w-44" value={status} onChange={e => setStatus(e.target.value)}><option value="">All subscription statuses</option>{["active", "trialing", "past_due", "suspended", "canceled"].map(s => <option key={s} value={s}>{s.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}</Select></div><BillingError error={report.error} />{report.isLoading ? <PageLoader variant="compact" /> : report.error && !data ? null : !data?.updated_at ? <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">Billing metrics are awaiting the first worker run.</p> : <><p className="text-xs text-muted">Updated {new Date(data.updated_at).toISOString()} · MRR is current. Invoice and payment metrics use the date range (this month by default), current plan and subscription status.</p>{currencies.map(c => <section key={c} className="rounded-xl border border-border bg-card p-4"><h2 className="mb-3 text-sm font-bold">{c}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Monthly recurring revenue (excl. tax)", billingMoney(data.subscriptions.filter(r => r.currency === c).reduce((n, r) => n + r.mrr, 0), c)], ["Active subscriptions", data.subscriptions.filter(r => r.currency === c && r.status === "active").reduce((n, r) => n + r.subscriptions, 0)], ["Trials", data.subscriptions.filter(r => r.currency === c && r.status === "trialing").reduce((n, r) => n + r.subscriptions, 0)], ["Past due", data.subscriptions.filter(r => r.currency === c && r.status === "past_due").reduce((n, r) => n + r.subscriptions, 0)], ["Outstanding issued in range", billingMoney(data.outstanding.filter(r => r.currency === c).reduce((n, r) => n + r.amount, 0), c)], ["Successful payments", data.payments.filter(r => r.currency === c && r.status === "succeeded").reduce((n, r) => n + r.count, 0)], ["Failed payments", data.payments.filter(r => r.currency === c && r.status === "failed").reduce((n, r) => n + r.count, 0)]].map(([label, value]) => <div key={label} className="rounded-lg bg-surface p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</div></section>)}</>}</div>;
}

export function LiveBillingSettings() {
  const settings = useBillingSettings();
  const methods = useBillingMethods();
  return <div className="space-y-4"><h1 className="text-[22px] font-bold">Billing Settings</h1><p className="text-sm text-muted">Tax is configured on each plan price. New prices default to 18% Rwanda VAT; existing agreed prices retain their tax rate. <Link href="/plans" className="text-accent underline">Manage plan prices and limits</Link></p><BillingError error={settings.error || methods.error} />{settings.isLoading ? <PageLoader variant="compact" /> : settings.data && <SettingsForm initial={settings.data} />}<section className="space-y-2 rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-bold">pawaPay</h2><p className="text-sm text-muted">{methods.data?.configured ? `Configured · ${methods.data.mode}` : "Not configured"}</p>{methods.data?.signed_requests_required && !methods.data.signing_configured && <p className="text-sm text-muted">This pawaPay account requires signed initiation requests. Configure the matching RSA private key and public-key ID on the server to enable payments.</p>}<p className="text-xs text-muted">Credentials are managed on the server. Mobile money payments require customer approval; no automatic debit retries or saved cards are enabled.</p></section></div>;
}
function SettingsForm({ initial }: { initial: BillingSettings }) {
  const [form, setForm] = useState(initial);
  const save = useBillingSaveSettings();
  return <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4 rounded-xl border border-border bg-card p-5"><div className="grid gap-4 sm:grid-cols-2">{([ ["grace_days", "Grace period days"], ["due_days", "Invoice due days"], ["reminder_days", "Remind before period end (days)"] ] as const).map(([key, label]) => <Field key={key} label={label}><Input type="number" min={key === "grace_days" ? 0 : 1} max={key === "reminder_days" ? 30 : 90} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} /></Field>)}<Field label="Invoice prefix"><Input required pattern="[A-Z0-9]{2,10}" value={form.invoice_prefix} onChange={e => setForm(f => ({ ...f, invoice_prefix: e.target.value }))} /></Field></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.require_new_businesses ?? false} onChange={event => setForm(f => ({ ...f, require_new_businesses: event.target.checked }))} /><span>Require a plan for new businesses<span className="mt-1 block text-xs text-muted">Businesses created since billing was installed must choose a plan before making ERP changes. Legacy businesses keep their existing access.</span></span></label><BillingError error={save.error} /><Button disabled={save.isPending}>{save.isPending ? "Saving…" : "Save billing settings"}</Button>{save.isSuccess && <span role="status" className="ml-3 text-xs text-accent">Saved</span>}</form>;
}


function RefundPanel({ payment, onClose }: { payment: BillingPayment; onClose: () => void }) {
  const [amount, setAmount] = useState(payment.amount);
  const [reason, setReason] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const methods = useBillingMethods();
  const refund = useBillingRefund();
  const { confirm, dialog } = useConfirmDialog();
  return <Drawer open title="Authorize refund" onClose={onClose} size="lg"><form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); confirm({ title: "Issue this refund?", message: `${billingMoney(amount, payment.currency)} will be returned through pawaPay. The original invoice and payment remain on record. This does not cancel the subscription. Reason: ${reason}`, danger: true, onConfirm: () => refund.mutate({ reference: payment.reference, amount, reason, key }, { onSuccess: onClose }) }); }}><p className="text-sm text-muted">Payment {payment.reference}. Refunds remain pending until verified by pawaPay.</p><BillingError error={refund.error || methods.error} /><Field label={`Refund amount (${payment.currency})`}><DecimalInput amount={amount} decimals={currencyDecimals(payment.currency)} onChange={setAmount} /></Field><Field label="Approval reason"><Textarea required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field><Button type="submit" disabled={refund.isPending || !methods.data?.configured || reason.trim().length < 3}>Review refund</Button>{!methods.data?.configured && <p className="text-xs text-muted">pawaPay must be configured before refunds are available.</p>}{dialog}</form></Drawer>;
}

function LiveRefunds() {
  const [page, setPage] = useState(1);
  const rows = useBillingRefunds({ page, page_size: 20 });
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const refresh = useBillingRefreshRefund();
  return <section className="space-y-3"><h2 className="text-base font-bold">Refunds and credit notes</h2><BillingError error={rows.error || refresh.error || downloadError} />{rows.isLoading ? <PageLoader variant="compact" /> : <div className="divide-y divide-border rounded-xl border border-border bg-card">{rows.data?.items.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">{r.number} · {r.tenant_name}</p><p className="text-xs text-muted">{r.reason} · {billingDate(r.created_at)}</p><p className="break-all text-[11px] text-muted">{r.reference}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold">{billingMoney(r.amount, r.currency)}</span><BillingStatus value={r.status} />{r.status === "succeeded" && <Button variant="secondary" onClick={() => { setDownloadError(null); void billingApi.creditNote(r.id).catch(setDownloadError); }}>Credit note PDF</Button>}{["pending", "processing"].includes(r.status) && <Button variant="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate(r.reference)}>Reconcile refund</Button>}</div></div>)}{rows.data?.total === 0 && <p className="p-5 text-sm text-muted">No refunds.</p>}</div>}<BillingPagination page={page} total={rows.data?.total ?? 0} onPage={setPage} /></section>;
}


function AuditHistory({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const history = useBillingHistory(id, page);
  return <section className="space-y-3"><h2 className="text-sm font-bold">Subscription audit history</h2><BillingError error={history.error} />{history.isLoading ? <PageLoader variant="compact" /> : <div className="divide-y divide-border rounded-xl border border-border bg-card">{history.data?.items.map(event => <div key={event.id} className="p-3 text-sm"><p className="font-semibold">{event.action.replace("billing.", "").replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{billingDate(event.created_at)} UTC · {event.actor_name ?? "Billing system"}</p>{event.changes?.reason && <p className="mt-1 text-xs text-muted">{event.changes.reason}</p>}</div>)}</div>}<BillingPagination page={page} total={history.data?.total ?? 0} onPage={setPage} /></section>;
}


/** Preserve the typed decimal string while sending integer minor units to the API. */
function DecimalInput({ amount, decimals, onChange }: { amount: number; decimals: number; onChange: (value: number) => void }) {
  const initial = String(amount).padStart(decimals + 1, "0");
  const [raw, setRaw] = useState(decimals ? `${initial.slice(0, -decimals)}.${initial.slice(-decimals)}` : initial);
  const pattern = decimals ? `[0-9]+(?:\\.[0-9]{0,${decimals}})?` : "[0-9]+";
  const valid = new RegExp(`^(?:${pattern})$`).test(raw);
  return <Input required inputMode={decimals ? "decimal" : "numeric"} pattern={pattern} aria-invalid={!valid && !!raw} value={raw} onChange={event => {
    const value = event.target.value;
    setRaw(value);
    if (new RegExp(`^(?:${pattern})$`).test(value)) {
      const [whole, fraction = ""] = value.split(".");
      const minor = Number(whole + fraction.padEnd(decimals, "0"));
      if (Number.isSafeInteger(minor)) onChange(minor);
    }
  }} />;
}


function PlanPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const selected = useBillingDetail("plans", value);
  const plans = useBillingRecords("plans", { page, page_size: 20, q }, open);
  return <><Button type="button" variant="secondary" className="h-9 w-full justify-start overflow-hidden" onClick={() => setOpen(true)}><span className="truncate">{value ? selected.data?.name ?? "Selected plan" : "All plans"}</span></Button><Drawer open={open} onClose={() => setOpen(false)} title="Filter by plan" size="lg"><div className="space-y-4 p-5"><Input aria-label="Find a plan" placeholder="Search plans…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /><BillingError error={plans.error} /><Button variant="secondary" onClick={() => { onChange(""); setOpen(false); }}>All Plans</Button>{plans.isLoading ? <PageLoader variant="compact" /> : <div className="grid gap-2">{plans.data?.items.map(plan => <Button key={plan.id} variant="secondary" className="justify-start" onClick={() => { onChange(plan.id); setOpen(false); }}>{plan.name}</Button>)}</div>}<BillingPagination page={page} total={plans.data?.total ?? 0} onPage={setPage} /></div></Drawer></>;
}
