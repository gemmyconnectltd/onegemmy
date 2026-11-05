"use client";
import { useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { StockCountRead } from "@/lib/api";
import { useDecideCount, useStockCounts } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { TableScroll } from "@/components/ui/TableScroll";
import { TableState } from "@/components/ui/TableState";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NewCountDrawer } from "@/components/inventory/CountDrawers";

const TABS = ["All", "Submitted", "Approved", "Rejected"] as const;
const TONE: Record<string, string> = { Submitted: "bg-amber-100 text-amber-700", Approved: "bg-emerald-100 text-emerald-700", Rejected: "bg-red-100 text-red-700" };

export default function StockCountsPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<StockCountRead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const q = useStockCounts(page, tab === "All" ? undefined : tab);
  const decide = useDecideCount();
  const { confirm, dialog } = useConfirmDialog();
  const rows = q.data?.items ?? [];
  const canApprove = hasPermission("stock:approve");
  return (
    <div className="space-y-4">
      {dialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="pesaa-page-title">Stock counts</h1><p className="text-sm text-muted">Count what is really on the shelves. Differences change your stock only after someone with authority approves them.</p></div>
        {hasPermission("stock:create") && <Button onClick={() => setCreating(true)}><Plus size={15} aria-hidden /> New count</Button>}
      </header>
      {problem && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">{problem}</p>}
      <div role="tablist" aria-label="Count status" className="flex flex-wrap gap-1">{TABS.map((s) => <button key={s} role="tab" aria-selected={tab === s} onClick={() => { setTab(s); setPage(1); }} className={`h-8 rounded-md px-3 text-xs font-medium ${tab === s ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>{s}</button>)}</div>
      {q.isLoading || q.error || rows.length === 0 ? <TableState loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={rows.length === 0} filtered={tab !== "All"} onClearFilters={() => setTab("All")} title="No stock counts yet" hint="Start one to check a warehouse against the books." />
        : (
          <div className="space-y-3">{rows.map((c) => (
            <section key={c.id} className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <ClipboardCheck size={16} className="text-muted" aria-hidden />
                <div className="min-w-0 flex-1"><p className="font-semibold">{c.count_number} <span className="font-normal text-muted">· {c.warehouse}</span></p><p className="text-xs text-muted">{fmtDateTime(c.created_at)} · {c.lines.length} products · {c.variance_lines} with a difference{c.note ? ` · ${c.note}` : ""}</p></div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[c.status]}`}>{c.status}</span>
                <Button size="sm" variant="outline" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Hide" : "Review"}</Button>
                {c.status === "Submitted" && canApprove && <>
                  <Button size="sm" disabled={decide.isPending} onClick={() => confirm({ title: `Approve ${c.count_number}?`, message: `Stock in ${c.warehouse} will be changed to the counted quantities for ${c.variance_lines} product${c.variance_lines === 1 ? "" : "s"}. This is recorded in the stock history.`, confirmLabel: "Approve and apply", onConfirm: () => decide.mutate({ id: c.id, approve: true }, { onError: (e) => setProblem((e as { detail?: string })?.detail ?? e.message) }) })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(c)}>Reject</Button>
                </>}
              </div>
              {open === c.id && (
                <TableScroll mobileLayout="cards" label={`Lines of ${c.count_number}`}>
                  <table className="w-full min-w-[480px] border-t border-border text-left text-sm">
                    <thead className="text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Product</th><th className="px-4 py-2 text-right font-medium">Books</th><th className="px-4 py-2 text-right font-medium">Counted</th><th className="px-4 py-2 text-right font-medium">Difference</th></tr></thead>
                    <tbody className="divide-y divide-border">{c.lines.map((l) => <tr key={l.id}><td className="px-4 py-2">{l.product_name}</td><td className="px-4 py-2 text-right tabular-nums">{l.expected}</td><td className="px-4 py-2 text-right tabular-nums">{l.counted}</td><td className={`px-4 py-2 text-right font-semibold tabular-nums ${l.difference < 0 ? "text-red-600" : l.difference > 0 ? "text-emerald-700" : "text-muted"}`}>{l.difference > 0 ? "+" : ""}{l.difference}</td></tr>)}</tbody>
                  </table>
                  {c.decision_note && <p className="border-t border-border px-4 py-2 text-xs text-muted">Decision note: {c.decision_note}</p>}
                </TableScroll>
              )}
            </section>))}
            <Pagination page={page} pageSize={25} total={q.data?.total ?? 0} onPageChange={setPage} />
          </div>
        )}
      {creating && <NewCountDrawer onClose={() => setCreating(false)} />}
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} danger title={`Reject ${rejecting?.count_number ?? "count"}?`} message="Stock stays as it is. Say why, so the counter can recount." confirmLabel="Reject count"
        onConfirm={async (reason) => { if (rejecting) await decide.mutateAsync({ id: rejecting.id, approve: false, note: reason }); }} />
    </div>
  );
}
