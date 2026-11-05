"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchSelectItem { id: string; label: string; hint?: string }

/** One searchable dropdown in place of a "search box + select + pager" stack. The parent owns the (server-side) search:
 *  it passes the query it searched with and the matching items, so existing hooks and pagination limits are reused. */
export function SearchSelect({ label, value, selectedLabel, query, onQueryChange, items, loading, onSelect, placeholder = "Search…", emptyText = "No matches", footer, required, className }: {
  label: string; value: string; selectedLabel?: string; query: string; onQueryChange: (q: string) => void;
  items: SearchSelectItem[]; loading?: boolean; onSelect: (id: string) => void; placeholder?: string; emptyText?: string;
  footer?: React.ReactNode; required?: boolean; className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; z: number } | null>(null);

  // The list is positioned from the field itself (fixed), so a scrolling table or card never clips it.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = field.current?.getBoundingClientRect();
      // Sit above whatever overlay the field is in (a drawer, or a drawer opened from a drawer), never behind it.
      const overlay = field.current?.closest("[data-overlay-root]");
      const z = (overlay ? Number.parseInt(getComputedStyle(overlay).zIndex, 10) || 0 : 0) + 10;
      if (r) setBox({ top: r.bottom + 4, left: r.left, width: r.width, z: Math.max(z, 60) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { const t = e.target as Node; if (!root.current?.contains(t) && !list.current?.contains(t)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const choose = (item: SearchSelectItem) => { onSelect(item.id); onQueryChange(""); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && open && items[active]) { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  };
  // Show the chosen name until the person starts typing a new search.
  const shown = open || query ? query : (selectedLabel ?? "");

  return (
    <div ref={root} className={cn("relative", className)}>
      <input ref={field} role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-required={required}
        aria-activedescendant={open && items[active] ? `${id}-${items[active].id}` : undefined}
        className="pesaa-control pr-9" value={shown} placeholder={placeholder} autoComplete="off"
        onFocus={() => setOpen(true)} onChange={(e) => { onQueryChange(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">{loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}</span>
      {/* Drawn on the page itself, not inside the field: a drawer keeps a CSS transform from its slide-in animation, and that makes
          "fixed" inside it mean "relative to the drawer", which pushed this list off the screen. */}
      {open && box && createPortal(
        <div ref={list} style={{ top: box.top, left: box.left, width: box.width, zIndex: box.z }} className="fixed max-h-64 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl">
          <ul id={`${id}-list`} role="listbox" aria-label={label}>
            {items.map((item, index) => (
              <li key={item.id} id={`${id}-${item.id}`} role="option" aria-selected={item.id === value}
                onMouseDown={(e) => { e.preventDefault(); choose(item); }} onMouseEnter={() => setActive(index)}
                className={cn("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm", index === active && "bg-surface")}>
                <span className="min-w-0"><span className="block truncate font-medium">{item.label}</span>{item.hint && <span className="block truncate text-xs text-muted">{item.hint}</span>}</span>
                {item.id === value && <Check size={14} className="shrink-0 text-accent" aria-hidden />}
              </li>
            ))}
          </ul>
          {!loading && items.length === 0 && <p className="px-3 py-3 text-sm text-muted">{emptyText}</p>}
          {footer && <div className="border-t border-border px-3 py-2 text-xs">{footer}</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}
