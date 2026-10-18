"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FlaskConical, MoreHorizontal, PanelRight, RotateCcw } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { fmtDayLabel, whatsappWindow } from "@/lib/support/logic";
import { useSupport } from "@/lib/support/store";
import type { ConversationStatus, SupportMessage } from "@/lib/support/types";
import { ChannelIcon } from "./Avatars";
import { CustomerDetailsPanel } from "./CustomerDetailsPanel";
import { EmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { StatusBadge } from "./StatusBadge";
import { MessageSquareDashed } from "lucide-react";

export function ConversationThread({ conversationId }: { conversationId: string }) {
  const { data, actions } = useSupport();
  const [details, setDetails] = useState(false);
  const [menu, setMenu] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const c = data?.conversations.find((x) => x.id === conversationId);
  const customer = data?.customers.find((x) => x.id === c?.customerId);

  // Opening a conversation marks it read (the unread badge clears).
  useEffect(() => { if (c?.unread) actions.markRead(conversationId); }, [c?.unread, conversationId, actions]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [conversationId, c?.messages.length]);

  if (!c) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-border bg-card">
        <EmptyState icon={MessageSquareDashed} title="Conversation not found" description="It may have been removed, or the demo data was reset." action={<Link href="/support" className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface">Back to inbox</Link>} />
      </div>
    );
  }

  const win = c.channel === "whatsapp" ? whatsappWindow(c.lastInboundAt) : null;
  let lastDay = "";
  const rows: React.ReactNode[] = [];
  c.messages.forEach((m: SupportMessage) => {
    const day = fmtDayLabel(m.sentAt);
    if (day !== lastDay) { lastDay = day; rows.push(<div key={`d-${m.id}`} className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted"><span className="h-px flex-1 bg-border" />{day}<span className="h-px flex-1 bg-border" /></div>); }
    rows.push(<MessageBubble key={m.id} message={m} />);
  });

  return (
    <section aria-label={`Conversation with ${customer?.businessName ?? "customer"}`} className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5">
        <Link href="/support" aria-label="Back to inbox" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground lg:hidden"><ArrowLeft size={17} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[14.5px] font-bold">{customer?.businessName ?? "Unknown business"}</h2>
            <ChannelIcon channel={c.channel} size={14} className="flex-shrink-0" />
          </div>
          <p className="truncate text-[12px] text-muted">{c.subject} · {c.channel === "email" ? customer?.email : customer?.phone}</p>
        </div>
        <StatusBadge status={c.status} />
        {c.status === "resolved"
          ? <button type="button" onClick={() => actions.setStatus(c.id, "open")} aria-label="Reopen" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-semibold hover:bg-surface"><RotateCcw size={13} /> <span className="hidden sm:inline">Reopen</span></button>
          : <button type="button" onClick={() => actions.setStatus(c.id, "resolved")} aria-label="Resolve" className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"><Check size={13} /> <span className="hidden sm:inline">Resolve</span></button>}
        <div className="relative">
          <button type="button" aria-label="More actions" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground"><MoreHorizontal size={17} /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <ul role="menu" className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-border bg-card py-1 shadow-lg">
                {(["open", "pending", "snoozed"] as ConversationStatus[]).filter((s) => s !== c.status).map((s) => (
                  <li key={s} role="none"><button type="button" role="menuitem" onClick={() => { actions.setStatus(c.id, s); setMenu(false); }} className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-surface">{s === "snoozed" ? "Snooze for 24 hours" : `Mark as ${s}`}</button></li>
                ))}
                <li role="none" className="border-t border-border"><button type="button" role="menuitem" onClick={() => { actions.simulateCustomerReply(c.id); setMenu(false); }} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12.5px] hover:bg-surface"><FlaskConical size={12} /> Simulate customer reply (demo)</button></li>
              </ul>
            </>
          )}
        </div>
        <button type="button" onClick={() => setDetails(true)} aria-label="Customer details" className="flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[12.5px] font-semibold hover:bg-surface xl:hidden"><PanelRight size={14} /> <span className="hidden sm:inline">Details</span></button>
      </header>

      {win && !win.open && <p className="border-b border-border bg-amber-500/10 px-4 py-1.5 text-[12px] text-amber-800 dark:text-amber-300">WhatsApp 24-hour window closed. Only approved templates can be sent.</p>}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5" aria-live="polite">
        {rows}
        <div ref={bottom} />
      </div>

      <MessageComposer key={c.id} conversation={c} customer={customer} />

      <Drawer open={details} onClose={() => setDetails(false)} side="right" size="md" title="Customer details">
        <div className="-mx-6 -my-5"><CustomerDetailsPanel conversation={c} customer={customer} /></div>
      </Drawer>
    </section>
  );
}
