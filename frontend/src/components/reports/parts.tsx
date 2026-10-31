"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

function Delta({ percent, inverse, label }: { percent: number | null | undefined; inverse?: boolean; label: string }) {
  if (percent === null || percent === undefined) return null;
  const up = percent >= 0, good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-semibold", good ? "text-emerald-600" : "text-red-600")} title={`Compared with ${label}`}><Icon size={13} aria-hidden />{Math.abs(percent)}%<span className="sr-only"> {up ? "higher" : "lower"} than {label}</span></span>;
}

export function Kpi({ label, value, note, href, percent, inverse, compareLabel }: { label: string; value: string; note?: string; href?: string; percent?: number | null; inverse?: boolean; compareLabel?: string }) {
  const body = (
    <div className="h-full min-w-0 rounded-xl border border-border bg-card p-4 transition-colors group-hover:border-accent">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tracking-tight text-foreground sm:text-[22px]" title={value}>{value}</p>
      <div className="mt-1 flex min-h-[18px] flex-wrap items-center gap-x-2 text-[12px] text-muted">{compareLabel && <Delta percent={percent} inverse={inverse} label={compareLabel} />}{note && <span>{note}</span>}</div>
    </div>
  );
  return href ? <Link href={href} className="group block focus-visible:outline-2 focus-visible:outline-accent">{body}</Link> : <div className="group">{body}</div>;
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-border bg-card"><header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3"><h2 className="text-sm font-bold text-foreground">{title}</h2>{action}</header><div className="p-4">{children}</div></section>;
}

export function Bars({ rows, money, empty }: { rows: { key: string; label: string; value: number; sub?: string }[]; money: (n: number) => string; empty: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted">{empty}</p>;
  return <ul className="space-y-3">{rows.map((r) => (
    <li key={r.key}><div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 truncate font-medium text-foreground">{r.label}</span><span className="shrink-0 font-semibold tabular-nums text-foreground">{money(r.value)}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-accent" style={{ width: `${max ? Math.max(2, (r.value / max) * 100) : 0}%` }} /></div>{r.sub && <p className="mt-0.5 text-[11px] text-muted">{r.sub}</p>}</li>
  ))}</ul>;
}

