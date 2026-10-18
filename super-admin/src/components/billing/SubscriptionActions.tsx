"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Layers, Receipt, RefreshCw, RotateCcw, SlidersHorizontal, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select } from "@/components/ui/Form";
import { useBilling } from "@/lib/billing/store";
import { subscriptionCost } from "@/lib/billing/logic";
import { formatMoney, recurringCost } from "@/lib/billing/money";
import type { BillingCycle, Subscription } from "@/lib/billing/types";
import { Notice } from "./ui";

type Mode = null | "plan" | "cycle" | "allowances" | "trial" | "cancel" | "reactivate";

/** Every admin action on a subscription. Each opens a confirmation drawer that states the effect before it applies. */
export function SubscriptionActions({ sub }: { sub: Subscription }) {
  const { state, actions } = useBilling();
  const [mode, setMode] = useState<Mode>(null);
  const [planId, setPlanId] = useState(sub.planId);
  const [cycle, setCycle] = useState<BillingCycle>(sub.cycle);
  const [xu, setXu] = useState(String(sub.extraUsers));
  const [xb, setXb] = useState(String(sub.extraBranches));
  const [days, setDays] = useState("7");
  const [when, setWhen] = useState<"now" | "period_end">("period_end");
  const s = state!.settings;
  const canceled = sub.status === "canceled";
  const open = (m: Mode) => { setPlanId(sub.planId); setCycle(sub.cycle); setXu(String(sub.extraUsers)); setXb(String(sub.extraBranches)); setDays("7"); setWhen("period_end"); setMode(m); };
  const close = () => setMode(null);

  const current = subscriptionCost(sub);
  const target = state!.plans.find((p) => p.id === planId);
  const planPreview = target ? recurringCost({ prices: target.prices, cycle, includedUsers: target.includedUsers, includedBranches: target.includedBranches, users: sub.usage.users, branches: sub.usage.branches }) : null;
  const cycPreview = recurringCost({ prices: sub.priceSheet, cycle, includedUsers: sub.includedUsers, includedBranches: sub.includedBranches, users: sub.includedUsers + sub.extraUsers, branches: sub.includedBranches + sub.extraBranches });
  const nXu = Number(xu), nXb = Number(xb);
  const allowErr = !Number.isInteger(nXu) || !Number.isInteger(nXb) || nXu < 0 || nXb < 0 ? "Enter whole numbers, 0 or more"
    : s.extraUserLimit !== null && nXu > s.extraUserLimit ? `Extra users are limited to ${s.extraUserLimit}` : s.extraBranchLimit !== null && nXb > s.extraBranchLimit ? `Extra branches are limited to ${s.extraBranchLimit}`
    : !s.extraUsersEnabled && nXu > 0 ? "Extra users are disabled in Billing Settings" : !s.extraBranchesEnabled && nXb > 0 ? "Extra branches are disabled in Billing Settings" : null;
  const allowPreview = recurringCost({ prices: sub.priceSheet, cycle: sub.cycle, includedUsers: sub.includedUsers, includedBranches: sub.includedBranches, users: sub.includedUsers + (nXu || 0), branches: sub.includedBranches + (nXb || 0) });
  const belowUsage = sub.includedUsers + nXu < sub.usage.users || sub.includedBranches + nXb < sub.usage.branches;
  const nDays = Number(days);
  const daysErr = !Number.isInteger(nDays) || nDays < 1 || nDays > 90 ? "Enter 1–90 days" : null;

  const footer = (label: string, apply: () => void, opts?: { danger?: boolean; disabled?: boolean }) => (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" onClick={close}>Cancel</Button>
      <Button type="button" variant={opts?.danger ? "danger" : "primary"} disabled={opts?.disabled} onClick={() => { apply(); close(); }}>{label}</Button>
    </div>
  );
  const cur = sub.currency;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!canceled && <Button variant="outline" onClick={() => open("plan")}><Layers size={14} /> Change plan</Button>}
        {!canceled && <Button variant="outline" onClick={() => open("cycle")}><RefreshCw size={14} /> Billing cycle</Button>}
        {!canceled && <Button variant="outline" onClick={() => open("allowances")}><SlidersHorizontal size={14} /> Adjust allowances</Button>}
        {(sub.status === "trialing" || sub.status === "past_due") && <Button variant="outline" onClick={() => open("trial")}><CalendarClock size={14} /> Extend trial</Button>}
        {canceled || sub.cancelAtPeriodEnd ? <Button variant="outline" onClick={() => open("reactivate")}><RotateCcw size={14} /> {canceled ? "Reactivate" : "Keep subscription"}</Button> : <Button variant="danger" onClick={() => open("cancel")}><XCircle size={14} /> Cancel</Button>}
        <Link href={`/invoices?tenant=${encodeURIComponent(sub.tenantName)}`}><Button variant="outline"><Receipt size={14} /> Invoices</Button></Link>
        <Link href={`/payments?tenant=${encodeURIComponent(sub.tenantName)}`}><Button variant="outline"><Wallet size={14} /> Payments</Button></Link>
      </div>

      <Drawer open={mode === "plan"} onClose={close} side="center" size="md" title="Change plan" footer={footer("Change plan", () => actions.changePlan(sub.id, planId, cycle), { disabled: !target || (planId === sub.planId && cycle === sub.cycle) })}>
        <div className="space-y-3 px-5 py-4">
          <Field label="New plan"><Select value={planId} onChange={(e) => setPlanId(e.target.value)}>{state!.plans.filter((p) => p.status === "active" || p.id === sub.planId).map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.prices.monthlyPrice, p.prices.currency)}/mo</option>)}</Select></Field>
          <Field label="Billing cycle"><Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}><option value="monthly">Monthly</option>{s.allowAnnual && <option value="annual">Annual</option>}</Select></Field>
          {planPreview && target && <p className="rounded-lg bg-surface p-3 text-[12.5px]">Now <strong>{formatMoney(current.total, cur)}</strong> → after <strong>{formatMoney(planPreview.total, target.prices.currency)}</strong> per {cycle === "annual" ? "year" : "month"} (estimate for {sub.usage.users} users / {sub.usage.branches} branches).</p>}
          {target && target.prices.currency !== cur && <Notice tone="red">This plan is priced in {target.prices.currency}, the subscription is billed in {cur}. Amounts are never converted — the subscription will switch to {target.prices.currency}.</Notice>}
          <Notice tone="blue">The subscription moves to this plan&apos;s <em>current</em> prices. {s.proration === "create_prorations" ? "A proration is calculated for the rest of the period." : "No proration (disabled in Billing Settings)."} The backend computes the final amount.</Notice>
        </div>
      </Drawer>

      <Drawer open={mode === "cycle"} onClose={close} side="center" size="md" title="Update billing cycle" footer={footer("Update cycle", () => actions.setCycle(sub.id, cycle), { disabled: cycle === sub.cycle })}>
        <div className="space-y-3 px-5 py-4">
          <Field label="Billing cycle"><Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}><option value="monthly">Monthly</option>{s.allowAnnual && <option value="annual">Annual</option>}</Select></Field>
          <p className="rounded-lg bg-surface p-3 text-[12.5px]">Recurring charge: <strong>{formatMoney(cycPreview.total, cur)}</strong> per {cycle === "annual" ? "year" : "month"}.</p>
        </div>
      </Drawer>

      <Drawer open={mode === "allowances"} onClose={close} side="center" size="md" title="Adjust allowances" footer={footer("Save allowances", () => actions.setAllowances(sub.id, nXu, nXb), { disabled: !!allowErr })}>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Extra users (${sub.includedUsers} included)`}><Input inputMode="numeric" value={xu} onChange={(e) => setXu(e.target.value)} /></Field>
            <Field label={`Extra branches (${sub.includedBranches} included)`}><Input inputMode="numeric" value={xb} onChange={(e) => setXb(e.target.value)} /></Field>
          </div>
          {allowErr ? <p role="alert" className="text-[12px] text-red-600">{allowErr}</p> : <p className="rounded-lg bg-surface p-3 text-[12.5px]">New recurring charge: <strong>{formatMoney(allowPreview.total, cur)}</strong> (was {formatMoney(current.total, cur)}).</p>}
          {belowUsage && <Notice>Current usage ({sub.usage.users} users, {sub.usage.branches} branches) is higher than these allowances.</Notice>}
        </div>
      </Drawer>

      <Drawer open={mode === "trial"} onClose={close} side="center" size="sm" title="Extend trial" footer={footer("Extend trial", () => actions.extendTrial(sub.id, nDays), { disabled: !!daysErr })}>
        <div className="space-y-2 px-5 py-4"><Field label="Extra days"><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>{daysErr && <p role="alert" className="text-[12px] text-red-600">{daysErr}</p>}</div>
      </Drawer>

      <Drawer open={mode === "cancel"} onClose={close} side="center" size="md" title="Cancel subscription" footer={footer(when === "now" ? "Cancel now" : "Schedule cancellation", () => actions.cancelSubscription(sub.id, when === "period_end"), { danger: true })}>
        <div className="space-y-3 px-5 py-4">
          <Field label="When"><Select value={when} onChange={(e) => setWhen(e.target.value as "now" | "period_end")}><option value="period_end">At the end of the current period</option><option value="now">Immediately</option></Select></Field>
          <Notice tone="red">{when === "now" ? `${sub.tenantName} loses paid access right away and billing stops. No refund is issued from here.` : "Access continues until the period ends; no further invoices are created."}</Notice>
        </div>
      </Drawer>

      <Drawer open={mode === "reactivate"} onClose={close} side="center" size="sm" title={canceled ? "Reactivate subscription" : "Keep subscription"} footer={footer(canceled ? "Reactivate" : "Keep", () => actions.reactivate(sub.id))}>
        <p className="px-5 py-4 text-sm text-muted">{canceled ? `Billing resumes today at ${formatMoney(current.total, cur)} per ${sub.cycle === "annual" ? "year" : "month"}. The customer is charged by the backend at the next billing run.` : "The scheduled cancellation is withdrawn."}</p>
      </Drawer>
    </>
  );
}
