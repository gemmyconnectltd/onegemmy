"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Database, FileText, History, Home, Layers, Package, Percent, ShieldCheck, Users, Warehouse, CreditCard, Lock } from "lucide-react";
import { tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";
import { resolveUploadUrl } from "@/lib/api/client";
import { TenantLogo, TenantStatusBadge } from "@/components/tenants/StatusBadge";
import { cn } from "@/lib/utils";
import { SecondaryNav, SectionLayout } from "@/components/ui/SecondaryNav";

export interface BusinessTab { /** the heading it sits under in the business sidebar */ group: string; key: string; label: string; icon: typeof Home; /** the page `?tab=` values this tab covers; the first is where the tab opens */ panels: string[]; href?: (id: string) => string }

/** The sections of a business, grouped the way the platform team works through them (shown in the business sidebar). */
export const BUSINESS_TABS: BusinessTab[] = [
  { group: "Business", key: "overview", label: "Overview", icon: Home, panels: ["overview"] },
  { group: "Business", key: "profile", label: "Business Profile", icon: FileText, panels: ["profile", "operations"] },
  { group: "Business", key: "branches", label: "Branches & Warehouses", icon: Warehouse, panels: ["branches"] },
  { group: "People", key: "users", label: "Users & Access", icon: Users, panels: ["users", "user-access"] },
  { group: "Operations", key: "records", label: "Records", icon: Package, panels: ["records"] },
  { group: "Operations", key: "approvals", label: "Approvals", icon: ShieldCheck, panels: ["approvals"] },
  { group: "Operations", key: "discounts", label: "Discounts & Promotions", icon: Percent, panels: ["discounts", "sales-settings"] },
  { group: "Operations", key: "modules", label: "Modules", icon: Layers, panels: ["modules"] },
  { group: "Plan & billing", key: "billing", label: "Subscription & Billing", icon: CreditCard, panels: ["subscription", "usage", "invoices"] },
  { group: "Control", key: "data", label: "Data Management", icon: Database, panels: ["data"], href: (id) => `/tenants/${id}/data` },
  { group: "Control", key: "activity", label: "Activity & Audit", icon: History, panels: ["activity"] },
  { group: "Control", key: "security", label: "Security", icon: Lock, panels: ["security"] },
];
export const tabHref = (tab: BusinessTab, id: string) => tab.href?.(id) ?? `/tenants/${encodeURIComponent(id)}?tab=${tab.panels[0]}`;
export const tabOf = (panel: string) => BUSINESS_TABS.find((t) => t.panels.includes(panel)) ?? BUSINESS_TABS[0];

/** Breadcrumb, the business's identity, the page's own actions and the section strip: the same frame on every business page. */
export function BusinessShell({ tenant, panel, actions, notice, children }: { tenant: AdminTenant; panel: string; actions?: ReactNode; notice?: ReactNode; children: ReactNode }) {
  const active = tabOf(panel);
  const router = useRouter();
  const groups = [...new Set(BUSINESS_TABS.map((t) => t.group))];
  const items = BUSINESS_TABS.map((t) => ({ group: t.group, key: t.key, label: t.label, icon: t.icon, href: tabHref(t, tenant.id), active: t.key === active.key }));
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TenantLogo name={tenant.name} src={resolveUploadUrl(tenant.logo_url)} size={44} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{tenant.name}</h1><TenantStatusBadge tenant={tenant} /></div>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{[tenant.country, tenant.created_at ? `Registered ${new Date(tenant.created_at).toLocaleDateString()}` : null, tenantStatusLabel(tenant) === "Active" ? null : tenantStatusLabel(tenant)].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">{actions}</div>}
      </header>
      {/* Phones: one picker with the same groups as the sidebar, instead of twelve tabs to scroll through. */}
      <div className="lg:hidden">
        <label htmlFor="business-section" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Section</label>
        <select id="business-section" value={active.key} onChange={(e) => { const t = BUSINESS_TABS.find((x) => x.key === e.target.value); if (t) router.push(tabHref(t, tenant.id)); }}
          className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent">
          {groups.map((g) => <optgroup key={g} label={g}>{BUSINESS_TABS.filter((t) => t.group === g).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>)}
        </select>
      </div>
      <SectionLayout nav={<div className="hidden flex-shrink-0 lg:block"><SecondaryNav label="Business sections" items={items} /></div>}>{notice}{children}</SectionLayout>
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
