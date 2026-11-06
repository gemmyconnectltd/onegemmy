"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { useDmBusinesses, useDmMe, useDmMeta } from "@/lib/api/hooks";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { BusinessRequestQueue } from "./BusinessRequestQueue";

/** Requests from business owners and operations waiting for approval, with filters. Filters live in the address so a view can be shared. */
export function OwnerRequests() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useDmMe().data;
  const perms = me?.permissions ?? [];
  const tenant = params.get("tenant") ?? "", moduleKey = params.get("module") ?? "", from = params.get("from") ?? "", to = params.get("to") ?? "";
  const meta = useDmMeta({ enabled: perms.includes("data:view") }).data;
  const businesses = useDmBusinesses({ page: 1, page_size: 100, sort: "name" }, { enabled: perms.includes("data:view") }).data;
  const set = (k: string, v: string) => { const n = new URLSearchParams(params.toString()); if (v) n.set(k, v); else n.delete(k); router.replace(n.toString() ? `?${n}` : "?", { scroll: false }); };
  if (!me) return <PageLoader />;
  if (!perms.includes("data:preview") && !perms.includes("data:approve")) return <EmptyState title="You do not have access to owner requests" description="It needs the Preview operations or Approve operations permission." />;
  const filtered = !!(tenant || moduleKey || from || to);
  return (
    <div className="space-y-4">
      <PageHeader title="Requests and approvals" subtitle="Date-bounded review requests from business owners, and operations waiting for approval."
        back={<Link href="/data-management" aria-label="Back to Data Management" className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted hover:text-foreground"><ArrowLeft size={16} /></Link>}
        actions={<Link href="/data-management/operations?status=PendingApproval"><Button variant="outline" size="sm">Operations waiting for approval</Button></Link>} />
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        {businesses && <label className="text-[11px] font-medium text-muted">Business<Select aria-label="Business" className="mt-0.5 w-auto max-w-[16rem]" value={tenant} onChange={(e) => set("tenant", e.target.value)}><option value="">All businesses</option>{businesses.items.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></label>}
        {meta && <label className="text-[11px] font-medium text-muted">Module<Select aria-label="Module" className="mt-0.5 w-auto" value={moduleKey} onChange={(e) => set("module", e.target.value)}><option value="">All modules</option>{meta.modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></label>}
        <label className="text-[11px] font-medium text-muted">Submitted from<Input type="date" className="mt-0.5 w-auto" value={from} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="text-[11px] font-medium text-muted">Submitted to<Input type="date" className="mt-0.5 w-auto" min={from || undefined} value={to} onChange={(e) => set("to", e.target.value)} /></label>
        <Button variant="outline" size="sm" disabled={!filtered} onClick={() => router.replace("?", { scroll: false })}><X size={13} /> Clear filters</Button>
      </div>
      <BusinessRequestQueue tenantId={tenant || undefined} module={moduleKey || undefined} fromDate={from || undefined} toDate={to || undefined} canPreview={perms.includes("data:preview")} canReject={perms.includes("data:approve")} />
    </div>
  );
}
