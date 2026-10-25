"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Plus, Send } from "lucide-react";
import { marketingApi, type Campaign } from "@/lib/api";
import { errorText, useCampaigns, useMarketingMutation } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Form";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Flash, StatusPill, TYPE_LABEL, day, num, pct } from "@/components/marketing/shared";
import { cn } from "@/lib/utils";

const PAGE = 20;

export default function CampaignsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [cancelId, setCancelId] = useState<Campaign | null>(null);
  const [msg, setMsg] = useState("");
  const { data, isLoading, isError, refetch } = useCampaigns({ kind: "campaign", q: q || undefined, status: status || undefined, page, page_size: PAGE }, 6000);
  const create = useMarketingMutation(() => marketingApi.createCampaign({ name: "Untitled campaign", kind: "campaign" }).then((r) => r.data));
  const dup = useMarketingMutation((id: string) => marketingApi.duplicateCampaign(id).then((r) => r.data));
  const cancel = useMarketingMutation((id: string) => marketingApi.campaignAction(id, "cancel"));
  const fail = (e: unknown) => setMsg(errorText(e));
  const rows = data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Campaigns" subtitle="One-time emails to a segment of your audience."
        actions={<Button onClick={() => create.mutateAsync(undefined as never).then((c) => router.push(`/marketing/campaigns/${c.id}`)).catch(fail)} disabled={create.isPending}><Plus size={14} /> Create campaign</Button>} />
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search campaigns" />
        <Select aria-label="Status" className="w-auto!" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["draft", "scheduled", "sending", "sent", "paused", "cancelled", "failed"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select>
      </div>
      {msg && <Flash tone="error">{msg}</Flash>}
      {isLoading ? <PageLoader variant="compact" /> : isError ? <ErrorState message="Could not load campaigns." onRetry={() => void refetch()} /> : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState icon={Send} title="No campaigns yet" description="Create your first campaign to email a segment of your audience." /></div>
      ) : (
        <DataCard label="Campaigns">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead><tr>{["Campaign", "Type", "Audience", "Status", "Date"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}<th scope="col" className={cn(thClass, "text-right")}>Recipients</th><th scope="col" className={thClass}>Delivery</th><th scope="col" className={thClass}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => {
                const seg = c.audience?.segment_id ? "Saved segment" : Object.keys(c.audience?.filters ?? {}).length ? "Filtered" : "Everyone eligible";
                const total = (c.sent ?? 0) + (c.failed ?? 0) + (c.bounced ?? 0);
                return (
                  <tr key={c.id} className="hover:bg-surface/40">
                    <td className="max-w-[260px] px-4 py-3"><button type="button" className="block max-w-full truncate text-left font-semibold hover:text-accent hover:underline" onClick={() => router.push(`/marketing/campaigns/${c.id}`)}>{c.name}</button><span className="block truncate text-[12px] text-muted">{c.subject || "No subject yet"}</span></td>
                    <td className="px-4 py-3 text-[12.5px]">{TYPE_LABEL[c.campaign_type] ?? c.campaign_type}</td><td className="px-4 py-3 text-[12.5px] text-muted">{seg}</td>
                    <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">{day(c.scheduled_at ?? c.started_at ?? c.created_at)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.recipient_count ? num(c.recipient_count) : "—"}</td>
                    <td className="px-4 py-3 text-[12px]">{total > 0 ? <><span className="font-medium">{num(c.sent)} sent</span>{(c.failed || c.bounced) ? <span className="text-red-600"> · {num((c.failed ?? 0) + (c.bounced ?? 0))} failed</span> : null}<span className="block text-muted">{pct(c.openRate, 0)} opened · {pct(c.clickRate, 0)} clicked</span></> : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-right"><span className="inline-flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/marketing/campaigns/${c.id}`)}>{c.status === "draft" || c.status === "scheduled" ? "Edit" : "Results"}</Button>
                      <Button size="sm" variant="ghost" aria-label={`Duplicate ${c.name}`} onClick={() => dup.mutateAsync(c.id).then((n) => router.push(`/marketing/campaigns/${n.id}`)).catch(fail)}><Copy size={13} /></Button>
                      {(c.status === "scheduled" || c.status === "sending" || c.status === "paused") && <Button size="sm" variant="ghost" aria-label={`Cancel ${c.name}`} onClick={() => setCancelId(c)}><MoreHorizontal size={14} /></Button>}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataCard>
      )}
      <Pagination page={page} pageSize={PAGE} total={data?.total ?? 0} onPage={setPage} noun="campaign" />
      <ConfirmDialog open={!!cancelId} title={`Cancel “${cancelId?.name}”?`} message="Messages that haven't been sent yet will be skipped. Messages already sent can't be recalled." danger confirmLabel="Cancel campaign" onCancel={() => setCancelId(null)}
        onConfirm={() => { const id = cancelId!.id; setCancelId(null); cancel.mutateAsync(id).catch(fail); }} />
    </div>
  );
}
