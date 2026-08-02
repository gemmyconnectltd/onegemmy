"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart, Package, BarChart3, Target, Zap, ArrowUpRight, ArrowDownRight, Clock, ChevronRight, Activity, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "@/components/charts/lazy";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette, type ChartPalette } from "@/lib/chartColors";
import { fmtMoney } from "@/lib/config";
import { inventoryApi, salesApi, financeApi, type ApiProduct, type ApiOrder } from "@/lib/api";
import { PERIODS, PAST_YEARS, periodDateRange, METHOD_COLOR, type Period } from "./data";

// ── helpers ──────────────────────────────────────────────────────────────────

function variantStock(p: ApiProduct) {
  return p.has_variants && p.variants?.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock;
}
function variantMinStock(p: ApiProduct) {
  return p.has_variants && p.variants?.length ? p.variants.reduce((s, v) => s + v.min_stock, 0) : p.min_stock;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function buildChart(orders: ApiOrder[], period: Period): { label: string; sales: number; expenses: number }[] {
  if (period === "today") {
    const buckets = ["8am","10am","12pm","2pm","4pm","6pm"];
    const hours   = [8, 10, 12, 14, 16, 18];
    return buckets.map((label, i) => ({
      label,
      sales: orders
        .filter((o) => { const h = new Date(o.ordered_at ?? o.created_at ?? "").getHours(); return h >= hours[i] && h < (hours[i + 1] ?? 24); })
        .reduce((s, o) => s + o.total, 0),
      expenses: 0,
    }));
  }
  if (period === "week") {
    const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    return days.map((label, i) => ({
      label,
      sales: orders
        .filter((o) => { const d = new Date(o.ordered_at ?? o.created_at ?? ""); return ((d.getDay() + 6) % 7) === i; })
        .reduce((s, o) => s + o.total, 0),
      expenses: 0,
    }));
  }
  if (period === "month" || period === "last_month") {
    return ["Wk 1","Wk 2","Wk 3","Wk 4"].map((label, i) => ({
      label,
      sales: orders
        .filter((o) => { const d = new Date(o.ordered_at ?? o.created_at ?? ""); return Math.floor((d.getDate() - 1) / 7) === i; })
        .reduce((s, o) => s + o.total, 0),
      expenses: 0,
    }));
  }
  // year / year_YYYY — monthly
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months.map((label, i) => ({
    label,
    sales: orders
      .filter((o) => new Date(o.ordered_at ?? o.created_at ?? "").getMonth() === i)
      .reduce((s, o) => s + o.total, 0),
    expenses: 0,
  }));
}

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCards({ sales, expenses, profit, cash, customers, salesChange, expChange, profitChange, customersChange, label, c }: {
  sales: number; expenses: number; profit: number; cash: number; customers: number;
  salesChange: string | null; expChange: string | null; profitChange: string | null; customersChange: string | null;
  label: string; c: ChartPalette;
}) {
  const kpis = [
    { label: `${label} Sales`,    value: fmtMoney(sales),    icon: TrendingUp,   color: c.income,   change: salesChange,     up: sales >= 0 },
    { label: `${label} Expenses`, value: fmtMoney(expenses), icon: TrendingDown, color: c.expenses, change: expChange,       up: false },
    { label: `${label} Profit`,   value: fmtMoney(profit),   icon: DollarSign,   color: c.profit,   change: profitChange,    up: profit >= 0 },
    { label: "Cash Available",    value: fmtMoney(cash),     icon: Activity,     color: c.blue,     change: null,            up: true },
    { label: "Customers",         value: String(customers),  icon: Users,        color: c.gold,     change: customersChange, up: true },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((k) => (
        <div key={k.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${k.color}18` }}>
              <k.icon size={17} style={{ color: k.color }} />
            </div>
            {k.change && (
              <span className={`flex items-center gap-0.5 text-[11px] font-bold ${k.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                {k.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{k.change}
              </span>
            )}
          </div>
          <p className="text-lg font-extrabold text-foreground tracking-tight truncate">{k.value}</p>
          <p className="text-[11px] text-muted mt-0.5 font-medium">{k.label}</p>
        </div>
      ))}
    </div>
  );
}

function SalesChart({ chart, title, sub, c }: { chart: { label: string; sales: number; expenses: number }[]; title: string; sub: string; c: ChartPalette }) {
  return (
    <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-4">
          {[{ color: c.income, label: "Sales" }, { color: c.expenses, label: "Expenses" }].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="text-[11px] text-muted font-medium">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pt-4 pb-3 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart}>
            <defs>
              <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={c.income} stopOpacity={0.18} /><stop offset="95%" stopColor={c.income} stopOpacity={0} /></linearGradient>
              <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={c.expenses} stopOpacity={0.12} /><stop offset="95%" stopColor={c.expenses} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={c.tooltip} formatter={(v, n) => [fmtMoney(Number(v)), n === "sales" ? "Sales" : "Expenses"]} />
            <Area type="monotone" dataKey="sales"    stroke={c.income}   strokeWidth={2.5} fill="url(#gS)" dot={false} activeDot={{ r: 4, fill: c.income,   strokeWidth: 0 }} />
            <Area type="monotone" dataKey="expenses" stroke={c.expenses} strokeWidth={2}   fill="url(#gE)" dot={false} activeDot={{ r: 4, fill: c.expenses, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TargetAndActions({ sales, target, label, c }: { sales: number; target: number; label: string; c: ChartPalette }) {
  const targetPct = target > 0 ? Math.min(100, Math.round((sales / target) * 100)) : 0;
  const actions = [
    { label: "Record Sale",    href: "/sales",         icon: ShoppingCart, color: c.income   },
    { label: "Add Stock",      href: "/inventory",     icon: Package,      color: c.blue     },
    { label: "Record Expense", href: "/finance/expenses", icon: DollarSign, color: c.expenses },
    { label: "View Reports",   href: "/finance",       icon: BarChart3,    color: c.profit   },
    { label: "Customers",      href: "/sales/customers", icon: Users,      color: c.gold     },
    { label: "Set Target",     href: "/sales/targets", icon: Target,       color: c.gray     },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-foreground">{label} Target</h2>
          <span className="text-[11px] font-bold" style={{ color: c.income }}>{targetPct}%</span>
        </div>
        <p className="text-[11px] text-muted mb-3">{fmtMoney(sales)} of {target > 0 ? fmtMoney(target) : "No target set"}</p>
        <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${targetPct}%`, backgroundColor: c.income }} />
        </div>
        {target > 0 && <p className="text-[11px] text-muted"><span className="font-semibold text-foreground">{fmtMoney(Math.max(0, target - sales))}</span> left to target</p>}
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Zap size={13} style={{ color: c.gold }} />
          <h2 className="text-sm font-bold text-foreground">Quick Actions</h2>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {actions.map((a) => (
            <a key={a.label} href={a.href} className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-surface transition-colors group" style={{ backgroundColor: `${a.color}0d` }}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${a.color}20` }}>
                <a.icon size={13} style={{ color: a.color }} />
              </div>
              <span className="text-[12px] font-semibold text-foreground/80 group-hover:text-foreground leading-tight">{a.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopProducts({ orders }: { orders: ApiOrder[] }) {
  const map = new Map<string, { name: string; sold: number; revenue: number }>();
  for (const o of orders) {
    for (const item of o.items ?? []) {
      const key = item.product_name;
      const cur = map.get(key) ?? { name: key, sold: 0, revenue: 0 };
      map.set(key, { name: key, sold: cur.sold + item.quantity, revenue: cur.revenue + item.line_total });
    }
  }
  const top = [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  if (!top.length) return <p className="px-4 py-6 text-[12px] text-muted text-center">No sales data yet</p>;
  return (
    <div className="divide-y divide-border">
      {top.map((p, i) => (
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
  );
}

function SidePanel({ orders, lowStock }: { orders: ApiOrder[]; lowStock: { name: string; stock: number; min: number }[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Top Products</h2>
          <a href="/inventory" className="text-[11px] font-bold text-accent hover:underline">View all</a>
        </div>
        <TopProducts orders={orders} />
      </div>
      {lowStock.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Low Stock</h2>
            <a href="/inventory" className="text-[11px] font-bold text-accent hover:underline">Restock</a>
          </div>
          <div className="divide-y divide-border">
            {lowStock.map((item, i) => {
              const pct = item.min > 0 ? Math.min(100, Math.round((item.stock / item.min) * 100)) : 0;
              const col = item.stock === 0 ? "#ef4444" : pct < 50 ? "#f59e0b" : "#10b981";
              return (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium text-foreground truncate max-w-[130px]">{item.name}</span>
                    <span className="text-[11px] font-bold ml-2" style={{ color: col }}>{item.stock}/{item.min}</span>
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: col }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
            <Package size={16} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Stock Healthy</p>
            <p className="text-[11px] text-muted">All products are well stocked</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");

  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);

  const [sales, setSales]           = useState(0);
  const [expenses, setExpenses]     = useState(0);
  const [profit, setProfit]         = useState(0);
  const [cash, setCash]             = useState(0);
  const [customers, setCustomers]   = useState(0);
  const [target, setTarget]         = useState(0);
  const [orders, setOrders]         = useState<ApiOrder[]>([]);
  const [allOrders, setAllOrders]   = useState<ApiOrder[]>([]);
  const [inventory, setInventory]   = useState<ApiProduct[]>([]);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    const { from, to } = periodDateRange(p);
    try {
      const [incomeRes, cashRes, customersRes, targetsRes, ordersRes, allOrdersRes, inventoryRes] = await Promise.allSettled([
        financeApi.incomeStatement(from, to),
        financeApi.cashFlow(from, to),
        salesApi.listCustomers(1, 1),
        salesApi.listTargets(1, 100),
        salesApi.listOrders(1, 10, "Completed"),
        salesApi.listOrders(1, 500, "Completed"),
        inventoryApi.listProducts(1, 200),
      ]);

      if (incomeRes.status === "fulfilled") {
        const d = incomeRes.value.data;
        setSales(d.total_revenue);
        setExpenses(d.total_operating_expenses);
        setProfit(d.net_income);
      }
      if (cashRes.status === "fulfilled") setCash(cashRes.value.data.ending_cash);
      if (customersRes.status === "fulfilled") setCustomers(customersRes.value.data.total);
      if (targetsRes.status === "fulfilled") {
        const targets = targetsRes.value.data.items;
        const periodLabel = [...PERIODS, ...PAST_YEARS].find((x) => x.key === p)?.label ?? "";
        const match = targets.find((t) => t.period.toLowerCase().includes(periodLabel.toLowerCase())) ?? targets[0];
        setTarget(match?.target_value ?? 0);
      }
      if (ordersRes.status === "fulfilled") setOrders(ordersRes.value.data.items);
      if (allOrdersRes.status === "fulfilled") setAllOrders(allOrdersRes.value.data.items);
      if (inventoryRes.status === "fulfilled") setInventory(inventoryRes.value.data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const label = [...PERIODS, ...PAST_YEARS].find((p) => p.key === period)!.label;
  const chart = buildChart(allOrders, period);

  const lowStock = inventory
    .map((p) => ({ name: p.name, stock: variantStock(p), min: variantMinStock(p) }))
    .filter((i) => i.stock <= i.min)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 6);

  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Header + period filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Hello, {user?.name?.split(" ")[0] || "Owner"} 👋</h1>
          <p className="text-sm text-muted mt-0.5">Here&apos;s your business overview.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface border border-border rounded-lg p-0.5 gap-0.5">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all whitespace-nowrap ${period === p.key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                {p.label}
              </button>
            ))}
            <select
              value={period.startsWith("year_") ? period : ""}
              onChange={(e) => e.target.value && setPeriod(e.target.value as Period)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all bg-card cursor-pointer outline-none border-0 ${period.startsWith("year_") ? "text-foreground shadow-sm" : "text-muted"}`}
            >
              <option value="">Past Years</option>
              {PAST_YEARS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <KpiCards
          sales={sales} expenses={expenses} profit={profit} cash={cash} customers={customers}
          salesChange={null} expChange={null} profitChange={null} customersChange={null}
          label={label} c={c}
        />
      )}

      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
          <p className="text-[13px] text-muted"><span className="font-semibold text-foreground">{lowStock.length} products</span> are running low on stock.</p>
          <a href="/inventory" className="ml-auto text-[12px] font-semibold text-accent hover:underline flex items-center gap-0.5 whitespace-nowrap">View all <ChevronRight size={11} /></a>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <SalesChart
          chart={chart}
          title={`${label} Sales`}
          sub="Revenue vs expenses"
          c={c}
        />
        <TargetAndActions sales={sales} target={target} label={label} c={c} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent Sales */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent Sales</h2>
            <a href="/sales/orders" className="text-[11px] font-bold text-accent hover:underline flex items-center gap-0.5">View all <ChevronRight size={11} /></a>
          </div>
          <div className="overflow-x-auto">
            {recentOrders.length === 0 ? (
              <p className="px-5 py-6 text-[12px] text-muted text-center">No completed orders yet</p>
            ) : (
              <table className="w-full min-w-[480px]">
                <thead><tr className="border-b border-border bg-surface/50">
                  {["Customer", "Items", "Total", "Order #", "Time"].map((h, i) => (
                    <th key={h} className={`text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-2.5 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-surface/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">{o.customer?.name ?? "Walk-in"}</td>
                      <td className="px-4 py-3 text-right text-sm text-muted">{o.items?.length ?? 0}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-foreground">{fmtMoney(o.total)}</td>
                      <td className={`px-4 py-3 text-right text-[11px] font-bold ${METHOD_COLOR["cash"]}`}>{o.order_number}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-muted">
                        <span className="flex items-center gap-1 justify-end"><Clock size={10} />{relativeTime(o.ordered_at ?? o.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <SidePanel orders={allOrders} lowStock={lowStock} />
      </div>
    </div>
  );
}
