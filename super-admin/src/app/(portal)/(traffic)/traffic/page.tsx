"use client";

import { Suspense, useMemo, useState } from "react";
import { Download, MousePointerClick, UserPlus, Users, Wallet } from "lucide-react";
import { useWebsiteTraffic, useWebsiteTrafficRealtime } from "@/lib/api/hooks";
import type { TrafficReport } from "@/lib/api/admin";
import { formatFull, formatPct, formatPeriodLabel, humanizeKey } from "@/lib/adminAnalytics";
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
import { CHANNEL_COLORS, CHANNEL_LABELS, Change, Section, StatCard, downloadCsv } from "@/components/traffic/shared";
import { cn } from "@/lib/utils";

type SeriesMetric = "visitors" | "signups" | "paying";
const ORDER: SeriesMetric[] = ["visitors", "signups", "paying"];
const METRIC_NAME: Record<SeriesMetric, string> = { visitors: "Visitors", signups: "Signups", paying: "New paying customers" };
const METRIC_NOTE: Record<SeriesMetric, string> = { visitors: "Unique visitors", signups: "New business registrations", paying: "Businesses making their first payment" };
const METRIC_COLOR: Record<SeriesMetric, string> = { visitors: "#0284c7", signups: "#d97706", paying: "#16a34a" };

function RealtimeCard({ theme }: { theme: ChartTheme }) {
  const { data, isError } = useWebsiteTrafficRealtime();
  const hourly = useMemo(() => (data?.hourly ?? []).map((h) => ({ label: new Date(h.hour).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }), visitors: h.visitors })), [data]);
  return (
    <Section title="Realtime" subtitle="Live · updates every 30 seconds">
      {isError ? <p className="py-6 text-center text-[12px] text-muted">Realtime is unavailable right now.</p> : !data ? <p className="py-6 text-center text-[12px] text-muted">Loading…</p> : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Right now
            </p>
            <p className="mt-1.5 text-[26px] font-bold leading-none tabular-nums text-foreground">{formatFull(data.activeNow)}</p>
            <p className="mt-1 text-[11px] text-muted">visitors in the last 30 minutes</p>
            <div className="mt-3 border-t border-border pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Active pages</p>
              {data.activePages.length === 0 ? <p className="mt-1 text-[12px] text-muted">No one is browsing right now.</p> : (
                <ul className="mt-1 space-y-1">{data.activePages.map((p) => <li key={p.path} className="flex justify-between gap-2 text-[12.5px]"><span className="truncate" title={p.path}>{p.path}</span><span className="tabular-nums text-muted">{p.visitors}</span></li>)}</ul>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-muted"><span className="font-semibold text-foreground">{formatFull(data.last48Hours)}</span> visitors in the last 48 hours</p>
            <div className="mt-2 h-32"><HourlyBars data={hourly} color="#0284c7" theme={theme} /></div>
          </div>
        </div>
      )}
    </Section>
  );
}

function exportReport(r: TrafficReport) {
  downloadCsv(`website-traffic-${r.period.from}_${r.period.to}.csv`, [
    ["Website Traffic", `${r.period.from} to ${r.period.to}`], [],
    ["Metric", "Value", "Previous period"],
    ["Website visitors", r.kpis.visitors.value, r.kpis.visitors.previous],
    ["Business signups", r.kpis.signups.value, r.kpis.signups.previous],
    ["New paying customers", r.kpis.paying.value, r.kpis.paying.previous],
    ["Conversion rate (%)", r.kpis.conversionRate.value, r.kpis.conversionRate.previous], [],
    ["Period", "Visitors", "Signups", "New paying customers", "Previous period", "Previous visitors", "Previous signups", "Previous paying"],
    ...r.series.map((s) => [s.period, s.visitors, s.signups, s.paying, s.previousPeriod, s.previous?.visitors ?? null, s.previous?.signups ?? null, s.previous?.paying ?? null]), [],
    ["Funnel stage", "Count", "% of previous stage", "Drop-off"], ...r.funnel.map((f) => [f.label, f.count, f.pctOfPrevious, f.dropOff]), [],
    ["Source", "Visitors", "Share (%)"], ...r.sources.map((s) => [CHANNEL_LABELS[s.channel], s.visitors, s.pct]), [],
    ["Page", "Visitors", "Signups", "Conversion rate (%)"], ...r.pages.map((p) => [p.path, p.visitors, p.signups, p.conversionRate]), [],
    ["Campaign", "Visitors", "Signups", "Paying customers", "Conversion rate (%)"], ...r.campaigns.map((c) => [c.campaign, c.visitors, c.signups, c.paying, c.conversionRate]),
  ]);
}

function TrafficDashboard() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const period = usePeriod();
  const [metric, setMetric] = useState<SeriesMetric>("visitors");
  const { data, isLoading, isError, refetch } = useWebsiteTraffic(period.range, { enabled: period.valid });

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!data} onClick={() => data && exportReport(data)}><Download size={14} aria-hidden /> Export report</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load website traffic." onRetry={() => void refetch()} />;
  else {
    const k = data.kpis;
    const noVisits = !data.trackingActive;
    const color = METRIC_COLOR[metric];
    const points = data.series.map((s) => ({
      label: formatPeriodLabel(s.period, data.groupBy), value: s[metric],
      previousLabel: s.previousPeriod ? formatPeriodLabel(s.previousPeriod, data.groupBy) : null, previous: s.previous ? s.previous[metric] : null,
    }));
    const sources = [...data.sources].sort((a, b) => b.visitors - a.visitors);
    const donut = sources.filter((s) => s.visitors > 0).map((s) => ({ name: CHANNEL_LABELS[s.channel], value: s.visitors }));
    const donutColors = sources.filter((s) => s.visitors > 0).map((s) => CHANNEL_COLORS[s.channel]);
    const q = period.query;

    body = (
      <>
        <div role="tablist" aria-label="Chart metric" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard id="visitors" order={ORDER} controls="traffic-chart" label="Website Visitors" icon={Users} color={METRIC_COLOR.visitors} selected={metric === "visitors"} onSelect={(m) => setMetric(m as SeriesMetric)}
            value={noVisits ? "—" : formatFull(k.visitors.value)} sub={noVisits ? "No visits tracked yet" : <Change stat={k.visitors} />} />
          <StatCard id="signups" order={ORDER} controls="traffic-chart" label="Business Signups" icon={UserPlus} color={METRIC_COLOR.signups} selected={metric === "signups"} onSelect={(m) => setMetric(m as SeriesMetric)}
            value={formatFull(k.signups.value)} sub={<Change stat={k.signups} />} />
          <StatCard id="paying" order={ORDER} controls="traffic-chart" label="Paying Customers" icon={Wallet} color={METRIC_COLOR.paying} selected={metric === "paying"} onSelect={(m) => setMetric(m as SeriesMetric)}
            value={formatFull(k.paying.value)} sub={<Change stat={k.paying} />} />
          <StatCard label="Conversion Rate" icon={MousePointerClick} color="#64748b"
            value={k.conversionRate.value === null ? "—" : formatPct(k.conversionRate.value, 2)}
            sub={k.conversionRate.value === null ? "Needs tracked visitors" : `${formatFull(k.paying.tracked ?? 0)} of ${formatFull(k.paying.value)} paying matched to a visit`} />
        </div>

        <Section title="Traffic & Conversion Trends" subtitle={`${METRIC_NOTE[metric]} per ${data.groupBy}. Pick a card above to change the metric.`}>
          <div id="traffic-chart" role="tabpanel" aria-labelledby={`tab-${metric}`}>
            <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-[11px] font-semibold text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />{METRIC_NAME[metric]}</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-muted" aria-hidden />Previous period</span>
            </div>
            {noVisits && data.series.every((s) => s.signups === 0 && s.paying === 0)
              ? <EmptyState title="No activity in this period" description="Visits are recorded once the website tracker is live. Signups and payments appear as they happen." />
              : <div className="h-64"><TrendChart points={points} color={color} name={METRIC_NAME[metric]} theme={chartTheme} /></div>}
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RealtimeCard theme={chartTheme} />
          <Section title="Conversion Funnel" subtitle="Businesses that signed up in this period, followed to today.">
            <ol className="space-y-3">
              {data.funnel.map((f, i) => (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="font-semibold text-foreground">{f.label}</span>
                    <span className="tabular-nums text-foreground">{i === 0 && noVisits ? "—" : formatFull(f.count)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface" role="presentation"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (f.count / Math.max(1, data.funnel[0].count)) * 100)}%` }} /></div>
                  {i > 0 && <p className="mt-1 text-[11px] text-muted">{f.pctOfPrevious === null ? "No prior stage to compare" : <>{formatPct(f.pctOfPrevious)} of previous stage{f.dropOff ? <> · {formatFull(f.dropOff)} dropped</> : null}</>}</p>}
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted">Activated = at least one completed sale. {formatFull(data.funnelNote.signupsTracked)} of {formatFull(data.funnelNote.signupsTotal)} signups matched a tracked website visit.</p>
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Section title="Traffic Sources" subtitle="Unique visitors by how they arrived." href={`/traffic/sources?${q}`} linkLabel="View details">
            {donut.length === 0 ? <EmptyState title="No source data yet" description="Sources appear once the website tracker records visits." /> : (
              <div className="flex items-center gap-4">
                <div className="relative h-40 w-40 flex-shrink-0">
                  <DonutChart data={donut} colors={donutColors} innerRadius={50} outerRadius={76} tooltipStyle={c.tooltip} />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold text-foreground">{formatFull(k.visitors.value)}</span><span className="text-[11px] text-muted">Visitors</span></div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2">
                  {sources.map((s) => (
                    <li key={s.channel} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[s.channel] }} aria-hidden />
                      <span className="flex-1 truncate text-[13px] font-semibold text-foreground">{CHANNEL_LABELS[s.channel]}</span>
                      <span className="flex-shrink-0 text-[12px] text-muted">{formatFull(s.visitors)} · {Math.round(s.pct)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Top Performing Pages" subtitle="Signups are credited to the first page a visitor landed on." href={`/traffic/pages?${q}`} linkLabel="View all pages" className="min-w-0">
            {data.pages.length === 0 ? <EmptyState title="No page data yet" description="Pages appear once visitors are tracked." /> : (
              <DataCard label="Top performing pages" className="border-0">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead><tr><th className={thClass}>Page</th><th className={cn(thClass, "text-right")}>Visitors</th><th className={cn(thClass, "text-right")}>Signups</th><th className={cn(thClass, "text-right")}>Conversion</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {data.pages.slice(0, 6).map((p) => (
                      <tr key={p.path}>
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-medium" title={p.path}>{p.path}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(p.visitors)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(p.signups)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(p.conversionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            )}
          </Section>
        </div>

        <Section title="Campaign Performance" subtitle="From UTM tags on links. Ad spend is not tracked." href={`/traffic/campaigns?${q}`} linkLabel="View details">
          {data.campaigns.length === 0 ? (
            <EmptyState title="No campaign traffic tracked" description="Add utm_campaign (and utm_source / utm_medium) to links in ads, emails and posts, for example pesaa.io/?utm_source=facebook&utm_medium=cpc&utm_campaign=launch. Campaigns appear here once those links get visits." />
          ) : (
            <DataCard label="Campaign performance" className="border-0">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead><tr><th className={thClass}>Campaign</th><th className={cn(thClass, "text-right")}>Visitors</th><th className={cn(thClass, "text-right")}>Signups</th><th className={cn(thClass, "text-right")}>Paying customers</th><th className={cn(thClass, "text-right")}>Conversion</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.campaigns.slice(0, 5).map((cm) => (
                    <tr key={cm.campaign}>
                      <td className="px-4 py-2.5 font-medium">{humanizeKey(cm.campaign)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(cm.visitors)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(cm.signups)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatFull(cm.paying)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(cm.conversionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
          )}
        </Section>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Website Traffic" subtitle="Understand how visitors discover PESAA and become customers." actions={actions} />
      {body}
    </div>
  );
}

export default function WebsiteTrafficPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><TrafficDashboard /></Suspense>;
}
