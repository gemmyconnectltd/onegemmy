"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useAnalyticsFilterOptions, useAnalyticsOverview, useAnalyticsPlatformStatus, type AnalyticsFilters, type AnalyticsQuery,
} from "@/lib/api/hooks";
import {
  DEFAULT_PRESET, PERIOD_CODES, presetFromCode, presetRange,
} from "@/lib/adminAnalytics";
import { FilterBar, type OverviewFilters } from "./FilterBar";
import { OverviewMetrics } from "./OverviewMetrics";
import { PlatformStatus } from "./PlatformStatus";
import { RecentTenants } from "./RecentTenants";
import { SignupInsights } from "./SignupInsights";
import { TenantGrowthSection } from "./TenantGrowthSection";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filter state lives in the URL (?period=7d&country=Rwanda&industry=Retail), so
 * a refresh keeps it, the link is shareable, and back/forward step through
 * changes. Defaults are omitted to keep the URL clean. Values are the raw ones
 * stored on tenants (e.g. "Rwanda", "sole"), which is exactly what the API filters on.
 */
function useOverviewFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const periodParam = params.get("period");
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const country = params.get("country") || undefined;
  const industry = params.get("industry") || undefined;
  const businessType = params.get("businessType") || undefined;

  const filters = useMemo<OverviewFilters>(() => {
    const preset = presetFromCode(periodParam);
    if (preset === "custom" && fromParam && toParam && ISO_DATE.test(fromParam) && ISO_DATE.test(toParam) && fromParam <= toParam) {
      return { preset, range: { from: fromParam, to: toParam }, country, industry, businessType };
    }
    // Not custom — or a custom range in the URL that is incomplete/invalid: fall back to the default.
    const resolved = preset === "custom" ? DEFAULT_PRESET : preset;
    return { preset: resolved, range: presetRange(resolved), country, industry, businessType };
  }, [periodParam, fromParam, toParam, country, industry, businessType]);

  const setFilters = useCallback((next: OverviewFilters) => {
    const sp = new URLSearchParams();
    if (next.preset !== DEFAULT_PRESET) sp.set("period", PERIOD_CODES[next.preset]);
    if (next.preset === "custom") { sp.set("from", next.range.from); sp.set("to", next.range.to); }
    if (next.country) sp.set("country", next.country);
    if (next.industry) sp.set("industry", next.industry);
    if (next.businessType) sp.set("businessType", next.businessType);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  const reset = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);
  return { filters, setFilters, reset };
}

/**
 * The super-admin Platform Overview. Answers five questions: how big is PESAA
 * (KPIs), is it growing (growth chart), is it healthy (status), where do
 * businesses come from (insights), and who just joined (recent tenants).
 * Each section fetches its own server-side aggregate with the global filters,
 * so one slow or failing endpoint only affects its own card.
 */
export function PlatformOverview() {
  const { filters, setFilters, reset } = useOverviewFilters();
  const business: AnalyticsFilters = useMemo(
    () => ({ country: filters.country, industry: filters.industry, businessType: filters.businessType }),
    [filters.country, filters.industry, filters.businessType],
  );
  const query: AnalyticsQuery = useMemo(() => ({ ...filters.range, ...business }), [filters.range, business]);

  const overview = useAnalyticsOverview(query);
  const status = useAnalyticsPlatformStatus(query);
  const options = useAnalyticsFilterOptions(business);

  const activeCount =
    [filters.country, filters.industry, filters.businessType].filter(Boolean).length + (filters.preset !== DEFAULT_PRESET ? 1 : 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">Platform Overview</h1>
        <p className="mt-1 text-sm text-muted">Monitor your platform performance, growth and overall health</p>
      </div>

      <FilterBar value={filters} options={options.data} activeCount={activeCount} onChange={setFilters} onReset={reset} />

      <OverviewMetrics query={overview} data={overview.data} />

      {/* ~68 / 32 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <TenantGrowthSection query={query} />
        <PlatformStatus query={status} data={status.data} />
      </div>

      {/* ~58 / 42, equal height */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SignupInsights query={query} />
        <RecentTenants filters={business} />
      </div>
    </div>
  );
}
