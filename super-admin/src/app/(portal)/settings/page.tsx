"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Coins, Plug, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config";
import { useAdminStats } from "@/lib/api/hooks";
import { PageLoader } from "@/components/ui/PageLoader";
import { PlatformCurrencySettings } from "@/components/admin/PlatformCurrencySettings";
import { AiSettings } from "@/components/admin/AiSettings";
import { NotAvailable, SettingRow } from "@/components/admin/settingsParts";
import { SecondaryNav, SectionLayout } from "@/components/ui/SecondaryNav";

const SECTIONS = [
  { key: "general", label: "General", icon: Settings2, desc: "Platform-wide behaviour." },
  { key: "currency", label: "Currency & Rates", icon: Coins, desc: "How cross-tenant money is compared." },
  { key: "ai", label: "Pesaa AI", icon: Sparkles, desc: "Availability and request limits." },
  { key: "security", label: "Security", icon: ShieldCheck, desc: "Applies to Pesaa platform administrators, not to each business's own policies." },
  { key: "notifications", label: "Notifications", icon: Bell, desc: "Email alerts for platform events." },
  { key: "api", label: "API & Integrations", icon: Plug, desc: "Connection details for the Pesaa API." },
] as const;
type Key = (typeof SECTIONS)[number]["key"];

/** The API origin comes from the same env var the portal's API client uses — never a hard-coded dev URL. */
function apiInfo() {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  let origin = base;
  let local = false;
  try { const u = new URL(base); origin = u.origin; local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname); } catch { /* keep raw */ }
  return { base, origin, local };
}

function SettingsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const stats = useAdminStats({ retry: false });
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const active: Key = (SECTIONS.find((s) => s.key === params.get("section"))?.key ?? "general");
  const meta = SECTIONS.find((s) => s.key === active)!;
  const api = apiInfo();

  const setDirtyFor = useCallback((k: string) => (d: boolean) => setDirty((p) => (p[k] === d ? p : { ...p, [k]: d })), []);
  const dirtyCurrency = setDirtyFor("currency");
  const dirtyAi = setDirtyFor("ai");
  const anyDirty = Object.values(dirty).some(Boolean);

  // Leaving the page (reload, close tab) with unsaved edits asks first. Switching sections keeps them — every
  // section stays mounted — and the dot in the navigation shows which ones are pending.
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const go = (k: Key) => router.replace(`${pathname}?section=${k}`, { scroll: false });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">Platform-wide configuration. Signed in as {user?.name ?? "—"}{user?.email ? ` (${user.email})` : ""}.</p>
      </div>

      <SectionLayout nav={<SecondaryNav label="Settings sections" title="Settings" items={SECTIONS.map((x) => ({ key: x.key, label: x.label, icon: x.icon, dot: x.key === "currency" ? dirty.currency : x.key === "ai" ? dirty.ai : false, active: x.key === active, onSelect: () => go(x.key) }))} />}>
        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-2 border-b border-border pb-4"><h2 className="text-base font-bold text-foreground">{meta.label}</h2><p className="mt-0.5 text-[12.5px] text-muted">{meta.desc}</p></div>

            <section hidden={active !== "general"}>
              <SettingRow label="Platform name"><span className="text-sm font-semibold text-foreground">{siteConfig.name}</span></SettingRow>
              <NotAvailable label="Allow public registration" hint="Whether new businesses can sign up on their own." />
              <NotAvailable label="Maintenance mode" hint="Temporarily block tenant access while you work on the platform." />
              <NotAvailable label="Default tenant plan" hint="The plan new businesses start on. Set per tenant when you add one." />
              <p className="pt-3 text-[12px] text-muted">These platform switches have no backend support yet, so they can&apos;t be saved or enforced. They&apos;ll appear here as real controls once they do.</p>
            </section>
            <section hidden={active !== "currency"}><PlatformCurrencySettings onDirtyChange={dirtyCurrency} /></section>
            <section hidden={active !== "ai"}><AiSettings onDirtyChange={dirtyAi} /></section>
            <section hidden={active !== "security"}>
              <NotAvailable label="Require 2FA for platform administrators" />
              <NotAvailable label="Session timeout" />
              <NotAvailable label="Maximum login attempts" />
              <p className="pt-3 text-[12px] text-muted">The backend doesn&apos;t enforce any of these yet, so no switch is shown that would only look like it works. Business-level security (users, sessions) is managed under each tenant.</p>
            </section>
            <section hidden={active !== "notifications"}>
              <NotAvailable label="Email alerts for new tenant registrations" />
              <NotAvailable label="Email alerts for suspended tenants" />
              <NotAvailable label="Daily platform summary email" />
              <p className="pt-3 text-[12px] text-muted">Platform notification emails aren&apos;t built yet, so there are no preferences to save.</p>
            </section>
            <section hidden={active !== "api"}>
              <SettingRow label="API base URL" hint={api.local ? "Local development server." : undefined}><code className="break-all text-[12.5px] text-foreground">{api.base}</code></SettingRow>
              <SettingRow label="Connection">
                {stats.isLoading ? <span className="text-[12.5px] text-muted">Checking…</span> : stats.isSuccess
                  ? <span className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Reachable</span>
                  : <span className="flex items-center gap-1.5 text-[13px] font-semibold text-red-600 dark:text-red-400"><span className="h-2 w-2 rounded-full bg-red-500" /> Not reachable</span>}
              </SettingRow>
              <SettingRow label="API documentation" hint={api.local ? "Only available on a local development server." : "Interactive docs are disabled on production servers."}>
                {api.local
                  ? <a href={`${api.origin}/docs`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-accent hover:underline">Open local API docs ↗</a>
                  : <span className="text-[12.5px] text-muted">Not published</span>}
              </SettingRow>
              <p className="pt-3 text-[12px] text-muted">Keys and secrets are server configuration and are never shown here.</p>
            </section>
          </div>
        </div>
      </SectionLayout>
    </div>
  );
}

export default function AdminSettingsPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><SettingsInner /></Suspense>;
}
