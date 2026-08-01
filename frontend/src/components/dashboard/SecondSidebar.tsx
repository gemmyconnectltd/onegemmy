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
    { nameKey: "overview",  href: "/sales",           icon: ShoppingCart, color: "#0284c7", exact: true },
    { nameKey: "orders",    href: "/sales/orders",    icon: FileText,     color: "#0284c7" },
    { nameKey: "targets",   href: "/sales/targets",   icon: Target,       color: "#0284c7" },
    { nameKey: "returns",   href: "/sales/returns",   icon: RotateCcw,    color: "#0284c7" },
    { nameKey: "analytics", href: "/sales/analytics", icon: TrendingUp,   color: "#0284c7" },
  ],
  finance: [
    { nameKey: "overview",  href: "/finance",          icon: LayoutDashboard, color: "#b45309", exact: true },
    { nameKey: "invoices",  href: "/finance/invoices", icon: FileText,        color: "#b45309" },
    { nameKey: "income",    href: "/finance/income",   icon: TrendingUp,      color: "#b45309" },
    { nameKey: "expenses",  href: "/finance/expenses", icon: TrendingDown,    color: "#b45309" },
    { nameKey: "accounts",  href: "/finance/accounts", icon: CreditCard,      color: "#b45309" },
    { nameKey: "reports",   href: "/finance/reports",  icon: BarChart2,       color: "#b45309" },
  ],
  hr: [
    { nameKey: "employees",  href: "/hr",             icon: Users,      color: "#7c3aed", exact: true },
    { nameKey: "recruiting", href: "/hr/recruiting",  icon: UserPlus,   color: "#7c3aed" },
    { nameKey: "attendance", href: "/hr/attendance",  icon: Clock,      color: "#7c3aed" },
    { nameKey: "payroll",    href: "/hr/payroll",     icon: DollarSign, color: "#7c3aed" },
    { nameKey: "leave",      href: "/hr/leave",       icon: Award,      color: "#7c3aed" },
  ],
  crm: [
    { nameKey: "overview",   href: "/crm",            icon: LayoutDashboard, color: "#1d4ed8", exact: true },
    { nameKey: "contacts",   href: "/crm/contacts",   icon: UserCheck,       color: "#1d4ed8" },
    { nameKey: "campaigns",  href: "/crm/campaigns",  icon: Megaphone,       color: "#1d4ed8" },
    { nameKey: "emails",     href: "/crm/emails",     icon: Mail,            color: "#1d4ed8" },
    { nameKey: "analytics",  href: "/crm/analytics",  icon: BarChart2,       color: "#1d4ed8" },
  ],
  procurement: [
    { nameKey: "overview",  href: "/procurement",           icon: LayoutDashboard, color: "#0e7490", exact: true },
    { nameKey: "orders",    href: "/procurement/orders",    icon: ShoppingBag,     color: "#0e7490" },
    { nameKey: "suppliers", href: "/procurement/suppliers", icon: Truck,           color: "#0e7490" },
    { nameKey: "requests",  href: "/procurement/requests",  icon: ClipboardList,   color: "#0e7490" },
    { nameKey: "returns",   href: "/procurement/returns",   icon: RotateCcw,       color: "#0e7490" },
  ],
  manufacturing: [
    { nameKey: "overview",   href: "/manufacturing",             icon: LayoutDashboard, color: "#92400e", exact: true },
    { nameKey: "workOrders", href: "/manufacturing/work-orders", icon: Hammer,          color: "#92400e" },
    { nameKey: "bom",        href: "/manufacturing/bom",         icon: ClipboardList,   color: "#92400e" },
    { nameKey: "materials",  href: "/manufacturing/materials",   icon: Package,         color: "#92400e" },
    { nameKey: "analytics",  href: "/manufacturing/analytics",   icon: BarChart2,       color: "#92400e" },
  ],
  customers: [
    { nameKey: "allCustomers", href: "/customers",           icon: Users,     color: "#0f766e", exact: true },
    { nameKey: "loyalty",      href: "/customers/loyalty",   icon: Star,      color: "#0f766e" },
    { nameKey: "segments",     href: "/customers/segments",  icon: Tag,       color: "#0f766e" },
    { nameKey: "analytics",    href: "/customers/analytics", icon: BarChart2, color: "#0f766e" },
  ],
  inventory: [
    { nameKey: "overview",   href: "/inventory",            icon: LayoutDashboard, color: "#059669", exact: true },
    { nameKey: "products",   href: "/inventory/products",   icon: Package,         color: "#059669" },
    { nameKey: "variants",   href: "/inventory/variants",   icon: Layers,          color: "#059669" },
    { nameKey: "categories", href: "/inventory/categories", icon: Tag,             color: "#059669" },
    { nameKey: "brands",     href: "/inventory/brands",     icon: Star,            color: "#059669" },
    { nameKey: "units",      href: "/inventory/units",      icon: Ruler,           color: "#059669" },
    { nameKey: "suppliers",  href: "/inventory/suppliers",  icon: Truck,           color: "#059669" },
  ],
  reports: [
    { nameKey: "overview",   href: "/reports",           icon: BarChart3,  color: "#1e40af", exact: true },
    { nameKey: "sales",      href: "/reports/sales",     icon: TrendingUp, color: "#1e40af" },
    { nameKey: "inventory",  href: "/reports/inventory", icon: Package,    color: "#1e40af" },
    { nameKey: "customers",  href: "/reports/customers", icon: Users,      color: "#1e40af" },
    { nameKey: "finance",    href: "/reports/finance",   icon: DollarSign, color: "#1e40af" },
  ],
  settings: [
    { nameKey: "general",       href: "/settings",               icon: Settings, color: "#4f46e5", exact: true },
    { nameKey: "usersRoles",    href: "/settings/users",         icon: Users,    color: "#4f46e5" },
    { nameKey: "notifications", href: "/settings/notifications", icon: Bell,     color: "#4f46e5" },
    { nameKey: "security",      href: "/settings/security",      icon: Shield,   color: "#4f46e5" },
    { nameKey: "appearance",    href: "/settings/appearance",    icon: Palette,  color: "#4f46e5" },
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
          ? "flex items-center lg:flex-col lg:items-stretch w-full lg:w-44 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-surface overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100vh-56px)]"
          : "flex items-center border-b border-border bg-surface px-2 overflow-x-auto flex-shrink-0 sticky top-14 z-10"
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
