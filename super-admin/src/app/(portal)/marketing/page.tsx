"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, MousePointerClick, Newspaper, Plus, Send, Users } from "lucide-react";
import { marketingApi } from "@/lib/api";
import { errorText, useMarketingMutation, useMarketingOverview, useMarketingSettings } from "@/lib/marketing/hooks";
import { formatPeriodLabel } from "@/lib/adminAnalytics";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { TrendChart, type ChartTheme } from "@/components/charts/lazyTraffic";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { Change, Section, StatCard } from "@/components/traffic/shared";
import { Flash, StatusPill, day, num, pct } from "@/components/marketing/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";

function Overview() {
  const router = useRouter();
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useMarketingOverview(period.range, period.valid);
  const settings = useMarketingSettings().data;
  const [err, setErr] = useState("");
  const create = useMarketingMutation(() => marketingApi.createCampaign({ name: "Untitled campaign", kind: "campaign" }).then((r) => r.data));
  const newCampaign = () => create.mutateAsync(undefined as never).then((x) => router.push(`/marketing/campaigns/${x.id}`)).catch((e) => setErr(errorText(e)));

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load the marketing overview." onRetry={() => void refetch()} />;
  else {
    const k = data.kpis;
    const points = data.growth.map((g) => ({ label: formatPeriodLabel(g.period, data.groupBy as "day"), value: g.total, previousLabel: null, previous: null }));
    const added = data.growth.reduce((s, g) => s + g.new, 0);
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Eligible Contacts" icon={Users} color="#0284c7" href="/marketing/audience" value={num(k.eligibleContacts.value)} sub={data.consentMode === "opt_in" ? "With recorded consent" : "Active, valid, not unsubscribed"} />
          <StatCard label="Newsletter Subscribers" icon={Newspaper} color="#8b5cf6" href="/marketing/newsletters" value={num(k.newsletterSubscribers.value)} sub="Subscribed and can be emailed" />
          <StatCard label="Campaigns Sent" icon={Send} color="#16a34a" href="/marketing/campaigns" value={num(k.campaignsSent.value)} sub={<Change stat={k.campaignsSent} />} />
          <StatCard label="Engagement Rate" icon={MousePointerClick} color="#d97706" href="/marketing/analytics" value={pct(k.engagementRate.value)}
            sub={k.engagementRate.value === null ? "No emails sent in this period" : <>People who clicked ÷ sent{k.engagementRate.changePct !== null && <> · <Change stat={k.engagementRate} /></>}</>} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Section title="Audience Growth" subtitle={`${num(added)} new contacts in this period · total contacts over time`}>
            {points.every((p) => p.value === 0) ? <EmptyState title="No contacts yet" description="Contacts appear as businesses sign up or you import a list." /> : <div className="h-56"><TrendChart points={points} color="#0284c7" name="Total contacts" theme={chartTheme} /></div>}
          </Section>
          <Section title="Recent Campaigns" subtitle="Latest one-time campaigns and newsletter issues." href="/marketing/campaigns" linkLabel="View all">
            {data.recent.length === 0 ? <EmptyState icon={Mail} title="No campaigns yet" description="Create your first campaign to email a segment of your audience." action={<Button size="sm" onClick={newCampaign} disabled={create.isPending}><Plus size={13} /> Create campaign</Button>} /> : (
              <DataCard label="Recent campaigns" className="border-0"><table className="w-full min-w-[420px] text-left text-sm">
                <thead><tr><th className={thClass}>Campaign</th><th className={thClass}>Status</th><th className={cn(thClass, "text-right")}>Sent</th><th className={thClass}>Performance</th></tr></thead>
                <tbody className="divide-y divide-border">{data.recent.map((r) => (
                  <tr key={r.id}><td className="max-w-[200px] px-4 py-2.5"><Link href={`/marketing/campaigns/${r.id}`} className="block truncate font-semibold hover:text-accent hover:underline">{r.name}</Link><span className="text-[11.5px] text-muted">{day(r.startedAt ?? r.scheduledAt)}</span></td>
                    <td className="px-4 py-2.5"><StatusPill status={r.status} /></td><td className="px-4 py-2.5 text-right tabular-nums">{r.sent ? num(r.sent) : "—"}</td>
                    <td className="px-4 py-2.5 text-[12px]">{r.sent ? `${pct(r.clickRate, 0)} clicked · ${pct(r.openRate, 0)} opened` : <span className="text-muted">—</span>}</td></tr>))}</tbody></table></DataCard>
            )}
          </Section>
        </div>
        <p className="text-[11.5px] text-muted">Eligible contacts are active, valid addresses that haven&apos;t unsubscribed and meet your consent rule ({data.consentMode === "opt_in" ? "opt-in" : "existing customers until they unsubscribe; imported contacts need recorded consent"}). Engagement counts clicks only — opens are approximate and shown on Analytics.</p>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Marketing" subtitle="Reach your audience: contacts, campaigns, newsletters and automations in one place."
        actions={<><PeriodSelect period={period} /><Button onClick={newCampaign} disabled={create.isPending}><Plus size={14} /> Create campaign</Button></>} />
      {settings && !settings.provider.configured && <Notice>No email provider is configured on the server, so nothing can be sent yet. You can still build audiences, templates and drafts. <Link href="/marketing/settings" className="font-semibold underline">Open settings</Link></Notice>}
      {settings?.safeMode.active && <Notice tone="blue">This is a {settings.safeMode.environment} environment: live sends only reach the allow-listed test recipients, so real businesses are never emailed from test data.</Notice>}
      {err && <Flash tone="error">{err}</Flash>}
      {body}
    </div>
  );
}

export default function MarketingOverviewPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><Overview /></Suspense>;
}
