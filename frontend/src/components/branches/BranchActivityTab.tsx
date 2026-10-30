"use client";

import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/branches/parts";
import { useBranchActivity } from "@/lib/api/hooks";
import type { BranchEvent } from "@/lib/api";

export function BranchEventList({ events }: { events: BranchEvent[] }) {
  if (events.length === 0) return <p className="py-4 text-center text-sm text-muted">No changes recorded for this branch yet. New edits, status changes and main-branch changes will appear here.</p>;
  return (
    <ul className="divide-y divide-border">
      {events.map((e) => (
        <li key={e.id} className="py-2.5"><p className="text-sm text-foreground">{e.summary}</p><p className="text-[12px] text-muted">{e.actor ? `${e.actor} · ` : ""}{e.at ? new Date(e.at).toLocaleString() : ""}</p></li>
      ))}
    </ul>
  );
}

export function BranchActivityTab({ id }: { id: string }) {
  const q = useBranchActivity(id);
  return (
    <Card title="Activity" hint="Changes to this branch's details, status and main-branch setting. Staff assignments are recorded on each person's own history.">
      {q.isLoading ? <PageLoader variant="compact" /> : q.isError ? <p role="alert" className="text-sm text-red-600">You don&apos;t have access to this history.</p> : <BranchEventList events={q.data ?? []} />}
    </Card>
  );
}
