"use client";
import { fmtMoney } from "@/lib/config";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { TrendingUp, ShoppingCart, Users, ArrowUpRight, Loader2, AlertCircle } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { useEffect, useState, useCallback } from "react";
import { salesApi, type ApiOrder, type ApiDeal } from "@/lib/api";

const SAL = "#0284c7";

export default function SalesAnalyticsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [deals, setDeals] = useState<ApiDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [ordRes, dealRes] = await Promise.all([
        salesApi.listOrders(1, 500),
        salesApi.listDeals(1, 500),
      ]);
      setOrders(ordRes.data.items);
      setDeals(dealRes.data.items);
    } catch (e: unknown) {
      setError((e as { detail?: string })?.detail ?? "Failed to load analytics");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive monthly revenue from completed orders
  const monthlyMap: Record<string, number> = {};
  orders.filter((o) => o.status === "Completed").forEach((o) => {
    const d = o.ordered_at ? new Date(o.ordered_at) : null;
    if (!d) return;
    const key = d.toLocaleString("default", { month: "short" });
    monthlyMap[key] = (monthlyMap[key] ?? 0) + o.total;
  });
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthly = MONTHS.filter((m) => monthlyMap[m] !== undefined).map((m) => ({ month: m, sales: monthlyMap[m] }));

  // Stage breakdown for deals
  const stageMap: Record<string, number> = {};
  deals.forEach((d) => { stageMap[d.stage] = (stageMap[d.stage] ?? 0) + d.value; });
  const byStage = Object.entries(stageMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const totalRevenue = orders.filter((o) => o.status === "Completed").reduce((s, o) => s + o.total, 0);
  const uniqueCustomers = new Set(orders.map((o) => o.customer_id).filter(Boolean)).size;
  const avgOrder = orders.length ? Math.round(totalRevenue / Math.max(orders.filter((o) => o.status === "Completed").length, 1)) : 0;

  const stats = [
    { label: "Total Revenue",  value: fmt(totalRevenue), icon: TrendingUp,   color: "#10b981", change: true },
    { label: "Orders",         value: String(orders.length), icon: ShoppingCart, color: SAL },
    { label: "Customers",      value: String(uniqueCustomers), icon: Users,    color: "#3b82f6" },
    { label: "Avg Order",      value: fmt(avgOrder),     icon: ArrowUpRight, color: "#af9164" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Sales Analytics</h1>
        <p className="text-sm text-muted mt-0.5">Performance overview from live data</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${s.color}10` }}>
                <s.icon size={16} style={{ color: s.color }} />
              </div>
              {s.change && !loading && totalRevenue > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
                  <ArrowUpRight size={11} />live
                </span>
              )}
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center gap-2 text-muted bg-card border border-border rounded-xl">
          <Loader2 size={18} className="animate-spin" /> Loading analytics...
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-1">Monthly Revenue Trend</h2>
            <p className="text-[11px] text-muted mb-4">Completed orders only</p>
            {monthly.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted text-sm">No completed orders yet</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthly}>
                    <defs>
                      <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={SAL} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={SAL} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => [fmt(Number(v)), "Revenue"]} contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
                    <Area type="monotone" dataKey="sales" stroke={SAL} strokeWidth={2.5} fill="url(#gSales)" dot={{ fill: SAL, r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Orders by status */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-foreground mb-4">Orders by Status</h2>
              {orders.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted text-sm">No orders yet</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: "Completed", count: orders.filter((o) => o.status === "Completed").length },
                      { name: "Pending",   count: orders.filter((o) => o.status === "Pending").length },
                      { name: "Cancelled", count: orders.filter((o) => o.status === "Cancelled").length },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
                      <Bar dataKey="count" fill={SAL} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Pipeline by stage */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-foreground mb-4">Pipeline by Stage</h2>
              {byStage.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted text-sm">No deals yet</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byStage} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#2b2118" }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip formatter={(v) => [fmt(Number(v)), "Value"]} contentStyle={{ borderRadius: 8, border: "1px solid #e8e4de", fontSize: 12 }} />
                      <Bar dataKey="value" fill="#af9164" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
