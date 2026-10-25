"use client";

import { Suspense } from "react";
import { Download } from "lucide-react";
import { useTrafficCampaigns } from "@/lib/api/hooks";
import { formatFull, formatPct, humanizeKey } from "@/lib/adminAnalytics";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { BackLink, downloadCsv } from "@/components/traffic/shared";
import { cn } from "@/lib/utils";

const num = "px-4 py-3 text-right tabular-nums";

function CampaignsDetail() {
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useTrafficCampaigns(period.range, { enabled: period.valid });

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!data?.campaigns.length} onClick={() => data && downloadCsv(`traffic-campaigns-${data.period.from}_${data.period.to}.csv`, [
        ["Campaign", "Visitors", "Page views", "Signups", "Paying customers", "Conversion rate (%)"],
        ...data.campaigns.map((c) => [c.campaign, c.visitors, c.views, c.signups, c.paying, c.conversionRate]), [],
        ["Campaign", "Source", "Medium", "Visitors", "Page views", "Signups", "Paying customers"],
        ...data.sources.map((s) => [s.campaign, s.source, s.medium, s.visitors, s.views, s.signups, s.paying]),
      ])}><Download size={14} aria-hidden /> Export</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load campaigns." onRetry={() => void refetch()} />;
  else if (data.campaigns.length === 0) body = (
    <div className="rounded-xl border border-border bg-card">
      <EmptyState title="No campaign traffic tracked" description="Add utm_campaign (and utm_source / utm_medium) to links in ads, emails and posts, for example pesaa.io/?utm_source=facebook&utm_medium=cpc&utm_campaign=launch. Campaigns appear here once those links get visits. Ad spend is not tracked." />
    </div>
  );
  else body = (
    <>
      <div>
        <h2 className="mb-2 text-sm font-bold text-foreground">Campaigns</h2>
        <DataCard label="Campaigns">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr><th className={thClass}>Campaign</th>{["Visitors", "Page views", "Signups", "Paying", "Conversion"].map((h) => <th key={h} className={cn(thClass, "text-right")}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {data.campaigns.map((c) => (
                <tr key={c.campaign}>
                  <td className="px-4 py-3 font-medium">{humanizeKey(c.campaign)}</td>
                  <td className={num}>{formatFull(c.visitors)}</td><td className={num}>{formatFull(c.views)}</td>
                  <td className={num}>{formatFull(c.signups)}</td><td className={num}>{formatFull(c.paying)}</td>
                  <td className={num}>{formatPct(c.conversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
        <p className="mt-1.5 px-1 text-[11px] text-muted">Conversion is paying customers ÷ visitors. Signups are credited to the campaign on a visitor&apos;s first visit. Ad spend and cost per signup are not tracked.{data.truncated && " Showing the 500 busiest campaigns."}</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-foreground">By source and medium</h2>
        <DataCard label="Campaign sources">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr><th className={thClass}>Campaign</th><th className={thClass}>Source</th><th className={thClass}>Medium</th>{["Visitors", "Signups", "Paying"].map((h) => <th key={h} className={cn(thClass, "text-right")}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {data.sources.map((s) => (
                <tr key={`${s.campaign}|${s.source}|${s.medium}`}>
                  <td className="px-4 py-3 font-medium">{humanizeKey(s.campaign)}</td>
                  <td className="px-4 py-3 text-muted">{s.source ?? "—"}</td><td className="px-4 py-3 text-muted">{s.medium ?? "—"}</td>
                  <td className={num}>{formatFull(s.visitors)}</td><td className={num}>{formatFull(s.signups)}</td><td className={num}>{formatFull(s.paying)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink />} title="Campaigns" subtitle="UTM campaigns with their source, medium, signups and paying customers." actions={actions} />
      {body}
    </div>
  );
}

export default function TrafficCampaignsPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><CampaignsDetail /></Suspense>;
}
