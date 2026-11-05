"use client";
import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { useDmBusinesses, useDmMe } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { SearchBox, Pagination } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/PageLoader";
import { errorText } from "./common";

/** The global entry point: no business's records are shown until one is chosen here. */
export function BusinessPicker() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const me = useDmMe();
  const q = useDmBusinesses(page, search);
  // No Data Management permission is given automatically. Say so, and say how, instead of showing an error.
  if (me.data && !me.data.permissions.includes("data:view")) {
    return (
      <div className="space-y-4">
        <div><h1 className="pesaa-page-title">Data Management</h1></div>
        <EmptyState title="Your account has no Data Management permissions yet" description="Permissions are never given automatically. An administrator with access to the server grants them one by one, which is also written to the audit log." />
        <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-[13px]">
          <p className="font-semibold">To give this account access, run on the server:</p>
          <code className="block overflow-x-auto whitespace-pre rounded-lg bg-surface px-3 py-2 text-[12px]">{`python -m scripts.grant_data_permissions --email <your email> --grant all`}</code>
          <p className="text-muted">Use <strong>view, preview, request, history</strong> for someone who prepares work, and <strong>view, approve, history</strong> for the second person who approves it. Then reload this page.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div><h1 className="pesaa-page-title">Data Management</h1><p className="mt-0.5 text-sm text-muted">Choose a business. Its records, filters and operations open next. Nothing is shown or changed until you do.</p></div>
      <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search businesses" />
      {q.isLoading && <PageLoader />}
      {q.error && <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />}
      {q.data && q.data.items.length === 0 && <EmptyState icon={Building2} title="No business found" description="Try a different name." />}
      {q.data && q.data.items.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {q.data.items.map((b) => (
            <li key={b.id}><Link href={`/data-management?tenant=${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/60">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent" aria-hidden>{b.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{b.name}</span><span className="block truncate text-[12px] text-muted">{b.slug}</span></span>
              <Badge tone={b.status === "Active" ? "green" : "red"} dot>{b.status}</Badge><ChevronRight size={16} className="text-muted" aria-hidden /></Link></li>))}
        </ul>
      )}
      {q.data && <Pagination page={page} pageSize={20} total={q.data.total} onPage={setPage} noun="business" />}
    </div>
  );
}
