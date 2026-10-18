"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Inbox, Search, UserCheck, Users } from "lucide-react";
import { AgentAvatar } from "@/components/support/Avatars";
import { AgentSelector } from "@/components/support/AgentSelector";
import { ChannelIcon } from "@/components/support/Avatars";
import { EmptyState, ListSkeleton } from "@/components/support/EmptyState";
import { StatusBadge } from "@/components/support/StatusBadge";
import { SupportPageHeader } from "@/components/support/SupportPageHeader";
import { Drawer } from "@/components/ui/Drawer";
import { TableScroll } from "@/components/ui/TableScroll";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/utils";
import { useSupport } from "@/lib/support/store";
import type { AgentAvailability, AssignmentRules, SupportAgent } from "@/lib/support/types";

const AVAIL: AgentAvailability[] = ["online", "away", "offline"];

export default function TeamPage() {
  const { data, loading, actions } = useSupport();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [avail, setAvail] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.agents
      .filter((a) => (!s || a.name.toLowerCase().includes(s) || a.email.toLowerCase().includes(s)) && (role === "all" || a.role === role) && (avail === "all" || a.availability === avail))
      .map((a) => {
        const mine = data.conversations.filter((c) => c.assigneeId === a.id);
        return { agent: a, open: mine.filter((c) => c.status !== "resolved").length, resolved: mine.filter((c) => c.status === "resolved").length };
      });
  }, [data, q, role, avail]);

  const unassigned = (data?.conversations ?? []).filter((c) => c.assigneeId === null && c.status !== "resolved");
  const max = data?.rules.maxOpenPerAgent ?? 12;
  const agent = data?.agents.find((a) => a.id === openId) as SupportAgent | undefined;
  const agentConvs = (data?.conversations ?? []).filter((c) => c.assigneeId === openId);
  const ctl = "rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-accent";

  const setRule = (patch: Partial<AssignmentRules>) => actions.updateRules(patch);

  return (
    <div className="space-y-4">
      <SupportPageHeader title="Team & assignments" description="Who is available, how busy they are, and who owns each conversation. Sample team for the demo." />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input type="search" aria-label="Search team" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team members" className={`${ctl} w-full pl-8 text-base sm:text-[13px]`} /></div>
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className={ctl}><option value="all">All roles</option><option>Support lead</option><option>Support agent</option><option>Billing specialist</option></select>
        <select aria-label="Availability" value={avail} onChange={(e) => setAvail(e.target.value)} className={ctl}><option value="all">Any availability</option>{AVAIL.map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}</select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading || !data ? <ListSkeleton rows={5} /> : rows.length === 0 ? <EmptyState icon={Users} title="No team members match" description="Try a different search or filter." /> : (
          <TableScroll label="Support team">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead><tr className="border-b border-border bg-surface text-[11px] uppercase tracking-wide text-muted"><th className="px-4 py-2.5 font-semibold">Agent</th><th className="px-3 py-2.5 font-semibold">Availability</th><th className="px-3 py-2.5 font-semibold">Open</th><th className="px-3 py-2.5 font-semibold">Resolved</th><th className="px-3 py-2.5 font-semibold">Workload</th><th className="px-4 py-2.5 text-right font-semibold" /></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ agent: a, open, resolved }) => {
                  const pct = Math.min(100, Math.round((open / max) * 100));
                  return (
                    <tr key={a.id} className="hover:bg-surface/50">
                      <td className="px-4 py-3"><button type="button" onClick={() => setOpenId(a.id)} className="flex items-center gap-3 text-left"><AgentAvatar agent={a} size={34} /><span><span className="block font-semibold hover:text-accent">{a.name}</span><span className="block text-[12px] text-muted">{a.role}</span></span></button></td>
                      <td className="px-3 py-3"><select aria-label={`Availability for ${a.name}`} value={a.availability} onChange={(e) => actions.setAgentAvailability(a.id, e.target.value as AgentAvailability)} className="rounded-lg border border-border bg-card px-2 py-1 text-[12.5px] outline-none focus:border-accent">{AVAIL.map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}</select></td>
                      <td className="px-3 py-3 font-semibold tabular-nums">{open}</td>
                      <td className="px-3 py-3 tabular-nums text-muted">{resolved}</td>
                      <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-border/70"><div className={cn("h-full rounded-full", pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-accent")} style={{ width: `${pct}%` }} /></div><span className="text-[11.5px] tabular-nums text-muted">{open}/{max}</span></div></td>
                      <td className="px-4 py-3 text-right"><button type="button" onClick={() => setOpenId(a.id)} className="rounded-lg border border-border px-2.5 py-1 text-[12.5px] font-semibold hover:bg-surface">Details</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="un-h">
          <h2 id="un-h" className="mb-1 flex items-center gap-2 text-[15px] font-bold"><Inbox size={16} /> Unassigned conversations <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[12px] text-accent">{unassigned.length}</span></h2>
          <p className="mb-3 text-[12.5px] text-muted">Assign each conversation to an agent. Changes are saved in this demo browser only.</p>
          {unassigned.length === 0 ? <EmptyState icon={UserCheck} title="Everything is assigned" description="New unassigned conversations will appear here." /> : (
            <ul className="divide-y divide-border">
              {unassigned.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <ChannelIcon channel={c.channel} />
                  <Link href={`/support/conversations/${c.id}`} className="min-w-0 flex-1 basis-40"><span className="block truncate text-[13px] font-semibold hover:text-accent">{data?.customers.find((x) => x.id === c.customerId)?.businessName}</span><span className="block truncate text-[12px] text-muted">{c.subject}</span></Link>
                  <StatusBadge priority={c.priority} />
                  <div className="w-44"><AgentSelector label={`Assign ${c.subject}`} value={null} allowUnassigned onChange={(v) => { if (v && v !== "all" && v !== "unassigned") actions.assign(c.id, v); }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="rules-h">
          <h2 id="rules-h" className="mb-1 text-[15px] font-bold">Assignment rules</h2>
          <p className="mb-3 text-[12.5px] text-muted">How new conversations should be routed once automation exists. In this demo the rules are a configuration preview only: nothing is auto-assigned.</p>
          {data && (
            <div className="space-y-3">
              <fieldset><legend className="mb-1.5 text-[12px] font-semibold text-muted">Routing</legend>
                <div role="radiogroup" className="grid gap-1.5 sm:grid-cols-3">
                  {([["manual", "Manual"], ["round_robin", "Round robin"], ["least_busy", "Least busy"]] as const).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={data.rules.mode === k} onClick={() => setRule({ mode: k })} className={cn("rounded-lg border px-3 py-2 text-[13px] font-semibold", data.rules.mode === k ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground")}>{label}</button>
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center justify-between gap-3"><label htmlFor="max-open" className="text-[13px] font-semibold">Max open conversations per agent</label><input id="max-open" type="number" min={1} max={100} value={data.rules.maxOpenPerAgent} onChange={(e) => setRule({ maxOpenPerAgent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-right text-[13px] outline-none focus:border-accent" /></div>
              {([["respectAvailability", "Skip agents who are away or offline", "Only route to available agents."], ["routeBillingToSpecialist", "Send billing questions to the billing specialist", "Matches conversations tagged “billing”."], ["routeEnterpriseToLead", "Send Enterprise customers to the support lead", "Keeps your largest accounts with senior support."]] as const).map(([k, title, hint]) => (
                <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"><div><p className="text-[13px] font-semibold">{title}</p><p className="text-[11.5px] text-muted">{hint}</p></div><Toggle checked={data.rules[k]} onChange={(v) => setRule({ [k]: v } as Partial<AssignmentRules>)} label={title} /></div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Drawer open={!!agent} onClose={() => setOpenId(null)} side="right" size="md" title={agent?.name ?? "Agent"} description={agent?.role}>
        {agent && (
          <div className="space-y-5 text-[13px]">
            <div className="flex items-center gap-3"><AgentAvatar agent={agent} size={48} /><div><p className="font-semibold">{agent.name}</p><p className="text-muted">{agent.email}</p><StatusBadge availability={agent.availability} dot className="mt-1" /></div></div>
            <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Languages</p><p>{agent.languages.join(", ")}</p></div>
            <div><p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Assigned conversations ({agentConvs.length})</p>
              {agentConvs.length === 0 ? <p className="text-muted">Nothing assigned.</p> : <ul className="space-y-1.5">{agentConvs.map((c) => <li key={c.id}><Link href={`/support/conversations/${c.id}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 hover:bg-surface"><ChannelIcon channel={c.channel} /><span className="min-w-0 flex-1 truncate font-medium">{c.subject}</span><StatusBadge status={c.status} /></Link></li>)}</ul>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
