"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  Users,
  ShoppingCart,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  CircleDollarSign,
  BarChart3,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/lib/auth";

const revenueData = [
  { month: "Jul", revenue: 4200, expenses: 2800 },
  { month: "Aug", revenue: 5800, expenses: 3100 },
  { month: "Sep", revenue: 4900, expenses: 2900 },
  { month: "Oct", revenue: 7200, expenses: 3800 },
  { month: "Nov", revenue: 6100, expenses: 3200 },
  { month: "Dec", revenue: 8500, expenses: 4100 },
  { month: "Jan", revenue: 7800, expenses: 3600 },
  { month: "Feb", revenue: 9200, expenses: 4500 },
  { month: "Mar", revenue: 8100, expenses: 3900 },
  { month: "Apr", revenue: 10500, expenses: 5200 },
  { month: "May", revenue: 11800, expenses: 5600 },
  { month: "Jun", revenue: 12400, expenses: 5900 },
];

const dealPipeline = [
  { stage: "New", count: 24, value: 48000 },
  { stage: "Qualified", count: 18, value: 36000 },
  { stage: "Proposition", count: 12, value: 54000 },
  { stage: "Negotiation", count: 7, value: 42000 },
  { stage: "Won", count: 5, value: 35000 },
];

const expenseCategories = [
  { category: "Inventory", amount: 18500 },
  { category: "Rent", amount: 6000 },
  { category: "Salaries", amount: 12000 },
  { category: "Marketing", amount: 3200 },
  { category: "Utilities", amount: 1800 },
  { category: "Other", amount: 900 },
];

const topProducts = [
  { name: "Pro Subscription", category: "SaaS", price: 99, sold: 342, revenue: 33858 },
  { name: "Enterprise License", category: "Software", price: 600, sold: 48, revenue: 28800 },
  { name: "Starter Pack", category: "Bundle", price: 50, sold: 156, revenue: 7800 },
  { name: "Support Plan", category: "Service", price: 200, sold: 34, revenue: 6800 },
  { name: "Add-on Module", category: "Extension", price: 50, sold: 89, revenue: 4450 },
];

const lowStock = [
  { name: "Widget A", sku: "WID-001", stock: 3, min: 20, category: "Hardware" },
  { name: "Cable Pack", sku: "CBL-010", stock: 8, min: 25, category: "Accessories" },
  { name: "Sensor Module", sku: "SEN-005", stock: 2, min: 15, category: "Electronics" },
];

const recentActivity = [
  { id: 1, type: "deal", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", title: "Deal closed", detail: "Acme Corp - Enterprise plan", amount: "+$12,000", time: "2 min ago" },
  { id: 2, type: "stock", icon: Package, color: "text-amber-500", bg: "bg-amber-50", title: "Stock adjusted", detail: "Widget A - 50 units added", amount: null, time: "15 min ago" },
  { id: 3, type: "invoice", icon: CircleDollarSign, color: "text-emerald-500", bg: "bg-emerald-50", title: "Invoice paid", detail: "INV-2024-0042 from Beta LLC", amount: "+$8,500", time: "1 hour ago" },
  { id: 4, type: "lead", icon: Users, color: "text-[#af9164]", bg: "bg-[#af9164]/10", title: "New lead", detail: "Charlie Brown via website", amount: null, time: "2 hours ago" },
  { id: 5, type: "deal", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", title: "Milestone reached", detail: "Phase 2 completed for Client X", amount: null, time: "3 hours ago" },
  { id: 6, type: "expense", icon: XCircle, color: "text-red-500", bg: "bg-red-50", title: "Expense recorded", detail: "Monthly rent payment", amount: "-$6,000", time: "5 hours ago" },
];

const PIE_COLORS = ["#6f1a07", "#af9164", "#2b2118", "#b3b6b7", "#d4a574", "#e8e4de"];

function fmtCurrency(val: number) {
  return `$${val.toLocaleString()}`;
}

function fmtCompact(val: number) {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"6m" | "12m">("12m");

  const chartData = period === "6m" ? revenueData.slice(-6) : revenueData;
  const totalRevenue = revenueData.reduce((s, d) => s + d.revenue, 0);
  const totalExpenses = revenueData.reduce((s, d) => s + d.expenses, 0);
  const totalDeals = dealPipeline.reduce((s, d) => s + d.count, 0);
  const pipelineValue = dealPipeline.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {user?.name?.split(" ")[0] || "User"}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* ── KPI Stat Cards (Odoo-style left border) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Revenue",
            value: fmtCompact(totalRevenue),
            change: "+18.2%",
            up: true,
            icon: DollarSign,
            accent: "#6f1a07",
            bg: "bg-[#6f1a07]/5",
          },
          {
            label: "Expenses",
            value: fmtCompact(totalExpenses),
            change: "+9.4%",
            up: false,
            icon: TrendingDown,
            accent: "#af9164",
            bg: "bg-[#af9164]/5",
          },
          {
            label: "Deals",
            value: String(totalDeals),
            change: "+23%",
            up: true,
            icon: ShoppingCart,
            accent: "#2b2118",
            bg: "bg-foreground/5",
          },
          {
            label: "Pipeline",
            value: fmtCompact(pipelineValue),
            change: "+15.7%",
            up: true,
            icon: BarChart3,
            accent: "#6f1a07",
            bg: "bg-[#6f1a07]/5",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-border relative overflow-hidden"
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ backgroundColor: stat.accent }}
            />
            <div className="pl-4 pr-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 ${stat.bg} flex items-center justify-center`}>
                  <stat.icon size={17} style={{ color: stat.accent }} />
                </div>
                <span
                  className={`flex items-center gap-0.5 text-[11px] font-semibold ${
                    stat.up ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {stat.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {stat.change}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-foreground tracking-tight">
                {stat.value}
              </p>
              <p className="text-xs text-muted mt-1 font-medium">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Revenue & Expenses Chart ── */}
      <div className="bg-white border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Revenue &amp; Expenses</h2>
            <p className="text-[11px] text-muted mt-0.5">Monthly comparison</p>
          </div>
          <div className="flex gap-0.5 bg-surface p-0.5">
            {(["6m", "12m"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                  period === p
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {p === "6m" ? "6 months" : "12 months"}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6f1a07" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#6f1a07" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#af9164" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#af9164" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#b3b6b7" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#b3b6b7" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e8e4de",
                    borderRadius: 0,
                    fontSize: 12,
                    padding: "8px 12px",
                  }}
                  formatter={(value, name) => [
                    `$${Number(value).toLocaleString()}`,
                    name === "revenue" ? "Revenue" : "Expenses",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6f1a07"
                  strokeWidth={2}
                  fill="url(#gradRev)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#6f1a07", strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#af9164"
                  strokeWidth={2}
                  fill="url(#gradExp)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#af9164", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="px-5 pb-4 flex items-center gap-5 justify-center">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1.5 bg-[#6f1a07]" />
            <span className="text-[11px] text-muted font-medium">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1.5 bg-[#af9164]" />
            <span className="text-[11px] text-muted font-medium">Expenses</span>
          </div>
        </div>
      </div>

      {/* ── Pipeline + Expense Breakdown ── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Sales Pipeline */}
        <div className="bg-white border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Sales Pipeline</h2>
            <p className="text-[11px] text-muted mt-0.5">{totalDeals} deals in progress</p>
          </div>
          <div className="px-5 pt-4 pb-2">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealPipeline} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
                  <XAxis
                    dataKey="stage"
                    tick={{ fontSize: 11, fill: "#b3b6b7" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#b3b6b7" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e8e4de",
                      borderRadius: 0,
                      fontSize: 12,
                      padding: "8px 12px",
                    }}
                    formatter={(value, name) => [
                      name === "count" ? `${value} deals` : `$${Number(value).toLocaleString()}`,
                      name === "count" ? "Count" : "Value",
                    ]}
                  />
                  <Bar dataKey="count" fill="#6f1a07" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-5 border-t border-border">
            {dealPipeline.map((s) => (
              <div key={s.stage} className="text-center py-3 border-r border-border last:border-r-0">
                <p className="text-lg font-extrabold text-foreground">{s.count}</p>
                <p className="text-[10px] font-semibold text-muted uppercase">{s.stage}</p>
                <p className="text-[10px] text-muted">{fmtCompact(s.value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Expense Breakdown</h2>
            <p className="text-[11px] text-muted mt-0.5">By category this period</p>
          </div>
          <div className="px-5 py-5 flex items-center gap-6">
            <div className="h-[220px] w-[220px] flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseCategories}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="amount"
                    stroke="none"
                  >
                    {expenseCategories.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e8e4de",
                      borderRadius: 0,
                      fontSize: 12,
                      padding: "8px 12px",
                    }}
                    formatter={(value) => [`$${Number(value).toLocaleString()}`, "Amount"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {expenseCategories.map((cat, i) => {
                const pct = ((cat.amount / totalExpenses) * 100).toFixed(1);
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 flex-shrink-0"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {cat.category}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-foreground">
                        {fmtCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="w-full bg-surface h-1.5">
                      <div
                        className="h-1.5 transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Products + Low Stock ── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <div className="bg-white border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Top Products</h2>
            <a href="/stock" className="text-[11px] font-semibold text-[#6f1a07] hover:underline">
              View all
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">
                    Product
                  </th>
                  <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">
                    Price
                  </th>
                  <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">
                    Sold
                  </th>
                  <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topProducts.map((p, i) => (
                  <tr key={i} className="hover:bg-surface/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 bg-surface flex items-center justify-center text-[10px] font-bold text-muted">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.name}</p>
                          <p className="text-[10px] text-muted">{p.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-muted">
                      {fmtCurrency(p.price)}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-foreground">
                      {p.sold}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-foreground">
                      {fmtCurrency(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-white border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              <h2 className="text-sm font-bold text-foreground">Low Stock Alerts</h2>
            </div>
            <a href="/stock" className="text-[11px] font-semibold text-[#6f1a07] hover:underline">
              View all
            </a>
          </div>
          <div className="divide-y divide-border">
            {lowStock.map((item, i) => {
              const pct = Math.round((item.stock / item.min) * 100);
              const severity =
                pct <= 20 ? "#ef4444" : pct <= 50 ? "#f59e0b" : "#22c55e";
              return (
                <div
                  key={i}
                  className="px-5 py-3.5 hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-amber-50 flex items-center justify-center">
                        <AlertTriangle size={14} className="text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted">{item.sku}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: severity }}>
                        {item.stock} units
                      </p>
                      <p className="text-[10px] text-muted">min: {item.min}</p>
                    </div>
                  </div>
                  <div className="w-full bg-surface h-1.5">
                    <div
                      className="h-1.5 transition-all"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: severity,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Activity + Quick Actions ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
            <span className="text-[11px] text-muted font-medium">
              {recentActivity.length} today
            </span>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface/50 transition-colors cursor-pointer"
              >
                <div
                  className={`w-9 h-9 flex items-center justify-center flex-shrink-0 ${item.bg}`}
                >
                  <item.icon size={15} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted truncate">{item.detail}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {item.amount && (
                    <p
                      className={`text-xs font-bold ${
                        item.amount.startsWith("+")
                          ? "text-emerald-600"
                          : "text-red-500"
                      }`}
                    >
                      {item.amount}
                    </p>
                  )}
                  <p className="text-[11px] text-muted flex items-center gap-1 justify-end">
                    <Clock size={10} />
                    {item.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions + Tasks */}
        <div className="space-y-4">
          <div className="bg-white border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Quick Actions</h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {[
                { label: "New Deal", href: "/sales", icon: ShoppingCart, accent: "#6f1a07" },
                { label: "Add Product", href: "/stock", icon: Package, accent: "#af9164" },
                { label: "New Invoice", href: "/finance", icon: CircleDollarSign, accent: "#2b2118" },
                { label: "Add Contact", href: "/crm", icon: Users, accent: "#6f1a07" },
              ].map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-surface hover:bg-foreground/5 transition-colors group"
                >
                  <div
                    className="w-7 h-7 flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${action.accent}10` }}
                  >
                    <action.icon size={14} style={{ color: action.accent }} />
                  </div>
                  <span className="text-xs font-semibold text-foreground group-hover:text-[#6f1a07] transition-colors">
                    {action.label}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Upcoming Tasks */}
          <div className="bg-white border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Upcoming Tasks</h2>
            </div>
            <div className="divide-y divide-border">
              {[
                { title: "Follow up with Beta LLC", due: "Today", priority: "high" },
                { title: "Review Q4 financial report", due: "Tomorrow", priority: "medium" },
                { title: "Team standup meeting", due: "Today", priority: "low" },
                { title: "Update inventory counts", due: "Jul 25", priority: "medium" },
              ].map((task, i) => (
                <div
                  key={i}
                  className="px-5 py-3 hover:bg-surface/50 transition-colors cursor-pointer flex items-center gap-3"
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.priority === "high"
                        ? "bg-red-500"
                        : task.priority === "medium"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{task.title}</p>
                    <p className="text-[11px] text-muted">{task.due}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
