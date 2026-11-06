"use client";
import Link from "next/link";
import { CreditCard, Database, FileText, History, Layers, Lock, Package, Settings, ShieldCheck, Users, Warehouse, Power, ChevronRight, ShoppingCart, Boxes, Receipt, UserRound, Wallet, Archive } from "lucide-react";
import type { AdminBranch, AdminTenant, AdminTenantRecord, AdminTenantStats, TenantLimits } from "@/lib/api/admin";
import { useBillingOverview } from "@/lib/api/hooks";
import { billingDate, billingMoney } from "@/components/billing/BillingShared";
import { fmtRelative } from "@/lib/date";
import { Card } from "@/app/(portal)/tenants/[id]/TenantPanels";
import { cn } from "@/lib/utils";
import { tabHref, BUSINESS_TABS } from "./BusinessShell";

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Package; label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={15} aria-hidden /></span>
      <p className="mt-2 truncate text-[11.5px] font-medium text-muted">{label}</p>
      <p className="truncate text-xl font-extrabold leading-tight text-foreground">{value}</p>
      {sub && <p className="truncate text-[10.5px] text-muted">{sub}</p>}
    </div>
  );
}
function Meter({ label, used, allowed }: { label: string; used: number; allowed: number | null }) {
  const pct = allowed ? Math.min(100, Math.round((used / allowed) * 100)) : 0;
  return (
    <div><div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold">{label}</span><span className="text-muted">{used.toLocaleString()} / {allowed === null ? "Unlimited" : allowed.toLocaleString()}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={allowed ?? undefined}><div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-accent")} style={{ width: allowed ? `${pct}%` : "8%" }} /></div></div>
  );
}

const TILES: { panel: string; icon: typeof Package; title: string; text: string; href?: (id: string) => string }[] = [
  { panel: "profile", icon: FileText, title: "Business Profile", text: "Business details, contacts, currency, timezone" },
  { panel: "records", icon: Package, title: "Business Records", text: "View sales, purchases, expenses and more" },
  { panel: "users", icon: Users, title: "Users & Access", text: "Users, roles and permissions" },
  { panel: "branches", icon: Warehouse, title: "Branches & Warehouses", text: "Branches, warehouses and stock locations" },
  { panel: "subscription", icon: CreditCard, title: "Subscription & Billing", text: "Plan, invoices, payments and usage" },
  { panel: "modules", icon: Layers, title: "Modules & Features", text: "Enable or disable ERP modules" },
  { panel: "approvals", icon: ShieldCheck, title: "Approvals", text: "Review and decide on business requests" },
  { panel: "data", icon: Database, title: "Data Management", text: "Archive, reset, clean, correct and more" },
  { panel: "activity", icon: History, title: "Activity & Audit", text: "Full activity logs and operation history" },
  { panel: "security", icon: Lock, title: "Security", text: "Account status and recent security events" },
  { panel: "profile", icon: Settings, title: "Business Settings", text: "Currency, VAT and branch options" },
  { panel: "operations", icon: Power, title: "Business Actions", text: "Suspend, reactivate, export or archive" },
];

/** The first page of a business: real totals, a door to every section, the plan and its limits, and what happened last. */
export function ControlCenter({ tenant, stats, limits, branches, usersCount, events }: { tenant: AdminTenant; stats?: AdminTenantStats; limits?: TenantLimits; branches: AdminBranch[]; usersCount: number; events: AdminTenantRecord[] }) {
  const billing = useBillingOverview(tenant.id);
  const sub = billing.data?.subscription;
  const plan = billing.data?.plan_name ?? (/^[a-f0-9-]{36}$/i.test(tenant.subscription_plan) ? "Managed plan" : tenant.subscription_plan);
  const money = (n: number | undefined) => (n === undefined ? "—" : billingMoney(n, tenant.currency));
  const num = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());
  return (
    <div className="space-y-4">
      <div><h2 className="pesaa-card-title text-lg">Business Control Center</h2><p className="mt-0.5 text-[12.5px] text-muted">Complete management and oversight for {tenant.name}. Figures are all-time totals.</p></div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <Kpi icon={ShoppingCart} label="Total sales" value={money(stats?.revenue)} sub={stats ? `${num(stats.completed_orders)} completed` : undefined} />
            <Kpi icon={Receipt} label="Orders" value={num(stats?.orders)} />
            <Kpi icon={Boxes} label="Products" value={num(stats?.products)} />
            <Kpi icon={UserRound} label="Customers" value={num(stats?.customers)} />
            <Kpi icon={Wallet} label="Expenses" value={money(stats?.expenses)} sub="Approved" />
            <Kpi icon={Archive} label="Stock value" value={money(stats?.stock_value)} sub="At cost" />
          </section>
          <section aria-labelledby="ops" className="rounded-xl border border-border bg-card p-4">
            <h3 id="ops" className="pesaa-card-title">Business Operations</h3><p className="mt-0.5 text-[12.5px] text-muted">Manage all aspects of this business from one place.</p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {TILES.map((t) => { const Icon = t.icon; const tab = BUSINESS_TABS.find((b) => b.panels.includes(t.panel))!;
                return (
                  <Link key={t.title} href={t.href ? t.href(tenant.id) : tab.href ? tab.href(tenant.id) : `/tenants/${encodeURIComponent(tenant.id)}?tab=${t.panel}`}
                    className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-accent/40 hover:bg-surface/50 focus-visible:outline-2 focus-visible:outline-accent">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={16} aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold group-hover:text-accent">{t.title}</span><span className="block text-[11.5px] leading-snug text-muted">{t.text}</span></span>
                    <ChevronRight size={14} className="flex-shrink-0 text-muted" aria-hidden /></Link>); })}
            </div>
          </section>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Business Information" action={<Link href={`/tenants/${encodeURIComponent(tenant.id)}?tab=profile`} className="text-[12px] font-semibold text-accent hover:underline">Edit</Link>}>
            <dl className="text-[13px]">{([["Business name", tenant.name], ["Business ID", tenant.id.slice(0, 8)], ["Country", tenant.country], ["Currency", tenant.currency], ["Industry", tenant.industry]] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"><dt className="text-muted">{k}</dt><dd className="min-w-0 truncate text-right font-semibold">{v || "—"}</dd></div>))}</dl>
          </Card>
          <Card title="Subscription & Usage" action={<Link href={tabHref(BUSINESS_TABS.find((b) => b.key === "billing")!, tenant.id)} className="text-[12px] font-semibold text-accent hover:underline">Manage</Link>}>
            <p className="text-[13px]"><span className="font-bold capitalize">{plan}</span> <span className="capitalize text-muted">· {tenant.subscription_status}</span></p>
            {sub && <p className="mt-0.5 text-[11.5px] text-muted">Renews {billingDate(sub.period_end)}</p>}
            <div className="mt-3 space-y-2.5"><Meter label="Users" used={usersCount} allowed={limits?.max_users ?? null} /><Meter label="Branches" used={branches.length} allowed={limits?.max_branches ?? null} />{stats && <Meter label="Products" used={stats.products} allowed={limits?.max_products ?? null} />}</div>
          </Card>
          <Card title="Recent Business Activity" action={<Link href={`/tenants/${encodeURIComponent(tenant.id)}?tab=activity`} className="text-[12px] font-semibold text-accent hover:underline">View all</Link>}>
            {events.length === 0 ? <p className="text-[12.5px] text-muted">No activity recorded yet.</p> : (
              <ul className="divide-y divide-border">{events.slice(0, 5).map((e) => <li key={e.id} className="py-2 text-[12.5px]"><p className="truncate font-semibold">{e.title ?? e.reference ?? "Activity"}</p><p className="text-[11px] text-muted">{[e.counterparty, e.recorded_at ? fmtRelative(e.recorded_at) : null].filter(Boolean).join(" · ")}</p></li>)}</ul>)}
          </Card>
        </div>
      </div>
    </div>
  );
}
