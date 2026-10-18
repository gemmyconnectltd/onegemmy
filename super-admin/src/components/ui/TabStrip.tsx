"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem { key: string; label: string; icon?: ElementType; href?: string; count?: number; dot?: boolean; active: boolean; onSelect?: () => void }

/** Horizontal tab strip used by every multi-page area (Billing, Support) and tabbed detail page (Tenant). */
export function TabStrip({ items, label, trailing }: { items: TabItem[]; label: string; trailing?: ReactNode }) {
  const isNav = !!items[0]?.href;
  const Wrap = isNav ? "nav" : "div";
  const cls = (active: boolean) => cn("flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors", active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground");
  return (
    <div className="no-scrollbar -mx-4 flex items-end justify-between gap-3 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      <Wrap role={isNav ? undefined : "tablist"} aria-label={label} className="flex min-w-max gap-1">
        {items.map((t) => {
          const inner = <>{t.icon && <t.icon size={15} />}{t.label}{typeof t.count === "number" && <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] text-muted">{t.count}</span>}{t.dot && <span title="Unsaved changes" aria-label="Unsaved changes" className="h-1.5 w-1.5 rounded-full bg-amber-500" />}</>;
          return t.href
            ? <Link key={t.key} href={t.href} aria-current={t.active ? "page" : undefined} className={cls(t.active)}>{inner}</Link>
            : <button key={t.key} type="button" role="tab" aria-selected={t.active} onClick={t.onSelect} className={cls(t.active)}>{inner}</button>;
        })}
      </Wrap>
      {trailing}
    </div>
  );
}
