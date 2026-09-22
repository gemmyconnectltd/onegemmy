"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Omit to hide the rows-per-page picker (e.g. when the caller fixes page size). */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Plural noun for the summary line, e.g. "customers". Defaults to "results". */
  itemLabel?: string;
  color?: string;
  className?: string;
}

/** 1 … 4 5 [6] 7 8 … 42 — always keeps first, last, and a window around the
 *  current page, collapsing the rest behind ellipses so the bar stays a fixed
 *  height regardless of how many pages exist. */
function pageList(current: number, totalPages: number): (number | "…")[] {
  const delta = 1;
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= current - delta && i <= current + delta)) pages.push(i);
  }
  const out: (number | "…")[] = [];
  let prev: number | undefined;
  for (const p of pages) {
    if (prev !== undefined) {
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev !== 1) out.push("…");
    }
    out.push(p);
    prev = p;
  }
  return out;
}

/** Server-driven pagination footer shared by every ERP table: range summary,
 *  rows-per-page picker, and page-number navigation with ellipsis collapsing.
 *  Purely presentational — the caller owns `page`/`pageSize` state and refetches
 *  its list query when they change. */
export function Pagination({
  page, pageSize, total, onPageChange, onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES, itemLabel = "results", color, className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const end = Math.min(clampedPage * pageSize, total);
  const pages = pageList(clampedPage, totalPages);
  const accent = color ?? "var(--accent)";

  const go = (p: number) => {
    if (p < 1 || p > totalPages || p === clampedPage) return;
    onPageChange(p);
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-border ${className ?? ""}`}>
      <div className="flex items-center gap-3 order-2 sm:order-1">
        <p className="text-xs text-muted whitespace-nowrap">
          {total === 0
            ? `No ${itemLabel}`
            : <>Showing <span className="font-semibold text-foreground">{start}</span>–<span className="font-semibold text-foreground">{end}</span> of <span className="font-semibold text-foreground">{total}</span> {itemLabel}</>}
        </p>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="text-xs font-semibold text-muted bg-surface border border-border rounded-lg pl-2 pr-6 py-1 outline-none focus:border-foreground/30 cursor-pointer"
          >
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1 order-1 sm:order-2">
        <button
          type="button"
          onClick={() => go(clampedPage - 1)}
          disabled={clampedPage <= 1}
          aria-label="Previous page"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft size={15} />
        </button>

        {/* Numbered pages: hidden on narrow screens in favour of "Page X of Y" */}
        <div className="hidden sm:flex items-center gap-1">
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`dots-${i}`} className="w-7 h-7 flex items-center justify-center text-xs text-muted/60 select-none">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                aria-current={p === clampedPage ? "page" : undefined}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors"
                style={p === clampedPage
                  ? { backgroundColor: accent, color: "white" }
                  : undefined}
              >
                <span className={p === clampedPage ? "" : "text-muted hover:text-foreground"}>{p}</span>
              </button>
            )
          )}
        </div>
        <span className="sm:hidden text-xs font-semibold text-muted px-1 whitespace-nowrap">
          Page {clampedPage} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => go(clampedPage + 1)}
          disabled={clampedPage >= totalPages}
          aria-label="Next page"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
