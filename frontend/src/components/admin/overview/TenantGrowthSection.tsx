"use client";

import { useMemo, useState } from "react";
import { TenantGrowthChart, type TenantGrowthDatum } from "@/components/charts/lazy";
import { useAnalyticsGrowth, type AnalyticsGroupBy, type AnalyticsQuery } from "@/lib/api/hooks";
import type { GrowthMetric } from "@/lib/api/admin";
import { chartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { autoGroupBy, formatCompact, formatPeriodLabel, rangeDays } from "@/lib/adminAnalytics";
import { QueryBody, SectionCard } from "./shared";
import { cn } from "@/lib/utils";

const GROUPINGS: { value: AnalyticsGroupBy; label: string; days: number }[] = [
  { value: "day", label: "Daily", days: 1 },
  { value: "week", label: "Weekly", days: 7 },
  { value: "month", label: "Monthly", days: 28 },
  { value: "year", label: "Yearly", days: 365 },
];
const MAX_BUCKETS = 400; // mirrors the backend cap
const LINE_COLOR = "#ea7a1a"; // chart accent for the running total

const COPY: Record<GrowthMetric, { tab: string; bars: string; line: string; empty: string }> = {
  tenants: { tab: "Tenants", bars: "New tenants", line: "Total tenants", empty: "No tenants match these filters yet" },
  users: { tab: "Users", bars: "New users", line: "Total users", empty: "No users match these filters yet" },
};

const chip = (active: boolean) =>
  cn(
    "h-8 px-3.5 rounded-lg text-[13px] font-semibold border transition-colors",
    active ? "bg-accent/10 border-accent/30 text-accent" : "bg-card border-border text-muted hover:text-foreground",
  );

export function TenantGrowthSection({ query }: { query: AnalyticsQuery }) {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const [metric, setMetric] = useState<GrowthMetric>("tenants");
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy | "auto">("auto");

  const days = query.from && query.to ? rangeDays({ from: query.from, to: query.to }) : 30;
  const auto = autoGroupBy(days);
  const growthQ = useAnalyticsGrowth({ ...query, metric, groupBy: groupBy === "auto" ? undefined : groupBy });
  const copy = COPY[metric];
  const unit = growthQ.data?.period ?? (groupBy === "auto" ? auto : groupBy);

  const data = useMemo<TenantGrowthDatum[]>(
    () => (growthQ.data?.data ?? []).map((p) => ({
      month: formatPeriodLabel(p.period, growthQ.data!.period), count: p.newCount, cumulative: p.totalCount,
    })),
    [growthQ.data],
  );
  const hasData = data.some((d) => d.count > 0 || d.cumulative > 0);

  return (
    <SectionCard
      title="Tenant & User Growth"
      subtitle={`${copy.bars} vs. ${copy.line.toLowerCase()} · ${GROUPINGS.find((g) => g.value === unit)?.label.toLowerCase() ?? unit}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="tablist" aria-label="Growth metric">
            {(Object.keys(COPY) as GrowthMetric[]).map((m) => (
              <button key={m} role="tab" aria-selected={metric === m} className={chip(metric === m)} onClick={() => setMetric(m)}>
                {COPY[m].tab}
              </button>
            ))}
          </div>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as AnalyticsGroupBy | "auto")} aria-label="Group by"
            className="h-8 bg-card border border-border rounded-lg px-2.5 text-[13px] font-semibold text-foreground cursor-pointer hover:border-foreground/25">
            <option value="auto">Auto ({GROUPINGS.find((g) => g.value === auto)?.label})</option>
            {GROUPINGS.map((g) => (
              <option key={g.value} value={g.value} disabled={days / g.days > MAX_BUCKETS}>{g.label}</option>
            ))}
          </select>
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="flex items-center gap-2 text-[12px] font-medium text-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.primary }} /> {copy.bars}
        </span>
        <span className="flex items-center gap-2 text-[12px] font-medium text-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LINE_COLOR }} /> {copy.line}
        </span>
      </div>
      <QueryBody query={growthQ} errorMessage="Failed to load growth data." empty={!hasData} emptyMessage={copy.empty}>
        <div className="min-h-[17rem] w-full min-w-0 flex-1">
          <TenantGrowthChart
            data={data}
            barColor={c.primary}
            lineColor={LINE_COLOR}
            gridColor={c.grid}
            tickColor={c.tick}
            tooltipStyle={c.tooltip}
            barLabel={copy.bars}
            lineLabel={copy.line}
            formatValue={formatCompact}
          />
        </div>
      </QueryBody>
    </SectionCard>
  );
}
