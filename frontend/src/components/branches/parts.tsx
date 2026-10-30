"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  slate: "bg-surface text-muted border border-border",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
} as const;

export function Pill({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TONES[tone])}>{children}</span>;
}

export const StatusPill = ({ status }: { status: string | null }) => <Pill tone={status === "active" ? "green" : "slate"}>{status === "active" ? "Active" : "Inactive"}</Pill>;
export const MainBadge = () => <Pill tone="amber">Main branch</Pill>;

export function Card({ title, hint, action, children, className }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card", className)}>
      {(title || action) && <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><div className="min-w-0"><h2 className="text-sm font-bold text-foreground">{title}</h2>{hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}</div>{action}</header>}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3.5">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold leading-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}

export type MenuItem = { label: string; href?: string; onSelect?: () => void; danger?: boolean; disabled?: boolean };

/** A small popover menu for a row's actions. Closes on outside click and Escape; only lists what the person can do. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
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
  const cls = (i: MenuItem) => cn("block w-full px-3 py-2 text-left text-[13px] font-medium hover:bg-surface focus-visible:bg-surface focus-visible:outline-none disabled:opacity-40", i.danger ? "text-red-600" : "text-foreground");
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"><MoreHorizontal size={16} /></button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
          {items.map((i) => i.href
            ? <Link key={i.label} role="menuitem" href={i.href} className={cls(i)} onClick={() => setOpen(false)}>{i.label}</Link>
            : <button key={i.label} type="button" role="menuitem" disabled={i.disabled} className={cls(i)} onClick={() => { setOpen(false); i.onSelect?.(); }}>{i.label}</button>)}
        </div>
      )}
    </div>
  );
}
