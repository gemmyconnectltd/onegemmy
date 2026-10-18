"use client";

import { Mail, MessageCircle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITIES } from "@/lib/support/logic";
import { useSupport } from "@/lib/support/store";
import type { ChannelKind, ConversationStatus } from "@/lib/support/types";
import { AgentSelector } from "./AgentSelector";

const selectCls = "min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-accent";

export function ChannelTabs({ counts }: { counts: Record<"all" | ChannelKind, number> }) {
  const { filters, actions } = useSupport();
  const tabs: { key: "all" | ChannelKind; label: string; icon?: typeof Mail }[] = [{ key: "all", label: "All" }, { key: "email", label: "Email", icon: Mail }, { key: "whatsapp", label: "WhatsApp", icon: MessageCircle }];
  return (
    <div role="tablist" aria-label="Channel" className="flex gap-1 rounded-lg bg-surface p-0.5">
      {tabs.map((t) => (
        <button
          key={t.key} type="button" role="tab" aria-selected={filters.channel === t.key}
          onClick={() => actions.setFilters({ channel: t.key })}
          className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-colors", filters.channel === t.key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground")}
        >
          {t.icon && <t.icon size={13} />} {t.label} <span className="text-[11px] font-medium text-muted">{counts[t.key]}</span>
        </button>
      ))}
    </div>
  );
}

const STATUSES: { key: "all" | ConversationStatus; label: string }[] = [{ key: "all", label: "All" }, { key: "open", label: "Open" }, { key: "pending", label: "Pending" }, { key: "resolved", label: "Resolved" }];

export function ConversationFilters({ activeCount }: { activeCount: number }) {
  const { filters, actions } = useSupport();
  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search" value={filters.query} onChange={(e) => actions.setFilters({ query: e.target.value })} placeholder="Search conversations"
          aria-label="Search conversations" className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-8 text-base outline-none placeholder:text-muted/70 focus:border-accent sm:text-[13px]"
        />
        {filters.query && <button type="button" aria-label="Clear search" onClick={() => actions.setFilters({ query: "" })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"><X size={13} /></button>}
      </div>
      <div role="group" aria-label="Status" className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button
            key={s.key} type="button" aria-pressed={filters.status === s.key} onClick={() => actions.setFilters({ status: s.key })}
            className={cn("rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors", filters.status === s.key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground")}
          >{s.label}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <AgentSelector includeAll label="Assigned agent" value={filters.assignee} onChange={(v) => actions.setFilters({ assignee: (v ?? "unassigned") as string })} className="min-w-0 flex-1 !px-2 !py-1.5 !text-[12.5px]" />
        <select aria-label="Priority" value={filters.priority} onChange={(e) => actions.setFilters({ priority: e.target.value as typeof filters.priority })} className={selectCls}>
          <option value="all">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>
      {activeCount > 0 && <button type="button" onClick={() => actions.resetFilters()} className="text-[12px] font-semibold text-accent hover:underline">Clear {activeCount} filter{activeCount === 1 ? "" : "s"}</button>}
    </div>
  );
}
