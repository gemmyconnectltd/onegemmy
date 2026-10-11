"use client";

import { useState } from "react";

/**
 * A cart quantity you can tap and type (cashiers selling 24 of something shouldn't tap + 24 times). Commits on Enter or
 * when you leave the field; empty, 0 or junk puts the old number back (removing a line stays an explicit action), and
 * the number is capped at `max` (available stock) when one is known.
 */
export function QtyInput({
  value, max, onCommit, className,
}: {
  value: number;
  max?: number;
  onCommit: (next: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const n = Math.floor(Number(draft));
    setDraft(null);
    if (!Number.isFinite(n) || n < 1) return;
    const next = max !== undefined && max > 0 ? Math.min(n, max) : n;
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Quantity" enterKeyHint="done"
      value={draft ?? String(value)}
      onFocus={(e) => { setDraft(String(value)); e.currentTarget.select(); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }}
      className={`rounded-md border border-transparent bg-transparent text-center font-bold tabular-nums outline-none hover:border-border focus:border-accent focus:bg-card ${className ?? ""}`}
    />
  );
}
