"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TabStrip, type TabItem } from "./TabStrip";

/**
 * Second sidebar for any area with several sub-pages (Plans & Billing, Customer Support, a Tenant, Settings).
 * Desktop: a vertical list beside the content. Below 1024px (where the main sidebar is already collapsed):
 * the same items as a scrollable tab strip. One component so every area navigates the same way.
 */
export function SecondaryNav({ items, label, title, subtitle, icon: Icon }: { items: TabItem[]; label: string; title?: string; subtitle?: string; icon?: ElementType }) {
  return (
    <>
      <div className="lg:hidden"><TabStrip items={items} label={label} /></div>
      <nav aria-label={label} className="hidden w-52 flex-shrink-0 lg:block xl:w-56">
        <div className="sticky top-20 overflow-hidden rounded-xl border border-border bg-card">
          {title && (
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
              {Icon && <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={16} aria-hidden /></span>}
              <div className="min-w-0"><p className="truncate text-[13.5px] font-bold text-foreground">{title}</p>{subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}</div>
            </div>
          )}
          <div className="py-1.5">
            {items.map((t, i) => {
              const heading = t.group && t.group !== items[i - 1]?.group ? <p className={cn("px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted", i > 0 ? "mt-2 border-t border-border pt-3" : "pt-1.5")}>{t.group}</p> : null;
              const cls = cn("pesaa-nav-row flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-semibold transition-colors");
              const inner = <>{t.icon && <t.icon size={16} className="flex-shrink-0" />}<span className="min-w-0 flex-1 truncate">{t.label}</span>{typeof t.count === "number" && <span data-nav-indicator className="rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] text-muted">{t.count}</span>}{t.dot && <span title="Unsaved changes" aria-label="Unsaved changes" className="h-1.5 w-1.5 rounded-full bg-amber-500" />}</>;
              const row = t.href
                ? <Link key={t.key} href={t.href} aria-current={t.active ? "page" : undefined} data-active={t.active} className={cls}>{inner}</Link>
                : <button key={t.key} type="button" onClick={t.onSelect} aria-current={t.active ? "page" : undefined} data-active={t.active} className={cls}>{inner}</button>;
              return <div key={t.key}>{heading}{row}</div>;
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

/** Side-by-side shell: second sidebar on the left, page content filling the rest. */
export function SectionLayout({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">{nav}<div className="min-w-0 flex-1 space-y-4">{children}</div></div>;
}
