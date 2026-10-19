/* eslint-disable @next/next/no-img-element -- Tenant-uploaded logos retain their existing image handling. */
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useMyEntitlements } from "@/lib/api/hooks";
import { siteConfig } from "@/lib/config";
import { MODULE_NAV, isModuleLinkActive } from "@/lib/navigation";
import { LogoMark } from "@/components/ui/LogoMark";
import { Drawer } from "@/components/ui/Drawer";
import { LogOut, Menu, PanelLeft, ChevronDown } from "lucide-react";
import { ADMIN_NAV_ITEMS, visiblePrimaryNavigation, type PrimaryNavGroup as NavGroup } from "@/lib/navigation";

interface SidebarProps { expanded: boolean; onExpandChange: (value: boolean) => void; collapsed: boolean; onCollapsedChange: (value: boolean) => void; variant?: "app" | "admin"; }
export const SIDEBAR_W_COLLAPSED = 64;
export const SIDEBAR_W_EXPANDED = 208;
export function sidebarWidth(collapsed: boolean) { return collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED; }
function activeModule(path: string, href: string) { return href === "/dashboard" || href === "/admin" ? path === href : path === href || path.startsWith(href + "/"); }
function subscribeMobile(callback: () => void) { const media = window.matchMedia("(max-width: 1023px)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
const mobileSnapshot = () => window.matchMedia("(max-width: 1023px)").matches;
const serverSnapshot = () => false;

export function Sidebar({ expanded, onExpandChange, collapsed, onCollapsedChange, variant = "app" }: SidebarProps) {
  const path = usePathname();
  const router = useRouter();
  const { user, logout, hasModuleAccess } = useAuth();
  const { logoUrl } = useAppConfig();
  const admin = variant === "admin";
  const { data: entitlements } = useMyEntitlements({enabled: !admin});
  const groups = admin ? [{items: ADMIN_NAV_ITEMS}] : visiblePrimaryNavigation(entitlements?.features, hasModuleAccess);
  const allItems = groups.flatMap(group => group.items);
  const mobileItems = allItems.slice(0, 5);
  const isMobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, serverSnapshot);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const open = isMobile && (expanded || moreOpen);
  const width = sidebarWidth(collapsed);
  const brand = admin ? siteConfig.name : user?.tenantName || siteConfig.name;
  const initials = user?.name?.split(/\s+/).slice(0,2).map(word => word[0]).join("").toUpperCase() || "U";
  function close() { setMoreOpen(false); onExpandChange(false); }
  function signOut() { close(); logout(); router.push("/login"); }
  useEffect(() => {
    if (!accountOpen) return;
    const outside = (event: PointerEvent) => { if (!account.current?.contains(event.target as Node)) setAccountOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") {setAccountOpen(false); account.current?.querySelector("button")?.focus();} };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);};
  }, [accountOpen]);
  return <>
    <button type="button" onClick={() => onCollapsedChange(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="fixed top-5 z-50 hidden h-5 w-5 items-center justify-center rounded-md border border-border bg-card text-muted shadow-sm transition-[left,color] duration-150 hover:text-accent lg:flex" style={{left: width - 10}}><PanelLeft size={12} /></button>
    <aside aria-label="Application sidebar" className="fixed inset-y-0 left-0 z-40 hidden h-dvh flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-150 lg:flex" style={{width}}>
      <Link href={admin ? "/admin" : "/dashboard"} title={brand} className={`flex h-[60px] shrink-0 items-center gap-2.5 border-b border-border ${collapsed ? "justify-center" : "px-4"}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent text-white">{!admin && logoUrl ? <img src={logoUrl} alt={`${brand} logo`} className="h-full w-full object-cover" /> : <LogoMark size={17} />}</span>{!collapsed && <span className="truncate text-sm font-bold">{brand}</span>}</Link>
      <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2"><NavigationGroups groups={groups} path={path} collapsed={collapsed} expandSidebar={() => onCollapsedChange(false)} admin={admin} /></nav>
      <div ref={account} className="shrink-0 border-t border-border p-2" data-tour={admin ? undefined : "user-menu"}>
        <button aria-label="Open account menu" aria-expanded={accountOpen} aria-controls="sidebar-account-menu" onClick={() => setAccountOpen(value => !value)} className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent ${collapsed ? "justify-center" : ""}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">{initials}</span>{!collapsed && <><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{user?.name}</span><span className="block truncate text-[10px] capitalize text-muted">{user?.role}</span></span><ChevronDown size={12} className="text-muted" /></>}</button>
        {accountOpen && <div id="sidebar-account-menu" className="fixed bottom-3 z-[60] w-44 rounded-xl border border-border bg-card p-2 shadow-xl" style={{left: width + 8}}>{!admin && <Link href="/profile" onClick={() => setAccountOpen(false)} className="block rounded-lg px-3 py-2 text-xs hover:bg-surface">My profile</Link>}<button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-surface"><LogOut size={14} />Sign out</button></div>}
      </div>
    </aside>
    <MobileNavigation open={open} onClose={close} title={brand} groups={groups} path={path} admin={admin} initials={initials} name={user?.name} role={user?.role} signOut={signOut} />
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-card lg:hidden">{mobileItems.map(item => <Link key={item.href} href={item.href} onClick={close} aria-current={activeModule(path,item.href) ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 ${activeModule(path,item.href) ? "text-accent" : "text-muted"}`}><item.icon size={19} /><span className="max-w-full truncate text-[10px] font-medium">{item.name}</span></Link>)}<button aria-label="Open navigation" aria-expanded={open} aria-controls="mobile-sidebar-nav" onClick={() => setMoreOpen(true)} className="flex flex-1 flex-col items-center justify-center gap-1 text-muted"><Menu size={20} /><span className="text-[10px]">More</span></button></nav>
  </>;
}

function NavigationGroups({groups, path, collapsed = false, expandSidebar, onNavigate, admin}: {groups: NavGroup[]; path: string; collapsed?: boolean; expandSidebar?: () => void; onNavigate?: () => void; admin: boolean}) {
  const { t } = useAppConfig();
  const [expansion, setExpansion] = useState<{path: string; href: string | null}>({path: "", href: null});
  const active = groups.flatMap(group => group.items).find(item => item.module && activeModule(path,item.href));
  const opened = expansion.path === path ? expansion.href : active?.href;
  return <>{groups.map((group, index) => <section key={group.label || "root"} aria-label={group.label || (admin ? "Administration" : "Dashboard")} className={index ? "mt-3 border-t border-border/60 pt-3" : ""}>{group.label && !collapsed && <h2 className="mb-1.5 px-2.5 text-[9px] font-semibold uppercase tracking-wider text-muted">{group.label}</h2>}<div className="space-y-0.5">{group.items.map(item => {
    const selected = activeModule(path,item.href), links = item.module ? MODULE_NAV[item.module] : [];
    const isOpen = opened === item.href && !collapsed;
    const id = `${onNavigate ? "mobile" : "desktop"}-submenu-${item.module || item.href.replaceAll("/", "")}`;
    const solid = selected && !(isOpen && links.some(link => isModuleLinkActive(path, link)));
    const rowClass = `pesaa-nav-row relative flex h-9 w-full items-center gap-2.5 px-3 text-left text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${collapsed ? "justify-center" : ""}`;
    const contents = <><item.icon size={17} strokeWidth={selected ? 2 : 1.7} className="shrink-0" aria-hidden />{!collapsed && <span className="min-w-0 flex-1 truncate">{item.name}</span>}{!!links.length && !collapsed && <ChevronDown size={12} aria-hidden className={`shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />}</>;
    return <div key={item.href}>{links.length ? <button type="button" aria-label={item.name} aria-expanded={isOpen} aria-controls={id} title={collapsed ? item.name : undefined} data-tour={admin ? undefined : `nav-${item.name.toLowerCase()}`} data-active={solid} className={rowClass} onClick={() => {if (collapsed) expandSidebar?.(); setExpansion({path, href: isOpen ? null : item.href});}}>{contents}</button> : <Link href={item.href} aria-current={selected ? "page" : undefined} onClick={onNavigate} title={collapsed ? item.name : undefined} data-active={solid} className={rowClass} data-tour={admin ? undefined : `nav-${item.name.toLowerCase()}`}>{contents}</Link>}
      {!!links.length && <div id={id} hidden={!isOpen} className="my-1">{links.map(link => <Link key={link.href} href={link.href} onClick={onNavigate} aria-current={isModuleLinkActive(path,link) ? "page" : undefined} data-active={isModuleLinkActive(path,link)} className="pesaa-nav-row block w-full py-2 pl-9 pr-3 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-accent">{link.label ?? t(link.nameKey)}</Link>)}</div>}
    </div>;
  })}</div></section>)}</>;
}

function MobileNavigation({open, onClose, title, groups, path, admin, initials, name, role, signOut}: {open: boolean; onClose: () => void; title: string; groups: NavGroup[]; path: string; admin: boolean; initials: string; name?: string; role?: string; signOut: () => void}) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    let dialog: HTMLElement | null = null;
    const frame = requestAnimationFrame(() => {dialog = nav.current?.closest<HTMLElement>('[role="dialog"]') || null; dialog?.setAttribute("aria-label", "Navigation"); dialog?.querySelector<HTMLElement>("button, a[href]")?.focus();});
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!dialog.contains(document.activeElement)) {event.preventDefault(); first?.focus();}
      else if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    };
    document.addEventListener("keydown", trap);
    return () => {cancelAnimationFrame(frame); document.removeEventListener("keydown", trap); if(previous?.isConnected) previous.focus();};
  }, [open]);
  return <Drawer open={open} onClose={onClose} side="left" size="sm" title={title} description="Navigation" footer={<div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">{initials}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{name}</span><span className="text-[10px] capitalize text-muted">{role}</span></span><button onClick={signOut} aria-label="Sign out" className="rounded-md p-2 text-muted hover:bg-surface"><LogOut size={16} /></button></div>}><nav ref={nav} id="mobile-sidebar-nav" aria-label="Mobile navigation" className="py-3"><NavigationGroups groups={groups} path={path} onNavigate={onClose} admin={admin} /></nav></Drawer>;
}
