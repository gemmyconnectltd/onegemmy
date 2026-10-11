"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandMark, type BrandKind } from "@/components/charts/BrandMark";
import { DonutChart } from "@/components/charts/lazy";
import { Drawer } from "@/components/ui/Drawer";
import { Pagination } from "@/components/ui/Pagination";
import {
  useAnalyticsSignupInsights, useAnalyticsSignupInsightsAll, type AnalyticsQuery, type InsightDimension,
} from "@/lib/api/hooks";
import { chartPalette, type ChartPalette } from "@/lib/chartColors";
import { useAppConfig } from "@/lib/appConfig";
import { businessTypeLabel, formatCompact, formatPct, humanizeKey } from "@/lib/adminAnalytics";
import { QueryBody, SectionCard } from "./shared";
import { cn } from "@/lib/utils";

interface Tab {
  key: InsightDimension;
  label: string;
  /** Singular noun for copy, e.g. "country". */
  noun: string;
  allLabel: string;
  kind: BrandKind;
  /** Query param on /admin/tenants that a row drills into. */
  filterParam: string;
  label_of: (raw: string) => string;
}

const TABS: Tab[] = [
  { key: "country", label: "By Country", noun: "country", allLabel: "countries", kind: "country", filterParam: "country", label_of: (r) => r },
  { key: "industry", label: "By Industry", noun: "industry", allLabel: "industries", kind: "industry", filterParam: "industry", label_of: (r) => r },
  { key: "business_type", label: "By Business Type", noun: "business type", allLabel: "business types", kind: "business_type", filterParam: "businessType", label_of: businessTypeLabel },
  { key: "heard_about", label: "How They Heard About Us", noun: "source", allLabel: "sources", kind: "heard_about", filterParam: "heardAbout", label_of: humanizeKey },
];

/** Category colors come from the shared chart palette (not hardcoded per tab), so every tab reads as one system. */
const categoryColors = (c: ChartPalette) => [c.blue, c.income, c.gold, "#8b5cf6", "#ea7a1a"];
const OTHER_COLOR = "#cbd5e1";
const PAGE_SIZE = 20;

/** One row: marker, name, count, share and a thin share bar. */
function InsightRow({ tab, name, count, pct, color, href, plain }: {
  tab: Tab; name: string; count: number; pct: number; color: string; href?: string;
  /** Other / Not provided: a plain dot instead of a flag/logo, no drill-down. */
  plain?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5 text-[13px]">
        {plain
          ? <span className="ml-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
          : <BrandMark kind={tab.kind} name={name} color={color} />}
        <span className={cn("min-w-0 flex-1 truncate capitalize", plain ? "font-medium text-muted" : "font-semibold text-foreground")}>
          {plain ? name : tab.label_of(name)}
        </span>
        <span className="flex-shrink-0 font-bold tabular-nums text-foreground">{formatCompact(count)}</span>
        <span className="w-11 flex-shrink-0 text-right tabular-nums text-muted">{formatPct(pct, 1)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border/70">
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%`, backgroundColor: color }} />
      </div>
    </>
  );
  const cls = "-mx-2 block rounded-lg px-2 py-1";
  return href
    ? <Link href={href} title={`View tenants where ${tab.noun} is "${tab.label_of(name)}"`} className={cn(cls, "transition-colors hover:bg-surface")}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Full paginated category list for one tab ("View All"). */
function InsightDrawer({ tab, query, onClose }: { tab: Tab | null; query: AnalyticsQuery; onClose: () => void }) {
  const { theme } = useAppConfig();
  const colors = categoryColors(chartPalette(theme === "dark"));
  const [page, setPage] = useState(1);
  const q = useAnalyticsSignupInsightsAll(
    { ...query, dimension: tab?.key ?? "country", page, page_size: PAGE_SIZE }, { enabled: !!tab },
  );
  const items = q.data?.items ?? [];
  return (
    <Drawer open={!!tab} onClose={onClose} title={tab?.label} description="All categories for tenants who registered in the selected period" size="md">
      <div className="p-5">
        <QueryBody query={q} errorMessage="Failed to load categories." empty={items.length === 0} emptyMessage="No categories">
          {tab && items.map((i, idx) => (
            <InsightRow key={i.name} tab={tab} name={i.name} count={i.count} pct={i.pct}
              color={colors[(idx + (page - 1) * PAGE_SIZE) % colors.length]}
              href={`/admin/tenants?${tab.filterParam}=${encodeURIComponent(i.name)}`} />
          ))}
        </QueryBody>
        {(q.data?.total ?? 0) > PAGE_SIZE && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data?.total ?? 0} onPageChange={setPage} itemLabel="categories" className="mt-4" />
        )}
      </div>
    </Drawer>
  );
}

export function SignupInsights({ query }: { query: AnalyticsQuery }) {
  const { theme } = useAppConfig();
  const c = chartPalette(theme === "dark");
  const colors = categoryColors(c);
  const [tabKey, setTabKey] = useState<InsightDimension>("country");
  const [detail, setDetail] = useState<Tab | null>(null);
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  // Only the selected tab's breakdown is fetched.
  const q = useAnalyticsSignupInsights({ ...query, dimension: tab.key, limit: 4 });
  const d = q.data;

  // Rows (and donut slices) share one list so the two always agree. Shares are
  // of ALL signups in the period: categories + Other + Not provided = 100%.
  const rows = d ? [
    ...d.items.map((i, idx) => ({ ...i, color: colors[idx % colors.length], plain: false })),
    ...(d.other ? [{ name: `Other (${d.other.categories})`, count: d.other.count, pct: d.other.pct, color: OTHER_COLOR, plain: true }] : []),
    ...(d.unknown > 0 ? [{ name: "Not provided", count: d.unknown, pct: d.unknownPct, color: c.gray, plain: true }] : []),
  ] : [];

  return (
    <SectionCard
      title="Signup Insights"
      subtitle={d ? `${formatCompact(d.total)} ${d.total === 1 ? "tenant" : "tenants"} registered in the selected period` : "Where businesses come from"}
    >
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Signup breakdown">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tabKey} onClick={() => setTabKey(t.key)}
            className={cn(
              "h-8 rounded-lg border px-3 text-[12px] font-semibold transition-colors",
              t.key === tabKey ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-card text-muted hover:text-foreground",
            )}>
            {t.label}
          </button>
        ))}
      </div>

      <QueryBody query={q} errorMessage="Failed to load signup insights." empty={!d || d.total === 0}
        emptyMessage="No signups match these filters in this period">
        {d && (
          <>
            {d.ignoredFilter === tab.key && (
              <p className="mb-3 rounded-lg bg-surface px-3 py-1.5 text-[12px] text-muted">
                Showing all {tab.allLabel} — your {tab.noun} filter doesn’t apply to this breakdown.
              </p>
            )}
            <div className="my-auto flex flex-col items-center gap-5 sm:flex-row">
              <div className="relative h-[132px] w-[132px] flex-shrink-0">
                <DonutChart
                  data={rows.map((r) => ({ name: r.plain ? r.name.replace(/ \(\d+\)$/, "") : tab.label_of(r.name), value: r.count }))}
                  colors={rows.map((r) => r.color)} innerRadius={46} outerRadius={64} tooltipStyle={c.tooltip}
                />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[26px] font-bold leading-none text-foreground">{formatCompact(d.total)}</span>
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Signups</span>
                </div>
              </div>
              <div className="w-full min-w-0 flex-1 space-y-0.5">
                {rows.map((r) => (
                  <InsightRow key={r.name} tab={tab} name={r.name} count={r.count} pct={r.pct} color={r.color} plain={r.plain}
                    href={r.plain ? undefined : `/admin/tenants?${tab.filterParam}=${encodeURIComponent(r.name)}`} />
                ))}
              </div>
            </div>
            {d.hasMore && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => setDetail(tab)} className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">
                  View All <ArrowRight size={12} />
                </button>
              </div>
            )}
          </>
        )}
      </QueryBody>
      {/* Remounts per tab so its page counter starts at 1 */}
      <InsightDrawer key={detail?.key ?? "closed"} tab={detail} query={query} onClose={() => setDetail(null)} />
    </SectionCard>
  );
}
