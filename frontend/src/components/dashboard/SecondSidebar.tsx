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
  | "sales" | "accounting" | "hr" | "crm" | "procurement"
  | "manufacturing" | "customers" | "inventory" | "reports" | "settings" | "repairs";

type Orientation = "top" | "left" | "big";

export interface NavConfigItem {
  nameKey: string;
  href: string;
  icon: React.ElementType;
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
    { nameKey: "overview",  href: "/sales",           icon: LayoutDashboard, exact: true },
    { nameKey: "orders",    href: "/sales/orders",    icon: FileText },
    { nameKey: "returns",   href: "/sales/returns",   icon: RotateCcw },
    { nameKey: "targets",   href: "/sales/targets",   icon: Target },
    { nameKey: "analytics", href: "/sales/analytics", icon: TrendingUp },
  ],
  accounting: [
    { nameKey: "overview",  href: "/accounting",          icon: LayoutDashboard, exact: true },
    { nameKey: "accounts",  href: "/accounting/accounts", icon: CreditCard },
    { nameKey: "income",    href: "/accounting/income",   icon: TrendingUp },
    { nameKey: "expenses",  href: "/accounting/expenses", icon: TrendingDown },
    { nameKey: "invoices",  href: "/accounting/invoices", icon: FileText },
    { nameKey: "reports",   href: "/accounting/reports",  icon: BarChart2 },
  ],
  hr: [
    { nameKey: "employees",  href: "/hr",             icon: Users, exact: true },
    { nameKey: "attendance", href: "/hr/attendance",  icon: Clock },
    { nameKey: "leave",      href: "/hr/leave",       icon: Award },
    { nameKey: "payroll",    href: "/hr/payroll",     icon: DollarSign },
    { nameKey: "recruiting", href: "/hr/recruiting",  icon: UserPlus },
  ],
  crm: [
    { nameKey: "overview",   href: "/crm",           icon: LayoutDashboard, exact: true },
    { nameKey: "contacts",   href: "/crm/contacts",  icon: UserCheck },
    { nameKey: "campaigns",  href: "/crm/campaigns", icon: Megaphone },
    { nameKey: "emails",     href: "/crm/emails",    icon: Mail },
  ],
  customers: [
    { nameKey: "allCustomers", href: "/customers",           icon: Users, exact: true },
    { nameKey: "contacts",     href: "/crm/contacts",        icon: UserCheck },
    { nameKey: "segments",     href: "/customers/segments",  icon: Tag },
    { nameKey: "loyalty",      href: "/customers/loyalty",   icon: Star },
    { nameKey: "campaigns",    href: "/crm/campaigns",       icon: Megaphone },
    { nameKey: "emails",       href: "/crm/emails",          icon: Mail },
    { nameKey: "analytics",    href: "/customers/analytics", icon: BarChart2 },
  ],
  procurement: [
    { nameKey: "overview",  href: "/procurement",           icon: LayoutDashboard, exact: true },
    { nameKey: "requests",  href: "/procurement/requests",  icon: ClipboardList },
    { nameKey: "orders",    href: "/procurement/orders",    icon: ShoppingBag },
    { nameKey: "suppliers", href: "/procurement/suppliers", icon: Truck },
    { nameKey: "returns",   href: "/procurement/returns",   icon: RotateCcw },
  ],
  manufacturing: [
    { nameKey: "overview",   href: "/manufacturing",             icon: LayoutDashboard, exact: true },
    { nameKey: "workOrders", href: "/manufacturing/work-orders", icon: Hammer },
    { nameKey: "materials",  href: "/manufacturing/materials",   icon: Package },
    { nameKey: "bom",        href: "/manufacturing/bom",         icon: ClipboardList },
    { nameKey: "analytics",  href: "/manufacturing/analytics",   icon: BarChart2 },
  ],
  inventory: [
    { nameKey: "overview",   href: "/inventory",            icon: LayoutDashboard, exact: true },
    { nameKey: "products",   href: "/inventory/products",   icon: Package },
    { nameKey: "categories", href: "/inventory/categories", icon: Tag },
    { nameKey: "brands",     href: "/inventory/brands",     icon: Star },
    { nameKey: "units",      href: "/inventory/units",      icon: Ruler },
    { nameKey: "suppliers",  href: "/inventory/suppliers",  icon: Truck },
    { nameKey: "variants",   href: "/inventory/variants",   icon: Layers },
    { nameKey: "serials",    href: "/inventory/serials",    icon: Star },
    { nameKey: "transfers",  href: "/inventory/transfers",  icon: Truck },
    { nameKey: "batches",    href: "/inventory/batches",    icon: Package },
  ],
  reports: [
    { nameKey: "overview",   href: "/reports",           icon: LayoutDashboard, exact: true },
    { nameKey: "sales",      href: "/reports/sales",     icon: TrendingUp },
    { nameKey: "accounting",    href: "/reports/accounting",   icon: DollarSign },
    { nameKey: "inventory",  href: "/reports/inventory", icon: Package },
    { nameKey: "customers",  href: "/reports/customers", icon: Users },
  ],
  settings: [
    { nameKey: "general",       href: "/settings",               icon: Settings, exact: true },
    { nameKey: "usersRoles",    href: "/settings/users",         icon: Users },
    { nameKey: "security",      href: "/settings/security",      icon: Shield },
    { nameKey: "notifications", href: "/settings/notifications", icon: Bell },
    { nameKey: "appearance",    href: "/settings/appearance",    icon: Palette },
  ],
  repairs: [
    { nameKey: "allJobs", href: "/repairs", icon: Hammer, exact: true },
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
  // Top and "big" orientations read as an underline tab bar — the pattern
  // retail/ERP dashboards (Shopify admin, QuickBooks, Square) use for a
  // module's secondary nav. The rail (left) orientation stays a filled list,
  // matching the primary Sidebar's own active-item treatment.
  const isTabBar = !showRail;

  const navClassName = showRail
    ? `flex items-center lg:flex-col lg:items-stretch w-full lg:w-44 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-surface overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100vh-56px)]`
    : `flex items-center border-b border-border bg-card overflow-x-auto flex-shrink-0 sticky top-14 z-10 ${isBig ? "h-12 px-3 gap-1" : "px-3"}`;

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
          className="flex items-center justify-center w-7 h-7 text-foreground/40 hover:text-foreground hover:bg-surface transition-colors flex-shrink-0"
        >
          <ToggleIcon size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );

  const linkClassName = (isActive: boolean, hasCustomColor: boolean) => {
    if (isTabBar) {
      return `relative flex items-center gap-2 -mb-px ${isBig ? "px-3.5 py-2.5" : "px-3.5 py-3"} text-[13px] font-semibold whitespace-nowrap flex-shrink-0 border-b-2 transition-colors ${
        isActive
          ? hasCustomColor ? "border-transparent" : "text-foreground border-accent"
          : "text-muted border-transparent hover:text-foreground hover:border-border"
      }`;
    }
    return `flex items-center lg:mx-2 lg:px-2.5 gap-2.5 px-3 py-2 text-[13px] font-semibold whitespace-nowrap lg:whitespace-normal transition-colors flex-shrink-0 lg:flex-shrink ${
      isActive ? hasCustomColor ? "text-white" : "bg-accent text-white" : "text-foreground/55 hover:bg-surface hover:text-foreground"
    }`;
  };

  const items = isSectionMode
    ? (sections ?? []).map((item) => {
        const isActive = activeKey === item.key;
        const custom = item.color;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect?.(item.key)}
            aria-current={isActive ? "page" : undefined}
            className={linkClassName(isActive, !!custom)}
            style={
              isActive && custom
                ? isTabBar ? { color: custom, borderColor: custom } : { backgroundColor: custom }
                : undefined
            }
          >
            <item.icon
              size={isTabBar ? 16 : 18}
              strokeWidth={isActive ? 2.2 : 1.8}
              style={custom ? { color: isActive ? (isTabBar ? custom : "#fff") : custom } : undefined}
              className={custom ? "flex-shrink-0" : "flex-shrink-0" + (isActive ? (isTabBar ? " text-accent" : " text-white") : " text-muted")}
            />
            <span>{item.label}</span>
            {typeof item.count === "number" && (
              <span className={`ml-auto text-[11px] px-1.5 py-0.5 ${isActive && !isTabBar ? "bg-white/20 text-white" : "bg-surface text-muted"}`}>
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
            className={linkClassName(isActive, false)}
          >
            <item.icon
              size={isTabBar ? 16 : 18}
              strokeWidth={isActive ? 2.2 : 1.8}
              className={"flex-shrink-0" + (isActive ? (isTabBar ? " text-accent" : " text-white") : " text-muted")}
            />
            <span>{t(item.nameKey)}</span>
          </Link>
        );
      });

  // One toggle button, rendered the same way everywhere it appears — always
  // trailing (right side), same icon, same size. Orientation alone decides
  // which icon it shows (via `ToggleIcon`); position never moves.
  const toggleButton = showToggle && (
    <button
      type="button"
      onClick={toggle}
      title={toggleLabel}
      aria-label={toggleLabel}
      className="flex items-center justify-center w-9 h-9 flex-shrink-0 text-foreground/40 hover:text-foreground hover:bg-surface transition-colors"
    >
      <ToggleIcon size={15} strokeWidth={1.8} />
    </button>
  );

  return (
    <nav className={navClassName}>
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
          <div className="ml-auto flex items-center flex-shrink-0">{toggleButton}</div>
        </>
      ) : showRail ? (
        <>
          {railHeader}
          <div className="hidden lg:block mx-3 mb-1 border-t border-border" />
          {items}
          {/* Mobile only — railHeader (with its own toggle) is desktop-only. */}
          <div className="lg:hidden ml-auto flex items-center flex-shrink-0">{toggleButton}</div>
        </>
      ) : (
        <>
          {items}
          <div className="ml-auto flex items-center flex-shrink-0">{toggleButton}</div>
        </>
      )}
    </nav>
  );
}
