"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Boxes, Building2, Eye, Layers, ToggleRight } from "lucide-react";
import { useFeatureDirectory } from "@/lib/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, Pagination, SearchBox, thClass, usePaged } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { X } from "lucide-react";
import { Metric } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";

const PAGE_SIZE = 25;

export default function FeatureDirectoryPage() {
  const [seg, setSeg] = useState({ industry: "", size: "", country: "", business_type: "", plan: "" });
  const segment = Object.fromEntries(Object.entries(seg).filter(([, v]) => v));
  const query = useFeatureDirectory(segment);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [module, setModule] = useState("all");
  const features = useMemo(() => query.data?.features ?? [], [query.data]);
  const modules = useMemo(() => [...new Set(features.map((f) => f.module))].sort(), [features]);
  const rows = useMemo(() => features.filter((f) => (status === "all" || (status === "active" ? f.is_active : !f.is_active))
    && (module === "all" || f.module === module)
    && `${f.name} ${f.key} ${f.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())), [features, q, status, module]);
  const paged = usePaged(rows, PAGE_SIZE, `${q}|${status}|${module}`);
  const total = query.data?.total_tenants ?? 0;
  const options = query.data?.options;
  const narrowed = Object.keys(segment).length > 0;
  const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : total ? `${n} (${Math.round((n / total) * 100)}%)` : String(n));
  const choose = (key: keyof typeof seg, list: { value: string; count: number }[] | undefined) => <>{(list ?? []).map((o) => <option key={o.value} value={o.value}>{o.value} ({o.count})</option>)}{seg[key] && !(list ?? []).some((o) => o.value === seg[key]) && <option value={seg[key]}>{seg[key]} (0)</option>}</>;

  return <div className="space-y-5">
    <PageHeader title="Features" subtitle="What PESAA offers, which plans include it and how much it is used. Each business chooses what to switch on inside its plan." />
    {query.isLoading ? <PageLoader variant="page" /> : query.isError || !query.data ? <ErrorState message="Could not load the feature directory." onRetry={() => void query.refetch()} /> : <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Features" value={features.length} sub={`${features.filter((f) => f.is_active).length} active`} icon={Layers} />
        <Metric label="Businesses" value={total} sub={narrowed ? `of ${query.data.all_tenants} (filtered)` : "Excluding archived"} icon={Building2} />
        <Metric label="Switched off" value={features.filter((f) => !f.is_active).length} sub="Platform-wide" icon={ToggleRight} />
        <Metric label="Without a plan" value={features.filter((f) => f.is_active && f.plans.length === 0).length} sub="Active but in no plan" icon={Boxes} />
      </div>
      <section aria-label="Business filters" className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">Numbers for:</span>
        <Select aria-label="Industry" value={seg.industry} onChange={(e) => setSeg({ ...seg, industry: e.target.value })} className="w-auto! max-w-[180px]"><option value="">All industries</option>{choose("industry", options?.industries)}</Select>
        <Select aria-label="Business size (people)" value={seg.size} onChange={(e) => setSeg({ ...seg, size: e.target.value })} className="w-auto!"><option value="">Any size</option>{choose("size", options?.sizes)}</Select>
        <Select aria-label="Country" value={seg.country} onChange={(e) => setSeg({ ...seg, country: e.target.value })} className="w-auto! max-w-[170px]"><option value="">All countries</option>{choose("country", options?.countries)}</Select>
        <Select aria-label="Business type" value={seg.business_type} onChange={(e) => setSeg({ ...seg, business_type: e.target.value })} className="w-auto!"><option value="">Any type</option>{choose("business_type", options?.business_types)}</Select>
        <Select aria-label="Plan" value={seg.plan} onChange={(e) => setSeg({ ...seg, plan: e.target.value })} className="w-auto!"><option value="">Any plan</option>{(options?.plans ?? []).map((p) => <option key={p.value} value={p.value}>{p.label} ({p.count})</option>)}</Select>
        {narrowed && <button type="button" onClick={() => setSeg({ industry: "", size: "", country: "", business_type: "", plan: "" })} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"><X size={12} /> Clear</button>}
      </section>
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search features" />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto"><option value="all">All statuses</option><option value="active">Active</option><option value="off">Switched off</option></Select>
        <Select aria-label="Category" value={module} onChange={(e) => setModule(e.target.value)} className="w-auto"><option value="all">All categories</option>{modules.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}</Select>
      </div>
      {rows.length === 0 ? <EmptyState title="No features match" description="Try a different search or filter." /> : <>
        <DataCard label="Features">
          <table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b border-border">
            <th scope="col" className={thClass}>Feature</th><th scope="col" className={thClass}>Category</th><th scope="col" className={thClass}>Status</th><th scope="col" className={thClass}>Plans</th>
            <th scope="col" className={`${thClass} text-right`}>Included</th><th scope="col" className={`${thClass} text-right`}>Switched on</th><th scope="col" className={`${thClass} text-right`}>Using</th><th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
          </tr></thead><tbody className="divide-y divide-border">{paged.slice.map((f) => <tr key={f.key} className="hover:bg-surface/50">
            <td className="px-4 py-3"><p className="font-semibold">{f.name}</p><p className="text-[11px] text-muted"><span className="font-mono">{f.key}</span>{f.needs.length > 0 && <> · needs {f.needs.map((n) => n.name).join(", ")}</>}</p></td>
            <td className="px-4 py-3 capitalize text-muted">{f.module}</td>
            <td className="px-4 py-3"><Badge tone={f.is_active ? "green" : "slate"} dot>{f.is_active ? "Active" : "Switched off"}</Badge></td>
            <td className="px-4 py-3 text-[12px] text-muted">{f.plans.length ? f.plans.map((p) => p.name).join(", ") : "None"}</td>
            <td className="px-4 py-3 text-right tabular-nums">{pct(f.entitled_tenants)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{pct(f.active_tenants)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{pct(f.using_tenants)}</td>
            <td className="px-4 py-3 text-right"><Link href={`/features/${f.key}`}><Button variant="secondary" size="sm"><Eye size={13} /> View</Button></Link></td>
          </tr>)}</tbody></table>
        </DataCard>
        <Pagination page={paged.page} pageSize={PAGE_SIZE} total={rows.length} onPage={paged.setPage} noun="feature" />
      </>}
      <p className="text-[12px] text-muted">“Included” counts businesses whose plan has the feature, “Switched on” those that have not been switched off by PESAA or by the business, and “Using” those with at least one record in it.</p>
    </>}
  </div>;
}
