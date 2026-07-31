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
  Factory, ShoppingBag, ChevronRight,
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

interface SidebarProps {
  expanded: boolean;
  onExpandChange: (v: boolean) => void;
}

/** Shared tooltip bubble, positioned relative to its trigger's wrapper. */
function Tooltip({ label, bottom = false }: { label: string; bottom?: boolean }) {
  return (
    <div
      role="tooltip"
      className={`absolute left-[80px] z-[51] pointer-events-none animate-in fade-in slide-in-from-left-1 duration-150 ${
        bottom ? "bottom-0" : "top-1/2 -translate-y-1/2"
      }`}
    >
      <div className="bg-foreground text-white text-[12px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg flex items-center gap-1.5">
        {label}
        <ChevronRight size={10} className="text-white/40" />
      </div>
      <div
        className={`absolute left-0 -translate-x-1 w-1.5 h-1.5 bg-foreground rotate-45 ${
          bottom ? "bottom-4" : "top-1/2 -translate-y-1/2"
        }`}
      />
    </div>
  );
}

/** Small solid bar marking the active item, so active state reads clearly even at a glance. */
function ActiveIndicator({ color }: { color: string }) {
  return <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full" style={{ backgroundColor: color }} />;
}

export function Sidebar({ expanded, onExpandChange }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [tooltip, setTooltip] = useState<string | null>(null);

  const handleNavClick = useCallback(() => {
    if (window.innerWidth < 1024) onExpandChange(false);
  }, [onExpandChange]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const initials =
    user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  const showTooltip = (name: string) => () => setTooltip(name);
  const hideTooltip = () => setTooltip(null);

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => onExpandChange(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-screen w-[88px] bg-card border-r border-border z-50 flex flex-col select-none transition-transform duration-200 ${
          expanded ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-[60px] border-b border-border flex-shrink-0">
          <div className="w-11 h-11 bg-accent rounded-2xl flex items-center justify-center shadow-sm">
            <Layers size={20} className="text-white" strokeWidth={2.5} />
          </div>
        </div>
        {/* Nav */}
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto overflow-x-clip py-3 flex flex-col items-center gap-0.5"
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <div key={item.name} className={`relative w-full flex justify-center ${isActive ? "px-" : ""}`}>
                {/* {isActive && <ActiveIndicator color={item.color} />} */}
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  onMouseEnter={showTooltip(item.name)}
                  onMouseLeave={hideTooltip}
                  onFocus={showTooltip(item.name)}
                  onBlur={hideTooltip}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex flex-col items-center justify-center gap-[6px] py-[11px]  transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    isActive
                      ? "w-full"
                      : "hover:bg-surfac w-[66px]"
                  }`}
                  style={isActive ? { backgroundColor: `${item.color}` } : undefined}
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
          <div className={`relative w-full flex justify-center ${pathname.startsWith("/settings") ? "px-2" : ""}`}>
            {pathname.startsWith("/settings") && <ActiveIndicator color="#4f46e5" />}
            <Link
              href="/settings"
              onMouseEnter={showTooltip("Settings")}
              onMouseLeave={hideTooltip}
              onFocus={showTooltip("Settings")}
              onBlur={hideTooltip}
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
              className={`group flex flex-col items-center justify-center gap-[6px] py-[11px] rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                pathname.startsWith("/settings")
                  ? "w-full"
                  : "hover:bg-surface w-[66px]"
              }`}
              style={pathname.startsWith("/settings") ? { backgroundColor: "#4f46e5" } : undefined}
            >
              <Settings
                size={22}
                strokeWidth={pathname.startsWith("/settings") ? 2.2 : 1.6}
                style={{ color: pathname.startsWith("/settings") ? "#fff" : "#4f46e5" }}
                className="transition-transform duration-150 group-hover:scale-110"
              />
              <span className="text-[12px] font-semibold leading-none tracking-wide" style={{ color: pathname.startsWith("/settings") ? "#fff" : "#94a3b8" }}>Settings</span>
            </Link>
            {tooltip === "Settings" && !pathname.startsWith("/settings") && (
              <Tooltip label="Settings" />
            )}
          </div>
          {/* User avatar */}
          <div
            className="relative w-full flex justify-center"
            onMouseEnter={showTooltip("user")}
            onMouseLeave={hideTooltip}
          >
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-[5px] w-[52px] py-[9px] rounded-2xl cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              aria-haspopup="true"
              aria-expanded={tooltip === "user"}
            >
              <div className="w-9 h-9 rounded-full bg-accent border-2 border-accent/20 flex items-center justify-center text-[12px] font-bold text-accent">
                {initials}
              </div>
              <span className="text-[11px] font-semibold leading-none text-foreground/40 tracking-wide max-w-[64px] truncate text-center">
                {user?.name?.split(" ")[0]}
              </span>
            </button>
            {/* User card */}
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
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] text-foreground/60 hover:bg-surface rounded-lg transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
                  >
                    <LogOut size={13} />
                    Sign out
                  </button>
                </div>
                <div className="absolute left-0 bottom-4 -translate-x-1 w-1.5 h-1.5 bg-card border-l border-b border-border rotate-45" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}