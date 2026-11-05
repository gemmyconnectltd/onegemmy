"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** The one summary card used across PESAA lists and overviews: an icon tile, the figure, its label and an optional hint.
 *  `tone` only recolours the tile and figure (never the card), so a row of cards still reads as one family. */
export function StatCard({ label, value, icon: Icon, color, hint, href, tone = "default", loading = false }: {
  label: string; value: string | number; icon: LucideIcon; color?: string; hint?: string; href?: string; tone?: "default" | "warning" | "danger"; loading?: boolean;
}) {
  const accent = tone === "danger" ? "#dc2626" : tone === "warning" ? "#d97706" : color ?? "var(--primary)";
  const body = (
    <>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
        <Icon size={16} style={{ color: accent }} aria-hidden />
      </div>
      <p className="truncate text-lg font-extrabold tracking-tight text-foreground sm:text-xl" style={tone === "default" ? undefined : { color: accent }} title={loading ? undefined : String(value)}>{loading ? "—" : value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted/80">{hint}</p>}
    </>
  );
  const box = "block min-w-0 rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md";
  return href ? <Link href={href} className={`${box} hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent`}>{body}</Link> : <div className={box}>{body}</div>;
}
