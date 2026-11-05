"use client";

import { useState } from "react";
import { CalendarRange, ClipboardCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDmPrepareBatch, useDmPrepareRequest, useDmRejectBatch, useDmRejectRequest, useDmRequests } from "@/lib/api/hooks";
import type { DmBatchResult, DmBusinessRequest } from "@/lib/api";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { errorText } from "./common";

export function BusinessRequestQueue({
  tenantId,
  canPreview,
  canReject,
}: {
  tenantId?: string;
  canPreview: boolean;
  canReject: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const requests = useDmRequests(page, tenantId);
  const prepare = useDmPrepareRequest();
  const reject = useDmRejectRequest();
  const prepareBatch = useDmPrepareBatch();
  const rejectBatch = useDmRejectBatch();
  const [batchResults, setBatchResults] = useState<{ tenant: string; results: DmBatchResult[] } | null>(null);
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function prepareRequest(id: string) {
    setActiveId(id);
    setError(null);
    try {
      const result = await prepare.mutateAsync(id);
      router.push(`/data-management/operations/${result.data.operation.id}`);
    } catch (caught) {
      setError(errorText(caught));
      setActiveId(null);
    }
  }

  async function prepareWholeBatch(batchId: string, tenant: string) {
    setError(null);
    try {
      const done = await prepareBatch.mutateAsync(batchId);
      setBatchResults({ tenant, results: done.data.results });
    } catch (caught) { setError(errorText(caught)); }
  }

  async function declineWholeBatch(batchId: string) {
    setError(null);
    try {
      await rejectBatch.mutateAsync({ batchId, note: note.trim() });
      setActiveBatch(null);
      setNote("");
    } catch (caught) { setError(errorText(caught)); }
  }

  async function declineRequest(id: string) {
    setActiveId(id);
    setError(null);
    try {
      await reject.mutateAsync({ id, note: note.trim() });
      setActiveId(null);
      setNote("");
    } catch (caught) {
      setError(errorText(caught));
      setActiveId(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-labelledby="owner-requests-title">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="owner-requests-title" className="pesaa-card-title">Business owner requests</h2>
          <p className="mt-0.5 text-[12px] text-muted">Requests are review-only. Preparing a request checks eligibility; it does not delete records.</p>
        </div>
        {requests.data && <Badge tone={requests.data.total ? "amber" : "slate"} dot>{requests.data.total} pending</Badge>}
      </header>
      {error && <ErrorState message={error} />}
      {batchResults && (
        <div role="status" className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-[13px]">
          <p className="font-semibold">Previews prepared for {batchResults.tenant}. Nothing was deleted. Open each to request approval.</p>
          <ul className="divide-y divide-border">{batchResults.results.map((r) => (
            <li key={r.request_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="font-medium capitalize">{r.module.replaceAll("_", " ")}</span>
              {r.operation ? <Link href={`/data-management/operations/${r.operation.id}`} className="font-semibold text-accent hover:underline">{r.operation.summary.eligible.toLocaleString()} of {r.operation.summary.selected.toLocaleString()} can be removed · {r.operation.reference}</Link>
                : r.empty ? <span className="text-muted">{r.message}: request closed</span> : <span className="text-red-600">{r.error}</span>}
            </li>))}</ul>
          <Button size="sm" variant="secondary" onClick={() => setBatchResults(null)}>Dismiss</Button>
        </div>
      )}
      {requests.isLoading && <PageLoader variant="compact" />}
      {requests.error && <ErrorState message={errorText(requests.error)} onRetry={() => void requests.refetch()} />}
      {requests.data?.items.length === 0 && <EmptyState title="No pending owner requests" description="New date-bounded review requests from businesses will appear here." />}
      {requests.data && requests.data.items.length > 0 && (
        <ul className="divide-y divide-border">
          {groupRequests(requests.data.items).map((group) => (
            <li key={group.batchId ?? group.items[0].id} className="py-1">
              {group.batchId && (
                <div className="my-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
                  <p className="text-[13px]"><strong>Period request</strong> · {group.items[0].tenant_name} · {group.items.length} modules · {group.items[0].filters.from} – {group.items[0].filters.to}
                    <span className="block text-[12px] text-muted">One reason for all: {group.items[0].reason}</span></p>
                  <div className="flex flex-wrap items-start gap-2">
                    {canPreview && <Button size="sm" disabled={prepareBatch.isPending || rejectBatch.isPending} onClick={() => void prepareWholeBatch(group.batchId!, group.items[0].tenant_name)}><ClipboardCheck size={14} />{prepareBatch.isPending ? "Preparing…" : `Review & preview all ${group.items.length}`}</Button>}
                    {canReject && (activeBatch === group.batchId ? (
                      <div className="flex w-full flex-col gap-2 sm:w-72">
                        <Textarea aria-label="Reason for declining the whole period request" rows={2} minLength={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why is the whole request declined?" />
                        <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => { setActiveBatch(null); setNote(""); }}>Cancel</Button>
                          <Button variant="destructive" size="sm" disabled={rejectBatch.isPending || note.trim().length < 3} onClick={() => void declineWholeBatch(group.batchId!)}><XCircle size={14} />Decline all</Button></div>
                      </div>
                    ) : <Button variant="secondary" size="sm" onClick={() => { setActiveBatch(group.batchId); setActiveId(null); setError(null); }}><XCircle size={14} />Decline all</Button>)}
                  </div>
                </div>
              )}
              <ul className="divide-y divide-border">
                {group.items.map((item) => {

            const mutating = prepare.isPending || reject.isPending;
            const busy = activeId === item.id && mutating;
            return (
              <li key={item.id} className="grid gap-3 py-3 first:pt-1 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.tenant_name}</span>
                    <Badge tone="slate">{item.module.replaceAll("_", " ")}</Badge>
                    <span className="text-[12px] text-muted">by {item.requested_by ?? "Business owner"}</span>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted"><CalendarRange size={14} />{item.filters.from} – {item.filters.to} · {item.filters.date_type} date · submitted <time dateTime={item.created_at}>{item.created_at.slice(0, 10)}</time></p>
                  <p className="text-[13px] leading-relaxed">{item.reason}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                  {canPreview && <Button size="sm" disabled={mutating} onClick={() => void prepareRequest(item.id)}><ClipboardCheck size={14} />{busy && prepare.isPending ? "Preparing…" : "Review & preview"}</Button>}
                  {canReject && (activeId === item.id ? (
                    <div className="flex w-full flex-col gap-2 sm:w-72">
                      <Textarea aria-label="Reason for declining this request" rows={2} minLength={3} maxLength={1000} value={note} disabled={mutating} onChange={(event) => setNote(event.target.value)} placeholder="Explain why this request is declined (at least 3 characters)." />
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" disabled={mutating} onClick={() => { setActiveId(null); setNote(""); }}>Cancel</Button>
                        <Button variant="destructive" size="sm" disabled={busy || note.trim().length < 3} onClick={() => void declineRequest(item.id)}><XCircle size={14} />{reject.isPending ? "Declining…" : "Confirm decline"}</Button>
                      </div>
                    </div>
                  ) : <Button variant="secondary" size="sm" disabled={mutating} onClick={() => { setActiveId(item.id); setError(null); }}><XCircle size={14} />Decline</Button>)}
                </div>
              </li>
            );
          })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {requests.data && <Pagination page={page} pageSize={20} total={requests.data.total} onPage={setPage} noun="request" />}
    </section>
  );
}

/** Requests asked for together stay together, in the order the first of each batch appeared; single requests stand alone. */
function groupRequests(items: DmBusinessRequest[]): { batchId: string | null; items: DmBusinessRequest[] }[] {
  const groups: { batchId: string | null; items: DmBusinessRequest[] }[] = [];
  const byBatch = new Map<string, { batchId: string | null; items: DmBusinessRequest[] }>();
  for (const item of items) {
    if (!item.batch_id) { groups.push({ batchId: null, items: [item] }); continue; }
    let group = byBatch.get(item.batch_id);
    if (!group) { group = { batchId: item.batch_id, items: [] }; byBatch.set(item.batch_id, group); groups.push(group); }
    group.items.push(item);
  }
  return groups;
}
