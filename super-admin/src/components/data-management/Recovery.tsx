"use client";
import Link from "next/link";
import { ArrowLeft, DatabaseBackup } from "lucide-react";
import { useDmMe, useDmRecovery } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { errorText } from "./common";

/** What can really be recovered. This page shows only what exists: there is no backup system, so it says so rather than listing restore points. */
export function Recovery({ tenantId }: { tenantId: string }) {
  const me = useDmMe().data;
  const q = useDmRecovery(tenantId);
  if (me && !me.permissions.includes("data:recovery")) return <EmptyState title="You do not have access to Backups & Recovery" description="Ask a platform administrator for the Recovery permission." />;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3"><Link href={`/data-management?tenant=${tenantId}`} aria-label="Back to Data Management" className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground"><ArrowLeft size={16} /></Link>
        <div><h1 className="pesaa-page-title">Backups &amp; recovery</h1><p className="mt-0.5 text-sm text-muted">What can be recovered for this business, and what cannot.</p></div></div>
      {q.isLoading && <PageLoader />}
      {q.error && <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && <>
        <section className="space-y-3 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Backups</h2>
          {q.data.backups.length === 0 && <EmptyState icon={DatabaseBackup} title="No restore points" description={q.data.backup_system.message} />}</section>
        <section className="space-y-2 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">What each operation allows</h2>
          <ul className="divide-y divide-border text-[13px]">{Object.entries(q.data.recovery_available_for).map(([k, v]) => <li key={k} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-semibold capitalize">{k.replace("_", " ")}</span><span className="text-muted">{v}</span></li>)}</ul></section>
        <section className="space-y-2 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Data exports</h2>
          {q.data.exports.length === 0 ? <p className="text-sm text-muted">No exports have been requested for this business.</p> :
            <ul className="divide-y divide-border text-[13px]">{q.data.exports.map((e) => <li key={e.id} className="py-2"><p className="font-semibold">{new Date(e.created_at).toLocaleString()} · {e.format.toUpperCase()} <Badge tone="slate">Not a restore point</Badge></p><p className="text-muted">{e.note}</p></li>)}</ul>}</section>
        <section className="space-y-2 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Records removed by past operations</h2>
          {q.data.deletion_records.length === 0 ? <p className="text-sm text-muted">Nothing has been deleted through Data Management.</p> :
            <ul className="divide-y divide-border text-[13px]">{q.data.deletion_records.map((d) => <li key={d.operation_id} className="py-2"><Link href={`/data-management/operations/${d.operation_id}`} className="font-mono font-semibold text-accent hover:underline">{d.reference}</Link> · {d.records} {d.module.replace("_", " ")} · {new Date(d.finished_at).toLocaleDateString()}<p className="text-muted">{d.note}</p></li>)}</ul>}</section>
        <Notice tone="amber">High-impact deletions are only possible because this platform cannot restore them. That is why they need a second administrator and typed confirmation.</Notice>
      </>}
    </div>
  );
}
