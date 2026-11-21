"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { TableScroll } from "@/components/ui/TableScroll";
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
      <p className="mt-1 break-words text-lg font-bold leading-tight tracking-tight tabular-nums text-foreground sm:text-xl" title={value}>{value}</p>
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


/** A small read-only table for report sections: first column is the name, the rest are right-aligned figures. */
export function MiniTable({ head, rows, empty, label }: { head: string[]; rows: (string | number)[][]; empty: string; label?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return <TableScroll label={label} mobileLayout="cards"><table className="w-full min-w-[360px] text-left text-sm"><thead><tr className="border-b border-border text-[12px] text-muted">{head.map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{rows.map((r, n) => <tr key={n}>{r.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? "max-w-[240px] truncate font-medium text-foreground" : "text-right tabular-nums"}`}>{c}</td>)}</tr>)}</tbody></table></TableScroll>;
}

/** "Details" link at the top-right of an overview block; keeps the report filters. */
export function DetailsLink({ href, label = "Details" }: { href: string; label?: string }) {
  return <Link href={href} className="text-[12px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">{label} <span aria-hidden>→</span></Link>;
}

/** A label / value row used in overview blocks. */
export function Row({ label, value, href, tone }: { label: React.ReactNode; value: React.ReactNode; href?: string; tone?: "warning" | "error" }) {
  const v = <span className={cn("font-semibold tabular-nums", tone === "error" ? "text-red-600" : tone === "warning" ? "text-amber-700" : "text-foreground")}>{value}</span>;
  return <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]"><span className="min-w-0 truncate text-muted">{label}</span>{href ? <Link href={href} className="hover:underline">{v}</Link> : v}</div>;
}
