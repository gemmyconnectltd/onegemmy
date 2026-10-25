"use client";

import { Suspense } from "react";
import { useErpEngagement } from "@/lib/api/hooks";
import { formatFull, formatPct } from "@/lib/adminAnalytics";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { BackLink, Section, StatCard } from "@/components/traffic/shared";
import { Activity, CalendarDays, Repeat, Users } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function EngagementDetail() {
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useErpEngagement(period.range, { enabled: period.valid });

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load engagement." onRetry={() => void refetch()} />;
  else {
    const max = Math.max(1, ...data.heatmap.flat());
    const weeks = Math.max(0, ...data.cohorts.map((c) => c.retention.length));
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Daily Active Users" icon={Users} color="#0284c7" value={formatFull(data.dau)} sub={`on ${data.asOf}`} />
          <StatCard label="Weekly Active Users" icon={CalendarDays} color="#16a34a" value={formatFull(data.wau)} sub="last 7 days" />
          <StatCard label="Monthly Active Users" icon={Activity} color="#8b5cf6" value={formatFull(data.mau)} sub="last 30 days" />
          <StatCard label="DAU / MAU" icon={Repeat} color="#0e7490" value={data.dauMau === null ? "—" : formatPct(data.dauMau)} sub={data.wauMau === null ? "Share of monthly users active daily" : `WAU / MAU ${formatPct(data.wauMau)}`} />
        </div>

        <Section title="When the app is busiest" subtitle="Page views by weekday and hour (UTC) in the selected period. Darker means busier.">
          {data.heatmapTotal === 0 ? <EmptyState title="No activity in this period" description="The pattern appears once users open pages in the app." /> : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]" role="table" aria-label="Page views by weekday and hour">
                <div className="grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1 text-[10px] text-muted" role="row">
                  <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center" role="columnheader">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
                </div>
                {data.heatmap.map((row, d) => (
                  <div key={DAYS[d]} className="mt-1 grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1" role="row">
                    <span className="self-center text-[11px] font-medium text-muted" role="rowheader">{DAYS[d]}</span>
                    {row.map((n, h) => (
                      <span key={h} role="cell" title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 — ${formatFull(n)} page views`}
                        className="h-6 rounded-[4px] bg-accent" style={{ opacity: n === 0 ? 0.06 : 0.15 + 0.85 * (n / max) }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Weekly user retention" subtitle="Of the users who first opened the app in a given week, the share who came back in each following week.">
          {data.cohorts.length === 0 ? <EmptyState title="No cohorts yet" description="Cohorts appear once users have been active over several weeks." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center text-[12px]">
                <thead><tr className="text-[11px] text-muted"><th className="text-left font-semibold">First week</th><th className="font-semibold">Users</th>{Array.from({ length: weeks }, (_, i) => <th key={i} className="font-semibold">{i === 0 ? "Week 0" : `+${i}`}</th>)}</tr></thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.week}>
                      <td className="whitespace-nowrap text-left font-medium text-foreground">{new Date(`${c.week}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</td>
                      <td className="tabular-nums text-muted">{formatFull(c.size)}</td>
                      {Array.from({ length: weeks }, (_, i) => {
                        const v = c.retention[i];
                        return v === undefined || v === null
                          ? <td key={i} />
                          : <td key={i} title={`${formatPct(v)} of ${formatFull(c.size)} users`} className="rounded-md py-1.5 font-semibold tabular-nums text-foreground" style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(8 + v * 0.7)}%, transparent)` }}>{Math.round(v)}%</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/erp-traffic" label="Back to ERP Traffic" />} title="Engagement" subtitle="How often people come back, and when they use the app." actions={<PeriodSelect period={period} />} />
      {body}
    </div>
  );
}

export default function ErpEngagementPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><EngagementDetail /></Suspense>;
}
