"use client";

import { Suspense, useMemo } from "react";
import { Download, Laptop, Smartphone, Tablet } from "lucide-react";
import { useErpDevices } from "@/lib/api/hooks";
import type { ErpMix } from "@/lib/api/admin";
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
import { BackLink, Section, StatCard, deviceColor, deviceLabel, downloadCsv, moduleLabel } from "@/components/traffic/shared";
import { cn } from "@/lib/utils";

const num = "px-4 py-3 text-right tabular-nums";
const name = (n: string) => (n === "unknown" ? "Unknown" : n);

function MixTable({ title, rows, label }: { title: string; rows: ErpMix[]; label: (n: string) => string }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-bold text-foreground">{title}</h2>
      <DataCard label={title}>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead><tr><th className={thClass}>{title.replace(/s$/, "")}</th>{["Users", "Businesses", "Sessions", "Page views", "Share"].map((h) => <th key={h} className={cn(thClass, "text-right")}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-3 font-medium">{label(r.name)}</td>
                <td className={num}>{formatFull(r.users)}</td><td className={num}>{formatFull(r.businesses)}</td>
                <td className={num}>{formatFull(r.sessions)}</td><td className={num}>{formatFull(r.views)}</td><td className={num}>{formatPct(r.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataCard>
    </div>
  );
}

function DevicesDetail() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useErpDevices(period.range, { enabled: period.valid });

  const stack = useMemo(() => data && {
    labels: data.series.map((s) => formatPeriodLabel(s.period, data.groupBy)),
    series: data.deviceNames.map((d) => ({ label: deviceLabel(d), color: deviceColor(d), data: data.series.map((s) => Number(s[d] ?? 0)) })),
  }, [data]);

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!data?.types.length} onClick={() => data && downloadCsv(`erp-devices-${data.period.from}_${data.period.to}.csv`, [
        ["Group", "Name", "Users", "Businesses", "Sessions", "Page views", "Share of sessions (%)"],
        ...data.types.map((r) => ["Device", deviceLabel(r.name), r.users, r.businesses, r.sessions, r.views, r.pct]),
        ...data.os.map((r) => ["Operating system", name(r.name), r.users, r.businesses, r.sessions, r.views, r.pct]),
        ...data.browsers.map((r) => ["Browser", name(r.name), r.users, r.businesses, r.sessions, r.views, r.pct]),
      ])}><Download size={14} aria-hidden /> Export</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load devices." onRetry={() => void refetch()} />;
  else if (data.types.length === 0) body = <div className="rounded-xl border border-border bg-card"><EmptyState title="No ERP activity in this period" description="Devices appear once users open pages in the app." /></div>;
  else {
    const find = (d: string) => data.types.find((t) => t.name === d);
    const card = (d: string, icon: React.ElementType) => {
      const t = find(d);
      return <StatCard key={d} label={deviceLabel(d)} icon={icon} color={deviceColor(d)} value={t ? formatPct(t.pct) : "0%"} sub={t ? `${formatFull(t.users)} users · ${formatFull(t.sessions)} sessions` : "No sessions"} />;
    };
    body = (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{card("desktop", Laptop)}{card("mobile", Smartphone)}{card("tablet", Tablet)}</div>

        <Section title="Sessions by device over time" subtitle={`Per ${data.groupBy}, stacked.`}>
          <div className="h-72">{stack && <StackedAreaChart labels={stack.labels} series={stack.series} theme={chartTheme} />}</div>
        </Section>

        <Section title="Device mix by module" subtitle="Within each module, the share of page views from each device. Shows where phones and tablets are used, for example in Point of Sale.">
          <DataCard label="Device mix by module" className="border-0">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead><tr><th className={thClass}>Module</th>{data.deviceNames.map((d) => <th key={d} className={cn(thClass, "text-right")}>{deviceLabel(d)}</th>)}<th className={cn(thClass, "text-right")}>Page views</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.byModule.map((m) => (
                  <tr key={m.module}>
                    <td className="px-4 py-3 font-medium">{moduleLabel(m.module)}</td>
                    {data.deviceNames.map((d) => <td key={d} className={num}>{formatPct(Number(m[d] ?? 0), 0)}</td>)}
                    <td className={num}>{formatFull(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
        </Section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <MixTable title="Operating systems" rows={data.os} label={name} />
          <MixTable title="Browsers" rows={data.browsers} label={name} />
        </div>
        <p className="px-1 text-[11px] text-muted">Detected from the browser&apos;s user-agent when a page is opened; only the device type, operating system and browser name are kept. iPads that present as Macs appear as desktop, and users counted under more than one device are in each.</p>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/erp-traffic" label="Back to ERP Traffic" />} title="Devices" subtitle="The phones, tablets and computers businesses use to run PESAA." actions={actions} />
      {body}
    </div>
  );
}

export default function ErpDevicesPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><DevicesDetail /></Suspense>;
}
