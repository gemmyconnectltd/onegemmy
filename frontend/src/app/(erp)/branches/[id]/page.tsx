"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/PageLoader";
import { BranchActivityTab } from "@/components/branches/BranchActivityTab";
import { BranchInventoryTab } from "@/components/branches/BranchInventoryTab";
import { BranchOverviewTab } from "@/components/branches/BranchOverviewTab";
import { BranchSalesTab } from "@/components/branches/BranchSalesTab";
import { BranchSettingsTab } from "@/components/branches/BranchSettingsTab";
import { BranchStaffTab } from "@/components/branches/BranchStaffTab";
import { MainBadge, RowMenu, StatusPill } from "@/components/branches/parts";
import { useBranchOverview, useMyBranch } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" }, { id: "staff", label: "Staff & Access" }, { id: "inventory", label: "Inventory" },
  { id: "sales", label: "Sales & Reports" }, { id: "settings", label: "Settings" }, { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function BranchWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const { hasPermission, activeBranchId } = useAuth();
  const q = useMyBranch(id);
  const counts = useBranchOverview({ page: 1, branchId: id });
  const tab: TabId = TABS.some((t) => t.id === search.get("tab")) ? (search.get("tab") as TabId) : "overview";
  const go = (t: string) => router.replace(`/branches/${id}?tab=${t}`, { scroll: false });

  if (q.isLoading) return <PageLoader variant="compact" />;
  if (q.isError || !q.data) {
    const denied = (q.error as { status?: number } | null)?.status === 403;
    return (
      <div className="py-16 text-center">
        <Building2 className="mx-auto mb-3 text-muted" size={28} aria-hidden />
        <h1 className="text-lg font-bold text-foreground">{denied ? "You don't have access to this branch" : "Branch not found"}</h1>
        <p className="mt-1 text-sm text-muted">{denied ? "Ask an administrator to add it to your branches." : "It may have been deleted, or it belongs to another business."}</p>
        <Link href="/branches"><Button variant="outline" className="mt-4">Back to Branches</Button></Link>
      </div>
    );
  }
  const b = q.data;
  const staff = counts.data?.items[0]?.staff ?? 0;
  const canEdit = hasPermission("branches:update");
  const selecting = activeBranchId === b.id;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Link href="/branches" className="mb-2 inline-block text-[12px] font-semibold text-muted hover:text-foreground">← Branches</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-bold tracking-tight text-foreground">{b.name}</h1><StatusPill status={b.status} />{b.is_main && <MainBadge />}</div>
            <p className="mt-0.5 text-sm text-muted">{b.location || "No location set"}{b.phone ? ` · ${b.phone}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && <Button onClick={() => go("settings")}>Edit branch</Button>}
            <RowMenu label="More actions" items={[{ label: "Manage staff", onSelect: () => go("staff") }, { label: "View sales", onSelect: () => go("sales") }, { label: "Status and deletion", onSelect: () => go("settings") }, { label: "All branches", href: "/branches" }]} />
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted">You&apos;re managing <strong className="text-foreground">{b.name}</strong>. {selecting ? "It is also the branch selected in the top bar." : "The branch selector in the top bar is unchanged; operations links below switch it for you."}</p>
      </div>
      <div role="tablist" aria-label="Branch sections" className="no-scrollbar flex overflow-x-auto border-b border-border">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)} className={cn("whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-accent", tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground")}>{t.label}</button>)}
      </div>
      {tab === "overview" && <BranchOverviewTab branch={b} goTab={go} />}
      {tab === "staff" && <BranchStaffTab branchId={b.id} branchName={b.name} />}
      {tab === "inventory" && <BranchInventoryTab branchId={b.id} branchName={b.name} />}
      {tab === "sales" && <BranchSalesTab branchId={b.id} />}
      {tab === "settings" && <BranchSettingsTab branch={b} staff={staff} />}
      {tab === "activity" && <BranchActivityTab id={b.id} />}
    </div>
  );
}
