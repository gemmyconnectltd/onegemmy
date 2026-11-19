"use client";

import Link from "next/link";
import { useState } from "react";
import { useFeatureChanges } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { Badge, type Tone } from "@/components/ui/Badge";
import { DataCard, Pagination, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";

const PAGE_SIZE = 25;

const KIND: Record<string, { label: string; tone: Tone }> = {
  "feature.deactivate": { label: "Switched off", tone: "red" },
  "feature.activate": { label: "Switched on", tone: "green" },
  "feature.update": { label: "Edited", tone: "slate" },
  "tenant.feature_item.restrict": { label: "Restricted", tone: "amber" },
  "tenant.feature_item.restore": { label: "Restored", tone: "green" },
  "tenant.features.update": { label: "Module access", tone: "blue" },
  "tenant.features.reset": { label: "Restrictions cleared", tone: "blue" },
};

/** Every change to modules and their parts, platform-wide and per business, newest first. Read-only: the audit log can't be edited. */
export default function FeatureChangesPage() {
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState("all");
  const query = useFeatureChanges(page, PAGE_SIZE, scope);
  const rows = query.data?.items ?? [];

  return <div className="space-y-5">
    <PageHeader title="Change log" subtitle="Who switched what, for whom, and why. Entries are saved when the change is made and cannot be edited." />
    <div className="flex flex-wrap gap-2">
      <Select aria-label="Scope" value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }} className="w-auto">
        <option value="all">All changes</option><option value="platform">Every business (platform)</option><option value="business">One business</option>
      </Select>
    </div>
    {query.isLoading ? <PageLoader variant="compact" /> : query.isError ? <ErrorState message="Could not load the change log." onRetry={() => void query.refetch()} />
      : rows.length === 0 ? <EmptyState title="No changes yet" description="Switching modules or parts on or off, and restricting them for a business, will appear here." />
      : <>
        <DataCard label="Feature changes">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead><tr className="border-b border-border">
              <th scope="col" className={thClass}>When</th><th scope="col" className={thClass}>Change</th><th scope="col" className={thClass}>What</th>
              <th scope="col" className={thClass}>Who for</th><th scope="col" className={thClass}>By</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{rows.map((c) => {
              const kind = KIND[c.action] ?? { label: c.action, tone: "slate" as Tone };
              return <tr key={c.id} className="align-top hover:bg-surface/50">
                <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted">{c.at ? fmtDateTime(c.at) : "—"}</td>
                <td className="px-4 py-3"><Badge tone={kind.tone} dot>{kind.label}</Badge></td>
                <td className="px-4 py-3"><p>{c.summary}</p>{c.target && <p className="font-mono text-[11px] text-muted">{c.target}</p>}</td>
                <td className="px-4 py-3">{c.tenant_id ? <Link href={`/features/access?tenant=${c.tenant_id}`} className="font-medium hover:text-accent">{c.tenant_name ?? "A business"}</Link> : <span className="text-muted">Every business</span>}</td>
                <td className="px-4 py-3 text-muted">{c.actor ?? "Unknown"}</td>
              </tr>;
            })}</tbody>
          </table>
        </DataCard>
        <Pagination page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} noun="change" />
      </>}
  </div>;
}
