"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, Building2, CalendarClock, Crown, Info, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableScroll } from "@/components/ui/TableScroll";
import { fmtRelative } from "@/lib/date";
import { type AdminAuditLog, type AdminBranch, type AdminTenant, type AdminTenantStats, type TenantLimits } from "@/lib/api/admin";
import { TenantStatusBadge } from "@/components/tenants/StatusBadge";

export type PanelTab = "overview" | "users" | "branches" | "subscription" | "usage" | "invoices" | "security" | "activity";

const BUSINESS_TYPE_LABELS: Record<string, string> = { sole: "Sole Proprietorship", partnership: "Partnership", llc: "Limited Liability (LLC)", unregistered: "Not Registered" };

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card p-4", className)}>
      {(title || action) && <div className="mb-3 flex items-center justify-between gap-2">{title && <h2 className="text-sm font-bold text-foreground">{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}
const TabLink = ({ tab, go, children }: { tab: PanelTab; go: (t: PanelTab) => void; children: ReactNode }) => (
  <button type="button" onClick={() => go(tab)} className="text-[12px] font-semibold text-accent hover:underline">{children}</button>
);
function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 text-[13px] last:border-0"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words text-right font-semibold text-foreground">{v}</dd></div>;
}
/** Shown wherever the platform has no real data yet — never filled with invented numbers. */
function Unavailable({ title, children }: { title: string; children: ReactNode }) {
  return <div className="flex gap-3 rounded-lg border border-dashed border-border p-3 text-[12.5px]"><Info size={15} className="mt-0.5 flex-shrink-0 text-muted" /><div className="min-w-0"><p className="font-semibold text-foreground">{title}</p><p className="mt-0.5 text-muted">{children}</p></div></div>;
}
function Meter({ label, used, allowed, unit }: { label: string; used: number | null; allowed: number | null; unit?: string }) {
  const known = used !== null;
  const pct = known && allowed ? Math.min(100, Math.round((used / allowed) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-[12.5px]"><span className="font-semibold">{label}</span><span className="text-muted">{known ? used.toLocaleString() : "—"} / {allowed === null ? "Unlimited" : allowed.toLocaleString()}{unit ? ` ${unit}` : ""}{known && allowed ? ` · ${pct}%` : ""}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label={label} aria-valuenow={used ?? undefined} aria-valuemin={0} aria-valuemax={allowed ?? undefined}>
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-accent")} style={{ width: allowed && known ? `${pct}%` : known ? "8%" : "0%" }} />
      </div>
    </div>
  );
}
const limit = (l: TenantLimits | undefined, k: keyof TenantLimits) => (l ? l[k] : null);

interface Common { tenant: AdminTenant; stats?: AdminTenantStats; limits?: TenantLimits; branches: AdminBranch[]; usersCount: number; go: (t: PanelTab) => void }

export function OverviewPanel({ tenant, stats, limits, branches, usersCount, go, controls }: Common & { controls: ReactNode }) {
  const profile: [string, ReactNode][] = ([
    ["Business name", tenant.name], ["Country", tenant.country], ["City", tenant.city], ["Industry", tenant.industry], ["Business type", BUSINESS_TYPE_LABELS[tenant.business_type ?? ""] ?? tenant.business_type],
    ["Phone", tenant.phone], ["Prefers to be contacted by", ({ email: "Email", phone: "Phone call", whatsapp: "WhatsApp" } as Record<string, string>)[tenant.preferred_contact ?? ""] ?? null], ["Address", tenant.address], ["Website", tenant.website && <a key="w" href={tenant.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{tenant.website}</a>],
    ["Employees", tenant.employee_count], ["Heard about us", tenant.heard_about], ["Registered", tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : null],
  ] as [string, ReactNode][]).filter(([, v]) => v);
  const mx = limit(limits, "max_users");
  const mb = limit(limits, "max_branches");
  const metric = (label: string, value: ReactNode, icon: React.ElementType, sub?: string) => {
    const Icon = icon;
    return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3"><span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={15} /></span><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-muted">{label}</p><p className="truncate text-[15px] font-extrabold capitalize leading-tight text-foreground">{value}</p>{sub && <p className="truncate text-[10.5px] text-muted">{sub}</p>}</div></div>;
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metric("Users", `${usersCount} / ${mx ?? "∞"}`, Users, "used / allowed")}
        {metric("Branches", `${branches.length} / ${mb ?? "∞"}`, Building2, "used / allowed")}
        {metric("Current plan", tenant.subscription_plan, Crown)}
        {metric("Next billing", "—", CalendarClock, "Billing API not connected")}
        {metric("Subscription", tenant.subscription_status, ShieldCheck)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Business profile"><dl>{profile.map(([k, v]) => <Row key={k} k={k} v={v} />)}</dl></Card>
        <Card title="Subscription summary" action={<TabLink tab="subscription" go={go}>Manage →</TabLink>}>
          <dl><Row k="Plan" v={<span className="capitalize">{tenant.subscription_plan}</span>} /><Row k="Status" v={<span className="capitalize">{tenant.subscription_status}</span>} /><Row k="Currency" v={tenant.currency} /><Row k="Billing cycle / price / renewal" v={<span className="font-normal text-muted">Not available yet</span>} /></dl>
        </Card>
        <Card title="Usage summary" action={<TabLink tab="usage" go={go}>Details →</TabLink>}>
          <div className="space-y-3"><Meter label="Users" used={usersCount} allowed={mx} /><Meter label="Branches" used={branches.length} allowed={mb} />{stats && <Meter label="Products" used={stats.products} allowed={limit(limits, "max_products")} />}</div>
        </Card>
        <Card title="Security summary" action={<TabLink tab="security" go={go}>Details →</TabLink>}>
          <dl><Row k="Account status" v={<TenantStatusBadge tenant={tenant} />} /><Row k="Active sessions" v={<span className="font-normal text-muted">Not reported by the API</span>} /><Row k="MFA" v={<span className="font-normal text-muted">Not reported by the API</span>} /></dl>
        </Card>
      </div>
      <Card title="Account settings">{controls}</Card>
    </div>
  );
}

export function UsagePanel({ tenant, stats, limits, branches, usersCount, currencySymbol }: Common & { currencySymbol: string }) {
  return (
    <div className="space-y-4">
      <Card title="Plan allowances">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Meter label="Users" used={usersCount} allowed={limit(limits, "max_users")} />
          <Meter label="Branches" used={branches.length} allowed={limit(limits, "max_branches")} />
          <Meter label="Products" used={stats?.products ?? null} allowed={limit(limits, "max_products")} />
          <Meter label="Storage" used={null} allowed={limit(limits, "max_storage_mb")} unit="MB" />
        </div>
        <p className="mt-3 text-[11.5px] text-muted">Allowances are the limits set for {tenant.name}. Storage consumption isn&apos;t reported by the platform yet. Billable users are user accounts in the business — active sessions and devices are not counted. These figures are current totals; no per-period history is recorded.</p>
      </Card>
      {stats && (
        <Card title="Business activity">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Total orders", stats.orders.toLocaleString()], ["Completed orders", stats.completed_orders.toLocaleString()], ["Products", stats.products.toLocaleString()], ["Revenue", `${currencySymbol} ${Math.round(stats.revenue).toLocaleString()}`]].map(([k, v]) => <div key={k} className="rounded-lg bg-surface p-3"><p className="text-[11px] text-muted">{k}</p><p className="truncate text-base font-extrabold">{v}</p></div>)}
          </div>
        </Card>
      )}
    </div>
  );
}

export function InvoicesPanel({ tenant }: { tenant: AdminTenant }) {
  return (
    <Card title="Subscription invoices">
      <Unavailable title="No platform invoices to show yet">Invoices Pesaa issues to {tenant.name} for its subscription will appear here once the billing API exists (invoice number, period, dates, amount, payment status). They are separate from invoices the business issues to its own customers. See the demo screens in <Link href="/invoices" className="text-accent underline">Plans &amp; Billing → Invoices</Link>.</Unavailable>
    </Card>
  );
}

const SECURITY_ACTION = /login|logout|password|session|role|permission|suspend|activate|invite|delete.*user|mfa|2fa/i;

export function SecurityPanel({ tenant, usersCount, inactiveUsers, events, eventsLoading }: { tenant: AdminTenant; usersCount: number; inactiveUsers: number; events: AdminAuditLog[]; eventsLoading: boolean }) {
  const sec = events.filter((e) => SECURITY_ACTION.test(`${e.action} ${e.summary}`)).slice(0, 15);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Access"><dl><Row k="Account status" v={<TenantStatusBadge tenant={tenant} />} /><Row k="Subscription" v={<span className="capitalize">{tenant.subscription_status}</span>} /><Row k="User accounts" v={usersCount} /><Row k="Inactive accounts" v={inactiveUsers} /></dl><p className="mt-2 text-[11.5px] text-muted">Reset a user&apos;s password or remove access from the Users tab.</p></Card>
        <Card title="Sessions & MFA"><Unavailable title="Not available from the admin API">Active sessions, device lists, login history and MFA status aren&apos;t exposed to platform admins yet, so none are shown (and there is no session-revoke button). Suspending the business signs everyone out.</Unavailable></Card>
      </div>
      <Card title="Recent security-related events">
        {eventsLoading ? <p className="text-[12.5px] text-muted">Loading…</p> : sec.length === 0 ? <p className="text-[12.5px] text-muted">No security-related events recorded in the latest platform activity.</p> : <EventList events={sec} />}
      </Card>
    </div>
  );
}

function EventList({ events }: { events: AdminAuditLog[] }) {
  return (
    <TableScroll label="Events"><table className="w-full min-w-[560px] text-left text-[13px]">
      <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted"><th scope="col" className="py-2 pr-3 font-semibold">Event</th><th scope="col" className="px-3 py-2 font-semibold">Actor</th><th scope="col" className="px-3 py-2 font-semibold">Type</th><th scope="col" className="px-3 py-2 font-semibold">When</th></tr></thead>
      <tbody className="divide-y divide-border">{events.map((e) => (
        <tr key={e.id}><td className="py-2 pr-3">{e.summary}<span className="block font-mono text-[10.5px] text-muted">{e.action}</span></td><td className="px-3 py-2">{e.actor_name ?? "System"}</td><td className="px-3 py-2 capitalize">{e.entity_type}</td><td className="px-3 py-2 text-[12px] text-muted" title={e.created_at ?? ""}>{fmtRelative(e.created_at)}</td></tr>
      ))}</tbody>
    </table></TableScroll>
  );
}

export function ActivityPanel({ events, loading, error, scanned }: { events: AdminAuditLog[]; loading: boolean; error: boolean; scanned: number }) {
  return (
    <Card title="Activity">
      {loading ? <p className="text-[12.5px] text-muted">Loading…</p> : error ? <p role="alert" className="text-[12.5px] text-red-600">Couldn&apos;t load the audit trail.</p> : events.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-8 text-center"><Activity size={26} className="text-muted/40" /><p className="text-sm font-semibold">No recorded events</p><p className="max-w-sm text-[12px] text-muted">None of the latest {scanned} platform audit events belong to this business.</p></div>
      ) : (<><EventList events={events} /><p className="mt-3 text-[11px] text-muted">Showing this business&apos;s events from the latest {scanned} platform audit entries (the audit API can&apos;t filter by tenant yet).</p></>)}
    </Card>
  );
}


