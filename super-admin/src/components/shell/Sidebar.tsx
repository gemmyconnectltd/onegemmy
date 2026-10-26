"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, PanelLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config";
import { LogoMark } from "@/components/ui/LogoMark";
import { Drawer } from "@/components/ui/Drawer";
import { NAV_GROUPS, isNavActive, type NavGroup } from "./nav";

export const SIDEBAR_W_COLLAPSED = 64;
export const SIDEBAR_W_EXPANDED = 232;
export const sidebarWidth = (collapsed: boolean) => (collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED);
const COLLAPSED_KEY = "admin_sidebar_collapsed";

// Which groups the administrator folded away; read after hydration so server and first client render match.
const FOLDED_KEY = "admin_nav_folded_groups";
const listeners = new Set<() => void>();
const readFolded = () => { try { return localStorage.getItem(FOLDED_KEY) ?? "[]"; } catch { return "[]"; } };
const subscribeFolded = (cb: () => void) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; };
function toggleFolded(id: string) {
  const next = new Set<string>(JSON.parse(readFolded()));
  if (!next.delete(id)) next.add(id);
  try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* folding is a convenience only */ }
  listeners.forEach((l) => l());
}

const QUICK = ["/", "/tenants", "/plans", "/marketing"];

function Groups({ groups, pathname, collapsed = false, onNavigate, idPrefix }: { groups: NavGroup[]; pathname: string; collapsed?: boolean; onNavigate?: () => void; idPrefix: string }) {
  const folded = new Set<string>(JSON.parse(useSyncExternalStore(subscribeFolded, readFolded, () => "[]")));
  return (
    <>
      {groups.map((group, index) => {
        const foldable = group.items.length > 1 && !collapsed;
        const hasActive = group.items.some((i) => isNavActive(pathname, i.href));
        const isFolded = foldable && folded.has(group.id);
        const items = isFolded ? group.items.filter((i) => isNavActive(pathname, i.href)) : group.items;
        const listId = `${idPrefix}-${group.id}`;
        return (
          <section key={group.id} aria-label={group.label} className={index ? (collapsed ? "mt-2 border-t border-border/60 pt-2" : "mt-1") : ""}>
            {!collapsed && (foldable
              ? <h2><button type="button" aria-expanded={!isFolded} aria-controls={listId} onClick={() => toggleFolded(group.id)} className="flex w-full items-center justify-between px-4 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">{group.label}<ChevronDown size={12} aria-hidden className={`transition-transform duration-150 ${isFolded ? "-rotate-90" : ""}`} />{isFolded && hasActive && <span className="sr-only"> (collapsed, contains the current page)</span>}</button></h2>
              : <h2 className="px-4 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{group.label}</h2>)}
            <div id={listId}>
              {items.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate} title={collapsed ? item.name : undefined} aria-current={active ? "page" : undefined} data-active={active}
                    className={`pesaa-nav-row flex h-10 w-full items-center gap-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${collapsed ? "justify-center" : "px-4"}`}>
                    <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

export function Sidebar({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (v: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isSupportOnly } = useAuth();
  // Support staff only get Customer Support; everything else in the portal is for platform admins.
  const groups = isSupportOnly() ? NAV_GROUPS.filter((g) => g.items.some((i) => i.href === "/support")) : NAV_GROUPS;
  const all = groups.flatMap((g) => g.items);
  const quick = (isSupportOnly() ? all : QUICK.map((href) => all.find((i) => i.href === href)).filter((i): i is (typeof all)[number] => !!i)).slice(0, 4);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userMenu = useRef<HTMLDivElement>(null);
  const w = sidebarWidth(collapsed);
  const initials = user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  const toggle = () => {
    const next = !collapsed;
    onCollapsedChange(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  };
  const signOut = () => { setMenuOpen(false); setUserOpen(false); logout(); router.replace("/login"); };

  useEffect(() => {
    if (!userOpen) return;
    const outside = (e: PointerEvent) => { if (!userMenu.current?.contains(e.target as Node)) setUserOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setUserOpen(false); userMenu.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [userOpen]);

  return (
    <>
      <button
        onClick={toggle}
        className="hidden lg:flex fixed z-50 top-[20px] w-5 h-5 items-center justify-center bg-card border border-border text-muted hover:text-foreground shadow-sm transition-[left,color] duration-200"
        style={{ left: w - 10 }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <PanelLeft size={11} className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
      </button>

      <aside aria-label="Sidebar" className="hidden lg:flex fixed top-0 left-0 h-dvh bg-card border-r border-border z-40 flex-col select-none transition-[width] duration-200 overflow-hidden" style={{ width: w }}>
        <Link
          href="/"
          title={siteConfig.title}
          className={"flex items-center gap-2.5 h-[60px] border-b border-border flex-shrink-0 hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" + (collapsed ? " justify-center" : " px-4")}
        >
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
            <LogoMark size={16} className="text-white" strokeWidth={2.5} />
          </div>
          {!collapsed && <span className="text-[13px] font-bold text-foreground/90 truncate">{siteConfig.name} Admin</span>}
        </Link>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-2" aria-label="Main"><Groups groups={groups} pathname={pathname} collapsed={collapsed} idPrefix="desktop-group" /></nav>

        <div ref={userMenu} className="relative flex-shrink-0 border-t border-border p-2">
          <button type="button" aria-haspopup="menu" aria-expanded={userOpen} onClick={() => setUserOpen((v) => !v)} className={"flex min-h-11 w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-surface transition-colors focus-visible:outline-2 focus-visible:outline-accent" + (collapsed ? " justify-center" : "")}>
            <div className="w-7 h-7 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-[11px] font-bold text-accent flex-shrink-0">{initials}</div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{user?.name}</p>
                  <p className="text-[10.5px] text-muted truncate leading-tight">Platform admin</p>
                </div>
                <ChevronDown size={12} className="text-muted" aria-hidden />
              </>
            )}
          </button>
          {userOpen && (
            <div role="menu" className="fixed z-[60] w-52 bg-card border border-border shadow-xl rounded-xl p-3" style={{ left: w + 8, bottom: 12 }}>
              <p className="text-[12px] font-semibold text-foreground truncate">{user?.name}</p>
              <p className="text-[10.5px] text-muted truncate mb-3">{user?.email}</p>
              <button role="menuitem" onClick={signOut} className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] text-foreground/70 hover:bg-surface rounded-lg transition-colors font-medium"><LogOut size={13} /> Sign out</button>
            </div>
          )}
        </div>
      </aside>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="left" size="sm" title={`${siteConfig.name} Admin`} description="Navigation"
        footer={<div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-[12px] font-bold text-white">{initials}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{user?.name}</p><p className="text-xs text-muted">Platform admin</p></div>
          <button onClick={signOut} className="flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-muted hover:text-foreground"><LogOut size={15} /> Sign out</button></div>}>
        <nav aria-label="Mobile navigation" className="py-2"><Groups groups={groups} pathname={pathname} onNavigate={() => setMenuOpen(false)} idPrefix="mobile-group" /></nav>
      </Drawer>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch h-16" aria-label="Quick navigation">
        {quick.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link key={item.name} href={item.href} aria-current={active ? "page" : undefined} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-colors">
              <item.icon size={20} strokeWidth={active ? 2.2 : 1.6} className={active ? "text-accent" : "text-muted"} aria-hidden />
              <span className={"max-w-full truncate px-1 text-[10px] font-semibold" + (active ? " text-accent" : " text-muted")}>{item.name}</span>
            </Link>
          );
        })}
        <button onClick={() => setMenuOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-1 text-muted" aria-label="Open navigation" aria-haspopup="dialog">
          <Menu size={20} strokeWidth={1.6} aria-hidden />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
}
