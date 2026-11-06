"use client";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { OP_LABEL, type DmOperationRecord } from "@/lib/api";
import { useDmApproveAndRun, useDmApproveAndRunBatch } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Notice } from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { errorText } from "./common";

/** Reverses books entries, payments and stock: shown in red before anything that removes or voids records. */
export const reversesBooks = (op: Pick<DmOperationRecord, "operation" | "payload">) => ["delete", "clean_test", "reset_data"].includes(op.operation) || (op.operation === "correct" && op.payload?.action === "void");
export const RESET_WARNING = "This permanently deletes data. A full backup is created first and kept, but there is no automatic restore: it is the only copy of what is deleted.";
export const REVERSAL_WARNING = "This reverses the books entries, payments and stock that belong to these records. It cannot be undone from here.";

const AFTER: Record<string, string> = { reset_data: "Deleted for good (a full backup is stored first)", delete: "Removed for good", clean_test: "Removed for good", archive: "Archived (the business can restore them)", correct: "Changed through the module's own workflow", reset: "Books closed through the closing date" };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function BeforeAfter({ op }: { op: DmOperationRecord }) {
  const changes = op.operation === "correct" ? op.analysis?.assessments.find((x) => x.eligible)?.changes ?? [] : [];
  const rows: [string, string, string][] = changes.length > 0
    ? changes.map((c) => [c.field.replace("_", " "), c.before == null || c.before === "" ? "—" : String(c.before), c.after == null || c.after === "" ? "—" : String(c.after)])
    : [["Records", `${op.summary.eligible.toLocaleString()} eligible${op.summary.blocked ? `, ${op.summary.blocked.toLocaleString()} blocked (left as they are)` : ""}`, AFTER[op.operation] ?? "Done"]];
  return (
    <table className="w-full text-left text-[12.5px]"><caption className="sr-only">Before and after</caption>
      <thead><tr className="border-b border-border text-muted"><th scope="col" className="py-1.5 pr-3 font-semibold">What</th><th scope="col" className="py-1.5 pr-3 font-semibold">Before</th><th scope="col" className="py-1.5 font-semibold">After</th></tr></thead>
      <tbody className="divide-y divide-border">{rows.map(([k, b, a]) => <tr key={k}><td className="py-1.5 pr-3 font-medium capitalize">{k}</td><td className="py-1.5 pr-3 text-muted">{b}</td><td className="py-1.5 font-semibold">{a}</td></tr>)}</tbody>
    </table>
  );
}

/** One operation: submit (if still a preview), approve and run, after the reason and the business name are typed. Mount it only while open. */
export function ApproveRunDialog({ op, onClose }: { op: DmOperationRecord; onClose: () => void }) {
  const run = useDmApproveAndRun();
  const needsReason = op.status === "Prepared";
  const [reason, setReason] = useState("");
  const [attest, setAttest] = useState(false);
  const [ownerReq, setOwnerReq] = useState(false);
  const [business, setBusiness] = useState("");
  const [reference, setReference] = useState("");
  const [key] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())));
  const [error, setError] = useState<string | null>(null);
  const typed = same(business, op.tenant_name) && reference.trim().toUpperCase() === op.reference;
  const isReset = op.operation === "reset_data";
  const minReason = isReset ? 20 : 10;
  const ready = typed && (!needsReason || (reason.trim().length >= minReason && (!isReset || ownerReq))) && (op.operation !== "clean_test" || !needsReason || attest) && op.summary.eligible > 0;
  const danger = reversesBooks(op);
  const go = async () => {
    setError(null);
    try { await run.mutateAsync({ id: op.id, reason: needsReason ? reason : undefined, attest, ownerRequest: ownerReq, key, confirm: { business_name: business, reference } }); onClose(); } catch (e) { setError(errorText(e)); }
  };
  return (
    <Drawer open onClose={onClose} side="center" size="md" title="Approve & run"
      footer={<div className="flex items-center justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" variant={danger ? "destructive" : "default"} disabled={!ready || run.isPending} onClick={go}>{run.isPending ? "Running…" : "Approve & run"}</Button></div>}>
      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
          <div><dt className="text-muted">Operation ID</dt><dd className="font-mono font-semibold">{op.reference}</dd></div>
          <div><dt className="text-muted">Business</dt><dd className="font-semibold">{op.tenant_name}</dd></div>
          <div><dt className="text-muted">Module</dt><dd className="font-semibold capitalize">{op.module.replace("_", " ")}</dd></div>
          <div><dt className="text-muted">Action</dt><dd className="font-semibold">{OP_LABEL[op.operation]}</dd></div>
        </dl>
        <BeforeAfter op={op} />
        {danger && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-[12.5px] font-semibold text-red-700 dark:text-red-400"><ShieldAlert size={15} className="mt-0.5 flex-shrink-0" aria-hidden />{isReset ? RESET_WARNING : REVERSAL_WARNING}</div>}
        {needsReason ? <Field label="Why is this needed?" required hint={`At least ${minReason} characters. It is kept in the business's audit trail.`}><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          : <p className="text-[12.5px]"><span className="text-muted">Reason:</span> <em>{op.reason}</em></p>}
        {needsReason && isReset && <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12.5px]"><input type="checkbox" className="mt-0.5" checked={ownerReq} onChange={(e) => setOwnerReq(e.target.checked)} /><span>I have the business owner&apos;s written request.</span></label>}
        {needsReason && op.operation === "clean_test" && <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12.5px]"><input type="checkbox" className="mt-0.5" checked={attest} onChange={(e) => setAttest(e.target.checked)} /><span>I have reviewed these records and they are test data, not real business history.</span></label>}
        <div className="space-y-2 rounded-lg border border-border p-3"><p className="text-[12.5px] font-semibold">Type these to confirm</p>
          <Field label={`Business name (${op.tenant_name})`}><Input value={business} onChange={(e) => setBusiness(e.target.value)} autoComplete="off" /></Field>
          <Field label={`Operation reference (${op.reference})`}><Input value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" /></Field></div>
        <p className="text-[11.5px] text-muted">Everything is checked again against the business&apos;s current data before it runs. Anything that changed since the preview is left alone.</p>
        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </Drawer>
  );
}

/** Several operations that are waiting for approval, confirmed once for the whole batch. */
export function ApproveRunBatchDialog({ ops, onClose, onDone }: { ops: DmOperationRecord[]; onClose: () => void; onDone: () => void }) {
  const run = useDmApproveAndRunBatch();
  const phrase = `RUN ${ops.length}`;
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ reference: string; status: string; affected: number; error: string | null }[] | null>(null);
  const danger = ops.some(reversesBooks);
  const go = async () => {
    setError(null);
    try { const r = await run.mutateAsync({ ids: ops.map((o) => o.id), phrase: typed }); setResults(r.data.results); onDone(); } catch (e) { setError(errorText(e)); }
  };
  return (
    <Drawer open onClose={onClose} side="center" size="md" title={`Approve & run ${ops.length} operation${ops.length === 1 ? "" : "s"}`}
      footer={<div className="flex items-center justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{results ? "Close" : "Cancel"}</Button>
        {!results && <Button type="button" variant={danger ? "destructive" : "default"} disabled={typed.trim().toUpperCase() !== phrase || run.isPending} onClick={go}>{run.isPending ? "Running…" : "Approve & run selected"}</Button>}</div>}>
      <div className="space-y-4 px-5 py-4">
        {results ? (
          <ul className="divide-y divide-border text-[13px]">{results.map((r) => (
            <li key={r.reference} className="flex items-start justify-between gap-3 py-2"><span className="font-mono font-semibold">{r.reference}</span>
              <span className={r.error || r.status === "Failed" ? "text-right text-red-600" : "text-right text-emerald-700"}>{r.error ?? `${r.status === "Completed" ? "Done" : r.status}: ${r.affected.toLocaleString()} records`}</span></li>))}</ul>
        ) : (
          <>
            <ul className="max-h-48 divide-y divide-border overflow-auto text-[12.5px]">{ops.map((o) => <li key={o.id} className="py-1.5"><span className="font-mono font-semibold">{o.reference}</span> · {o.tenant_name} · <span className="capitalize">{o.module.replace("_", " ")}</span> · {OP_LABEL[o.operation]} · {o.summary.eligible.toLocaleString()} eligible</li>)}</ul>
            {danger && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-[12.5px] font-semibold text-red-700 dark:text-red-400"><ShieldAlert size={15} className="mt-0.5 flex-shrink-0" aria-hidden />{REVERSAL_WARNING}</div>}
            <Notice tone="blue">Each operation is approved and run on its own, and checked again before it runs. If one cannot run, the others still do and the result says which.</Notice>
            <Field label={`Type ${phrase} to confirm`}><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
          </>
        )}
        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </Drawer>
  );
}
