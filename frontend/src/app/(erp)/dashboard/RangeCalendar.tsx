"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseISO, toISO } from "./data";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * One-month range calendar (weeks start Monday, like the "This Week" preset). Click a start day, then an end day;
 * a third click starts over. Days after `max` (today) can't be picked.
 */
export function RangeCalendar({ from, to, max, onChange }: { from: string; to: string; max: string; onChange: (from: string, to: string) => void }) {
  const anchorMonth = parseISO(from || max);
  const [view, setView] = useState({ y: anchorMonth.getFullYear(), m: anchorMonth.getMonth() });
  const [anchor, setAnchor] = useState<string | null>(null); // first click of a pending pick
  // When the range is changed from outside (quick select, quarter, typed dates) jump to it and drop a half-made pick;
  // changes made by clicking here are recorded in `seen` first so they don't cause a jump.
  const [seen, setSeen] = useState(from);
  if (from !== seen) { setSeen(from); setAnchor(null); setView({ y: parseISO(from || max).getFullYear(), m: parseISO(from || max).getMonth() }); }
  const [hover, setHover] = useState<string | null>(null);

  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => new Date(view.y, view.m, 1 - lead + i));
  const shift = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const click = (iso: string) => {
    if (iso > max) return;
    if (!anchor) { setAnchor(iso); setSeen(iso); onChange(iso, iso); return; }
    const [a, b] = iso < anchor ? [iso, anchor] : [anchor, iso];
    setAnchor(null); setHover(null); setSeen(a); onChange(a, b);
  };
  // While picking the end day, preview the span between the anchor and the hovered day.
  const [lo, hi] = anchor && hover ? (hover < anchor ? [hover, anchor] : [anchor, hover]) : [from, to];
  const nextDisabled = toISO(new Date(view.y, view.m + 1, 1)) > max;

  return (
    <div className="w-full select-none">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"><ChevronLeft size={15} /></button>
        <p className="text-[13px] font-semibold text-foreground" aria-live="polite">{MONTH_NAMES[view.m]} {view.y}</p>
        <button type="button" aria-label="Next month" disabled={nextDisabled} onClick={() => shift(1)} className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"><ChevronRight size={15} /></button>
      </div>
      <div role="grid" aria-label="Calendar" className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => <span key={w} className="py-1 text-[10.5px] font-semibold uppercase text-muted">{w}</span>)}
        {cells.map((d) => {
          const iso = toISO(d);
          const outside = d.getMonth() !== view.m;
          const disabled = iso > max;
          const isEdge = iso === lo || iso === hi;
          const inside = !!lo && !!hi && iso > lo && iso < hi;
          return (
            <button key={iso} type="button" role="gridcell" disabled={disabled} aria-label={d.toDateString()} aria-selected={isEdge || inside}
              onClick={() => click(iso)} onMouseEnter={() => anchor && setHover(iso)}
              className={cn("relative h-8 text-[12px] transition-colors", outside && "text-muted/40", disabled && "cursor-not-allowed opacity-30",
                inside && "bg-accent/10 text-foreground", isEdge && "rounded-md bg-accent font-semibold text-white", !isEdge && !inside && !disabled && "rounded-md hover:bg-surface",
                iso === max && !isEdge && "font-bold text-accent")}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
