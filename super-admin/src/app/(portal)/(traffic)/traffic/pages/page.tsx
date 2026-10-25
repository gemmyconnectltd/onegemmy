"use client";

import { Suspense, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useTrafficPages } from "@/lib/api/hooks";
import { formatFull, formatPct } from "@/lib/adminAnalytics";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { DataCard, Pagination, SearchBox, SortHeader, usePaged } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { BackLink, downloadCsv } from "@/components/traffic/shared";

type SortKey = "path" | "visitors" | "views" | "signups" | "paying" | "conversionRate";
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "visitors", label: "Visitors" }, { key: "views", label: "Page views" }, { key: "signups", label: "Signups" },
  { key: "paying", label: "Paying" }, { key: "conversionRate", label: "Conversion" },
];

function PagesDetail() {
  const period = usePeriod();
  const { data, isLoading, isError, refetch } = useTrafficPages(period.range, { enabled: period.valid });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "visitors", dir: "desc" });

  const rows = useMemo(() => {
    const filtered = (data?.pages ?? []).filter((p) => p.path.toLowerCase().includes(q.trim().toLowerCase()));
    const m = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => (sort.key === "path" ? a.path.localeCompare(b.path) : a[sort.key] - b[sort.key]) * m || a.path.localeCompare(b.path));
  }, [data, q, sort]);
  const paged = usePaged(rows, 25, `${q}|${sort.key}|${sort.dir}|${period.query}`);
  const toggle = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!rows.length} onClick={() => data && downloadCsv(`traffic-pages-${data.period.from}_${data.period.to}.csv`, [
        ["Page", "Visitors", "Page views", "Signups", "Paying customers", "Conversion rate (%)"],
        ...rows.map((p) => [p.path, p.visitors, p.views, p.signups, p.paying, p.conversionRate]),
      ])}><Download size={14} aria-hidden /> Export</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load pages." onRetry={() => void refetch()} />;
  else if (data.pages.length === 0) body = <div className="rounded-xl border border-border bg-card"><EmptyState title="No page views in this period" description="Pages appear once the website tracker records visits." /></div>;
  else body = (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search pages" />
      <DataCard label="All pages">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr>
            <SortHeader label="Page" active={sort.key === "path"} dir={sort.dir} onClick={() => toggle("path")} />
            {COLUMNS.map((col) => <SortHeader key={col.key} label={col.label} active={sort.key === col.key} dir={sort.dir} onClick={() => toggle(col.key)} className="text-right" />)}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {paged.slice.map((p) => (
              <tr key={p.path}>
                <td className="max-w-[320px] truncate px-4 py-3 font-medium" title={p.path}>{p.path}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatFull(p.visitors)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatFull(p.views)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatFull(p.signups)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatFull(p.paying)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPct(p.conversionRate)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">No pages match &ldquo;{q}&rdquo;.</td></tr>}
          </tbody>
        </table>
      </DataCard>
      <Pagination page={paged.page} pageSize={25} total={rows.length} onPage={paged.setPage} noun="page" />
      <p className="px-1 text-[11px] text-muted">
        Visitors are unique per page; page views count every load. Signups and paying customers are credited to the first page a visitor landed on, so only landing pages carry them.
        {data.truncated && " Showing the 500 busiest pages."}
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink />} title="Top Pages" subtitle="Every tracked page, with the signups it brought in." actions={actions} />
      {body}
    </div>
  );
}

export default function TrafficPagesPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><PagesDetail /></Suspense>;
}
