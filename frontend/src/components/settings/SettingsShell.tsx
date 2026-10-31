"use client";

import Link from "next/link";
import { Bell, ExternalLink, Palette, Settings, ShieldCheck, Wallet } from "lucide-react";
import { useCurrentTenant } from "@/lib/api/hooks";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SETTINGS_TABS = [
  { icon: Settings, label: "General", href: "/settings" },
  { icon: Wallet, label: "Financial", href: "/settings/financial" },
  { icon: ShieldCheck, label: "Security", href: "/settings/security" },
  { icon: Bell, label: "Notifications", href: "/settings/notifications" },
  { icon: Palette, label: "Appearance", href: "/settings/appearance" },
] as const;

/**
 * Header and the Business Settings tabs. Other settings pages use their own
 * layout. My Profile lives outside settings and is reached from the account menu.
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: tenant } = useCurrentTenant();
  const shopUrl = tenant?.website && /^https?:\/\//i.test(tenant.website) ? tenant.website : null;
  const isTab = SETTINGS_TABS.some((t) => t.href === pathname);
  if (!isTab) return <>{children}</>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Business Settings</h1>
          <p className="mt-0.5 text-sm text-muted">Manage your business information, financial preferences and system configurations.</p>
        </div>
        {shopUrl && <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-semibold text-foreground hover:border-accent hover:text-accent">View Shop <ExternalLink size={14} /></a>}
      </div>
      <nav aria-label="Business settings" className="no-scrollbar flex overflow-x-auto border-b border-border">
        {SETTINGS_TABS.map((t) => {
          const on = t.href === pathname;
          const Icon = t.icon;
          return <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("flex items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent", on ? "border-accent text-accent" : "border-transparent text-muted hover:border-border hover:text-foreground")}><Icon size={16} />{t.label}</Link>;
        })}
      </nav>
      {children}
    </div>
  );
}
