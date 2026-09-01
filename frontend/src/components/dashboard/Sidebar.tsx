"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/appConfig";
import { useRouter } from "next/navigation";
import { useMyEntitlements } from "@/lib/api/hooks";
import {
  LayoutDashboard, ShoppingCart, Warehouse,
  Users, BarChart3, Settings, LogOut,
  UserCog, Layers, HandCoins,
  Factory, ShoppingBag, Building2, Menu, X,
  PanelLeft, Crown,
} from "lucide-react";

const adminNavItems = [
  { name: "Overview",  href: "/admin",          icon: LayoutDashboard },
  { name: "Tenants",  href: "/admin/tenants",   icon: Building2 },
  { name: "Users",    href: "/admin/users",     icon: Users },
  { name: "Plans",    href: "/admin/plans",     icon: Crown },
  { name: "Settings", href: "/admin/settings",  icon: Settings },
];

const navItems = [
  { name: "Dashboard",   href: "/dashboard",     icon: LayoutDashboard },
  { name: "Sales",       href: "/sales",         icon: ShoppingCart,    feature: "sales",          module: "sales" },
  { name: "Inventory",   href: "/inventory",     icon: Warehouse,       feature: "inventory",      module: "inventory" },
  { name: "Accounting",     href: "/accounting",       icon: HandCoins,       feature: "accounting",        module: "accounting" },
  { name: "Procurement", href: "/procurement",   icon: ShoppingBag,     feature: "procurement",    module: "procurement" },
  { name: "HR",          href: "/hr",            icon: UserCog,         feature: "hr",             module: "hr" },
  { name: "Customers",   href: "/customers",     icon: Users,           feature: "sales",          module: "customers" },
  { name: "Mfg",         href: "/manufacturing", icon: Factory,         feature: "manufacturing",  module: "manufacturing" },
  { name: "Reports",     href: "/reports",       icon: BarChart3 },
];

interface SidebarProps {
  expanded: boolean;
  onExpandChange: (v: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  variant?: "app" | "admin";
}

export function Sidebar({ expanded, onExpandChange, collapsed, onCollapsedChange, variant = "app" }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, hasModuleAccess } = useAuth();
  const { logoUrl } = useAppConfig();
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

  // ── VERTICAL sidebar (only layout) ───────────────────────────────────────
  const w = collapsed ? 64 : 96;
  return (
    <>
      {/* Collapse toggle — floats on the sidebar's edge so it never competes
          with the logo for space, at any width. */}
      <button
        onClick={toggleCollapse}
        className="hidden lg:flex fixed z-50 top-[24px] w-6 h-6 items-center justify-center bg-card border border-border text-muted hover:text-foreground hover:border-foreground/30 shadow-sm transition-[left,color,border-color] duration-200"
        style={{ left: w - 12 }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <PanelLeft size={12} className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
      </button>

      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen bg-card border-r border-border z-40 flex-col select-none transition-all duration-200 overflow-hidden"
        style={{ width: w }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-[60px] border-b border-border flex-shrink-0">
          <div className="w-8 h-8 bg-accent flex items-center justify-center shadow-sm flex-shrink-0 overflow-hidden">
            {!admin && logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company logo" className="w-full h-full object-cover" />
            ) : (
              <Layers size={16} className="text-white" strokeWidth={2.5} />
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-clip py-2 flex flex-col gap-0.5">
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
                className={
                  "group flex flex-col items-center justify-center gap-1 py-2.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" +
                  (isActive ? " bg-accent" : "")
                }
              >
                <item.icon
                  size={18}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className={"flex-shrink-0 transition-transform duration-150 group-hover:scale-110" + (isActive ? " text-white" : " text-muted")}
                />
                {!collapsed && (
                  <span className={"text-[10.5px] font-semibold leading-tight text-center break-words" + (isActive ? " text-white" : " text-muted")}>
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mx-3 border-t border-border" />

        {/* Bottom */}
        <div className="py-3 flex flex-col items-center gap-0.5">
          {/* Settings — only for non-admin (admin has it in nav) */}
          {!admin && (
            <div className="w-full pb-1">
              <Link
                href="/settings"
                title={collapsed ? "Settings" : undefined}
                className={
                  "group flex flex-col items-center justify-center gap-1 py-2.5 transition-all duration-150 focus-visible:outline-none" +
                  (pathname.startsWith("/settings") ? " bg-accent" : "")
                }
              >
                <Settings size={18} strokeWidth={pathname.startsWith("/settings") ? 2.2 : 1.8} className={"flex-shrink-0" + (pathname.startsWith("/settings") ? " text-white" : " text-muted")} />
                {!collapsed && <span className={"text-[10.5px] font-semibold text-center" + (pathname.startsWith("/settings") ? " text-white" : " text-muted")}>Settings</span>}
              </Link>
            </div>
          )}

          {/* User */}
          <div className="w-full pb-2 relative" onMouseEnter={() => setTooltip("user")} onMouseLeave={() => setTooltip(null)}>
            <button type="button" className="flex flex-col items-center gap-1.5 py-2 w-full hover:bg-surface transition-colors">
              <div className="w-7 h-7 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-[11px] font-bold text-accent flex-shrink-0">
                {initials}
              </div>
              {!collapsed && (
                <div className="text-center min-w-0 max-w-full">
                  <p className="text-[10.5px] font-semibold text-foreground truncate">{user?.name?.split(" ")[0]}</p>
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

type NavItem = { name: string; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties; className?: string }>; feature?: string; module?: string };

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
            {[...navItems, ...(includeSettings ? [{ name: "Settings", href: "/settings", icon: Settings }] : [])].map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={handleNavClick}
                  className={
                    "flex flex-col items-center justify-center gap-2 py-4 rounded-xl transition-colors" +
                    (isActive ? " bg-accent" : " bg-surface")
                  }
                >
                  <item.icon size={22} strokeWidth={isActive ? 2.2 : 1.6} className={isActive ? "text-white" : "text-muted"} />
                  <span className={"text-[11px] font-semibold" + (isActive ? " text-white" : " text-muted")}>{item.name}</span>
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
              <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.6} className={isActive ? "text-accent" : "text-muted"} />
              <span className={"text-[10px] font-semibold" + (isActive ? " text-accent" : " text-muted")}>{item.name}</span>
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
