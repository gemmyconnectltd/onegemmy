"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** The filter pieces every list page shares (Sales History, Products, …), so lists filter the same way everywhere:
 *  one bar (search, then the main filters, then "More filters"), the applied filters as removable chips under it, and on wide
 *  screens the picked row's details beside the list. */

/** "More filters": the less-used filters in a small panel, with how many are active on the button. Closes on outside click / Escape. */
export function MoreFilters({ active, children, width = "w-72" }: { active: number; children: ReactNode; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <Button variant="outline" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <SlidersHorizontal size={14} /> More filters{active > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{active}</span>}
      </Button>
      {open && (
        <div role="dialog" aria-label="More filters" className={`absolute right-0 top-full z-30 mt-1 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg ${width}`}>
          {children}
        </div>
      )}
    </div>
  );
}

export interface FilterChip { key: string; label: string; value: string; clear: () => void }

/** What is applied, each removable on its own; "Clear all" resets everything; the match count on the right. */
export function FilterChips({ chips, onClearAll, count }: { chips: FilterChip[]; onClearAll: () => void; count?: string }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-0.5 pl-2.5 pr-1 text-xs">
          <span className="text-muted">{c.label}:</span><span className="font-semibold text-foreground">{c.value}</span>
          <button type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`} className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><X size={12} /></button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="ml-1 text-xs font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">Clear all</button>
      {count && <span className="ml-auto text-xs text-muted">{count}</span>}
    </div>
  );
}

/** Desktop (≥1280px): the picked row sits beside the list; smaller screens open it in a drawer. */
const WIDE = "(min-width: 1280px)";
export function useWideScreen() {
  return useSyncExternalStore(
    (change) => { const m = window.matchMedia(WIDE); m.addEventListener("change", change); return () => m.removeEventListener("change", change); },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
