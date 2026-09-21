"use client";
import {
  Building2, Users, ShoppingCart, TrendingUp, Activity, CheckCircle,
  XCircle, Package, ArrowUpRight, ArrowRight, Crown, UserPlus,
  AlertTriangle, Server, Clock, Globe2, Factory, Megaphone,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAdminStats, useTenants, useAdminTenantAnalytics } from "@/lib/api/hooks";
import { tenantStatusLabel } from "@/lib/api/admin";
import { fmtMoney } from "@/lib/config";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { TenantGrowthChart, DonutChart } from "@/components/charts/lazy";
import { BrandMark, type BrandKind } from "@/components/charts/BrandMark";
import Link from "next/link";

const PLAN_COLORS: Record<string, string> = {
  free: "#64748b", starter: "#0284c7", professional: "#8b5cf6", enterprise: "#d97706",
};

const COUNTRY_COLORS   = ["#0284c7", "#38bdf8", "#7dd3fc", "#bae6fd", "#93c5fd", "#6366f1", "#64748b"];
const INDUSTRY_COLORS  = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#e0e7ff", "#6366f1", "#64748b"];
const BIZ_TYPE_COLORS  = ["#059669", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"];
const HEARD_COLORS     = ["#d97706", "#f59e0b", "#fbbf24", "#fcd34d", "#fde68a"];

const BIZ_TYPE_LABELS: Record<string, string> = {
  sole: "Sole Proprietorship",
  partnership: "Partnership",
  llc: "Limited Liability (LLC)",
  unregistered: "Not Registered",
};

function normalizeBizType(data: { name: string; value: number }[]) {
  return data.map((d) => ({ ...d, name: BIZ_TYPE_LABELS[d.name] ?? d.name }));
}

function CategoryDonut({
  data, colors, tooltipStyle, empty, kind,
}: {
  data: { name: string; value: number }[];
  colors: string[];
  tooltipStyle: React.CSSProperties;
  empty?: string;
  kind: BrandKind;
}) {
  const visible = data.filter((d) => d.value > 0 && d.name !== "Unknown");
  const total = visible.reduce((s, d) => s + d.value, 0) || 1;
  if (visible.length === 0) return (
    <p className="text-[12px] text-muted text-center py-6">{empty ?? "No data yet"}</p>
  );
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24 flex-shrink-0">
        <DonutChart data={visible} colors={colors} innerRadius={30} outerRadius={48} tooltipStyle={tooltipStyle} />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {visible.slice(0, 5).map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-[12.5px]">
            <BrandMark kind={kind} name={d.name} color={colors[i % colors.length]} />
            <span className="font-semibold text-foreground truncate flex-1 capitalize">{d.name}</span>
            <span className="text-muted flex-shrink-0">{d.value} · {Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const { data: stats, isLoading, isError } = useAdminStats();
  const { data: analytics } = useAdminTenantAnalytics();
  const { data: tenantsData } = useTenants(1, 200);
  const allTenants = tenantsData?.items ?? [];

  if (isLoading) return <PageLoader />;

  if (isError || !stats) return (
    <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertTriangle size={16} /> Failed to load platform stats. Check your connection.
    </div>
  );

  const pendingSignups = allTenants.filter((t) => tenantStatusLabel(t) === "Pending Approval");
  const trueSuspended = allTenants.filter((t) => tenantStatusLabel(t) === "Suspended").length;
  const recentSignups = [...pendingSignups]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 5);

  // Cumulative running total ending exactly at stats.total_tenants (the
  // known current count), even though monthly_signups only covers the last
  // 6 months — the gap before that window is folded into the baseline so
  // the line's last point always matches the real total.
  const signupsInWindow = stats.monthly_signups.reduce((s, m) => s + m.count, 0);
  const baselineTotal = stats.total_tenants - signupsInWindow;
  const tenantGrowthData = stats.monthly_signups.reduce<{ month: string; count: number; cumulative: number }[]>(
    (acc, m) => {
      const previous = acc.length ? acc[acc.length - 1].cumulative : baselineTotal;
      return [...acc, { month: m.month, count: m.count, cumulative: previous + m.count }];
    },
    [],
  );

  const healthScore = stats.total_tenants > 0
    ? Math.round((stats.active_tenants / stats.total_tenants) * 100)
    : 100;

  const completionRate = stats.total_orders > 0
    ? Math.round((stats.completed_orders / stats.total_orders) * 100)
    : 0;

  const planData = Object.entries(stats.plans)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    .sort((a, b) => b.value - a.value);
  const planColors = planData.map((p) => PLAN_COLORS[p.name.toLowerCase()] ?? "#64748b");
  const totalPlans = planData.reduce((s, p) => s + p.value, 0);

  const STATUS_COLORS: Record<string, string> = { Active: "#059669", Pending: "#d97706", Suspended: "#ef4444" };
  const statusData = [
    { name: "Active", value: stats.active_tenants },
    { name: "Pending", value: pendingSignups.length },
    { name: "Suspended", value: trueSuspended },
  ].filter((s) => s.value > 0);
  const statusColors = statusData.map((s) => STATUS_COLORS[s.name]);

  const cards = [
    { label: "Total Tenants",    value: stats.total_tenants,    sub: `${stats.active_tenants} active`,    icon: Building2,    color: "#0284c7", href: "/admin/tenants" },
    { label: "Total Users",      value: stats.total_users,      sub: "across all tenants",                icon: Users,        color: "#8b5cf6", href: "/admin/users" },
    { label: "Total Orders",     value: stats.total_orders,     sub: `${completionRate}% completed`,      icon: ShoppingCart, color: "#059669", href: null },
    { label: "Platform Revenue", value: fmtMoney(stats.total_revenue), sub: "all time", icon: TrendingUp, color: "#d97706", href: null, isString: true },
    { label: "Products",         value: stats.total_products,   sub: "in catalog",                        icon: Package,      color: "#0e7490", href: null },
    { label: "Pending Signups",  value: pendingSignups.length,  sub: "awaiting approval",                 icon: UserPlus,     color: pendingSignups.length > 0 ? "#d97706" : "#64748b", href: "/admin/tenants" },
    { label: "Suspended",        value: trueSuspended,          sub: "need attention",                    icon: XCircle,      color: trueSuspended > 0 ? "#ef4444" : "#64748b", href: "/admin/tenants" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Platform Overview</h1>
          <p className="text-sm text-muted mt-0.5">Monitor all tenants, users and platform health</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Server size={13} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">System Online</span>
          </div>
        </div>
      </div>

      {/* Pending signups + suspended warnings */}
      {pendingSignups.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm font-medium">
          <UserPlus size={15} />
          {pendingSignups.length} new signup{pendingSignups.length > 1 ? "s are" : " is"} waiting for approval.
          <Link href="/admin/tenants" className="ml-auto flex items-center gap-1 text-[12px] font-semibold hover:underline">
            Review <ArrowRight size={12} />
          </Link>
        </div>
      )}
      {trueSuspended > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-sm font-medium">
          <AlertTriangle size={15} />
          {trueSuspended} tenant{trueSuspended > 1 ? "s are" : " is"} currently suspended.
          <Link href="/admin/tenants" className="ml-auto flex items-center gap-1 text-[12px] font-semibold hover:underline">
            Review <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-5" style={{ backgroundColor: card.color }} />
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${card.color}18` }}>
              <card.icon size={16} style={{ color: card.color }} />
            </div>
            <p className="text-xl font-extrabold text-foreground tracking-tight truncate">
              {card.isString ? card.value : Number(card.value).toLocaleString()}
            </p>
            <p className="text-[11px] font-semibold text-foreground mt-0.5">{card.label}</p>
            <p className="text-[10px] text-muted mt-0.5">{card.sub}</p>
            {card.href && (
              <Link href={card.href} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight size={13} className="text-muted" />
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly signups + cumulative growth */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">New Tenants</h2>
              <p className="text-[11px] text-muted">Last 6 months · monthly signups vs. total tenants</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.primary }} /> New signups
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#d97706" }} /> Total tenants
              </span>
            </div>
          </div>
          <div className="h-56">
            <TenantGrowthChart
              data={tenantGrowthData}
              barColor={c.primary}
              lineColor="#d97706"
              gridColor={c.grid}
              tickColor={c.tick}
              tooltipStyle={c.tooltip}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Platform health */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-foreground mb-4">Platform Health</h2>
            <div className="space-y-3 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-foreground">Tenant Health</span>
                  <span className="text-[12px] font-bold" style={{ color: healthScore >= 80 ? "#059669" : healthScore >= 50 ? "#d97706" : "#ef4444" }}>{healthScore}%</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${healthScore}%`, backgroundColor: healthScore >= 80 ? "#059669" : healthScore >= 50 ? "#d97706" : "#ef4444" }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-foreground">Order Completion</span>
                  <span className="text-[12px] font-bold text-foreground">{completionRate}%</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${completionRate}%` }} />
                </div>
              </div>
            </div>
            {stats.total_tenants > 0 ? (
              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <div className="w-24 h-24 flex-shrink-0">
                  <DonutChart data={statusData} colors={statusColors} innerRadius={30} outerRadius={48} tooltipStyle={c.tooltip} />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {statusData.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s.name] }} />
                      {s.name === "Active" && <CheckCircle size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />}
                      {s.name === "Pending" && <Clock size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />}
                      {s.name === "Suspended" && <XCircle size={13} className="text-red-500 flex-shrink-0" />}
                      {s.value} {s.name}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted text-center py-2 border-t border-border pt-4">No tenants yet</p>
            )}
          </div>

          {/* Plan breakdown */}
          <div className="bg-card border border-border rounded-xl p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-foreground">Plans</h2>
              <Link href="/admin/plans" className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            {totalPlans === 0 ? (
              <p className="text-sm text-muted text-center py-4">No plan data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-28 h-28 flex-shrink-0">
                  <DonutChart data={planData} colors={planColors} innerRadius={34} outerRadius={54} tooltipStyle={c.tooltip} />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {planData.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-1.5">
                      <Crown size={12} style={{ color: planColors[i] }} className="flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-foreground truncate flex-1">{p.name}</span>
                      <span className="text-[12px] text-muted flex-shrink-0">{p.value} · {Math.round((p.value / totalPlans) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent signups awaiting approval */}
      {recentSignups.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Recent Signups</h2>
              <p className="text-[11px] text-muted">Newest businesses awaiting approval</p>
            </div>
            <Link href="/admin/tenants" className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentSignups.map((t) => (
              <Link
                key={t.id}
                href={`/admin/tenants/${t.id}`}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface/60 -mx-2 px-2 rounded-lg transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 border border-violet-500/10">
                  <span className="text-[13px] font-bold text-violet-600 dark:text-violet-400">
                    {t.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                  <p className="text-[11px] text-muted font-mono truncate">{t.slug}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-muted">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Clock size={10} /> Pending
                  </span>
                  <ArrowUpRight size={13} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Signup insights — real data from /admin/tenant-analytics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Signup Insights</h2>
            <p className="text-[11px] text-muted">Based on registration data from all tenants</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Globe2 size={13} className="text-blue-500" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">By Country</h3>
            </div>
            <CategoryDonut data={analytics?.by_country ?? []} colors={COUNTRY_COLORS} tooltipStyle={c.tooltip} empty="No country data yet" kind="country" />
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Factory size={13} className="text-violet-500" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">By Industry</h3>
            </div>
            <CategoryDonut data={analytics?.by_industry ?? []} colors={INDUSTRY_COLORS} tooltipStyle={c.tooltip} empty="No industry data yet" kind="industry" />
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Building2 size={13} className="text-emerald-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">By Business Type</h3>
            </div>
            <CategoryDonut data={normalizeBizType(analytics?.by_business_type ?? [])} colors={BIZ_TYPE_COLORS} tooltipStyle={c.tooltip} empty="No business type data yet" kind="business_type" />
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Megaphone size={13} className="text-amber-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">How They Heard About Us</h3>
            </div>
            <CategoryDonut data={analytics?.by_heard_about ?? []} colors={HEARD_COLORS} tooltipStyle={c.tooltip} empty="No referral data yet" kind="heard_about" />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Manage Tenants", href: "/admin/tenants", icon: Building2, color: "#0284c7" },
          { label: "Manage Users",   href: "/admin/users",   icon: Users,     color: "#8b5cf6" },
          { label: "View Plans",     href: "/admin/plans",   icon: Crown,     color: "#d97706" },
          { label: "Settings",       href: "/admin/settings",icon: Activity,  color: "#64748b" },
        ].map((a) => (
          <Link key={a.label} href={a.href}
            className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl hover:shadow-md hover:border-accent/30 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${a.color}15` }}>
              <a.icon size={15} style={{ color: a.color }} />
            </div>
            <span className="text-[13px] font-semibold text-foreground group-hover:text-accent transition-colors">{a.label}</span>
            <ArrowUpRight size={13} className="text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </div>
    </div>
  );
}
