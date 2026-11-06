"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ShieldAlert } from "lucide-react";
import { useDmBusiness, useDmMe, useDmPrepare, useDmResetOptions } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Form";
import { PageLoader } from "@/components/ui/PageLoader";
import { cn } from "@/lib/utils";
import { FlowShell } from "./FlowShell";
import { errorText } from "./common";

const STEPS = ["Select business", "Configure", "Preview", "Confirm", "Execute", "Results"];

/** Reset Business Data, step 2: choose what to keep. Nothing is deleted from here: the next step is a server-side preview of the exact impact. */
export function ResetBusinessData({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const me = useDmMe().data;
  const business = useDmBusiness(tenantId);
  const options = useDmResetOptions(tenantId);
  const prepare = useDmPrepare();
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [numbering, setNumbering] = useState(true);
  const [zeroStock, setZeroStock] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const perms = me?.permissions ?? [];
  if (!me || business.isLoading || options.isLoading) return <PageLoader />;
  if (!perms.includes("data:view") || !perms.includes("data:preview")) return <EmptyState title="You do not have access to this operation" description="It needs the View business records and Preview operations permissions." />;
  if (business.error || !business.data) return <ErrorState message={errorText(business.error)} />;
  if (options.error || !options.data) return <ErrorState message={errorText(options.error)} onRetry={() => void options.refetch()} />;
  const b = business.data, o = options.data;
  const keep = chosen ?? new Set(o.presets[o.default_preset].keep);
  const masters = o.groups.filter((g) => g.kind === "master"), transactional = o.groups.filter((g) => g.kind === "transactional");
  const deleting = o.groups.filter((g) => !keep.has(g.key));
  const rangeBad = !!from && !!to && from > to;
  const toggle = (key: string) => setChosen(() => { const n = new Set(keep); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const matches = (preset: string) => { const k = new Set(o.presets[preset].keep); return k.size === keep.size && [...k].every((x) => keep.has(x)); };

  async function preview() {
    setError(null);
    try {
      const op = await prepare.mutateAsync({ tenantId, module: "business", operation: "reset_data", selection: null,
        payload: { keep: [...keep], reset_numbering: numbering, zero_stock: zeroStock, date_from: from || null, date_to: to || null } });
      router.push(`/data-management/operations/${op.data.id}`);
    } catch (e) { setError(errorText(e)); }
  }
  const row = (g: (typeof o.groups)[number]) => (
    <li key={g.key}>
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-2.5", keep.has(g.key) ? "border-accent/40 bg-accent/5" : "border-border")}>
        <input type="checkbox" className="mt-1" checked={keep.has(g.key)} onChange={() => toggle(g.key)} aria-label={`Keep ${g.label}`} />
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{g.label}</span>{g.note && <span className="block text-[11.5px] text-muted">{g.note}</span>}</span>
        <span className="flex flex-shrink-0 flex-col items-end gap-0.5 text-right"><span className="text-[13px] font-bold tabular-nums">{g.count.toLocaleString()}</span><Badge tone={keep.has(g.key) ? "green" : "red"}>{keep.has(g.key) ? "Keep" : "Delete"}</Badge></span>
      </label>
    </li>);

  return (
    <FlowShell title="Reset Business Data" subtitle="Wipe a business's transactional data and start fresh. You choose what to keep."
      crumbs={[{ label: "Data Management", href: "/data-management" }, { label: b.name, href: `/data-management?tenant=${tenantId}` }, { label: "Reset Business Data" }]} steps={STEPS} current={1}
      business={<div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px]"><span className="font-semibold">{b.name}</span><Badge tone={b.status === "Active" ? "green" : "red"} dot>{b.status}</Badge>
        <Link href="/data-management/reset" className="text-[12px] font-semibold text-accent hover:underline">Change</Link></div>}
      footer={<div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">{deleting.length} group{deleting.length === 1 ? "" : "s"} will be deleted, {keep.size} kept. Nothing is deleted until you have seen the preview and confirmed.</p>
        <div className="flex gap-2"><Link href={`/data-management?tenant=${tenantId}`}><Button variant="ghost">Cancel</Button></Link>
          <Button variant="destructive" disabled={prepare.isPending || deleting.length === 0 || rangeBad} onClick={() => void preview()}>{prepare.isPending ? "Checking…" : "Preview impact"}</Button></div></div>}>
      <div className="space-y-4">
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-[12.5px] font-semibold text-red-700 dark:text-red-400"><ShieldAlert size={15} className="mt-0.5 flex-shrink-0" aria-hidden />
          This permanently deletes data. A full backup is created first and kept, but there is no automatic restore.</div>
        {error && <ErrorState message={error} />}
        <section className="space-y-2"><h2 className="pesaa-card-title">Start from a preset</h2>
          <div className="flex flex-wrap gap-2">{Object.entries(o.presets).map(([key, p]) => (
            <button key={key} type="button" aria-pressed={matches(key)} onClick={() => setChosen(new Set(p.keep))} className={cn("rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-accent", matches(key) ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface")}>{p.label}</button>))}</div></section>
        <div className="grid gap-4 xl:grid-cols-2">
          <section aria-labelledby="keepers" className="space-y-2"><h2 id="keepers" className="pesaa-card-title">Master data</h2><p className="text-[12px] text-muted">Ticked groups are kept. Counts are live for this business.</p><ul className="space-y-2">{masters.map(row)}</ul></section>
          <section aria-labelledby="txn" className="space-y-2"><h2 id="txn" className="pesaa-card-title">Transactional data</h2><p className="text-[12px] text-muted">Deleted unless you keep them.</p><ul className="space-y-2">{transactional.map(row)}</ul></section>
        </div>
        <section className="space-y-1.5 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title flex items-center gap-2"><Lock size={14} aria-hidden /> Always kept</h2>
          <p className="text-[12.5px] text-muted">{o.always_kept.map((a) => a.label).join(" · ")}. This operation can never delete them.</p></section>
        <section className="space-y-3 rounded-xl border border-border bg-card p-4"><h2 className="pesaa-card-title">Options</h2>
          <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={numbering} onChange={(e) => setNumbering(e.target.checked)} /><span><strong>Reset document numbering</strong><span className="block text-[12px] text-muted">Journal numbering restarts at 0001. Order, expense and payment numbers restart on their own once no earlier documents remain. If you keep documents or set a date range, their numbers continue.</span></span></label>
          <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={zeroStock} onChange={(e) => setZeroStock(e.target.checked)} /><span><strong>Reset product stock to 0 when products are kept</strong><span className="block text-[12px] text-muted">Applies when products are kept but stock history is deleted.</span></span></label>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Only delete records created from" hint="Leave both empty for all time. The same day in both fields resets one day."><Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Until (inclusive)"><Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field></div>
          {rangeBad && <p role="alert" className="text-[12px] text-red-600">The start date must not be after the end date.</p>}
        </section>
        {deleting.length === 0 && <Notice tone="amber">Everything is marked to keep, so there is nothing to delete. Untick the groups to remove.</Notice>}
      </div>
    </FlowShell>
  );
}
