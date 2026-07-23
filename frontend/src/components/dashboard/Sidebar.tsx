"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, Package, DollarSign, Users, FolderKanban,
  Contact, BarChart3, Settings, Shield, X, Building2, Store,
  ChevronDown, Grip, Receipt, ClipboardList, UserCheck, Briefcase,
  FileText, CircleDot, Target, Phone
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface NavChild {
  name: string;
  href: string;
  icon?: React.ElementType;
  permission?: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  permission?: string;
  module?: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  children?: NavChild[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  {
    name: "Sales",
    href: "/sales",
    icon: TrendingUp,
    module: "Sales",
    children: [
      { name: "All Deals", href: "/sales", icon: Briefcase },
      { name: "Pipeline", href: "/sales#pipeline", icon: Target },
      { name: "Quotations", href: "/sales#quotations", icon: FileText },
    ],
  },
  {
    name: "Stock",
    href: "/stock",
    icon: Package,
    module: "Stock",
    children: [
      { name: "Products", href: "/stock", icon: CircleDot },
      { name: "Categories", href: "/stock#categories", icon: Grip },
      { name: "Low Stock", href: "/stock#low-stock", icon: Package },
    ],
  },
  {
    name: "Finance",
    href: "/finance",
    icon: DollarSign,
    module: "Finance",
    children: [
      { name: "Transactions", href: "/finance", icon: Receipt },
      { name: "Invoices", href: "/finance#invoices", icon: FileText },
    ],
  },
  {
    name: "HR",
    href: "/hr",
    icon: Users,
    module: "HR",
    children: [
      { name: "Employees", href: "/hr", icon: Users },
      { name: "Attendance", href: "/hr#attendance", icon: UserCheck },
      { name: "Payroll", href: "/hr#payroll", icon: DollarSign },
    ],
  },
  {
    name: "CRM",
    href: "/crm",
    icon: Contact,
    module: "CRM",
    children: [
      { name: "Contacts", href: "/crm", icon: Phone },
      { name: "Leads", href: "/crm#leads", icon: Target },
    ],
  },
  { name: "Projects", href: "/projects", icon: FolderKanban, module: "Projects" },
  { name: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view" },
];

const adminNavigation: NavItem[] = [
  { name: "Companies", href: "/settings/companies", icon: Building2, adminOnly: true },
  { name: "Shops", href: "/settings/shops", icon: Store, adminOnly: true },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    permission: "settings.view",
    children: [
      { name: "General", href: "/settings", icon: Settings },
      { name: "Users", href: "/settings/users", icon: Users, permission: "settings.users.manage" },
      { name: "Roles", href: "/settings/roles", icon: Shield, permission: "settings.roles.manage" },
      { name: "Companies", href: "/settings/companies", icon: Building2 },
      { name: "Shops", href: "/settings/shops", icon: Store },
    ],
  },
];

interface SidebarProps {
  expanded: boolean;
  onExpandChange: (v: boolean) => void;
}

export function Sidebar({ expanded, onExpandChange }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasPermission, hasModuleAccess, isSuperAdmin, isAdmin } = useAuth();
  const [hovered, setHovered] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const isOpen = expanded || hovered;

  const toggleMenu = useCallback((name: string) => {
    setOpenMenus((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const visibleNav = useMemo(() => {
    if (!user) return navigation;
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

  const isChildActive = (item: NavItem): boolean => {
    if (!item.children) return false;
    return item.children.some((child) => {
      const base = child.href.split("#")[0];
      return pathname === base || pathname.startsWith(base + "/");
    });
  };

  const renderItems = (items: NavItem[]) =>
    items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
      const childActive = isChildActive(item);
      const isMenuOpen = openMenus[item.name] ?? childActive;

      if (!hasChildren) {
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`group flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-[6px] transition-all duration-100 ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground/55 hover:bg-surface hover:text-foreground"
            }`}
            title={!isOpen ? item.name : undefined}
          >
            <item.icon
              size={18}
              strokeWidth={isActive ? 2 : 1.5}
              className="flex-shrink-0"
            />
            <span
              className="whitespace-nowrap overflow-hidden transition-all duration-150"
              style={{ opacity: isOpen ? 1 : 0, width: isOpen ? "auto" : 0 }}
            >
              {item.name}
            </span>
          </Link>
        );
      }

      return (
        <div key={item.name}>
          <button
            onClick={() => isOpen && toggleMenu(item.name)}
            className={`w-full group flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-[6px] transition-all duration-100 ${
              childActive
                ? "bg-primary/10 text-primary"
                : "text-foreground/55 hover:bg-surface hover:text-foreground"
            }`}
            title={!isOpen ? item.name : undefined}
          >
            <item.icon
              size={18}
              strokeWidth={childActive ? 2 : 1.5}
              className="flex-shrink-0"
            />
            <span
              className="whitespace-nowrap overflow-hidden transition-all duration-150 flex-1 text-left"
              style={{ opacity: isOpen ? 1 : 0, width: isOpen ? "auto" : 0 }}
            >
              {item.name}
            </span>
            {isOpen && (
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={`flex-shrink-0 transition-transform duration-150 ${
                  isMenuOpen ? "rotate-180" : ""
                }`}
              />
            )}
          </button>

          {isOpen && isMenuOpen && (
            <div className="ml-[22px] mt-0.5 mb-1 space-y-px border-l-2 border-border/60">
              {item.children!.map((child) => {
                const base = child.href.split("#")[0];
                const childIsActive =
                  pathname === base || pathname.startsWith(base + "/");
                const Icon = child.icon || CircleDot;

                return (
                  <Link
                    key={child.name}
                    href={child.href}
                    className={`flex items-center gap-2 pl-4 pr-3 py-[6px] text-[12px] font-medium rounded-r-md transition-all duration-100 ${
                      childIsActive
                        ? "bg-primary/8 text-primary border-r-2 border-primary -mr-[2px]"
                        : "text-foreground/45 hover:text-foreground/75 hover:bg-surface/60"
                    }`}
                  >
                    <Icon size={13} strokeWidth={childIsActive ? 2 : 1.5} className="flex-shrink-0 opacity-70" />
                    <span className="whitespace-nowrap">{child.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
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
        className="fixed top-14 left-0 h-[calc(100vh-56px)] bg-white border-r border-border/80 z-40 transition-all duration-200 ease-in-out overflow-y-auto overflow-x-hidden"
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

        <nav className="p-2 space-y-px">
          {renderItems(visibleNav)}

          {visibleAdminNav.length > 0 && (
            <>
              <div className="my-2 border-t border-border/60" />
              <p
                className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted/70"
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
