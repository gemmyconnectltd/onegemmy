"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PageLoader } from "@/components/ui/PageLoader";
import { ArrowRight, Globe2 } from "lucide-react";
import { DonutChart } from "@/components/charts/lazy";
import { countryInfo } from "@/lib/countries";
import { Flag, sharePct, type CountryRow } from "./CountriesAnalytics";

const GeographicMap = dynamic(() => import("./GeographicMap"), { loading: () => <PageLoader variant="compact" /> });

const CONTINENT_COLORS: Record<string, string> = {
  Africa: "#059669", Europe: "#2563eb", Asia: "#f59e0b", "North America": "#8b5cf6", "South America": "#ec4899",
  Oceania: "#06b6d4", Antarctica: "#94a3b8", Unassigned: "#cbd5e1",
};

/** The map and two at-a-glance panels of "Geographic Distribution": top countries by users, and users by continent. */
export function GeographicSummary({ rows, tooltipStyle }: { rows: CountryRow[]; tooltipStyle: React.CSSProperties }) {
  const [metric, setMetric] = useState<"users" | "businesses">("users");
  const label = metric === "users" ? "Users" : "Businesses";
  const total = useMemo(() => rows.reduce((s, r) => s + r[metric], 0), [rows, metric]);
  const known = useMemo(() => rows.filter((r) => r.name !== "Unknown").sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name)), [rows, metric]);
  const top = known.slice(0, 5);
  const max = Math.max(1, ...top.map((r) => r[metric]));

  const continents = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const c = r.name === "Unknown" ? "Unassigned" : countryInfo(r.name)?.continent ?? "Unassigned";
      m.set(c, (m.get(c) ?? 0) + r[metric]);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows, metric]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10"><Globe2 size={24} className="text-emerald-500" /></div>
          <div><h2 className="text-[15px] font-bold text-foreground">Geographic Distribution</h2><p className="text-xs text-muted">Where your users and businesses are located.</p></div>
        </div>
        <div className="flex items-center gap-5">
          <select aria-label="Geographic distribution metric" value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)} className="h-8 min-w-28 rounded-lg border border-border bg-card px-3 text-xs text-foreground"><option value="users">Users</option><option value="businesses">Businesses</option></select>
          <a href="#countries" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">View all countries <ArrowRight size={12} /></a>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
      <GeographicMap rows={rows} metric={metric} />
      <div className="rounded-xl border border-border bg-card p-3">
        <h3 className="mb-3 text-[13px] font-bold text-foreground">Top Countries by {label}</h3>
        {top.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted">No {metric} with a country yet</p>
        ) : (
          <ul className="space-y-1">
            {top.map((r) => (
              <li key={r.name}>
                <Link href={`/admin/tenants?country=${encodeURIComponent(r.name)}`} title={`View businesses in ${r.name}`}
                  className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface">
                  <Flag name={r.name} />
                  <span className="w-24 flex-shrink-0 truncate text-[12.5px] font-medium text-foreground group-hover:text-accent">{r.name}</span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-border/60">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (r[metric] / max) * 100)}%` }} />
                  </div>
                  <span className="w-10 flex-shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-foreground">{r[metric]}</span>
                  <span className="w-12 flex-shrink-0 text-right text-[11.5px] tabular-nums text-muted">{sharePct(r[metric], total).text}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {known.length > top.length && (
          <a href="#countries" className="mt-3 block rounded-lg bg-accent/5 py-2 text-center text-[12px] font-semibold text-accent transition-colors hover:bg-accent/10">
            +{known.length - top.length} more {known.length - top.length === 1 ? "country" : "countries"}
          </a>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <h3 className="mb-3 text-[13px] font-bold text-foreground">{label} by Continent</h3>
        {total === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted">No {metric} yet</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="relative h-40 w-40 flex-shrink-0">
              <DonutChart data={continents} colors={continents.map((c) => CONTINENT_COLORS[c.name] ?? "#64748b")} innerRadius={50} outerRadius={78} tooltipStyle={tooltipStyle} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-tight">
                <span className="text-[22px] font-bold tabular-nums text-foreground">{total.toLocaleString("en-US")}</span>
                <span className="text-[10.5px] text-muted">Total {metric}</span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {continents.map((c) => (
                <li key={c.name} className="flex items-center gap-2 text-[12.5px]">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: CONTINENT_COLORS[c.name] ?? "#64748b" }} />
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
                  <span className="font-semibold tabular-nums text-foreground">{c.value}</span>
                  <span className="w-11 text-right text-[11.5px] tabular-nums text-muted">{sharePct(c.value, total).text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
