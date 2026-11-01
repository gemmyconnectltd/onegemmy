"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import type { FilterValue } from "@/lib/api/admin";
import { countryInfo } from "@/lib/countries";
import { cn } from "@/lib/utils";

export const distributionLabel = (value: string) => value === "__unspecified__" ? "Unspecified" : value;
export function DistributionPanel({ dimension, rows, selected, loading, failed, refreshing, onSelect, onRefresh }: {
  dimension: "industry" | "country"; rows: FilterValue[]; selected: string;
  loading: boolean; failed: boolean; refreshing: boolean;
  onSelect: (value: string) => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const visible = rows.filter(row => distributionLabel(row.value).toLowerCase().includes(search.trim().toLowerCase()));
  return <section id="tenant-distribution" aria-labelledby="distribution-heading" aria-busy={refreshing} className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto"><h2 id="distribution-heading" className="pesaa-card-title">Businesses by {dimension}</h2>
        <p className="text-xs text-muted">{loading || failed ? "Platform distribution" : `${total.toLocaleString()} businesses`} · All non-archived businesses, including unspecified values</p></div>
      {selected && <Button variant="ghost" size="sm" onClick={() => onSelect("")}>Clear Filter</Button>}
      <Button variant="outline" size="sm" disabled={refreshing} onClick={onRefresh}>{refreshing ? "Refreshing…" : "Refresh"}</Button>
    </div>
    {loading ? <PageLoader variant="compact" /> : failed ? <p role="alert" className="text-sm text-muted">Unable to load analytics. Use Refresh to retry.</p> : total === 0 ? <p className="text-sm text-muted">No available business data.</p> : <>
      {rows.length > 8 && <Input aria-label={`Search ${dimension}`} placeholder={`Search ${dimension}`} value={search} onChange={event => setSearch(event.target.value)} />}
      <ul className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(row => {
          const percent = row.count / total * 100;
          const country = dimension === "country" ? countryInfo(row.value) : null;
          const active = selected.trim().toLowerCase() === row.value.toLowerCase();
          return <li key={row.value}><button type="button" aria-pressed={active} onClick={() => onSelect(row.value)} className={cn("w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", active ? "border-accent bg-accent/10" : "border-border hover:bg-surface")}>
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {country && <span aria-hidden>{String.fromCodePoint(...country.code.toUpperCase().split("").map(letter => 127397 + letter.charCodeAt(0)))}</span>}
              <span className="min-w-0 flex-1 break-words font-medium">{distributionLabel(row.value)}</span>
              {row.value === rows[0]?.value && <span className="text-xs text-accent">Leading</span>}
              <span className="text-xs tabular-nums">{row.count.toLocaleString()} · {percent.toFixed(1)}%</span>
            </span>
            <span aria-hidden className="mt-2 block h-1 rounded-full bg-surface"><span className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} /></span>
          </button></li>;
        })}
      </ul>
      {visible.length === 0 && <p role="status" className="text-sm text-muted">No matching categories.</p>}
    </>}
  </section>;
}
