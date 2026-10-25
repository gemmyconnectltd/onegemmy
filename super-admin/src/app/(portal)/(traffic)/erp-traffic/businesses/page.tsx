"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { useErpBusinesses } from "@/lib/api/hooks";
import type { ErpBusiness, ErpBusinessStatus } from "@/lib/api/admin";
import { formatChange, formatFull, humanizeKey } from "@/lib/adminAnalytics";
import { fmtRelative } from "@/lib/date";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Form";
import { DataCard, Pagination, SearchBox, SortHeader, usePaged } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PeriodSelect, usePeriod } from "@/components/traffic/usePeriod";
import { BackLink, downloadCsv } from "@/components/traffic/shared";

const STATUS: Record<ErpBusinessStatus, { label: string; tone: Tone }> = {
  growing: { label: "Growing", tone: "green" }, steady: { label: "Steady", tone: "blue" }, declining: { label: "Declining", tone: "amber" },
  new: { label: "Newly active", tone: "violet" }, quiet: { label: "Gone quiet", tone: "red" }, inactive: { label: "Never active", tone: "slate" },
};
type SortKey = "name" | "plan" | "users" | "sessions" | "views" | "changePct" | "lastActive";
const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "plan", label: "Plan" }, { key: "users", label: "Users", right: true }, { key: "sessions", label: "Sessions", right: true },
  { key: "views", label: "Page views", right: true }, { key: "changePct", label: "Change", right: true }, { key: "lastActive", label: "Last active" },
];

function value(b: ErpBusiness, key: SortKey): string | number {
  if (key === "changePct") return b.changePct ?? -Infinity;
  if (key === "lastActive") return b.lastActive ?? "";
  return b[key] as string | number;
}

function BusinessesDetail() {
  const period = usePeriod();
  const initial = useSearchParams().get("status");
  const { data, isLoading, isError, refetch } = useErpBusinesses(period.range, { enabled: period.valid });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(initial && initial in STATUS ? initial : "all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "views", dir: "desc" });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = (data?.businesses ?? []).filter((b) => (status === "all" || b.status === status) && (!term || b.name.toLowerCase().includes(term)));
    const m = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = value(a, sort.key), y = value(b, sort.key);
      return (typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y)) * m || a.name.localeCompare(b.name);
    });
  }, [data, q, status, sort]);
  const paged = usePaged(rows, 25, `${q}|${status}|${sort.key}|${sort.dir}|${period.query}`);
  const toggle = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const actions = (
    <>
      <PeriodSelect period={period} />
      <Button variant="secondary" disabled={!rows.length} onClick={() => data && downloadCsv(`erp-businesses-${data.period.from}_${data.period.to}.csv`, [
        ["Business", "Plan", "Status", "Active users", "Sessions", "Page views", "Previous page views", "Change (%)", "Last active"],
        ...rows.map((b) => [b.name, b.plan, STATUS[b.status].label, b.users, b.sessions, b.views, b.previousViews, b.changePct, b.lastActive]),
      ])}><Download size={14} aria-hidden /> Export</Button>
    </>
  );

  let body: React.ReactNode;
  if (!period.valid) body = <ErrorState message="Choose a start date that is on or before the end date, and no later than today." />;
  else if (isLoading) body = <PageLoader variant="page" />;
  else if (isError || !data) body = <ErrorState message="Could not load businesses." onRetry={() => void refetch()} />;
  else body = (
    <>
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search businesses" />
        <Select aria-label="Status" className="w-auto!" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses ({formatFull(data.businesses.length)})</option>
          {(Object.keys(STATUS) as ErpBusinessStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label} ({formatFull(data.counts[s] ?? 0)})</option>)}
        </Select>
      </div>
      {rows.length === 0 ? <div className="rounded-xl border border-border bg-card"><EmptyState title="No businesses match" description="Try another search or status." /></div> : (
        <DataCard label="Business activity">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead><tr>
              <SortHeader label="Business" active={sort.key === "name"} dir={sort.dir} onClick={() => toggle("name")} />
              {COLUMNS.map((col) => <SortHeader key={col.key} label={col.label} active={sort.key === col.key} dir={sort.dir} onClick={() => toggle(col.key)} className={col.right ? "text-right" : undefined} />)}
              <th className="px-4 py-3 text-xs font-semibold text-muted">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {paged.slice.map((b) => (
                <tr key={b.id}>
                  <td className="max-w-[240px] truncate px-4 py-3 font-medium"><Link href={`/tenants/${b.id}`} className="hover:text-accent hover:underline">{b.name}</Link></td>
                  <td className="px-4 py-3 capitalize text-muted">{humanizeKey(b.plan)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatFull(b.users)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatFull(b.sessions)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatFull(b.views)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{b.changePct === null ? "—" : formatChange(b.changePct)}</td>
                  <td className="px-4 py-3 text-muted">{b.lastActive ? fmtRelative(b.lastActive) : "Never"}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}
      <Pagination page={paged.page} pageSize={25} total={rows.length} onPage={paged.setPage} noun="business" />
      <p className="px-1 text-[11px] text-muted">
        Change compares page views with the previous period of the same length: growing or declining means a move of 20% or more; gone quiet means active before and silent now. Only active businesses are listed.
        {data.truncated && " Showing the first 1,000."}
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/erp-traffic" label="Back to ERP Traffic" />} title="Business Activity" subtitle="Which businesses are growing, steady, declining or have gone quiet." actions={actions} />
      {body}
    </div>
  );
}

export default function ErpBusinessesPage() {
  return <Suspense fallback={<PageLoader variant="page" />}><BusinessesDetail /></Suspense>;
}
