import { TrendingUp, Package, DollarSign, Users, ArrowUpRight, ArrowDownRight } from "lucide-react";

const stats = [
  { label: "Total Revenue", value: "$124,500", change: "+12.5%", up: true, icon: DollarSign, color: "text-primary" },
  { label: "Active Deals", value: "48", change: "+8.2%", up: true, icon: TrendingUp, color: "text-accent" },
  { label: "Products in Stock", value: "1,284", change: "-3.1%", up: false, icon: Package, color: "text-secondary" },
  { label: "Team Members", value: "24", change: "+2", up: true, icon: Users, color: "text-primary" },
];

const recentActivity = [
  { action: "New deal closed", detail: "Enterprise plan with Acme Corp", time: "2 min ago", amount: "+$12,000" },
  { action: "Stock adjusted", detail: "Widget A - 50 units added", time: "15 min ago", amount: null },
  { action: "Invoice paid", detail: "INV-2024-0042 from Beta LLC", time: "1 hour ago", amount: "+$8,500" },
  { action: "New lead", detail: "Charlie Brown via website form", time: "2 hours ago", amount: null },
  { action: "Project milestone", detail: "Phase 2 completed for Client X", time: "3 hours ago", amount: null },
  { action: "Payment received", detail: "Wire transfer from Delta Inc", time: "5 hours ago", amount: "+$24,000" },
];

const topProducts = [
  { name: "Pro Subscription", sold: 342, revenue: "$34,200" },
  { name: "Enterprise License", sold: 48, revenue: "$28,800" },
  { name: "Starter Pack", sold: 156, revenue: "$7,800" },
  { name: "Add-on Module", sold: 89, revenue: "$4,450" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted mt-1">Welcome back. Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center ${stat.color}`}>
                <stat.icon size={20} />
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium ${stat.up ? "text-emerald-600" : "text-red-500"}`}>
                {stat.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {stat.change}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-border">
          <div className="p-5 border-b border-border">
            <h2 className="font-bold text-foreground">Recent Activity</h2>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-surface/50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.action}</p>
                  <p className="text-xs text-muted mt-0.5">{item.detail}</p>
                </div>
                <div className="text-right">
                  {item.amount && (
                    <p className="text-sm font-semibold text-emerald-600">{item.amount}</p>
                  )}
                  <p className="text-xs text-muted">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border">
          <div className="p-5 border-b border-border">
            <h2 className="font-bold text-foreground">Top Products</h2>
          </div>
          <div className="divide-y divide-border">
            {topProducts.map((product, i) => (
              <div key={i} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">{product.name}</p>
                  <p className="text-sm font-semibold text-primary">{product.revenue}</p>
                </div>
                <div className="w-full bg-surface rounded-full h-1.5">
                  <div
                    className="bg-foreground rounded-full h-1.5"
                    style={{ width: `${(product.sold / 342) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted mt-1">{product.sold} units sold</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
