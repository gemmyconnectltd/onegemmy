"use client";

import Link from "next/link";
import type { FeatureControl } from "@/lib/api/admin";
import { UsageCard } from "@/components/usage/UsageShared";
import { Metric } from "@/components/ui/Metric";
import { Activity, Building2, GitBranch, Users } from "lucide-react";
import { ACTION_META } from "./status";
import { ImpactNote } from "./RuleEditor";

/** Who has this feature, who used it lately and how: accepted changes counted by the server (reads are not counted). */
export function UsagePanel({ c }: { c: FeatureControl }) {
  const days = c.usage.last_14_days;
  const peak = Math.max(1, ...days.map((d) => d.changes));
  const total = Object.values(c.usage.by_action).reduce((n, v) => n + v, 0);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Have the module" value={c.impact.entitled} sub="In their plan" icon={Building2} />
      <Metric label="Active, 30 days" value={c.impact.active_30d} sub="Made changes here" icon={Activity} />
      <Metric label="Changes, 30 days" value={total} sub="Accepted by the server" icon={Users} />
      <Metric label="Depend on it" value={c.impact.dependents.length} sub={c.impact.parts_inside ? `${c.impact.parts_inside} parts inside` : "Other parts"} icon={GitBranch} />
    </div>
    <UsageCard title="Changes per day" subtitle="Last 14 days">
      <ol className="flex h-32 items-end gap-1.5 py-2" aria-label="Changes per day, last 14 days">{days.map((d) => <li key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.changes}`}>
        <span className="block w-full rounded-t bg-accent" style={{ height: `${Math.max(d.changes ? 4 : 0, (d.changes / peak) * 100)}%` }} />
        <span className="sr-only">{d.day}: {d.changes} changes</span>
      </li>)}</ol>
      <div className="flex justify-between text-[11px] text-muted"><span>{days[0]?.day}</span><span>{days[days.length - 1]?.day}</span></div>
    </UsageCard>
    <div className="grid gap-4 lg:grid-cols-2">
      <UsageCard title="By action" subtitle="Last 30 days">
        {total === 0 ? <p className="py-4 text-center text-[13px] text-muted">No changes recorded yet.</p> : <ul className="divide-y divide-border">{Object.entries(c.usage.by_action).map(([a, n]) =>
          <li key={a} className="flex justify-between py-2 text-sm"><span>{ACTION_META[a as keyof typeof ACTION_META]?.label ?? a}</span><span className="font-semibold tabular-nums">{n}</span></li>)}</ul>}
      </UsageCard>
      <UsageCard title="Most active businesses" subtitle="Last 30 days">
        {c.usage.top_businesses.length === 0 ? <p className="py-4 text-center text-[13px] text-muted">Nobody yet.</p> : <ul className="divide-y divide-border">{c.usage.top_businesses.map((b) =>
          <li key={b.id} className="flex justify-between py-2 text-sm"><Link href={`/features/access?tenant=${b.id}`} className="font-medium hover:text-accent">{b.name}</Link><span className="font-semibold tabular-nums">{b.changes}</span></li>)}</ul>}
      </UsageCard>
    </div>
    <UsageCard title="Who a change reaches" subtitle="Shown again before you confirm any change"><div className="py-1"><ImpactNote impact={c.impact} /></div></UsageCard>
    {c.needs.length > 0 && <UsageCard title="Needs" subtitle="Stops taking changes when one of these is not available">
      <ul className="flex flex-wrap gap-2 py-1">{c.needs.map((n) => <li key={n.key}><Link href={`/features/${n.key}`} className="rounded-md bg-surface px-2 py-1 text-[13px] font-medium hover:text-accent">{n.name}</Link></li>)}</ul>
    </UsageCard>}
  </div>;
}
