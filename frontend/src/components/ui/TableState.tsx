"use client";

import type { ReactNode } from "react";
import { Inbox, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadError } from "@/components/ui/LoadState";

/** The one loading / error / empty look for a table's body. A failed request never reads as "no records", and an empty
 *  result under filters offers to clear them. Render it in place of the table; render the table when it returns null. */
export function TableState({ loading, error, onRetry, empty, filtered, onClearFilters, title = "Nothing here yet", hint, action, rows = 5 }: {
  loading?: boolean; error?: unknown; onRetry?: () => void; empty?: boolean; filtered?: boolean; onClearFilters?: () => void;
  title?: string; hint?: string; action?: ReactNode; rows?: number;
}) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading" className="divide-y divide-border rounded-xl border border-border bg-card">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="flex items-center gap-4 px-4 py-4"><span className="h-3 w-24 animate-pulse rounded bg-surface" /><span className="h-3 flex-1 animate-pulse rounded bg-surface" /><span className="h-3 w-16 animate-pulse rounded bg-surface" /></div>)}
      </div>
    );
  }
  if (error) return <LoadError error={error} onRetry={onRetry} title="Could not load this list" />;
  if (!empty) return null;
  const Icon = filtered ? SearchX : Inbox;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-10 text-center">
      <Icon size={22} className="text-muted" aria-hidden />
      <p className="text-sm font-semibold">{filtered ? "No records match your filters" : title}</p>
      {(filtered || hint) && <p className="max-w-md text-xs text-muted">{filtered ? "Try a different search or date range, or clear the filters." : hint}</p>}
      {filtered && onClearFilters ? <Button variant="outline" size="sm" onClick={onClearFilters}>Clear filters</Button> : action}
    </div>
  );
}
