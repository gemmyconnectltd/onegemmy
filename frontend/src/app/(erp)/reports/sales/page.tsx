"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { ShoppingCart, TrendingUp, RotateCcw, Target, Loader2 } from "lucide-react";
import { salesApi } from "@/lib/api";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import type { ApiOrder, ApiReturn, ApiTarget } from "@/lib/api";

const ACCENT = "#0284c7";
const ACCENT_DARK = "#38bdf8";

export default function SalesReportPage() {
  const { theme } = useAppConfig();
  const accent = theme === "dark" ? ACCENT_DARK : ACCENT;
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [returns, setReturns] = useState<ApiReturn[]>([]);
  const [targets, setTargets] = useState<ApiTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, r, t] = await Promise.all([
        salesApi.listOrders(1, 500),
        salesApi.listReturns(1, 500),
        salesApi.listTargets(1, 100),
      ]);
      setOrders(o.data.items);
      setReturns(r.data.items);
      setTargets(t.data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completed = orders.filter((o) => o.status === "Completed");
  const cancelled = orders.filter((o) => o.status === "Cancelled");
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalDiscount = completed.reduce((s, o) => s + o.discount, 0);
  const totalVAT = completed.reduce((s, o) => s + o.tax, 0);
  const approvedReturns = returns.filter((r) => r.status === "Approved");
  const totalRefunds = approvedReturns.reduce((s, r) => s + r.refund_amount, 0);

  // Revenue by month
  const byMonth: Record<string, { revenue: number; orders: number; vat: number }> = {};
  completed.forEach((o) => {
    const d = new Date(o.ordered_at ?? o.created_at ?? "");
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!byMonth[key]) byMonth[key] = { revenue: 0, orders: 0, vat: 0 };
    byMonth[key].revenue += o.total;
    byMonth[key].orders += 1;
    byMonth[key].vat += o.tax;
  });
  const monthChart = Object.entries(byMonth).slice(-8).map(([month, v]) => ({ month, ...v }));

  // Returns by month
  const returnsByMonth: Record<string, number> = {};
  approvedReturns.forEach((r) => {
    const d = new Date(r.created_at ?? "");
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    returnsByMonth[key] = (returnsByMonth[key] ?? 0) + r.refund_amount;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-muted" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Sales Report</h1>
        <p className="text-sm text-muted mt-0.5">{orders.length} total orders</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Revenue",       value: fmtMoney(totalRevenue),  icon: TrendingUp,  color: theme === "dark" ? "#34d399" : "#10b981" },
          { label: "Orders",        value: completed.length.toString(), icon: ShoppingCart, color: accent },
          { label: "VAT Collected", value: fmtMoney(totalVAT),      icon: RotateCcw,   color: theme === "dark" ? "#818cf8" : "#6366f1" },
          { label: "Refunds",       value: fmtMoney(totalRefunds),  icon: RotateCcw,   color: theme === "dark" ? "#fbbf24" : "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Revenue & VAT by Month</h2>
        {monthChart.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip formatter={(v, name) => [fmtMoney(Number(v)), name === "vat" ? "VAT (18%)" : name === "revenue" ? "Revenue" : "Orders"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }} />
                <Bar dataKey="revenue" fill={accent} radius={[4, 4, 0, 0]} />
                <Bar dataKey="vat" fill={theme === "dark" ? "#818cf8" : "#6366f1"} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted py-10 text-center">No completed orders yet</p>}
      </div>

      {targets.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Sales Targets</h2>
          <div className="space-y-4">
            {targets.map((t) => {
              const pct = Math.min(100, t.target_value > 0 ? Math.round((t.achieved_value / t.target_value) * 100) : 0);
              const color = pct >= 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
              return (
                <div key={t.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-sm font-semibold text-foreground">{t.name}</span>
                      <span className="text-xs text-muted ml-2">{t.period}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[11px] text-muted">{t.unit === "currency" ? fmtMoney(t.achieved_value) : t.achieved_value} achieved</span>
                    <span className="text-[11px] text-muted">{t.unit === "currency" ? fmtMoney(t.target_value) : t.target_value} target</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Recent Orders</h2>
        {orders.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Order #", "Customer", "Status", "VAT (18%)", "Total", "Date"].map((h) => (
                  <th key={h} className="pb-3 text-[11px] font-semibold text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.slice(0, 10).map((o) => (
                <tr key={o.id}>
                  <td className="py-2.5 font-mono text-xs text-foreground">{o.order_number}</td>
                  <td className="py-2.5 text-foreground">{o.customer?.name ?? "Walk-in"}</td>
                  <td className="py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${o.status === "Completed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : o.status === "Cancelled" ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="py-2.5 font-semibold" style={{ color: theme === "dark" ? "#818cf8" : "#6366f1" }}>{fmtMoney(o.tax)}</td>
                  <td className="py-2.5 font-semibold text-foreground">{fmtMoney(o.total)}</td>
                  <td className="py-2.5 text-muted text-xs">{o.ordered_at ? new Date(o.ordered_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-muted">No orders yet</p>}
      </div>

      {totalVAT > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-bold text-foreground">Rwanda Tax Summary</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">RRA</span>
          </div>
          <p className="text-[11px] text-muted mb-4">Estimated obligations from completed orders</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "VAT Collected (18%)",         value: fmtMoney(totalVAT),                          sub: "Remit to RRA monthly",       color: theme === "dark" ? "#818cf8" : "#6366f1" },
              { label: "Net Revenue (excl. VAT)",     value: fmtMoney(totalRevenue - totalVAT),           sub: "Taxable income base",        color: theme === "dark" ? "#34d399" : "#10b981" },
              { label: "Corp. Income Tax Est. (30%)", value: fmtMoney((totalRevenue - totalVAT) * 0.30),  sub: "Annual CIT estimate",        color: theme === "dark" ? "#fbbf24" : "#f59e0b" },
              { label: "Withholding Tax Est. (15%)",  value: fmtMoney((totalRevenue - totalVAT) * 0.15),  sub: "On applicable payments",     color: theme === "dark" ? "#f87171" : "#ef4444" },
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
    </div>
  );
}
