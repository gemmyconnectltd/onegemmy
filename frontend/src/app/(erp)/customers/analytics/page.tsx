"use client";
import { fmtMoney } from "@/lib/config";
import { Users, TrendingUp, ShoppingCart, Repeat } from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";

const COLOR = "#0f766e";

const MONTHLY = [
  { month: "Feb", customers: 38, revenue: 420000 },
  { month: "Mar", customers: 42, revenue: 510000 },
  { month: "Apr", customers: 39, revenue: 480000 },
  { month: "May", customers: 51, revenue: 620000 },
  { month: "Jun", customers: 47, revenue: 590000 },
  { month: "Jul", customers: 55, revenue: 710000 },
];

const TOP_CUSTOMERS = [
  { name: "Patrick Niyonzima", spent: 234000 },
  { name: "Jean Pierre",       spent: 125000 },
  { name: "Eric Habimana",     spent: 67000 },
  { name: "Marie Claire",      spent: 87000 },
  { name: "Immaculate",        spent: 45000 },
];

export default function CustomerAnalyticsPage() {
  const { currencySymbol } = useAppConfig();
  const fmt = (v: number) => fmtMoney(v, currencySymbol);

  const stats = [
    { label: "Total Customers",   value: "55",    icon: Users,       color: COLOR },
    { label: "Avg. Spend",        value: fmt(111800), icon: TrendingUp,  color: "#059669" },
    { label: "Orders This Month", value: "128",   icon: ShoppingCart, color: "#0284c7" },
    { label: "Returning Rate",    value: "68%",   icon: Repeat,       color: "#b45309" },
  ];

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
            <AreaChart data={MONTHLY}>
              <defs>
                <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="customers" stroke={COLOR} strokeWidth={2} fill="url(#cGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-[13px] font-bold text-foreground mb-4">Top Customers by Spend</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={TOP_CUSTOMERS} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => fmt(v)} />
              <Bar dataKey="spent" fill={COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-[13px] font-bold text-foreground mb-4">Monthly Revenue from Customers</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={MONTHLY}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => fmt(v)} />
            <Bar dataKey="revenue" fill={COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
