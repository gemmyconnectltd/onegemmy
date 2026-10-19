"use client";
import { useState } from "react";
import { MenuImagePreview } from "./MenuImagePreview";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { MarketingNavItem, MarketingNavSection } from "@/lib/navigation";

export function MegaMenuItem({ item, onNavigate, onPreview, selected }: { item: MarketingNavItem; onNavigate: () => void; onPreview?: (item: MarketingNavItem) => void; selected?: boolean }) {
  const Icon = item.icon;
  return <Link href={item.href} onClick={onNavigate} onMouseEnter={onPreview ? () => onPreview(item) : undefined} onFocus={onPreview ? () => onPreview(item) : undefined} data-nav-id={item.id} data-preview-selected={selected || undefined} className="mega-menu-item group flex min-w-0 items-start gap-3 rounded-lg p-3 transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 data-[preview-selected=true]:bg-primary/5">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-accent"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>
    <span className="min-w-0"><span className="block text-sm font-semibold leading-5 text-foreground group-hover:text-accent">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted">{item.description}</span></span>
  </Link>;
}
export function MegaMenuSection({ section, onNavigate, compact = false, onPreview, selectedId }: { section: MarketingNavSection; onNavigate: () => void; compact?: boolean; onPreview?: (item: MarketingNavItem) => void; selectedId?: string }) {
  return <section className="mega-menu-section"><h2 className="px-3 pb-3 text-xs font-semibold uppercase tracking-widest text-muted">{section.title}</h2><div className={`grid gap-x-4 gap-y-1 ${compact ? "" : onPreview ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-3"}`}>{section.items.map(item => <MegaMenuItem key={item.id} item={item} onNavigate={onNavigate} onPreview={onPreview} selected={selectedId === item.id} />)}</div></section>;
}
export function ProductMenuFooter({ onNavigate }: { onNavigate: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-primary/5 px-6 py-4"><div><p className="text-sm font-semibold text-foreground">Explore the full PESAA platform</p><p className="mt-1 text-xs text-muted">Discover how all your business operations work together.</p></div><Link href="/products" onClick={onNavigate} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-accent hover:bg-primary/5">Explore product<ArrowRight size={16} aria-hidden="true" /></Link></div>;
}

export function MegaMenuContent({ sections, onNavigate, preview }: { sections: MarketingNavSection[]; onNavigate: () => void; preview: boolean }) {
  const [selected, setSelected] = useState(sections[0].items[0]);
  return <div className={`marketing-mega-content overflow-y-auto p-5 ${preview ? "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
    <div className="space-y-5">{sections.map(section => <MegaMenuSection key={section.title} section={section} onNavigate={onNavigate} compact={!preview} onPreview={preview ? setSelected : undefined} selectedId={preview ? selected.id : undefined} />)}</div>
    {preview && <MenuImagePreview item={selected} onNavigate={onNavigate} />}
  </div>;
}
