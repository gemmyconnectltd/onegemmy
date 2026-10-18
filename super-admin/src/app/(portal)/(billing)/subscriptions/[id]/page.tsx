"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBilling } from "@/lib/billing/store";
import { subscriptionCost } from "@/lib/billing/logic";
import { formatMoney } from "@/lib/billing/money";
import { SubscriptionActions } from "@/components/billing/SubscriptionActions";
import { Badge, EmptyState, fmtDate, PageHeader } from "@/components/billing/ui";

const TABS = ["Overview", "Usage", "Billing", "History"] as const;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-border/60 py-2 text-[13px]"><dt className="text-muted">{k}</dt><dd className="min-w-0 text-right font-semibold">{v}</dd></div>;
}
function Meter({ label, used, allowed }: { label: string; used: number; allowed: number | null }) {
  const pct = allowed ? Math.min(100, Math.round((used / allowed) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold">{label}</span><span className="text-muted">{used.toLocaleString()} / {allowed?.toLocaleString() ?? "Unlimited"}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={allowed ?? undefined}><div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-accent")} style={{ width: `${allowed ? pct : 8}%` }} /></div>
    </div>
  );
}

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useBilling();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const sub = state!.subscriptions.find((s) => s.id === id);
  if (!sub) return <EmptyState title="Subscription not found" action={<Link href="/subscriptions" className="text-accent underline">Back to subscriptions</Link>} />;
  const plan = state!.plans.find((p) => p.id === sub.planId);
  const cost = subscriptionCost(sub);
  const c = sub.currency;
  const per = sub.cycle === "annual" ? "year" : "month";
  const invoices = state!.invoices.filter((i) => i.subscriptionId === sub.id);
  const payments = state!.payments.filter((p) => p.subscriptionId === sub.id);
  const coupon = state!.coupons.find((x) => x.code === sub.couponCode);

  return (
    <div className="space-y-5">
      <Link href="/subscriptions" className="flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-foreground"><ArrowLeft size={13} /> Subscriptions</Link>
      <PageHeader title={sub.tenantName} subtitle={`${plan?.name ?? sub.planId} · ${sub.country} · ${sub.cycle}`} actions={<><Badge value={sub.status} /><Badge value={sub.paymentStatus} /></>} />
      <SubscriptionActions sub={sub} />

      <div role="tablist" aria-label="Subscription sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 no-scrollbar sm:mx-0 sm:px-0">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-semibold", tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground")}>{t}</button>)}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {tab === "Overview" && (
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div>
              <Row k="Plan" v={plan?.name ?? sub.planId} /><Row k="Billing cycle" v={<span className="capitalize">{sub.cycle}</span>} /><Row k="Currency" v={c} />
              <Row k="Recurring charge" v={`${formatMoney(cost.total, c)} / ${per}`} /><Row k="Price list" v={`v${sub.priceSheet.version} (locked since sign-up/plan change)`} />
              {plan && plan.prices.version !== sub.priceSheet.version && <Row k="Current plan price" v={`${formatMoney(plan.prices.monthlyPrice, plan.prices.currency)}/mo — grandfathered`} />}
            </div>
            <div>
              <Row k="Included users / branches" v={`${sub.includedUsers} / ${sub.includedBranches}`} /><Row k="Extra users / branches" v={`${sub.extraUsers} / ${sub.extraBranches}`} />
              <Row k="Period started" v={fmtDate(sub.currentPeriodStart)} /><Row k="Next billing" v={fmtDate(sub.nextBillingDate)} />
              {sub.trialEndsAt && <Row k="Trial ends" v={fmtDate(sub.trialEndsAt)} />}{sub.canceledAt && <Row k="Canceled" v={fmtDate(sub.canceledAt)} />}
              <Row k="Coupon" v={coupon ? coupon.code : "—"} />
            </div>
          </dl>
        )}
        {tab === "Usage" && (
          <div className="max-w-xl space-y-4">
            <Meter label="Users" used={sub.usage.users} allowed={sub.includedUsers + sub.extraUsers} />
            <Meter label="Branches" used={sub.usage.branches} allowed={sub.includedBranches + sub.extraBranches} />
            <Meter label="Products" used={sub.usage.products} allowed={plan?.limits.maxProducts ?? null} />
            <Meter label="Storage (MB)" used={sub.usage.storageMb} allowed={plan?.limits.maxStorageMb ?? null} />
            <p className="text-[11.5px] text-muted">Demo usage figures. Live usage will come from the tenant&apos;s limits and counters in the platform.</p>
          </div>
        )}
        {tab === "Billing" && (
          <div className="space-y-4">
            <dl className="max-w-xl">
              <Row k={`${plan?.name ?? "Plan"} (${sub.cycle})`} v={formatMoney(cost.base, c)} />
              {cost.extraUsers > 0 && <Row k={`${cost.extraUsers} extra user${cost.extraUsers === 1 ? "" : "s"} × ${formatMoney(sub.priceSheet.extraUserPrice, c)}${sub.cycle === "annual" ? " × 12" : ""}`} v={formatMoney(cost.extraUsersAmount, c)} />}
              {cost.extraBranches > 0 && <Row k={`${cost.extraBranches} extra branch${cost.extraBranches === 1 ? "" : "es"} × ${formatMoney(sub.priceSheet.extraBranchPrice, c)}${sub.cycle === "annual" ? " × 12" : ""}`} v={formatMoney(cost.extraBranchesAmount, c)} />}
              <Row k={`Recurring total / ${per}`} v={formatMoney(cost.total, c)} />
            </dl>
            <p className="text-[12px] text-muted">{invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {payments.length} payment{payments.length === 1 ? "" : "s"} — see the <Link href={`/invoices?tenant=${encodeURIComponent(sub.tenantName)}`} className="text-accent underline">Invoices</Link> and <Link href={`/payments?tenant=${encodeURIComponent(sub.tenantName)}`} className="text-accent underline">Payments</Link> tabs.</p>
          </div>
        )}
        {tab === "History" && (sub.history.length === 0 ? <EmptyState title="No history yet" /> : (
          <ol className="space-y-3">{sub.history.map((h) => <li key={h.id} className="border-l-2 border-border pl-3"><p className="text-[13px] font-semibold">{h.action}</p><p className="text-[12px] text-muted">{h.detail}</p><p className="text-[11px] text-muted">{fmtDate(h.at)} · {h.actor}</p></li>)}</ol>
        ))}
      </div>
    </div>
  );
}
