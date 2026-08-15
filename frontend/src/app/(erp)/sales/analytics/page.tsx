"use client";
import { fmtMoney } from "@/lib/config";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "@/components/charts/lazy";
import { TrendingUp, ShoppingCart, ArrowUpRight, AlertCircle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { useState } from "react";
import { useOrders, useDeals } from "@/lib/api/hooks";

const SAL = "#0284c7";

export default function SalesAnalyticsPage() {
  const { currencySymbol, theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const sal = theme === "dark" ? "#38bdf8" : SAL;
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const [error, setError] = useState<string | null>(null);
  const [shownLoadError, setShownLoadError] = useState<string | null>(null);

  const ordersQ = useOrders(1, 500);
  const dealsQ = useDeals(1, 500);
  const loading = ordersQ.isLoading || dealsQ.isLoading;
  const orders = ordersQ.data?.items ?? [];
  const deals = dealsQ.data?.items ?? [];

  const loadError = ordersQ.error ?? dealsQ.error;
  const loadErrorMessage = loadError ? (loadError as { detail?: string })?.detail ?? "Failed to load analytics" : null;
  if (loadErrorMessage !== shownLoadError) {
    setShownLoadError(loadErrorMessage);
    if (loadErrorMessage !== null) setError(loadErrorMessage);
  }

  // Derive monthly revenue + VAT from completed orders
  const monthlyMap: Record<string, { sales: number; vat: number }> = {};
  orders.filter((o) => o.status === "Completed").forEach((o) => {
    const d = o.ordered_at ? new Date(o.ordered_at) : null;
    if (!d) return;
    const key = d.toLocaleString("default", { month: "short" });
    if (!monthlyMap[key]) monthlyMap[key] = { sales: 0, vat: 0 };
    monthlyMap[key].sales += o.total;
    monthlyMap[key].vat   += o.tax;
  });
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthly = MONTHS.filter((m) => monthlyMap[m] !== undefined).map((m) => ({ month: m, sales: monthlyMap[m].sales, vat: monthlyMap[m].vat }));

  // Stage breakdown for deals
  const stageMap: Record<string, number> = {};
  deals.forEach((d) => { stageMap[d.stage] = (stageMap[d.stage] ?? 0) + d.value; });
  const byStage = Object.entries(stageMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const totalRevenue = orders.filter((o) => o.status === "Completed").reduce((s, o) => s + o.total, 0);
  const totalVAT = orders.filter((o) => o.status === "Completed").reduce((s, o) => s + o.tax, 0);
  const avgOrder = orders.length ? Math.round(totalRevenue / Math.max(orders.filter((o) => o.status === "Completed").length, 1)) : 0;

  const stats = [
    { label: "Total Revenue",  value: fmt(totalRevenue), icon: TrendingUp,   color: c.income, change: true },
    { label: "Orders",         value: String(orders.length), icon: ShoppingCart, color: sal },
    { label: "VAT Collected",  value: fmt(totalVAT),     icon: ArrowUpRight, color: "#6366f1" },
    { label: "Avg Order",      value: fmt(avgOrder),     icon: ArrowUpRight, color: c.primary },
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
        <PageLoader variant="compact" />
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-1">Monthly Revenue & VAT (18%)</h2>
            <p className="text-[11px] text-muted mb-4">Completed orders — VAT collected for RRA</p>
            {monthly.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted text-sm">No completed orders yet</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v, name) => [fmt(Number(v)), name === "vat" ? "VAT (18%)" : "Revenue"]} contentStyle={c.tooltip} />
                    <Legend formatter={(v) => v === "vat" ? "VAT (18%)" : "Revenue"} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sales" fill={sal} radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="vat" fill="#6366f1" radius={[4, 4, 0, 0]} stackId="b" />
                  </BarChart>
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
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={c.tooltip} />
                      <Bar dataKey="count" fill={sal} radius={[4, 4, 0, 0]} />
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
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip formatter={(v) => [fmt(Number(v)), "Value"]} contentStyle={c.tooltip} />
                      <Bar dataKey="value" fill={c.primary} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Rwanda Tax Obligations */}
          {totalVAT > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-bold text-foreground">Rwanda Tax Obligations</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">RRA</span>
              </div>
              <p className="text-[11px] text-muted mb-4">Estimated from completed orders — based on RDB/RRA rates</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "VAT Collected (18%)",       value: fmt(totalVAT),                                    sub: "Due to RRA monthly",        color: "#6366f1" },
                  { label: "Net Revenue (excl. VAT)",   value: fmt(totalRevenue - totalVAT),                     sub: "Taxable income base",       color: sal },
                  { label: "Corp. Income Tax Est. (30%)", value: fmt((totalRevenue - totalVAT) * 0.30),          sub: "Annual CIT estimate",       color: "#f59e0b" },
                  { label: "Withholding Tax Est. (15%)", value: fmt((totalRevenue - totalVAT) * 0.15),           sub: "On applicable payments",    color: "#ef4444" },
                ].map((t) => (
                  <div key={t.label} className="p-3 rounded-xl border border-border bg-surface">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-tight">{t.label}</p>
                    <p className="text-lg font-extrabold mt-1" style={{ color: t.color }}>{t.value}</p>
                    <p className="text-[10px] text-muted mt-0.5">{t.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
