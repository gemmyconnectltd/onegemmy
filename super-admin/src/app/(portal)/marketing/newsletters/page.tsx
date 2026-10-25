"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, Plus, Users } from "lucide-react";
import { marketingApi } from "@/lib/api";
import { errorText, useAudienceSummary, useCampaigns, useMarketingMutation } from "@/lib/marketing/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { DataCard, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Flash, StatusPill, day, num, when } from "@/components/marketing/shared";
import { StatCard } from "@/components/traffic/shared";

export default function NewslettersPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const { data, isLoading, isError, refetch } = useCampaigns({ kind: "newsletter", page_size: 100 }, 15000);
  const subscribers = useAudienceSummary({}, true);
  const create = useMarketingMutation(() => marketingApi.createCampaign({ name: "Untitled newsletter", kind: "newsletter" }).then((r) => r.data));
  const rows = data?.items ?? [];
  const FREQ = { weekly: "Every week", biweekly: "Every two weeks", monthly: "Every month" } as const;

  return (
    <div className="space-y-4">
      <PageHeader title="Newsletters" subtitle="Recurring editorial emails for people who subscribed. Sent with the same engine as campaigns."
        actions={<Button onClick={() => create.mutateAsync(undefined as never).then((n) => router.push(`/marketing/newsletters/${n.id}`)).catch((e) => setMsg(errorText(e)))} disabled={create.isPending}><Plus size={14} /> Create newsletter</Button>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Subscribers who can be emailed" icon={Users} color="#0284c7" value={num(subscribers.data?.eligible)} href="/marketing/audience" sub="Opted in, active and valid" />
        <StatCard label="Newsletters" icon={Newspaper} color="#16a34a" value={num(data?.total)} sub={`${rows.filter((r) => r.status === "active").length} active`} />
      </div>
      {msg && <Flash tone="error">{msg}</Flash>}
      {isLoading ? <PageLoader variant="compact" /> : isError ? <ErrorState message="Could not load newsletters." onRetry={() => void refetch()} /> : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState icon={Newspaper} title="No newsletters yet" description="Create a newsletter, choose how often it goes out, and Pesaa sends each issue to your subscribers." /></div>
      ) : (
        <DataCard label="Newsletters">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr>{["Newsletter", "Schedule", "Status", "Next issue", ""].map((h, i) => <th key={i} scope="col" className={thClass}>{h || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((n) => (
                <tr key={n.id} className="hover:bg-surface/40">
                  <td className="max-w-[280px] px-4 py-3"><button type="button" className="block max-w-full truncate text-left font-semibold hover:text-accent hover:underline" onClick={() => router.push(`/marketing/newsletters/${n.id}`)}>{n.name}</button><span className="block truncate text-[12px] text-muted">{n.subject || "No subject yet"}</span></td>
                  <td className="px-4 py-3 text-[12.5px]">{n.schedule?.frequency ? FREQ[n.schedule.frequency] : <span className="text-muted">Not set</span>}</td>
                  <td className="px-4 py-3"><StatusPill status={n.status} /></td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">{n.status === "active" && n.schedule?.next_run_at ? when(n.schedule.next_run_at) : n.status === "paused" ? "Paused" : "—"}<span className="block text-[11px]">Created {day(n.created_at)}</span></td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => router.push(`/marketing/newsletters/${n.id}`)}>Open</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}
    </div>
  );
}
