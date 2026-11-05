"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OP_LABEL, type DmHistoryFilters, type DmOperation, type DmStatus } from "@/lib/api";
import { useDmHistory, useDmMe } from "@/lib/api/hooks";
import { Pagination, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { errorText, StatusBadge, STATUS_LABEL } from "./common";

export function History({ tenantId }: { tenantId?: string }) {
  const me = useDmMe().data;
  const [page, setPage] = useState(1);
  const [f, setF] = useState<DmHistoryFilters>({ tenant_id: tenantId });
  const q = useDmHistory(page, f);
  const set = (patch: DmHistoryFilters) => { setPage(1); setF({ ...f, ...patch }); };
  if (me && !me.permissions.includes("data:history")) return <EmptyState title="You do not have access to Operation History" description="Ask a platform administrator for the View operation history permission." />;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Link href={tenantId ? `/data-management?tenant=${tenantId}` : "/data-management"} aria-label="Back to Data Management" className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground"><ArrowLeft size={16} /></Link>
        <div><h1 className="pesaa-page-title">Operation history</h1><p className="mt-0.5 text-sm text-muted">Every operation that was requested, who approved it, and what it did. It cannot be edited or deleted.</p></div>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        <label className="text-[11px] font-medium text-muted">Operation<Select aria-label="Operation" className="mt-0.5 w-auto" value={f.operation ?? ""} onChange={(e) => set({ operation: e.target.value || undefined })}><option value="">All</option>{(Object.keys(OP_LABEL) as DmOperation[]).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</Select></label>
        <label className="text-[11px] font-medium text-muted">Status<Select aria-label="Status" className="mt-0.5 w-auto" value={f.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })}><option value="">All</option>{(Object.keys(STATUS_LABEL) as DmStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></label>
        <label className="text-[11px] font-medium text-muted">Module<Input aria-label="Module" className="mt-0.5 w-36" value={f.module ?? ""} onChange={(e) => set({ module: e.target.value || undefined })} placeholder="e.g. sales" /></label>
        <label className="text-[11px] font-medium text-muted">From<Input type="date" className="mt-0.5 w-auto" value={f.from_date ?? ""} onChange={(e) => set({ from_date: e.target.value || undefined })} /></label>
        <label className="text-[11px] font-medium text-muted">To<Input type="date" className="mt-0.5 w-auto" value={f.to_date ?? ""} onChange={(e) => set({ to_date: e.target.value || undefined })} /></label>
        <label className="flex items-center gap-1.5 pb-2 text-[12.5px]"><input type="checkbox" checked={!!f.include_drafts} onChange={(e) => set({ include_drafts: e.target.checked })} /> Include previews that were never submitted</label>
      </div>
      {q.isLoading && <PageLoader />}
      {q.error && <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState title="No operations yet" description="Operations appear here once they are submitted." />}
      {q.data && q.data.items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card"><TableScroll label="Operations"><table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="border-b border-border bg-surface/60"><tr>{["Operation", "Business", "Module", "Type", "Requested by", "Approved by", "Date", "Selected", "Affected", "Status"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{q.data.items.map((o) => (
            <tr key={o.id} className="hover:bg-surface/50">
              <td className="px-4 py-2.5 font-mono"><Link href={`/data-management/operations/${o.id}`} className="font-semibold text-accent hover:underline">{o.reference}</Link></td>
              <td className="px-4 py-2.5">{o.tenant_name}</td><td className="px-4 py-2.5 capitalize">{o.module.replace("_", " ")}</td><td className="px-4 py-2.5">{OP_LABEL[o.operation]}</td>
              <td className="px-4 py-2.5">{o.requested_by ?? "—"}</td><td className="px-4 py-2.5">{o.decided_by ?? (o.approval_required ? "—" : "Not required")}</td>
              <td className="whitespace-nowrap px-4 py-2.5">{new Date(o.created_at).toLocaleString()}</td><td className="px-4 py-2.5 tabular-nums">{o.selected.toLocaleString()}</td><td className="px-4 py-2.5 tabular-nums">{o.affected.toLocaleString()}</td>
              <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td></tr>))}</tbody>
        </table></TableScroll></div>
      )}
      {q.data && <Pagination page={page} pageSize={25} total={q.data.total} onPage={setPage} noun="operation" />}
    </div>
  );
}
