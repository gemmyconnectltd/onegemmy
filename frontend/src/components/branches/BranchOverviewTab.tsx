"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card, Stat } from "@/components/branches/parts";
import { useBranchActivity, useBranchOverview, useMyEntitlements } from "@/lib/api/hooks";
import type { ApiBranch } from "@/lib/api";
import { useAppConfig } from "@/lib/appConfig";
import { presetRange } from "@/lib/branchView";
import { fmtMoney } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useWorkInBranch } from "@/lib/useWorkInBranch";
import { BranchEventList } from "@/components/branches/BranchActivityTab";

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => <><dt className="text-muted">{label}</dt><dd className="min-w-0 break-words text-foreground">{value || "—"}</dd></>;

export function BranchOverviewTab({ branch, goTab }: { branch: ApiBranch; goTab: (t: string) => void }) {
  const { currencySymbol } = useAppConfig();
  const { hasPermission } = useAuth();
  const range = presetRange("month");
  const stats = useBranchOverview({ page: 1, branchId: branch.id, from: range.from, to: range.to });
  const activity = useBranchActivity(branch.id);
  const { data: ent } = useMyEntitlements();
  const open = useWorkInBranch(branch.id);
  const row = stats.data?.items[0];
  const summary = stats.data?.summary;
  const on = (feature: string) => ent?.features[feature] !== false;

  return (
    <div className="space-y-4">
      {stats.isLoading ? <PageLoader variant="compact" /> : (
        <section aria-label="This month">
          <p className="mb-2 text-[12px] text-muted">Figures for this month so far ({summary?.from_date} to {summary?.to_date}). Open the Sales &amp; Reports tab for other periods.</p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Assigned staff" value={row?.staff ?? 0} sub={row ? `${row.active_staff} active` : undefined} />
            {row?.sales != null ? <><Stat label="Sales" value={fmtMoney(row.sales, currencySymbol)} sub="Completed orders" /><Stat label="Orders" value={row.orders ?? 0} /><Stat label="Average order" value={row.orders ? fmtMoney(row.sales / row.orders, currencySymbol) : "—"} /></> : <Stat label="Sales" value="—" sub="Not available to you" />}
          </div>
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Branch information">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm"><Row label="Name" value={branch.name} /><Row label="Location" value={branch.location} /><Row label="Phone" value={branch.phone} /><Row label="Email" value={branch.email} /><Row label="Status" value={branch.status === "active" ? "Active" : "Inactive"} /><Row label="Main branch" value={branch.is_main ? "Yes" : "No"} /></dl>
          {hasPermission("branches:update") && <Button variant="outline" size="sm" className="mt-3" onClick={() => goTab("settings")}>Edit branch</Button>}
        </Card>
        <Card title="Operations" hint="Opens the existing pages with this branch selected.">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => goTab("staff")}>Staff &amp; access</Button>
            {on("sales") && <Button variant="secondary" size="sm" onClick={() => open("/sales/orders")}>Branch sales</Button>}
            {on("inventory") && <Button variant="secondary" size="sm" onClick={() => goTab("inventory")}>Stock transfers</Button>}
            {on("accounting") && <Button variant="secondary" size="sm" onClick={() => open("/expenses")}>Branch expenses</Button>}
            <Button variant="secondary" size="sm" onClick={() => open("/reports/daily")}>Reports</Button>
          </div>
        </Card>
      </div>
      <Card title="Recent activity" action={<button type="button" className="text-[12px] font-semibold text-accent hover:underline" onClick={() => goTab("activity")}>View all</button>}>
        {activity.isLoading ? <PageLoader variant="compact" /> : activity.isError ? <p className="text-sm text-muted">Activity isn&apos;t available to you.</p> : <BranchEventList events={(activity.data ?? []).slice(0, 5)} />}
      </Card>
      <p className="text-[12px] text-muted">Looking for another place? <Link href="/branches" className="font-semibold text-accent hover:underline">All branches</Link></p>
    </div>
  );
}
