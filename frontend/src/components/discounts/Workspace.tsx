"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { BadgePercent, CalendarClock, ChevronDown, Megaphone, Plus, Receipt, Search, Tag, Ticket, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, FormFooter, Input, Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { StatCard } from "@/components/ui/StatCard";
import { TableWrap } from "@/components/ui/Table";
import { Toggle } from "@/components/ui/Toggle";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  useDiscountAnalytics, useDiscountCampaigns, useDiscountCoupons, useDiscountOverview, useDiscountRules, useDiscountSettings,
  useDiscountStatus, useGenerateDiscountCoupons, useSaveDiscountCampaign, useSaveDiscountSettings,
} from "@/lib/api/hooks";
import type { DiscountFlags, DiscountRule } from "@/lib/api/discounts";
import { OfferStatusBadge, RuleActionsMenu, STATUS_OPTIONS, TYPE_LABELS, appliesTo, channelsOf, displayStatus, ruleValue, validity } from "./shared";

type Tab = "Overview" | "Discount Rules" | "Promotions" | "Coupons" | "Approvals" | "Analytics" | "Settings";

function useMoney() {
  const { currencySymbol, locale } = useAppConfig();
  return (value: number | string) => `${currencySymbol} ${Number(value || 0).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

/** Discounts & Promotions: one workspace with an overview, the offer lists, analytics and settings. */
export function DiscountsWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const { hasPermission: can } = useAuth();
  const config = useDiscountSettings();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [drawer, setDrawer] = useState<"promotion" | "coupon" | null>(null);
  const c = config.data;
  const tabs: Tab[] = ["Overview", "Discount Rules", ...(c?.campaigns ? ["Promotions" as Tab] : []), ...(c?.coupons ? ["Coupons" as Tab] : []),
    ...(c?.approvals ? ["Approvals" as Tab] : []), ...(can("discounts:analytics") ? ["Analytics" as Tab] : []), ...(can("discounts:settings") ? ["Settings" as Tab] : [])];
  const requested = (params.get("tab") ?? "Overview").replace(/\+/g, " ") as Tab;
  const tab: Tab = tabs.includes(requested) ? requested : "Overview";
  const go = (next: Tab) => router.replace(`/sales/discounts?tab=${encodeURIComponent(next)}`, { scroll: false });
  async function run(fn: () => Promise<unknown>, ok = "Saved.") {
    setNotice(null);
    try { await fn(); setNotice({ tone: "ok", text: ok }); }
    catch (e) { setNotice({ tone: "error", text: (e as { detail?: string })?.detail ?? (e instanceof Error ? e.message : "Couldn't save the change.") }); }
  }
  if (config.isLoading) return <PageLoader variant="page" />;
  if (config.error) return <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600">{config.error.message}</p>;
  const createOptions = [
    can("discounts:create") && { label: "Discount rule", hint: "Price reduction on products, customers or the sale", href: "/sales/discounts/new" },
    c?.campaigns && can("discounts:promotions") && { label: "Promotion", hint: "A campaign that groups rules for a period", action: () => setDrawer("promotion") },
    c?.coupons && can("discounts:coupons") && { label: "Coupon", hint: "A code customers present at checkout", action: () => setDrawer("coupon") },
  ].filter(Boolean) as { label: string; hint: string; href?: string; action?: () => void }[];

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="pesaa-page-title">Discounts &amp; Promotions</h1><p className="mt-1 text-sm text-muted">Price reductions, promotions and coupons for POS and Sales. Every sale keeps the discount it was sold with.</p></div>
      {createOptions.length > 0 && <Menu.Root modal={false}>
        <Menu.Trigger className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:opacity-95 focus-visible:outline-2 focus-visible:outline-accent"><Plus size={16} /> Create offer <ChevronDown size={15} /></Menu.Trigger>
        <Menu.Portal><Menu.Positioner align="end" sideOffset={6} collisionPadding={12} className="z-50"><Menu.Popup className="w-72 rounded-xl border border-border bg-card py-1.5 shadow-lg outline-none">
          {createOptions.map((o) => o.href
            ? <Menu.LinkItem key={o.label} render={<Link href={o.href} />} className="block px-4 py-2.5 outline-none data-highlighted:bg-surface"><p className="text-sm font-semibold">{o.label}</p><p className="text-xs text-muted">{o.hint}</p></Menu.LinkItem>
            : <Menu.Item key={o.label} onClick={o.action} className="block w-full px-4 py-2.5 text-left outline-none data-highlighted:bg-surface"><p className="text-sm font-semibold">{o.label}</p><p className="text-xs text-muted">{o.hint}</p></Menu.Item>)}
        </Menu.Popup></Menu.Positioner></Menu.Portal>
      </Menu.Root>}
    </header>
    <nav aria-label="Discounts sections" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
      {tabs.map((t) => <button key={t} type="button" onClick={() => go(t)} aria-current={tab === t ? "page" : undefined}
        className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>{t}</button>)}
    </nav>
    {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "error" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>{notice.text}</p>}
    {tab === "Overview" && <OverviewTab run={run} />}
    {tab === "Discount Rules" && <RulesTab run={run} />}
    {tab === "Promotions" && <PromotionsTab run={run} onCreate={() => setDrawer("promotion")} />}
    {tab === "Coupons" && <CouponsTab run={run} onCreate={() => setDrawer("coupon")} />}
    {tab === "Approvals" && <section className="rounded-xl border border-border bg-card p-5"><h2 className="pesaa-section-title">Discount approvals</h2><p className="mt-1 text-sm text-muted">Requests are tied to the customer, branch, items and calculated prices; a changed cart needs a new approval.</p><Link href="/approvals" className="mt-4 inline-block"><Button variant="secondary">Open the approval inbox</Button></Link></section>}
    {tab === "Analytics" && <AnalyticsTab />}
    {tab === "Settings" && <SettingsTab run={run} />}
    {drawer === "promotion" && <PromotionDrawer onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setNotice({ tone: "ok", text: "Promotion saved as a draft." }); go("Promotions"); }} />}
    {drawer === "coupon" && <CouponDrawer onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setNotice({ tone: "ok", text: "Coupon created." }); go("Coupons"); }} />}
  </div>;
}

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

function OverviewTab({ run }: { run: Run }) {
  const { hasPermission: can } = useAuth();
  const money = useMoney();
  const overview = useDiscountOverview(can("discounts:analytics"));
  const rules = useDiscountRules(1, can("discounts:read"), { status: "current" });
  const status = useDiscountStatus();
  const o = overview.data;
  const offers = (rules.data?.items ?? []).filter((r) => r.status !== "Archived").slice(0, 8);
  return <div className="space-y-5">
    {can("discounts:analytics") && <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Active offers" value={o?.active_rules ?? 0} icon={BadgePercent} loading={overview.isLoading} />
      <StatCard label="Scheduled promotions" value={o?.scheduled_campaigns ?? 0} icon={CalendarClock} loading={overview.isLoading} />
      <StatCard label="Total discount given" value={money(o?.total_discounts ?? 0)} icon={Wallet} loading={overview.isLoading} hint="All completed sales" />
      <StatCard label="Discounted sales" value={o?.discounted_sales ?? 0} icon={Receipt} loading={overview.isLoading} hint={o?.pending_approvals ? `${o.pending_approvals} approval${o.pending_approvals === 1 ? "" : "s"} waiting` : undefined} tone={o?.pending_approvals ? "warning" : "default"} />
    </section>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 space-y-3">
        <div className="flex items-center justify-between"><h2 className="pesaa-section-title">Offers</h2><Link href="/sales/discounts?tab=Discount%20Rules" className="text-sm font-semibold text-accent hover:underline">All discount rules</Link></div>
        {rules.isLoading ? <PageLoader variant="compact" /> : offers.length === 0 ? <EmptyOffers /> : <RulesTable rules={offers} run={run} status={status} />}
      </section>
      {can("discounts:analytics") && <aside className="h-fit rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold">Recent activity</h2>
        <ul className="divide-y divide-border">{(o?.activity ?? []).slice(0, 8).map((a, i) => <li key={i} className="px-4 py-2.5"><p className="text-[13px]">{a.summary}</p><p className="text-[11px] text-muted">{new Date(a.created_at).toLocaleString()}</p></li>)}</ul>
        {!overview.isLoading && !o?.activity.length && <p className="px-4 py-6 text-center text-sm text-muted">Nothing has happened yet.</p>}
      </aside>}
    </div>
  </div>;
}

function EmptyOffers() {
  const { hasPermission: can } = useAuth();
  return <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
    <Tag size={28} className="mx-auto text-muted" aria-hidden />
    <p className="mt-3 text-sm font-semibold">No discounts or promotions yet</p>
    <p className="mt-1 text-sm text-muted">Create your first offer to start managing discounts across POS and Sales.</p>
    {can("discounts:create") && <Link href="/sales/discounts/new" className="mt-4 inline-block"><Button><Plus size={15} /> Create discount rule</Button></Link>}
  </div>;
}

function RulesTable({ rules, run, status }: { rules: DiscountRule[]; run: Run; status: ReturnType<typeof useDiscountStatus> }) {
  const { hasPermission: can } = useAuth();
  const money = useMoney();
  const { confirm, dialog } = useConfirmDialog();
  const change = (r: DiscountRule, next: string) => {
    const go = () => run(() => status.mutateAsync({ resource: "rules", id: r.id, status: next }), `${r.name}: ${next.toLowerCase()}.`);
    if (next === "Archived") confirm({ title: `Archive ${r.name}?`, message: "It stops applying to new sales and leaves the everyday list. Sales that already used it keep their discount.", confirmLabel: "Archive", danger: true, onConfirm: go });
    else void go();
  };
  const head = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
  return <TableWrap><table className="w-full min-w-[900px]">
    <thead><tr className="border-b border-border">{["Discount", "Type", "Value", "Applies to", "Channels", "Validity", "Usage", "Status", ""].map((h, i) => <th key={i} className={`${head} ${h === "Usage" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{rules.map((r) => <tr key={r.id} className="hover:bg-surface/50">
      <td className="px-4 py-3"><Link href={`/sales/discounts/rules/${r.id}`} className="text-sm font-semibold hover:text-accent hover:underline">{r.name}</Link><p className="font-mono text-[11px] text-muted">{r.code}</p></td>
      <td className="px-4 py-3 text-sm">{TYPE_LABELS[r.type] ?? r.type}</td>
      <td className="px-4 py-3 text-sm font-semibold tabular-nums">{ruleValue(r, money)}</td>
      <td className="px-4 py-3 text-sm text-muted">{appliesTo(r)}</td>
      <td className="px-4 py-3 text-sm text-muted">{channelsOf(r)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">{validity(r)}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums">{r.usage_count ?? 0}<p className="text-[11px] text-muted">{money(r.discount_total ?? 0)}</p></td>
      <td className="px-4 py-3"><OfferStatusBadge status={displayStatus(r)} /></td>
      <td className="px-4 py-3"><div className="flex items-center justify-end gap-1.5">
        <Link href={`/sales/discounts/rules/${r.id}`} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold hover:border-accent/40 hover:text-accent">View</Link>
        <RuleActionsMenu rule={r} canEdit={can("discounts:update")} canCreate={can("discounts:create")} canActivate={can("discounts:activate")}
          onStatus={(next) => change(r, next)} />
      </div></td>
    </tr>)}</tbody>
  </table>{dialog}</TableWrap>;
}

function RulesTab({ run }: { run: Run }) {
  const { hasPermission: can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("current");
  const [type, setType] = useState("");
  const debounced = useDebouncedValue(search);
  const rules = useDiscountRules(page, can("discounts:read"), { search: debounced, status: statusFilter, type });
  const status = useDiscountStatus();
  const total = rules.data?.total ?? 0;
  const filtered = !!(debounced || (statusFilter && statusFilter !== "current") || type);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[14rem] flex-1 sm:max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or code" aria-label="Search discount rules" className="w-full pl-9" /></div>
      <Select aria-label="Status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-auto"><option value="current">All except archived</option>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}<option value="">Everything</option></Select>
      <Select aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-auto"><option value="">All types</option>{Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      <span className="ml-auto text-xs text-muted">{total} rule{total === 1 ? "" : "s"}</span>
      {can("discounts:create") && <Link href="/sales/discounts/new"><Button size="sm"><Plus size={14} /> Discount rule</Button></Link>}
    </div>
    {rules.isLoading ? <PageLoader variant="compact" /> : rules.error ? <p role="alert" className="text-sm text-red-600">{rules.error.message}</p>
      : !rules.data?.items.length ? (filtered ? <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">No rules match these filters.</p> : <EmptyOffers />)
      : <RulesTable rules={rules.data.items} run={run} status={status} />}
    <Pager page={page} total={total} onPage={setPage} />
  </section>;
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 25) return null;
  return <div className="flex items-center justify-end gap-3 text-sm"><Button size="sm" variant="secondary" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button><span className="text-muted">Page {page} of {Math.ceil(total / 25)}</span><Button size="sm" variant="secondary" disabled={page * 25 >= total} onClick={() => onPage(page + 1)}>Next</Button></div>;
}

function PromotionsTab({ run, onCreate }: { run: Run; onCreate: () => void }) {
  const { hasPermission: can } = useAuth();
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  // Scheduled and Expired are Active promotions outside their dates, so those filters read Active ones and check the dates.
  const serverStatus = filter === "Scheduled" || filter === "Expired" || filter === "Active" ? "Active" : filter;
  const campaigns = useDiscountCampaigns(page, can("discounts:read"), serverStatus);
  const status = useDiscountStatus();
  const { confirm, dialog } = useConfirmDialog();
  const items = (campaigns.data?.items ?? []).filter((p) => !filter || displayStatus(p) === filter);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Promotion status" className="flex gap-1 rounded-lg border border-border bg-surface p-1">{["", "Active", "Scheduled", "Paused", "Draft", "Archived"].map((s) => <button key={s || "all"} type="button" aria-pressed={filter === s} onClick={() => { setFilter(s); setPage(1); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === s ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>{s || "All"}</button>)}</div>
      {can("discounts:promotions") && <Button size="sm" className="ml-auto" onClick={onCreate}><Plus size={14} /> Promotion</Button>}
    </div>
    {campaigns.isLoading ? <PageLoader variant="compact" /> : !items.length
      ? <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center"><Megaphone size={26} className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold">{filter ? "No promotions with this status" : "No promotions yet"}</p><p className="mt-1 text-sm text-muted">A promotion groups discount rules under one campaign with its own dates.</p></div>
      : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((p) => <article key={p.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold">{p.name}</h3><p className="font-mono text-[11px] text-muted">{p.code}</p></div><OfferStatusBadge status={displayStatus(p)} /></div>
        {p.description && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{p.description}</p>}
        <p className="mt-3 text-xs text-muted">{validity(p)}</p>
        {can("discounts:promotions") && p.status !== "Archived" && <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Button size="sm" variant="secondary" onClick={() => run(() => status.mutateAsync({ resource: "campaigns", id: p.id, status: p.status === "Active" ? "Paused" : "Active" }), `${p.name}: ${p.status === "Active" ? "paused" : "active"}.`)}>{p.status === "Active" ? "Pause" : "Activate"}</Button>
          <Button size="sm" variant="ghost" onClick={() => confirm({ title: `Archive ${p.name}?`, message: "The promotion stops and leaves the list. Sales that used it keep their discounts.", confirmLabel: "Archive", danger: true, onConfirm: () => run(() => status.mutateAsync({ resource: "campaigns", id: p.id, status: "Archived" }), `${p.name} archived.`) })}>Archive</Button>
        </div>}
      </article>)}</div>}
    <Pager page={page} total={campaigns.data?.total ?? 0} onPage={setPage} />
    {dialog}
  </section>;
}

function CouponsTab({ run, onCreate }: { run: Run; onCreate: () => void }) {
  const { hasPermission: can } = useAuth();
  const [page, setPage] = useState(1);
  const coupons = useDiscountCoupons(page, can("discounts:read"));
  const rules = useDiscountRules(1, can("discounts:read"), { type: "coupon" });
  const status = useDiscountStatus();
  const names = Object.fromEntries((rules.data?.items ?? []).map((r) => [r.id, r.name]));
  const items = coupons.data?.items ?? [];
  const head = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
  return <section className="space-y-3">
    <div className="flex items-center justify-between"><p className="text-sm text-muted">Codes customers present at checkout. Each one belongs to a coupon discount rule.</p>{can("discounts:coupons") && <Button size="sm" onClick={onCreate}><Plus size={14} /> Coupon</Button>}</div>
    {coupons.isLoading ? <PageLoader variant="compact" /> : !items.length
      ? <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center"><Ticket size={26} className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold">No coupons yet</p><p className="mt-1 text-sm text-muted">Create a coupon discount rule first, then issue codes for it here.</p></div>
      : <TableWrap><table className="w-full min-w-[640px]"><thead><tr className="border-b border-border">{["Code", "Discount rule", "Used", "Valid until", "Status", ""].map((h, i) => <th key={i} className={`${head} ${h === "Used" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{items.map((cp) => <tr key={cp.id}>
          <td className="px-4 py-3 font-mono text-sm font-semibold">{cp.code}</td>
          <td className="px-4 py-3 text-sm">{names[cp.rule_id] ? <Link className="hover:text-accent hover:underline" href={`/sales/discounts/rules/${cp.rule_id}`}>{names[cp.rule_id]}</Link> : "—"}</td>
          <td className="px-4 py-3 text-right text-sm tabular-nums">{cp.redeemed_count}{cp.max_redemptions ? ` / ${cp.max_redemptions}` : ""}</td>
          <td className="px-4 py-3 text-sm text-muted">{cp.expires_at ? new Date(cp.expires_at).toLocaleDateString() : "No expiry"}</td>
          <td className="px-4 py-3"><OfferStatusBadge status={cp.status} /></td>
          <td className="px-4 py-3 text-right">{can("discounts:coupons") && <Button size="sm" variant="secondary" onClick={() => run(() => status.mutateAsync({ resource: "coupons", id: cp.id, status: cp.status === "Active" ? "Disabled" : "Active" }), `Coupon ${cp.code} ${cp.status === "Active" ? "disabled" : "activated"}.`)}>{cp.status === "Active" ? "Disable" : "Activate"}</Button>}</td>
        </tr>)}</tbody></table></TableWrap>}
    <Pager page={page} total={coupons.data?.total ?? 0} onPage={setPage} />
  </section>;
}

function AnalyticsTab() {
  const money = useMoney();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const reversed = !!(start && end && end <= start);
  // Local midnight (the business's day), sent as an exact instant.
  const instant = (d: string) => new Date(`${d}T00:00`).toISOString();
  const analytics = useDiscountAnalytics(!reversed, start ? instant(start) : undefined, end ? instant(end) : undefined);
  const rows = [...(analytics.data ?? [])].sort((a, b) => Number(b.amount) - Number(a.amount));
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const sales = rows.reduce((s, r) => s + Number(r.sales), 0);
  const top = Math.max(...rows.map((r) => Number(r.amount)), 1);
  const kinds = Object.entries(rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + Number(r.amount) }), {}));
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end gap-3"><Field label="From"><Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} /></Field><Field label="Until (not included)"><Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></Field></div>
    {reversed ? <p role="alert" className="text-sm text-red-600">The end date must be after the start date.</p> : analytics.isLoading ? <PageLoader variant="compact" /> : analytics.error ? <p role="alert" className="text-sm text-red-600">{analytics.error.message}</p> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total discounts granted" value={money(total)} icon={Wallet} />
        <StatCard label="Discount applications" value={sales} icon={Receipt} hint="One sale can use several offers" />
        <StatCard label="Average per application" value={money(sales ? total / sales : 0)} icon={BadgePercent} />
      </div>
      {rows.length === 0 ? <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">No discounts were applied to completed sales in this period.</p> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-xl border border-border bg-card p-4"><h2 className="mb-3 text-sm font-bold">Discount granted by offer</h2>
          <ul className="space-y-2.5">{rows.map((r, i) => <li key={i}><div className="flex justify-between gap-3 text-[13px]"><span className="truncate">{r.rule_name} <span className="text-muted">· {r.kind}</span></span><span className="tabular-nums">{money(r.amount)} · {r.sales} sale{r.sales === 1 ? "" : "s"}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-surface"><div className="h-full rounded-full bg-accent" style={{ width: `${(Number(r.amount) / top) * 100}%` }} /></div></li>)}</ul></section>
        <section className="h-fit rounded-xl border border-border bg-card p-4"><h2 className="mb-3 text-sm font-bold">By kind</h2><ul className="space-y-2 text-[13px]">{kinds.map(([k, v]) => <li key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="tabular-nums">{money(v)}</span></li>)}</ul></section>
      </div>}
    </>}
  </section>;
}

const SETTING_GROUPS: { title: string; hint: string; flags: [DiscountFlags, string, string][] }[] = [
  { title: "At the till and in sales", hint: "What cashiers and sales staff can do.", flags: [
    ["manual_pos", "Manual discounts", "Authorised staff can take an amount or percentage off a line or the whole sale, within their limit below."],
    ["automatic", "Automatic discounts", "Active rules apply by themselves when a cart qualifies; nobody has to remember them."]] },
  { title: "Offers", hint: "Which kinds of offers the business runs.", flags: [
    ["campaigns", "Promotions", "Group rules into campaigns with their own dates and status."],
    ["coupons", "Coupon codes", "Customers present a code at checkout; usage limits are enforced per code and per customer."],
    ["advanced", "Advanced types", "Volume, tiered and buy-X-get-Y rules, in addition to percentage and fixed discounts."]] },
  { title: "Control", hint: "Approvals for discounts above a person's limit.", flags: [
    ["approvals", "Approvals", "A discount above someone's limit waits for an approver instead of being refused."]] },
];

function SettingsTab({ run }: { run: Run }) {
  const config = useDiscountSettings();
  const save = useSaveDiscountSettings();
  const c = config.data;
  if (!c) return null;
  return <div className="space-y-4">
    <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted">Discounts &amp; Promotions is on for this business. Turning an option off stops new use only: completed sales keep their discounts and nothing is deleted.</p>
    {SETTING_GROUPS.map((g) => <section key={g.title} className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-bold">{g.title}</h2><p className="text-xs text-muted">{g.hint}</p></div>
      <div className="divide-y divide-border">{g.flags.map(([key, label, hint]) => <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
        <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted">{hint}</p></div>
        <Toggle checked={!!c[key]} loading={save.isPending} label={label} onChange={(v) => run(() => save.mutateAsync({ [key]: v }), `${label} ${v ? "on" : "off"}.`)} />
      </div>)}</div>
    </section>)}
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-bold">Manual discount limit</h2><p className="text-xs text-muted">The most a person without a role-specific limit may take off by hand, as a percentage of the sale. Owners and administrators have no limit.</p></div>
      <form className="flex flex-wrap items-end gap-3 px-4 py-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => save.mutateAsync({ authority: { default_percent: Number(f.get("limit")), roles: c.authority.roles ?? {} } }), "Limit saved."); }}>
        <Field label="Default limit (%)"><Input name="limit" type="number" min="0" max="100" step="0.01" defaultValue={c.authority.default_percent ?? 0} className="w-32" /></Field>
        <Button type="submit" variant="secondary" disabled={save.isPending}>Save limit</Button>
      </form>
    </section>
  </div>;
}

function PromotionDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const save = useSaveDiscountCampaign();
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const iso = (k: string) => (f.get(k) ? new Date(String(f.get(k))).toISOString() : null);
    try { await save.mutateAsync({ name: f.get("name"), code: f.get("code") || undefined, description: f.get("description") || undefined, starts_at: iso("start"), ends_at: iso("end") }); onDone(); }
    catch (err) { setError((err as { detail?: string })?.detail ?? (err instanceof Error ? err.message : "Couldn't save the promotion")); }
  };
  return <Drawer open onClose={onClose} title="New promotion" description="Saved as a draft. Link discount rules to it, then activate it." size="md"
    footer={<form id="promotion-form" onSubmit={submit}><FormFooter submitLabel={save.isPending ? "Saving…" : "Save draft"} onCancel={onClose} disabled={save.isPending} /></form>}>
    <div className="space-y-4 p-5">
      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      <Field label="Promotion name" required><Input form="promotion-form" name="name" required minLength={2} placeholder="Weekend promotion" /></Field>
      <Field label="Code (optional)"><Input form="promotion-form" name="code" maxLength={40} /></Field>
      <Field label="Description (optional)"><Textarea form="promotion-form" name="description" rows={3} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Starts"><Input form="promotion-form" name="start" type="datetime-local" /></Field><Field label="Ends"><Input form="promotion-form" name="end" type="datetime-local" /></Field></div>
    </div>
  </Drawer>;
}

function CouponDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { hasPermission: can } = useAuth();
  const rules = useDiscountRules(1, can("discounts:read"), { type: "coupon" });
  const generate = useGenerateDiscountCoupons();
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    try {
      await generate.mutateAsync({ rule_id: f.get("rule"), code: f.get("code") || undefined, count: f.get("code") ? 1 : num("count") ?? 1, prefix: f.get("prefix") || undefined,
        max_redemptions: num("max"), per_customer_limit: num("per_customer"), expires_at: f.get("expires") ? new Date(String(f.get("expires"))).toISOString() : undefined });
      onDone();
    } catch (err) { setError((err as { detail?: string })?.detail ?? (err instanceof Error ? err.message : "Couldn't create the coupon")); }
  };
  const options = rules.data?.items.filter((r) => r.status !== "Archived") ?? [];
  return <Drawer open onClose={onClose} title="New coupon" description="Issue a code (or a batch of codes) for a coupon discount rule." size="md"
    footer={<form id="coupon-form" onSubmit={submit}><FormFooter submitLabel={generate.isPending ? "Creating…" : "Create coupon"} onCancel={onClose} disabled={generate.isPending || !options.length} /></form>}>
    <div className="space-y-4 p-5">
      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!rules.isLoading && !options.length && <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">Create a discount rule of type “Coupon” first; it sets what the code is worth.</p>}
      <Field label="Coupon discount rule" required><Select form="coupon-form" name="rule" required><option value="">Choose a rule</option>{options.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      <Field label="Code" hint="Leave empty to generate codes automatically."><Input form="coupon-form" name="code" minLength={3} maxLength={40} placeholder="WEEKEND10" /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="How many to generate"><Input form="coupon-form" name="count" type="number" min={1} max={500} defaultValue={1} /></Field><Field label="Prefix for generated codes"><Input form="coupon-form" name="prefix" maxLength={12} /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Total uses allowed"><Input form="coupon-form" name="max" type="number" min={1} /></Field><Field label="Uses per customer"><Input form="coupon-form" name="per_customer" type="number" min={1} /></Field></div>
      <Field label="Valid until"><Input form="coupon-form" name="expires" type="datetime-local" /></Field>
    </div>
  </Drawer>;
}
