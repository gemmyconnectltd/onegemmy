"use client";

import { Building2, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useConversation, useRelated } from "@/lib/support/hooks";
import { Avatar, ChannelBadge, PriorityBadge, timeAgo } from "./parts";
import { ContactBadge } from "@/components/tenants/ContactBadge";

const STATUS_TONE = { open: "green", in_progress: "blue", resolved: "slate", closed: "slate" } as const;

/** Right-hand customer details: who it is, which Pesaa business, earlier conversations and tickets. */
export function CustomerPanel({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const conv = useConversation(id).data;
  const related = useRelated(id).data;
  if (!conv) return null;
  const name = conv.customer_name || conv.customer_email || conv.customer_phone || "Unknown";
  return (
    <aside aria-label="Customer information" className="h-full overflow-y-auto bg-card p-4">
      <div className="flex flex-col items-center gap-2 border-b border-border pb-4 text-center">
        <Avatar name={name} size={52} />
        <p className="text-sm font-bold text-foreground">{name}</p>
        <ChannelBadge channel={conv.channel} />
      </div>
      <dl className="space-y-2.5 py-4 text-[13px]">
        {conv.customer_email && <div className="flex gap-2"><Mail size={14} className="mt-0.5 flex-shrink-0 text-muted" /><dd className="min-w-0 break-all">{conv.customer_email}</dd></div>}
        {conv.customer_phone && <div className="flex gap-2"><Phone size={14} className="mt-0.5 flex-shrink-0 text-muted" /><dd>{conv.customer_phone}</dd></div>}
        <div className="flex gap-2"><Building2 size={14} className="mt-0.5 flex-shrink-0 text-muted" /><dd>{conv.tenant_name ?? <span className="text-muted">No Pesaa business linked</span>}</dd></div>
        {conv.tenant_name && <div className="flex items-center gap-2 text-muted"><span className="w-3.5 flex-shrink-0" /><dd className="flex items-center gap-1.5 text-[12px]">Prefers <ContactBadge value={conv.tenant_preferred_contact} /></dd></div>}
      </dl>
      <section className="border-t border-border pt-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Related tickets</h3>
        {!related?.tickets.length ? <p className="text-[12px] text-muted">None</p> : (
          <ul className="space-y-1.5">{related.tickets.map((t) => (
            <li key={t.id} className="rounded-lg border border-border p-2 text-[12px]"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{t.reference}</span><Badge tone={STATUS_TONE[t.status]} className="capitalize">{t.status.replace("_", " ")}</Badge></div><p className="mt-0.5 truncate text-muted">{t.subject}</p><div className="mt-1"><PriorityBadge priority={t.priority} /></div></li>
          ))}</ul>
        )}
      </section>
      <section className="mt-4 border-t border-border pt-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Previous conversations</h3>
        {!related?.previous.length ? <p className="text-[12px] text-muted">None</p> : (
          <ul className="space-y-1">{related.previous.map((p) => (
            <li key={p.id}><button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-surface"><ChannelBadge channel={p.channel} compact /><span className="min-w-0 flex-1 truncate">{p.subject ?? p.last_message_preview ?? "Conversation"}</span><span className="text-muted">{timeAgo(p.last_message_at)}</span></button></li>
          ))}</ul>
        )}
      </section>
    </aside>
  );
}
