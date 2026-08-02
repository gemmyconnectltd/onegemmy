"use client";
import { useEffect, useState } from "react";
import { Building2, Users, ShoppingCart, TrendingUp, Activity, CheckCircle, XCircle, Package } from "lucide-react";
import { adminApi, type AdminPlatformStats } from "@/lib/api/admin";
import { fmtMoney } from "@/lib/config";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Link from "next/link";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.stats()
      .then((r) => setStats(r.data))
      .catch(() => setError("Failed to load platform stats"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !stats) return (
    <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
  );

  const cards = [
    { label: "Total Tenants",    value: stats.total_tenants,    icon: Building2,    color: "#8b5cf6" },
    { label: "Active Tenants",   value: stats.active_tenants,   icon: CheckCircle,  color: "#10b981" },
    { label: "Suspended",        value: stats.suspended_tenants,icon: XCircle,      color: "#ef4444" },
    { label: "Total Users",      value: stats.total_users,      icon: Users,        color: "#3b82f6" },
    { label: "Total Orders",     value: stats.total_orders,     icon: ShoppingCart, color: "#f59e0b" },
    { label: "Completed Orders", value: stats.completed_orders, icon: Activity,     color: "#10b981" },
    { label: "Total Products",   value: stats.total_products,   icon: Package,      color: "#6366f1" },
    { label: "Platform Revenue", value: fmtMoney(stats.total_revenue), icon: TrendingUp, color: "#10b981", isString: true },
  ];

  const planColors: Record<string, string> = {
    free: "#6b7280", starter: "#3b82f6", professional: "#8b5cf6", enterprise: "#f59e0b",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-sm text-white/40 mt-1">Monitor all tenants and platform health</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${c.color}20` }}>
              <c.icon size={16} style={{ color: c.color }} />
            </div>
            <p className="text-xl font-bold text-white">{c.isString ? c.value : c.value.toLocaleString()}</p>
            <p className="text-[11px] text-white/40 mt-0.5 font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly signups chart */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">New Tenants (6 months)</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly_signups}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12 }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan breakdown */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">Tenants by Plan</h2>
          <div className="space-y-3">
            {Object.entries(stats.plans).map(([plan, count]) => {
              const pct = stats.total_tenants > 0 ? Math.round((count / stats.total_tenants) * 100) : 0;
              const color = planColors[plan] ?? "#6b7280";
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold text-white capitalize">{plan}</span>
                    <span className="text-[12px] text-white/50">{count} tenant{count !== 1 ? "s" : ""} · {pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(stats.plans).length === 0 && (
              <p className="text-sm text-white/30 text-center py-6">No plan data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick link */}
      <div className="flex justify-end">
        <Link href="/admin/tenants" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
          <Building2 size={15} /> Manage Tenants
        </Link>
      </div>
    </div>
  );
}
