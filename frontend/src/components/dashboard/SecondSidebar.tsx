"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, FileText, Target, RotateCcw, TrendingUp,
  TrendingDown, CreditCard, Users, UserPlus, Clock, DollarSign, Award,
  UserCheck, Megaphone, Mail, BarChart2, ShoppingBag, Truck, ClipboardList,
  Hammer, Package, Layers, Tag, Ruler, Star, BarChart3, Settings, Bell,
  Shield, Palette, PanelTop, PanelLeft,
} from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

type ModuleKey =
  | "sales" | "finance" | "hr" | "crm" | "procurement"
  | "manufacturing" | "customers" | "inventory" | "reports" | "settings";

type Orientation = "top" | "left";

const navConfigs: Record<ModuleKey, { nameKey: string; href: string; icon: React.ElementType; color: string; exact?: boolean }[]> = {
  sales: [
    { nameKey: "overview",  href: "/sales",           icon: ShoppingCart, color: "#4f46e5", exact: true },
    { nameKey: "orders",    href: "/sales/orders",    icon: FileText,     color: "#0284c7" },
    { nameKey: "targets",   href: "/sales/targets",   icon: Target,       color: "#b45309" },
    { nameKey: "returns",   href: "/sales/returns",   icon: RotateCcw,    color: "#0e7490" },
    { nameKey: "analytics", href: "/sales/analytics", icon: TrendingUp,   color: "#059669" },
  ],
  finance: [
    { nameKey: "overview",  href: "/finance",          icon: LayoutDashboard, color: "#4f46e5", exact: true },
    { nameKey: "invoices",  href: "/finance/invoices", icon: FileText,        color: "#6f1a07" },
    { nameKey: "income",    href: "/finance/income",   icon: TrendingUp,      color: "#059669" },
    { nameKey: "expenses",  href: "/finance/expenses", icon: TrendingDown,    color: "#b45309" },
    { nameKey: "accounts",  href: "/finance/accounts", icon: CreditCard,      color: "#0284c7" },
    { nameKey: "reports",   href: "/finance/reports",  icon: BarChart2,       color: "#0e7490" },
  ],
  hr: [
    { nameKey: "employees",  href: "/hr",             icon: Users,      color: "#4f46e5", exact: true },
    { nameKey: "recruiting", href: "/hr/recruiting",  icon: UserPlus,   color: "#059669" },
    { nameKey: "attendance", href: "/hr/attendance",  icon: Clock,      color: "#0284c7" },
    { nameKey: "payroll",    href: "/hr/payroll",     icon: DollarSign, color: "#b45309" },
    { nameKey: "leave",      href: "/hr/leave",       icon: Award,      color: "#7c3aed" },
  ],
  crm: [
    { nameKey: "overview",   href: "/crm",            icon: LayoutDashboard, color: "#4f46e5", exact: true },
    { nameKey: "contacts",   href: "/crm/contacts",   icon: UserCheck,       color: "#059669" },
    { nameKey: "campaigns",  href: "/crm/campaigns",  icon: Megaphone,       color: "#b45309" },
    { nameKey: "emails",     href: "/crm/emails",     icon: Mail,            color: "#0284c7" },
    { nameKey: "analytics",  href: "/crm/analytics",  icon: BarChart2,       color: "#0f766e" },
  ],
  procurement: [
    { nameKey: "overview",  href: "/procurement",           icon: LayoutDashboard, color: "#4f46e5", exact: true },
    { nameKey: "orders",    href: "/procurement/orders",    icon: ShoppingBag,     color: "#0284c7" },
    { nameKey: "suppliers", href: "/procurement/suppliers", icon: Truck,           color: "#059669" },
    { nameKey: "requests",  href: "/procurement/requests",  icon: ClipboardList,   color: "#b45309" },
    { nameKey: "returns",   href: "/procurement/returns",   icon: RotateCcw,       color: "#0e7490" },
  ],
  manufacturing: [
    { nameKey: "overview",   href: "/manufacturing",             icon: LayoutDashboard, color: "#4f46e5", exact: true },
    { nameKey: "workOrders", href: "/manufacturing/work-orders", icon: Hammer,          color: "#b45309" },
    { nameKey: "bom",        href: "/manufacturing/bom",         icon: ClipboardList,   color: "#0284c7" },
    { nameKey: "materials",  href: "/manufacturing/materials",   icon: Package,         color: "#059669" },
    { nameKey: "analytics",  href: "/manufacturing/analytics",   icon: BarChart2,       color: "#0f766e" },
  ],
  customers: [
    { nameKey: "allCustomers", href: "/customers",           icon: Users,     color: "#4f46e5", exact: true },
    { nameKey: "loyalty",      href: "/customers/loyalty",   icon: Star,      color: "#b45309" },
    { nameKey: "segments",     href: "/customers/segments",  icon: Tag,       color: "#0284c7" },
    { nameKey: "analytics",    href: "/customers/analytics", icon: BarChart2, color: "#059669" },
  ],
  inventory: [
    { nameKey: "overview",   href: "/inventory",            icon: LayoutDashboard, color: "#4f46e5", exact: true },
    { nameKey: "products",   href: "/inventory/products",   icon: Package,         color: "#059669" },
    { nameKey: "categories", href: "/inventory/categories", icon: Layers,          color: "#0284c7" },
    { nameKey: "brands",     href: "/inventory/brands",     icon: Tag,             color: "#b45309" },
    { nameKey: "units",      href: "/inventory/units",      icon: Ruler,           color: "#7c3aed" },
    { nameKey: "suppliers",  href: "/inventory/suppliers",  icon: Truck,           color: "#0e7490" },
  ],
  reports: [
    { nameKey: "overview",   href: "/reports",           icon: BarChart3,  color: "#4f46e5", exact: true },
    { nameKey: "sales",      href: "/reports/sales",     icon: TrendingUp, color: "#059669" },
    { nameKey: "inventory",  href: "/reports/inventory", icon: Package,    color: "#0284c7" },
    { nameKey: "customers",  href: "/reports/customers", icon: Users,      color: "#b45309" },
    { nameKey: "finance",    href: "/reports/finance",   icon: DollarSign, color: "#0f766e" },
  ],
  settings: [
    { nameKey: "general",       href: "/settings",               icon: Settings, color: "#4f46e5", exact: true },
    { nameKey: "usersRoles",    href: "/settings/users",         icon: Users,    color: "#0284c7" },
    { nameKey: "notifications", href: "/settings/notifications", icon: Bell,     color: "#b45309" },
    { nameKey: "security",      href: "/settings/security",      icon: Shield,   color: "#059669" },
    { nameKey: "appearance",    href: "/settings/appearance",    icon: Palette,  color: "#7c3aed" },
  ],
};

interface SecondSidebarProps {
  module: ModuleKey;
  /** Starting orientation if uncontrolled (default "top"). Ignored on re-render once the user has toggled, unless `orientation` is also passed to force control. */
  defaultOrientation?: Orientation;
  /** Pass this to fully control orientation from the parent (e.g. persist it, sync with other layout). */
  orientation?: Orientation;
  /** Called whenever the user toggles, whether controlled or not — use this to update layout (sidebar width, margins, etc). */
  onOrientationChange?: (orientation: Orientation) => void;
  /** Hide the toggle button and just render at the given/default orientation. */
  showToggle?: boolean;
}

export function SecondSidebar({
  module,
  defaultOrientation = "top",
  orientation: controlledOrientation,
  onOrientationChange,
  showToggle = true,
}: SecondSidebarProps) {
  const pathname = usePathname();
  const { t } = useAppConfig();
  const items = navConfigs[module];

  const [internalOrientation, setInternalOrientation] = useState<Orientation>(defaultOrientation);
  const orientation = controlledOrientation ?? internalOrientation;
  const isLeft = orientation === "left";

  const toggle = () => {
    const next: Orientation = isLeft ? "top" : "left";
    if (controlledOrientation === undefined) setInternalOrientation(next);
    onOrientationChange?.(next);
  };

  const ToggleIcon = isLeft ? PanelTop : PanelLeft;
  const toggleLabel = isLeft ? "Switch to top navigation" : "Switch to left navigation";

  return (
    <nav
      className={
        isLeft
          ? "flex items-center lg:flex-col lg:items-stretch w-full lg:w-44 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-surface overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto"
          : "flex items-center border-b border-border bg-surface px-2 overflow-x-auto flex-shrink-0"
      }
    >
      {/* Toggle + module header */}
      {showToggle && (
        <>
          {isLeft ? (
            <>
              <div className="hidden lg:flex items-center justify-between h-[46px] px-3 flex-shrink-0 border-b border-border">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground/50">{t(module)}</span>
                <button
                  type="button"
                  onClick={toggle}
                  title={toggleLabel}
                  aria-label={toggleLabel}
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface transition-colors"
                >
                  <PanelTop size={14} strokeWidth={1.8} />
                </button>
              </div>
              <div className="hidden lg:block mx-3 mb-1 border-t border-border" />
              <button
                type="button"
                onClick={toggle}
                title={toggleLabel}
                aria-label={toggleLabel}
                className="lg:hidden flex items-center justify-center w-9 h-9 m-1 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface transition-colors flex-shrink-0"
              >
                <ToggleIcon size={14} strokeWidth={1.8} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggle}
                title={toggleLabel}
                aria-label={toggleLabel}
                className="flex items-center justify-center flex-shrink-0 w-9 h-9 mr-1 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface transition-colors"
              >
                <ToggleIcon size={14} strokeWidth={1.8} />
              </button>
              <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />
            </>
          )}
        </>
      )}

      {items.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.nameKey}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isLeft
                ? `flex items-center gap-2.5 px-3 py-2 lg:mx-2 lg:px-2.5 text-sm font-semibold whitespace-nowrap lg:whitespace-normal rounded-lg transition-all flex-shrink-0 lg:flex-shrink ${
                    isActive
                      ? "text-white shadow-sm"
                      : "text-foreground/55 hover:bg-surface hover:text-foreground"
                  }`
                : `flex items-center gap-2 px-3 py-2 text-sm font-semibold whitespace-nowrap rounded-lg transition-all flex-shrink-0 ${
                    isActive
                      ? "text-white shadow-sm"
                      : "text-foreground/55 hover:bg-surface hover:text-foreground"
                  }`
            }
            style={isActive ? { backgroundColor: item.color } : undefined}
          >
            <item.icon
              size={15}
              strokeWidth={isActive ? 2.2 : 1.8}
              style={{ color: isActive ? "#fff" : item.color }}
              className="flex-shrink-0"
            />
            <span className={isActive ? "" : "text-foreground/55"}>{t(item.nameKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
