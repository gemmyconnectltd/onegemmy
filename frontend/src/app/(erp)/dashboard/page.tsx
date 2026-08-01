"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp, TrendingDown, Package, AlertTriangle,
  DollarSign, Users, ShoppingCart, BarChart3,
  ArrowUpRight, ArrowDownRight, Clock, Target,
  Zap, ChevronRight, Activity,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadialBarChart, RadialBar,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/config";
import { inventoryApi, type ApiProduct } from "@/lib/api";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";

const weeklyData = [
  { day: "Mon", sales: 45000, expenses: 12000 },
  { day: "Tue", sales: 38000, expenses: 8000 },
  { day: "Wed", sales: 52000, expenses: 15000 },
  { day: "Thu", sales: 41000, expenses: 9000 },
  { day: "Fri", sales: 67000, expenses: 22000 },
  { day: "Sat", sales: 73000, expenses: 18000 },
  { day: "Sun", sales: 29000, expenses: 6000 },
];

const recentSales = [
  { id: 1, customer: "Walk-in", items: 3, total: 12500, time: "2 min ago", method: "cash" },
  { id: 2, customer: "Jean P.", items: 1, total: 8500, time: "18 min ago", method: "mobile" },
  { id: 3, customer: "Walk-in", items: 5, total: 24000, time: "1 hr ago", method: "cash" },
  { id: 4, customer: "Marie C.", items: 2, total: 6000, time: "2 hrs ago", method: "card" },
  { id: 5, customer: "David K.", items: 4, total: 18000, time: "3 hrs ago", method: "mobile" },
];

const topProducts = [
  { name: "Phone Case - iPhone", sold: 24, revenue: 48000 },
  { name: "USB-C Cable 2m", sold: 18, revenue: 27000 },
  { name: "Screen Protector", sold: 15, revenue: 15000 },
  { name: "Wireless Earbuds", sold: 9, revenue: 81000 },
];

const METHOD_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  cash:   { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "Cash" },
  mobile: { bg: "bg-blue-50 dark:bg-blue-900/30",    text: "text-blue-700 dark:text-blue-400",    label: "Mobile" },
  card:   { bg: "bg-purple-50 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Card" },
};

function variantStock(p: ApiProduct) {
  if (!p.has_variants || !p.variants?.length) return p.stock;
  return p.variants.reduce((s, v) => s + v.stock, 0);
}
function variantMinStock(p: ApiProduct) {
  if (!p.has_variants || !p.variants?.length) return p.min_stock;
  return p.variants.reduce((s, v) => s + v.min_stock, 0);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const [inventory, setInventory] = useState<ApiProduct[]>([]);

  useEffect(() => {
    inventoryApi.listProducts(1, 200)
      .then((res) => setInventory(res.data.items))
      .catch(() => {});
  }, []);

  const lowStock = inventory
    .map((p) => ({ name: p.name, stock: variantStock(p), min: variantMinStock(p) }))
    .filter((i) => i.stock <= i.min)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 6);

  const todaySales    = 156000;
  const todayTarget   = 200000;
  const todayExpenses = 45000;
  const todayProfit   = todaySales - todayExpenses;
  const cashAvailable = 892000;
  const activeCustomers = 48;
  const targetPct = Math.round((todaySales / todayTarget) * 100);

  const kpis = [
    { label: "Today's Sales",    value: fmtMoney(todaySales),    icon: TrendingUp,   color: c.income,    change: "+12%", up: true },
    { label: "Today's Expenses", value: fmtMoney(todayExpenses), icon: TrendingDown, color: c.expenses,  change: "+5%",  up: false },
    { label: "Today's Profit",   value: fmtMoney(todayProfit),   icon: DollarSign,   color: c.profit,    change: "+18%", up: true },
    { label: "Cash Available",   value: fmtMoney(cashAvailable), icon: Activity,     color: c.blue,      change: null,   up: true },
    { label: "Active Customers", value: String(activeCustomers), icon: Users,        color: c.gold,      change: "+3",   up: true },
  ];

  const quickActions = [
    { label: "Record Sale",     href: "/sales",     icon: ShoppingCart, color: c.income },
    { label: "Add Stock",       href: "/inventory", icon: Package,      color: c.blue },
    { label: "Record Expense",  href: "/expenses",  icon: DollarSign,   color: c.expenses },
    { label: "View Reports",    href: "/reports",   icon: BarChart3,    color: c.profit },
    { label: "Customers",       href: "/customers", icon: Users,        color: c.gold },
    { label: "Set Target",      href: "/sales/targets", icon: Target,   color: c.gray },
  ];

  const radialData = [{ value: targetPct, fill: c.income }];

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span>Hello, {user?.name?.split(" ")[0] || "Owner"}</span>
            <span className="text-lg">👋</span>
          </h1>
          <p className="text-sm text-muted mt-0.5">Here&apos;s your business overview for today.</p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <p className="text-xs font-medium text-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${stat.color}18` }}
              >
                <stat.icon size={17} style={{ color: stat.color }} />
              </div>
              {stat.change && (
                <span
                  className={`flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    stat.up
                      ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30"
                      : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30"
                  }`}
                >
                  {stat.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                  {stat.change}
                </span>
              )}
            </div>
            <p className="text-lg font-extrabold text-foreground tracking-tight truncate" title={stat.value}>
              {stat.value}
            </p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Low stock alert ── */}
      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
          <p className="text-[13px] text-muted">
            <span className="font-semibold text-foreground">{lowStock.length} products</span> are running low on stock.
          </p>
          <a href="/inventory" className="ml-auto text-[12px] font-semibold text-accent hover:underline whitespace-nowrap flex items-center gap-0.5">
            View all <ChevronRight size={11} />
          </a>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Sales This Week</h2>
              <p className="text-[11px] text-muted mt-0.5">Daily revenue vs expenses</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.income }} />
                <span className="text-[11px] text-muted font-medium">Sales</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.expenses }} />
                <span className="text-[11px] text-muted font-medium">Expenses</span>
              </div>
            </div>
          </div>
          <div className="px-5 pt-4 pb-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c.income}   stopOpacity={0.18} />
                      <stop offset="95%" stopColor={c.income}   stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c.expenses} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={c.expenses} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={c.tooltip}
                    formatter={(value, name) => [fmtMoney(Number(value)), name === "sales" ? "Sales" : "Expenses"]}
                  />
                  <Area type="monotone" dataKey="sales"    stroke={c.income}   strokeWidth={2.5} fill="url(#gradSales)" dot={false} activeDot={{ r: 4, fill: c.income,   strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="expenses" stroke={c.expenses} strokeWidth={2}   fill="url(#gradExp)"   dot={false} activeDot={{ r: 4, fill: c.expenses, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Daily target */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-foreground">Daily Target</h2>
              <span className="text-[11px] font-bold" style={{ color: c.income }}>{targetPct}%</span>
            </div>
            <p className="text-[11px] text-muted mb-3">{fmtMoney(todaySales)} of {fmtMoney(todayTarget)}</p>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="100%" data={radialData} startAngle={90} endAngle={90 - 360 * (targetPct / 100)}>
                    <RadialBar dataKey="value" cornerRadius={4} background={{ fill: `${c.income}18` }} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <div className="flex justify-between text-[10px] text-muted mb-1">
                    <span>Progress</span><span>{targetPct}%</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${targetPct}%`, backgroundColor: c.income }} />
                  </div>
                </div>
                <p className="text-[11px] text-muted">
                  <span className="font-semibold text-foreground">{fmtMoney(todayTarget - todaySales)}</span> left to target
                </p>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Zap size={13} style={{ color: c.gold }} />
              <h2 className="text-sm font-bold text-foreground">Quick Actions</h2>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-surface transition-colors group"
                  style={{ backgroundColor: `${action.color}0d` }}
                >
                  <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${action.color}20` }}>
                    <action.icon size={13} style={{ color: action.color }} />
                  </div>
                  <span className="text-[12px] font-semibold text-foreground/80 group-hover:text-foreground leading-tight">
                    {action.label}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Recent Sales */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent Sales</h2>
            <a href="/sales" className="text-[11px] font-bold text-accent hover:underline flex items-center gap-0.5">
              View all <ChevronRight size={11} />
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Customer</th>
                  <th className="text-center text-[10px] font-semibold text-muted uppercase tracking-wider px-3 py-2.5">Items</th>
                  <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Total</th>
                  <th className="text-center text-[10px] font-semibold text-muted uppercase tracking-wider px-3 py-2.5">Method</th>
                  <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentSales.map((sale) => {
                  const m = METHOD_STYLES[sale.method] ?? METHOD_STYLES.cash;
                  return (
                    <tr key={sale.id} className="hover:bg-surface/40 transition-colors">
                      <td className="px-5 py-3 text-sm font-semibold text-foreground">{sale.customer}</td>
                      <td className="px-3 py-3 text-center text-sm text-muted">{sale.items}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-foreground">{fmtMoney(sale.total)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.text}`}>
                          {m.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-[11px] text-muted">
                        <span className="flex items-center gap-1 justify-end">
                          <Clock size={10} /> {sale.time}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Top Products + Low Stock */}
        <div className="space-y-4">

          {/* Top Products */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Top Products</h2>
              <a href="/products" className="text-[11px] font-bold text-accent hover:underline">View all</a>
            </div>
            <div className="divide-y divide-border">
              {topProducts.map((p, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[11px] font-bold text-muted w-4 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-[10px] text-muted">{p.sold} sold</p>
                  </div>
                  <span className="text-[12px] font-bold text-foreground flex-shrink-0">{fmtMoney(p.revenue)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Low Stock */}
          {lowStock.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Low Stock</h2>
                <a href="/inventory" className="text-[11px] font-bold text-accent hover:underline">Restock</a>
              </div>
              <div className="divide-y divide-border">
                {lowStock.map((item, i) => {
                  const pct = item.min > 0 ? Math.min(100, Math.round((item.stock / item.min) * 100)) : 0;
                  const barColor = item.stock === 0 ? "#ef4444" : pct < 50 ? "#f59e0b" : "#10b981";
                  return (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] font-medium text-foreground truncate max-w-[130px]">{item.name}</span>
                        <span className="text-[11px] font-bold flex-shrink-0 ml-2" style={{ color: barColor }}>
                          {item.stock} / {item.min}
                        </span>
                      </div>
                      <div className="h-1 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* If no low stock, show a summary card */}
          {lowStock.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <Package size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Stock Healthy</p>
                <p className="text-[11px] text-muted">All products are well stocked</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
