"use client";

import { useEffect, useRef, useState } from "react";
import { Briefcase, CalendarDays, ChevronDown, Factory, Globe2, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import type { AnalyticsFilters, FilterOption, FilterOptions } from "@/lib/api/admin";
import {
  MAX_RANGE_DAYS, PERIOD_PRESETS, businessTypeLabel, rangeDays, toISODate, type DateRange, type PeriodPreset,
} from "@/lib/adminAnalytics";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";

/** Everything the filter bar controls. */
export interface OverviewFilters extends AnalyticsFilters {
  preset: PeriodPreset;
  range: DateRange;
}

type FilterKey = keyof AnalyticsFilters;
const controlCls =
  "h-10 w-full appearance-none bg-card border border-border rounded-xl pl-9 pr-9 text-[13px] font-medium text-foreground " +
  "cursor-pointer hover:border-foreground/25 transition-colors focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10";

/** A compact labelled dropdown: icon, current value, chevron and a clear (×) button once a value is set. */
function FilterSelect({
  icon: Icon, label, allLabel, value, options, format = (v) => v, onChange, className,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  allLabel: string;
  value: string | undefined;
  options: FilterOption[];
  format?: (v: string) => string;
  onChange: (v: string | undefined) => void;
  className?: string;
}) {
  // A value restored from the URL may not be in the (dependent) option list.
  const opts = value && !options.some((o) => o.value === value) ? [{ value, count: 0 }, ...options] : options;
  return (
    <div className={cn("relative min-w-0", className)}>
      <Icon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={controlCls}>
        <option value="">{allLabel}</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{format(o.value)}</option>)}
      </select>
      {value ? (
        <button type="button" onClick={() => onChange(undefined)} aria-label={`Clear ${label}`}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground hover:bg-surface">
          <X size={13} />
        </button>
      ) : (
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      )}
    </div>
  );
}

/** From → To picker shown in a small popover; only applied on "Apply". */
function CustomRangePopover({
  range, onApply, onClose,
}: {
  range: DateRange;
  onApply: (r: DateRange) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(range);
  const ref = useRef<HTMLDivElement>(null);
  const today = toISODate(new Date());
  const valid = !!draft.from && !!draft.to && draft.from <= draft.to && rangeDays(draft) <= MAX_RANGE_DAYS;

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const input = "w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent/50";
  return (
    <div ref={ref} role="dialog" aria-label="Custom date range"
      className="absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-4 shadow-xl">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] font-semibold text-muted">From
          <input type="date" className={cn(input, "mt-1")} value={draft.from} max={draft.to || today}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </label>
        <label className="text-[11px] font-semibold text-muted">To
          <input type="date" className={cn(input, "mt-1")} value={draft.to} min={draft.from} max={today}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
      </div>
      {!valid && <p className="mt-2 text-[11px] font-medium text-red-500">Choose a start date on or before the end date.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-foreground">Cancel</button>
        <button type="button" disabled={!valid} onClick={() => onApply(draft)}
          className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">Apply</button>
      </div>
    </div>
  );
}

function DateRangeControl({
  value, onChange,
}: {
  value: Pick<OverviewFilters, "preset" | "range">;
  onChange: (preset: PeriodPreset, range?: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center gap-2">
      <div className="relative min-w-0">
        <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <select aria-label="Date range" value={value.preset} className={controlCls}
          onChange={(e) => {
            const preset = e.target.value as PeriodPreset;
            if (preset === "custom") { onChange("custom", value.range); setOpen(true); } else { setOpen(false); onChange(preset); }
          }}>
          {PERIOD_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      </div>
      {value.preset === "custom" && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="h-10 rounded-xl border border-border bg-card px-3 text-[13px] font-medium text-foreground hover:border-accent/40 whitespace-nowrap">
          {fmtDate(value.range.from)} – {fmtDate(value.range.to)}
        </button>
      )}
      {open && value.preset === "custom" && (
        <CustomRangePopover range={value.range} onClose={() => setOpen(false)}
          onApply={(r) => { onChange("custom", r); setOpen(false); }} />
      )}
    </div>
  );
}

interface FilterBarProps {
  value: OverviewFilters;
  options: FilterOptions | undefined;
  activeCount: number;
  onChange: (next: OverviewFilters) => void;
  onReset: () => void;
}

/**
 * Global filter bar. Desktop/tablet: compact inline controls (wrapping).
 * Mobile: a single "Filters (n)" button opening a drawer with draft values and
 * Reset / Apply Filters.
 */
export function FilterBar({ value, options, activeCount, onChange, onReset }: FilterBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const setBusiness = (target: OverviewFilters, key: FilterKey, v: string | undefined, apply: (n: OverviewFilters) => void) =>
    apply({ ...target, [key]: v });

  const controls = (target: OverviewFilters, apply: (n: OverviewFilters) => void, stacked = false) => (
    <>
      <DateRangeControl value={target} onChange={(preset, range) => apply({ ...target, preset, range: range ?? target.range })} />
      <FilterSelect icon={Globe2} label="Country" allLabel="All Countries" value={target.country}
        options={options?.countries ?? []} onChange={(v) => setBusiness(target, "country", v, apply)} className={stacked ? "" : "w-48"} />
      <FilterSelect icon={Factory} label="Industry" allLabel="All Industries" value={target.industry}
        options={options?.industries ?? []} onChange={(v) => setBusiness(target, "industry", v, apply)} className={stacked ? "" : "w-48"} />
      <FilterSelect icon={Briefcase} label="Business Type" allLabel="All Business Types" value={target.businessType}
        options={options?.businessTypes ?? []} format={businessTypeLabel}
        onChange={(v) => setBusiness(target, "businessType", v, apply)} className={stacked ? "" : "w-56"} />
    </>
  );

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden md:flex flex-wrap items-center gap-3">
        {controls(value, onChange)}
        {activeCount > 0 && (
          <button type="button" onClick={onReset}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-muted hover:bg-card hover:text-foreground transition-colors">
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <button type="button" onClick={() => { setDraft(value); setDrawerOpen(true); }}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground">
          <SlidersHorizontal size={14} /> Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters" description="Applies to the whole overview" size="md"
          footer={
            <div className="flex gap-2 p-4">
              <button type="button" onClick={() => { onReset(); setDrawerOpen(false); }}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-[13px] font-semibold text-foreground">Reset</button>
              <button type="button" onClick={() => { onChange(draft); setDrawerOpen(false); }}
                className="flex-1 rounded-xl bg-accent px-3 py-2 text-[13px] font-semibold text-white">Apply Filters</button>
            </div>
          }>
          <div className="space-y-3 p-5">{controls(draft, setDraft, true)}</div>
        </Drawer>
      </div>
    </>
  );
}
