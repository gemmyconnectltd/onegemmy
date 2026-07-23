"use client";

import { TrendingUp, Package, DollarSign, Users, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, AlertCircle, BarChart3 } from "lucide-react";
import { useAuth } from "@/lib/auth";

const stats = [
  { label: "Total Revenue", value: "$124,500", change: "+12.5%", up: true, icon: DollarSign },
  { label: "Active Deals", value: "48", change: "+8.2%", up: true, icon: TrendingUp },
  { label: "Products", value: "1,284", change: "-3.1%", up: false, icon: Package },
  { label: "Team", value: "24", change: "+2", up: true, icon: Users },
];

const recentActivity = [
  { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", action: "Deal closed", detail: "Acme Corp - Enterprise plan", time: "2 min ago", amount: "+$12,000" },
  { icon: Package, color: "text-amber-500", bg: "bg-amber-50", action: "Stock adjusted", detail: "Widget A - 50 units added", time: "15 min ago", amount: null },
  { icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-50", action: "Invoice paid", detail: "INV-2024-0042 from Beta LLC", time: "1 hour ago", amount: "+$8,500" },
  { icon: AlertCircle, color: "text-primary", bg: "bg-primary/10", action: "New lead", detail: "Charlie Brown via website", time: "2 hours ago", amount: null },
  { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", action: "Milestone reached", detail: "Phase 2 completed for Client X", time: "3 hours ago", amount: null },
  { icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-50", action: "Payment received", detail: "Wire transfer from Delta Inc", time: "5 hours ago", amount: "+$24,000" },
];

const quickActions = [
  { label: "New Deal", href: "/sales" },
  { label: "Add Product", href: "/stock" },
  { label: "Create Invoice", href: "/finance" },
  { label: "Add Contact", href: "/crm" },
];

const topProducts = [
  { name: "Pro Subscription", sold: 342, revenue: "$34,200", progress: 100 },
  { name: "Enterprise License", sold: 48, revenue: "$28,800", progress: 84 },
  { name: "Starter Pack", sold: 156, revenue: "$7,800", progress: 46 },
  { name: "Add-on Module", sold: 89, revenue: "$4,450", progress: 26 },
];

const upcomingTasks = [
  { title: "Follow up with Beta LLC", due: "Today", priority: "high" },
  { title: "Review Q4 financial report", due: "Tomorrow", priority: "medium" },
  { title: "Team standup meeting", due: "Today", priority: "low" },
  { title: "Update inventory counts", due: "Jan 20", priority: "medium" },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {user?.name?.split(" ")[0] || "User"}
          </h1>
          <p className="text-sm text-muted mt-0.5">Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white border border-border p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-foreground/5 flex items-center justify-center">
                <stat.icon size={16} className="text-foreground/60" />
              </div>
              <span className={`flex items-center gap-0.5 text-[11px] font-medium ${stat.up ? "text-emerald-600" : "text-red-500"}`}>
                {stat.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {stat.change}
              </span>
            </div>
            <p className="text-xl font-bold text-foreground">{stat.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-border p-4">
        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="px-3 py-1.5 bg-foreground/5 text-foreground text-sm font-medium hover:bg-foreground/10 transition-colors"
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Activity */}
        <div className="lg:col-span-2 bg-white border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
            <a href="#" className="text-xs text-primary hover:underline">View all</a>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/50 transition-colors cursor-pointer">
                <div className={`w-8 h-8 flex items-center justify-center flex-shrink-0 ${item.bg}`}>
                  <item.icon size={14} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.action}</p>
                  <p className="text-xs text-muted truncate">{item.detail}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {item.amount && (
                    <p className="text-xs font-semibold text-emerald-600">{item.amount}</p>
                  )}
                  <p className="text-[11px] text-muted">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-white border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Upcoming Tasks</h2>
            <span className="text-[11px] text-muted">{upcomingTasks.length} pending</span>
          </div>
          <div className="divide-y divide-border">
            {upcomingTasks.map((task, i) => (
              <div key={i} className="px-4 py-3 hover:bg-surface/50 transition-colors cursor-pointer flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  task.priority === "high" ? "bg-red-500" :
                  task.priority === "medium" ? "bg-amber-500" :
                  "bg-emerald-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{task.title}</p>
                  <p className="text-[11px] text-muted">{task.due}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="bg-white border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Top Products</h2>
          <a href="/stock" className="text-xs text-primary hover:underline">View all</a>
        </div>
        <div className="p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {topProducts.map((product, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-foreground">{product.name}</p>
                  <p className="text-xs font-semibold text-foreground">{product.revenue}</p>
                </div>
                <div className="w-full bg-surface h-1.5">
                  <div
                    className="bg-primary h-1.5 transition-all"
                    style={{ width: `${product.progress}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted mt-1">{product.sold} units sold</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
