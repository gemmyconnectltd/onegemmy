"use client";

import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card, Pill } from "@/components/branches/parts";
import { useMyBranchStats, useMyEntitlements } from "@/lib/api/hooks";
import { fmtDate } from "@/lib/date";
import { useWorkInBranch } from "@/lib/useWorkInBranch";

const TONE = { pending: "amber", in_transit: "slate", completed: "green", cancelled: "red" } as const;

/** PESAA keeps stock for the whole business, not per branch, so this tab shows what really is branch-aware (stock transfers in and
 *  out) and says plainly what isn't, rather than inventing a per-branch stock figure. */
export function BranchInventoryTab({ branchId, branchName }: { branchId: string; branchName: string }) {
  const stats = useMyBranchStats(branchId);
  const { data: ent } = useMyEntitlements();
  const open = useWorkInBranch(branchId);
  if (ent && ent.features.inventory === false) return <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted">The Inventory module isn&apos;t available for your business right now.</p>;
  return (
    <div className="space-y-4">
      <Card title="How stock works here">
        <p className="text-sm text-foreground">Stock quantities are kept for the whole business, so there is no separate stock count for {branchName}. What is recorded per branch is the movement of stock between branches.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => open("/inventory/products")}>Open products and stock</Button><Button size="sm" variant="secondary" onClick={() => open("/inventory/transfers")}>Stock transfers</Button></div>
      </Card>
      <Card title="Recent stock transfers" hint={`The latest transfers into or out of ${branchName}`}>
        {stats.isLoading ? <PageLoader variant="compact" /> : stats.isError ? <p role="alert" className="text-sm text-red-600">Couldn&apos;t load transfers.</p> : (stats.data?.recent_transfers.length ?? 0) === 0 ? <p className="py-4 text-center text-sm text-muted">No stock has been transferred to or from this branch yet.</p> : (
          <ul className="divide-y divide-border">{stats.data!.recent_transfers.map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><div><span className="font-medium">{t.transfer_number}</span><span className="ml-2 text-[12px] text-muted">{t.direction === "incoming" ? "Incoming" : "Outgoing"}{t.created_at ? ` · ${fmtDate(t.created_at)}` : ""}</span></div><Pill tone={TONE[t.status as keyof typeof TONE] ?? "slate"}>{t.status.replace("_", " ")}</Pill></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
