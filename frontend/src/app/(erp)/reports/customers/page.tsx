"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "@/components/charts/lazy";
import { Users, UserCheck, ShoppingCart, TrendingUp } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useCustomers, useOrders } from "@/lib/api/hooks";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";

const ACCENT = "#0f766e";
const ACCENT_DARK = "#2dd4bf";

export default function CustomersReportPage() {
  const { theme } = useAppConfig();
  const accent = theme === "dark" ? ACCENT_DARK : ACCENT;
  const customersQ = useCustomers(1, 500);
  const ordersQ = useOrders(1, 500);
  const loading = customersQ.isLoading || ordersQ.isLoading;
  const customers = customersQ.data?.items ?? [];
  const orders = ordersQ.data?.items ?? [];

  const completed = orders.filter((o) => o.status === "Completed");

  // Revenue per customer
  const custRevMap: Record<string, { name: string; orders: number; revenue: number }> = {};
  completed.forEach((o) => {
    if (!o.customer_id) return;
    const k = o.customer_id;
    if (!custRevMap[k]) custRevMap[k] = { name: o.customer?.name ?? "Unknown", orders: 0, revenue: 0 };
    custRevMap[k].orders += 1;
    custRevMap[k].revenue += o.total;
  });
  const topCustomers = Object.values(custRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // New customers by month
  const byMonth: Record<string, number> = {};
  customers.forEach((c) => {
    const d = new Date(c.created_at ?? "");
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  });
  const monthChart = Object.entries(byMonth).slice(-8).map(([month, count]) => ({ month, count }));

  const individual = customers.filter((c) => c.customer_type === "individual").length;
  const business = customers.filter((c) => c.customer_type === "business").length;
  const withOrders = Object.keys(custRevMap).length;

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Customers Report</h1>
        <p className="text-sm text-muted mt-0.5">{customers.length} total customers</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Customers", value: customers.length.toString(), icon: Users, color: accent },
          { label: "Active", value: customers.filter(c => c.is_active).length.toString(), icon: UserCheck, color: theme === "dark" ? "#34d399" : "#10b981" },
          { label: "With Orders", value: withOrders.toString(), icon: ShoppingCart, color: theme === "dark" ? "#818cf8" : "#6366f1" },
          { label: "Individual / Business", value: `${individual} / ${business}`, icon: TrendingUp, color: theme === "dark" ? "#fbbf24" : "#f59e0b" },
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
        <h2 className="text-sm font-bold text-foreground mb-4">New Customers by Month</h2>
        {monthChart.length > 0 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "New Customers"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }} />
                <Bar dataKey="count" fill={accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted py-10 text-center">No customer data yet</p>}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Top Customers by Revenue</h2>
        {topCustomers.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["#", "Customer", "Orders", "Revenue"].map((h) => (
                  <th key={h} className="pb-3 text-[11px] font-semibold text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topCustomers.map((c, i) => (
                <tr key={c.name}>
                  <td className="py-2.5 text-muted font-mono text-xs">{i + 1}</td>
                  <td className="py-2.5 font-medium text-foreground">{c.name}</td>
                  <td className="py-2.5 text-muted">{c.orders}</td>
                  <td className="py-2.5 font-semibold text-foreground">{fmtMoney(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-muted">No order data linked to customers yet</p>}
      </div>
    </div>
  );
}
