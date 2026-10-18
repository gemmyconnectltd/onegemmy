"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { RangeCalendar } from "./RangeCalendar";
import {
  PAST_YEARS, customLabel, daysInRange, fmtShort, isPresetKey, parseISO, periodDateRange, quarterLabel, quarterRange, resolveSelection, toISO,
  type DateSelection, type Period, type ResolvedRange,
} from "./data";

const BAR: { key: Period; label: string }[] = [
  { key: "today", label: "Today" }, { key: "week", label: "This Week" }, { key: "month", label: "This Month" }, { key: "last_month", label: "Last Month" },
];
const QUICK: { key: Period | "past_years" | "custom"; label: string }[] = [
  { key: "today", label: "Today" }, { key: "week", label: "This Week" }, { key: "month", label: "This Month" }, { key: "last_month", label: "Last Month" },
  { key: "quarter", label: "This Quarter" }, { key: "year", label: "This Year" }, { key: "past_years", label: "Past Years" }, { key: "custom", label: "Custom Range" },
];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 2014 }, (_, i) => THIS_YEAR - i); // any year back to 2015

interface Pending { key: string; from: string; to: string; label: string }
const toPending = (r: ResolvedRange): Pending => ({ key: r.key, from: r.from, to: r.to, label: r.label });

/**
 * Dashboard date filter: a compact preset bar plus a "More" popover (quick select, year + quarter, calendar).
 * Choices in the popover are PENDING until Apply, so browsing the calendar never refetches the dashboard.
 */
export function DateRangeFilter({ value, onChange }: { value: DateSelection; onChange: (s: DateSelection) => void }) {
  const current = resolveSelection(value);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(toPending(current));
  const [year, setYear] = useState(THIS_YEAR);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const today = toISO(new Date());

  const inBar = BAR.some((b) => b.key === current.key);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const openPopover = () => {
    if (open) return close();
    setPending(toPending(current));
    const m = /^quarter_(\d{4})_\d$/.exec(current.key) ?? /^year_(\d{4})$/.exec(current.key);
    setYear(m ? Number(m[1]) : current.from ? parseISO(current.from).getFullYear() : THIS_YEAR);
    setOpen(true);
  };

  const pickQuick = (key: (typeof QUICK)[number]["key"]) => {
    if (key === "past_years") { const y = PAST_YEARS[0] ? Number(PAST_YEARS[0].key.replace("year_", "")) : THIS_YEAR - 1; setYear(y); return setPending({ key: `year_${y}`, ...periodDateRange(`year_${y}` as Period), label: String(y) }); }
    if (key === "custom") return setPending((p) => ({ key: "custom", from: p.from, to: p.to, label: customLabel(p.from, p.to) }));
    setPending(toPending(resolveSelection({ key })));
  };
  const selectFullYear = (y: number) => {
    setYear(y);
    const r = y === THIS_YEAR ? { from: `${y}-01-01`, to: today } : { from: `${y}-01-01`, to: `${y}-12-31` };
    setPending({ key: y === THIS_YEAR ? "year" : `year_${y}`, ...r, label: y === THIS_YEAR ? "This Year" : String(y) });
  };
  const pickYear = (y: number) => {
    setYear(y);
    // Changing the year keeps the quarter if one is selected, otherwise selects that whole year.
    const q = /^quarter_\d{4}_(\d)$/.exec(pending.key)?.[1];
    if (q) { const r = quarterRange(y, Number(q)); if (!r.startsInFuture) return setPending({ key: `quarter_${y}_${q}`, from: r.from, to: r.to, label: quarterLabel(y, Number(q)) }); }
    const r = y === THIS_YEAR ? { from: `${y}-01-01`, to: today } : { from: `${y}-01-01`, to: `${y}-12-31` };
    setPending({ key: y === THIS_YEAR ? "year" : `year_${y}`, ...r, label: y === THIS_YEAR ? "This Year" : String(y) });
  };
  const pickQuarter = (q: number) => {
    const r = quarterRange(year, q);
    if (r.startsInFuture) return;
    setPending({ key: `quarter_${year}_${q}`, from: r.from, to: r.to, label: quarterLabel(year, q) });
  };
  const pickCalendar = (from: string, to: string) => setPending({ key: "custom", from, to, label: customLabel(from, to) });
  const editDate = (which: "from" | "to", v: string) => {
    if (!v || v > today) return;
    // Moving one end past the other drags the other end along, so typing a date never silently flips the range.
    if (which === "from") pickCalendar(v, v > pending.to ? v : pending.to);
    else pickCalendar(v < pending.from ? v : pending.from, v);
  };

  const apply = () => {
    const matchesPreset = isPresetKey(pending.key);
    onChange(matchesPreset ? { key: pending.key } : { key: pending.key, from: pending.from, to: pending.to, label: pending.label });
    setOpen(false);
  };
  const activeQuick = (k: (typeof QUICK)[number]["key"]) => k === "past_years" ? /^year_\d{4}$/.test(pending.key) : k === "custom" ? pending.key === "custom" : pending.key === k;
  const activeQ = /^quarter_(\d{4})_(\d)$/.exec(pending.key);

  const seg = (on: boolean) => cn("whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors", on ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground");

  return (
    <div ref={root} className="relative flex min-w-0 max-w-full items-center gap-2">
      <div role="group" aria-label="Date range" className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-card p-0.5 no-scrollbar">
        {BAR.map((b) => <button key={b.key} type="button" aria-pressed={current.key === b.key} onClick={() => onChange({ key: b.key })} className={seg(current.key === b.key)}>{b.label}</button>)}
        <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={openPopover} className={cn(seg(!inBar), "flex items-center gap-1")}>
          {inBar ? "More" : current.label}<ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <span className="hidden items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live</span>

      {open && (
        <div role="dialog" aria-label="Choose date range" className="fixed inset-x-3 bottom-3 top-auto z-50 max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-2 md:w-[720px] md:max-h-none md:overflow-visible">
          <div className="grid divide-border md:grid-cols-[150px_1fr_260px] md:divide-x">
            <div className="p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Quick select</p>
              <ul className="grid grid-cols-2 gap-0.5 md:grid-cols-1">
                {QUICK.map((q) => (
                  <li key={q.key}><button type="button" aria-pressed={activeQuick(q.key)} onClick={() => pickQuick(q.key)} className={cn("flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium", activeQuick(q.key) ? "bg-accent/10 text-accent" : "text-foreground hover:bg-surface")}>{q.label}{activeQuick(q.key) && <Check size={12} />}</button></li>
                ))}
              </ul>
            </div>

            <div className="p-3">
              <label htmlFor="dr-year" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">Select year</label>
              <select id="dr-year" value={year} onChange={(e) => pickYear(Number(e.target.value))} className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] font-semibold text-foreground outline-none focus:border-accent">
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button type="button" aria-pressed={pending.key === "year" || pending.key === `year_${year}`} onClick={() => selectFullYear(year)}
                className={cn("mt-2 w-full rounded-lg border px-3 py-2 text-left transition-colors", pending.key === "year" || pending.key === `year_${year}` ? "border-accent bg-accent/10" : "border-border hover:bg-surface")}>
                <span className={cn("block text-[13px] font-bold", pending.key === "year" || pending.key === `year_${year}` ? "text-accent" : "text-foreground")}>Full year {year}</span>
                <span className="block text-[11px] text-muted">1 Jan – {year === THIS_YEAR ? "today" : "31 Dec"}</span>
              </button>
              <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Quarter</p>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((q) => {
                  const r = quarterRange(year, q);
                  const on = !!activeQ && Number(activeQ[1]) === year && Number(activeQ[2]) === q;
                  const startM = new Date(year, (q - 1) * 3, 1), endM = new Date(year, q * 3, 0);
                  return (
                    <button key={q} type="button" disabled={r.startsInFuture} aria-pressed={on} onClick={() => pickQuarter(q)}
                      className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40", on ? "border-accent bg-accent/10" : "border-border hover:bg-surface")}>
                      <span className={cn("block text-[13px] font-bold", on ? "text-accent" : "text-foreground")}>Q{q}</span>
                      <span className="block text-[11px] text-muted">{fmtShort(toISO(startM), false)} – {fmtShort(toISO(endM), false)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted">Fiscal year = calendar year.</p>
            </div>

            <div className="p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Custom range</p>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted">From<input type="date" value={pending.from} max={today} onChange={(e) => editDate("from", e.target.value)} className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-accent" /></label>
                <label className="text-[11px] text-muted">To<input type="date" value={pending.to} max={today} onChange={(e) => editDate("to", e.target.value)} className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-accent" /></label>
              </div>
              <RangeCalendar from={pending.from} to={pending.to} max={today} onChange={pickCalendar} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface/40 px-3 py-2.5">
            <p className="text-[12px] text-muted"><span className="font-semibold text-foreground">{pending.label}</span> · {fmtShort(pending.from)} – {fmtShort(pending.to)} · {daysInRange(pending.from, pending.to)} day{daysInRange(pending.from, pending.to) === 1 ? "" : "s"}</p>
            <div className="flex gap-2">
              <button type="button" onClick={close} className="rounded-lg border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-surface">Cancel</button>
              <button type="button" onClick={apply} className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent/90">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
