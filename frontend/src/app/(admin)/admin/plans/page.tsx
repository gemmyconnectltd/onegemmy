"use client";
import { Building2, CheckCircle, XCircle, Loader2, Crown } from "lucide-react";
import { useAdminStats, useTenants } from "@/lib/api/hooks";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import Link from "next/link";

const PLAN_LABELS: Record<string, { desc: string; color: string }> = {
  free:        { desc: "Trial essentials for small businesses",  color: "#64748b" },
  starter:     { desc: "Growing teams with core modules",         color: "#0284c7" },
  professional:{ desc: "Full modules for scaling operations",     color: "#8b5cf6" },
  enterprise:  { desc: "Unlimited everything + priority support", color: "#d97706" },
};

export default function AdminPlansPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const { data: stats, isLoading: statsLoading, isError: statsError } = useAdminStats();
  const { data: tenantsData, isLoading: tenantsLoading } = useTenants(1, 100);
  const tenants = tenantsData?.items ?? [];

  if (statsLoading || tenantsLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );

  if (statsError || !stats) return (
    <div className="text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">Failed to load plan data</div>
  );

  const planKeys = Object.keys(stats.plans);
  const plansByTenant: Record<string, typeof tenants> = {};
  for (const t of tenants) {
    const plan = t.subscription_plan ?? "free";
    (plansByTenant[plan] ??= []).push(t);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Plans</h1>
        <p className="text-sm text-muted mt-0.5">Subscription breakdown across all tenants</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {planKeys.map((plan) => {
          const count = stats.plans[plan];
          const meta = PLAN_LABELS[plan] ?? { desc: "", color: c.gray };
          const pct = stats.total_tenants > 0 ? Math.round((count / stats.total_tenants) * 100) : 0;
          return (
            <div key={plan} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}18` }}>
                  <Crown size={15} style={{ color: meta.color }} />
                </div>
                <span className="text-2xl font-extrabold text-foreground tracking-tight">{count}</span>
              </div>
              <p className="text-sm font-bold text-foreground capitalize">{plan}</p>
              <p className="text-[11px] text-muted mt-0.5">{meta.desc}</p>
              <p className="text-[11px] text-muted mt-1">{pct}% of tenants</p>
            </div>
          );
        })}
        {planKeys.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted">No plan data yet</div>
        )}
      </div>

      {planKeys.map((plan) => {
        const list = plansByTenant[plan] ?? [];
        return (
          <div key={plan} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground capitalize flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLAN_LABELS[plan]?.color ?? c.gray }} />
                {plan} <span className="text-muted font-semibold">({list.length})</span>
              </h2>
            </div>
            {list.length === 0 ? (
              <div className="py-10 text-center">
                <Building2 size={26} className="text-muted/30 mx-auto mb-2" />
                <p className="text-sm text-muted">No tenants on this plan</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider">
                    <th className="px-5 py-3 font-semibold">Business</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map((t) => (
                    <tr key={t.id} className="hover:bg-surface/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/tenants/${t.id}`} className="group flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                            <Building2 size={14} className="text-violet-600 dark:text-violet-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">{t.name}</p>
                            <p className="text-[11px] text-muted font-mono">{t.slug}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`flex items-center gap-1.5 text-[11px] font-semibold w-fit ${t.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {t.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {t.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-muted">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
