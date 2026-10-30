import type { LucideIcon } from "lucide-react";
import { BarChart3, Activity, Building2, CreditCard, Crown, Headset, Receipt, RefreshCw, TicketPercent, Wallet, Megaphone, Mail, Send, FileText, Workflow, LineChart, Newspaper, Gauge, MousePointerClick, Share2, LayoutGrid, Puzzle, Smartphone, Inbox, LayoutDashboard, Settings, Ticket, SlidersHorizontal, Users } from "lucide-react";

export interface NavItem { name: string; href: string; icon: LucideIcon }
export interface NavGroup { id: string; label: string; items: NavItem[] }

/** The main sidebar, grouped by what an administrator is doing. Only modules that exist appear here. */
export const NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: "Overview", items: [
    { name: "Overview", href: "/", icon: LayoutDashboard },
    { name: "Usage", href: "/usage", icon: Activity },
  ] },
  { id: "business", label: "Business", items: [
    { name: "Tenants", href: "/tenants", icon: Building2 },
    { name: "Features", href: "/features", icon: Puzzle },
  ] },
  { id: "revenue", label: "Revenue", items: [
    // One entry for the whole billing area; its pages are the second sidebar on every billing page.
    { name: "Plans & Billing", href: "/plans", icon: CreditCard },
  ] },
  { id: "growth", label: "Growth", items: [
    // One entry for Website Traffic and ERP Traffic; their pages are the second sidebar on every traffic page.
    { name: "Traffic", href: "/traffic", icon: MousePointerClick },
    // One entry for the whole Marketing Hub; its eight pages are the second sidebar on every marketing page.
    { name: "Marketing", href: "/marketing", icon: Megaphone },
  ] },
  { id: "operations", label: "Support", items: [
    // One entry for the whole Support area; its pages are the second sidebar on every Support page.
    { name: "Customer Support", href: "/support", icon: Headset },
  ] },
  { id: "platform", label: "Platform", items: [
    { name: "Settings", href: "/settings", icon: Settings },
  ] },
];
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The four sections of Customer Support (shown in its second sidebar). */
export const SUPPORT_NAV = [
  { name: "Inbox", href: "/support", icon: Inbox },
  { name: "Tickets", href: "/support/tickets", icon: Ticket },
  { name: "Team", href: "/support/team", icon: Users },
  { name: "Settings", href: "/support/settings", icon: SlidersHorizontal },
] as const;

/** Website Traffic and ERP Traffic, each with its detail pages (shown in the Traffic second sidebar). */
export const TRAFFIC_NAV = [
  { group: "Website", name: "Overview", href: "/traffic", icon: MousePointerClick },
  { group: "Website", name: "Sources", href: "/traffic/sources", icon: Share2 },
  { group: "Website", name: "Pages", href: "/traffic/pages", icon: FileText },
  { group: "Website", name: "Campaigns", href: "/traffic/campaigns", icon: Megaphone },
  { group: "ERP", name: "Overview", href: "/erp-traffic", icon: Gauge },
  { group: "ERP", name: "Modules", href: "/erp-traffic/modules", icon: LayoutGrid },
  { group: "ERP", name: "Businesses", href: "/erp-traffic/businesses", icon: Building2 },
  { group: "ERP", name: "Devices", href: "/erp-traffic/devices", icon: Smartphone },
  { group: "ERP", name: "Engagement", href: "/erp-traffic/engagement", icon: Activity },
] as const;

export function isTrafficActive(pathname: string, href: string): boolean {
  if (href === "/traffic" || href === "/erp-traffic") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/** The eight pages of the Marketing Hub (shown in its second sidebar). */
export const MARKETING_NAV = [
  { name: "Overview", href: "/marketing", icon: LayoutDashboard },
  { name: "Audience", href: "/marketing/audience", icon: Users },
  { name: "Campaigns", href: "/marketing/campaigns", icon: Send },
  { name: "Newsletters", href: "/marketing/newsletters", icon: Newspaper },
  { name: "Automations", href: "/marketing/automations", icon: Workflow },
  { name: "Templates", href: "/marketing/templates", icon: FileText },
  { name: "Analytics", href: "/marketing/analytics", icon: LineChart },
  { name: "Settings", href: "/marketing/settings", icon: Mail },
] as const;

export function isMarketingActive(pathname: string, href: string): boolean {
  if (href === "/marketing") return pathname === "/marketing";
  return pathname === href || pathname.startsWith(href + "/");
}

/** The pages inside Plans & Billing (shown as the tab strip). "Billing Settings" is distinct from platform Settings. */
export const BILLING_NAV = [
  { name: "Overview", href: "/billing-overview", icon: BarChart3 },
  { name: "Plans", href: "/plans", icon: Crown },
  { name: "Subscriptions", href: "/subscriptions", icon: RefreshCw },
  { name: "Payments", href: "/payments", icon: Wallet },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Discounts", href: "/coupons", icon: TicketPercent },
  { name: "Billing Settings", href: "/billing-settings", icon: SlidersHorizontal },
] as const;

const BILLING_PREFIXES = BILLING_NAV.map((i) => i.href);

/** "/" is every page's prefix, so it only matches exactly; every other item matches itself and its sub-pages. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // Users no longer has its own sidebar entry: per-business users live under Tenants, and the cross-business
  // search at /users is reached from the Tenants page, so Tenants stays highlighted there.
  if (href === "/tenants" && (pathname === "/users" || pathname.startsWith("/users/"))) return true;
  if (href === "/traffic") return pathname === "/traffic" || pathname.startsWith("/traffic/") || pathname === "/erp-traffic" || pathname.startsWith("/erp-traffic/");
  if (href === "/plans") return BILLING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return pathname === href || pathname.startsWith(href + "/");
}

export function isSupportActive(pathname: string, href: string): boolean {
  if (href === "/support") return pathname === "/support";
  return isNavActive(pathname, href);
}


const SECTION_NAVS: { prefix: string; section: string; items: readonly { name: string; href: string; group?: string }[] }[] = [
  { prefix: "/marketing", section: "Marketing", items: MARKETING_NAV },
  { prefix: "/traffic", section: "Traffic", items: TRAFFIC_NAV },
  { prefix: "/erp-traffic", section: "Traffic", items: TRAFFIC_NAV },
  { prefix: "/support", section: "Customer Support", items: SUPPORT_NAV },
  ...BILLING_NAV.map((i) => ({ prefix: i.href, section: "Plans & Billing", items: BILLING_NAV })),
];

/** Breadcrumb trail for the top bar, built from the same navigation lists the sidebars use. */
export function breadcrumbFor(pathname: string): string[] {
  if (pathname === "/") return ["Overview"];
  for (const { prefix, section, items } of SECTION_NAVS) {
    if (pathname !== prefix && !pathname.startsWith(prefix + "/")) continue;
    const match = [...items].filter((i) => pathname === i.href || pathname.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
    const trail = [section];
    if (match?.group) trail.push(match.group);
    if (match && match.name !== section) trail.push(match.name);
    if (match && pathname !== match.href) trail.push("Details");
    return trail;
  }
  const top = NAV_ITEMS.filter((i) => i.href !== "/" && (pathname === i.href || pathname.startsWith(i.href + "/")))[0];
  if (top) return pathname === top.href ? [top.name] : [top.name, "Details"];
  if (pathname.startsWith("/users")) return ["Tenants", "Users"];
  return pathname.split("/").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}
