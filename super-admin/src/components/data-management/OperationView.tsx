"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";
import { OP_LABEL, type DmAssessment, type DmOperationRecord } from "@/lib/api";
import { useDmCancel, useDmDecide, useDmExecute, useDmItems, useDmMe, useDmOperation, useDmSubmit } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, Notice } from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { thClass } from "@/components/ui/DataTable";
import { cn } from "@/lib/utils";
import { errorText, StatusBadge } from "./common";

const DESTRUCTIVE = ["delete", "clean_test"];
const when = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "—");
const Card = ({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "red" }) => (
  <section className={cn("space-y-3 rounded-xl border bg-card p-4", tone === "red" ? "border-red-500/30" : "border-border")}><h2 className="pesaa-card-title">{title}</h2>{children}</section>
);

export function OperationView({ id }: { id: string }) {
  const me = useDmMe().data;
  const q = useDmOperation(id);
  const op = q.data;
  if (q.isLoading) return <PageLoader />;
  if (q.error || !op) return <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link href={`/data-management?tenant=${op.tenant_id}`} aria-label="Back to the workspace" className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground"><ArrowLeft size={16} /></Link>
          <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{op.reference} · {op.tenant_name}</p>
            <h1 className="pesaa-page-title">{OP_LABEL[op.operation]}</h1>
            <p className="mt-0.5 text-sm text-muted capitalize">{op.module.replace("_", " ")} · {op.selected.toLocaleString()} selected</p></div>
        </div>
        <StatusBadge status={op.status} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Impact op={op} />
          {["Completed", "PartiallyCompleted", "Failed"].includes(op.status) && <Results op={op} />}
        </div>
        <div className="min-w-0 space-y-4 xl:self-start">
          <Actions op={op} meId={me?.id} perms={me?.permissions ?? []} />
          <Timeline op={op} />
        </div>
      </div>
    </div>
  );
}

function Impact({ op }: { op: DmOperationRecord }) {
  const a = op.analysis;
  if (!a) return null;
  if (op.operation === "reset") return <CloseImpact op={op} />;
  const eligible = a.assessments.filter((x) => x.eligible);
  const blocked = a.assessments.filter((x) => !x.eligible);
  return (
    <>
      <Card title="Impact analysis">
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[["Selected", a.summary.selected, ""], ["Eligible", a.summary.eligible, "text-emerald-700"], ["Blocked", a.summary.blocked, a.summary.blocked ? "text-red-600" : ""]].map(([k, v, c]) => (
            <div key={String(k)} className="rounded-lg bg-surface/60 p-3"><dt className="text-[11.5px] text-muted">{k}</dt><dd className={cn("text-xl font-bold tabular-nums", String(c))}>{Number(v).toLocaleString()}</dd></div>))}
        </dl>
        <p className="text-[12px] text-muted">Checked by the server against the business&apos;s current data. Eligible means every rule passed; it is checked again before anything runs.</p>
        {a.restrictions.map((r) => <Notice key={r} tone={DESTRUCTIVE.includes(op.operation) ? "red" : "blue"}>{r}</Notice>)}
        {Object.keys(a.related).length > 0 && <div className="text-[12.5px]"><p className="font-semibold">Records that go with them</p><ul className="mt-1 list-disc pl-5 text-muted">{Object.entries(a.related).map(([k, n]) => <li key={k}><span className="capitalize">{k}</span>: {n.toLocaleString()}</li>)}</ul></div>}
        {a.not_found && a.not_found.length > 0 && <Notice tone="amber">{a.not_found.length} selected record{a.not_found.length === 1 ? "" : "s"} do not belong to this business and were left out.</Notice>}
      </Card>
      {op.operation === "correct" && eligible[0] && <Card title="Before and after"><ChangeTable a={eligible[0]} /></Card>}
      {blocked.length > 0 && (
        <Card title={`Blocked (${blocked.length})`} tone="red">
          <p className="text-[12.5px] text-muted">These stay exactly as they are. Each says why, and what to do instead.</p>
          <ul className="divide-y divide-border">{blocked.map((b) => (
            <li key={b.id} className="space-y-1 py-2.5 text-[13px]"><p className="font-semibold">{b.label}</p>
              <ul className="list-disc pl-5 text-red-700 dark:text-red-400">{b.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              {b.alternative && <p className="flex items-start gap-1.5 text-muted"><Check size={13} className="mt-0.5 flex-shrink-0 text-emerald-600" /><span><strong>Instead:</strong> {b.alternative}</span></p>}</li>))}</ul>
        </Card>
      )}
      {eligible.length > 0 && op.operation !== "correct" && (
        <Card title={`Eligible (${a.summary.eligible.toLocaleString()})`}>
          <ul className="max-h-72 divide-y divide-border overflow-auto text-[13px]">{eligible.map((e) => <li key={e.id} className="py-1.5"><span className="font-medium">{e.label}</span>{e.notes.map((n) => <span key={n} className="block text-[12px] text-muted">{n}</span>)}{Object.entries(e.related).map(([k, n]) => <span key={k} className="block text-[12px] text-muted capitalize">+ {n} {k}</span>)}</li>)}</ul>
          {a.summary.eligible > (a.eligible_shown ?? eligible.length) && <p className="text-[12px] text-muted">Showing the first {a.eligible_shown}. All {a.summary.eligible.toLocaleString()} are in the plan.</p>}
        </Card>
      )}
    </>
  );
}

function ChangeTable({ a }: { a: DmAssessment }) {
  if (!a.changes.length) return <p className="text-sm text-muted">No changes.</p>;
  return <TableScroll label="Changes"><table className="w-full text-left text-[13px]"><thead><tr><th className={thClass}>Field</th><th className={thClass}>Now</th><th className={thClass}>Becomes</th></tr></thead>
    <tbody className="divide-y divide-border">{a.changes.map((c) => <tr key={c.field}><td className="px-4 py-2.5 font-medium capitalize">{c.field.replace("_", " ")}</td><td className="px-4 py-2.5 text-muted">{c.before == null || c.before === "" ? "—" : String(c.before)}</td><td className="px-4 py-2.5 font-semibold">{c.after == null || c.after === "" ? "—" : String(c.after)}</td></tr>)}</tbody></table></TableScroll>;
}

export function BalanceLists({ preview }: { preview: NonNullable<NonNullable<DmOperationRecord["analysis"]>["preview"]> }) {
  const cur = preview.currency;
  const money = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {([["Assets", "asset"], ["Liabilities", "liability"], ["Equity", "equity"]] as const).map(([label, key]) => (
          <div key={key} className="rounded-lg border border-border p-3"><p className="mb-1 text-[11.5px] font-semibold text-muted">{label}</p>
            {preview.balances[key].length === 0 ? <p className="text-[12.5px] text-muted">None</p> : <ul className="space-y-0.5 text-[12.5px]">{preview.balances[key].map((l) => <li key={l.code} className="flex justify-between gap-2"><span className="truncate">{l.name}</span><span className="tabular-nums">{money(l.balance)}</span></li>)}</ul>}</div>))}
      </div>
      <dl className="grid gap-2 text-[12.5px] sm:grid-cols-3">
        <div className="rounded-lg bg-surface/60 p-2.5"><dt className="text-muted">Result of the period</dt><dd className="font-semibold tabular-nums">{money(preview.period_result)}</dd></div>
        <div className="rounded-lg bg-surface/60 p-2.5"><dt className="text-muted">Customers owe (completed sales)</dt><dd className="font-semibold tabular-nums">{money(preview.customer_receivables)}</dd></div>
        <div className="rounded-lg bg-surface/60 p-2.5"><dt className="text-muted">Stock at cost (today)</dt><dd className="font-semibold tabular-nums">{money(preview.inventory_value)}</dd></div>
      </dl>
      <p className="text-[11.5px] text-muted">{preview.inventory_note} {preview.books_balanced ? "The books balance: debits equal credits." : "Warning: the books do not balance."}</p>
    </div>
  );
}

function CloseImpact({ op }: { op: DmOperationRecord }) {
  const p = op.analysis?.preview;
  if (!p) return null;
  return (
    <>
      <Card title={`Close the books through ${p.closing_date}`}>
        {op.analysis?.restrictions.map((r) => <Notice key={r} tone="blue">{r}</Notice>)}
        {p.locked_through && <p className="text-[12.5px] text-muted">Currently closed through {p.locked_through}.</p>}
        <BalanceLists preview={p} />
      </Card>
      {p.blockers.length > 0 ? (
        <Card title={`Settle first (${p.blockers.length})`} tone="red">
          <ul className="divide-y divide-border">{p.blockers.map((b) => <li key={b.what} className="py-2 text-[13px]"><p className="font-semibold">{b.count.toLocaleString()} × {b.what}</p><p className="text-[12.5px] text-muted">{b.fix}</p></li>)}</ul>
        </Card>
      ) : <Notice tone="blue">Nothing is blocking this close.</Notice>}
    </>
  );
}

function Actions({ op, meId, perms }: { op: DmOperationRecord; meId?: string; perms: string[] }) {
  const submit = useDmSubmit(), decide = useDmDecide(), execute = useDmExecute(), cancel = useDmCancel();
  const [reason, setReason] = useState("");
  const [attest, setAttest] = useState(false);
  const [note, setNote] = useState("");
  const [business, setBusiness] = useState("");
  const [reference, setReference] = useState("");
  const [key] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())));
  const [error, setError] = useState<string | null>(null);
  const mine = op.requested_by_id === meId;
  const has = (p: string) => perms.includes(p);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(errorText(e)); } };
  const typed = business.trim().toLowerCase() === op.tenant_name.trim().toLowerCase() && reference.trim().toUpperCase() === op.reference;
  const needsTyping = [...DESTRUCTIVE, "reset"].includes(op.operation);
  const [openedAt] = useState(() => Date.now());
  const expired = new Date(op.expires_at).getTime() < openedAt && ["Prepared", "PendingApproval", "Approved"].includes(op.status);

  return (
    <Card title="Next step">
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">{error}</p>}
      {expired && <Notice tone="amber">This plan has expired. Go back and preview again, so it reflects the data as it is now.</Notice>}
      {!expired && op.status === "Prepared" && (mine ? (
        has("data:request") ? (
          <div className="space-y-3">
            <Field label="Why is this needed?" required hint="At least 10 characters. It is kept in the business's audit trail."><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            {op.operation === "clean_test" && <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12.5px]"><input type="checkbox" className="mt-0.5" checked={attest} onChange={(e) => setAttest(e.target.checked)} /><span>I have reviewed these records and they are test data, not real business history.</span></label>}
            <Button className="w-full" disabled={submit.isPending || op.summary.eligible < 1 || reason.trim().length < 10 || (op.operation === "clean_test" && !attest)} onClick={() => run(() => submit.mutateAsync({ id: op.id, reason, attest }))}>
              {op.approval_required ? "Request approval" : "Confirm plan"}</Button>
            {op.summary.eligible < 1 && <p className="text-[12px] text-red-600">Nothing is eligible, so there is nothing to request.</p>}
            <p className="text-[11.5px] text-muted">{op.approval_required ? "A second administrator must approve this exact plan before it can run." : "No second approval is needed for this plan."}</p>
          </div>
        ) : <Notice tone="amber">You need the Request operations permission to continue.</Notice>
      ) : <p className="text-sm text-muted">Only the administrator who prepared this plan can continue it.</p>)}

      {!expired && op.status === "PendingApproval" && (
        mine ? <p className="flex items-start gap-2 text-sm"><Clock size={15} className="mt-0.5 flex-shrink-0 text-amber-600" /> Waiting for another administrator to approve. You cannot approve your own request.</p>
          : has("data:approve") ? (
            <div className="space-y-3"><p className="text-sm">{op.requested_by} asks to {OP_LABEL[op.operation].toLowerCase()} ({op.summary.eligible.toLocaleString()} eligible). Reason: <em>{op.reason}</em></p>
              <Field label="Note" hint="Required when rejecting."><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <div className="flex gap-2"><Button className="flex-1" disabled={decide.isPending} onClick={() => run(() => decide.mutateAsync({ id: op.id, approve: true, note }))}>Approve this plan</Button>
                <Button className="flex-1" variant="outline" disabled={decide.isPending || note.trim().length < 3} onClick={() => run(() => decide.mutateAsync({ id: op.id, approve: false, note }))}>Reject</Button></div></div>
          ) : <p className="text-sm text-muted">Waiting for an approver. You do not have the Approve operations permission.</p>)}

      {!expired && op.status === "Approved" && (has("data:execute") ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm"><CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-emerald-600" />{op.approval_required ? `Approved by ${op.decided_by ?? "an administrator"}.` : "No approval is needed."} It can run until {when(op.expires_at)}.</p>
          {needsTyping && (
            <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3"><p className="flex items-start gap-1.5 text-[12.5px] font-semibold text-red-700"><ShieldAlert size={14} className="mt-0.5 flex-shrink-0" /> Type these to confirm</p>
              <Field label={`Business name (${op.tenant_name})`}><Input value={business} onChange={(e) => setBusiness(e.target.value)} autoComplete="off" /></Field>
              <Field label={`Operation reference (${op.reference})`}><Input value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" /></Field></div>
          )}
          <Button className="w-full" variant={DESTRUCTIVE.includes(op.operation) ? "destructive" : "default"} disabled={execute.isPending || (needsTyping && !typed)}
            onClick={() => run(() => execute.mutateAsync({ id: op.id, key, confirm: needsTyping ? { business_name: business, reference } : undefined }))}>{execute.isPending ? "Running…" : `Run: ${OP_LABEL[op.operation]}`}</Button>
          {needsTyping && !typed && <p className="text-[11.5px] text-muted">Run unlocks once both are typed exactly.</p>}
        </div>
      ) : <p className="text-sm text-muted">Approved. Someone with the Execute operations permission must run it.</p>)}

      {op.status === "Executing" && <p className="flex items-center gap-2 text-sm"><span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden /> Running. Each record is handled on its own; this page updates by itself.</p>}
      {op.status === "Completed" && <p className="flex items-start gap-2 text-sm"><CheckCircle2 size={15} className="mt-0.5 text-emerald-600" /> Finished: {op.affected.toLocaleString()} {op.operation === "reset" ? "period closed" : "records done"}.</p>}
      {op.status === "PartiallyCompleted" && <p className="flex items-start gap-2 text-sm"><AlertTriangle size={15} className="mt-0.5 text-amber-600" /> Finished with some records not done. See the results.</p>}
      {op.status === "Failed" && <p className="flex items-start gap-2 text-sm"><XCircle size={15} className="mt-0.5 text-red-600" /> Nothing was done.{op.result?.error ? ` ${op.result.error}` : ""}</p>}
      {op.status === "Rejected" && <p className="text-sm">Rejected by {op.decided_by}: {op.decision_note}</p>}
      {(op.status === "Expired" || expired) && <Link href={`/data-management?tenant=${op.tenant_id}`}><Button variant="outline" className="w-full">Back to the workspace</Button></Link>}
      {["Prepared", "PendingApproval", "Approved"].includes(op.status) && (mine || has("data:approve")) && <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => run(() => cancel.mutateAsync(op.id))}>Cancel this plan</Button>}
    </Card>
  );
}

function Timeline({ op }: { op: DmOperationRecord }) {
  const rows: [string, string][] = [["Prepared", `${op.requested_by ?? "—"} · ${when(op.created_at)}`], ["Submitted", when(op.submitted_at)], ["Decision", op.decided_by ? `${op.decided_by} · ${when(op.decided_at)}${op.decision_note ? ` · ${op.decision_note}` : ""}` : op.approval_required ? "—" : "Not required"],
    ["Run by", op.executed_by ? `${op.executed_by} · ${when(op.started_at)}` : "—"], ["Finished", when(op.finished_at)], ["Plan valid until", when(op.expires_at)]];
  return <Card title="History of this operation"><dl className="space-y-2 text-[12.5px]">{rows.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl></Card>;
}

function Results({ op }: { op: DmOperationRecord }) {
  const [outcome, setOutcome] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const items = useDmItems(op.id, page, outcome);
  const counts = (op.result.counts ?? {}) as Record<string, number>;
  if (op.operation === "reset") return <Card title="Result"><p className="text-sm">Books closed through <strong>{String(op.result.locked_through ?? "—")}</strong>. The opening position was recorded with this operation.</p>{op.analysis?.preview && <BalanceLists preview={op.analysis.preview} />}</Card>;
  return (
    <Card title="Results">
      <div className="flex flex-wrap gap-1.5">{[["", "All"], ["affected", "Done"], ["failed", "Failed"], ["blocked", "Blocked"], ["skipped", "Skipped"]].map(([k, label]) => (
        <button key={k} type="button" onClick={() => { setOutcome(k || undefined); setPage(1); }} aria-pressed={(outcome ?? "") === k} className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", (outcome ?? "") === k ? "border-accent bg-accent/10 text-accent" : "border-border")}>{label}{k ? ` · ${counts[k] ?? 0}` : ""}</button>))}</div>
      {items.isLoading && <PageLoader />}
      {items.data && <TableScroll label="Per-record results"><table className="w-full text-left text-[13px]"><thead><tr><th className={thClass}>Record</th><th className={thClass}>Outcome</th><th className={thClass}>Detail</th></tr></thead>
        <tbody className="divide-y divide-border">{items.data.items.map((i) => <tr key={i.record_id}><td className="px-4 py-2.5 font-medium">{i.label}</td><td className="px-4 py-2.5"><Badge tone={i.outcome === "affected" ? "green" : i.outcome === "failed" ? "red" : "amber"}>{i.outcome === "affected" ? "Done" : i.outcome}</Badge></td><td className="px-4 py-2.5 text-muted">{i.message}</td></tr>)}</tbody></table></TableScroll>}
      {items.data && items.data.total > items.data.page_size && <div className="flex justify-between text-[12px] text-muted"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span><Button size="sm" variant="outline" disabled={page * items.data.page_size >= items.data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
      {DESTRUCTIVE.includes(op.operation) && <p className="text-[11.5px] text-muted">For each removed record, its key fields are kept with this operation for reference. They are not a restore point.</p>}
    </Card>
  );
}
