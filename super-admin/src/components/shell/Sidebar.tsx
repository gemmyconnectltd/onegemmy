"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, PanelLeft, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { siteConfig } from "@/lib/config";
import { LogoMark } from "@/components/ui/LogoMark";
import { NAV_ITEMS, isNavActive } from "./nav";

export const SIDEBAR_W_COLLAPSED = 64;
export const SIDEBAR_W_EXPANDED = 208;
export const sidebarWidth = (collapsed: boolean) => (collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED);
const COLLAPSED_KEY = "admin_sidebar_collapsed";

export function Sidebar({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (v: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isSupportOnly } = useAuth();
  // Support staff only get Customer Support; everything else in the portal is for platform admins.
  const navItems = isSupportOnly() ? NAV_ITEMS.filter((i) => i.href === "/support") : NAV_ITEMS;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const w = sidebarWidth(collapsed);
  const initials = user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U";
  const mobileItems = navItems.slice(0, 4);

  const toggle = () => {
    const next = !collapsed;
    onCollapsedChange(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  };
  const signOut = () => { logout(); router.replace("/login"); };

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

      <aside className="hidden lg:flex fixed top-0 left-0 h-screen bg-card border-r border-border z-40 flex-col select-none transition-all duration-200 overflow-hidden" style={{ width: w }}>
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

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 flex flex-col gap-0.5" aria-label="Main">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                title={collapsed ? item.name : undefined}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className={"pesaa-nav-row group w-full flex items-center gap-3 transition-all duration-150 focus-visible:outline-none" + (collapsed ? " flex-col justify-center gap-1 py-2.5" : " h-11 px-3") + (active ? " bg-accent" : " hover:bg-surface")}
              >
                <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} className={"flex-shrink-0" + (active ? " text-white" : " text-muted group-hover:text-foreground")} />
                {!collapsed && <span className={"text-[13px] font-semibold truncate" + (active ? " text-white" : " text-muted group-hover:text-foreground")}>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mx-3 border-t border-border" />
        <div className="py-2 relative" onMouseEnter={() => setShowUser(true)} onMouseLeave={() => setShowUser(false)}>
          <button type="button" className={"flex items-center gap-3 w-full hover:bg-surface transition-colors" + (collapsed ? " flex-col justify-center gap-1.5 py-2" : " h-11 px-3")}>
            <div className="w-7 h-7 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-[11px] font-bold text-accent flex-shrink-0">{initials}</div>
            {!collapsed && (
              <div className="min-w-0 text-left">
                <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{user?.name}</p>
                <p className="text-[10.5px] text-muted truncate leading-tight">Platform admin</p>
              </div>
            )}
          </button>
          {showUser && (
            <div className="fixed z-[60]" style={{ left: w + 8, bottom: 12 }}>
              <div className="bg-card border border-border shadow-xl rounded-xl p-3 w-48">
                <p className="text-[12px] font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-[10px] text-muted truncate mb-3">{user?.email}</p>
                <button onClick={signOut} className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] text-foreground/60 hover:bg-surface rounded-lg transition-colors font-medium">
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-card" role="dialog" aria-label="Menu">
          <div className="flex items-center justify-between px-5 h-[60px] border-b border-border flex-shrink-0">
            <Link href="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center flex-shrink-0"><LogoMark size={17} className="text-white" strokeWidth={2.5} /></div>
              <span className="text-[15px] font-bold text-foreground truncate">{siteConfig.name} Admin</span>
            </Link>
            <button onClick={() => setMenuOpen(false)} className="p-2 text-muted hover:text-foreground" aria-label="Close menu"><X size={20} /></button>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 flex flex-col gap-0.5" aria-label="Main">
            {navItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link key={item.name} href={item.href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} data-active={active} className="pesaa-nav-row flex w-full items-center gap-3 px-3 py-3 transition-colors">
                  <item.icon size={22} strokeWidth={active ? 2.2 : 1.6} className={active ? "text-white" : "text-muted"} />
                  <span className={"text-[11px] font-semibold" + (active ? " text-white" : " text-muted")}>{item.name}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-5 py-4 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-[12px] font-bold text-white">{initials}</div>
              <div><p className="text-sm font-semibold text-foreground">{user?.name}</p><p className="text-xs text-muted">Platform admin</p></div>
            </div>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground font-medium"><LogOut size={15} /> Sign out</button>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch h-16" aria-label="Quick navigation">
        {mobileItems.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link key={item.name} href={item.href} className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors">
              <item.icon size={20} strokeWidth={active ? 2.2 : 1.6} className={active ? "text-accent" : "text-muted"} />
              <span className={"text-[10px] font-semibold" + (active ? " text-accent" : " text-muted")}>{item.name}</span>
            </Link>
          );
        })}
        <button onClick={() => setMenuOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-1 text-muted" aria-label="More">
          <Menu size={20} strokeWidth={1.6} />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
}
