"use client";

import { Inbox } from "lucide-react";
import { Avatar, ChannelBadge, timeAgo } from "./parts";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBox } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Form";
import { cn } from "@/lib/utils";
import type { ConversationView, SupportConversation } from "@/lib/api";

const VIEWS: { key: ConversationView; label: string }[] = [{ key: "all", label: "All" }, { key: "unassigned", label: "Unassigned" }, { key: "mine", label: "Mine" }, { key: "resolved", label: "Resolved" }];

export function ConversationList({
  items, loading, error, selectedId, onSelect, view, onView, search, onSearch, channel, onChannel, total,
}: {
  items: SupportConversation[]; loading: boolean; error: boolean; selectedId: string | null; onSelect: (id: string) => void;
  view: ConversationView; onView: (v: ConversationView) => void; search: string; onSearch: (s: string) => void; channel: string; onChannel: (c: string) => void; total: number;
}) {
  return (
    <section aria-label="Conversations" className="flex h-full min-h-0 flex-col bg-card">
      <div className="space-y-2 border-b border-border p-3">
        <div className="space-y-2 [&>div]:max-w-none">
          <SearchBox value={search} onChange={onSearch} placeholder="Search conversations" />
          <Select aria-label="Channel" value={channel} onChange={(e) => onChannel(e.target.value)} className="py-1.5 text-[13px]">
            <option value="">All channels</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="portal">Help & Support</option>
          </Select>
        </div>
        <div role="tablist" aria-label="Filter" className="flex gap-1 overflow-x-auto no-scrollbar">
          {VIEWS.map((v) => (
            <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => onView(v.key)}
              className={cn("whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold transition-colors", view === v.key ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground")}>{v.label}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <ul aria-busy="true" aria-label="Loading">{Array.from({ length: 6 }, (_, i) => <li key={i} className="flex gap-3 border-b border-border p-3"><div className="h-9 w-9 animate-pulse rounded-full bg-border/70" /><div className="flex-1 space-y-2"><div className="h-3 w-1/2 animate-pulse rounded bg-border/70" /><div className="h-3 w-4/5 animate-pulse rounded bg-border/50" /></div></li>)}</ul>
          : error ? <p role="alert" className="p-4 text-sm text-red-600">Couldn&apos;t load conversations.</p>
          : items.length === 0 ? <EmptyState icon={Inbox} title="No conversations" description={search || channel ? "Nothing matches your filters." : "New WhatsApp, email and Help & Support messages appear here."} />
          : <ul>
            {items.map((c) => {
              const name = c.customer_name || c.customer_email || c.customer_phone || "Unknown";
              const on = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => onSelect(c.id)} aria-current={on ? "true" : undefined}
                    className={cn("flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors", on ? "bg-accent/10" : "hover:bg-surface")}>
                    <Avatar name={name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-[13px]", c.unread_count ? "font-bold text-foreground" : "font-semibold text-foreground")}>{name}</span>
                        <span className="flex-shrink-0 text-[11px] text-muted">{timeAgo(c.last_message_at)}</span>
                      </span>
                      {c.subject && <span className="block truncate text-[12px] font-medium text-foreground/80">{c.subject}</span>}
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{c.last_message_preview ?? "—"}</span>
                        {c.unread_count > 0 && <span aria-label={`${c.unread_count} unread`} className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{c.unread_count}</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ChannelBadge channel={c.channel} compact />
                        <span className="truncate text-[11px] text-muted">{c.assigned_name ? `→ ${c.assigned_name}` : "Unassigned"}</span>
                        {c.ticket_reference && <span className="text-[11px] font-semibold text-muted">{c.ticket_reference}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {items.length < total && <li className="p-3 text-center text-[11px] text-muted">Showing the {items.length} most recent of {total}. Search to narrow down.</li>}
          </ul>}
      </div>
    </section>
  );
}
