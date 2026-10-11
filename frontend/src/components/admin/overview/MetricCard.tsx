"use client";

import type { ComponentType } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { AnalyticsMetric } from "@/lib/api/admin";
import { formatChange, formatCompact, formatFull, formatMoney } from "@/lib/adminAnalytics";
import { InfoTip } from "./shared";
import { cn } from "@/lib/utils";

export function metricValue(m: AnalyticsMetric, compact = true): string {
  if (m.format === "currency") return formatMoney(m.value, m.currency ?? "RWF", compact);
  return compact ? formatCompact(m.value) : formatFull(m.value);
}

/** "↑ 12% vs previous 30 days", or a neutral note when there is nothing to compare against. */
function Change({ metric, comparison }: { metric: AnalyticsMetric; comparison: string }) {
  if (metric.changePct === null) {
    return <span className="text-[12px] text-muted">{metric.value > 0 ? "New — no earlier data" : "No change data"}</span>;
  }
  const up = metric.changePct > 0;
  const flat = metric.changePct === 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="flex flex-wrap items-center gap-x-1 text-[12px] text-muted">
      <span className={cn("inline-flex items-center gap-0.5 font-bold", flat ? "text-muted" : up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
        {!flat && <Icon size={12} />}
        {formatChange(metric.changePct)}
      </span>
      {comparison}
    </span>
  );
}

export function MetricCard({
  metric, icon: Icon, color, comparison, onDetails,
}: {
  metric: AnalyticsMetric;
  icon: ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  comparison: string;
  /** When set the card is clickable and opens a breakdown (used for multi-currency money). */
  onDetails?: () => void;
}) {
  const missing = metric.missingRates ?? [];
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <p className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-wider text-muted">{metric.label}</p>
        <InfoTip align="right">{metric.description}</InfoTip>
      </div>
      <p
        className="mt-2.5 truncate text-left text-[30px] font-bold leading-none tracking-tight text-foreground"
        title={metric.format === "currency" ? metricValue(metric, false) : formatFull(metric.value)}
      >
        {metricValue(metric)}
      </p>
      <div className="mt-2 text-left"><Change metric={metric} comparison={comparison} /></div>
      {metric.format === "currency" && metric.currency && (
        <p className="mt-1 text-left text-[11px] text-muted">
          Reporting currency: {metric.currency}
          {missing.length > 0 && (
            <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">· excludes {missing.join(", ")} (no rate)</span>
          )}
        </p>
      )}
    </>
  );
  const cls = "min-w-0 rounded-2xl border border-border bg-card px-5 py-3.5";
  return onDetails ? (
    <button type="button" onClick={onDetails} aria-label={`${metric.label} details`}
      className={`${cls} block w-full cursor-pointer transition-colors hover:border-foreground/25`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
