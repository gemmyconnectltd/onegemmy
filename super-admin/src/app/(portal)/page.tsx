"use client";
import { useState } from "react";
import {
  Building2, Users, ShoppingCart, TrendingUp, Activity,
  XCircle, Package, ArrowUpRight, ArrowRight, Crown, UserPlus,
  AlertTriangle, Server, Clock, Globe2, Factory, Megaphone,
} from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAdminStats, useTenants, useAdminTenantAnalytics } from "@/lib/api/hooks";
import { tenantStatusLabel } from "@/lib/api/admin";
import { formatMoney } from "@/lib/money";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { TenantGrowthChart, DonutChart } from "@/components/charts/lazy";
import { BrandMark, type BrandKind } from "@/components/charts/BrandMark";
import Link from "next/link";
import { CountriesAnalytics } from "@/components/admin/CountriesAnalytics";
import { GeographicSummary } from "@/components/admin/GeographicSummary";

const PLAN_COLORS: Record<string, string> = {
  free: "#64748b", starter: "#0284c7", professional: "#8b5cf6", enterprise: "#d97706",
};

const INDUSTRY_COLORS  = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#e0e7ff", "#6366f1", "#64748b"];
const BIZ_TYPE_COLORS  = ["#059669", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"];
const HEARD_COLORS     = ["#d97706", "#f59e0b", "#fbbf24", "#fcd34d", "#fde68a"];

const BIZ_TYPE_LABELS: Record<string, string> = {
  sole: "Sole Proprietorship",
  partnership: "Partnership",
  llc: "Limited Liability (LLC)",
  unregistered: "Not Registered",
};

// filterValue carries the raw value the Tenants list actually filters on
// (e.g. "sole"), separate from name (what's shown — e.g. "Sole
// Proprietorship" after normalizeBizType relabels it for display).
function normalizeBizType(data: { name: string; value: number }[]) {
  return data.map((d) => ({ ...d, filterValue: d.name, name: BIZ_TYPE_LABELS[d.name] ?? d.name }));
}

function CategoryDonut({
  data, colors, tooltipStyle, empty, kind, filterParam,
}: {
  data: { name: string; value: number; filterValue?: string }[];
  colors: string[];
  tooltipStyle: React.CSSProperties;
  empty?: string;
  kind: BrandKind;
  /** Query param on /admin/tenants this insight drills into, e.g. "country". */
  filterParam: string;
}) {
  const real = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  // Top 5 are listed; everything after that is rolled into "Other" so nothing silently disappears from the totals.
  const rest = real.slice(5).reduce((s, d) => s + d.value, 0);
  const visible = rest > 0 ? [...real.slice(0, 5), { name: "Other", value: rest, isRest: true }] : real;
  const total = visible.reduce((s, d) => s + d.value, 0) || 1;
  if (visible.length === 0) return (
    <p className="text-[12px] text-muted text-center py-6">{empty ?? "No data yet"}</p>
  );
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28 flex-shrink-0">
        <DonutChart data={visible} colors={colors} innerRadius={36} outerRadius={54} tooltipStyle={tooltipStyle} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-foreground">{total}</span><span className="text-[10px] text-muted">Businesses</span></div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {visible.map((d, i) => "isRest" in d ? (
          <div key="rest" className="flex items-center gap-2 text-[12.5px] -mx-1.5 px-1.5 py-1">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-400" />
            <span className="font-semibold text-foreground truncate flex-1">Other</span>
            <span className="text-muted flex-shrink-0">{d.value} · {Math.round((d.value / total) * 100)}%</span>
          </div>
        ) : (
          <Link
            key={d.name}
            href={`/tenants?${filterParam}=${encodeURIComponent(d.filterValue ?? d.name)}`}
            title={`View tenants where ${filterParam} is "${d.name}"`}
            className="flex items-center gap-2 text-[12.5px] -mx-1.5 px-1.5 py-1 rounded-lg hover:bg-surface transition-colors group"
          >
            <BrandMark kind={kind} name={d.name} color={colors[i % colors.length]} />
            <span className="font-semibold text-foreground truncate flex-1 capitalize group-hover:text-accent transition-colors">{d.name}</span>
            <span className="text-muted flex-shrink-0">{d.value} · {Math.round((d.value / total) * 100)}%</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { theme } = useAppConfig();
  const [growthMonths, setGrowthMonths] = useState(3);
  const c = chartPalette(theme === "dark");
  const { data: stats, isLoading, isError } = useAdminStats();
  const { data: analytics } = useAdminTenantAnalytics();
  const { data: tenantsData } = useTenants(1, 20);
  const allTenants = tenantsData?.items ?? [];

  if (isLoading) return <PageLoader />;

  if (isError || !stats) return (
    <div className="flex items-center gap-3 text-red-600 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertTriangle size={16} /> Failed to load platform stats. Check your connection.
    </div>
  );

  const pendingSignups = allTenants.filter((t) => tenantStatusLabel(t) === "Pending Approval");
  const pendingCount = analytics?.by_status.find((row) => row.name === "Pending")?.value;
  const trueSuspended = analytics?.by_status.find((row) => row.name === "Suspended")?.value;
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

  const completionRate = stats.total_orders > 0
    ? Math.round((stats.completed_orders / stats.total_orders) * 100)
    : 0;

  const planData = Object.entries(stats.plans)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    .sort((a, b) => b.value - a.value);
  const planColors = planData.map((p) => PLAN_COLORS[p.name.toLowerCase()] ?? "#64748b");
  const totalPlans = planData.reduce((s, p) => s + p.value, 0);

  const cards = [
    { label: "Total Tenants",    value: stats.total_tenants,    sub: `${stats.active_tenants} active`,    icon: Building2,    color: "#0284c7", href: "/tenants" },
    { label: "Total Users",      value: stats.total_users,      sub: "across all tenants",                icon: Users,        color: "#8b5cf6", href: "/users" },
    { label: "Total Orders",     value: stats.total_orders,     sub: `${completionRate}% completed`,      icon: ShoppingCart, color: "#059669", href: null },
    { label: "Tenant Sales", value: formatMoney(stats.total_revenue, stats.reporting_currency ?? "GHS"), sub: "all time", icon: TrendingUp, color: "#d97706", href: null, isString: true },
    { label: "Products",         value: stats.total_products,   sub: "in catalog",                        icon: Package,      color: "#0e7490", href: null },
    { label: "Pending Signups",  value: pendingCount ?? "—",  sub: (pendingCount ?? 0) > 0 ? "awaiting approval" : "no pending",                 icon: UserPlus,     alert: (pendingCount ?? 0) > 0, color: (pendingCount ?? 0) > 0 ? "#d97706" : "#64748b", href: "/tenants?status=pending" },
    { label: "Suspended Accounts",        value: trueSuspended ?? "—",          sub: (trueSuspended ?? 0) > 0 ? "need attention" : "all active",                    icon: XCircle,      alert: (trueSuspended ?? 0) > 0, color: (trueSuspended ?? 0) > 0 ? "#ef4444" : "#64748b", href: "/tenants?status=suspended" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Platform Overview</h1>
          <p className="text-sm text-muted mt-0.5">A quick summary of your platform, users, businesses and overall growth.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Server size={13} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">System Online</span>
          </div>
        </div>
      </div>

      {/* Pending signups + suspended warnings */}
      {(pendingCount ?? 0) > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm font-medium">
          <UserPlus size={15} />
          {pendingCount} new signup{(pendingCount ?? 0) > 1 ? "s are" : " is"} waiting for approval.
          <Link href="/tenants" className="ml-auto flex items-center gap-1 text-[12px] font-semibold hover:underline">
            Review <ArrowRight size={12} />
          </Link>
        </div>
      )}
      {(trueSuspended ?? 0) > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-sm font-medium">
          <AlertTriangle size={15} />
          {trueSuspended} tenant{(trueSuspended ?? 0) > 1 ? "s are" : " is"} currently suspended.
          <Link href="/tenants" className="ml-auto flex items-center gap-1 text-[12px] font-semibold hover:underline">
            Review <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Stats grid — the whole card is clickable (not just the corner
          arrow) whenever it has somewhere sensible to drill into. */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[1fr_1fr_1fr_1.35fr_1fr_1fr_1fr] gap-3">
        {cards.map((card) => {
          const needsAttention = card.alert === true;
          const cardClass = `bg-card border rounded-xl p-3.5 transition-colors group relative block ${needsAttention ? "border-amber-500/40 bg-amber-500/5" : "border-border"} ${card.href ? "hover:border-accent/40" : ""}`;
          const content = (
            <>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5" style={{ backgroundColor: `${card.color}18` }}>
                <card.icon size={16} style={{ color: card.color }} />
              </div>
              <p
                className="text-[18px] leading-tight font-bold text-foreground tracking-tight truncate tabular-nums"
                title={String(card.isString ? card.value : typeof card.value === "number" ? card.value.toLocaleString() : card.value)}
              >
                {card.isString ? card.value : typeof card.value === "number" ? card.value.toLocaleString() : card.value}
              </p>
              <p className="text-[12px] font-medium text-foreground mt-0.5">{card.label}</p>
              <p className="text-[11px] text-muted mt-0.5 truncate">{card.sub}</p>
              {card.href && (
                <ArrowUpRight size={13} className="absolute top-3 right-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </>
          );
          return card.href ? (
            <Link key={card.label} href={card.href} className={cardClass}>{content}</Link>
          ) : (
            <div key={card.label} className={cardClass}>{content}</div>
          );
        })}
      </div>

      {/* Recent signups awaiting approval */}
      {recentSignups.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Recent Signups</h2>
              <p className="text-[11px] text-muted">Newest businesses awaiting approval</p>
            </div>
            <Link href="/tenants" className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentSignups.map((t) => (
              <Link
                key={t.id}
                href={`/tenants/${t.id}`}
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
                  <span className="flex items-center gap-1 text-[11px] font-medium text-foreground/80" title="Country">
                    <Globe2 size={11} className="text-blue-500" /> {[t.city, t.country].filter(Boolean).join(", ") || "No country"}
                  </span>
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3">
        {/* Monthly signups + cumulative growth */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Platform Growth</h2>
              <p className="text-[11px] text-muted">New tenant registrations and cumulative growth.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <select aria-label="Growth period" value={growthMonths} onChange={(event) => setGrowthMonths(Number(event.target.value))} className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option></select>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.primary }} /> New signups
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#d97706" }} /> Total tenants
              </span>
            </div>
          </div>
          <div className="h-44">
            <TenantGrowthChart
              data={tenantGrowthData.slice(-growthMonths)}
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
          {/* Plan breakdown */}
          <div className="bg-card border border-border rounded-xl p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-foreground">Subscription Plans</h2>
              <Link href="/plans" className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1">
                View all plans <ArrowRight size={11} />
              </Link>
            </div>
            {totalPlans === 0 ? (
              <p className="text-sm text-muted text-center py-4">No plan data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative w-40 h-40 flex-shrink-0">
                  <DonutChart data={planData} colors={planColors} innerRadius={50} outerRadius={76} tooltipStyle={c.tooltip} />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold text-foreground">{totalPlans}</span><span className="text-[11px] text-muted">Total tenants</span></div>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {planData.map((p, i) => (
                    <Link
                      key={p.name}
                      href={`/tenants?plan=${encodeURIComponent(p.name.toLowerCase())}`}
                      title={`View tenants on the ${p.name} plan`}
                      className="flex items-center gap-1.5 -mx-1.5 px-1.5 py-0.5 rounded-lg hover:bg-surface transition-colors group"
                    >
                      <Crown size={12} style={{ color: planColors[i] }} className="flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-foreground truncate flex-1 group-hover:text-accent transition-colors">{p.name}</span>
                      <span className="text-[12px] text-muted flex-shrink-0">{p.value} · {Math.round((p.value / totalPlans) * 100)}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <GeographicSummary rows={analytics?.users_by_country ?? []} tooltipStyle={c.tooltip} />
      <details open id="countries" className="scroll-mt-20 rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Explore all countries</summary>
        <CountriesAnalytics rows={analytics?.users_by_country ?? []} />
      </details>

      {/* Signup insights — real data from /admin/tenant-analytics */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-bold tracking-tight text-foreground">User &amp; Business Insights</h2>
            <p className="text-[12px] text-muted">Understand who is joining your platform.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Factory size={13} className="text-violet-500" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Businesses by Industry</h3>
            </div>
            <CategoryDonut data={analytics?.by_industry ?? []} colors={INDUSTRY_COLORS} tooltipStyle={c.tooltip} empty="No industry data yet" kind="industry" filterParam="industry" />
          </div>

          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Building2 size={13} className="text-emerald-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Businesses by Type</h3>
            </div>
            <CategoryDonut data={normalizeBizType(analytics?.by_business_type ?? [])} colors={BIZ_TYPE_COLORS} tooltipStyle={c.tooltip} empty="No business type data yet" kind="business_type" filterParam="businessType" />
          </div>

          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Megaphone size={13} className="text-amber-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">How They Heard About Us</h3>
            </div>
            <CategoryDonut data={analytics?.by_heard_about ?? []} colors={HEARD_COLORS} tooltipStyle={c.tooltip} empty="No referral data yet" kind="heard_about" filterParam="heardAbout" />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Manage Tenants", href: "/tenants", icon: Building2, color: "#0284c7" },
          { label: "Manage Users",   href: "/users",   icon: Users,     color: "#8b5cf6" },
          { label: "View Plans",     href: "/plans",   icon: Crown,     color: "#d97706" },
          { label: "Settings",       href: "/settings",icon: Activity,  color: "#64748b" },
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
