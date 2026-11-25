"use client";
import { FeatureLink } from "@/components/dashboard/FeatureLink";
import { TableScroll } from "@/components/ui/TableScroll";


import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  ShoppingCart,
  Package,
  BarChart3,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ChevronRight,
  Activity,
  Coins,
  AlertTriangle,
  Landmark,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  DonutChart,
} from "@/components/charts/lazy";
import { LoadError, SectionState, Skeleton } from "@/components/ui/LoadState";
import { combinedState, loadState } from "@/lib/loadState";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { chartPalette, type ChartPalette } from "@/lib/chartColors";
import { fmtMoney } from "@/lib/config";
import { fmtDateTime } from "@/lib/date";
import {
  useProducts,
  useLowStockReport,
  useCustomers,
  useOrders,
  useTargets,
  useIncomeStatement,
  useRevenueSummary,
  useCashFlow,
  type ApiProduct,
  type ApiOrder,
} from "@/lib/api/hooks";
import type { RevenueSummary } from "@/lib/api/financialWorkspace";
import {
  isPresetKey,
  resolveSelection,
  toISO,
  parseISO,
  daysInRange,
  METHOD_COLOR,
  nextTaxDeadline,
  type DateSelection,
  type Period,
  type ResolvedRange,
} from "./data";
import { DateRangeFilter } from "./DateRangeFilter";
import { ModuleBreakdown } from "./ModuleBreakdown";

// ── helpers ──────────────────────────────────────────────────────────────────

function variantStock(p: ApiProduct) {
  return p.has_variants && p.variants?.length
    ? p.variants.reduce((s, v) => s + v.stock, 0)
    : p.stock;
}
function variantMinStock(p: ApiProduct) {
  return p.has_variants && p.variants?.length
    ? p.variants.reduce((s, v) => s + v.min_stock, 0)
    : p.min_stock;
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

type ChartPoint = { label: string; sales: number; otherIncome: number; expenses: number };
/** Something that happened at a moment and adds to one chart series. Both series come from the revenue summary (posted
 *  revenue net of VAT, the same query as the Sales and Other Income cards), already limited to the period and branch, so
 *  the chart always adds up to the cards. */
type ChartEntry = { at: Date; amount: number; kind: "sales" | "otherIncome" };

const point = (label: string, entries: ChartEntry[], inBucket: (at: Date) => boolean): ChartPoint => {
  const total = (kind: ChartEntry["kind"]) => entries.filter((e) => e.kind === kind && inBucket(e.at)).reduce((s, e) => s + e.amount, 0);
  return { label, sales: total("sales"), otherIncome: total("otherIncome"), expenses: 0 };
};

/** Custom ranges and picked quarters: bucket the span itself — hours for one day, days up to two weeks, weeks up to ~two months, else months. */
function buildRangeChart(entries: ChartEntry[], range: ResolvedRange): ChartPoint[] {
  const days = daysInRange(range.from, range.to);
  const fmt = (iso: string) => parseISO(iso).toLocaleDateString("en", { day: "numeric", month: "short" });
  const between = (from: string, to: string) => (at: Date) => { const d = toISO(at); return d >= from && d <= to; };
  if (days === 1) {
    const hours = [8, 10, 12, 14, 16, 18];
    return hours.map((h, i) => point(`${h % 12 || 12}${h < 12 ? "am" : "pm"}`, entries, (at) => toISO(at) === range.from && at.getHours() >= h && at.getHours() < (hours[i + 1] ?? 24)));
  }
  const out: ChartPoint[] = [];
  if (days <= 62) {
    const step = days <= 14 ? 1 : 7;
    for (let d = parseISO(range.from); toISO(d) <= range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)) {
      const start = toISO(d);
      const endD = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step - 1);
      const end = toISO(endD) > range.to ? range.to : toISO(endD);
      out.push(point(fmt(start), entries, between(start, end)));
    }
    return out;
  }
  const last = parseISO(range.to);
  for (let d = new Date(parseISO(range.from).getFullYear(), parseISO(range.from).getMonth(), 1); d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const start = toISO(d) < range.from ? range.from : toISO(d);
    const monthEnd = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    out.push(point(d.toLocaleDateString("en", { month: "short", ...(parseISO(range.from).getFullYear() !== last.getFullYear() ? { year: "2-digit" } : {}) }), entries, between(start, monthEnd > range.to ? range.to : monthEnd)));
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildChart(all: ChartEntry[], range: ResolvedRange): ChartPoint[] {
  // Buckets below match on weekday, day of month or month only, so keep strictly to the selected dates first.
  const entries = all.filter((e) => { const d = toISO(e.at); return d >= range.from && d <= range.to; });
  if (!isPresetKey(range.key)) return buildRangeChart(entries, range);
  const period = range.key as Period;
  if (period === "today") {
    const hours = [8, 10, 12, 14, 16, 18];
    return ["8am", "10am", "12pm", "2pm", "4pm", "6pm"].map((label, i) => point(label, entries, (at) => at.getHours() >= hours[i] && at.getHours() < (hours[i + 1] ?? 24)));
  }
  if (period === "week") {
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => point(label, entries, (at) => (at.getDay() + 6) % 7 === i));
  }
  if (period === "month" || period === "last_month") {
    return ["Wk 1", "Wk 2", "Wk 3", "Wk 4"].map((label, i) => point(label, entries, (at) => Math.floor((at.getDate() - 1) / 7) === i));
  }
  if (period === "quarter") {
    const startMonth = Math.floor(new Date().getMonth() / 3) * 3;
    return [0, 1, 2].map((i) => point(MONTHS[startMonth + i], entries, (at) => at.getMonth() === startMonth + i));
  }
  // year / year_YYYY — monthly
  return MONTHS.map((label, i) => point(label, entries, (at) => at.getMonth() === i));
}

/** One revenue series as chart entries: by posting hour for a single day, otherwise by date (placed at midday). */
function revenueEntries(summary: RevenueSummary | undefined, range: ResolvedRange, kind: ChartEntry["kind"]): ChartEntry[] {
  if (!summary) return [];
  const pad = (n: number) => String(n).padStart(2, "0");
  const byHour = (kind === "sales" ? summary.sales_by_hour : summary.other_income_by_hour) ?? [];
  const byDay = (kind === "sales" ? summary.sales_by_day : summary.other_income_by_day) ?? [];
  if (range.from === range.to && byHour.length) {
    return byHour.map((r) => ({ at: new Date(`${range.from}T${pad(r.hour)}:00:00`), amount: Number(r.amount), kind }));
  }
  return byDay.map((r) => ({ at: new Date(`${r.date}T12:00:00`), amount: Number(r.amount), kind }));
}

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCards({
  sales,
  otherIncome,
  expenses,
  profit,
  cash,
  customers,
  salesChange,
  expChange,
  profitChange,
  customersChange,
  label,
  c,
}: {
  sales: number;
  otherIncome: number;
  expenses: number;
  profit: number;
  cash: number;
  customers: number;
  salesChange: string | null;
  expChange: string | null;
  profitChange: string | null;
  customersChange: string | null;
  label: string;
  c: ChartPalette;
}) {
  const { currencySymbol, t } = useAppConfig();
  const kpis = [
    {
      label: `${label} Sales`,
      value: fmtMoney(sales, currencySymbol),
      icon: TrendingUp,
      color: c.income,
      change: salesChange,
      up: sales >= 0,
    },
    {
      label: `${label} Expenses`,
      value: fmtMoney(expenses, currencySymbol),
      icon: TrendingDown,
      color: c.expenses,
      change: expChange,
      up: false,
    },
    {
      label: `${label} Profit`,
      value: fmtMoney(profit, currencySymbol),
      icon: DollarSign,
      color: c.profit,
      change: profitChange,
      up: profit >= 0,
    },
    {
      label: "Cash Available",
      value: fmtMoney(cash, currencySymbol),
      icon: Activity,
      color: c.blue,
      change: null,
      up: true,
    },
    {
      // Posted income on revenue accounts other than sales (Accounting → Income). Shown even when it is zero.
      label: `${label} ${t("otherIncome")}`,
      value: fmtMoney(otherIncome, currencySymbol),
      icon: Coins,
      color: c.blue,
      change: null,
      up: otherIncome >= 0,
    },
    {
      label: "Customers",
      value: String(customers),
      icon: Users,
      color: c.gold,
      change: customersChange,
      up: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${k.color}18` }}
            >
              <k.icon size={17} style={{ color: k.color }} />
            </div>
            {k.change && (
              <span
                className={`flex items-center gap-0.5 text-[11px] font-bold ${k.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}
              >
                {k.up ? (
                  <ArrowUpRight size={10} />
                ) : (
                  <ArrowDownRight size={10} />
                )}
                {k.change}
              </span>
            )}
          </div>
          <p className="text-lg font-extrabold text-foreground tracking-tight truncate" title={k.value}>
            {k.value}
          </p>
          <p className="text-[11px] text-muted mt-0.5 font-medium">{k.label}</p>
        </div>
      ))}
    </div>
  );
}

function SalesChart({
  chart,
  title,
  sub,
  c,
}: {
  chart: ChartPoint[];
  title: string;
  sub: string;
  c: ChartPalette;
}) {
  const { currencySymbol, t } = useAppConfig();
  return (
    <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-4">
          {[
            { color: c.income, label: t("sales") },
            { color: c.blue, label: t("otherIncome") },
            { color: c.expenses, label: t("expenses") },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              <span className="text-[11px] text-muted font-medium">
                {l.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pt-4 pb-3 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart}>
            <defs>
              <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c.income} stopOpacity={0.18} />
                <stop offset="95%" stopColor={c.income} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gO" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c.blue} stopOpacity={0.15} />
                <stop offset="95%" stopColor={c.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c.expenses} stopOpacity={0.12} />
                <stop offset="95%" stopColor={c.expenses} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={c.grid}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: c.tick }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: c.tick }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={c.tooltip}
              formatter={(v, n) => [
                fmtMoney(Number(v), currencySymbol),
                n === "sales" ? t("sales") : n === "otherIncome" ? t("otherIncome") : t("expenses"),
              ]}
            />
            <Area
              type="monotone"
              dataKey="sales"
              stroke={c.income}
              strokeWidth={2.5}
              fill="url(#gS)"
              dot={false}
              activeDot={{ r: 4, fill: c.income, strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="otherIncome"
              stroke={c.blue}
              strokeWidth={2}
              fill="url(#gO)"
              dot={false}
              activeDot={{ r: 4, fill: c.blue, strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke={c.expenses}
              strokeWidth={2}
              fill="url(#gE)"
              dot={false}
              activeDot={{ r: 4, fill: c.expenses, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function EarningsBreakdown({
  sales,
  otherIncome,
  expenses,
  profit,
  label,
  c,
}: {
  sales: number;
  otherIncome: number;
  expenses: number;
  profit: number;
  label: string;
  c: ChartPalette;
}) {
  const { currencySymbol, t } = useAppConfig();
  // Revenue is sales plus other income; the margin is profit on that whole revenue.
  const totalRevenue = sales + otherIncome;
  const hasData = totalRevenue > 0;
  const isLoss = profit < 0;
  const data = [
    { name: t("sales"), value: Math.max(0, sales) },
    { name: t("otherIncome"), value: Math.max(0, otherIncome) },
  ];
  const margin = hasData ? Math.round((profit / totalRevenue) * 100) : 0;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">
          Earnings Breakdown
        </h2>
        <p className="text-[11px] text-muted mt-0.5">
          How {label.toLowerCase()}&apos;s revenue split
        </p>
      </div>
      {!hasData ? (
        <p className="px-4 py-6 text-[12px] text-muted text-center">
          No revenue yet
        </p>
      ) : (
        <div className="p-4 flex items-center gap-4">
          <div className="w-[92px] h-[92px] flex-shrink-0 relative">
            {data.length > 0 && (
              <DonutChart
                data={data}
                colors={[c.income, c.blue]}
                innerRadius={28}
                outerRadius={44}
                tooltipStyle={c.tooltip}
                tooltipFormatter={(v, n) => [fmtMoney(Number(v), currencySymbol), String(n)]}
              />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span
                className={`text-[15px] font-extrabold ${isLoss ? "text-red-500" : "text-foreground"}`}
              >
                {margin}%
              </span>
              <span className="text-[8px] text-muted uppercase tracking-wide">
                margin
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {[{ color: c.income, name: t("sales"), value: sales }, { color: c.blue, name: t("otherIncome"), value: otherIncome }].map((row) => (
              <div key={row.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                <span className="flex-1 whitespace-nowrap text-[12px] text-foreground/80">{row.name}</span>
                <span className="ml-auto whitespace-nowrap text-[11px] font-bold font-mono text-foreground">{fmtMoney(row.value, currencySymbol)}</span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border pt-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.profit }}
              />
              <span className="flex-1 whitespace-nowrap text-[12px] text-foreground/80">
                Profit
              </span>
              <span
                className="ml-auto whitespace-nowrap text-[11px] font-bold font-mono"
                style={{ color: isLoss ? "#ef4444" : c.profit }}
              >
                {fmtMoney(profit, currencySymbol)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.expenses }}
              />
              <span className="flex-1 whitespace-nowrap text-[12px] text-foreground/80">
                Expenses
              </span>
              <span className="ml-auto whitespace-nowrap text-[11px] font-bold font-mono text-muted">
                {fmtMoney(expenses, currencySymbol)}
              </span>
            </div>
            {isLoss && (
              <p className="text-[10px] text-red-500 font-medium pt-0.5">
                Expenses exceeded revenue this period.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TargetAndActions({
  sales,
  otherIncome,
  expenses,
  profit,
  target,
  label,
  c,
}: {
  sales: number;
  otherIncome: number;
  expenses: number;
  profit: number;
  target: number;
  label: string;
  c: ChartPalette;
}) {
  const { currencySymbol } = useAppConfig();
  const targetPct =
    target > 0 ? Math.min(100, Math.round((sales / target) * 100)) : 0;
  const actions = [
    {
      label: "Record Sale",
      href: "/sales",
      icon: ShoppingCart,
      color: c.income,
    },
    { label: "Add Stock", href: "/inventory", icon: Package, color: c.blue },
    {
      label: "Record Expense",
      href: "/expenses/list",
      icon: DollarSign,
      color: c.expenses,
    },
    {
      label: "View Reports",
      href: "/accounting",
      icon: BarChart3,
      color: c.profit,
    },
    {
      label: "Customers",
      href: "/customers",
      icon: Users,
      color: c.gold,
    },
    {
      label: "Set Target",
      href: "/sales/targets",
      icon: Target,
      color: c.gray,
    },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-foreground">{label} Target</h2>
          <span className="text-[11px] font-bold" style={{ color: c.income }}>
            {targetPct}%
          </span>
        </div>
        <p className="text-[11px] text-muted mb-3">
          {fmtMoney(sales, currencySymbol)} of {target > 0 ? fmtMoney(target, currencySymbol) : "No target set"}
        </p>
        <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${targetPct}%`, backgroundColor: c.income }}
          />
        </div>
        {target > 0 && (
          <p className="text-[11px] text-muted">
            <span className="font-semibold text-foreground">
              {fmtMoney(Math.max(0, target - sales), currencySymbol)}
            </span>{" "}
            left to target
          </p>
        )}
      </div>
      <EarningsBreakdown
        sales={sales}
        otherIncome={otherIncome}
        expenses={expenses}
        profit={profit}
        label={label}
        c={c}
      />
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Zap size={13} style={{ color: c.gold }} />
          <h2 className="text-sm font-bold text-foreground">Quick Actions</h2>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {actions.map((a) => (
            <FeatureLink
              key={a.label}
              href={a.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-surface transition-colors group"
              style={{ backgroundColor: `${a.color}0d` }}
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${a.color}20` }}
              >
                <a.icon size={13} style={{ color: a.color }} />
              </div>
              <span className="text-[12px] font-semibold text-foreground/80 group-hover:text-foreground leading-tight">
                {a.label}
              </span>
            </FeatureLink>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopProducts({ orders }: { orders: ApiOrder[] }) {
  const { currencySymbol } = useAppConfig();
  const map = new Map<
    string,
    { name: string; sold: number; revenue: number }
  >();
  for (const o of orders) {
    for (const item of o.items ?? []) {
      const key = item.product_name;
      const cur = map.get(key) ?? { name: key, sold: 0, revenue: 0 };
      map.set(key, {
        name: key,
        sold: cur.sold + item.quantity,
        revenue: cur.revenue + item.line_total,
      });
    }
  }
  const top = [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  if (!top.length)
    return (
      <p className="px-4 py-6 text-[12px] text-muted text-center">
        No sales data yet
      </p>
    );
  return (
    <div className="divide-y divide-border">
      {top.map((p, i) => (
        <div key={p.name} className="px-4 py-2.5 flex items-center gap-3">
          <span className="text-[11px] font-bold text-muted w-4 flex-shrink-0">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-foreground truncate">
              {p.name}
            </p>
            <p className="text-[10px] text-muted">{p.sold} sold</p>
          </div>
          <span className="text-[12px] font-bold text-foreground flex-shrink-0">
            {fmtMoney(p.revenue, currencySymbol)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SidePanel({
  orders,
  lowStock,
}: {
  orders: ApiOrder[];
  lowStock: { id: string; name: string; stock: number; min: number }[];
}) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Top Products</h2>
          <FeatureLink
            href="/inventory"
            className="text-[11px] font-bold text-accent hover:underline"
          >
            View all
          </FeatureLink>
        </div>
        <TopProducts orders={orders} />
      </div>
      {lowStock.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Low Stock</h2>
            <FeatureLink
              href="/inventory"
              className="text-[11px] font-bold text-accent hover:underline"
            >
              Restock
            </FeatureLink>
          </div>
          <div className="divide-y divide-border">
            {lowStock.map((item) => {
              const pct =
                item.min > 0
                  ? Math.min(100, Math.round((item.stock / item.min) * 100))
                  : 0;
              const col =
                item.stock === 0 ? "#ef4444" : pct < 50 ? "#f59e0b" : "#10b981";
              return (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium text-foreground truncate max-w-[130px]">
                      {item.name}
                    </span>
                    <span
                      className="text-[11px] font-bold ml-2"
                      style={{ color: col }}
                    >
                      {item.stock}/{item.min}
                    </span>
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: col }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
            <Package
              size={16}
              className="text-emerald-600 dark:text-emerald-400"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Stock Healthy
            </p>
            <p className="text-[11px] text-muted">
              All products are well stocked
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const { theme, currencySymbol } = useAppConfig();
  const c = chartPalette(theme === "dark");

  const [selection, setSelection] = useState<DateSelection>({ key: "month" });
  const range = resolveSelection(selection);
  const { from, to } = range;
  const income = useIncomeStatement(from, to);
  const revenue = useRevenueSummary(from, to);
  const cash = useCashFlow(from, to);
  const customers = useCustomers(1, 1);
  const targets = useTargets(1, 100);
  const orders = useOrders(1, 10, "Completed");
  const allOrders = useOrders(1, 500, "Completed");
  const products = useProducts(1, 200);
  const lowStockReport = useLowStockReport();

  // Each section loads and fails on its own: a slow or failed request never blanks the whole dashboard, and a failed
  // money figure is shown as an error with a retry, never as zero.
  const kpiState = combinedState([loadState(income), loadState(revenue), loadState(cash), loadState(customers)]);
  const salesState = combinedState([loadState(allOrders), loadState(products)]);
  const targetState = combinedState([loadState(income), loadState(revenue), loadState(targets)]);
  const recentState = loadState(orders);
  const retry = (...queries: { isError: boolean; refetch: () => unknown }[]) => () => queries.filter((q) => q.isError).forEach((q) => void q.refetch());
  const kpiSkeleton = <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" label="Loading figures" />)}</div>;

  // Sales and other income are split by the one P&L rule (an account's own classification in the Chart of Accounts, else its
  // code range), the same as the Income Statement; both net of VAT, from the same query as Accounting → Income "Posted
  // revenue". Profit = total revenue − cost of goods − expenses − other expenses (= the Income Statement's net profit).
  const sales = Number(revenue.data?.sales_revenue ?? 0);
  const otherIncome = Number(revenue.data?.other_income ?? 0);
  const totalRevenue = Number(revenue.data?.total_revenue ?? 0);
  const expenses = income.data?.total_operating_expenses ?? 0;
  const profit = totalRevenue - (income.data?.total_cogs ?? 0) - expenses - (income.data?.total_other_expenses ?? 0);
  const cashAmt = cash.data?.ending_cash ?? 0;
  const customersCount = customers.data?.total ?? 0;
  const periodLabel = range.label;
  const targetMatch = (targets.data?.items ?? []).find((t) =>
    t.period.toLowerCase().includes(periodLabel.toLowerCase()),
  );
  const target = targetMatch?.target_value ?? 0;
  const orderItems = orders.data?.items ?? [];
  const allOrderItems = allOrders.data?.items ?? [];
  const inventory = products.data?.items ?? [];

  const label = range.label;
  const chart = buildChart([...revenueEntries(revenue.data, range, "sales"), ...revenueEntries(revenue.data, range, "otherIncome")], range);

  const categoryMap = new Map<string, number>();
  for (const o of allOrderItems) {
    const d = (o.ordered_at ?? o.created_at ?? "").slice(0, 10);
    if (d < from || d > to) continue;
    for (const item of o.items ?? []) {
      const product = inventory.find((p) => p.id === item.product_id);
      const catName = product?.category?.name ?? "Uncategorized";
      categoryMap.set(
        catName,
        (categoryMap.get(catName) ?? 0) + item.line_total,
      );
    }
  }
  const categoryData = [...categoryMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const lowStock = inventory
    .map((p) => ({
      id: p.id,
      name: p.name,
      stock: variantStock(p),
      min: variantMinStock(p),
    }))
    .filter((i) => i.stock <= i.min)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 6);

  const recentOrders = orderItems.slice(0, 5);
  const taxDeadline = nextTaxDeadline();

  return (
    <div className="space-y-5">
      {/* Header + period filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Hello, {user?.name?.split(" ")[0] || "Owner"} 👋
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Here&apos;s your business overview.
          </p>
        </div>
        <DateRangeFilter value={selection} onChange={setSelection} />
      </div>

      <>
          <SectionState state={kpiState} loading={kpiSkeleton} errorTitle="Could not load this period's figures" error={income.error ?? revenue.error ?? cash.error ?? customers.error} onRetry={retry(income, revenue, cash, customers)}>
          <KpiCards
            sales={sales}
            otherIncome={otherIncome}
            expenses={expenses}
            profit={profit}
            cash={cashAmt}
            customers={customersCount}
            salesChange={null}
            expChange={null}
            profitChange={null}
            customersChange={null}
            label={label}
            c={c}
          />
          </SectionState>

          <SectionState state={salesState} loading={<Skeleton className="h-64" label="Loading sales breakdown" />} errorTitle="Could not load the sales breakdown" error={allOrders.error ?? products.error} onRetry={retry(allOrders, products)}>
          <ModuleBreakdown
            salesData={categoryData}
            inventory={inventory}
            from={from}
            to={to}
            label={label}
            c={c}
          />
          </SectionState>

          {salesState === "ready" && (lowStockReport.data?.total ?? lowStock.length) > 0 && (
            <div className="flex items-center gap-2 px-1">
              <AlertTriangle
                size={13}
                className="text-amber-500 flex-shrink-0"
              />
              <p className="text-[13px] text-muted">
                <span className="font-semibold text-foreground">
                  {lowStockReport.data?.total ?? lowStock.length} products
                </span>{" "}
                are at or below their reorder level.
              </p>
              <FeatureLink
                href="/inventory"
                className="ml-auto text-[12px] font-semibold text-accent hover:underline flex items-center gap-0.5 whitespace-nowrap"
              >
                View all <ChevronRight size={11} />
              </FeatureLink>
            </div>
          )}

          {taxDeadline.daysAway <= 21 && (
            <div className="flex items-center gap-2 px-1">
              <Landmark size={13} className="text-blue-500 flex-shrink-0" />
              <p className="text-[13px] text-muted">
                Quarterly VAT &amp; CIT instalment due{" "}
                <span className="font-semibold text-foreground">
                  {taxDeadline.date.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                  })}
                </span>{" "}
                (
                {taxDeadline.daysAway === 0
                  ? "today"
                  : `${taxDeadline.daysAway} day${taxDeadline.daysAway === 1 ? "" : "s"}`}
                ) — applies if you file VAT quarterly.
              </p>
              <FeatureLink
                href="/accounting"
                className="ml-auto text-[12px] font-semibold text-accent hover:underline flex items-center gap-0.5 whitespace-nowrap"
              >
                Accounting <ChevronRight size={11} />
              </FeatureLink>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <SectionState state={salesState} loading={<Skeleton className="h-72" label="Loading sales chart" />} errorTitle="Could not load the sales chart" error={allOrders.error ?? products.error} onRetry={retry(allOrders, products)}>
                <SalesChart
                  chart={chart}
                  title={`${label} Sales`}
                  sub="Revenue vs expenses"
                  c={c}
                />
              </SectionState>
            </div>
            <SectionState state={targetState} loading={<Skeleton className="h-72" label="Loading target" />} errorTitle="Could not load the target" error={income.error ?? revenue.error ?? targets.error} onRetry={retry(income, revenue, targets)}>
              <TargetAndActions
                sales={sales}
                otherIncome={otherIncome}
                expenses={expenses}
                profit={profit}
                target={target}
                label={label}
                c={c}
              />
            </SectionState>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Recent Sales */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">
                  Recent Sales
                </h2>
                <FeatureLink
                  href="/sales/orders"
                  className="text-[11px] font-bold text-accent hover:underline flex items-center gap-0.5"
                >
                  View all <ChevronRight size={11} />
                </FeatureLink>
              </div>
              <div className="overflow-x-auto">
                {recentState === "loading" ? (
                  <div className="p-4"><Skeleton className="h-40" label="Loading recent sales" /></div>
                ) : recentState === "error" ? (
                  <div className="p-4"><LoadError compact title="Could not load recent sales" error={orders.error} onRetry={() => void orders.refetch()} /></div>
                ) : recentOrders.length === 0 ? (
                  <p className="px-5 py-6 text-[12px] text-muted text-center">
                    No completed orders yet
                  </p>
                ) : (
                  <TableScroll><table className="w-full min-w-[480px]">
                    <thead>
                      <tr className="border-b border-border bg-surface/50">
                        {["Customer", "Items", "Total", "Order #", "Time"].map(
                          (h, i) => (
                            <th
                              key={h}
                              className={`text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-2.5 ${i === 0 ? "text-left" : "text-right"}`}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentOrders.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-surface/40 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">
                            {o.customer?.name ?? "Walk-in"}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-muted">
                            {o.items?.length ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-foreground">
                            {fmtMoney(o.total, currencySymbol)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right text-[11px] font-bold ${METHOD_COLOR["cash"]}`}
                          >
                            {o.order_number}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-muted">
                            <span
                              className="flex items-center gap-1 justify-end cursor-default"
                              title={fmtDateTime(o.ordered_at ?? o.created_at)}
                            >
                              <Clock size={10} />
                              {relativeTime(o.ordered_at ?? o.created_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></TableScroll>
                )}
              </div>
            </div>
            <SectionState state={salesState} loading={<Skeleton className="h-72" label="Loading activity" />} errorTitle="Could not load recent activity" error={allOrders.error ?? products.error} onRetry={retry(allOrders, products)}>
              <SidePanel orders={allOrderItems} lowStock={lowStock} />
            </SectionState>
          </div>
      </>
    </div>
  );
}
