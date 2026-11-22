"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiErrorMessage } from "@/lib/api/errors";
import type { LoadState } from "@/lib/loadState";
import { cn } from "@/lib/utils";

/** The one placeholder for a card, chart, KPI or report section while it loads. Size it with `className` (e.g. "h-64"). */
export function Skeleton({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className={cn("animate-pulse rounded-xl bg-surface motion-reduce:animate-none", className)} />;
}

/** The one "could not load" block: says what failed, why (from the server or the network), and offers to try again. */
export function LoadError({ error, onRetry, title = "Could not load this section", compact = false, className }: {
  error?: unknown; onRetry?: () => void; title?: string; compact?: boolean; className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 text-center", compact ? "px-3 py-4" : "px-4 py-8", className)}>
      <AlertCircle size={compact ? 16 : 20} className="text-red-600" aria-hidden />
      <p className="text-sm font-semibold text-red-700 dark:text-red-400">{title}</p>
      <p className="max-w-md text-xs text-muted">{apiErrorMessage(error, "The information could not be loaded.")}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Wraps content that stays on screen while a background refresh runs: dims it slightly and announces it as busy. */
export function Refreshing({ busy, className, children }: { busy: boolean; className?: string; children: ReactNode }) {
  return <div aria-busy={busy || undefined} className={cn("transition-opacity motion-reduce:transition-none", busy && "opacity-60", className)}>{children}</div>;
}

/** Shows the right thing for a section's state: its skeleton while loading, the error with a retry when it failed, the
 *  empty message when there is nothing, and the content once ready. Content is never rendered from missing data. */
export function SectionState({ state, error, onRetry, loading, empty, errorTitle, children }: {
  state: LoadState; error?: unknown; onRetry?: () => void; loading?: ReactNode; empty?: ReactNode; errorTitle?: string; children: ReactNode;
}) {
  if (state === "loading") return <>{loading ?? <Skeleton className="h-40" />}</>;
  if (state === "error") return <LoadError error={error} onRetry={onRetry} title={errorTitle} />;
  if (state === "empty" && empty !== undefined) return <>{empty}</>;
  if (state === "idle") return null;
  return <>{children}</>;
}

/** For a form whose choices (customers, staff, products…) come from requests: if any of them failed, say which list is
 *  missing and retry just those, instead of leaving an empty dropdown that looks like "there are none". */
export function OptionsLoadError({ sources }: { sources: { label: string; query: { isError: boolean; data?: unknown; error?: unknown; refetch: () => unknown } }[] }) {
  const failed = sources.filter((s) => s.query.isError && s.query.data === undefined);
  if (!failed.length) return null;
  return (
    <LoadError
      compact
      title={`Could not load ${failed.map((s) => s.label).join(", ")}`}
      error={failed[0].query.error}
      onRetry={() => failed.forEach((s) => void s.query.refetch())}
    />
  );
}

/** The one banner for an action that failed (a status change, an approval, a payment): what went wrong, dismissible. */
export function ActionError({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-400">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 text-xs font-semibold underline">Dismiss</button>
    </div>
  );
}
