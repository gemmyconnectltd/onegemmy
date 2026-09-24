"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, BarChart3,
  Building2, CheckCircle, Crown, Filter, Layers, Search,
  ShoppingCart, Users, X,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { DonutChart } from "@/components/charts/lazy";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { fmtRelative } from "@/lib/date";
import type { DonutDatum } from "@/components/charts/lazy";
import { useAdminFeatureUsage, useTenants, type AdminTenantUsage } from "@/lib/api/hooks";
import { tenantStatusLabel, type AdminTenant } from "@/lib/api/admin";

const PLAN_HEX: Record<string, string> = {
  free: "#64748b", starter: "#0284c7", professional: "#8b5cf6", enterprise: "#d97706",
};

const PLAN_PILL: Record<string, string> = {
  free: "bg-surface text-muted border border-border",
  starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  professional: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20",
  enterprise: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
};

const MODULE_COLORS: Record<string, string> = {
  sales: "#6366f1", inventory: "#0ea5e9", accounting: "#10b981", hr: "#8b5cf6",
  procurement: "#f59e0b", manufacturing: "#f43f5e", crm: "#06b6d4", repairs: "#64748b",
};

type Tier = "dormant" | "light" | "moderate" | "heavy";
const TIER_ORDER: Tier[] = ["dormant", "light", "moderate", "heavy"];

const TIER_META: Record<Tier, { label: string; sub: string; color: string }> = {
  dormant:  { label: "Dormant",  sub: "no orders",     color: "#ef4444" },
  light:    { label: "Light",    sub: "1–9 orders",    color: "#d97706" },
  moderate: { label: "Moderate", sub: "10–49 orders",  color: "#0284c7" },
  heavy:    { label: "Heavy",    sub: "50+ orders",    color: "#059669" },
};

const TIER_BADGE: Record<Tier, string> = {
  dormant:  "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20",
  light:    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  moderate: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  heavy:    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
};

const STATUS_META: Record<"active" | "pending" | "suspended", { label: string; color: string }> = {
  active:    { label: "Active",    color: "#059669" },
  pending:   { label: "Pending",   color: "#d97706" },
  suspended: { label: "Suspended", color: "#ef4444" },
};

function tierOf(usage: AdminTenantUsage | undefined): Tier {
  const orders = usage?.orders ?? 0;
  if (orders <= 0) return "dormant";
  if (orders < 10) return "light";
  if (orders < 50) return "moderate";
  return "heavy";
}

function statusOf(t: AdminTenant): "active" | "pending" | "suspended" {
  if (t.is_active) return "active";
  return t.subscription_status === "pending" ? "pending" : "suspended";
}

type SortKey = "name" | "users" | "orders" | "revenue" | "products" | "last_active";
type SortState = { key: SortKey; dir: "asc" | "desc" };

function SortHeader({ label, k, sort, onSort, className = "" }: {
  label: string;
  k: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <th className={`px-5 py-3 font-semibold cursor-pointer select-none whitespace-nowrap ${className}`} onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.key === k
          ? sort.dir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />
          : <span className="text-muted/40"><ArrowDown size={11} /></span>}
      </span>
    </th>
  );
}

/** Donut + legend breakdown — the "pie chart" unit. Live-updates with filters. */
function PieCard({
  title, sub, icon: Icon, data, colors, tooltipStyle, empty, legendHref,
}: {
  title: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  data: DonutDatum[];
  colors: string[];
  tooltipStyle: React.CSSProperties;
  empty?: string;
  legendHref?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted" />
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
        </div>
        {legendHref && (
          <Link href={legendHref} className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1">
            Detail <ArrowUpRight size={11} />
          </Link>
        )}
      </div>
      <p className="text-[11px] text-muted mb-4">{sub}</p>
      {total === 0 ? (
        <p className="text-[12px] text-muted text-center py-8">{empty ?? "No tenants match"}</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="w-28 h-28 flex-shrink-0">
            <DonutChart data={data} colors={colors} innerRadius={34} outerRadius={54} tooltipStyle={tooltipStyle} />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                <span className="font-semibold text-foreground truncate flex-1 capitalize">{d.name}</span>
                <span className="text-muted flex-shrink-0">{d.value} · {Math.round((d.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUsagePage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const { data: featureUsage } = useAdminFeatureUsage();
  const { data: tenantsData, isLoading } = useTenants(1, 200);
  const tenants = useMemo(() => tenantsData?.items ?? [], [tenantsData]);

  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterTier, setFilterTier] = useState<"all" | Tier>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "pending" | "suspended">("all");
  const [sort, setSort] = useState<SortState>({ key: "orders", dir: "desc" });
  // Captured once via a lazy initializer (React's sanctioned escape hatch for
  // an impure value like Date.now()) rather than called inside the useMemo
  // below, which must stay pure.
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase());
      const matchPlan = filterPlan === "all" || t.subscription_plan === filterPlan;
      const matchTier = filterTier === "all" || tierOf(t.usage) === filterTier;
      const matchStatus = filterStatus === "all" || statusOf(t) === filterStatus;
      return matchSearch && matchPlan && matchTier && matchStatus;
    });
  }, [tenants, search, filterPlan, filterTier, filterStatus]);

  const analytics = useMemo(() => {
    let orders = 0, completed = 0, revenue = 0, users = 0, products = 0;
    let active30 = 0;
    const plans: Record<string, { tenants: number; users: number; orders: number; completed: number; revenue: number; products: number }> = {};
    for (const t of filtered) {
      const u = t.usage;
      orders += u?.orders ?? 0;
      completed += u?.completed_orders ?? 0;
      revenue += u?.revenue ?? 0;
      users += u?.users ?? 0;
      products += u?.products ?? 0;
      if (u?.last_active_at && now - new Date(u.last_active_at).getTime() < 30 * 864e5) active30 += 1;
      const agg = (plans[t.subscription_plan] ??= { tenants: 0, users: 0, orders: 0, completed: 0, revenue: 0, products: 0 });
      agg.tenants += 1;
      agg.users += u?.users ?? 0;
      agg.orders += u?.orders ?? 0;
      agg.completed += u?.completed_orders ?? 0;
      agg.revenue += u?.revenue ?? 0;
      agg.products += u?.products ?? 0;
    }
    return { orders, completed, revenue, users, products, active30, plans };
  }, [filtered, now]);

  const engagementData = useMemo(() =>
    TIER_ORDER.map((tier) => ({ name: TIER_META[tier].label, value: filtered.filter((t) => tierOf(t.usage) === tier).length }))
      .filter((d) => d.value > 0),
  [filtered]);

  const planData = useMemo(() =>
    Object.entries(analytics.plans).map(([name, agg]) => ({ name, value: agg.tenants }))
      .sort((a, b) => b.value - a.value),
  [analytics.plans]);

  const statusData = useMemo(() => {
    const counts = { active: 0, pending: 0, suspended: 0 };
    for (const t of filtered) counts[statusOf(t)] += 1;
    return (Object.keys(STATUS_META) as ("active" | "pending" | "suspended")[])
      .map((k) => ({ name: STATUS_META[k].label, value: counts[k] }))
      .filter((d) => d.value > 0);
  }, [filtered]);

  const sorted = useMemo(() => {
    const val = (t: AdminTenant): number | string => {
      switch (sort.key) {
        case "name": return t.name.toLowerCase();
        case "users": return t.usage?.users ?? 0;
        case "orders": return t.usage?.orders ?? 0;
        case "revenue": return t.usage?.revenue ?? 0;
        case "products": return t.usage?.products ?? 0;
        case "last_active": return t.usage?.last_active_at ? new Date(t.usage.last_active_at).getTime() : 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv))
        : (av as number) - (bv as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" },
    );
  };

  const clearFilters = () => {
    setSearch("");
    setFilterPlan("all");
    setFilterTier("all");
    setFilterStatus("all");
  };

  const hasFilters = search || filterPlan !== "all" || filterTier !== "all" || filterStatus !== "all";

  const modules = featureUsage?.modules ?? [];
  const moduleTotal = modules.reduce((s, m) => s + m.total_records, 0);
  const maxPlanTenants = Math.max(1, ...Object.values(analytics.plans).map((p) => p.tenants));
  const engaged = filtered.length - (engagementData.find((d) => d.name === "Dormant")?.value ?? 0);
  const topTenants = [...sorted].filter((t) => (t.usage?.orders ?? 0) > 0).slice(0, 10);

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      {/* Header — numbers inline, no cards */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Platform Usage</h1>
          <p className="text-sm text-muted mt-0.5">Pies, analytics and per-tenant detail — slice by plan, engagement or status</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted bg-surface border border-border rounded-xl px-3.5 py-2">
          <span><b className="text-foreground">{analytics.orders.toLocaleString()}</b> orders</span>
          <span><b className="text-foreground">{fmtMoney(analytics.revenue)}</b> revenue</span>
          <span><b className="text-foreground">{analytics.users.toLocaleString()}</b> users</span>
          <span><b className="text-foreground">{analytics.products.toLocaleString()}</b> products</span>
          <span><b className="text-emerald-600 dark:text-emerald-400">{engaged}</b> engaged</span>
          <span><b className="text-red-500">{filtered.length - engaged}</b> dormant</span>
          <span><b className="text-sky-600 dark:text-sky-400">{analytics.active30}</b> active 30d</span>
        </div>
      </div>

      {hasFilters && (
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <AlertTriangle size={13} />
          Charts and tables below reflect the active filters.
          <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-[11px] font-bold hover:underline">
            <X size={11} /> Clear filters
          </button>
        </div>
      )}

      {/* Filters — drive every chart and table on the page */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-xl p-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug..."
            className="w-full pl-9 pr-3 py-1.5 text-[12.5px] bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-border rounded-lg">
          <Filter size={12} className="text-muted" />
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="text-[12.5px] bg-transparent text-foreground focus:outline-none cursor-pointer capitalize"
          >
            <option value="all">All Plans</option>
            {[...new Set(tenants.map((t) => t.subscription_plan))].map((p) => (
              <option key={p} value={p} className="capitalize">{p}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-border rounded-lg">
          <Activity size={12} className="text-muted" />
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value as typeof filterTier)}
            className="text-[12.5px] bg-transparent text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Engagement</option>
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>{TIER_META[t].label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-border rounded-lg">
          <CheckCircle size={12} className="text-muted" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="text-[12.5px] bg-transparent text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-[11.5px] font-semibold text-muted hover:text-red-500 px-2 py-1 transition-colors">
            <X size={12} /> Reset
          </button>
        )}
        <span className="ml-auto text-[11.5px] font-medium text-muted whitespace-nowrap px-1">
          {filtered.length} of {tenants.length} tenants
        </span>
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PieCard
          title="Tenant Engagement"
          sub="Share of tenants by order volume"
          icon={Activity}
          data={engagementData}
          colors={TIER_ORDER.map((t) => TIER_META[t].color)}
          tooltipStyle={c.tooltip}
          empty="No tenants match"
        />
        <PieCard
          title="Tenants by Plan"
          sub="Subscription spread of the filtered set"
          icon={Crown}
          data={planData}
          colors={planData.map((d) => PLAN_HEX[d.name] ?? "#64748b")}
          tooltipStyle={c.tooltip}
          empty="No tenants match"
          legendHref="/admin/plans"
        />
        <PieCard
          title="Tenant Status"
          sub="Active, pending approval and suspended"
          icon={CheckCircle}
          data={statusData}
          colors={statusData.map((d) => STATUS_META[d.name.toLowerCase() as keyof typeof STATUS_META]?.color ?? "#64748b")}
          tooltipStyle={c.tooltip}
          empty="No tenants match"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Usage by plan — analytics table */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-amber-600 dark:text-amber-400" />
              <div>
                <h2 className="text-sm font-bold text-foreground">Usage by Plan</h2>
                <p className="text-[11px] text-muted">What each plan does on the platform — {analytics.orders.toLocaleString()} orders · {fmtMoney(analytics.revenue)} revenue</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider bg-surface/50">
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Tenants</th>
                  <th className="px-5 py-3 font-semibold">Users</th>
                  <th className="px-5 py-3 font-semibold">Orders</th>
                  <th className="px-5 py-3 font-semibold">Completed</th>
                  <th className="px-5 py-3 font-semibold text-right">Revenue</th>
                  <th className="px-5 py-3 font-semibold text-right">Products</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(analytics.plans).sort((a, b2) => b2[1].tenants - a[1].tenants).map(([plan, agg]) => {
                  const color = PLAN_HEX[plan] ?? "#64748b";
                  return (
                    <tr key={plan} className="hover:bg-surface/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18` }}>
                            <Crown size={13} style={{ color }} />
                          </div>
                          <span className="text-sm font-semibold text-foreground capitalize">{plan}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] font-semibold text-foreground mb-1">{agg.tenants}</p>
                        <div className="w-20 h-1 bg-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(agg.tenants / maxPlanTenants) * 100}%`, backgroundColor: color }} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] tabular-nums text-foreground">{agg.users.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-[13px] tabular-nums text-foreground">{agg.orders.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-[13px] tabular-nums text-foreground">{agg.completed.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right text-[13px] font-semibold tabular-nums text-foreground">{fmtMoney(agg.revenue)}</td>
                      <td className="px-5 py-3.5 text-right text-[13px] tabular-nums text-foreground">{agg.products.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {Object.keys(analytics.plans).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted">No tenants match the filters</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Module adoption donut — pie + top records */}
        <div className="bg-card border border-border rounded-xl flex flex-col p-5">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={14} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-foreground">Module Adoption</h2>
          </div>
          <p className="text-[11px] text-muted">Records across all {featureUsage?.total_tenants ?? 0} tenants · platform-wide</p>
          {modules.length === 0 ? (
            <p className="text-[12px] text-muted text-center py-8">Loading module data…</p>
          ) : (
            <div className="flex items-center gap-5 flex-1 pt-2">
              <div className="w-[112px] h-[112px] flex-shrink-0">
                <DonutChart
                  data={modules.map((m) => ({ name: m.label, value: m.total_records }))}
                  colors={modules.map((m) => MODULE_COLORS[m.key] ?? "#64748b")}
                  innerRadius={36}
                  outerRadius={56}
                  tooltipStyle={c.tooltip}
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {modules.slice(0, 6).map((m) => {
                  const color = MODULE_COLORS[m.key] ?? "#64748b";
                  const pct = moduleTotal > 0 ? Math.round((m.total_records / moduleTotal) * 100) : 0;
                  return (
                    <div key={m.key} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[11.5px] text-foreground/80 truncate flex-1">{m.label}</span>
                      <span className="text-[10px] font-bold text-muted flex-shrink-0">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Module breakdown — analytics bars, platform-wide */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={14} className="text-indigo-500" />
          <div>
            <h2 className="text-sm font-bold text-foreground">Module Breakdown</h2>
            <p className="text-[11px] text-muted">Adoption per module — {moduleTotal.toLocaleString()} records total · platform-wide</p>
          </div>
        </div>
        <div className="space-y-4 pt-3">
          {modules.map((m) => {
            const color = MODULE_COLORS[m.key] ?? "#64748b";
            return (
              <div key={m.key}>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[13px] font-semibold text-foreground truncate">{m.label}</span>
                    <span className="text-[11px] text-muted flex-shrink-0">{m.tenants_using.toLocaleString()}/{featureUsage?.total_tenants ?? 0} tenants</span>
                  </span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-muted">{m.total_records.toLocaleString()} records</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.adoption_pct >= 66 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : m.adoption_pct >= 33 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                      {m.adoption_pct}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${m.adoption_pct}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top tenants — analytics list, respects filters */}
      {topTenants.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-emerald-600 dark:text-emerald-400" />
              <div>
                <h2 className="text-sm font-bold text-foreground">Top Tenants by Orders</h2>
                <p className="text-[11px] text-muted">Most active businesses in the filtered set</p>
              </div>
            </div>
            <Link href="/admin/tenants" className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1">
              All tenants <ArrowUpRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {topTenants.map((t, i) => {
              const color = PLAN_HEX[t.subscription_plan] ?? "#64748b";
              return (
                <Link key={t.id} href={`/admin/tenants/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 hover:bg-surface/40 transition-colors group">
                  <span className="w-6 h-6 rounded-lg bg-surface border border-border flex items-center justify-center text-[11px] font-bold text-muted flex-shrink-0">{i + 1}</span>
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
                      <span className="text-[12px] font-bold" style={{ color }}>{t.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-accent transition-colors">{t.name}</p>
                      <p className="text-[10.5px] text-muted font-mono truncate">{t.slug}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg capitalize flex-shrink-0 ${PLAN_PILL[t.subscription_plan] ?? "bg-surface text-muted"}`}>{t.subscription_plan}</span>
                  </div>
                  <div className="flex items-center gap-5 flex-shrink-0 text-[12px]">
                    <span className="flex items-center gap-1.5 text-foreground"><ShoppingCart size={12} className="text-muted" /> {t.usage?.orders ?? 0} orders</span>
                    <span className="flex items-center gap-1.5 text-foreground hidden sm:flex"><BarChart3 size={12} className="text-muted" /> {t.currency} {(t.usage?.revenue ?? 0).toLocaleString()}</span>
                    <span className="flex items-center gap-1.5 text-foreground hidden md:flex"><Users size={12} className="text-muted" /> {t.usage?.users ?? 0}</span>
                    <span className="text-[11px] text-muted hidden lg:block">{fmtRelative(t.usage?.last_active_at)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* All tenants — sortable table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-violet-500" />
            <div>
              <h2 className="text-sm font-bold text-foreground">All Tenants</h2>
              <p className="text-[11px] text-muted">Sort and compare — click any column to reorder</p>
            </div>
          </div>
          <span className="text-[11.5px] font-medium text-muted whitespace-nowrap">{filtered.length} of {tenants.length} tenants</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider bg-surface/50">
                <SortHeader label="Business" k="name" sort={sort} onSort={toggleSort} />
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Engagement</th>
                <SortHeader label="Users" k="users" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader label="Orders" k="orders" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader label="Revenue" k="revenue" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader label="Products" k="products" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader label="Last Active" k="last_active" sort={sort} onSort={toggleSort} className="text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((t) => {
                const tier = tierOf(t.usage);
                return (
                  <tr key={t.id} className="hover:bg-surface/40 transition-colors group">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/tenants/${t.id}`} className="group flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center flex-shrink-0">
                          <span className="text-[12px] font-bold text-foreground/70">{t.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-foreground group-hover:text-accent transition-colors">{t.name}</p>
                          <p className="text-[10.5px] text-muted font-mono truncate">{t.slug}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-lg capitalize flex-shrink-0 ${PLAN_PILL[t.subscription_plan] ?? "bg-surface text-muted"}`}>
                        {t.subscription_plan}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-lg ${TIER_BADGE[tier]}`}>{TIER_META[tier].label}</span>
                        <span className={`text-[10px] font-medium ${t.is_active ? "text-emerald-600 dark:text-emerald-400" : t.subscription_status === "pending" ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                          {tenantStatusLabel(t)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[13px] tabular-nums text-foreground">{t.usage?.users ?? 0}</td>
                    <td className="px-5 py-3.5 text-right text-[13px] tabular-nums text-foreground font-semibold">{t.usage?.orders ?? 0}</td>
                    <td className="px-5 py-3.5 text-right text-[13px] tabular-nums text-foreground">{t.usage ? `${t.currency} ${t.usage.revenue.toLocaleString()}` : "—"}</td>
                    <td className="px-5 py-3.5 text-right text-[13px] tabular-nums text-foreground">{t.usage?.products ?? 0}</td>
                    <td className="px-5 py-3.5 text-right text-[12px] text-muted whitespace-nowrap">{fmtRelative(t.usage?.last_active_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && (
          <div className="py-14 text-center">
            <Building2 size={30} className="text-muted/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">No tenants match your filters</p>
            <p className="text-[12px] text-muted mt-1">Try adjusting search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}