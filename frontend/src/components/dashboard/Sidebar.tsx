"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useMyEntitlements } from "@/lib/api/hooks";
import {
  LayoutDashboard, ShoppingCart, Warehouse,
  Users, BarChart3, Settings, LogOut,
  UserCog, Layers, Briefcase, HandCoins,
  Factory, ShoppingBag, Building2, ChevronRight, Menu, X,
  PanelLeft, PanelTop, Crown, LayoutGrid,
} from "lucide-react";

const adminNavItems = [
  { name: "Overview",  href: "/admin",          icon: LayoutDashboard, color: "#64748b" },
  { name: "Tenants",  href: "/admin/tenants",   icon: Building2,       color: "#64748b" },
  { name: "Users",    href: "/admin/users",     icon: Users,           color: "#64748b" },
  { name: "Plans",    href: "/admin/plans",     icon: Crown,           color: "#64748b" },
  { name: "Settings", href: "/admin/settings",  icon: Settings,        color: "#64748b" },
];

const navItems = [
  { name: "Dashboard",   href: "/dashboard",     icon: LayoutDashboard, color: "#4f46e5" },
  { name: "Sales",       href: "/sales",         icon: ShoppingCart,    color: "#0284c7", feature: "sales",          module: "sales" },
  { name: "Inventory",   href: "/inventory",     icon: Warehouse,       color: "#059669", feature: "inventory",      module: "inventory" },
  { name: "Finance",     href: "/finance",       icon: HandCoins,       color: "#b45309", feature: "finance",        module: "finance" },
  { name: "Procurement", href: "/procurement",   icon: ShoppingBag,     color: "#0e7490", feature: "procurement",    module: "procurement" },
  { name: "HR",          href: "/hr",            icon: UserCog,         color: "#7c3aed", feature: "hr",             module: "hr" },
  { name: "Customers",   href: "/customers",     icon: Users,           color: "#0f766e", feature: "sales",          module: "customers" },
  { name: "Mfg",         href: "/manufacturing", icon: Factory,         color: "#92400e", feature: "manufacturing",  module: "manufacturing" },
  { name: "Reports",     href: "/reports",       icon: BarChart3,       color: "#1e40af" },
];

export type SidebarLayout = "vertical" | "horizontal" | "grid";

const LAYOUT_CYCLE: SidebarLayout[] = ["vertical", "horizontal", "grid"];

interface SidebarProps {
  expanded: boolean;
  onExpandChange: (v: boolean) => void;
  layout: SidebarLayout;
  onLayoutChange: (l: SidebarLayout) => void;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  variant?: "app" | "admin";
}

function Tooltip({ label }: { label: string }) {
  return (
    <div
      role="tooltip"
      className="absolute left-[80px] top-1/2 -translate-y-1/2 z-[51] pointer-events-none animate-in fade-in slide-in-from-left-1 duration-150"
    >
      <div className="bg-foreground text-white text-[12px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg flex items-center gap-1.5">
        {label}
        <ChevronRight size={10} className="text-white/40" />
      </div>
      <div className="absolute left-0 -translate-x-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-foreground rotate-45" />
    </div>
  );
}

export function Sidebar({ expanded, onExpandChange, layout, onLayoutChange, collapsed, onCollapsedChange, variant = "app" }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, hasModuleAccess } = useAuth();
  const router = useRouter();
  const admin = variant === "admin";
  const { data: entitlements } = useMyEntitlements({ enabled: !admin });
  const enabledFeatures = entitlements?.features;
  const items = admin
    ? adminNavItems
    : navItems.filter(
        (i) =>
          (!i.feature || enabledFeatures?.[i.feature] !== false) &&
          (!i.module || hasModuleAccess(i.module)),
      );
  const mobileItems = items.slice(0, 5);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toggleCollapse = () => {
    const next = !collapsed;
    onCollapsedChange(next);
    localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
  };

  const handleNavClick = useCallback(() => {
    onExpandChange(false);
    setMobileMenuOpen(false);
  }, [onExpandChange]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const initials =
    user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  const layoutIdx = LAYOUT_CYCLE.indexOf(layout);
  const nextLayout = LAYOUT_CYCLE[(layoutIdx + 1) % LAYOUT_CYCLE.length];
  const toggleLayout = () => onLayoutChange(nextLayout);
  const NextLayoutIcon = nextLayout === "vertical" ? PanelLeft : nextLayout === "grid" ? LayoutGrid : PanelTop;

  // ── TOP nav (horizontal bar or icon-on-top tiles) ───────────────────────
  if (layout !== "vertical" && !admin) {
    const isGrid = layout === "grid";
    return (
      <>
        <header className={`hidden lg:flex fixed top-0 left-0 right-0 bg-card border-b border-border z-50 items-center px-4 gap-1 select-none ${isGrid ? "h-16" : "h-[56px]"}`}>
          {/* Logo */}
          <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center shadow-sm flex-shrink-0 mr-3">
            <Layers size={18} className="text-white" strokeWidth={2.5} />
          </div>

          {/* Nav items */}
          <nav className={`flex items-center gap-0.5 flex-1 overflow-x-auto ${isGrid ? "h-full" : ""}`}>
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={
                    isGrid
                      ? "flex flex-col items-center justify-center gap-1 px-3.5 h-[54px] rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all duration-150 flex-shrink-0"
                      : "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all duration-150 flex-shrink-0"
                  }
                  style={
                    isActive
                      ? { backgroundColor: item.color, color: "#fff" }
                      : { color: "#64748b" }
                  }
                >
                  <item.icon
                    size={isGrid ? 18 : 15}
                    strokeWidth={isActive ? 2.2 : 1.6}
                    style={{ color: isActive ? "#fff" : item.color }}
                  />
                  {isGrid ? <span>{item.name}</span> : item.name}
                </Link>
              );
            })}
          </nav>

          {/* Right side: Settings + layout toggle + user */}
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            <Link
              href="/settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
              style={
                pathname.startsWith("/settings")
                  ? { backgroundColor: "#4f46e5", color: "#fff" }
                  : { color: "#64748b" }
              }
            >
              <Settings size={15} strokeWidth={pathname.startsWith("/settings") ? 2.2 : 1.6} style={{ color: pathname.startsWith("/settings") ? "#fff" : "#4f46e5" }} />
              Settings
            </Link>

            <button
              onClick={toggleLayout}
              title={`Switch to ${nextLayout} layout`}
              className="w-8 h-8 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
            >
              <NextLayoutIcon size={16} />
            </button>

            <div
              className="relative"
              onMouseEnter={() => setTooltip("user")}
              onMouseLeave={() => setTooltip(null)}
            >
              <button className="flex items-center gap-2 pl-2 border-l border-border">
                <div className="w-7 h-7 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-[11px] font-bold text-accent">
                  {initials}
                </div>
              </button>
              {tooltip === "user" && (
                <div className="absolute right-0 top-full mt-2 z-[51] pointer-events-auto">
                  <div className="bg-card border border-border shadow-xl rounded-xl p-3 w-48">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-foreground truncate">{user?.name}</p>
                        <p className="text-[10px] text-muted truncate capitalize">{user?.role}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] text-foreground/60 hover:bg-surface rounded-lg transition-colors font-medium"
                    >
                      <LogOut size={13} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile nav (same as vertical) */}
        {mobileBottomNav({ mobileMenuOpen, setMobileMenuOpen, pathname, handleNavClick, handleLogout, initials, user, navItems: items, mobileNavItems: mobileItems, includeSettings: !admin })}
      </>
    );
  }

  // ── VERTICAL sidebar (default) ───────────────────────────────────────────
  const w = collapsed ? 64 : 200;
  return (
    <>
      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen bg-card border-r border-border z-50 flex-col select-none transition-all duration-200 overflow-hidden"
        style={{ width: w }}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between h-[60px] border-b border-border flex-shrink-0 px-3">
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-accent rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                <Layers size={16} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[14px] font-bold text-foreground truncate">OneGemmy</span>
            </div>
          )}
          <button
            onClick={toggleCollapse}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors flex-shrink-0 ${collapsed ? "mx-auto" : ""}`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft size={16} className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-clip py-2 flex flex-col gap-0.5 px-2">
          {items.map((item) => {
            const isActive = item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.name : undefined}
                className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={isActive ? { backgroundColor: item.color } : undefined}
              >
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-white/40" />
                )}
                <item.icon
                  size={18}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  style={{ color: isActive ? "#fff" : item.color }}
                  className="flex-shrink-0 transition-transform duration-150 group-hover:scale-110"
                />
                {!collapsed && (
                  <span className="text-[13px] font-semibold leading-none" style={{ color: isActive ? "#fff" : "#64748b" }}>
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 border-t border-border" />

        {/* Bottom */}
        <div className="py-3 flex flex-col items-center gap-0.5">
          {/* Settings — only for non-admin (admin has it in nav) */}
          {!admin && (
            <div className="px-2 pb-1">
              <Link
                href="/settings"
                title={collapsed ? "Settings" : undefined}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 focus-visible:outline-none"
                style={pathname.startsWith("/settings") ? { backgroundColor: "#4f46e5" } : undefined}
              >
                <Settings size={18} strokeWidth={pathname.startsWith("/settings") ? 2.2 : 1.8} style={{ color: pathname.startsWith("/settings") ? "#fff" : "#4f46e5" }} className="flex-shrink-0" />
                {!collapsed && <span className="text-[13px] font-semibold" style={{ color: pathname.startsWith("/settings") ? "#fff" : "#64748b" }}>Settings</span>}
              </Link>
            </div>
          )}

          {/* User */}
          <div className="px-2 pb-2 relative" onMouseEnter={() => setTooltip("user")} onMouseLeave={() => setTooltip(null)}>
            <button type="button" className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl hover:bg-surface transition-colors">
              <div className="w-7 h-7 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-[11px] font-bold text-accent flex-shrink-0">
                {initials}
              </div>
              {!collapsed && (
                <div className="text-left min-w-0">
                  <p className="text-[12px] font-semibold text-foreground truncate">{user?.name?.split(" ")[0]}</p>
                  <p className="text-[10px] text-muted capitalize truncate">{user?.role}</p>
                </div>
              )}
            </button>
            {tooltip === "user" && (
              <div className="fixed z-[60] pointer-events-auto" style={{ left: w + 12, bottom: 12 }}>
                <div className="bg-card border border-border shadow-xl rounded-xl p-3 w-44">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">{initials}</div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-foreground truncate">{user?.name}</p>
                      <p className="text-[10px] text-muted truncate capitalize">{user?.role}</p>
                    </div>
                  </div>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] text-foreground/60 hover:bg-surface rounded-lg transition-colors font-medium">
                    <LogOut size={13} /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {mobileBottomNav({ mobileMenuOpen, setMobileMenuOpen, pathname, handleNavClick, handleLogout, initials, user, navItems: items, mobileNavItems: mobileItems, includeSettings: !admin })}
    </>
  );
}

type NavItem = { name: string; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties; className?: string }>; color: string; feature?: string; module?: string };

// ── Shared mobile bottom nav ─────────────────────────────────────────────────
function mobileBottomNav({
  mobileMenuOpen, setMobileMenuOpen, pathname, handleNavClick,
  handleLogout, initials, user, navItems, mobileNavItems, includeSettings = true,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  pathname: string;
  handleNavClick: () => void;
  handleLogout: () => void;
  initials: string;
  user: { name?: string; role?: string } | null;
  navItems: NavItem[];
  mobileNavItems: NavItem[];
  includeSettings?: boolean;
}) {
  return (
    <>
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-card">
          <div className="flex items-center justify-between px-5 h-[60px] border-b border-border flex-shrink-0">
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
              <Layers size={17} className="text-white" strokeWidth={2.5} />
            </div>
            <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-muted hover:text-foreground">
              <X size={20} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 grid grid-cols-3 gap-2 content-start">
            {[...navItems, ...(includeSettings ? [{ name: "Settings", href: "/settings", icon: Settings, color: "#4f46e5" }] : [])].map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={handleNavClick}
                  className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl transition-colors"
                  style={isActive ? { backgroundColor: item.color } : { backgroundColor: `${item.color}10` }}
                >
                  <item.icon size={22} strokeWidth={isActive ? 2.2 : 1.6} style={{ color: isActive ? "#fff" : item.color }} />
                  <span className="text-[11px] font-semibold" style={{ color: isActive ? "#fff" : "#64748b" }}>{item.name}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-5 py-4 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-[12px] font-bold text-white">
                {initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                <p className="text-xs text-muted capitalize">{user?.role}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground font-medium">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch h-16">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleNavClick}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
            >
              <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.6} style={{ color: isActive ? item.color : "#94a3b8" }} />
              <span className="text-[10px] font-semibold" style={{ color: isActive ? item.color : "#94a3b8" }}>{item.name}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-muted"
        >
          <Menu size={20} strokeWidth={1.6} />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
}
