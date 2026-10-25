"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Building2, Download, Layers, Laptop, MousePointerClick, Repeat, Smartphone, Tablet, Users } from "lucide-react";
import { useErpRealtime, useErpTraffic } from "@/lib/api/hooks";
import type { ErpReport } from "@/lib/api/admin";
import { formatFull, formatPct, formatPeriodLabel } from "@/lib/adminAnalytics";
import { fmtRelative } from "@/lib/date";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { DonutChart } from "@/components/charts/lazy";
import { HourlyBars, TrendChart, type ChartTheme } from "@/components/charts/lazyTraffic";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { Change, Section, StatCard, deviceColor, deviceLabel, downloadCsv, moduleColor, moduleLabel } from "@/components/traffic/shared";
import { cn } from "@/lib/utils";

type Metric = "users" | "businesses" | "sessions" | "views";
const ORDER: Metric[] = ["users", "businesses", "sessions", "views"];
const NAME: Record<Metric, string> = { users: "Active users", businesses: "Active businesses", sessions: "Sessions", views: "Page views" };
const NOTE: Record<Metric, string> = { users: "Unique users", businesses: "Businesses with activity", sessions: "Sessions (a tab, new after 30 min idle)", views: "Pages opened" };
const COLOR: Record<Metric, string> = { users: "#0284c7", businesses: "#16a34a", sessions: "#8b5cf6", views: "#d97706" };

function RealtimeCard({ theme }: { theme: ChartTheme }) {
  const { data, isError } = useErpRealtime();
  const hourly = useMemo(() => (data?.hourly ?? []).map((h) => ({ label: new Date(h.hour).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }), visitors: h.users })), [data]);
  return (
    <Section title="Realtime" subtitle="Live · updates every 30 seconds">
      {isError ? <p className="py-6 text-center text-[12px] text-muted">Realtime is unavailable right now.</p> : !data ? <p className="py-6 text-center text-[12px] text-muted">Loading…</p> : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Online now
            </p>
            <p className="mt-1.5 text-[26px] font-bold leading-none tabular-nums text-foreground">{formatFull(data.onlineUsers)}</p>
            <p className="mt-1 text-[11px] text-muted">users from {formatFull(data.onlineBusinesses)} {data.onlineBusinesses === 1 ? "business" : "businesses"} in the last 5 minutes</p>
            <div className="mt-3 border-t border-border pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Busy modules (15 min)</p>
              {data.activeModules.length === 0 ? <p className="mt-1 text-[12px] text-muted">No one is in the app right now.</p> : (
                <ul className="mt-1 space-y-1">{data.activeModules.map((m) => <li key={m.module} className="flex justify-between gap-2 text-[12.5px]"><span className="truncate">{moduleLabel(m.module)}</span><span className="tabular-nums text-muted">{m.users}</span></li>)}</ul>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-muted">Active users per hour, last 48 hours</p>
            <div className="mt-2 h-32"><HourlyBars data={hourly} color="#0284c7" theme={theme} /></div>
          </div>
        </div>
      )}
    </Section>
  );
}

function exportReport(r: ErpReport) {
  downloadCsv(`erp-traffic-${r.period.from}_${r.period.to}.csv`, [
    ["ERP Traffic", `${r.period.from} to ${r.period.to}`], [],
    ["Metric", "Value", "Previous period"],
    ["Active users", r.kpis.activeUsers.value, r.kpis.activeUsers.previous], ["Active businesses", r.kpis.activeBusinesses.value, r.kpis.activeBusinesses.previous],
    ["Sessions", r.kpis.sessions.value, r.kpis.sessions.previous], ["Page views", r.kpis.pageViews.value, r.kpis.pageViews.previous],
    ["Pages per session", r.kpis.pagesPerSession.value, r.kpis.pagesPerSession.previous], ["Stickiness (%)", r.kpis.stickiness.value, null],
    ["Business adoption (%)", r.kpis.adoption.value, null], [],
    ["Period", "Active users", "Active businesses", "Sessions", "Page views", "Previous period", "Previous users", "Previous businesses", "Previous sessions", "Previous views"],
    ...r.series.map((s) => [s.period, s.users, s.businesses, s.sessions, s.views, s.previousPeriod, s.previous?.users ?? null, s.previous?.businesses ?? null, s.previous?.sessions ?? null, s.previous?.views ?? null]), [],
    ["Module", "Page views", "Share (%)", "Users", "Businesses", "Sessions"], ...r.modules.map((m) => [moduleLabel(m.module), m.views, m.pctOfViews, m.users, m.businesses, m.sessions]), [],
    ["Device", "Users", "Sessions", "Share of sessions (%)"], ...r.devices.types.map((d) => [deviceLabel(d.name), d.users, d.sessions, d.pct]), [],
    ["Business", "Active users", "Sessions", "Page views", "Last active"], ...r.topBusinesses.map((b) => [b.name, b.users, b.sessions, b.views, b.lastActive]),
  ]);
}

function ErpDashboard() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const period = usePeriod();
  const [metric, setMetric] = useState<Metric>("users");
  const { data, isLoading, isError, refetch } = useErpTraffic(period.range, { enabled: period.valid });

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!data} onClick={() => data && exportReport(data)}><Download size={14} aria-hidden /> Export report</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load ERP traffic." onRetry={() => void refetch()} />;
  else {
    const k = data.kpis;
    const none = !data.trackingActive;
    const q = period.query;
    const color = COLOR[metric];
    const points = data.series.map((s) => ({
      label: formatPeriodLabel(s.period, data.groupBy), value: s[metric],
      previousLabel: s.previousPeriod ? formatPeriodLabel(s.previousPeriod, data.groupBy) : null, previous: s.previous ? s.previous[metric] : null,
    }));
    const maxViews = Math.max(1, ...data.modules.map((m) => m.views));
    const val = (n: number | null) => (none ? "—" : formatFull(n));

    body = (
      <>
        <div role="tablist" aria-label="Chart metric" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {([["users", "Active Users", Users, k.activeUsers], ["businesses", "Active Businesses", Building2, k.activeBusinesses], ["sessions", "Sessions", Layers, k.sessions], ["views", "Page Views", MousePointerClick, k.pageViews]] as const).map(([id, label, icon, stat]) => (
            <StatCard key={id} id={id} order={ORDER} controls="erp-chart" label={label} icon={icon} color={COLOR[id]} selected={metric === id} onSelect={(m) => setMetric(m as Metric)}
              value={val(stat.value)} sub={none ? "No activity tracked yet" : <Change stat={stat} />} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Stickiness" icon={Repeat} color="#0e7490" href={`/erp-traffic/engagement?${q}`}
            value={k.stickiness.value === null ? "—" : formatPct(k.stickiness.value)} sub="Average daily users ÷ active users" />
          <StatCard label="Pages per Session" icon={Activity} color="#64748b" value={k.pagesPerSession.value === null ? "—" : k.pagesPerSession.value}
            sub={k.pagesPerSession.changePct === null ? "How deep a visit goes" : <Change stat={k.pagesPerSession} />} />
          <StatCard label="Business Adoption" icon={Building2} color="#16a34a" href={`/erp-traffic/businesses?${q}`}
            value={k.adoption.value === null ? "—" : formatPct(k.adoption.value)} sub={`of ${formatFull(k.adoption.activeTenants)} active businesses used the app`} />
        </div>

        <Section title="Usage Trends" subtitle={`${NOTE[metric]} per ${data.groupBy}. Pick a card above to change the metric.`}>
          <div id="erp-chart" role="tabpanel" aria-labelledby={`tab-${metric}`}>
            <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-[11px] font-semibold text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />{NAME[metric]}</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-muted" aria-hidden />Previous period</span>
            </div>
            {none ? <EmptyState title="No ERP activity in this period" description="Usage is recorded as signed-in users open pages in the ERP and POS." />
              : <div className="h-64"><TrendChart points={points} color={color} name={NAME[metric]} theme={chartTheme} /></div>}
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RealtimeCard theme={chartTheme} />
          <Section title="Module Usage" subtitle="Share of page views by area of the app." href={`/erp-traffic/modules?${q}`} linkLabel="View details">
            {data.modules.length === 0 ? <EmptyState title="No module data yet" description="Modules appear once users open pages in the app." /> : (
              <ul className="space-y-3">
                {data.modules.map((m, i) => (
                  <li key={m.module}>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold text-foreground">{moduleLabel(m.module)}</span>
                      <span className="tabular-nums text-muted">{formatFull(m.views)} views · {formatPct(m.pctOfViews)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface" role="presentation"><div className="h-full rounded-full" style={{ width: `${(m.views / maxViews) * 100}%`, backgroundColor: moduleColor(i) }} /></div>
                    <p className="mt-0.5 text-[11px] text-muted">{formatFull(m.users)} users · {formatFull(m.businesses)} businesses</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Section title="Most Active Businesses" subtitle="By page views in this period." href={`/erp-traffic/businesses?${q}`} linkLabel="View all businesses" className="min-w-0">
            {data.topBusinesses.length === 0 ? <EmptyState title="No business activity yet" description="Businesses appear once their users open pages." /> : (
              <DataCard label="Most active businesses" className="border-0">
                <table className="w-full min-w-[460px] text-left text-sm">
                  <thead><tr><th className={thClass}>Business</th><th className={cn(thClass, "text-right")}>Users</th><th className={cn(thClass, "text-right")}>Sessions</th><th className={cn(thClass, "text-right")}>Page views</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {data.topBusinesses.map((b) => (
                      <tr key={b.id}>
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-medium"><Link href={`/tenants/${b.id}`} className="hover:text-accent hover:underline">{b.name}</Link></td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(b.users)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(b.sessions)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(b.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            )}
          </Section>

          <Section title="Gone Quiet" subtitle="Active last period, nothing this period." href={data.quiet.count > 0 ? `/erp-traffic/businesses?${q}&status=quiet` : undefined} linkLabel={`View all ${data.quiet.count}`}>
            {data.quiet.items.length === 0 ? <p className="py-6 text-center text-[12px] text-muted">{none ? "Nothing to compare yet." : "No businesses have gone quiet. 🎉"}</p> : (
              <ul className="divide-y divide-border">
                {data.quiet.items.map((b) => (
                  <li key={b.id}>
                    <Link href={`/tenants/${b.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 first:pt-0 last:pb-0 hover:bg-surface/60">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{b.name}</span><span className="block text-[11px] text-muted">Last active {fmtRelative(b.lastActive)}</span></span>
                      <span className="flex-shrink-0 text-[11px] tabular-nums text-muted">{formatFull(b.previousViews)} views before</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Devices" subtitle="What people use to open PESAA, by session." href={`/erp-traffic/devices?${q}`} linkLabel="View details">
          {data.devices.types.length === 0 ? <EmptyState title="No device data yet" description="Devices appear once users open pages in the app." /> : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex items-center gap-4">
                <div className="relative h-36 w-36 flex-shrink-0">
                  <DonutChart data={data.devices.types.map((d) => ({ name: deviceLabel(d.name), value: d.sessions }))} colors={data.devices.types.map((d) => deviceColor(d.name))} innerRadius={44} outerRadius={68} tooltipStyle={c.tooltip} />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[20px] font-bold text-foreground">{formatFull(k.sessions.value)}</span><span className="text-[11px] text-muted">Sessions</span></div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2">
                  {data.devices.types.map((d) => {
                    const Icon = d.name === "mobile" ? Smartphone : d.name === "tablet" ? Tablet : Laptop;
                    return (
                      <li key={d.name} className="flex items-center gap-1.5">
                        <Icon size={13} style={{ color: deviceColor(d.name) }} className="flex-shrink-0" aria-hidden />
                        <span className="flex-1 truncate text-[13px] font-semibold text-foreground">{deviceLabel(d.name)}</span>
                        <span className="flex-shrink-0 text-[12px] text-muted">{formatFull(d.users)} users · {Math.round(d.pct)}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {([["Operating systems", data.devices.os], ["Browsers", data.devices.browsers]] as const).map(([title, rows]) => (
                <div key={title}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li key={r.name}>
                        <div className="flex justify-between gap-2 text-[12.5px]"><span className="truncate font-medium text-foreground">{r.name === "unknown" ? "Unknown" : r.name}</span><span className="tabular-nums text-muted">{Math.round(r.pct)}%</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" role="presentation"><div className="h-full rounded-full bg-accent" style={{ width: `${r.pct}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="ERP Traffic" subtitle="See how businesses and their teams use PESAA every day." actions={actions} />
      {body}
    </div>
  );
}

export default function ErpTrafficPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><ErpDashboard /></Suspense>;
}
