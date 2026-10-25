"use client";

import { Suspense, useMemo } from "react";
import { Download } from "lucide-react";
import { useErpModules } from "@/lib/api/hooks";
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
import { BackLink, Section, downloadCsv, moduleColor, moduleLabel } from "@/components/traffic/shared";
import { cn } from "@/lib/utils";

const num = "px-4 py-3 text-right tabular-nums";

function ModulesDetail() {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const chartTheme: ChartTheme = { grid: c.grid, tick: c.tick, tooltipBg: String(c.tooltip.backgroundColor), tooltipText: String(c.tooltip.color) };
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useErpModules(period.range, { enabled: period.valid });

  const stack = useMemo(() => data && {
    labels: data.series.map((s) => formatPeriodLabel(s.period, data.groupBy)),
    series: data.seriesModules.map((m, i) => ({ label: moduleLabel(m), color: moduleColor(i), data: data.series.map((s) => Number(s[m] ?? 0)) })),
  }, [data]);

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!data?.modules.length} onClick={() => data && downloadCsv(`erp-modules-${data.period.from}_${data.period.to}.csv`, [
        ["Module", "Page views", "Share (%)", "Users", "Businesses", "Adoption (%)", "Sessions", "Views per user"],
        ...data.modules.map((m) => [moduleLabel(m.module), m.views, m.pctOfViews, m.users, m.businesses, m.adoption, m.sessions, m.viewsPerUser]),
      ])}><Download size={14} aria-hidden /> Export</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load module usage." onRetry={() => void refetch()} />;
  else if (data.modules.length === 0) body = <div className="rounded-xl border border-border bg-card"><EmptyState title="No ERP activity in this period" description="Modules appear once users open pages in the app." /></div>;
  else body = (
    <>
      <Section title="Page views by module over time" subtitle={`Per ${data.groupBy}, the ${data.seriesModules.length} busiest modules, stacked.`}>
        <div className="h-72">{stack && <StackedAreaChart labels={stack.labels} series={stack.series} theme={chartTheme} />}</div>
      </Section>
      <div>
        <h2 className="mb-2 text-sm font-bold text-foreground">All modules</h2>
        <DataCard label="ERP modules">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr><th className={thClass}>Module</th>{["Page views", "Share", "Users", "Businesses", "Adoption", "Sessions", "Views / user"].map((h) => <th key={h} className={cn(thClass, "text-right")}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {data.modules.map((m) => (
                <tr key={m.module}>
                  <td className="px-4 py-3 font-medium">{moduleLabel(m.module)}</td>
                  <td className={num}>{formatFull(m.views)}</td><td className={num}>{formatPct(m.pctOfViews)}</td>
                  <td className={num}>{formatFull(m.users)}</td><td className={num}>{formatFull(m.businesses)}</td>
                  <td className={num}>{formatPct(m.adoption)}</td><td className={num}>{formatFull(m.sessions)}</td><td className={num}>{m.viewsPerUser}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
        <p className="mt-1.5 px-1 text-[11px] text-muted">Adoption is the share of the {formatFull(data.activeTenants)} active businesses that opened the module in this period.</p>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/erp-traffic" label="Back to ERP Traffic" />} title="Module Usage" subtitle="Which parts of the app businesses actually use." actions={actions} />
      {body}
    </div>
  );
}

export default function ErpModulesPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><ModulesDetail /></Suspense>;
}
