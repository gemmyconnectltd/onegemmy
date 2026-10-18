"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }

/** Compact "⋯" dropdown. The panel is position:fixed so a table's scroll container never clips it. */
export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  return (
    <>
      <button ref={btn} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground">
        <MoreHorizontal size={15} />
      </button>
      {pos && (
        <div ref={panel} role="menu" style={{ top: pos.top, right: pos.right }} className="fixed z-50 min-w-[190px] rounded-xl border border-border bg-card p-1 shadow-lg">
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" disabled={it.disabled} title={it.hint}
              onClick={() => { setPos(null); it.onSelect(); }}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", it.danger ? "text-red-600 hover:bg-red-500/10 dark:text-red-400" : "text-foreground hover:bg-surface")}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
