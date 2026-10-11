"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import type { AnalyticsMetric, AnalyticsOverview } from "@/lib/api/admin";
import { formatMoney } from "@/lib/money";
import { MetricCard } from "./MetricCard";
import { QueryBody, type SectionQuery } from "./shared";

type IconType = ComponentType<{ size?: number; style?: React.CSSProperties }>;

// Presentation only (icon + accent) keyed by the metric key the API returns.
const STYLE: Record<string, { icon: IconType; color: string }> = {
  totalTenants: { icon: Building2, color: "#0284c7" },
  totalUsers: { icon: Users, color: "#8b5cf6" },
  totalOrders: { icon: ShoppingCart, color: "#059669" },
  tenantSales: { icon: TrendingUp, color: "#d97706" },
};
const FALLBACK = { icon: Building2 as IconType, color: "#64748b" };

/**
 * Tenant sales by currency: the original amounts tenants actually sold in, next to what each is worth in
 * the platform reporting currency. Raw amounts in different currencies are never added together; a
 * currency with no platform rate is shown with its original amount only and left out of the total.
 */
function SalesByCurrencyDrawer({ metric, onClose }: { metric: AnalyticsMetric | null; onClose: () => void }) {
  const reporting = metric?.currency ?? "";
  const rows = metric?.breakdown ?? [];
  const missing = metric?.missingRates ?? [];
  return (
    <Drawer open={!!metric} onClose={onClose} title="Tenant sales by currency"
      description="Gross sales tenants processed in the selected period — tenant sales volume, not PESAA's own revenue" size="md">
      <div className="space-y-4 p-5">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">No completed sales in this period.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-semibold">Currency</th>
                  <th className="px-3 py-2 text-right font-semibold">Original</th>
                  <th className="px-3 py-2 text-right font-semibold">In {reporting}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.currency}>
                    <td className="px-3 py-2.5 font-semibold text-foreground">{r.currency}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatMoney(r.originalAmount, r.currency)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.convertedAmount === null
                        ? <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">No rate</span>
                        : <span className="text-foreground">{formatMoney(r.convertedAmount, reporting)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface/60">
                  <td className="px-3 py-2.5 font-bold text-foreground" colSpan={2}>Converted total</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground">{formatMoney(metric?.value ?? 0, reporting)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {missing.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-[12px] text-amber-800 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <p>
              No platform exchange rate for {missing.join(", ")}, so {missing.length === 1 ? "it is" : "they are"} not in the converted total
              (and are never assumed to equal {reporting}).{" "}
              <Link href="/admin/settings" className="font-semibold underline">Add a rate in Settings → Currency</Link>.
            </p>
          </div>
        )}
        <p className="text-[11px] text-muted">
          Each day&apos;s sales are converted at the platform rate in force that day, so past figures don&apos;t change when today&apos;s rate does.
        </p>
      </div>
    </Drawer>
  );
}

export function OverviewMetrics({ query, data }: { query: SectionQuery; data: AnalyticsOverview | undefined }) {
  const [details, setDetails] = useState<AnalyticsMetric | null>(null);
  const days = data?.period.days ?? 0;
  const comparison = days === 1 ? "vs previous day" : `vs previous ${days} days`;
  return (
    <QueryBody query={query} errorMessage="Failed to load platform metrics." empty={!data}>
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-4">
        {data?.metrics.map((m) => {
          const s = STYLE[m.key] ?? FALLBACK;
          // Money that came from several currencies opens its per-currency breakdown.
          const hasDetails = m.format === "currency" && (m.breakdown?.length ?? 0) > 0;
          return (
            <MetricCard key={m.key} metric={m} icon={s.icon} color={s.color} comparison={comparison}
              onDetails={hasDetails ? () => setDetails(m) : undefined} />
          );
        })}
      </div>
      <SalesByCurrencyDrawer metric={details} onClose={() => setDetails(null)} />
    </QueryBody>
  );
}
