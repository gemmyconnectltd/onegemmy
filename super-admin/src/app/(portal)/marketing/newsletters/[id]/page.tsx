"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCampaign, useCampaigns } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { CampaignWizard } from "@/components/marketing/CampaignWizard";
import { StatusPill, day, num, pct } from "@/components/marketing/shared";
import { BackLink } from "@/components/traffic/shared";
import { cn } from "@/lib/utils";

export default function NewsletterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<"settings" | "issues">("settings");
  const { data, isLoading, isError, refetch } = useCampaign(id);
  const issues = useCampaigns({ parent_id: id, page_size: 100 }, 8000).data;
  if (isLoading) return <PageLoader variant="page" />;
  if (isError || !data) return <ErrorState message="Could not load this newsletter." onRetry={() => void refetch()} />;
  return (
    <div className="space-y-4">
      <PageHeader back={<BackLink href="/marketing/newsletters" label="Back to newsletters" />} title={data.name} subtitle="Recurring issues to people who subscribed." actions={<StatusPill status={data.status} />} />
      <div role="tablist" aria-label="Newsletter" className="flex gap-1 border-b border-border">
        {([["settings", "Content & schedule"], ["issues", `Issues${issues ? ` (${issues.total})` : ""}`]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("border-b-2 px-3 py-2.5 text-[13px] font-semibold", tab === k ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground")}>{label}</button>
        ))}
      </div>
      {tab === "settings" ? <CampaignWizard key={data.id} campaign={data} newsletter onDone={() => undefined} /> : !issues?.items.length ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState title="No issues sent yet" description="Issues appear here when the schedule runs or when you send one manually." /></div>
      ) : (
        <DataCard label="Issues"><table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr>{["Issue", "Status", "Sent"].map((h) => <th key={h} className={thClass}>{h}</th>)}<th className={cn(thClass, "text-right")}>Recipients</th><th className={thClass}>Engagement</th></tr></thead>
          <tbody className="divide-y divide-border">{issues.items.map((i) => (
            <tr key={i.id} className="hover:bg-surface/40"><td className="px-4 py-3"><Link href={`/marketing/campaigns/${i.id}`} className="font-semibold hover:text-accent hover:underline">{i.name}</Link></td><td className="px-4 py-3"><StatusPill status={i.status} /></td>
              <td className="px-4 py-3 text-[12.5px] text-muted">{day(i.started_at)}</td><td className="px-4 py-3 text-right tabular-nums">{num(i.recipient_count)}</td>
              <td className="px-4 py-3 text-[12px]">{pct(i.clickRate, 0)} clicked · {pct(i.openRate, 0)} opened</td></tr>))}</tbody></table></DataCard>
      )}
      <p className="text-[12px] text-muted">Subscription preferences: people join or leave from the <Link className="font-semibold text-accent hover:underline" href="/marketing/audience">Audience</Link> page (bulk or per contact) and by the unsubscribe link in every issue.{" "}
        <button type="button" className="font-semibold text-accent hover:underline" onClick={() => router.push("/marketing/analytics")}>Subscriber growth →</button></p>
    </div>
  );
}
