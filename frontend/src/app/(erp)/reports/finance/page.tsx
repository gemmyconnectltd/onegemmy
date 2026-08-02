"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Loader2 } from "lucide-react";
import { salesApi } from "@/lib/api";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import type { ApiOrder, ApiReturn } from "@/lib/api";

const ACCENT = "#b45309";
const ACCENT_DARK = "#fbbf24";

export default function FinanceReportPage() {
  const { theme } = useAppConfig();
  const accent = theme === "dark" ? ACCENT_DARK : ACCENT;
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [returns, setReturns] = useState<ApiReturn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([
        salesApi.listOrders(1, 500),
        salesApi.listReturns(1, 500),
      ]);
      setOrders(o.data.items);
      setReturns(r.data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completed = orders.filter((o) => o.status === "Completed");
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalTax = completed.reduce((s, o) => s + o.tax, 0);
  const totalDiscount = completed.reduce((s, o) => s + o.discount, 0);
  const approvedReturns = returns.filter((r) => r.status === "Approved");
  const totalRefunds = approvedReturns.reduce((s, r) => s + r.refund_amount, 0);
  const netRevenue = totalRevenue - totalRefunds;

  // Revenue vs refunds by month
  const byMonth: Record<string, { revenue: number; refunds: number }> = {};
  completed.forEach((o) => {
    const d = new Date(o.ordered_at ?? o.created_at ?? "");
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!byMonth[key]) byMonth[key] = { revenue: 0, refunds: 0 };
    byMonth[key].revenue += o.total;
  });
  approvedReturns.forEach((r) => {
    const d = new Date(r.created_at ?? "");
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!byMonth[key]) byMonth[key] = { revenue: 0, refunds: 0 };
    byMonth[key].refunds += r.refund_amount;
  });
  const monthChart = Object.entries(byMonth).slice(-8).map(([month, v]) => ({ month, ...v }));

  // Tax collected by month
  const taxByMonth: Record<string, number> = {};
  completed.forEach((o) => {
    const d = new Date(o.ordered_at ?? o.created_at ?? "");
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    taxByMonth[key] = (taxByMonth[key] ?? 0) + o.tax;
  });
  const taxChart = Object.entries(taxByMonth).slice(-8).map(([month, tax]) => ({ month, tax }));

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-muted" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Finance Report</h1>
        <p className="text-sm text-muted mt-0.5">Based on completed orders & approved returns</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Gross Revenue", value: fmtMoney(totalRevenue), icon: TrendingUp, color: theme === "dark" ? "#34d399" : "#10b981" },
          { label: "Net Revenue", value: fmtMoney(netRevenue), icon: DollarSign, color: accent },
          { label: "Tax Collected", value: fmtMoney(totalTax), icon: CreditCard, color: theme === "dark" ? "#818cf8" : "#6366f1" },
          { label: "Total Refunds", value: fmtMoney(totalRefunds), icon: TrendingDown, color: theme === "dark" ? "#f87171" : "#ef4444" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Revenue vs Refunds by Month</h2>
          {monthChart.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v)} />
                  <Tooltip formatter={(v, name) => [fmtMoney(Number(v)), name === "revenue" ? "Revenue" : "Refunds"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }} />
                  <Bar dataKey="revenue" fill={accent} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="refunds" fill={theme === "dark" ? "#f87171" : "#ef4444"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-muted py-10 text-center">No data yet</p>}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Tax Collected by Month</h2>
          {taxChart.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taxChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v)} />
                  <Tooltip formatter={(v) => [fmtMoney(Number(v)), "Tax"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }} />
                  <Bar dataKey="tax" fill={theme === "dark" ? "#818cf8" : "#6366f1"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-muted py-10 text-center">No tax data yet</p>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-foreground mb-1">Summary</h2>
        <p className="text-xs text-muted mb-4">All figures from completed orders</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "Total Orders", value: completed.length },
            { label: "Avg Order Value", value: fmtMoney(completed.length > 0 ? totalRevenue / completed.length : 0) },
            { label: "Total Discounts Given", value: fmtMoney(totalDiscount) },
            { label: "Approved Returns", value: approvedReturns.length },
            { label: "Pending Returns", value: returns.filter(r => r.status === "Pending").length },
            { label: "Return Rate", value: `${completed.length > 0 ? ((approvedReturns.length / completed.length) * 100).toFixed(1) : 0}%` },
          ].map((item) => (
            <div key={item.label} className="p-3 bg-surface rounded-xl border border-border">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{item.label}</p>
              <p className="text-lg font-bold text-foreground mt-1">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {totalTax > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-bold text-foreground">Rwanda Tax Obligations</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">RRA</span>
          </div>
          <p className="text-[11px] text-muted mb-4">Estimated from completed orders — VAT 18%, CIT 30%, WHT 15%</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "VAT Collected (18%)",         value: fmtMoney(totalTax),                        sub: "Remit to RRA monthly",    color: theme === "dark" ? "#818cf8" : "#6366f1" },
              { label: "Net Revenue (excl. VAT)",     value: fmtMoney(netRevenue - totalRefunds),       sub: "After refunds & VAT",     color: theme === "dark" ? "#34d399" : "#10b981" },
              { label: "Corp. Income Tax Est. (30%)", value: fmtMoney((netRevenue - totalRefunds) * 0.30), sub: "Annual CIT estimate",   color: theme === "dark" ? "#fbbf24" : "#f59e0b" },
              { label: "Withholding Tax Est. (15%)",  value: fmtMoney((netRevenue - totalRefunds) * 0.15), sub: "On applicable payments", color: theme === "dark" ? "#f87171" : "#ef4444" },
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
