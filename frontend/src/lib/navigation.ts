import type React from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, ArrowLeftRight, Award, BarChart2, BarChart3, BookOpen, Building2, CalendarClock, CalendarDays, ChartNoAxesCombined, ClipboardList, Clock, CreditCard, Crown, DollarSign, Factory, FileText, Hammer, HandCoins, Landmark, Layers, LayoutDashboard, LifeBuoy, ListChecks, ListOrdered, Mail, Megaphone, Package, Receipt, ReceiptText, RotateCcw, Ruler, Settings, ShoppingBag, ShoppingCart, Sparkles, Star, Tag, Target, TrendingUp, Truck, UserCheck, UserCog, UserPlus, Users, Wallet, Warehouse } from "lucide-react";

export type ModuleKey =
  | "debts" | "expenses" | "sales" | "services" | "accounting" | "hr" | "crm" | "procurement"
  | "manufacturing" | "customers" | "inventory" | "reports" | "settings" | "repairs";


export interface NavConfigItem {
  nameKey: string;
  label?: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  /** Extra paths that also light this item up (an item that fronts several sibling pages, e.g. tabbed Settings). */
  activeFor?: string[];
  /** Heading the item sits under in the second sidebar (long lists are grouped). */
  group?: string;
  /** Permission the user needs to see this item (e.g. "users:read"). Owners always pass. */
  requires?: string;
}


export const ACCOUNTING_NAV = [
  { href: "/accounting", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/accounting/accounts", label: "Chart of Accounts", icon: BookOpen, group: "Books" },
  { href: "/accounting/ledger", label: "General Ledger", icon: ListOrdered, group: "Books" },
  { href: "/accounting/receivables", label: "Accounts Receivable", icon: Users, group: "Money in and out" },
  { href: "/accounting/payables", label: "Accounts Payable", icon: Truck, group: "Money in and out" },
  { href: "/accounting/cash-bank", label: "Cash & Bank", icon: Landmark, group: "Money in and out" },
  { href: "/accounting/assets", label: "Fixed Assets", icon: Building2, group: "Assets and payroll" },
  { href: "/accounting/payroll", label: "Payroll", icon: Wallet, group: "Assets and payroll" },
  { href: "/accounting/tax", label: "Tax Management", icon: ReceiptText, group: "Compliance and reports" },
  { href: "/accounting/reports", label: "Financial Reports", icon: ChartNoAxesCombined, group: "Compliance and reports" },
];

export const DEBT_NAV = [
  { href: "/debts", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/debts/receivables", label: "Receivables (Customers)", icon: Users },
  { href: "/debts/payables", label: "Payables (Suppliers)", icon: Truck },
  { href: "/debts/statements", label: "Statements", icon: FileText },
];

export const MODULE_NAV: Record<ModuleKey, NavConfigItem[]> = {
  expenses: [
    { nameKey: "overview", href: "/expenses", icon: LayoutDashboard, exact: true },
    { nameKey: "expenses", href: "/expenses/list", icon: FileText, activeFor: ["/expenses/new"] },
    { nameKey: "categories", href: "/expenses/categories", icon: Tag },
  ],
  sales: [
    { nameKey: "overview",  href: "/sales",           icon: LayoutDashboard, exact: true },
    { nameKey: "salesHistory", href: "/sales/orders",    icon: FileText },
    { nameKey: "returns",   href: "/sales/returns",   icon: RotateCcw },
    { nameKey: "targets",   href: "/sales/targets",   icon: Target },
    { nameKey: "analytics", href: "/sales/analytics", icon: TrendingUp },
  ],
  accounting: ACCOUNTING_NAV.map(item => ({ ...item, nameKey: item.label, label: item.label })),
  debts: DEBT_NAV.map(item => ({ ...item, nameKey: item.label, label: item.label })),
  hr: [
    { nameKey: "employees",   href: "/hr",              icon: Users, exact: true },
    { nameKey: "departments", href: "/hr/departments",  icon: Building2 },
    { nameKey: "attendance",  href: "/hr/attendance",   icon: Clock },
    { nameKey: "leave",       href: "/hr/leave",        icon: Award },
    { nameKey: "payroll",     href: "/hr/payroll",      icon: DollarSign },
    { nameKey: "recruiting",  href: "/hr/recruiting",   icon: UserPlus },
  ],
  crm: [
    { nameKey: "overview",   href: "/crm",           icon: LayoutDashboard, exact: true },
    { nameKey: "contacts",   href: "/crm/contacts",  icon: UserCheck },
    { nameKey: "campaigns",  href: "/crm/campaigns", icon: Megaphone },
    { nameKey: "emails",     href: "/crm/emails",    icon: Mail },
  ],
  customers: [
    { nameKey: "allCustomers", href: "/customers",           icon: Users, exact: true },
    { nameKey: "segments",     href: "/customers/segments",  icon: Tag },
    { nameKey: "loyalty",      href: "/customers/loyalty",   icon: Star },
    { nameKey: "analytics",    href: "/customers/analytics", icon: BarChart2 },
  ],
  procurement: [
    { nameKey: "overview",  href: "/procurement",           icon: LayoutDashboard, exact: true },
    { nameKey: "requests",  href: "/procurement/requests",  icon: ClipboardList },
    { nameKey: "purchaseHistory", href: "/procurement/orders",    icon: ShoppingBag },
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
    { nameKey: "products",   href: "/inventory/products",   icon: Package, group: "Catalog" },
    { nameKey: "categories", href: "/inventory/categories", icon: Tag, group: "Catalog" },
    { nameKey: "brands",     href: "/inventory/brands",     icon: Star, group: "Catalog" },
    { nameKey: "units",      href: "/inventory/units",      icon: Ruler, group: "Catalog" },
    { nameKey: "variants",   href: "/inventory/variants",   icon: Layers, group: "Catalog" },
    { nameKey: "serials",    href: "/inventory/serials",    icon: Star, group: "Stock" },
    { nameKey: "transfers",  href: "/inventory/transfers",  icon: Truck, group: "Stock" },
    { nameKey: "batches",    href: "/inventory/batches",    icon: Package, group: "Stock" },
  ],
  reports: [
    { nameKey: "overview",   href: "/reports",           icon: LayoutDashboard, exact: true },
    { nameKey: "sales",      href: "/reports/sales",     icon: TrendingUp },
    { nameKey: "accounting",    href: "/reports/accounting",   icon: DollarSign },
    { nameKey: "inventory",  href: "/reports/inventory", icon: Package },
    { nameKey: "customers",  href: "/reports/customers", icon: Users },
    { nameKey: "dailyBranches", label: "Daily branch activity", href: "/reports/daily", icon: BarChart3 },
  ],
  // Settings has no second sidebar: its pages are in the main sidebar's Administration group and Business Settings has its own tabs.
  settings: [],
  repairs: [
    { nameKey: "allJobs", href: "/repairs", icon: Hammer, exact: true },
  ],
  services: [
    { nameKey: "overview",         href: "/services",                  icon: LayoutDashboard, exact: true },
    { nameKey: "appointments",     href: "/services/appointments",     icon: CalendarDays },
    { nameKey: "walkIns",          href: "/services/walk-ins",         icon: ListChecks },
    { nameKey: "calendar",         href: "/services/calendar",         icon: CalendarClock },
    { nameKey: "catalog",          href: "/services/catalog",          icon: Sparkles },
    { nameKey: "staffCommissions", href: "/services/staff-commissions", icon: UserCheck },
  ],
};

export function isModuleLinkActive(path: string, item: NavConfigItem) {
  return (item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/")) || !!item.activeFor?.some(prefix => path === prefix || path.startsWith(prefix + "/"));
}

export type PrimaryNavItem = {
  name: string; href: string; icon: LucideIcon; feature?: string; module?: ModuleKey; access?: string;
  /** Permission needed to see the item (e.g. "users:read"); owners always pass. */
  permission?: string;
  /** Match only this exact path (plus `activeFor`) instead of everything beneath it. */
  exact?: boolean; activeFor?: string[];
  /** Only the business owner sees it (the Overview and Reports show business-wide performance, not one person's work). */
  ownerOnly?: boolean;
  /** Kept so the route and its tests stay valid, but not shown in any menu for now. */
  hidden?: boolean;
  /** Stable key for the product tour (`data-tour="nav-<tour>"`). Defaults to the lower-cased name. */
  tour?: string;
};
export type PrimaryNavGroup = { id?: string; label?: string; items: PrimaryNavItem[] };

/** The single source of truth for the main sidebar and the mobile menu: grouped by what people are doing, not by module. */
export const PRIMARY_NAV_GROUPS: PrimaryNavGroup[] = [
  { id: "workspace", label: "Workspace", items: [{ name: "Overview", href: "/dashboard", icon: LayoutDashboard, tour: "dashboard", ownerOnly: true }] },
  { id: "operations", label: "Operations", items: [
    { name: "Sales", href: "/sales", icon: ShoppingCart, feature: "sales", module: "sales" },
    { name: "Services", href: "/services", icon: CalendarClock, feature: "services", module: "services" },
    { name: "Inventory", href: "/inventory", icon: Warehouse, feature: "inventory", module: "inventory" },
    { name: "Purchases", href: "/procurement", icon: ShoppingBag, feature: "procurement", module: "procurement" },
    { name: "Manufacturing", href: "/manufacturing", icon: Factory, feature: "manufacturing", module: "manufacturing" },
  ] },
  { id: "relationships", label: "Relationships", items: [
    { name: "Customers", href: "/customers", icon: Users, feature: "sales", module: "customers" },
  ] },
  { id: "finance", label: "Finance", items: [
    { name: "Expenses", href: "/expenses", icon: Receipt, feature: "accounting", module: "expenses" },
    { name: "Debt Management", href: "/debts", icon: ArrowLeftRight, feature: "accounting", module: "debts" },
    { name: "Accounting", href: "/accounting", icon: HandCoins, feature: "accounting", module: "accounting" },
  ] },
  { id: "people", label: "People", items: [
    { name: "HR", href: "/hr", icon: UserCog, feature: "hr", module: "hr" },
  ] },
  { id: "insights", label: "Insights", items: [
    { name: "Reports", href: "/reports", icon: BarChart3, module: "reports", access: "", ownerOnly: true },
  ] },
  { id: "administration", label: "Administration", items: [
    { name: "Team & Access", href: "/settings/users", icon: UserPlus, permission: "users:read", tour: "team" },
    { name: "Branches", href: "/branches", icon: Building2, permission: "branches:read", tour: "branches" },
    { name: "Subscription & Billing", href: "/settings/billing", icon: CreditCard, permission: "billing:read", tour: "billing", hidden: true },
    { name: "Business Settings", href: "/settings", icon: Settings, module: "settings", access: "", exact: true, tour: "settings",
      activeFor: ["/settings/financial", "/settings/security", "/settings/notifications", "/settings/appearance", "/settings/profile"] },
    { name: "Help & Support", href: "/support", icon: LifeBuoy },
  ] },
];

/** Whether `path` belongs to a primary item. Exact items (the dashboard, Business Settings) don't swallow their siblings. */
export function isPrimaryActive(path: string, item: Pick<PrimaryNavItem, "href" | "exact" | "activeFor">): boolean {
  if (path === item.href) return true;
  if (item.activeFor?.some(prefix => path === prefix || path.startsWith(prefix + "/"))) return true;
  return item.href !== "/dashboard" && !item.exact && path.startsWith(item.href + "/");
}

/** Title, icon and one-line purpose shown at the top of a module's second sidebar. */
export const MODULE_TITLES: Record<ModuleKey, { title: string; icon: LucideIcon; blurb: string }> = {
  sales: { title: "Sales", icon: ShoppingCart, blurb: "Orders, returns and targets" },
  inventory: { title: "Inventory", icon: Warehouse, blurb: "Products and stock" },
  procurement: { title: "Purchases", icon: ShoppingBag, blurb: "Suppliers and purchase orders" },
  manufacturing: { title: "Manufacturing", icon: Factory, blurb: "Production and materials" },
  services: { title: "Services", icon: CalendarClock, blurb: "Bookings and staff" },
  customers: { title: "Customers", icon: Users, blurb: "Directory and loyalty" },
  expenses: { title: "Expenses", icon: Receipt, blurb: "Spending and categories" },
  debts: { title: "Debt Management", icon: ArrowLeftRight, blurb: "Who owes whom" },
  accounting: { title: "Accounting", icon: HandCoins, blurb: "Books, banking and tax" },
  hr: { title: "HR", icon: UserCog, blurb: "Team, attendance and payroll" },
  crm: { title: "CRM", icon: Megaphone, blurb: "Contacts and campaigns" },
  reports: { title: "Reports", icon: BarChart3, blurb: "Performance and trends" },
  settings: { title: "Settings", icon: Settings, blurb: "Business, team and billing" },
  repairs: { title: "Repairs", icon: Hammer, blurb: "Jobs in progress" },
};
export const ADMIN_NAV_ITEMS: PrimaryNavItem[] = [
  {name: "Overview", href: "/admin", icon: LayoutDashboard},
  {name: "Tenants", href: "/admin/tenants", icon: Building2},
  {name: "Users", href: "/admin/users", icon: Users},
  {name: "Plans", href: "/admin/plans", icon: Crown},
  {name: "Usage", href: "/admin/usage", icon: Activity},
  {name: "Settings", href: "/admin/settings", icon: Settings},
];

export function visiblePrimaryNavigation(
  features: Record<string, boolean> | undefined,
  canAccess: (module: string) => boolean,
  can: (permission: string) => boolean = () => true,
  isOwner = true,
): PrimaryNavGroup[] {
  const visible = (item: PrimaryNavItem) =>
    !item.hidden
    && (!item.ownerOnly || isOwner)
    && (!item.feature || features?.[item.feature] !== false)
    && (!item.module || item.access === "" || canAccess(item.access || item.module))
    && (!item.permission || can(item.permission));
  return PRIMARY_NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(visible) })).filter(group => group.items.length);
}

/** Where someone lands when their usual home page isn't theirs: the first page their role gives them. */
export function firstAllowedHref(
  features: Record<string, boolean> | undefined,
  canAccess: (module: string) => boolean,
  can: (permission: string) => boolean,
  isOwner: boolean,
): string {
  return visiblePrimaryNavigation(features, canAccess, can, isOwner).flatMap(g => g.items)[0]?.href ?? "/support";
}

/** Second-sidebar links the user may see (those with `requires` need that permission). */
export function visibleModuleLinks(module: ModuleKey, can: (permission: string) => boolean = () => true): NavConfigItem[] {
  return MODULE_NAV[module].filter(link => !link.requires || can(link.requires));
}
