"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowUpRight, Building2, X } from "lucide-react";
import type { TenantFeatureState } from "@/lib/api/admin";
import { useTenant, useTenantFeatures, useTenants } from "@/lib/api/hooks";
import FeatureItemsPanel from "@/app/(portal)/tenants/[id]/FeatureItemsPanel";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, SearchBox, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";

type Layer = { ok: boolean; yes: string; no: string };

function layers(f: TenantFeatureState): Layer[] {
  return [
    { ok: f.included, yes: "Included", no: "Not in plan" },
    { ok: !f.restricted, yes: "Allowed", no: "Restricted" },
    { ok: !f.business_off, yes: "On", no: "Turned off" },
  ];
}

const RESULT: Record<string, { label: string; tone: Tone; why: string }> = {
  enabled: { label: "Usable", tone: "green", why: "Every layer allows it; each user still needs a role permission." },
  not_included: { label: "Blocked", tone: "amber", why: "The business's plan does not include it." },
  restricted: { label: "Blocked", tone: "red", why: "Pesaa restricted it for this business." },
  available: { label: "Read-only", tone: "slate", why: "The business's administrator turned it off; history stays readable." },
};

/** Why one business can or can't use each module and each part of it, layer by layer, with the controls to change it. */
export default function AccessByBusinessPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const initial = use(searchParams).tenant;
  const [tenantId, setTenantId] = useState<string | undefined>(initial);
  const [q, setQ] = useState("");
  const search = useTenants(1, 8, { enabled: !tenantId && q.trim().length >= 2 }, { q: q.trim() });
  const tenant = useTenant(tenantId);
  const modules = useTenantFeatures(tenantId);

  return <div className="space-y-5">
    <PageHeader title="Access by business" subtitle="Pick a business to see why it can or can't use each module and its parts, and restrict or restore them." />

    {!tenantId ? <section aria-label="Find a business" className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Search a business by name" />
      {q.trim().length < 2 ? <EmptyState title="Find a business" description="Type at least two letters of its name." />
        : search.isLoading ? <PageLoader variant="compact" />
        : search.isError ? <ErrorState message="Could not search businesses." onRetry={() => void search.refetch()} />
        : (search.data?.items ?? []).length === 0 ? <EmptyState title="No business matches" description="Try another name." />
        : <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{(search.data?.items ?? []).map((t) => <li key={t.id}>
            <button type="button" onClick={() => setTenantId(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface/50">
              <Building2 size={16} aria-hidden className="flex-shrink-0 text-muted" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{t.name}</span><span className="block truncate font-mono text-[11px] text-muted">{t.slug}</span></span>
              <Badge tone={t.is_active ? "green" : "slate"} dot>{t.is_active ? "Active" : "Inactive"}</Badge>
            </button>
          </li>)}</ul>}
    </section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Building2 size={16} aria-hidden /></span>
          <div className="min-w-0"><p className="truncate text-sm font-bold">{tenant.data?.name ?? "Business"}</p><p className="truncate font-mono text-[11px] text-muted">{tenant.data?.slug ?? tenantId}</p></div>
        </div>
        <div className="flex gap-2">
          <Link href={`/tenants/${tenantId}`}><Button variant="secondary" size="sm"><ArrowUpRight size={13} /> Open business</Button></Link>
          <Button variant="ghost" size="sm" onClick={() => { setTenantId(undefined); setQ(""); }}><X size={13} /> Change</Button>
        </div>
      </div>

      {modules.isLoading ? <PageLoader variant="compact" /> : modules.isError || !modules.data ? <ErrorState message="Could not load this business's modules." onRetry={() => void modules.refetch()} />
        : <DataCard label="Modules for this business">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead><tr className="border-b border-border">
              <th scope="col" className={thClass}>Module</th><th scope="col" className={thClass}>1 · Plan</th><th scope="col" className={thClass}>2 · Pesaa</th>
              <th scope="col" className={thClass}>3 · Business</th><th scope="col" className={thClass}>Result</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{modules.data.map((f) => {
              const result = RESULT[f.status] ?? RESULT.enabled;
              return <tr key={f.key} className="hover:bg-surface/50">
                <td className="px-4 py-3"><Link href={`/features/${f.key}`} className="font-semibold hover:text-accent">{f.name}</Link><p className="font-mono text-[11px] text-muted">{f.key}</p></td>
                {layers(f).map((l, i) => <td key={i} className="px-4 py-3"><Badge tone={l.ok ? "green" : "red"}>{l.ok ? l.yes : l.no}</Badge></td>)}
                <td className="px-4 py-3"><Badge tone={result.tone} dot>{result.label}</Badge><p className="mt-1 max-w-[240px] text-[11px] text-muted">{result.why}</p></td>
              </tr>;
            })}</tbody>
          </table>
        </DataCard>}
      <p className="text-[12px] text-muted">A module is usable only when all three layers allow it. Plans are changed in Plans &amp; entitlements; the business’s own switch is theirs to change in Business Settings.</p>

      <div className="overflow-hidden rounded-xl border border-border bg-card"><FeatureItemsPanel tenantId={tenantId} /></div>
    </>}
  </div>;
}
