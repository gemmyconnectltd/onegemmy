"use client";
import {
  Building2, Users, ShoppingCart, TrendingUp, Activity, CheckCircle,
  XCircle, Package, Loader2, ArrowUpRight, ArrowRight, Crown,
  AlertTriangle, Server,
} from "lucide-react";
import { useAdminStats } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "@/components/charts/lazy";
import Link from "next/link";

const PLAN_COLORS: Record<string, string> = {
  free: "#64748b", starter: "#0284c7", professional: "#8b5cf6", enterprise: "#d97706",
};

export default function AdminOverviewPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const { data: stats, isLoading, isError } = useAdminStats();

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );

  if (isError || !stats) return (
    <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertTriangle size={16} /> Failed to load platform stats. Check your connection.
    </div>
  );

  const healthScore = stats.total_tenants > 0
    ? Math.round((stats.active_tenants / stats.total_tenants) * 100)
    : 100;

  const completionRate = stats.total_orders > 0
    ? Math.round((stats.completed_orders / stats.total_orders) * 100)
    : 0;

  const cards = [
    { label: "Total Tenants",    value: stats.total_tenants,    sub: `${stats.active_tenants} active`,    icon: Building2,    color: "#0284c7", href: "/admin/tenants" },
    { label: "Total Users",      value: stats.total_users,      sub: "across all tenants",                icon: Users,        color: "#8b5cf6", href: "/admin/users" },
    { label: "Total Orders",     value: stats.total_orders,     sub: `${completionRate}% completed`,      icon: ShoppingCart, color: "#059669", href: null },
    { label: "Platform Revenue", value: fmtMoney(stats.total_revenue), sub: "all time", icon: TrendingUp, color: "#d97706", href: null, isString: true },
    { label: "Products",         value: stats.total_products,   sub: "in catalog",                        icon: Package,      color: "#0e7490", href: null },
    { label: "Suspended",        value: stats.suspended_tenants,sub: "need attention",                    icon: XCircle,      color: stats.suspended_tenants > 0 ? "#ef4444" : "#64748b", href: "/admin/tenants" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Platform Overview</h1>
          <p className="text-sm text-muted mt-0.5">Monitor all tenants, users and platform health</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Server size={13} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">System Online</span>
          </div>
        </div>
      </div>

      {/* Suspended warning */}
      {stats.suspended_tenants > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-sm font-medium">
          <AlertTriangle size={15} />
          {stats.suspended_tenants} tenant{stats.suspended_tenants > 1 ? "s are" : " is"} currently suspended.
          <Link href="/admin/tenants" className="ml-auto flex items-center gap-1 text-[12px] font-semibold hover:underline">
            Review <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-5" style={{ backgroundColor: card.color }} />
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${card.color}18` }}>
              <card.icon size={16} style={{ color: card.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight truncate">
              {card.isString ? card.value : Number(card.value).toLocaleString()}
            </p>
            <p className="text-[11px] font-semibold text-foreground mt-0.5">{card.label}</p>
            <p className="text-[10px] text-muted mt-0.5">{card.sub}</p>
            {card.href && (
              <Link href={card.href} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight size={13} className="text-muted" />
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly signups chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">New Tenants</h2>
              <p className="text-[11px] text-muted">Last 6 months</p>
            </div>
            <Activity size={15} className="text-muted" />
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly_signups}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={c.tooltip} cursor={{ fill: `${c.primary}10` }} />
                <Bar dataKey="count" fill={c.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Platform health */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-foreground mb-4">Platform Health</h2>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-foreground">Tenant Health</span>
                  <span className="text-[12px] font-bold" style={{ color: healthScore >= 80 ? "#059669" : healthScore >= 50 ? "#d97706" : "#ef4444" }}>{healthScore}%</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${healthScore}%`, backgroundColor: healthScore >= 80 ? "#059669" : healthScore >= 50 ? "#d97706" : "#ef4444" }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-foreground">Order Completion</span>
                  <span className="text-[12px] font-bold text-foreground">{completionRate}%</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${completionRate}%` }} />
                </div>
              </div>
              <div className="pt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle size={13} /> {stats.active_tenants} Active
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-red-500 font-semibold">
                  <XCircle size={13} /> {stats.suspended_tenants} Suspended
                </div>
              </div>
            </div>
          </div>

          {/* Plan breakdown */}
          <div className="bg-card border border-border rounded-xl p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-foreground">Plans</h2>
              <Link href="/admin/plans" className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {Object.entries(stats.plans).map(([plan, count]) => {
                const pct = stats.total_tenants > 0 ? Math.round((count / stats.total_tenants) * 100) : 0;
                const color = PLAN_COLORS[plan] ?? "#64748b";
                return (
                  <div key={plan}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Crown size={11} style={{ color }} />
                        <span className="text-[12px] font-semibold text-foreground capitalize">{plan}</span>
                      </div>
                      <span className="text-[11px] text-muted">{count} · {pct}%</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
              {Object.keys(stats.plans).length === 0 && (
                <p className="text-sm text-muted text-center py-4">No plan data yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Manage Tenants", href: "/admin/tenants", icon: Building2, color: "#0284c7" },
          { label: "Manage Users",   href: "/admin/users",   icon: Users,     color: "#8b5cf6" },
          { label: "View Plans",     href: "/admin/plans",   icon: Crown,     color: "#d97706" },
          { label: "Settings",       href: "/admin/settings",icon: Activity,  color: "#64748b" },
        ].map((a) => (
          <Link key={a.label} href={a.href}
            className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl hover:shadow-md hover:border-accent/30 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${a.color}15` }}>
              <a.icon size={15} style={{ color: a.color }} />
            </div>
            <span className="text-[13px] font-semibold text-foreground group-hover:text-accent transition-colors">{a.label}</span>
            <ArrowUpRight size={13} className="text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </div>
    </div>
  );
}
