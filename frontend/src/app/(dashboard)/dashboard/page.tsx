"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp, TrendingDown, Package, AlertTriangle,
  DollarSign, Users, ShoppingCart, Plus, ArrowUpRight,
  ArrowDownRight, Clock,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { CURRENCY_SYMBOL } from "@/lib/config";

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
  { id: 4, customer: "Marie C.", items: 2, total: 6000, time: "2 hrs ago", method: "cash" },
];

const lowStock = [
  { name: "Phone Cases", stock: 3, min: 20 },
  { name: "USB Cables", stock: 5, min: 30 },
  { name: "Screen Protectors", stock: 2, min: 25 },
];

const quickActions = [
  { label: "Record Sale", href: "/sales", icon: ShoppingCart, color: "#6f1a07" },
  { label: "Products", href: "/products", icon: Package, color: "#af9164" },
  { label: "Add Stock", href: "/inventory", icon: Package, color: "#10B981" },
  { label: "Record Expense", href: "/expenses", icon: DollarSign, color: "#ef4444" },
  { label: "Reports", href: "/reports", icon: TrendingUp, color: "#3b82f6" },
  { label: "Settings", href: "/settings", icon: Package, color: "#6b7280" },
];

function fmtRWF(val: number) {
  return `${CURRENCY_SYMBOL} ${val.toLocaleString()}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"today" | "week">("today");

  const todaySales = 156000;
  const todayExpenses = 45000;
  const todayProfit = todaySales - todayExpenses;
  const cashAvailable = 892000;
  const lowStockCount = 3;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Hello, {user?.name?.split(" ")[0] || "Owner"}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Here&apos;s your shop today.
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Today's Sales", value: fmtRWF(todaySales), icon: TrendingUp, color: "#10B981", change: "+12%", up: true },
          { label: "Today's Expenses", value: fmtRWF(todayExpenses), icon: TrendingDown, color: "#ef4444", change: "+5%", up: false },
          { label: "Today's Profit", value: fmtRWF(todayProfit), icon: DollarSign, color: "#6f1a07", change: "+18%", up: true },
          { label: "Cash Available", value: fmtRWF(cashAvailable), icon: DollarSign, color: "#3b82f6", change: null, up: true },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-border p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: stat.color }} />
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: `${stat.color}10` }}>
                <stat.icon size={16} style={{ color: stat.color }} />
              </div>
              {stat.change && (
                <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${stat.up ? "text-emerald-600" : "text-red-500"}`}>
                  {stat.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {stat.change}
                </span>
              )}
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{stat.value}</p>
            <p className="text-[11px] text-muted mt-0.5 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {lowStockCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            <span className="font-bold">{lowStockCount} products</span> are running low on stock.
          </p>
          <a href="/inventory" className="ml-auto text-xs font-semibold text-amber-700 hover:underline whitespace-nowrap">
            View all
          </a>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Sales This Week</h2>
              <p className="text-[11px] text-muted mt-0.5">Daily revenue vs expenses</p>
            </div>
          </div>
          <div className="px-5 pt-4 pb-2">
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#b3b6b7" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e8e4de", borderRadius: 0, fontSize: 12, padding: "8px 12px" }}
                    formatter={(value, name) => [
                      `${CURRENCY_SYMBOL} ${Number(value).toLocaleString()}`,
                      name === "sales" ? "Sales" : "Expenses",
                    ]}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#10B981" strokeWidth={2} fill="url(#gradSales)" dot={false} activeDot={{ r: 4, fill: "#10B981", strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gradExp)" dot={false} activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="px-5 pb-3 flex items-center gap-5 justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 bg-[#10B981]" />
              <span className="text-[11px] text-muted font-medium">Sales</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 bg-[#ef4444]" />
              <span className="text-[11px] text-muted font-medium">Expenses</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Quick Actions</h2>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-2 px-3 py-2.5 bg-surface hover:bg-foreground/5 transition-colors group"
                >
                  <div className="w-7 h-7 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${action.color}10` }}>
                    <action.icon size={14} style={{ color: action.color }} />
                  </div>
                  <span className="text-xs font-semibold text-foreground group-hover:text-accent transition-colors">
                    {action.label}
                  </span>
                </a>
              ))}
            </div>
          </div>

          <div className="bg-white border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Low Stock</h2>
            </div>
            <div className="divide-y divide-border">
              {lowStock.map((item, i) => (
                <div key={i} className="px-5 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={12} className="text-amber-500" />
                    <span className="text-sm text-foreground">{item.name}</span>
                  </div>
                  <span className="text-xs font-bold text-amber-600">{item.stock} left</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Recent Sales</h2>
          <a href="/sales" className="text-[11px] font-semibold text-accent hover:underline">View all</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Customer</th>
                <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Items</th>
                <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Total</th>
                <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Method</th>
                <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-5 py-2.5">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-foreground">{sale.customer}</td>
                  <td className="px-5 py-3 text-right text-sm text-muted">{sale.items}</td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-foreground">{fmtRWF(sale.total)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-surface text-foreground/70 uppercase">
                      {sale.method}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-[11px] text-muted flex items-center gap-1 justify-end">
                    <Clock size={10} /> {sale.time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
