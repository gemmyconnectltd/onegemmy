"use client";

import { Field, Input, Select } from "@/components/ui/Form";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
import { useMyBranches } from "@/lib/api/hooks";
import type { CompareMode } from "@/lib/api/reports";
import { periodLabel, toISODate } from "@/lib/period";
import type { ReportFilters } from "@/lib/reportFilters";

const COMPARE: { value: CompareMode; label: string }[] = [
  { value: "none", label: "No comparison" }, { value: "previous", label: "Previous period" },
  { value: "year", label: "Same period last year" }, { value: "custom", label: "Custom period" },
];

/** The one filter bar for every report: period, comparison and branch. The choice is kept in the address and carried between reports. */
export function ReportFilterBar({ filters, update, range, hideCompare }: { filters: ReportFilters; update: (patch: Partial<ReportFilters>) => void; range?: { from?: string; to?: string }; hideCompare?: boolean }) {
  const branches = useMyBranches();
  const list = branches.data?.items ?? [];
  const today = toISODate(new Date());
  const badCompare = filters.compare === "custom" && !!filters.compareFrom && !!filters.compareTo && filters.compareFrom > filters.compareTo;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodFilter value={filters.period} onChange={(period) => update({ period })} label="Period" clearable={false} />
        {!hideCompare && <Select aria-label="Compare with" value={filters.compare} onChange={(e) => update({ compare: e.target.value as CompareMode })} className="w-auto">
          {COMPARE.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>}
        {list.length > 1 && (
          <Select aria-label="Branch" value={filters.branch ?? ""} onChange={(e) => update({ branch: e.target.value || undefined })} className="w-auto">
            <option value="">All branches</option>
            {list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
      </div>
      {filters.compare === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Compare from"><Input type="date" max={today} value={filters.compareFrom ?? ""} onChange={(e) => update({ compareFrom: e.target.value || undefined })} /></Field>
          <Field label="Compare to"><Input type="date" max={today} min={filters.compareFrom} value={filters.compareTo ?? ""} onChange={(e) => update({ compareTo: e.target.value || undefined })} /></Field>
          {badCompare && <p role="alert" className="pb-2 text-[12px] font-medium text-red-600">The start date can&apos;t be after the end date.</p>}
        </div>
      )}
      <p className="text-[12px] text-muted">Showing <strong className="text-foreground">{periodLabel(filters.period)}</strong>{range?.from && range?.to && filters.period.key !== "custom" ? ` (${range.from} to ${range.to})` : ""}. Dates follow your business timezone.</p>
    </div>
  );
}
