"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, CalendarDays, Globe2, Mail, Phone, Plus, Tag as TagIcon, UserCheck, X } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { PLAN_COLORS, PRIORITIES } from "@/lib/support/logic";
import { useSupport } from "@/lib/support/store";
import type { Customer, SupportConversation } from "@/lib/support/types";
import { AgentSelector } from "./AgentSelector";
import { Avatar, ChannelIcon } from "./Avatars";
import { StatusBadge } from "./StatusBadge";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-border px-4 py-3.5 last:border-b-0"><h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{title}</h3>{children}</section>;
}

export function CustomerDetailsPanel({ conversation: c, customer }: { conversation: SupportConversation; customer?: Customer }) {
  const { data, actions } = useSupport();
  const [tag, setTag] = useState("");
  const me = data?.agents.find((a) => a.isYou);
  const related = (data?.conversations ?? []).filter((x) => x.customerId === c.customerId && x.id !== c.id).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Avatar name={customer?.businessName ?? "?"} size={44} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold">{customer?.businessName ?? "Unknown business"}</p>
          <p className="truncate text-[12px] text-muted">{customer?.contactName}</p>
        </div>
      </div>

      {customer && (
        <Section title="Business profile">
          <dl className="space-y-1.5">
            <div className="flex items-center gap-2"><Mail size={13} className="flex-shrink-0 text-muted" /><dd className="min-w-0 truncate"><a className="text-accent hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a></dd></div>
            <div className="flex items-center gap-2"><Phone size={13} className="flex-shrink-0 text-muted" /><dd>{customer.phone}</dd></div>
            <div className="flex items-center gap-2"><Globe2 size={13} className="flex-shrink-0 text-muted" /><dd>{customer.country}</dd></div>
            <div className="flex items-center gap-2"><Building2 size={13} className="flex-shrink-0 text-muted" /><dd>{customer.industry}</dd></div>
            <div className="flex items-center gap-2"><CalendarDays size={13} className="flex-shrink-0 text-muted" /><dd>Customer since {fmtDate(customer.customerSince)}</dd></div>
            <div className="flex items-center gap-2"><span className="w-[13px] flex-shrink-0" /><dd><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: PLAN_COLORS[customer.plan] }}>{customer.plan} plan</span></dd></div>
          </dl>
        </Section>
      )}

      <Section title="Assignment">
        <div className="space-y-2">
          <AgentSelector value={c.assigneeId} onChange={(v) => actions.assign(c.id, v === "all" ? null : v)} />
          {me && c.assigneeId !== me.id && <button type="button" onClick={() => actions.assign(c.id, me.id)} className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"><UserCheck size={12} /> Assign to me</button>}
          <label className="block text-[11px] font-semibold text-muted" htmlFor={`prio-${c.id}`}>Priority</label>
          <select id={`prio-${c.id}`} value={c.priority} onChange={(e) => actions.setPriority(c.id, e.target.value as typeof c.priority)} className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-accent">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </Section>

      <Section title="Tags">
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {c.tags.length === 0 && <li className="text-[12px] text-muted">No tags yet.</li>}
          {c.tags.map((t) => (
            <li key={t} className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[12px] font-medium ring-1 ring-border"><TagIcon size={10} />{t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => actions.removeTag(c.id, t)} className="text-muted hover:text-foreground"><X size={11} /></button></li>
          ))}
        </ul>
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); actions.addTag(c.id, tag); setTag(""); }}>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag" aria-label="Add a tag" maxLength={24} className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-[13px]" />
          <button type="submit" disabled={!tag.trim()} aria-label="Add tag" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-surface disabled:opacity-40"><Plus size={14} /></button>
        </form>
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap gap-1.5">
          {c.status === "resolved"
            ? <button type="button" onClick={() => actions.setStatus(c.id, "open")} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface">Reopen</button>
            : <button type="button" onClick={() => actions.setStatus(c.id, "resolved")} className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90">Close conversation</button>}
          {c.status !== "snoozed" && c.status !== "resolved" && <button type="button" onClick={() => actions.setStatus(c.id, "snoozed")} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface">Snooze 24h</button>}
        </div>
        {c.status === "snoozed" && c.snoozedUntil && <p className="mt-1.5 text-[11.5px] text-muted">Snoozed until {fmtDateTime(c.snoozedUntil)}.</p>}
      </Section>

      <Section title="Related conversations">
        {related.length === 0 ? <p className="text-[12px] text-muted">No other conversations with this business.</p> : (
          <ul className="space-y-1.5">
            {related.map((r) => (
              <li key={r.id}><Link href={`/support/conversations/${r.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface">
                <ChannelIcon channel={r.channel} size={13} /><span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{r.subject}</span><StatusBadge status={r.status} />
              </Link></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Activity">
        <ol className="space-y-2 border-l border-border pl-3">
          {[...c.activity].reverse().map((a) => (
            <li key={a.id} className="relative text-[12px]"><span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-border" /><p className="text-foreground/90">{a.text}</p><time className="text-[11px] text-muted" dateTime={a.at}>{fmtDateTime(a.at)}</time></li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
