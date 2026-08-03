"use client";
import { Building2, Users, ShoppingCart, TrendingUp, Activity, CheckCircle, XCircle, Package, Loader2 } from "lucide-react";
import { useAdminStats } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "@/components/charts/lazy";
import Link from "next/link";

export default function AdminOverviewPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const { data: stats, isLoading, isError } = useAdminStats();
  const error = isError ? "Failed to load platform stats" : null;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );

  if (error || !stats) return (
    <div className="text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
  );

  const cards = [
    { label: "Total Tenants",    value: stats.total_tenants,    icon: Building2,    color: c.blue },
    { label: "Active Tenants",   value: stats.active_tenants,   icon: CheckCircle,  color: c.income },
    { label: "Suspended",        value: stats.suspended_tenants,icon: XCircle,      color: c.expenses },
    { label: "Total Users",      value: stats.total_users,      icon: Users,        color: c.primary },
    { label: "Total Orders",     value: stats.total_orders,     icon: ShoppingCart, color: c.gold },
    { label: "Completed Orders", value: stats.completed_orders, icon: Activity,     color: c.income },
    { label: "Total Products",   value: stats.total_products,   icon: Package,      color: c.gray },
    { label: "Platform Revenue", value: fmtMoney(stats.total_revenue), icon: TrendingUp, color: c.profit, isString: true },
  ];

  const planColors: Record<string, string> = {
    free: c.gray, starter: c.blue, professional: c.primary, enterprise: c.gold,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted mt-0.5">Monitor all tenants and platform health</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${card.color}18` }}>
              <card.icon size={17} style={{ color: card.color }} />
            </div>
            <p className="text-lg font-extrabold text-foreground tracking-tight truncate">{card.isString ? card.value : card.value.toLocaleString()}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly signups chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">New Tenants (6 months)</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly_signups}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={c.tooltip} />
                <Bar dataKey="count" fill={c.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan breakdown */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Tenants by Plan</h2>
          <div className="space-y-3">
            {Object.entries(stats.plans).map(([plan, count]) => {
              const pct = stats.total_tenants > 0 ? Math.round((count / stats.total_tenants) * 100) : 0;
              const color = planColors[plan] ?? c.gray;
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold text-foreground capitalize">{plan}</span>
                    <span className="text-[12px] text-muted">{count} tenant{count !== 1 ? "s" : ""} · {pct}%</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(stats.plans).length === 0 && (
              <p className="text-sm text-muted text-center py-6">No plan data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick link */}
      <div className="flex justify-end">
        <Link href="/admin/tenants" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-colors">
          <Building2 size={15} /> Manage Tenants
        </Link>
      </div>
    </div>
  );
}
