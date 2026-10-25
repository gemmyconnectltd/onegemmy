"use client";

import { useState } from "react";
import { Copy, Pause, Play, XCircle } from "lucide-react";
import { marketingApi, type Campaign } from "@/lib/api";
import { errorText, useCampaignResults, useMarketingMutation, useRecipients } from "@/lib/marketing/hooks";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataCard, Pagination, thClass } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section, StatCard } from "@/components/traffic/shared";
import { EmailPreview } from "./EmailBuilder";
import { Flash, StatusPill, TYPE_LABEL, num, pct, when } from "./shared";
import { Eye, MousePointerClick, Send, UserMinus, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE: Record<string, "green" | "amber" | "red" | "slate"> = { sent: "green", pending: "amber", sending: "amber", failed: "red", bounced: "red", skipped: "slate" };

/** Results for a campaign that has started: delivery, engagement, recipients and the content that was sent. */
export function CampaignResults({ campaign, onDuplicated }: { campaign: Campaign; onDuplicated: (id: string) => void }) {
  const live = campaign.status === "sending" || campaign.status === "paused";
  const results = useCampaignResults(campaign.id, live ? 4000 : undefined).data;
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const recipients = useRecipients(campaign.id, { status: status || undefined, page, page_size: 25 }).data;
  const [confirm, setConfirm] = useState<"cancel" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const act = useMarketingMutation((a: "pause" | "resume" | "cancel") => marketingApi.campaignAction(campaign.id, a));
  const dup = useMarketingMutation(() => marketingApi.duplicateCampaign(campaign.id).then((r) => r.data));
  const run = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: "error", text: errorText(e) }); } };
  const r = results;
  const progress = r && r.total ? Math.round(((r.sent + r.failed + r.bounced + r.skipped) / r.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={campaign.status} /><span className="text-[12.5px] text-muted">{TYPE_LABEL[campaign.campaign_type] ?? campaign.campaign_type} · {campaign.status === "scheduled" ? `scheduled ${when(campaign.scheduled_at)}` : `started ${when(campaign.started_at)}`}{campaign.completed_at ? ` · finished ${when(campaign.completed_at)}` : ""}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {campaign.status === "sending" && <Button size="sm" variant="outline" onClick={() => run(() => act.mutateAsync("pause"))}><Pause size={13} /> Pause</Button>}
          {campaign.status === "paused" && <Button size="sm" variant="outline" onClick={() => run(() => act.mutateAsync("resume"))}><Play size={13} /> Resume</Button>}
          {live && <Button size="sm" variant="outline" onClick={() => setConfirm("cancel")}><XCircle size={13} /> Cancel remaining</Button>}
          <Button size="sm" variant="outline" disabled={dup.isPending} onClick={() => run(async () => onDuplicated((await dup.mutateAsync(undefined as never)).id))}><Copy size={13} /> Duplicate</Button>
        </div>
      </div>
      {msg && <Flash tone={msg.tone}>{msg.text}</Flash>}
      {live && r && <div className="rounded-xl border border-border bg-card p-4" aria-live="polite"><div className="flex justify-between text-[12.5px]"><span className="font-semibold">{campaign.status === "paused" ? "Paused" : "Sending…"} {progress}%</span><span className="text-muted">{num(r.queued)} still to send</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div></div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="Recipients" icon={Users} color="#64748b" value={num(r?.total)} sub={`${num(r?.skipped)} skipped`} />
        <StatCard label="Sent" icon={Send} color="#16a34a" value={num(r?.sent)} sub="Accepted by the mail server" />
        <StatCard label="Clicked" icon={MousePointerClick} color="#0284c7" value={pct(r?.clickRate)} sub={`${num(r?.uniqueClicks)} people`} />
        <StatCard label="Opened (approx.)" icon={Eye} color="#8b5cf6" value={pct(r?.openRate)} sub={`${num(r?.uniqueOpens)} people`} />
        <StatCard label="Unsubscribed" icon={UserMinus} color="#d97706" value={num(r?.unsubscribed)} sub={pct(r?.unsubscribeRate, 2)} />
      </div>
      {r && (r.failed > 0 || r.bounced > 0) && <p className="flex items-center gap-2 text-[12.5px] text-amber-700 dark:text-amber-400"><AlertTriangle size={14} aria-hidden />{num(r.failed)} failed and {num(r.bounced)} bounced (the mail server refused the address, which is now suppressed).</p>}
      <p className="text-[11.5px] text-muted">“Sent” means the mail server accepted the message — SMTP doesn&apos;t report inbox delivery. Opens are approximate (image blocking and mail-privacy features); clicks are tracked links and can include security scanners.</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title="Recipients" subtitle="Everyone this campaign was queued for.">
          <div className="mb-3"><Select aria-label="Filter by status" className="w-auto!" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["sent", "pending", "failed", "bounced", "skipped"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
          {!recipients?.items.length ? <EmptyState title="No recipients" description="Nothing matches this filter." /> : (
            <>
              <DataCard label="Recipients" className="border-0"><table className="w-full min-w-[520px] text-left text-sm">
                <thead><tr><th className={thClass}>Contact</th><th className={thClass}>Status</th><th className={cn(thClass, "text-right")}>Opens</th><th className={cn(thClass, "text-right")}>Clicks</th></tr></thead>
                <tbody className="divide-y divide-border">{recipients.items.map((x) => <tr key={x.id}>
                  <td className="max-w-[220px] px-4 py-2.5"><span className="block truncate font-medium">{x.contact}</span><span className="block truncate text-[11.5px] text-muted">{x.email}</span></td>
                  <td className="px-4 py-2.5"><Badge tone={TONE[x.status] ?? "slate"}>{x.status}</Badge>{x.unsubscribed && <Badge tone="slate" className="ml-1">Unsubscribed</Badge>}{x.reason && <span className="block text-[11px] text-muted">{x.reason}</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{x.opens}</td><td className="px-4 py-2.5 text-right tabular-nums">{x.clicks}</td></tr>)}</tbody></table></DataCard>
              <div className="mt-2"><Pagination page={page} pageSize={25} total={recipients.total} onPage={setPage} noun="recipient" /></div>
            </>
          )}
        </Section>
        <div className="space-y-4">
          <Section title="Top links" subtitle="Clicks by link.">{!r?.topLinks.length ? <p className="py-4 text-center text-[12.5px] text-muted">No clicks yet.</p> : <ul className="space-y-2">{r.topLinks.map((l) => <li key={l.url} className="flex justify-between gap-3 text-[12.5px]"><span className="min-w-0 truncate" title={l.url}>{l.url.replace(/^https?:\/\//, "")}</span><span className="tabular-nums text-muted">{l.clicks}</span></li>)}</ul>}</Section>
          <Section title="Content sent" subtitle={campaign.subject}><EmailPreview blocks={campaign.blocks} subject={campaign.subject} preheader={campaign.preheader ?? ""} /></Section>
        </div>
      </div>
      <ConfirmDialog open={confirm === "cancel"} title="Cancel the remaining messages?" message={`${num(r?.queued)} messages that haven't been sent yet will be skipped. Messages already sent can't be recalled.`} danger confirmLabel="Cancel remaining" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void run(() => act.mutateAsync("cancel")); }} />
    </div>
  );
}
