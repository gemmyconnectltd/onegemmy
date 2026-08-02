"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, RotateCcw, Users, Package, Loader2 } from "lucide-react";
import { salesApi, inventoryApi } from "@/lib/api";
import { fmtMoney } from "@/lib/config";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette } from "@/lib/chartColors";
import type { ApiOrder, ApiReturn, ApiCustomer, ApiProduct } from "@/lib/api";

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <p className="text-xl font-extrabold text-foreground tracking-tight">{value}</p>
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [returns, setReturns] = useState<ApiReturn[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, r, c, p] = await Promise.all([
        salesApi.listOrders(1, 500),
        salesApi.listReturns(1, 500),
        salesApi.listCustomers(1, 500),
        inventoryApi.listProducts(1, 500),
      ]);
      setOrders(o.data.items);
      setReturns(r.data.items);
      setCustomers(c.data.items);
      setProducts(p.data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completed = orders.filter((o) => o.status === "Completed");
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalVAT = completed.reduce((s, o) => s + o.tax, 0);
  const totalRefunds = returns.filter((r) => r.status === "Approved").reduce((s, r) => s + r.refund_amount, 0);
  const totalOrders = completed.length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const lowStock = products.filter((p) => p.stock <= p.min_stock && !p.has_variants).length;

  // Revenue by month from real orders
  const byMonth: Record<string, number> = {};
  completed.forEach((o) => {
    const d = new Date(o.ordered_at ?? o.created_at ?? "");
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    byMonth[key] = (byMonth[key] ?? 0) + o.total;
  });
  const revenueChart = Object.entries(byMonth).slice(-7).map(([month, revenue]) => ({ month, revenue }));

  // Top products by revenue
  const productRevMap: Record<string, { name: string; revenue: number; qty: number }> = {};
  completed.forEach((o) => o.items.forEach((item) => {
    const k = item.product_id ?? item.product_name;
    if (!productRevMap[k]) productRevMap[k] = { name: item.product_name, revenue: 0, qty: 0 };
    productRevMap[k].revenue += item.line_total;
    productRevMap[k].qty += item.quantity;
  }));
  const topProducts = Object.values(productRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Orders by status
  const statusCount = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const statusChart = Object.entries(statusCount).map(([status, count]) => ({ status, count }));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Reports Overview</h1>
        <p className="text-sm text-muted mt-0.5">Live data from your business</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Revenue" value={fmtMoney(totalRevenue)} sub={`${totalOrders} completed orders`} icon={DollarSign} color={c.income} />
        <StatCard label="VAT Collected" value={fmtMoney(totalVAT)} sub="18% — due to RRA" icon={TrendingUp} color={theme === "dark" ? "#818cf8" : "#6366f1"} />
        <StatCard label="Total Refunds" value={fmtMoney(totalRefunds)} sub={`${returns.filter(r => r.status === "Approved").length} approved returns`} icon={RotateCcw} color={c.expenses} />
        <StatCard label="Active Customers" value={customers.filter(c => c.is_active).length.toString()} sub={`${lowStock} products low stock`} icon={Users} color={c.blue} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Revenue by Month</h2>
          {revenueChart.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v)} />
                  <Tooltip formatter={(v) => [fmtMoney(Number(v)), "Revenue"]} contentStyle={c.tooltip} />
                  <Bar dataKey="revenue" fill={c.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-muted">No completed orders yet</div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4">Orders by Status</h2>
          <div className="space-y-3">
            {statusChart.length > 0 ? statusChart.map(({ status, count }) => {
              const color = status === "Completed" ? c.income : status === "Cancelled" ? c.expenses : (theme === "dark" ? "#fbbf24" : "#f59e0b");
              const pct = Math.round((count / orders.length) * 100);
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{status}</span>
                    <span className="text-xs text-muted">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            }) : <p className="text-sm text-muted">No orders yet</p>}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Top Products by Revenue</h2>
        {topProducts.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 text-[11px] font-semibold text-muted uppercase tracking-wider">#</th>
                <th className="pb-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Product</th>
                <th className="pb-3 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Units</th>
                <th className="pb-3 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topProducts.map((p, i) => (
                <tr key={p.name}>
                  <td className="py-3 text-muted font-mono text-xs">{i + 1}</td>
                  <td className="py-3 font-medium text-foreground">{p.name}</td>
                  <td className="py-3 text-right text-muted">{p.qty}</td>
                  <td className="py-3 text-right font-semibold text-foreground">{fmtMoney(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-muted">No sales data yet</p>}
      </div>
    </div>
  );
}
