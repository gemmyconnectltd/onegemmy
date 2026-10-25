"use client";

import { Suspense, useMemo } from "react";
import { Download } from "lucide-react";
import { useTrafficSources } from "@/lib/api/hooks";
import { formatFull, formatPct, formatPeriodLabel } from "@/lib/adminAnalytics";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { StackedAreaChart, type ChartTheme } from "@/components/charts/lazyTraffic";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { BackLink, CHANNEL_COLORS, CHANNEL_LABELS, Section, downloadCsv } from "@/components/traffic/shared";
import { cn } from "@/lib/utils";

const right = "text-right tabular-nums";

function SourcesDetail() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useTrafficSources(period.range, { enabled: period.valid });

  const stack = useMemo(() => data && {
    labels: data.series.map((s) => formatPeriodLabel(s.period, data.groupBy)),
    series: data.channels.filter((ch) => ch.visitors > 0).map((ch) => ({ label: CHANNEL_LABELS[ch.channel], color: CHANNEL_COLORS[ch.channel], data: data.series.map((s) => s[ch.channel]) })),
  }, [data]);

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!data} onClick={() => data && downloadCsv(`traffic-sources-${data.period.from}_${data.period.to}.csv`, [
        ["Channel", "Visitors", "Share (%)", "Page views", "Signups", "Paying customers", "Conversion rate (%)"],
        ...data.channels.map((ch) => [CHANNEL_LABELS[ch.channel], ch.visitors, ch.pct, ch.views, ch.signups, ch.paying, ch.conversionRate]), [],
        ["Referring site", "Channel", "Visitors", "Page views"], ...data.referrers.map((r) => [r.host, CHANNEL_LABELS[r.channel], r.visitors, r.views]),
      ])}><Download size={14} aria-hidden /> Export</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load traffic sources." onRetry={() => void refetch()} />;
  else if (data.totalVisitors === 0) body = <div className="rounded-xl border border-border bg-card"><EmptyState title="No visits in this period" description="Sources appear once the website tracker records visits." /></div>;
  else body = (
    <>
      <Section title="Visitors by channel over time" subtitle={`Unique visitors per ${data.groupBy}, stacked.`}>
        <div className="h-72">{stack && <StackedAreaChart labels={stack.labels} series={stack.series} theme={chartTheme} />}</div>
      </Section>

      <div>
        <h2 className="mb-2 text-sm font-bold text-foreground">Channels</h2>
        <DataCard label="Traffic channels">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr><th className={thClass}>Channel</th>{["Visitors", "Share", "Page views", "Signups", "Paying", "Conversion"].map((h) => <th key={h} className={cn(thClass, "text-right")}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {[...data.channels].sort((a, b) => b.visitors - a.visitors).map((ch) => (
                <tr key={ch.channel}>
                  <td className="px-4 py-3 font-medium"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: CHANNEL_COLORS[ch.channel] }} aria-hidden />{CHANNEL_LABELS[ch.channel]}</td>
                  <td className={cn("px-4 py-3", right)}>{formatFull(ch.visitors)}</td>
                  <td className={cn("px-4 py-3", right)}>{formatPct(ch.pct)}</td>
                  <td className={cn("px-4 py-3", right)}>{formatFull(ch.views)}</td>
                  <td className={cn("px-4 py-3", right)}>{formatFull(ch.signups)}</td>
                  <td className={cn("px-4 py-3", right)}>{formatFull(ch.paying)}</td>
                  <td className={cn("px-4 py-3", right)}>{formatPct(ch.conversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
        <p className="mt-1.5 px-1 text-[11px] text-muted">Signups and paying customers are credited to the channel of a visitor&apos;s first visit; {formatFull(data.signupsTracked)} signups in this period matched a tracked visit.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-foreground">Top referring sites</h2>
        {data.referrers.length === 0 ? <div className="rounded-xl border border-border bg-card"><EmptyState title="No referring sites" description="Visitors in this period arrived directly or from tagged links only." /></div> : (
          <DataCard label="Referring sites">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr><th className={thClass}>Site</th><th className={thClass}>Channel</th><th className={cn(thClass, "text-right")}>Visitors</th><th className={cn(thClass, "text-right")}>Page views</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.referrers.slice(0, 25).map((r) => (
                  <tr key={`${r.channel}-${r.host}`}>
                    <td className="px-4 py-3 font-medium">{r.host}</td>
                    <td className="px-4 py-3 text-muted">{CHANNEL_LABELS[r.channel]}</td>
                    <td className={cn("px-4 py-3", right)}>{formatFull(r.visitors)}</td>
                    <td className={cn("px-4 py-3", right)}>{formatFull(r.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink />} title="Traffic Sources" subtitle="Where visitors come from, and which channels turn into signups." actions={actions} />
      {body}
    </div>
  );
}

export default function TrafficSourcesPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><SourcesDetail /></Suspense>;
}
