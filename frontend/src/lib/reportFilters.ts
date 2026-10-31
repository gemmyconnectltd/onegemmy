"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIOD_PRESETS, periodRange, type PeriodKey, type PeriodRange, type PeriodValue } from "@/lib/period";
import type { CompareMode } from "@/lib/api/reports";

/** The filters every report shares. They live in the address (?period=&from=&to=&compare=&branch=), so a report link keeps them. */
export interface ReportFilters { period: PeriodValue; compare: CompareMode; compareFrom?: string; compareTo?: string; branch?: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRESETS = new Set<string>(PERIOD_PRESETS.map((p) => p.key));
export const DEFAULT_REPORT_PERIOD: PeriodValue = { key: "month" };

export function parseFilters(params: URLSearchParams): ReportFilters {
  const key = params.get("period") ?? "";
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  let period: PeriodValue = DEFAULT_REPORT_PERIOD;
  if (key === "custom" && DATE.test(from) && DATE.test(to) && from <= to) period = { key: "custom", from, to };
  else if (PRESETS.has(key)) period = { key: key as PeriodKey };
  const compare = (["none", "previous", "year", "custom"] as const).find((m) => m === params.get("compare")) ?? "none";
  const cf = params.get("cfrom") ?? "", ct = params.get("cto") ?? "";
  const customOk = compare === "custom" && DATE.test(cf) && DATE.test(ct) && cf <= ct;
  return { period, compare: compare === "custom" && !customOk ? "none" : compare, compareFrom: customOk ? cf : undefined, compareTo: customOk ? ct : undefined, branch: params.get("branch") || undefined };
}

export function filtersToQuery(f: ReportFilters): string {
  const p = new URLSearchParams();
  p.set("period", f.period.key);
  if (f.period.key === "custom") { p.set("from", f.period.from ?? ""); p.set("to", f.period.to ?? ""); }
  if (f.compare !== "none") p.set("compare", f.compare);
  if (f.compare === "custom") { p.set("cfrom", f.compareFrom ?? ""); p.set("cto", f.compareTo ?? ""); }
  if (f.branch) p.set("branch", f.branch);
  return p.toString();
}

/** Adds the current filters to a link, so moving between reports keeps the period, comparison and branch. */
export const withFilters = (href: string, f: ReportFilters) => `${href}${href.includes("?") ? "&" : "?"}${filtersToQuery(f)}`;

export function useReportFilters() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const range: PeriodRange = useMemo(() => periodRange(filters.period), [filters.period]);
  const update = useCallback((patch: Partial<ReportFilters>) => {
    const next = { ...filters, ...patch };
    const query = new URLSearchParams(params.toString());
    for (const k of ["period", "from", "to", "compare", "cfrom", "cto", "branch"]) query.delete(k);
    for (const [k, v] of new URLSearchParams(filtersToQuery(next))) query.set(k, v);
    router.replace(`${path}?${query.toString()}`, { scroll: false });
  }, [filters, params, path, router]);
  return { filters, range, update, query: filtersToQuery(filters) };
}
