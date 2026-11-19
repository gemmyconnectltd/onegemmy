"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ArrowUpRight, Building2, CalendarClock, Check, Minus, X } from "lucide-react";
import type { AccessRow, FeatureAction } from "@/lib/api/admin";
import { useFeatureAccess, useTenantUsers, useTenants } from "@/lib/api/hooks";
import { fmtDateTime } from "@/lib/date";
import FeatureItemsPanel from "@/app/(portal)/tenants/[id]/FeatureItemsPanel";
import { ACTION_META, STATUS_META } from "@/components/product-control/status";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataCard, SearchBox, thClass } from "@/components/ui/DataTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";

const MODULE_STATE: Record<string, { label: string; tone: Tone }> = {
  enabled: { label: "In plan · on", tone: "green" },
  available: { label: "Turned off by business", tone: "slate" },
  not_included: { label: "Not in plan", tone: "amber" },
  restricted: { label: "Restricted by Pesaa", tone: "red" },
};
const RESULT: Record<AccessRow["result"], { label: string; tone: Tone }> = {
  usable: { label: "Usable", tone: "green" }, read_only: { label: "Read-only", tone: "amber" }, blocked: { label: "Not available", tone: "red" },
};

/** Why one business — or one of its users — can or can't use each module and part, layer by layer. */
export default function AccessByBusinessPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const initial = use(searchParams).tenant;
  const [tenantId, setTenantId] = useState<string | undefined>(initial);
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const search = useTenants(1, 8, { enabled: !tenantId && q.trim().length >= 2 }, { q: q.trim() });
  const users = useTenantUsers(tenantId);
  const access = useFeatureAccess(tenantId, userId || undefined);
  const rows = useMemo(() => (access.data?.rows ?? []).filter((r) => !onlyIssues || r.result !== "usable" || Object.values(r.actions).some((v) => !v) || r.exception || r.upcoming),
    [access.data, onlyIssues]);
  const modules = useMemo(() => [...new Set(rows.map((r) => r.module))], [rows]);

  return <div className="space-y-5">
    <PageHeader title="Access by business" subtitle="Pick a business, and optionally one of its people, to see what they can use, what they can do and why." />

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
          <p className="truncate text-sm font-bold">{access.data?.tenant.name ?? "Business"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="View as" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-auto max-w-[260px]">
            <option value="">View as: a regular member</option>
            {(users.data?.items ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.is_superuser ? "Owner" : u.role}</option>)}
          </Select>
          <Link href={`/tenants/${tenantId}`}><Button variant="secondary" size="sm"><ArrowUpRight size={13} /> Open business</Button></Link>
          <Button variant="ghost" size="sm" onClick={() => { setTenantId(undefined); setUserId(""); setQ(""); }}><X size={13} /> Change</Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only show what is limited, has an exception or a coming change</label>

      {access.isLoading ? <PageLoader variant="compact" /> : access.isError || !access.data ? <ErrorState message="Could not load this business's access." onRetry={() => void access.refetch()} />
        : rows.length === 0 ? <EmptyState title="Nothing limited" description="Every module and part is usable for this business." />
        : <DataCard label="Access">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead><tr className="border-b border-border">
              <th scope="col" className={thClass}>Module / part</th><th scope="col" className={thClass}>1 · Plan &amp; business</th>
              <th scope="col" className={thClass}>2 · Pesaa</th><th scope="col" className={thClass}>Result</th>
              <th scope="col" className={thClass}>{access.data.as === "user" ? `What ${access.data.user?.name.split(" ")[0]} can do` : "What a regular member can do"}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{modules.flatMap((m) => rows.filter((r) => r.module === m)).map((r) => <tr key={r.key} className={r.level === "module" ? "bg-surface/50" : undefined}>
              <td className="px-4 py-3">
                <div style={{ paddingLeft: r.level === "module" ? 0 : r.parent ? 32 : 16 }}>
                  <Link href={`/features/${r.key}`} className={(r.level === "module" ? "font-semibold" : "font-medium") + " hover:text-accent"}>{r.name}</Link>
                  <p className="font-mono text-[11px] text-muted">{r.key}</p>
                </div>
              </td>
              <td className="px-4 py-3">{r.level === "module" ? <Badge tone={(MODULE_STATE[r.module_state] ?? MODULE_STATE.not_included).tone}>{(MODULE_STATE[r.module_state] ?? MODULE_STATE.not_included).label}</Badge>
                : r.restricted ? <Badge tone="red">Restricted for this business</Badge> : <span className="text-[12px] text-muted">Follows the module</span>}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1"><Badge tone={STATUS_META[r.status].tone} dot>{STATUS_META[r.status].label}</Badge>
                  {r.exception && <Badge tone="violet">Exception</Badge>}{r.in_cohort && <Badge tone="blue">In cohort</Badge>}</div>
                {r.message && <p className="mt-1 max-w-[260px] text-[11px] text-muted">{r.message}</p>}
                {r.upcoming && <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--warning)]"><CalendarClock size={11} aria-hidden />{STATUS_META[r.upcoming.status].label} from {fmtDateTime(r.upcoming.at)}</p>}
              </td>
              <td className="px-4 py-3"><Badge tone={RESULT[r.result].tone} dot>{RESULT[r.result].label}</Badge></td>
              <td className="px-4 py-3"><ul className="flex flex-wrap gap-1">{(Object.keys(ACTION_META) as FeatureAction[]).map((a) => {
                const ok = r.actions[a];
                const why = r.action_reasons[a] ?? (ok ? "" : "Not usable here");
                return <li key={a} title={why} className={"inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] " + (ok ? "bg-surface text-foreground" : "bg-surface text-muted line-through")}>
                  {ok ? <Check size={11} aria-hidden /> : r.action_reasons[a] ? <X size={11} aria-hidden /> : <Minus size={11} aria-hidden />}{ACTION_META[a].label}
                  <span className="sr-only">{ok ? ": allowed" : `: not allowed. ${why}`}</span>
                </li>;
              })}</ul></td>
            </tr>)}</tbody>
          </table>
        </DataCard>}
      <p className="text-[12px] text-muted">Owners and administrators pass role limits. Each user still needs the business&apos;s own role permission for an action; that is managed by the business in Team &amp; Access.</p>

      <div className="overflow-hidden rounded-xl border border-border bg-card"><FeatureItemsPanel tenantId={tenantId} /></div>
    </>}
  </div>;
}
