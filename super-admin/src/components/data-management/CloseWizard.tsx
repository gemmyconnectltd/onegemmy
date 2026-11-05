"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import type { DmOperationRecord } from "@/lib/api";
import { useDmBusiness, useDmMe, useDmPrepare } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { cn } from "@/lib/utils";
import { errorText } from "./common";
import { BalanceLists } from "./OperationView";

const STEPS = ["Closing date", "Opening balances", "Review and confirm"];

/** Closing a period in three steps. Nothing here edits a journal or a stock movement: the books are locked through the date and the opening position is recorded. */
export function CloseWizard({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const me = useDmMe().data;
  const business = useDmBusiness(tenantId);
  const prepare = useDmPrepare();
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(today);
  const [plan, setPlan] = useState<DmOperationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (business.isLoading) return <PageLoader />;
  if (business.error || !business.data) return <ErrorState message={errorText(business.error)} />;
  if (me && !me.permissions.includes("data:preview")) return <EmptyState title="You do not have access" description="Ask a platform administrator for the Preview operations permission." />;
  const preview = plan?.analysis?.preview;
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); // calendar arithmetic in UTC, so the time zone of this browser cannot move the day

  async function load() {
    setError(null);
    try { setPlan((await prepare.mutateAsync({ tenantId, module: "accounting", operation: "reset", payload: { closing_date: date } })).data); setStep(1); }
    catch (e) { setError(errorText(e)); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3"><Link href={`/data-management?tenant=${tenantId}`} aria-label="Back to Data Management" className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground"><ArrowLeft size={16} /></Link>
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{business.data.name}</p><h1 className="pesaa-page-title">Close a period</h1>
          <p className="mt-0.5 text-sm text-muted">Lock the books through a date and record the opening position for what comes next. Nothing is deleted or re-posted.</p></div></div>
      <ol className="flex flex-wrap gap-2" aria-label="Steps">{STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", i === step ? "border-accent bg-accent/10 text-accent" : i < step ? "border-emerald-500/40 text-emerald-700" : "border-border text-muted")}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/10 text-[11px]">{i < step ? <Check size={12} /> : i + 1}</span>{s}</li>))}</ol>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">{error}</p>}

      {step === 0 && (
        <section className="max-w-xl space-y-3 rounded-xl border border-border bg-card p-4">
          <Field label="Closing date" required hint="The last day of the period being closed, in the business's time zone. It cannot be in the future."><Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Notice tone="blue">Everything dated on or before this day becomes locked. The business can still reopen the period, with a reason.</Notice>
          <Button disabled={!date || prepare.isPending} onClick={() => void load()}>{prepare.isPending ? "Reading the books…" : "Show the opening balances"}</Button>
        </section>
      )}
      {step === 1 && preview && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Balances at the end of {preview.closing_date}</h2>
          <BalanceLists preview={preview} />
          <p className="text-[12px] text-muted">These come straight from the books. They cannot be adjusted here: a wrong balance is fixed with an adjusting journal in the business&apos;s own Ledger, then previewed again.</p>
          <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(0)}>Change the date</Button><Button onClick={() => setStep(2)}>Continue</Button></div></section>
      )}
      {step === 2 && preview && plan && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Review</h2>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
            <div><dt className="text-muted">Period to close</dt><dd className="font-semibold">Through {preview.closing_date}{preview.locked_through ? ` (already closed through ${preview.locked_through})` : ""}</dd></div>
            <div><dt className="text-muted">New opening date</dt><dd className="font-semibold">{next}</dd></div>
            <div><dt className="text-muted">Customers owe</dt><dd className="font-semibold tabular-nums">{preview.customer_receivables.toLocaleString()} {preview.currency}</dd></div>
            <div><dt className="text-muted">Books balance</dt><dd className="font-semibold">{preview.books_balanced ? "Yes" : "No: do not close"}</dd></div>
          </dl>
          {preview.blockers.length > 0 ? (
            <div role="alert" className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3"><p className="text-[13px] font-semibold text-red-700">Settle these first</p>
              <ul className="list-disc pl-5 text-[12.5px]">{preview.blockers.map((b) => <li key={b.what}>{b.count.toLocaleString()} × {b.what}: {b.fix}</li>)}</ul></div>
          ) : <Notice tone="blue">Nothing is unfinished. Next you give a reason and a second administrator approves.</Notice>}
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={preview.blockers.length > 0 || !preview.books_balanced} onClick={() => router.push(`/data-management/operations/${plan.id}`)}>Continue to request</Button></div></section>
      )}
    </div>
  );
}
