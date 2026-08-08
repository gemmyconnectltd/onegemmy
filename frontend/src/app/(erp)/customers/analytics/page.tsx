"use client";
import { useMemo } from "react";
import { fmtMoney } from "@/lib/config";
import { Users, TrendingUp, ShoppingCart, Repeat } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import { useCustomers, useOrders } from "@/lib/api/hooks";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "@/components/charts/lazy";

const COLOR = "#0f766e";

const MONTH_KEYS = (() => {
  const keys: { label: string; key: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    keys.push({ label: d.toLocaleString("en", { month: "short" }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
  }
  return keys;
})();

function monthKey(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function daysAgo(d: string | null): number | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000);
}

export default function CustomerAnalyticsPage() {
  const { currencySymbol, theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const fmt = (v: number) => fmtMoney(v, currencySymbol);
  const main = theme === "dark" ? "#2dd4bf" : COLOR;

  const customersQ = useCustomers(1, 500);
  const ordersQ = useOrders(1, 500);

  const { customers, orders } = useMemo(() => {
    const all = ordersQ.data?.items ?? [];
    return {
      customers: customersQ.data?.items ?? [],
      orders: all.filter((o) => o.status === "Completed"),
    };
  }, [customersQ.data, ordersQ.data]);

  const thisMonth = new Date().toISOString().slice(0, 7);

  const customerSpend = useMemo(() => {
    const map = new Map<string, { name: string; spent: number; count: number; lastAt: string | null }>();
    for (const o of orders) {
      const key = o.customer_id ?? "walkin";
      const entry = map.get(key) ?? { name: o.customer?.name ?? "Walk-in", spent: 0, count: 0, lastAt: null };
      entry.spent += o.total;
      entry.count += 1;
      const at = o.ordered_at ?? o.created_at;
      if (at && (!entry.lastAt || new Date(at) > new Date(entry.lastAt))) entry.lastAt = at;
      map.set(key, entry);
    }
    return map;
  }, [orders]);

  const totalRevenue = customerSpend.size > 0 ? [...customerSpend.values()].reduce((s, e) => s + e.spent, 0) : 0;
  const avgSpend = customers.length > 0 ? totalRevenue / customers.length : 0;
  const ordersThisMonth = orders.filter((o) => monthKey(o.ordered_at ?? o.created_at) === thisMonth).length;
  const returningCount = [...customerSpend.values()].filter((e) => e.count > 1).length;
  const returningRate = customers.length > 0 ? Math.round((returningCount / customers.length) * 100) : 0;

  const growth = useMemo(
    () =>
      MONTH_KEYS.map((m) => ({
        month: m.label,
        customers: customers.filter((cu) => monthKey(cu.created_at) === m.key).length,
      })),
    [customers],
  );

  const topCustomers = useMemo(
    () =>
      [...customerSpend.values()]
        .filter((e) => e.name !== "Walk-in")
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 5)
        .map((e) => ({ name: e.name, spent: e.spent })),
    [customerSpend],
  );

  const monthlyRevenue = useMemo(
    () =>
      MONTH_KEYS.map((m) => ({
        month: m.label,
        revenue: orders
          .filter((o) => monthKey(o.ordered_at ?? o.created_at) === m.key)
          .reduce((s, o) => s + o.total, 0),
      })),
    [orders],
  );

  const recentOrderDays = [...customerSpend.values()].map((e) => daysAgo(e.lastAt)).filter((d): d is number => d !== null);
  const avgDaysSince = recentOrderDays.length > 0 ? recentOrderDays.reduce((s, d) => s + d, 0) / recentOrderDays.length : 0;

  const stats = [
    { label: "Total Customers",   value: String(customers.length), icon: Users,        color: main },
    { label: "Avg. Spend",        value: fmt(Math.round(avgSpend)), icon: TrendingUp,  color: theme === "dark" ? "#34d399" : "#059669" },
    { label: "Orders This Month", value: String(ordersThisMonth),   icon: ShoppingCart, color: theme === "dark" ? "#38bdf8" : "#0284c7" },
    { label: "Returning Rate",    value: `${returningRate}%`,        icon: Repeat,        color: theme === "dark" ? "#fbbf24" : "#b45309" },
  ];

  const loading = customersQ.isLoading || ordersQ.isLoading;

  if (loading) {
    return <p className="text-sm text-muted py-8">Loading analytics…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Customer Analytics</h1>
        <p className="text-sm text-muted mt-0.5">Trends and insights about your customer base</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="w-8 h-8 flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-[13px] font-bold text-foreground mb-4">Customer Growth</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={growth}>
              <defs>
                <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={main} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={main} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={c.tooltip} />
              <Area type="monotone" dataKey="customers" name="New customers" stroke={main} strokeWidth={2} fill="url(#cGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-[13px] font-bold text-foreground mb-4">Top Customers by Spend</p>
          {topCustomers.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topCustomers} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={c.tooltip} formatter={(v) => fmt(Number(v))} />
                <Bar dataKey="spent" name="Total spent" fill={main} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted py-10 text-center">No customer sales yet</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-[13px] font-bold text-foreground mb-4">Monthly Revenue from Customers</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyRevenue}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={c.tooltip} formatter={(v) => fmt(Number(v))} />
            <Bar dataKey="revenue" name="Revenue" fill={main} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-muted">
        Based on {orders.length} completed orders across {customers.length} customers
        {avgDaysSince > 0 ? ` · avg last activity ${Math.round(avgDaysSince)} days ago` : ""}.
      </p>
    </div>
  );
}
