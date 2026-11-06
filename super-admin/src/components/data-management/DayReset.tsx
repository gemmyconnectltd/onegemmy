"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, Trash2 } from "lucide-react";
import type { DmOperation } from "@/lib/api";
import { useDmBusiness, useDmDayActivity, useDmMe, useDmPrepare } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { TableScroll } from "@/components/ui/TableScroll";
import { thClass } from "@/components/ui/DataTable";
import { FlowShell } from "./FlowShell";
import { errorText } from "./common";

const STEPS = ["Select business", "Select date", "View day activity", "Choose strategy", "Preview impact", "Approval", "Execute"];

/** Reset Business Day: see what a business recorded on one day, then choose a safe strategy per module. It never deletes a day's transactions in bulk. */
export function DayReset({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const me = useDmMe().data;
  const business = useDmBusiness(tenantId);
  const prepare = useDmPrepare();
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activity = useDmDayActivity(tenantId, date);
  const perms = me?.permissions ?? [];
  if (!me || business.isLoading) return <PageLoader />;
  if (!perms.includes("data:view") || !perms.includes("data:preview")) return <EmptyState title="You do not have access to this operation" description="It needs the View business records and Preview operations permissions." />;
  if (business.error || !business.data) return <ErrorState message={errorText(business.error)} />;
  const b = business.data;
  const rows = [...(activity.data?.modules ?? [])].filter((m) => m.count > 0).sort((x, y) => y.count - x.count);
  const filters = (m: { date_type: string }) => ({ date_type: m.date_type, preset: "custom", from: date, to: date });

  async function start(module: string, dateType: string, operation: DmOperation) {
    setBusy(`${module}:${operation}`); setError(null);
    try {
      const op = await prepare.mutateAsync({ tenantId, module, operation, selection: { mode: "matching", filters: filters({ date_type: dateType }), excluded_ids: [] }, payload: {} });
      router.push(`/data-management/operations/${op.data.id}`);
    } catch (e) { setError(errorText(e)); setBusy(null); }
  }

  return (
    <FlowShell title="Reset Business Day" subtitle="Review a day's activity and safely archive or remove what is eligible. A day's transactions are never deleted in bulk."
      crumbs={[{ label: "Data Management", href: "/data-management" }, { label: b.name, href: `/data-management?tenant=${tenantId}` }, { label: "Reset Business Day" }]}
      steps={STEPS} current={2}
      business={<div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px]"><span className="font-semibold">{b.name}</span><Badge tone={b.status === "Active" ? "green" : "red"} dot>{b.status}</Badge>
        <Link href="/data-management/new?op=reset-day" className="text-[12px] font-semibold text-accent hover:underline">Change</Link></div>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <Field label="Day" hint={activity.data ? `Day boundaries use the business's time zone (${activity.data.timezone}).` : undefined}>
            <Input type="date" max={new Date().toLocaleDateString("en-CA")} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
          </Field>
        </div>
        <Notice tone="blue">Archiving is reversible by the business, so it is the recommended strategy. Deleting removes only records with no payments, stock, accounting or history behind them; everything else is listed as blocked, with the reason. To undo posted sales or payments, use Correct / Adjust (void) so the books reverse properly, or close the period.</Notice>
        {error && <ErrorState message={error} />}
        {activity.isLoading && <PageLoader variant="compact" />}
        {activity.error && <ErrorState message={errorText(activity.error)} onRetry={() => void activity.refetch()} />}
        {activity.data && rows.length === 0 && <EmptyState title="No activity on this day" description={`${b.name} recorded nothing on ${date} in the modules Data Management covers. Pick another day.`} />}
        {activity.data && rows.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card"><TableScroll label="Day activity"><table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-border bg-surface/60"><tr><th scope="col" className={thClass}>Module</th><th scope="col" className={thClass}>Counted by</th><th scope="col" className={`${thClass} text-right`}>Records</th><th scope="col" className={thClass}>Strategy</th></tr></thead>
            <tbody className="divide-y divide-border">{rows.map((m) => (
              <tr key={m.module}>
                <td className="px-4 py-2.5 font-semibold">{m.label}</td><td className="px-4 py-2.5 text-muted">{m.date_label}</td><td className="px-4 py-2.5 text-right tabular-nums">{m.count.toLocaleString()}</td>
                <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1.5">
                  <Link href={`/data-management?tenant=${tenantId}&module=${m.module}&date_type=${m.date_type}&from=${date}&to=${date}`}><Button size="sm" variant="outline">Review records<ArrowRight size={13} /></Button></Link>
                  {m.archive && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void start(m.module, m.date_type, "archive")}><Archive size={13} />{busy === `${m.module}:archive` ? "Preparing…" : "Archive"}</Button>}
                  {m.delete && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void start(m.module, m.date_type, "delete")}><Trash2 size={13} />{busy === `${m.module}:delete` ? "Preparing…" : "Delete eligible"}</Button>}
                </div></td>
              </tr>))}</tbody>
          </table></TableScroll></div>
        )}
        <p className="text-[12px] text-muted">Each button prepares a preview of the exact records and what would block them. Nothing changes until it is approved and confirmed. To lock the books through this day instead, use <Link className="font-semibold text-accent hover:underline" href={`/data-management/close?tenant=${tenantId}`}>Opening Balance Reset</Link>.</p>
      </div>
    </FlowShell>
  );
}
