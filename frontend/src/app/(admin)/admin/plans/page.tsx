"use client";
import { Building2, CheckCircle, XCircle, Crown, TrendingUp, AlertTriangle, ArrowUpRight } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAdminStats, useTenants } from "@/lib/api/hooks";
import Link from "next/link";

const PLANS: Record<string, { desc: string; color: string; features: string[] }> = {
  free:         { desc: "Trial essentials for small businesses",  color: "#64748b", features: ["Basic dashboard", "Up to 2 users", "Core modules"] },
  starter:      { desc: "Growing teams with core modules",        color: "#0284c7", features: ["All free features", "Up to 10 users", "Inventory & Sales"] },
  professional: { desc: "Full modules for scaling operations",    color: "#8b5cf6", features: ["All starter features", "Unlimited users", "HR & Accounting"] },
  enterprise:   { desc: "Unlimited everything + priority support",color: "#d97706", features: ["All pro features", "Custom integrations", "Priority support"] },
};

export default function AdminPlansPage() {
  const { data: stats, isLoading: statsLoading, isError: statsError } = useAdminStats();
  const { data: tenantsData, isLoading: tenantsLoading } = useTenants(1, 200);
  const tenants = tenantsData?.items ?? [];

  if (statsLoading || tenantsLoading) return <PageLoader />;

  if (statsError || !stats) return (
    <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertTriangle size={15} /> Failed to load plan data
    </div>
  );

  const plansByTenant: Record<string, typeof tenants> = {};
  for (const t of tenants) {
    const plan = t.subscription_plan ?? "free";
    (plansByTenant[plan] ??= []).push(t);
  }

  const allPlans = Object.keys(PLANS);
  const activePlans = allPlans.filter((p) => (stats.plans[p] ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Plans</h1>
        <p className="text-sm text-muted mt-0.5">Subscription breakdown across {stats.total_tenants} tenants</p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {allPlans.map((plan) => {
          const count = stats.plans[plan] ?? 0;
          const meta = PLANS[plan];
          const pct = stats.total_tenants > 0 ? Math.round((count / stats.total_tenants) * 100) : 0;
          const isTop = count === Math.max(...Object.values(stats.plans));
          return (
            <div key={plan} className={`bg-card border rounded-xl p-5 hover:shadow-md transition-shadow relative overflow-hidden ${isTop && count > 0 ? "border-accent/30 shadow-sm" : "border-border"}`}>
              {isTop && count > 0 && (
                <div className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">TOP</div>
              )}
              <div className="absolute bottom-0 right-0 w-20 h-20 rounded-tl-full opacity-5" style={{ backgroundColor: meta.color }} />
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${meta.color}18` }}>
                  <Crown size={16} style={{ color: meta.color }} />
                </div>
                <span className="text-3xl font-extrabold text-foreground">{count}</span>
              </div>
              <p className="text-sm font-bold text-foreground capitalize">{plan}</p>
              <p className="text-[11px] text-muted mt-0.5 mb-3">{meta.desc}</p>
              <div className="h-1 bg-border rounded-full overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
              </div>
              <p className="text-[11px] text-muted">{pct}% of tenants</p>
            </div>
          );
        })}
      </div>

      {/* Revenue insight */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <TrendingUp size={18} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Upgrade Opportunity</p>
          <p className="text-[12px] text-muted mt-0.5">
            {(stats.plans["free"] ?? 0)} tenant{(stats.plans["free"] ?? 0) !== 1 ? "s" : ""} on free plan could be converted to paid.
          </p>
        </div>
        <Link href="/admin/tenants?plan=free" className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline whitespace-nowrap">
          View free tenants <ArrowUpRight size={12} />
        </Link>
      </div>

      {/* Tenants by plan */}
      {activePlans.map((plan) => {
        const list = plansByTenant[plan] ?? [];
        const meta = PLANS[plan];
        return (
          <div key={plan} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface/30">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}18` }}>
                  <Crown size={13} style={{ color: meta.color }} />
                </div>
                <h2 className="text-sm font-bold text-foreground capitalize">{plan}</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-surface text-muted border border-border">{list.length} tenant{list.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {meta.features.map((f) => (
                  <span key={f} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface text-muted border border-border">{f}</span>
                ))}
              </div>
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
                    <th className="px-5 py-3 font-semibold hidden sm:table-cell">Location</th>
                    <th className="px-5 py-3 font-semibold hidden md:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map((t) => (
                    <tr key={t.id} className="hover:bg-surface/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/tenants/${t.id}`} className="group flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border" style={{ backgroundColor: `${meta.color}15`, borderColor: `${meta.color}20` }}>
                            <span className="text-[12px] font-bold" style={{ color: meta.color }}>{t.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">{t.name}</p>
                            <p className="text-[11px] text-muted font-mono">{t.slug}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`flex items-center gap-1.5 text-[11px] font-semibold w-fit px-2 py-0.5 rounded-lg ${t.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                          {t.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                          {t.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell text-[12px] text-muted">
                        {[t.city, t.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-[12px] text-muted">
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
