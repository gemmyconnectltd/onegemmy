"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableWrap } from "@/components/ui/Table";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useDiscountOverview, useDiscountSettings, useSaveDiscountSettings, useDiscountRules, useDiscountCampaigns, useDiscountCoupons, useDiscountStatus, useDiscountAnalytics, useSaveDiscountCampaign, useGenerateDiscountCoupons } from "@/lib/api/hooks";
import type { DiscountFlags } from "@/lib/api/discounts";

const flags: [DiscountFlags, string][] = [["manual_pos", "Manual POS discounts"], ["automatic", "Automatic discounts"], ["campaigns", "Promotion campaigns"], ["coupons", "Coupon codes"], ["approvals", "Discount approvals"], ["advanced", "Advanced discount types"]];
function DiscountsWorkspace() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "Settings" ? "Settings" : "Overview");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const { hasPermission: can } = useAuth();
  const { currencySymbol, locale } = useAppConfig();
  const fmt = (value: number) => value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const config = useDiscountSettings();
  const overview = useDiscountOverview(can("discounts:analytics"));
  const saveConfig = useSaveDiscountSettings();
  const rules = useDiscountRules(page, can("discounts:read"));
  const campaigns = useDiscountCampaigns(page, can("discounts:read") && !!config.data?.campaigns);
  const coupons = useDiscountCoupons(page, can("discounts:read") && !!config.data?.coupons);
  const analytics = useDiscountAnalytics(can("discounts:analytics"), start ? `${start}T00:00:00Z` : undefined, end ? `${end}T00:00:00Z` : undefined);
  const status = useDiscountStatus();
  const createCampaign = useSaveDiscountCampaign();
  const generate = useGenerateDiscountCoupons();
  const tabs = ["Overview", "Discount Rules", ...(config.data?.campaigns ? ["Promotions"] : []), ...(config.data?.coupons ? ["Coupons"] : []), ...(config.data?.approvals ? ["Approvals"] : []), ...(can("discounts:analytics") ? ["Analytics"] : []), ...(can("discounts:settings") ? ["Settings"] : [])];
  async function action(fn: () => Promise<unknown>) { setMessage(""); try { await fn(); setMessage("Changes saved."); } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save"); } }
  if (config.isLoading) return <PageLoader variant="page" />;
  if (config.error) return <p role="alert">{config.error.message}</p>;
  const visibleTab = tabs.includes(tab) ? tab : "Overview";
  const list = visibleTab === "Promotions" ? campaigns : visibleTab === "Coupons" ? coupons : rules;
  const resource = visibleTab === "Promotions" ? "campaigns" : visibleTab === "Coupons" ? "coupons" : "rules";
  const rows = list.data?.items ?? [];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="pesaa-page-title">Discounts &amp; Promotions</h1><p className="text-sm text-muted">Manage price reductions and preserve the terms of every sale.</p></div>{config.data?.enabled && can("discounts:create") && <Link href="/sales/discounts/new"><Button>Create discount</Button></Link>}</div>
    <nav aria-label="Discount sections" className="flex flex-wrap gap-2">{tabs.map(t => <Button key={t} variant={visibleTab === t ? "primary" : "secondary"} onClick={() => { setTab(t); setPage(1); }} aria-current={visibleTab === t ? "page" : undefined}>{t}</Button>)}</nav>
    {message && <p role="status" className="text-sm">{message}</p>}
    {visibleTab === "Settings" ? <section className="space-y-4 rounded-xl border border-border bg-card p-6"><h2 className="pesaa-section-title">Sales settings · Discounts &amp; Promotions</h2>{flags.map(([key, label]) => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={!!config.data?.[key]} disabled={saveConfig.isPending} onChange={e => action(() => saveConfig.mutateAsync({ [key]: e.target.checked }))} />{label}</label>)}<form className="flex flex-wrap items-end gap-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); action(() => saveConfig.mutateAsync({ authority: { default_percent: Number(f.get("limit")), roles: config.data?.authority.roles ?? {} } })); }}><Field label="Default manual authority (%)" hint="Roles without an explicit limit use this value."><Input name="limit" type="number" min="0" max="100" step="0.01" defaultValue={config.data?.authority.default_percent ?? 0} /></Field><Button disabled={saveConfig.isPending}>Save authority</Button></form></section>
    : visibleTab === "Approvals" ? <section className="space-y-4 rounded-xl border border-border bg-card p-6"><h2 className="pesaa-section-title">Discount approvals</h2><p className="text-sm text-muted">Requests are bound to the customer, branch, items and calculated prices. Cart changes require revalidation.</p><Link href="/approvals"><Button variant="secondary">Open approval inbox</Button></Link></section>
    : visibleTab === "Analytics" ? <section className="space-y-4"><div className="flex flex-wrap gap-4"><Field label="From (UTC)"><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="Until, exclusive (UTC)"><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field></div>{analytics.isLoading ? <PageLoader variant="compact" /> : analytics.error ? <p role="alert">{analytics.error.message}</p> : <TableWrap><table className="w-full"><thead><tr><th>Rule</th><th>Kind</th><th>Sales</th><th>Discount granted</th></tr></thead><tbody>{analytics.data?.map((r, i) => <tr key={i}><td>{r.rule_name}</td><td>{r.kind}</td><td>{r.sales}</td><td className="text-right">{currencySymbol} {fmt(Number(r.amount))}</td></tr>)}</tbody></table>{!analytics.data?.length && <p className="p-6 text-sm text-muted">No discounts recorded for this period.</p>}</TableWrap>}</section>
    : <>
      {visibleTab === "Overview" && <section className="space-y-4">{overview.isLoading ? <PageLoader variant="compact" /> : overview.error ? <p role="alert">{overview.error.message}</p> : overview.data ? <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[["Active discounts", overview.data.active_rules], ["Scheduled promotions", overview.data.scheduled_campaigns], ["Total discounts granted", `${currencySymbol} ${fmt(Number(overview.data.total_discounts))}`], ["Pending approvals", overview.data.pending_approvals], ["Discounted sales", overview.data.discounted_sales], ["Coupon redemptions", overview.data.coupon_redemptions]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted">{label}</p><p className="pesaa-section-title">{value}</p></div>)}</div><div className="space-y-3 rounded-xl border border-border bg-card p-6"><h2 className="pesaa-section-title">Recent activity</h2>{overview.data.activity.map((a, i) => <p key={i} className="text-sm">{a.summary}</p>)}{!overview.data.activity.length && <p className="text-sm text-muted">No discount activity yet.</p>}</div></> : <p className="text-sm text-muted">Review configured discount rules below.</p>}</section>}
      {visibleTab === "Promotions" && can("discounts:promotions") && <form className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); action(() => createCampaign.mutateAsync({ name: f.get("name"), code: f.get("code") || undefined })); }}><Field label="Campaign name"><Input name="name" required minLength={2} /></Field><Field label="Internal code"><Input name="code" /></Field><Button disabled={createCampaign.isPending || !config.data?.enabled}>Create campaign draft</Button></form>}
      {visibleTab === "Coupons" && can("discounts:coupons") && <form className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); action(() => generate.mutateAsync({ rule_id: f.get("rule"), code: f.get("code"), max_redemptions: Number(f.get("limit")) || undefined })); }}><Field label="Coupon rule"><Select name="rule" required><option value="">Select a rule</option>{rules.data?.items.filter(r => r.type === "coupon").map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field><Field label="Coupon code"><Input name="code" required minLength={3} /></Field><Field label="Maximum redemptions"><Input name="limit" type="number" min={1} /></Field><Button disabled={generate.isPending || !config.data?.enabled}>Generate coupon</Button></form>}
      {list.isLoading ? <PageLoader variant="compact" /> : list.error ? <p role="alert">{list.error.message}</p> : <TableWrap><table className="w-full"><thead><tr><th>Name / code</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{"name" in r ? r.name : r.code}<p className="text-xs text-muted">{r.code}</p></td><td>{r.status}</td><td><div className="flex flex-wrap gap-2">{can(resource === "rules" ? "discounts:activate" : resource === "campaigns" ? "discounts:promotions" : "discounts:coupons") && <><Button size="sm" variant="secondary" disabled={status.isPending || !config.data?.enabled} onClick={() => action(() => status.mutateAsync({ resource, id: r.id, status: r.status === "Active" ? resource === "coupons" ? "Disabled" : "Paused" : "Active" }))}>{r.status === "Active" ? "Pause" : "Activate"}</Button>{resource !== "coupons" && <Button size="sm" variant="ghost" disabled={status.isPending || !config.data?.enabled} onClick={() => action(() => status.mutateAsync({ resource, id: r.id, status: "Archived" }))}>Archive</Button>}</>}</div></td></tr>)}</tbody></table>{!rows.length && <p className="p-6 text-sm text-muted">No records yet.</p>}</TableWrap>}
      <div className="flex items-center justify-end gap-4"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="secondary" disabled={page * 25 >= (list.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    </>}
  </div>;
}

export default function DiscountsPage() { return <Suspense fallback={<PageLoader variant="page" />}><DiscountsWorkspace /></Suspense>; }
