"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, Target, RotateCcw, TrendingUp,
  TrendingDown, CreditCard, Users, UserPlus, Clock, DollarSign, Award,
  UserCheck, Megaphone, Mail, BarChart2, ShoppingBag, Truck, ClipboardList,
  Hammer, Package, Layers, Tag, Ruler, Star, Settings, Bell,
  Shield, Palette, PanelTop, PanelLeft, PanelRight,
} from "lucide-react";
import { useAppConfig } from "@/lib/appConfig";

type ModuleKey =
  | "sales" | "finance" | "hr" | "crm" | "procurement"
  | "manufacturing" | "customers" | "inventory" | "reports" | "settings";

type Orientation = "top" | "left" | "big";

export interface NavConfigItem {
  nameKey: string;
  href: string;
  icon: React.ElementType;
  color: string;
  exact?: boolean;
}

export interface SectionItem {
  key: string;
  label: string;
  icon: React.ElementType;
  count?: number;
  color?: string;
}

const navConfigs: Record<ModuleKey, NavConfigItem[]> = {
  sales: [
    { nameKey: "overview",  href: "/sales",           icon: LayoutDashboard, color: "#0284c7", exact: true },
    { nameKey: "orders",    href: "/sales/orders",    icon: FileText,        color: "#0284c7" },
    { nameKey: "returns",   href: "/sales/returns",   icon: RotateCcw,       color: "#0284c7" },
    { nameKey: "targets",   href: "/sales/targets",   icon: Target,          color: "#0284c7" },
    { nameKey: "analytics", href: "/sales/analytics", icon: TrendingUp,      color: "#0284c7" },
  ],
  finance: [
    { nameKey: "overview",  href: "/finance",          icon: LayoutDashboard, color: "#b45309", exact: true },
    { nameKey: "accounts",  href: "/finance/accounts", icon: CreditCard,      color: "#b45309" },
    { nameKey: "income",    href: "/finance/income",   icon: TrendingUp,      color: "#b45309" },
    { nameKey: "expenses",  href: "/finance/expenses", icon: TrendingDown,    color: "#b45309" },
    { nameKey: "invoices",  href: "/finance/invoices", icon: FileText,        color: "#b45309" },
    { nameKey: "reports",   href: "/finance/reports",  icon: BarChart2,       color: "#b45309" },
  ],
  hr: [
    { nameKey: "employees",  href: "/hr",             icon: Users,      color: "#7c3aed", exact: true },
    { nameKey: "attendance", href: "/hr/attendance",  icon: Clock,      color: "#7c3aed" },
    { nameKey: "leave",      href: "/hr/leave",       icon: Award,      color: "#7c3aed" },
    { nameKey: "payroll",    href: "/hr/payroll",     icon: DollarSign, color: "#7c3aed" },
    { nameKey: "recruiting", href: "/hr/recruiting",  icon: UserPlus,   color: "#7c3aed" },
  ],
  crm: [
    { nameKey: "overview",   href: "/crm",           icon: LayoutDashboard, color: "#0f766e", exact: true },
    { nameKey: "contacts",   href: "/crm/contacts",  icon: UserCheck,       color: "#0f766e" },
    { nameKey: "campaigns",  href: "/crm/campaigns", icon: Megaphone,       color: "#0f766e" },
    { nameKey: "emails",     href: "/crm/emails",    icon: Mail,            color: "#0f766e" },
  ],
  customers: [
    { nameKey: "allCustomers", href: "/customers",           icon: Users,     color: "#0f766e", exact: true },
    { nameKey: "contacts",     href: "/crm/contacts",        icon: UserCheck, color: "#0f766e" },
    { nameKey: "segments",     href: "/customers/segments",  icon: Tag,       color: "#0f766e" },
    { nameKey: "loyalty",      href: "/customers/loyalty",   icon: Star,      color: "#0f766e" },
    { nameKey: "campaigns",    href: "/crm/campaigns",       icon: Megaphone, color: "#0f766e" },
    { nameKey: "emails",       href: "/crm/emails",          icon: Mail,      color: "#0f766e" },
    { nameKey: "analytics",    href: "/customers/analytics", icon: BarChart2, color: "#0f766e" },
  ],
  procurement: [
    { nameKey: "overview",  href: "/procurement",           icon: LayoutDashboard, color: "#0e7490", exact: true },
    { nameKey: "requests",  href: "/procurement/requests",  icon: ClipboardList,   color: "#0e7490" },
    { nameKey: "orders",    href: "/procurement/orders",    icon: ShoppingBag,     color: "#0e7490" },
    { nameKey: "suppliers", href: "/procurement/suppliers", icon: Truck,           color: "#0e7490" },
    { nameKey: "returns",   href: "/procurement/returns",   icon: RotateCcw,       color: "#0e7490" },
  ],
  manufacturing: [
    { nameKey: "overview",   href: "/manufacturing",             icon: LayoutDashboard, color: "#92400e", exact: true },
    { nameKey: "workOrders", href: "/manufacturing/work-orders", icon: Hammer,          color: "#92400e" },
    { nameKey: "materials",  href: "/manufacturing/materials",   icon: Package,         color: "#92400e" },
    { nameKey: "bom",        href: "/manufacturing/bom",         icon: ClipboardList,   color: "#92400e" },
    { nameKey: "analytics",  href: "/manufacturing/analytics",   icon: BarChart2,       color: "#92400e" },
  ],
  inventory: [
    { nameKey: "overview",   href: "/inventory",            icon: LayoutDashboard, color: "#059669", exact: true },
    { nameKey: "products",   href: "/inventory/products",   icon: Package,         color: "#059669" },
    { nameKey: "categories", href: "/inventory/categories", icon: Tag,             color: "#059669" },
    { nameKey: "brands",     href: "/inventory/brands",     icon: Star,            color: "#059669" },
    { nameKey: "units",      href: "/inventory/units",      icon: Ruler,           color: "#059669" },
    { nameKey: "suppliers",  href: "/inventory/suppliers",  icon: Truck,           color: "#059669" },
    { nameKey: "variants",   href: "/inventory/variants",   icon: Layers,          color: "#059669" },
  ],
  reports: [
    { nameKey: "overview",   href: "/reports",           icon: LayoutDashboard, color: "#1e40af", exact: true },
    { nameKey: "sales",      href: "/reports/sales",     icon: TrendingUp,      color: "#1e40af" },
    { nameKey: "finance",    href: "/reports/finance",   icon: DollarSign,      color: "#1e40af" },
    { nameKey: "inventory",  href: "/reports/inventory", icon: Package,         color: "#1e40af" },
    { nameKey: "customers",  href: "/reports/customers", icon: Users,           color: "#1e40af" },
  ],
  settings: [
    { nameKey: "general",       href: "/settings",               icon: Settings, color: "#4f46e5", exact: true },
    { nameKey: "usersRoles",    href: "/settings/users",         icon: Users,    color: "#4f46e5" },
    { nameKey: "security",      href: "/settings/security",      icon: Shield,   color: "#4f46e5" },
    { nameKey: "notifications", href: "/settings/notifications", icon: Bell,     color: "#4f46e5" },
    { nameKey: "appearance",    href: "/settings/appearance",    icon: Palette,  color: "#4f46e5" },
  ],
};

interface SecondSidebarProps {
  /** Required when `sections` is not provided (link-mode). Ignored in section-mode. */
  module?: ModuleKey;
  /** Controlled "section tab" mode: renders buttons instead of links, e.g. a tenant detail page. */
  sections?: SectionItem[];
  /** Active section key (section-mode). */
  activeKey?: string;
  /** Called when a section is selected (section-mode). */
  onSelect?: (key: string) => void;
  /** Optional header label rendered in the left/big rails (e.g. tenant name). */
  label?: string;
  /** Starting orientation if uncontrolled (default "top"). Ignored on re-render once the user has toggled, unless `orientation` is also passed to force control. */
  defaultOrientation?: Orientation;
  /** Pass this to fully control orientation from the parent (e.g. persist it, sync with other layout). */
  orientation?: Orientation;
  /** Called whenever the user toggles, whether controlled or not — use this to update layout (sidebar width, margins, etc). */
  onOrientationChange?: (orientation: Orientation) => void;
  /** Hide the toggle button and just render at the given/default orientation. */
  showToggle?: boolean;
}

const ORIENTATION_CYCLE: Orientation[] = ["top", "left", "big"];

export function SecondSidebar({
  module,
  sections,
  activeKey,
  onSelect,
  label,
  defaultOrientation = "top",
  orientation: controlledOrientation,
  onOrientationChange,
  showToggle = true,
}: SecondSidebarProps) {
  const pathname = usePathname();
  const { t } = useAppConfig();
  const isSectionMode = !!sections;

  const [internalOrientation, setInternalOrientation] = useState<Orientation>(defaultOrientation);
  const orientation = controlledOrientation ?? internalOrientation;

  const toggle = () => {
    const idx = ORIENTATION_CYCLE.indexOf(orientation);
    const next = ORIENTATION_CYCLE[(idx + 1) % ORIENTATION_CYCLE.length];
    if (controlledOrientation === undefined) setInternalOrientation(next);
    onOrientationChange?.(next);
  };

  const nextOrientation = ORIENTATION_CYCLE[(ORIENTATION_CYCLE.indexOf(orientation) + 1) % ORIENTATION_CYCLE.length];
  const toggleLabel = `Switch to ${nextOrientation} navigation`;
  const ToggleIcon = orientation === "top" ? PanelLeft : orientation === "left" ? PanelTop : PanelRight;

  const showRail = orientation === "left";
  const isBig = orientation === "big";

  const navClassName = showRail
    ? `flex items-center lg:flex-col lg:items-stretch w-full lg:w-44 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-surface overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100vh-56px)]`
    : `flex items-center border-b border-border bg-surface overflow-x-auto flex-shrink-0 sticky top-14 z-10 ${isBig ? "h-12 px-2.5 gap-1.5" : "px-2"}`;

  const railHeader = showRail && (showToggle || label) && (
    <div className="hidden lg:flex items-center justify-between gap-2 h-[46px] px-3 flex-shrink-0 border-b border-border">
      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground/50 truncate">
        {label ?? (module ? t(module) : "")}
      </span>
      {showToggle && (
        <button
          type="button"
          onClick={toggle}
          title={toggleLabel}
          aria-label={toggleLabel}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface transition-colors flex-shrink-0"
        >
          <ToggleIcon size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );

  const linkClassName = (isActive: boolean) =>
    `flex items-center ${isBig ? "gap-3 px-4 py-2.5" : "gap-2.5 px-3 py-2"} ${showRail ? "lg:mx-2 lg:px-2.5 text-sm font-semibold whitespace-nowrap lg:whitespace-normal rounded-lg transition-all flex-shrink-0 lg:flex-shrink" : "text-sm font-semibold whitespace-nowrap rounded-lg transition-all flex-shrink-0"} ${
      isActive ? "text-white shadow-sm" : "text-foreground/55 hover:bg-surface hover:text-foreground"
    }`;

  const items = isSectionMode
    ? (sections ?? []).map((item) => {
        const isActive = activeKey === item.key;
        const color = item.color ?? "#0284c7";
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect?.(item.key)}
            aria-current={isActive ? "page" : undefined}
            className={linkClassName(isActive)}
            style={isActive ? { backgroundColor: color } : undefined}
          >
            <item.icon
              size={isBig ? 17 : 15}
              strokeWidth={isActive ? 2.2 : 1.8}
              style={{ color: isActive ? "#fff" : color }}
              className="flex-shrink-0"
            />
            <span className={isActive ? "" : "text-foreground/55"}>{item.label}</span>
            {typeof item.count === "number" && (
              <span className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-md ${isActive ? "bg-white/20 text-white" : "bg-surface"}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })
    : (module ? navConfigs[module] : []).map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.nameKey}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={linkClassName(isActive)}
            style={isActive ? { backgroundColor: item.color } : undefined}
          >
            <item.icon
              size={isBig ? 17 : 15}
              strokeWidth={isActive ? 2.2 : 1.8}
              style={{ color: isActive ? "#fff" : item.color }}
              className="flex-shrink-0"
            />
            <span className={isActive ? "" : "text-foreground/55"}>{t(item.nameKey)}</span>
          </Link>
        );
      });

  return (
    <nav className={navClassName}>
      {/* Big (horizontal POS-style) header: title + toggle at far right */}
      {isBig ? (
        <>
          {(label || module) && (
            <>
              <span className="hidden sm:block text-[13px] font-bold text-foreground px-2 flex-shrink-0 whitespace-nowrap">
                {label ?? t(module ?? "")}
              </span>
              <div className="hidden sm:block w-px h-5 bg-border mx-1.5 flex-shrink-0" />
            </>
          )}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
            {items}
          </div>
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {showToggle && (
              <button
                type="button"
                onClick={toggle}
                title={toggleLabel}
                aria-label={toggleLabel}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface transition-colors"
              >
                <ToggleIcon size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </>
      ) : showRail ? (
        <>
          {railHeader}
          <div className="hidden lg:block mx-3 mb-1 border-t border-border" />
          {showToggle && (
            <button
              type="button"
              onClick={toggle}
              title={toggleLabel}
              aria-label={toggleLabel}
              className="lg:hidden flex items-center justify-center w-9 h-9 m-1 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface transition-colors flex-shrink-0"
            >
              <ToggleIcon size={14} strokeWidth={1.8} />
            </button>
          )}
        </>
      ) : (
        showToggle && (
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
        )
      )}

      {!isBig && items}
    </nav>
  );
}
