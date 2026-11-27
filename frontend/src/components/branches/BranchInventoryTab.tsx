"use client";

import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card, Pill } from "@/components/branches/parts";
import { useBranchStockSummary, useMyBranchStats, useMyEntitlements, useWarehouses } from "@/lib/api/hooks";
import { useAppConfig } from "@/lib/appConfig";
import { fmtMoney } from "@/lib/config";
import { fmtDate } from "@/lib/date";
import { useWorkInBranch } from "@/lib/useWorkInBranch";

const TONE = { pending: "amber", in_transit: "slate", completed: "green", cancelled: "red" } as const;

/** This branch's own stock (each branch keeps its own, in its own warehouse) and its recent transfers. A business that has not
 *  switched warehouses on has one stock figure for the whole business, and the tab says so instead of inventing a branch figure. */
export function BranchInventoryTab({ branchId, branchName }: { branchId: string; branchName: string }) {
  const stats = useMyBranchStats(branchId);
  const { data: ent } = useMyEntitlements();
  const open = useWorkInBranch(branchId);
  const { currencySymbol } = useAppConfig();
  const warehouses = useWarehouses();
  const usesWarehouses = !!warehouses.data?.enabled;
  const summary = useBranchStockSummary(1, "name", false, { enabled: usesWarehouses }, 500);
  const row = summary.data?.items.find((r) => r.branch_id === branchId);
  if (ent && ent.features.inventory === false) return <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted">The Inventory module isn&apos;t available for your business right now.</p>;
  return (
    <div className="space-y-4">
      <Card title={`Stock in ${branchName}`} hint={usesWarehouses ? "What this branch holds in its own warehouse" : undefined}>
        {warehouses.isLoading || (usesWarehouses && summary.isLoading) ? <PageLoader variant="compact" /> : !usesWarehouses ?
          <p className="text-sm text-foreground">This business keeps one stock figure for the whole business. Switch on warehouses in Inventory to keep each branch&apos;s stock apart.</p>
          : !row ? <p className="text-sm text-muted">{summary.isError ? "Couldn't load this branch's stock." : `${branchName} has no stock yet.`}</p> :
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Stock value", fmtMoney(row.value_cost, currencySymbol)], ["Units", row.units.toLocaleString()], ["Low", String(row.low)], ["Out", String(row.out)], ["On the way", row.incoming_units ? `${row.incoming_units.toLocaleString()} units` : "—"]].map(([k, v]) =>
            <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="truncate text-lg font-semibold tabular-nums">{v}</dd></div>)}</dl>}
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => open("/inventory")}>Open {branchName} in Inventory</Button><Button size="sm" variant="secondary" onClick={() => open("/inventory/transfers")}>Stock transfers</Button></div>
      </Card>
      <Card title="Recent stock transfers" hint={`The latest transfers into or out of ${branchName}`}>
        {stats.isLoading ? <PageLoader variant="compact" /> : stats.isError ? <p role="alert" className="text-sm text-red-600">Couldn&apos;t load transfers.</p> : (stats.data?.recent_transfers.length ?? 0) === 0 ? <p className="py-4 text-center text-sm text-muted">No stock has been transferred to or from this branch yet.</p> : (
          <ul className="divide-y divide-border">{stats.data!.recent_transfers.map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><div><span className="font-medium">{t.transfer_number}</span><span className="ml-2 text-[12px] text-muted">{t.direction === "incoming" ? "Incoming" : "Outgoing"}{t.created_at ? ` · ${fmtDate(t.created_at)}` : ""}</span></div><Pill tone={TONE[t.status as keyof typeof TONE] ?? "slate"}>{t.status.replace("_", " ")}</Pill></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
