"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, ListOrdered, Users, Truck, Landmark, Building2, Wallet, ReceiptText, ChartNoAxesCombined, PanelLeftClose, PanelLeftOpen, Menu } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { useAppConfig } from "@/lib/appConfig";

export const ACCOUNTING_NAV = [
  { href: "/accounting", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/accounting/accounts", label: "Chart of Accounts", icon: BookOpen },
  { href: "/accounting/ledger", label: "General Ledger", icon: ListOrdered },
  { href: "/accounting/receivables", label: "Accounts Receivable", icon: Users },
  { href: "/accounting/payables", label: "Accounts Payable", icon: Truck },
  { href: "/accounting/cash-bank", label: "Cash & Bank", icon: Landmark },
  { href: "/accounting/assets", label: "Fixed Assets", icon: Building2 },
  { href: "/accounting/payroll", label: "Payroll", icon: Wallet },
  { href: "/accounting/tax", label: "Tax Management", icon: ReceiptText },
  { href: "/accounting/reports", label: "Financial Reports", icon: ChartNoAxesCombined },
];

export function AccountingNavigation() {
  const pathname = usePathname();
  const { navOrientation } = useAppConfig();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const horizontal = navOrientation !== "left";
  const links = (compact = false) => ACCOUNTING_NAV.map(item => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={item.label} aria-label={item.label} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors ${active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface hover:text-foreground"}`}>
      <item.icon size={17} className="shrink-0" />{!compact && <span className="whitespace-nowrap">{item.label}</span>}
    </Link>;
  });
  return <>
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2 lg:hidden"><span className="text-sm font-semibold">Accounting</span><Button variant="outline" onClick={() => setOpen(true)}><Menu size={16} /> Navigation</Button></div>
    <nav aria-label="Accounting navigation" className={`hidden shrink-0 border-border bg-card lg:flex ${horizontal ? "w-full flex-row overflow-x-auto border-b px-3 py-2" : `${collapsed ? "w-14" : "w-56"} sticky top-14 max-h-[calc(100vh-56px)] self-start flex-col overflow-y-auto border-r py-3`}`}>
      {!horizontal && <div className="mb-2 flex h-8 items-center justify-between px-3">{!collapsed && <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Accounting</span>}<button type="button" title={collapsed ? "Expand accounting navigation" : "Collapse accounting navigation"} aria-label={collapsed ? "Expand accounting navigation" : "Collapse accounting navigation"} onClick={() => setCollapsed(v => !v)} className="rounded-md p-1.5 text-muted hover:bg-surface">{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>}
      <div className={`flex gap-1 ${horizontal ? "items-center" : "flex-col px-1.5"}`}>{links(collapsed && !horizontal)}</div>
    </nav>
    <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Accounting" size="sm"><nav aria-label="Mobile accounting navigation" className="space-y-1 p-3">{links()}</nav></Drawer>
  </>;
}
