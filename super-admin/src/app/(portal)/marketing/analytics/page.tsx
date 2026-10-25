"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { Download, Eye, MailCheck, MailX, MousePointerClick, Send, ShieldAlert, UserMinus, Percent } from "lucide-react";
import { useMarketingAnalytics } from "@/lib/marketing/hooks";
import { formatPeriodLabel } from "@/lib/adminAnalytics";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { LineSeriesChart, TrendChart, type ChartTheme } from "@/components/charts/lazyTraffic";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { Section, StatCard, downloadCsv } from "@/components/traffic/shared";
import { day, num, pct } from "@/components/marketing/shared";
import { cn } from "@/lib/utils";

const DOT = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", unknown: "bg-slate-300" } as const;
const WORD = { good: "Healthy", warn: "Watch", bad: "Action needed", unknown: "No data yet" } as const;

function AnalyticsPage() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useMarketingAnalytics(period.range, period.valid);
  const trend = useMemo(() => data && {
    labels: data.series.map((s) => formatPeriodLabel(s.period, data.groupBy as "day")),
    series: [{ label: "Sent", color: "#16a34a", data: data.series.map((s) => s.sent) }, { label: "Opens (approx.)", color: "#8b5cf6", data: data.series.map((s) => s.opens) },
      { label: "Clicks", color: "#0284c7", data: data.series.map((s) => s.clicks) }, { label: "Unsubscribes", color: "#d97706", data: data.series.map((s) => s.unsubscribes) }],
  }, [data]);

  const actions = (
    <><PeriodSelect period={period} />
      <Button variant="secondary" disabled={!data} onClick={() => data && downloadCsv(`marketing-analytics-${data.period.from}_${data.period.to}.csv`, [
        ["Period", "Sent", "Opens", "Clicks", "Unsubscribes"], ...data.series.map((s) => [s.period, s.sent, s.opens, s.clicks, s.unsubscribes]), [],
        ["Campaign", "Started", "Recipients", "Sent", "Failed", "Bounced", "Opened %", "Clicked %", "Unsubscribed", "Signups", "Paying customers"],
        ...data.campaigns.map((x) => [x.name, x.startedAt, x.recipients, x.sent ?? 0, x.failed ?? 0, x.bounced ?? 0, x.openRate ?? "", x.clickRate ?? "", x.unsubscribed ?? 0, x.signups, x.paying]),
      ])}><Download size={14} aria-hidden /> Export</Button></>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load analytics." onRetry={() => void refetch()} />;
  else {
    const t = data.totals;
    const empty = t.sent + t.failed + t.bounced === 0;
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Sent" icon={Send} color="#16a34a" value={num(t.sent)} sub="Accepted by the mail server" />
          <StatCard label="Delivered" icon={MailCheck} color="#64748b" value="—" sub="Not available with SMTP" />
          <StatCard label="Acceptance rate" icon={Percent} color="#0e7490" value={pct(t.acceptanceRate)} sub={`${num(t.failed)} failed`} />
          <StatCard label="Bounced" icon={MailX} color="#ef4444" value={num(t.bounced)} sub="Addresses the server rejected" />
          <StatCard label="Complaints" icon={ShieldAlert} color="#d97706" value={num(t.complaints)} sub="Recorded spam complaints" />
          <StatCard label="Unsubscribed" icon={UserMinus} color="#8b5cf6" value={num(t.unsubscribed)} sub="Used the unsubscribe link" />
          <StatCard label="Clicks" icon={MousePointerClick} color="#0284c7" value={num(t.uniqueClicks)} sub={`${pct(t.clickRate)} of sent`} />
          <StatCard label="Opens (approx.)" icon={Eye} color="#7c3aed" value={num(t.uniqueOpens)} sub={`${pct(t.openRate)} of sent`} />
        </div>
        <p className="text-[11.5px] text-muted">{data.limits.delivered} {data.limits.opens} {data.limits.clicks}</p>

        <Section title="Email performance" subtitle="Click a name in the legend to hide or show a line.">
          {empty && !data.series.some((s) => s.opens + s.clicks > 0) ? <EmptyState title="No emails sent in this period" description="Send a campaign or newsletter and its performance appears here." />
            : <div className="h-64">{trend && <LineSeriesChart labels={trend.labels} series={trend.series} theme={chartTheme} />}</div>}
        </Section>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Section title="Newsletter subscribers" subtitle="Active subscribers over time.">
            {data.subscriberGrowth.every((s) => s.subscribers === 0) ? <EmptyState title="No newsletter subscribers yet" description="Subscribe contacts from the Audience page and growth appears here." />
              : <div className="h-56"><TrendChart points={data.subscriberGrowth.map((s) => ({ label: formatPeriodLabel(s.period, data.groupBy as "day"), value: s.subscribers, previousLabel: null, previous: null }))} color="#16a34a" name="Subscribers" theme={chartTheme} /></div>}
          </Section>
          <Section title="Deliverability health" subtitle="From mail the server accepted or refused in this period.">
            <ul className="space-y-3">{data.health.map((h) => (
              <li key={h.key} className="flex items-center justify-between gap-3 text-[13px]"><span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", DOT[h.status])} aria-hidden />{h.label}</span>
                <span className="text-right"><span className="font-semibold tabular-nums">{h.value === null ? "—" : h.key === "complaints" ? h.value : `${h.value}%`}</span><span className="block text-[11px] text-muted">{WORD[h.status]}</span></span></li>))}</ul>
          </Section>
        </div>

        <Section title="Campaign performance" subtitle="Campaigns and newsletter issues started in this period. Signups use the tracking tags added to links to pesaa.io.">
          {data.campaigns.length === 0 ? <EmptyState title="No campaigns in this period" description="Campaigns you send appear here with their results." /> : (
            <DataCard label="Campaign performance" className="border-0"><table className="w-full min-w-[860px] text-left text-sm">
              <thead><tr><th className={thClass}>Campaign</th>{["Recipients", "Sent", "Opened", "Clicked", "Unsub.", "Signups", "Paying"].map((h) => <th key={h} className={cn(thClass, "text-right")}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{data.campaigns.map((x) => (
                <tr key={x.id}><td className="max-w-[260px] px-4 py-2.5"><Link href={`/marketing/campaigns/${x.id}`} className="block truncate font-semibold hover:text-accent hover:underline">{x.name}</Link><span className="text-[11.5px] text-muted">{day(x.startedAt)}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(x.recipients)}</td><td className="px-4 py-2.5 text-right tabular-nums">{num(x.sent)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{pct(x.openRate, 0)}</td><td className="px-4 py-2.5 text-right tabular-nums">{pct(x.clickRate, 0)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(x.unsubscribed)}</td><td className="px-4 py-2.5 text-right tabular-nums">{num(x.signups)}</td><td className="px-4 py-2.5 text-right tabular-nums">{num(x.paying)}</td></tr>))}</tbody></table></DataCard>
          )}
          <p className="mt-2 text-[11.5px] text-muted">Signups count businesses whose first visit to the website came from a link in that email (first-touch, from Website Traffic). Paying customers are those who later made a payment. Anyone who typed the address in themselves isn&apos;t counted.</p>
        </Section>
      </>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" subtitle="How your emails are performing, from what the platform actually records." actions={actions} />
      {body}
    </div>
  );
}

export default function MarketingAnalyticsPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><AnalyticsPage /></Suspense>;
}
