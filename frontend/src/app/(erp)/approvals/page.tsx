"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { Pagination } from "@/components/ui/Pagination";
import { KIND_LABEL, type ApprovalRequest, type ApprovalStatus } from "@/lib/api/approvals";
import { useApprovalSummary, useApprovals, useCancelApproval, useDecideApproval, useMyBranches } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

const TABS: { key: ApprovalStatus | "all"; label: string }[] = [{ key: "pending", label: "Waiting" }, { key: "approved", label: "Approved" }, { key: "rejected", label: "Rejected" }, { key: "all", label: "All" }];
const TONE: Record<ApprovalStatus, string> = { pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400", approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", rejected: "bg-red-500/10 text-red-700 dark:text-red-400", cancelled: "bg-surface text-muted border border-border" };

const num = (v: unknown) => (typeof v === "number" || typeof v === "string" ? Number(v).toLocaleString() : "—");

function Change({ r }: { r: ApprovalRequest }) {
  const p = r.payload;
  if (r.kind === "price_change") return <span className="inline-flex items-center gap-1.5 font-semibold">{num(p.old_price)} <ArrowRight size={13} aria-hidden /> {num(p.new_price)}</span>;
  if (r.kind === "stock_adjustment") return <span className="inline-flex items-center gap-1.5 font-semibold">{num(p.old_stock)} <ArrowRight size={13} aria-hidden /> {num(p.new_stock)} <span className="font-normal text-muted">({Number(p.difference) > 0 ? "+" : ""}{num(p.difference)})</span></span>;
  if (r.kind === "debt_over_limit") return <span>Client owes <strong>{num(p.currently_owed)}</strong>, limit <strong>{num(p.limit)}</strong>, new debt <strong>{num(p.amount)}</strong></span>;
  return null;
}

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ApprovalStatus | "all">("pending");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const summary = useApprovalSummary().data;
  const q = useApprovals(page, { status: tab === "all" ? undefined : tab, kind: kind || undefined });
  const branches = useMyBranches().data?.items ?? [];
  const decide = useDecideApproval();
  const cancel = useCancelApproval();
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name;
  const fail = (e: unknown) => setProblem((e as { detail?: string })?.detail ?? (e as Error)?.message ?? "That didn't work. Try again.");
  const act = (id: string, approve: boolean) => {
    setProblem(null);
    decide.mutate({ id, approve, note: note.trim() || undefined }, { onSuccess: () => { setRejecting(null); setNote(""); }, onError: fail });
  };

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="pesaa-page-title text-foreground">Approvals</h1>
        <p className="mt-0.5 text-sm text-muted">{summary?.can_decide ? "Requests from your team that need your decision." : "Requests you have sent and where they stand."}{summary?.credit_awaiting ? ` ${summary.credit_awaiting} credit sale(s) are waiting on the Sales page.` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Request status" className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setPage(1); }} className={cn("rounded-md px-3 py-1.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-accent", tab === t.key ? "bg-accent text-white" : "text-muted hover:text-foreground")}>{t.label}{t.key === "pending" && summary?.pending ? ` (${summary.pending})` : ""}</button>)}
        </div>
        <Select aria-label="Kind of request" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className="w-auto">
          <option value="">All kinds</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      {problem && <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-700 dark:text-red-400"><AlertTriangle size={14} aria-hidden />{problem}</p>}
      {q.isLoading ? <PageLoader variant="compact" /> : q.isError ? (
        <p role="alert" className="rounded-xl border border-border bg-card py-10 text-center text-sm text-red-600">{(q.error as { detail?: string } | null)?.detail ?? "The requests could not be loaded."} <button className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></p>
      ) : (q.data?.items.length ?? 0) === 0 ? (
        <p className="rounded-xl border border-border bg-card py-14 text-center text-sm text-muted">{tab === "pending" ? "Nothing is waiting for a decision." : "No requests here."}</p>
      ) : (
        <ul className="space-y-3">
          {q.data!.items.map((r) => {
            const mine = r.requested_by_id === user?.id;
            return (
              <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{KIND_LABEL[r.kind]}</span><span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", TONE[r.status])}>{r.status === "pending" ? <Clock size={11} /> : r.status === "approved" ? <CheckCircle2 size={11} /> : <XCircle size={11} />}{r.status}</span></div>
                    <p className="mt-1 text-sm font-semibold text-foreground">{r.title}</p>
                    <p className="mt-0.5 text-[13px] text-foreground"><Change r={r} /></p>
                    {r.reason && <p className="mt-1 text-[13px] text-muted">&ldquo;{r.reason}&rdquo;</p>}
                    <p className="mt-1.5 text-[12px] text-muted">Asked by {r.requested_by ?? "someone"}{branchName(r.branch_id) ? ` · ${branchName(r.branch_id)}` : ""} · {r.requested_at ? fmtDateTime(r.requested_at) : ""}</p>
                    {r.status !== "pending" && <p className="mt-1 text-[12px] text-muted">{r.status === "cancelled" ? "Withdrawn" : `Decided by ${r.decided_by ?? "someone"}`}{r.decided_at ? ` · ${fmtDateTime(r.decided_at)}` : ""}{r.decision_note ? ` · "${r.decision_note}"` : ""}</p>}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {summary?.can_decide && !mine && <><Button size="sm" disabled={decide.isPending} onClick={() => act(r.id, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => { setRejecting(rejecting === r.id ? null : r.id); setNote(""); }}>Reject</Button></>}
                      {mine && <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id, { onError: fail })}>Withdraw</Button>}
                    </div>
                  )}
                </div>
                {rejecting === r.id && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <Textarea aria-label="Why it is rejected" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say why, so they know what to change" />
                    <div className="flex gap-2"><Button size="sm" variant="destructive" disabled={!note.trim() || decide.isPending} onClick={() => act(r.id, false)}>Confirm rejection</Button><Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button></div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(q.data?.total ?? 0) > 25 && <Pagination page={page} pageSize={25} total={q.data?.total ?? 0} onPageChange={setPage} itemLabel="requests" />}
    </div>
  );
}
