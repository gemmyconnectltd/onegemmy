"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Database, FileText, History, Home, Layers, Package, ShieldCheck, Users, Warehouse, CreditCard, Lock } from "lucide-react";
import { tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";
import { resolveUploadUrl } from "@/lib/api/client";
import { TenantLogo, TenantStatusBadge } from "@/components/tenants/StatusBadge";
import { cn } from "@/lib/utils";

export interface BusinessTab { key: string; label: string; icon: typeof Home; /** the page `?tab=` values this tab covers; the first is where the tab opens */ panels: string[]; href?: (id: string) => string }

/** The eleven sections of a business, in the order the platform team works through them. */
export const BUSINESS_TABS: BusinessTab[] = [
  { key: "overview", label: "Overview", icon: Home, panels: ["overview"] },
  { key: "profile", label: "Business Profile", icon: FileText, panels: ["profile", "operations"] },
  { key: "records", label: "Records", icon: Package, panels: ["records"] },
  { key: "users", label: "Users & Access", icon: Users, panels: ["users", "user-access"] },
  { key: "branches", label: "Branches & Warehouses", icon: Warehouse, panels: ["branches"] },
  { key: "billing", label: "Subscription & Billing", icon: CreditCard, panels: ["subscription", "usage", "invoices"] },
  { key: "modules", label: "Modules", icon: Layers, panels: ["modules"] },
  { key: "approvals", label: "Approvals", icon: ShieldCheck, panels: ["approvals"] },
  { key: "data", label: "Data Management", icon: Database, panels: ["data"], href: (id) => `/tenants/${id}/data` },
  { key: "activity", label: "Activity & Audit", icon: History, panels: ["activity"] },
  { key: "security", label: "Security", icon: Lock, panels: ["security"] },
];
export const tabHref = (tab: BusinessTab, id: string) => tab.href?.(id) ?? `/tenants/${encodeURIComponent(id)}?tab=${tab.panels[0]}`;
export const tabOf = (panel: string) => BUSINESS_TABS.find((t) => t.panels.includes(panel)) ?? BUSINESS_TABS[0];

/** Breadcrumb, the business's identity, the page's own actions and the section strip: the same frame on every business page. */
export function BusinessShell({ tenant, panel, actions, notice, children }: { tenant: AdminTenant; panel: string; actions?: ReactNode; notice?: ReactNode; children: ReactNode }) {
  const active = tabOf(panel);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TenantLogo name={tenant.name} src={resolveUploadUrl(tenant.logo_url)} size={48} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{tenant.name}</h1><TenantStatusBadge tenant={tenant} /></div>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{[tenant.country, tenant.created_at ? `Registered ${new Date(tenant.created_at).toLocaleDateString()}` : null, tenantStatusLabel(tenant) === "Active" ? null : tenantStatusLabel(tenant)].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {notice}
      <nav aria-label="Business sections" className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto border-b border-border px-1">
        {BUSINESS_TABS.map((t) => {
          const Icon = t.icon;
          const on = t.key === active.key;
          return (
            <Link key={t.key} href={tabHref(t, tenant.id)} aria-current={on ? "page" : undefined}
              className={cn("-mb-px flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent", on ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground")}>
              <Icon size={14} aria-hidden />{t.label}</Link>);
        })}
      </nav>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** The small switch between the parts of one section (for example Subscription, Usage and Invoices). */
export function SubTabs({ items, active, onSelect, label }: { items: { key: string; label: string; count?: number }[]; active: string; onSelect: (key: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 text-[12.5px] font-semibold sm:w-fit">
      {items.map((i) => <button key={i.key} type="button" aria-pressed={active === i.key} onClick={() => onSelect(i.key)} className={cn("flex-shrink-0 rounded-md px-3 py-1.5", active === i.key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground")}>{i.label}{i.count !== undefined && <span className="ml-1 text-muted">{i.count}</span>}</button>)}
    </div>
  );
}
