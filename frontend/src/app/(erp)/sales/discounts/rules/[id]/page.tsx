"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Copy, Pause, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableWrap } from "@/components/ui/Table";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useDiscountRule, useDiscountRuleHistory, useDiscountRuleUsage, useDiscountStatus } from "@/lib/api/hooks";
import { OfferStatusBadge, TYPE_LABELS, appliesTo, channelsOf, displayStatus, ruleValue, validity } from "@/components/discounts/shared";

type Tab = "Overview" | "Usage" | "History";

/** One discount rule: its configuration, the sales it was applied to, and what happened to it. */
export default function DiscountRulePage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission: can } = useAuth();
  const { currencySymbol, locale } = useAppConfig();
  const money = (v: number | string) => `${currencySymbol} ${Number(v || 0).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  const [tab, setTab] = useState<Tab>("Overview");
  const [page, setPage] = useState(1);
  const rule = useDiscountRule(id);
  const usage = useDiscountRuleUsage(id, page, tab === "Usage");
  const history = useDiscountRuleHistory(id, tab === "History");
  const status = useDiscountStatus();
  const [error, setError] = useState<string | null>(null);
  if (rule.isLoading) return <PageLoader variant="page" />;
  if (rule.error || !rule.data) return <p role="alert" className="text-sm text-red-600">{rule.error?.message ?? "Discount rule not found"}</p>;
  const r = rule.data;
  const conditions = ((r.config ?? {}) as { conditions?: Record<string, number> }).conditions ?? {};
  const conditionLabels: Record<string, (v: number) => string> = {
    min_order_amount: (v) => `Sale of at least ${money(v)}`, min_quantity: (v) => `At least ${v} eligible units`,
    usage_limit: (v) => `Used at most ${v} times in total`, per_customer_limit: (v) => `At most ${v} times per customer`,
    min_margin_percent: (v) => `Keeps at least ${v}% margin`,
  };
  const changeStatus = async (next: string) => { setError(null); try { await status.mutateAsync({ resource: "rules", id: r.id, status: next }); } catch (e) { setError((e as { detail?: string })?.detail ?? "Couldn't change the status"); } };
  const facts: [string, string][] = [["Type", TYPE_LABELS[r.type] ?? r.type], ["Value", ruleValue(r, money)], ["Applies to", appliesTo(r)], ["Channels", channelsOf(r)],
    ["Validity", validity(r)], ["Maximum discount", r.max_discount ? money(r.max_discount) : "No cap"], ["Combines with other offers", r.exclusive ? "No (exclusive)" : r.combinable ? "Yes" : "No"],
    ["Priority", String(r.priority)], ...(r.campaign_name ? [["Promotion", r.campaign_name] as [string, string]] : [])];
  return <div className="space-y-5">
    <Link href="/sales/discounts?tab=Discount%20Rules" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} /> Discount rules</Link>
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-5">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="pesaa-page-title">{r.name}</h1><OfferStatusBadge status={displayStatus(r)} /></div>
        <p className="mt-1 text-sm text-muted"><span className="font-mono">{r.code}</span> · {TYPE_LABELS[r.type] ?? r.type} · <span className="font-semibold text-foreground">{ruleValue(r, money)}</span></p>
        {r.description && <p className="mt-2 max-w-2xl text-sm text-muted">{r.description}</p>}</div>
      <div className="flex flex-wrap gap-2">
        {can("discounts:update") && r.status !== "Archived" && <Link href={`/sales/discounts/new?edit=${r.id}`}><Button variant="secondary"><Pencil size={14} /> Edit</Button></Link>}
        {can("discounts:create") && <Link href={`/sales/discounts/new?from=${r.id}`}><Button variant="secondary"><Copy size={14} /> Duplicate</Button></Link>}
        {can("discounts:activate") && r.status !== "Archived" && (r.status === "Active"
          ? <Button variant="secondary" disabled={status.isPending} onClick={() => changeStatus("Paused")}><Pause size={14} /> Pause</Button>
          : <Button disabled={status.isPending} onClick={() => changeStatus("Active")}><Play size={14} /> Activate</Button>)}
      </div>
    </header>
    {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
    <section aria-label="Usage summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted">Sales with this offer</p><p className="text-xl font-extrabold tabular-nums">{r.usage_count ?? 0}</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted">Discount granted</p><p className="text-xl font-extrabold tabular-nums">{money(r.discount_total ?? 0)}</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted">Average per sale</p><p className="text-xl font-extrabold tabular-nums">{money(r.usage_count ? Number(r.discount_total) / r.usage_count : 0)}</p></div>
    </section>
    <nav aria-label="Rule sections" className="flex gap-1 border-b border-border">{(["Overview", "Usage", "History"] as Tab[]).map((t) => <button key={t} type="button" aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] font-semibold ${tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>{t}</button>)}</nav>
    {tab === "Overview" && <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card"><h2 className="border-b border-border px-4 py-3 text-sm font-bold">Configuration</h2>
        <dl className="divide-y divide-border">{facts.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl></section>
      <section className="h-fit rounded-xl border border-border bg-card"><h2 className="border-b border-border px-4 py-3 text-sm font-bold">Conditions</h2>
        {Object.keys(conditions).length ? <ul className="divide-y divide-border">{Object.entries(conditions).map(([k, v]) => <li key={k} className="px-4 py-2.5 text-sm">{conditionLabels[k]?.(Number(v)) ?? `${k.replace(/_/g, " ")}: ${v}`}</li>)}</ul>
          : <p className="px-4 py-4 text-sm text-muted">No extra conditions: every eligible sale qualifies.</p>}</section>
    </div>}
    {tab === "Usage" && (usage.isLoading ? <PageLoader variant="compact" /> : !usage.data?.items.length
      ? <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">This offer hasn&apos;t been applied to a sale yet.</p>
      : <><TableWrap><table className="w-full min-w-[640px]"><thead><tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted"><th className="px-4 py-3">Sale</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">How</th><th className="px-4 py-3 text-right">Discount</th></tr></thead>
        <tbody className="divide-y divide-border">{usage.data.items.map((u) => <tr key={u.id}><td className="px-4 py-3 text-sm"><Link className="font-semibold hover:text-accent hover:underline" href={`/sales/orders/${u.order_id}`}>{u.order_number}</Link><p className="text-[11px] text-muted">{u.order_status}</p></td>
          <td className="px-4 py-3 text-sm text-muted">{new Date(u.date).toLocaleString()}</td><td className="px-4 py-3 text-sm">{u.customer ?? "—"}</td><td className="px-4 py-3 text-sm text-muted">{u.branch ?? "—"}</td>
          <td className="px-4 py-3 text-sm capitalize text-muted">{u.kind}{u.coupon_code ? ` (${u.coupon_code})` : ""}</td><td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">{money(u.amount)}</td></tr>)}</tbody></table></TableWrap>
        {usage.data.total > 25 && <div className="flex justify-end gap-3"><Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page * 25 >= usage.data.total} onClick={() => setPage((p) => p + 1)}>Next</Button></div>}</>)}
    {tab === "History" && (history.isLoading ? <PageLoader variant="compact" /> : !history.data?.length
      ? <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">No recorded changes yet.</p>
      : <ol className="divide-y divide-border rounded-xl border border-border bg-card">{history.data.map((h, i) => <li key={i} className="px-4 py-3"><p className="text-sm">{h.summary}</p><p className="text-[11px] text-muted">{h.action.replace("discount.", "").replace(/_/g, " ")} · {h.actor ?? "—"} · {new Date(h.at).toLocaleString()}</p></li>)}</ol>)}
  </div>;
}
