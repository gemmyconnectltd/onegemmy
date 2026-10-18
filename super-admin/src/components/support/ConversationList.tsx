"use client";

import { useMemo } from "react";
import { SearchX } from "lucide-react";
import { agentById, filterConversations } from "@/lib/support/logic";
import { DEFAULT_FILTERS, useSupport } from "@/lib/support/store";
import type { ChannelKind } from "@/lib/support/types";
import { ChannelTabs, ConversationFilters } from "./ConversationFilters";
import { ConversationItem } from "./ConversationItem";
import { EmptyState, ListSkeleton } from "./EmptyState";

export function ConversationList({ selectedId }: { selectedId?: string }) {
  const { data, loading, filters, actions } = useSupport();

  const { items, counts, activeFilters } = useMemo(() => {
    if (!data) return { items: [], counts: { all: 0, email: 0, whatsapp: 0 } as Record<"all" | ChannelKind, number>, activeFilters: 0 };
    // Channel tab counts ignore the channel filter itself so they stay useful while switching.
    const base = filterConversations(data.conversations, data.customers, { ...filters, channel: "all" });
    const counts = { all: base.length, email: base.filter((c) => c.channel === "email").length, whatsapp: base.filter((c) => c.channel === "whatsapp").length };
    const activeFilters = (["status", "assignee", "priority"] as const).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length + (filters.query ? 1 : 0);
    return { items: filterConversations(data.conversations, data.customers, filters), counts, activeFilters };
  }, [data, filters]);

  return (
    <section aria-label="Conversations" className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="space-y-2.5 border-b border-border p-3">
        <ChannelTabs counts={counts} />
        <ConversationFilters activeCount={activeFilters} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading || !data ? <ListSkeleton /> : items.length === 0 ? (
          <EmptyState
            icon={SearchX} title="No conversations match" description="Try a different search or clear the filters."
            action={activeFilters > 0 || filters.channel !== "all" ? <button type="button" onClick={() => actions.resetFilters()} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface">Clear all filters</button> : undefined}
          />
        ) : items.map((c) => (
          <ConversationItem key={c.id} conversation={c} selected={c.id === selectedId} customer={data.customers.find((x) => x.id === c.customerId)} agent={agentById(data.agents, c.assigneeId)} />
        ))}
      </div>
    </section>
  );
}
