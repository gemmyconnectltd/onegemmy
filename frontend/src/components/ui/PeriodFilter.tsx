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
        className={cn("flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition-colors sm:flex-none focus-visible:outline-2 focus-visible:outline-accent",
          active ? "border-accent text-accent" : "border-border text-foreground hover:bg-surface")}>
        <CalendarDays size={15} aria-hidden />
        <span className="hidden text-muted sm:inline">{label}:</span><span className="truncate">{periodLabel(value)}</span>
        <ChevronDown size={13} className={cn("ml-auto shrink-0 transition-transform sm:ml-0", open && "rotate-180")} aria-hidden />
      </button>
      {active && clearable && <button type="button" onClick={() => pick(ALL_TIME)} aria-label="Clear date filter" title="Clear date filter" className="flex h-10 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><X size={14} /></button>}

      {open && (
        <>
        {/* On a phone the picker is a bottom sheet over a dimmed page, so nothing is clipped or off-screen; from `sm` up it is a popover under the button. */}
        <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden onClick={() => setOpen(false)} />
        <div role="dialog" aria-label="Choose a date period" className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-[420px] sm:overflow-visible sm:rounded-xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:hidden">
            <p className="text-sm font-semibold">{label}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface"><X size={16} /></button>
          </div>
          <div className="grid gap-0 sm:grid-cols-[150px_1fr] sm:divide-x sm:divide-border">
            <ul className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-1 sm:gap-0.5 sm:p-2">
              {PERIOD_PRESETS.map((p) => {
                const on = value.key === p.key;
                return <li key={p.key}><button type="button" aria-pressed={on} onClick={() => pick({ key: p.key })} className={cn("flex min-h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-left text-[13px] font-medium sm:min-h-0 sm:border-transparent sm:px-2.5 sm:py-1.5", on ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-foreground hover:bg-surface")}>{p.label}{on && <Check size={13} />}</button></li>;
              })}
            </ul>
            <div className="space-y-3 border-t border-border p-3 sm:border-t-0">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Custom range</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-3">
                <Field label="From"><Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="To"><Input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
              </div>
              {badRange && <p role="alert" className="text-[12px] font-medium text-red-600">The start date can&apos;t be after the end date.</p>}
              <Button className="w-full" disabled={!canApply} onClick={() => pick({ key: "custom", from: from || undefined, to: to || undefined })}>Apply range</Button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
