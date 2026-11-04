"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import { toISODate } from "@/lib/period";

const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const QUICK = [{ label: "Yesterday", days: 1 }, { label: "2 days ago", days: 2 }, { label: "Last week", days: 7 }];

export const saleAtLabel = (value: string) => new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** For recording a sale that already happened: pick the day (and time) it was made. Empty means "now", the normal till behaviour. */
export function SaleDate({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const now = new Date();
  const max = local(now);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const pick = (d: Date) => { const at = new Date(d); at.setHours(new Date().getHours(), new Date().getMinutes(), 0, 0); onChange(local(at)); };
  return (
    <div ref={root} className="relative">
      <div className={`flex h-9 items-center gap-1 rounded-xl border pl-3 pr-1.5 ${value ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-surface"}`}>
        <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-accent">
          <CalendarClock size={13} className={value ? "shrink-0 text-amber-700 dark:text-amber-300" : "shrink-0 text-muted"} aria-hidden />
          <span className="shrink-0 text-muted">Sale date</span>
          <span className={`min-w-0 truncate ${value ? "text-amber-800 dark:text-amber-300" : "text-foreground"}`}>{value ? saleAtLabel(value) : "Now"}</span>
        </button>
        {value && <button type="button" onClick={() => onChange(null)} aria-label="Use the current time" className="shrink-0 rounded p-1 text-muted hover:bg-black/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><X size={12} /></button>}
      </div>
      {open && (
        <div role="dialog" aria-label="Choose the sale date" className="absolute left-0 right-0 z-50 mt-1 space-y-3 rounded-xl border border-border bg-card p-3 shadow-xl">
          <p className="text-[12px] font-semibold text-foreground">When did this sale happen?</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${!value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}>{!value && <Check size={11} className="mr-1 inline" />}Now</button>
            {QUICK.map((q) => <button key={q.days} type="button" onClick={() => { pick(daysAgo(q.days)); setOpen(false); }} className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-muted hover:text-foreground">{q.label}</button>)}
          </div>
          <label className="block text-[12px] font-medium text-muted">Or choose a date and time
            <input type="datetime-local" max={max} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent" />
          </label>
          <p className="text-[11px] leading-snug text-muted">The sale is recorded on that date in your reports and on the receipt. Stock is taken from today&apos;s balance.</p>
          <button type="button" onClick={() => setOpen(false)} className="w-full rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent/90">Done</button>
        </div>
      )}
    </div>
  );
}
