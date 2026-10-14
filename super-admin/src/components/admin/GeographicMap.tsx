"use client";

import { countryInfo } from "@/lib/countries";
import paths from "./worldPaths.json";
import type { CountryRow } from "./CountriesAnalytics";

// Boundary source: Natural Earth, public domain, 1:110m admin-0 countries.
// https://www.naturalearthdata.com/about/terms-of-use/
export default function GeographicMap({ rows, metric }: { rows: CountryRow[]; metric: "users" | "businesses" }) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = countryInfo(row.name)?.code;
    if (code) counts.set(code, (counts.get(code) ?? 0) + row[metric]);
  }
  const values = [...counts.values()].filter((value) => value > 0);
  const max = Math.max(0, ...values);
  const min = values.length ? Math.min(...values) : 0;
  return (
    <div className="flex h-full min-h-52 flex-col justify-between rounded-lg border border-border p-3">
      <svg viewBox="0 0 600 295" role="img" aria-label={`World map showing ${metric} by country`} className="my-auto w-full">
        {paths.map((country) => {
          const count = counts.get(country.code) ?? 0;
          const intensity = max === min ? 1 : (Math.log1p(count) - Math.log1p(min)) / (Math.log1p(max) - Math.log1p(min));
          const fill = count > 0 ? `hsl(156 65% ${82 - intensity * 47}%)` : "var(--color-border, #e2e8e8)";
          return (
            <path key={country.code} d={country.path} fill={fill} stroke="var(--color-card, white)" strokeWidth={0.6} className="transition-colors hover:brightness-90">
              <title>{country.name}: {count.toLocaleString()} {metric}</title>
            </path>
          );
        })}
      </svg>
      {max > 0 ? (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] tabular-nums text-foreground" aria-label={`Map scale: ${min} to ${max}`}>
          <span>{min}</span><span className="h-2 w-32 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-600" /><span>{max}</span>
        </div>
      ) : <p className="mt-2 text-center text-xs text-muted">No geographic data yet</p>}
    </div>
  );
}
