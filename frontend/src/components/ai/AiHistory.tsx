"use client";

import { useState } from "react";
import { ChevronLeft, Search, SquarePen, Trash2 } from "lucide-react";
import type { AiConversationSummary } from "@/lib/api";
import { fmtRelative } from "@/lib/date";
import { cn } from "@/lib/utils";

/** In-panel history: recent conversations (searchable on title), resume, delete, start a new one. */
export function AiHistory({
  items, loading, activeId, moduleLabel, onOpen, onDelete, onNew, onBack,
}: {
  items: AiConversationSummary[] | undefined;
  loading: boolean;
  activeId: string | undefined;
  moduleLabel: (m: string) => string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const shown = (items ?? []).filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex h-full flex-col">
      <button type="button" onClick={onBack} className="flex items-center gap-1 px-3 pt-2.5 text-[12.5px] font-medium text-muted hover:text-foreground">
        <ChevronLeft size={15} /> Back to chat
      </button>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" aria-label="Search conversations"
            className="h-8 w-full rounded-lg border border-border bg-surface/50 pl-8 pr-2 text-[12.5px] outline-none focus:border-accent" />
        </div>
        <button type="button" onClick={onNew} className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[12px] font-semibold text-white hover:opacity-90">
          <SquarePen size={12} /> New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-1">{[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-border/50" />)}</div>
        ) : shown.length === 0 ? (
          <p className="px-3 py-10 text-center text-[12.5px] text-muted">{q ? "No conversations match your search." : "No conversations yet. Ask your first question."}</p>
        ) : shown.map((c) => (
          <div key={c.id} className={cn("group flex items-center gap-1 rounded-lg hover:bg-surface", c.id === activeId && "bg-accent/10")}>
            <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
              <p className="truncate text-[13px] font-medium text-foreground">{c.title}</p>
              <p className="text-[11px] text-muted">{moduleLabel(c.module)}{c.updated_at ? ` · ${fmtRelative(c.updated_at)}` : ""}</p>
            </button>
            <button type="button" aria-label={`Delete conversation: ${c.title}`} onClick={() => onDelete(c.id)}
              className="mr-1 rounded p-1.5 text-muted opacity-0 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
