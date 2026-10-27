"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { useUsageEngagement } from "@/lib/api/hooks";
import type { EngagementCategory } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { DataCard, Pagination, SearchBox, thClass } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Form";
import { Breadcrumbs, StatusPill, TenantLink, TIERS, TIER_LABEL, fmtCount, fmtWhen } from "@/components/usage/UsageShared";

export default function EngagementPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params);
  if (!TIERS.includes(category as EngagementCategory)) notFound();
  return <EngagementList category={category as EngagementCategory} />;
}

function EngagementList({ category }: { category: EngagementCategory }) {
  const [f, setF] = useState({ page: 1, q: "", status: "all", sort: "orders", dir: "desc" });
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch, page: patch.page ?? 1 }));
  const query = useUsageEngagement(category, f);
  const data = query.data;
  const head = (label: string, sort?: string) => <th key={label} scope="col" className={thClass} aria-sort={sort && f.sort === sort ? (f.dir === "asc" ? "ascending" : "descending") : undefined}>
    {sort ? <button type="button" className="font-semibold hover:text-foreground" onClick={() => set({ sort, dir: f.sort === sort && f.dir === "desc" ? "asc" : "desc" })}>{label}{f.sort === sort ? (f.dir === "asc" ? " ↑" : " ↓") : ""}</button> : label}</th>;
  return <div className="space-y-5">
    <div><Breadcrumbs items={[{ label: "Platform Usage", href: "/usage" }, { label: `${TIER_LABEL[category]} tenants` }]} />
      <PageHeader title={`${TIER_LABEL[category]} Tenants`} subtitle={<>{data?.summary.definition ?? ""} Based on all-time order counts, the same rule as the Tenant Engagement card.</>} /></div>
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox value={f.q} onChange={(q) => set({ q })} placeholder="Search businesses" />
      <Select aria-label="Status" className="w-auto!" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></Select>
    </div>
    {query.isLoading ? <PageLoader variant="compact" /> : query.isError || !data ? <ErrorState message="Could not load these businesses." onRetry={() => void query.refetch()} /> :
      !data.items.length ? <EmptyState title={f.q || f.status !== "all" ? "No businesses match" : `No ${TIER_LABEL[category].toLowerCase()} businesses`} description={f.q || f.status !== "all" ? "Try a different search or status." : "Nothing falls into this category right now."} /> :
        <DataCard label={`${TIER_LABEL[category]} tenants`}><table className="w-full min-w-[760px] text-left text-sm"><thead><tr>{head("Business", "name")}{head("Users", "users")}{head("Orders", "orders")}{head("Last activity", "last_activity")}<th scope="col" className={thClass}>Engagement</th>{head("Subscription")}<th scope="col" className={thClass}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-border">{data.items.map((t) => <tr key={t.id}><td className="px-4 py-3"><TenantLink tenant={t} /></td><td className="px-4 py-3 tabular-nums">{fmtCount(t.users)}</td><td className="px-4 py-3 tabular-nums">{fmtCount(t.orders)}</td><td className="px-4 py-3 text-muted">{fmtWhen(t.last_activity)}</td><td className="px-4 py-3">{TIER_LABEL[t.category]}</td><td className="px-4 py-3"><StatusPill status={t.status} /> <span className="ml-1 text-xs capitalize text-muted">{t.plan}</span></td><td className="px-4 py-3 text-right"><TenantLink tenant={{ id: t.id, name: "View" }} tab="overview" /></td></tr>)}</tbody></table></DataCard>}
    <Pagination page={f.page} pageSize={25} total={data?.total ?? 0} onPage={(page) => set({ page })} noun="business" />
  </div>;
}
