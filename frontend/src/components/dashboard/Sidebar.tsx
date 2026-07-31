"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Warehouse,
  Users, BarChart3, Settings, LogOut,
  UserCog, Layers, Briefcase, HandCoins,
  Factory, ShoppingBag, ChevronRight, Menu, X,
} from "lucide-react";

const navItems = [
  { name: "Dashboard",   href: "/dashboard",     icon: LayoutDashboard, color: "#4f46e5" },
  { name: "Sales",       href: "/sales",         icon: ShoppingCart,    color: "#0284c7" },
  { name: "Inventory",   href: "/inventory",     icon: Warehouse,       color: "#059669" },
  { name: "Finance",     href: "/finance",       icon: HandCoins,       color: "#b45309" },
  { name: "Procurement", href: "/procurement",   icon: ShoppingBag,     color: "#0e7490" },
  { name: "HR",          href: "/hr",            icon: UserCog,         color: "#7c3aed" },
  { name: "Customers",   href: "/customers",     icon: Users,           color: "#0f766e" },
  { name: "CRM",         href: "/crm",           icon: Briefcase,       color: "#1d4ed8" },
  { name: "Mfg",         href: "/manufacturing", icon: Factory,         color: "#92400e" },
  { name: "Reports",     href: "/reports",       icon: BarChart3,       color: "#1e40af" },
];

// Bottom nav shows only the most important 5 items on mobile
const mobileNavItems = navItems.slice(0, 5);

interface SidebarProps {
  expanded: boolean;
  onExpandChange: (v: boolean) => void;
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

export function Sidebar({ expanded, onExpandChange }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // ── Desktop sidebar (always visible, icon-only) ──────────────────────────
  const desktopSidebar = (
    <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-[88px] bg-card border-r border-border z-50 flex-col select-none">
      {/* Logo */}
      <div className="flex items-center justify-center h-[60px] border-b border-border flex-shrink-0">
        <div className="w-11 h-11 bg-accent rounded-2xl flex items-center justify-center shadow-sm">
          <Layers size={20} className="text-white" strokeWidth={2.5} />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-clip py-3 flex flex-col items-center gap-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <div key={item.name} className="relative w-full flex justify-center">
              <Link
                href={item.href}
                onMouseEnter={() => setTooltip(item.name)}
                onMouseLeave={() => setTooltip(null)}
                aria-current={isActive ? "page" : undefined}
                className="group flex flex-col items-center justify-center gap-[6px] py-[11px] w-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={isActive ? { backgroundColor: item.color } : undefined}
              >
                <item.icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  style={{ color: isActive ? "#fff" : item.color }}
                  className="transition-transform duration-150 group-hover:scale-110"
                />
                <span
                  className="text-[12px] font-semibold leading-none tracking-wide"
                  style={{ color: isActive ? "#fff" : "#94a3b8" }}
                >
                  {item.name}
                </span>
              </Link>
              {tooltip === item.name && !isActive && <Tooltip label={item.name} />}
            </div>
          );
        })}
      </nav>

      <div className="mx-4 border-t border-border" />

      {/* Bottom */}
      <div className="py-3 flex flex-col items-center gap-0.5">
        {/* Settings */}
        <div className="relative w-full flex justify-center">
          <Link
            href="/settings"
            onMouseEnter={() => setTooltip("Settings")}
            onMouseLeave={() => setTooltip(null)}
            className="group flex flex-col items-center justify-center gap-[6px] py-[11px] w-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={pathname.startsWith("/settings") ? { backgroundColor: "#4f46e5" } : undefined}
          >
            <Settings
              size={22}
              strokeWidth={pathname.startsWith("/settings") ? 2.2 : 1.6}
              style={{ color: pathname.startsWith("/settings") ? "#fff" : "#4f46e5" }}
              className="transition-transform duration-150 group-hover:scale-110"
            />
            <span className="text-[12px] font-semibold leading-none tracking-wide" style={{ color: pathname.startsWith("/settings") ? "#fff" : "#94a3b8" }}>
              Settings
            </span>
          </Link>
          {tooltip === "Settings" && !pathname.startsWith("/settings") && <Tooltip label="Settings" />}
        </div>

        {/* User */}
        <div
          className="relative w-full flex justify-center"
          onMouseEnter={() => setTooltip("user")}
          onMouseLeave={() => setTooltip(null)}
        >
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-[5px] w-full py-[9px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="w-9 h-9 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-[12px] font-bold text-accent">
              {initials}
            </div>
            <span className="text-[11px] font-semibold leading-none text-foreground/40 tracking-wide max-w-[64px] truncate text-center">
              {user?.name?.split(" ")[0]}
            </span>
          </button>
          {tooltip === "user" && (
            <div className="absolute left-[80px] bottom-0 z-[51] pointer-events-auto">
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
              <div className="absolute left-0 bottom-4 -translate-x-1 w-1.5 h-1.5 bg-card border-l border-b border-border rotate-45" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  // ── Mobile bottom nav ────────────────────────────────────────────────────
  const mobileNav = (
    <>
      {/* Full-screen drawer for all nav items */}
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
            {[...navItems, { name: "Settings", href: "/settings", icon: Settings, color: "#4f46e5" }].map((item) => {
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

      {/* Bottom tab bar */}
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
        {/* More button */}
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

  return (
    <>
      {desktopSidebar}
      {mobileNav}
    </>
  );
}
