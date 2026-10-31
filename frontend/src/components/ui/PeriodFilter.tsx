"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { ALL_TIME, PERIOD_PRESETS, periodLabel, periodRange, toISODate, type PeriodValue } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * The date filter every list page uses: "All time" by default, quick periods, or any custom range in the past.
 * The same control, wording and behaviour everywhere, so people learn it once.
 */
export function PeriodFilter({ value, onChange, label = "Date", className, clearable = true }: { value: PeriodValue; onChange: (v: PeriodValue) => void; label?: string; className?: string; clearable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const today = toISODate(new Date());
  const active = value.key !== "all";

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const toggle = () => {
    if (!open) { const r = periodRange(value); setFrom(r.from ?? ""); setTo(r.to ?? ""); }
    setOpen(!open);
  };
  const pick = (v: PeriodValue) => { onChange(v); setOpen(false); trigger.current?.focus(); };
  const badRange = !!from && !!to && from > to;
  const canApply = (!!from || !!to) && !badRange;

  return (
    <div ref={root} className={cn("relative inline-flex items-center gap-1.5", className)}>
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}
        className={cn("flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          active ? "border-accent text-accent" : "border-border text-foreground hover:bg-surface")}>
        <CalendarDays size={15} aria-hidden />
        <span className="text-muted">{label}:</span> {periodLabel(value)}
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {active && clearable && <button type="button" onClick={() => pick(ALL_TIME)} aria-label="Clear date filter" title="Clear date filter" className="flex h-10 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><X size={14} /></button>}

      {open && (
        <div role="dialog" aria-label="Choose a date period" className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,420px)] rounded-xl border border-border bg-card shadow-xl">
          <div className="grid gap-0 sm:grid-cols-[150px_1fr] sm:divide-x sm:divide-border">
            <ul className="grid grid-cols-2 gap-0.5 p-2 sm:grid-cols-1">
              {PERIOD_PRESETS.map((p) => {
                const on = value.key === p.key;
                return <li key={p.key}><button type="button" aria-pressed={on} onClick={() => pick({ key: p.key })} className={cn("flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium", on ? "bg-accent/10 text-accent" : "text-foreground hover:bg-surface")}>{p.label}{on && <Check size={13} />}</button></li>;
              })}
            </ul>
            <div className="space-y-3 p-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Custom range</p>
              <Field label="From"><Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
              {badRange && <p role="alert" className="text-[12px] font-medium text-red-600">The start date can&apos;t be after the end date.</p>}
              <Button className="w-full" disabled={!canApply} onClick={() => pick({ key: "custom", from: from || undefined, to: to || undefined })}>Apply range</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
