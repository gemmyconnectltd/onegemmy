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
}


export const ACCOUNTING_NAV = [
  { href: "/accounting", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/accounting/accounts", label: "Chart of Accounts", icon: BookOpen },
  { href: "/accounting/ledger", label: "General Ledger", icon: ListOrdered },
  { href: "/accounting/receivables", label: "Accounts Receivable", icon: Users },
  { href: "/accounting/payables", label: "Accounts Payable", icon: Truck },
  { href: "/accounting/cash-bank", label: "Cash & Bank", icon: Landmark },
  { href: "/accounting/assets", label: "Fixed Assets", icon: Building2 },
  { href: "/accounting/payroll", label: "Payroll", icon: Wallet },
  { href: "/accounting/tax", label: "Tax Management", icon: ReceiptText },
  { href: "/accounting/reports", label: "Financial Reports", icon: ChartNoAxesCombined },
];

export const DEBT_NAV = [
  { href: "/debts", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/debts/receivables", label: "Receivables (Customers)", icon: Users },
  { href: "/debts/payables", label: "Payables (Suppliers)", icon: Truck },
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
    { nameKey: "dailyBranches", label: "Daily branch activity", href: "/reports/daily", icon: BarChart3 },
  ],
  settings: [
    // One entry fronts the five Business Settings tabs (General, Financial, Security, Notifications, Appearance).
    { nameKey: "businessSettings", href: "/settings", icon: Settings, exact: true, activeFor: ["/settings/financial", "/settings/security", "/settings/notifications", "/settings/appearance"] },
    { nameKey: "usersRoles",    href: "/settings/users",         icon: Users },
    { nameKey: "plansBilling", href: "/settings/billing", icon: CreditCard },
  ],
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

export type PrimaryNavItem = { name: string; href: string; icon: LucideIcon; feature?: string; module?: ModuleKey; access?: string };
export type PrimaryNavGroup = { label?: string; items: PrimaryNavItem[] };
export const PRIMARY_NAV_GROUPS: PrimaryNavGroup[] = [
  { items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  { label: "Daily operations", items: [
    { name: "Sales", href: "/sales", icon: ShoppingCart, feature: "sales", module: "sales" },
    { name: "Services", href: "/services", icon: CalendarClock, feature: "services", module: "services" },
    { name: "Inventory", href: "/inventory", icon: Warehouse, feature: "inventory", module: "inventory" },
    { name: "Purchases", href: "/procurement", icon: ShoppingBag, feature: "procurement", module: "procurement" },
    { name: "Customers", href: "/customers", icon: Users, feature: "sales", module: "customers" },
  ] },
  { label: "Financial management", items: [
    { name: "Debt Management", href: "/debts", icon: ArrowLeftRight, feature: "accounting", module: "debts" },
    { name: "Expense Management", href: "/expenses", icon: Receipt, feature: "accounting", module: "expenses" },
    { name: "Accounting", href: "/accounting", icon: HandCoins, feature: "accounting", module: "accounting" },
  ] },
  { label: "Business management", items: [
    { name: "Manufacturing", href: "/manufacturing", icon: Factory, feature: "manufacturing", module: "manufacturing" },
    { name: "Branch Management", href: "/branches", icon: Building2 },
    { name: "HR", href: "/hr", icon: UserCog, feature: "hr", module: "hr" },
    { name: "Reports", href: "/reports", icon: BarChart3, module: "reports", access: "" },
  ] },
  { label: "System", items: [
    { name: "Settings", href: "/settings", icon: Settings, module: "settings", access: "" },
    { name: "Help & Support", href: "/support", icon: LifeBuoy },
  ] },
];
export const ADMIN_NAV_ITEMS: PrimaryNavItem[] = [
  {name: "Overview", href: "/admin", icon: LayoutDashboard},
  {name: "Tenants", href: "/admin/tenants", icon: Building2},
  {name: "Users", href: "/admin/users", icon: Users},
  {name: "Plans", href: "/admin/plans", icon: Crown},
  {name: "Usage", href: "/admin/usage", icon: Activity},
  {name: "Settings", href: "/admin/settings", icon: Settings},
];

export function visiblePrimaryNavigation(features: Record<string, boolean> | undefined, canAccess: (module: string) => boolean): PrimaryNavGroup[] {
  return PRIMARY_NAV_GROUPS.map(group => ({...group, items: group.items.filter(item => (!item.feature || features?.[item.feature] !== false) && (!item.module || item.access === "" || canAccess(item.access || item.module)))})).filter(group => group.items.length);
}
