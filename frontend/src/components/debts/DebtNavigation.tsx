"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Menu } from "lucide-react";
import { DebtDrawer as Drawer } from "./DebtDrawer";
import { Button } from "@/components/ui/Button";
import { useAppConfig } from "@/lib/appConfig";

import { DEBT_NAV } from "@/lib/navigation";
export { DEBT_NAV } from "@/lib/navigation";

export function DebtNavigation() {
  const pathname = usePathname();
  const { navOrientation } = useAppConfig();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const horizontal = navOrientation !== "left";
  const links = (compact = false, rail = true) => DEBT_NAV.map(item => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={item.label} aria-label={item.label} aria-current={active ? "page" : undefined}
      data-active={rail && active} className={`flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-semibold transition-colors ${rail ? "pesaa-nav-row w-full" : active ? "border-b-2 border-accent text-accent" : "border-b-2 border-transparent text-muted hover:bg-[var(--primary-light)]"}`}>
      <item.icon size={17} className="shrink-0" />{!compact && <span className="whitespace-nowrap">{item.label}</span>}
    </Link>;
  });
  return <>
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2 lg:hidden"><span className="text-sm font-semibold">Debt Management</span><Button variant="outline" onClick={() => setOpen(true)}><Menu size={16} /> Navigation</Button></div>
    <nav aria-label="Debt Management navigation" className={`hidden shrink-0 border-border bg-card lg:flex ${horizontal ? "w-full flex-row overflow-x-auto border-b px-3 py-2" : `${collapsed ? "w-14" : "w-56"} sticky top-14 max-h-[calc(100vh-56px)] self-start flex-col overflow-y-auto border-r py-3`}`}>
      {!horizontal && <div className="mb-2 flex h-8 items-center justify-between px-3">{!collapsed && <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Debt Management</span>}<button type="button" title={collapsed ? "Expand debt navigation" : "Collapse debt navigation"} aria-label={collapsed ? "Expand debt navigation" : "Collapse debt navigation"} onClick={() => setCollapsed(v => !v)} className="rounded-md p-1.5 text-muted hover:bg-surface">{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>}
      <div className={`flex gap-1 ${horizontal ? "items-center" : "flex-col"}`}>{links(collapsed && !horizontal, !horizontal)}</div>
    </nav>
    <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Debt Management" size="sm"><nav aria-label="Mobile debt navigation" className="space-y-1 py-3">{links()}</nav></Drawer>
  </>;
}
