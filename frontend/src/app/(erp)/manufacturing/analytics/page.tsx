"use client";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "@/components/charts/lazy";
import { Factory, Boxes, CheckCircle2, Percent, AlertCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { useProductionOrders } from "@/lib/api/hooks";

const COLOR = "#0f766e";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ManufacturingAnalyticsPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const teal = theme === "dark" ? "#2dd4bf" : COLOR;

  const [error, setError] = useState<string | null>(null);
  const ordersQ = useProductionOrders(1, 500);
  const loading = ordersQ.isLoading;
  const orders = ordersQ.data?.items ?? [];

  const loadErrorMessage = ordersQ.error ? (ordersQ.error as { detail?: string })?.detail ?? "Failed to load analytics" : null;
  if (loadErrorMessage && loadErrorMessage !== error) setError(loadErrorMessage);

  const completed = orders.filter((o) => o.status === "Completed");
  const unitsProduced = completed.reduce((s, o) => s + o.quantity, 0);
  const completionRate = orders.length ? Math.round((completed.length / orders.length) * 100) : 0;

  // Units produced by month (completion date)
  const monthlyMap: Record<string, number> = {};
  completed.forEach((o) => {
    const d = o.completed_at ? new Date(o.completed_at) : null;
    if (!d) return;
    const key = d.toLocaleString("default", { month: "short" });
    monthlyMap[key] = (monthlyMap[key] ?? 0) + o.quantity;
  });
  const monthly = MONTHS.filter((m) => monthlyMap[m] !== undefined).map((m) => ({ month: m, units: monthlyMap[m] }));

  // Top produced finished products
  const productMap: Record<string, number> = {};
  completed.forEach((o) => {
    const name = o.product_name ?? "Unnamed";
    productMap[name] = (productMap[name] ?? 0) + o.quantity;
  });
  const topProducts = Object.entries(productMap)
    .map(([name, units]) => ({ name, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 6);

  const stats = [
    { label: "Work Orders", value: String(orders.length), icon: Factory, color: teal },
    { label: "Units Produced", value: String(unitsProduced), icon: Boxes, color: "#b45309" },
    { label: "Completed", value: String(completed.length), icon: CheckCircle2, color: "#10b981" },
    { label: "Completion Rate", value: `${completionRate}%`, icon: Percent, color: "#6366f1" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Manufacturing Analytics</h1>
        <p className="text-sm text-muted mt-0.5">Output and completion trends from live data</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl mb-2" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{loading ? "—" : s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <PageLoader variant="compact" />
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-1">Units Produced by Month</h2>
            <p className="text-[11px] text-muted mb-4">Completed work orders</p>
            {monthly.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted text-sm">No completed work orders yet</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, "Units"]} contentStyle={c.tooltip} />
                    <Bar dataKey="units" fill={teal} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-foreground mb-4">Work Orders by Status</h2>
              {orders.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted text-sm">No work orders yet</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: "Draft", count: orders.filter((o) => o.status === "Draft").length },
                      { name: "Scheduled", count: orders.filter((o) => o.status === "Scheduled").length },
                      { name: "In Progress", count: orders.filter((o) => o.status === "In Progress").length },
                      { name: "Completed", count: orders.filter((o) => o.status === "Completed").length },
                      { name: "Cancelled", count: orders.filter((o) => o.status === "Cancelled").length },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: c.tick }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={c.tooltip} />
                      <Bar dataKey="count" fill={teal} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-foreground mb-4">Top Produced Products</h2>
              {topProducts.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted text-sm">No completed work orders yet</div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip formatter={(v) => [v, "Units"]} contentStyle={c.tooltip} />
                      <Bar dataKey="units" fill="#b45309" radius={[0, 4, 4, 0]} />
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
