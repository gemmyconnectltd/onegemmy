"use client";
import { TableScroll } from "@/components/ui/TableScroll";

import { formatMoney } from "@/lib/money";
import type { AiBlock, AiCard } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Models write light Markdown and fancy Unicode spaces; show **bold** properly and normalise spacing. Plain text otherwise. */
export function Inline({ text }: { text: string }) {
  const clean = text.replace(/[  ]/g, " ");
  return (
    <>
      {clean.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4
          ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
          : <span key={i}>{part.replace(/^#{1,3}\s+/gm, "")}</span>,
      )}
    </>
  );
}

const TONE_TEXT: Record<NonNullable<AiCard["tone"]>, string> = {
  neutral: "text-foreground", positive: "text-emerald-600 dark:text-emerald-400", attention: "text-amber-600 dark:text-amber-400", critical: "text-red-600 dark:text-red-400",
};
const TONE_CHIP: Record<NonNullable<AiCard["tone"]>, string> = {
  neutral: "bg-surface text-muted", positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  attention: "bg-amber-500/10 text-amber-700 dark:text-amber-400", critical: "bg-red-500/10 text-red-700 dark:text-red-400",
};

/** Compact metric cards. Values are strings formatted by the server from verified numbers. */
export function Cards({ cards }: { cards: AiCard[] }) {
  return (
    <div className={cn("mt-2 grid gap-2", cards.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
      {cards.map((c) => (
        <div key={c.label} className="min-w-0 rounded-lg border border-border bg-card px-2.5 py-1.5">
          <p className="truncate text-[10.5px] font-medium text-muted">{c.label}</p>
          <p className={cn("truncate text-[15px] font-bold tabular-nums leading-tight", TONE_TEXT[c.tone])} title={c.value}>{c.value}</p>
          {c.hint && <p className="truncate text-[10.5px] text-muted">{c.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars with plain divs — a chart library would add a lazy-loaded bundle for a narrow side panel. */
export function MiniBar({ chart }: { chart: NonNullable<AiBlock["chart"]> }) {
  const max = Math.max(...chart.values, 1);
  const fmt = (v: number) => (chart.currency ? formatMoney(v, chart.currency, { compact: true }) : v.toLocaleString("en-US"));
  return (
    <figure className="mt-2 rounded-lg border border-border bg-card p-2.5" aria-label={chart.title}>
      <figcaption className="mb-1.5 text-[11px] font-semibold text-muted">{chart.title}</figcaption>
      <div className="space-y-1.5">
        {chart.labels.map((label, i) => (
          <div key={`${label}-${i}`} className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2 text-[11.5px]">
            <span className="truncate text-foreground" title={label}>{label}</span>
            <div className="h-2.5 rounded-full bg-border/60">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (Math.max(chart.values[i], 0) / max) * 100)}%` }} />
            </div>
            <span className="font-semibold tabular-nums text-foreground">{fmt(chart.values[i])}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

const STATUS_CELL: Record<string, string> = {
  "Out of stock": "bg-red-500/10 text-red-700 dark:text-red-400", Low: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function DataTable({ block }: { block: AiBlock }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <TableScroll><table className="w-full min-w-[280px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-border bg-surface text-[10.5px] uppercase tracking-wide text-muted">
              {block.columns.map((c) => <th key={c} className={cn("whitespace-nowrap px-2.5 py-1.5 font-semibold", c !== block.columns[0] && "text-right")}>{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {block.rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => (
                <td key={j} title={j === 0 ? String(cell) : undefined}
                  className={cn("px-2.5 py-1.5 tabular-nums", j === 0 ? "max-w-[10rem] truncate font-medium text-foreground" : "whitespace-nowrap text-right text-muted")}>
                  {typeof cell === "string" && STATUS_CELL[cell]
                    ? <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", STATUS_CELL[cell])}>{cell}</span>
                    : cell}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table></TableScroll>
      </div>
      {(block.how || block.period) && (
        <details className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted">
          <summary className="cursor-pointer select-none font-medium">How this was worked out</summary>
          <p className="mt-1">{block.how}</p>
          {block.period && <p className="mt-0.5">Period: {block.period.from} to {block.period.to} · Currency: {block.currency}</p>}
        </details>
      )}
    </div>
  );
}

/** One structured answer: optional heading with tone, metric cards, chart, table, caveat — only what the server sent. */
export function Block({ block }: { block: AiBlock }) {
  const tone = block.tone ?? "neutral";
  return (
    <div className="mt-3 first:mt-0">
      {block.heading && (
        <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold", TONE_CHIP[tone])}>{block.heading}</span>
      )}
      {block.cards && block.cards.length > 0 && <Cards cards={block.cards} />}
      {block.chart && <MiniBar chart={block.chart} />}
      {block.columns.length > 0 && <DataTable block={block} />}
      {block.note && <p className="mt-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-800 dark:text-amber-300">{block.note}</p>}
    </div>
  );
}
