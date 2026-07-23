"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, Package, DollarSign, Users, FolderKanban,
  Contact, BarChart3, Settings, Shield, X, Building2, Store
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  permission?: string;
  module?: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { name: "Sales", href: "/sales", icon: TrendingUp, module: "Sales" },
  { name: "Stock", href: "/stock", icon: Package, module: "Stock" },
  { name: "Finance", href: "/finance", icon: DollarSign, module: "Finance" },
  { name: "HR", href: "/hr", icon: Users, module: "HR" },
  { name: "Projects", href: "/projects", icon: FolderKanban, module: "Projects" },
  { name: "CRM", href: "/crm", icon: Contact, module: "CRM" },
  { name: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view" },
];

const adminNavigation: NavItem[] = [
  { name: "Companies", href: "/settings/companies", icon: Building2, adminOnly: true },
  { name: "Shops", href: "/settings/shops", icon: Store, adminOnly: true },
  { name: "Users", href: "/settings/users", icon: Users, permission: "settings.users.manage" },
  { name: "Roles", href: "/settings/roles", icon: Shield, permission: "settings.roles.manage" },
  { name: "Settings", href: "/settings", icon: Settings, permission: "settings.view" },
];

interface SidebarProps {
  expanded: boolean;
  onExpandChange: (v: boolean) => void;
}

export function Sidebar({ expanded, onExpandChange }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasPermission, hasModuleAccess, isSuperAdmin, isAdmin } = useAuth();
  const [hovered, setHovered] = useState(false);

  const isOpen = expanded || hovered;

  const visibleNav = useMemo(() => {
    if (!user) return [];
    return navigation.filter((item) => {
      if (isSuperAdmin()) return true;
      if (item.permission) return hasPermission(item.permission);
      if (item.module) return hasModuleAccess(item.module);
      return true;
    });
  }, [user, isSuperAdmin, hasPermission, hasModuleAccess]);

  const visibleAdminNav = useMemo(() => {
    if (!user) return [];
    return adminNavigation.filter((item) => {
      if (isSuperAdmin()) return true;
      if (item.superAdminOnly) return false;
      if (item.adminOnly) return isAdmin();
      if (item.permission) return hasPermission(item.permission);
      return true;
    });
  }, [user, isSuperAdmin, isAdmin, hasPermission]);

  const renderItems = (items: NavItem[]) =>
    items.map((item) => {
      const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
      return (
        <Link
          key={item.name}
          href={item.href}
          className={`flex items-center gap-3 px-3 py-2 text-[13px] font-medium transition-all duration-150 rounded-lg ${
            isActive
              ? "bg-primary/10 text-primary"
              : "text-foreground/60 hover:bg-surface hover:text-foreground"
          }`}
          title={!isOpen ? item.name : undefined}
        >
          <item.icon size={18} className="flex-shrink-0" />
          <span
            className="whitespace-nowrap overflow-hidden transition-all duration-200"
            style={{ opacity: isOpen ? 1 : 0, width: isOpen ? "auto" : 0 }}
          >
            {item.name}
          </span>
        </Link>
      );
    });

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => onExpandChange(false)}
        />
      )}

      <aside
        className="fixed top-14 left-0 h-[calc(100vh-56px)] bg-white border-r border-border z-40 transition-all duration-200 ease-in-out overflow-y-auto"
        style={{ width: isOpen ? 220 : 56 }}
        onMouseEnter={() => !expanded && setHovered(true)}
        onMouseLeave={() => !expanded && setHovered(false)}
      >
        {expanded && (
          <button
            onClick={() => onExpandChange(false)}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-muted hover:text-foreground lg:hidden"
          >
            <X size={14} />
          </button>
        )}

        <nav className="p-2 space-y-0.5">
          {renderItems(visibleNav)}

          {visibleAdminNav.length > 0 && (
            <>
              <div className="my-2 border-t border-border" />
              <p
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted"
                style={{ opacity: isOpen ? 1 : 0 }}
              >
                {isSuperAdmin() ? "Platform" : "Management"}
              </p>
              {renderItems(visibleAdminNav)}
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
