"use client";

import { useState } from "react";
import { CalendarRange, ClipboardCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDmPrepareRequest, useDmRejectRequest, useDmRequests } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { errorText } from "./common";

export function BusinessRequestQueue({
  tenantId,
  module,
  fromDate,
  toDate,
  canPreview,
  canReject,
}: {
  tenantId?: string;
  module?: string;
  fromDate?: string;
  toDate?: string;
  canPreview: boolean;
  canReject: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const requests = useDmRequests({ page, tenant_id: tenantId, module, from_date: fromDate, to_date: toDate });
  const prepare = useDmPrepareRequest();
  const reject = useDmRejectRequest();
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
      {requests.isLoading && <PageLoader variant="compact" />}
      {requests.error && <ErrorState message={errorText(requests.error)} onRetry={() => void requests.refetch()} />}
      {requests.data?.items.length === 0 && <p className="py-2 text-[12.5px] text-muted">No pending owner requests{requests.data.total === 0 ? "." : " on this page."}</p>}
      {requests.data && requests.data.items.length > 0 && (
        <ul className="divide-y divide-border">
          {requests.data.items.map((item) => {
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
      )}
      {requests.data && <Pagination page={page} pageSize={20} total={requests.data.total} onPage={setPage} noun="request" />}
    </section>
  );
}
