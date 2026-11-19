"use client";

import { useState } from "react";
import { Building2, GitFork, OctagonX, Plus, Trash2, User } from "lucide-react";
import type { FeatureCohortMember, FeatureControl } from "@/lib/api/admin";
import { useAddFeatureCohort, useRemoveFeatureCohort, useSetFeatureKill, useSetFeatureRollout, useTenantBranches, useTenantUsers, useTenants } from "@/lib/api/hooks";
import { ReasonDialog } from "@/components/features/ReasonDialog";
import { UsageCard } from "@/components/usage/UsageShared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchBox } from "@/components/ui/DataTable";
import { Field, Select } from "@/components/ui/Form";
import { errorText } from "./status";

const TYPE_META: Record<FeatureCohortMember["target_type"], { label: string; icon: typeof Building2 }> = {
  tenant: { label: "Business", icon: Building2 },
  branch: { label: "Branch", icon: GitFork },
  user: { label: "User", icon: User },
};

/** Kill switch, percentage rollout and the beta cohort for one module or part. */
export function RolloutPanel({ c }: { c: FeatureControl }) {
  const kill = useSetFeatureKill();
  const rollout = useSetFeatureRollout();
  const [percent, setPercent] = useState(c.rollout_percent);
  const [dialog, setDialog] = useState<"kill" | "rollout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const percentApplies = c.status === "active" || c.status === "deprecated";

  const submit = async (reason: string) => {
    setError(null);
    try {
      if (dialog === "kill") await kill.mutateAsync({ key: c.key, on: !c.kill_switch, reason, confirmKey: c.kill_switch ? undefined : c.key });
      else await rollout.mutateAsync({ key: c.key, percent, reason });
      setDialog(null);
    } catch (e: unknown) { setError(errorText(e)); }
  };

  return <div className="space-y-4">
    <UsageCard title="Kill switch" subtitle="Stops all new changes for every business at once, whatever the status. Records stay readable.">
      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="space-y-1">
          <Badge tone={c.kill_switch ? "red" : "green"} dot>{c.kill_switch ? "Stopped" : "Running"}</Badge>
          {c.kill_switch && c.kill_reason && <p className="text-[12px] text-muted">Reason: {c.kill_reason}</p>}
        </div>
        <Button variant={c.kill_switch ? "secondary" : "destructive"} onClick={() => { setError(null); setDialog("kill"); }}>
          <OctagonX size={14} /> {c.kill_switch ? "Restart…" : "Stop now…"}
        </Button>
      </div>
    </UsageCard>

    <UsageCard title="Percentage rollout" subtitle={percentApplies ? "Share of businesses that get it. The same businesses stay in as the share grows." : "Applies while the status is Active or Deprecated. In Beta only the cohort gets it."}>
      <div className="space-y-4 py-1">
        <div className="flex flex-wrap items-center gap-4">
          <input type="range" min={0} max={100} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} aria-label="Rollout percentage" className="w-full max-w-md accent-[var(--primary)]" />
          <span className="text-2xl font-bold tabular-nums">{percent}%</span>
        </div>
        <p className="text-[12px] text-muted">{percent === 100 ? "Every eligible business." : percent === 0 ? "Only the cohort below." : `About ${percent} in every 100 eligible businesses, plus the cohort below.`}</p>
        <div className="flex gap-2 border-t border-border pt-4">
          <Button disabled={percent === c.rollout_percent} onClick={() => { setError(null); setDialog("rollout"); }}>Save rollout…</Button>
          {percent !== c.rollout_percent && <Button variant="ghost" onClick={() => setPercent(c.rollout_percent)}>Reset</Button>}
        </div>
      </div>
    </UsageCard>

    <Cohort c={c} />

    {dialog && <ReasonDialog
      title={dialog === "kill" ? (c.kill_switch ? `Restart ${c.name}?` : `Stop ${c.name} for every business?`) : `Roll ${c.name} out to ${percent}%?`}
      message={dialog === "kill" ? (c.kill_switch ? "Businesses can make changes again, as their status, plan and roles allow." : "Nobody can create or change anything here until you restart it. In-progress records stay as they are and stay readable.") : "Businesses outside the share stop seeing it; their earlier records stay readable."}
      confirmLabel={dialog === "kill" ? (c.kill_switch ? "Restart" : "Stop now") : "Save"} danger={dialog === "kill" && !c.kill_switch}
      requireKey={dialog === "kill" && !c.kill_switch ? c.key : undefined} pending={kill.isPending || rollout.isPending} error={error}
      onSubmit={(r) => void submit(r)} onClose={() => setDialog(null)} />}
  </div>;
}

function Cohort({ c }: { c: FeatureControl }) {
  const add = useAddFeatureCohort();
  const remove = useRemoveFeatureCohort();
  const [type, setType] = useState<FeatureCohortMember["target_type"]>("tenant");
  const [q, setQ] = useState("");
  const [tenant, setTenant] = useState<{ id: string; name: string } | null>(null);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const search = useTenants(1, 6, { enabled: !tenant && q.trim().length >= 2 }, { q: q.trim() });
  const branches = useTenantBranches(type === "branch" ? tenant?.id : undefined);
  const users = useTenantUsers(type === "user" ? tenant?.id : undefined);
  const options = type === "branch" ? (branches.data?.items ?? []).map((b) => ({ id: b.id, label: b.name }))
    : type === "user" ? (users.data?.items ?? []).map((u) => ({ id: u.id, label: `${u.full_name} (${u.email})` })) : [];
  const targetId = type === "tenant" ? tenant?.id : pick;

  const submit = async () => {
    if (!targetId) return;
    setError(null);
    try { await add.mutateAsync({ key: c.key, type, id: targetId }); setPick(""); if (type === "tenant") { setTenant(null); setQ(""); } }
    catch (e: unknown) { setError(errorText(e, "Could not add.")); }
  };

  return <UsageCard title="Beta & early access cohort" subtitle={`Always get ${c.name}, in Beta and ahead of the rollout. ${c.cohort.length} in the cohort.`}>
    <div className="space-y-4 py-1">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Who"><Select value={type} onChange={(e) => { setType(e.target.value as FeatureCohortMember["target_type"]); setPick(""); }}>
          <option value="tenant">A whole business</option><option value="branch">One branch</option><option value="user">One user</option>
        </Select></Field>
        <Field label="Business">{tenant
          ? <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"><span className="truncate font-medium">{tenant.name}</span><Button variant="ghost" size="sm" onClick={() => { setTenant(null); setPick(""); }}>Change</Button></div>
          : <div className="space-y-2"><SearchBox value={q} onChange={setQ} placeholder="Search a business" />
            {(search.data?.items ?? []).length > 0 && <ul className="divide-y divide-border rounded-lg border border-border">{(search.data?.items ?? []).map((t) =>
              <li key={t.id}><button type="button" onClick={() => setTenant({ id: t.id, name: t.name })} className="w-full px-3 py-2 text-left text-sm hover:bg-surface/50">{t.name}</button></li>)}</ul>}
          </div>}
        </Field>
      </div>
      {tenant && type !== "tenant" && <Field label={type === "branch" ? "Branch" : "User"}>
        <Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
      </Field>}
      <div className="flex items-center gap-3">
        <Button onClick={() => void submit()} disabled={!targetId || add.isPending}><Plus size={14} /> Add to cohort</Button>
        {error && <span role="alert" className="text-[13px] font-medium text-[var(--error)]">{error}</span>}
      </div>
      {c.cohort.length === 0 ? <p className="rounded-lg bg-surface px-3 py-4 text-center text-[13px] text-muted">Nobody yet. In Beta, only the cohort gets this feature.</p>
        : <ul className="divide-y divide-border rounded-lg border border-border">{c.cohort.map((m) => {
          const Icon = TYPE_META[m.target_type].icon;
          return <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon size={15} aria-hidden className="flex-shrink-0 text-muted" />
              <div className="min-w-0"><p className="truncate text-sm font-medium">{m.label ?? m.target_id}</p><p className="truncate text-[12px] text-muted">{TYPE_META[m.target_type].label}{m.target_type !== "tenant" ? ` · ${m.tenant_name}` : ""}</p></div>
            </div>
            <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate({ key: c.key, memberId: m.id })} aria-label={`Remove ${m.label ?? "member"} from the cohort`}><Trash2 size={13} /></Button>
          </li>;
        })}</ul>}
    </div>
  </UsageCard>;
}
