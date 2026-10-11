"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Info, RefreshCw } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { cn } from "@/lib/utils";

/** The slice of a TanStack query result a section needs to render its own states. */
export interface SectionQuery {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

/** Small "i" icon with a hover/focus tooltip — explains what a metric means. */
export function InfoTip({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <span className="relative inline-flex group/tip align-middle" tabIndex={0} aria-label="More information">
      <Info size={12} className="text-muted/70 hover:text-foreground transition-colors cursor-help" />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-30 mt-1.5 w-56 rounded-lg border border-border bg-card px-3 py-2",
          "text-[11px] font-normal leading-snug text-foreground shadow-lg opacity-0 transition-opacity",
          "group-hover/tip:opacity-100 group-focus/tip:opacity-100",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </span>
    </span>
  );
}

/** Compact error row with retry — used inside a section so one failure never blanks the page. */
export function SectionError({ message, onRetry, retrying }: { message: string; onRetry: () => unknown; retrying?: boolean }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      <AlertTriangle size={15} className="flex-shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => onRetry()}
        disabled={retrying}
        className="flex items-center gap-1.5 text-[12px] font-semibold hover:underline disabled:opacity-50"
      >
        <RefreshCw size={12} className={retrying ? "animate-spin" : ""} /> Retry
      </button>
    </div>
  );
}

/**
 * Renders a dashboard section's body for a query: the shared compact loader on
 * first load, an inline error with retry, an empty message, otherwise the
 * content. While a period change refetches, the previous content stays visible
 * (slightly dimmed) instead of flashing back to a loader.
 */
export function QueryBody({
  query, errorMessage, empty, emptyMessage = "No data for this period", children,
}: {
  query: SectionQuery;
  errorMessage: string;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  if (query.isLoading) return <PageLoader variant="compact" />;
  if (query.isError) return <SectionError message={errorMessage} onRetry={query.refetch} retrying={query.isFetching} />;
  if (empty) return <p className="flex flex-1 items-center justify-center py-8 text-center text-[13px] text-muted">{emptyMessage}</p>;
  // flex-1 + flex-col so a section's content can fill the card's height.
  return <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity", query.isFetching && "opacity-60")}>{children}</div>;
}

/** Titled card shell shared by the overview sections (matches the existing card look). */
export function SectionCard({
  title, subtitle, action, className, children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
